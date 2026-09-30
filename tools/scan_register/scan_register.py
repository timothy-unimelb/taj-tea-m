#!/usr/bin/env python3
"""
scan_register.py - register a point cloud laterally (bird's-eye view) against satellite imagery.

STEP 1  prepare: render the cloud top-down and open an interactive page over satellite imagery
    python scan_register.py prepare  my_scan.las
    python scan_register.py prepare  my_scan.las --init my_scan_transform.json   (continue a saved session)

    In the page: drag / rotate / scale the cloud until it sits on the imagery, then
    "Save transform" -> downloads <name>_transform.json

(optional) merge several scans first:
    python scan_register.py merge  merged.las  scan_a.las scan_b.las scan_c.las

STEP 2  apply: write the transformed point cloud
    python scan_register.py apply  my_scan.las  my_scan_transform.json  my_scan_registered.las

Transform (applied to X/Y only, about the cloud's centre c):
    [E', N'] = s * R(theta) * ([E, N] - c) + c + t          Z is unchanged (use --scale-z to scale Z too)

Requirements: Python 3.8+ and numpy only. Reads/writes uncompressed LAS 1.0-1.4 (not LAZ).
Coordinates must be projected in metres (UTM / MGA). The EPSG code is read from the file's GeoKeys,
or give it with --epsg (e.g. 32755 WGS84/UTM55S, 7855 GDA2020/MGA55, 28355 GDA94/MGA55).
Imagery: Esri World Imagery (needs internet in the browser). The raw LAS file is never modified.
"""
import argparse
import base64
import datetime as dt
import json
import math
import os
import pathlib
import struct
import sys
import webbrowser
import zlib

import numpy as np

RGB_OFFSET = {2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30}


# ----------------------------------------------------------------------------- LAS reading
def read_header(path):
    with open(path, "rb") as f:
        b = f.read(375)
    if b[:4] != b"LASF":
        raise SystemExit(f"{path}: not a LAS file (LAZ is not supported - decompress with laszip first)")
    ver = (b[24], b[25])
    hsize, off_pts, nvlr = struct.unpack("<HIL", b[94:104])
    pf, rec_len = struct.unpack("<BH", b[104:107])
    if pf & 0xC0:
        raise SystemExit("compressed point data (LAZ) is not supported - decompress with laszip first")
    n = struct.unpack("<L", b[107:111])[0]
    if ver >= (1, 4):
        n14 = struct.unpack("<Q", b[247:255])[0]
        n = n14 or n
    scale = struct.unpack("<3d", b[131:155])
    offset = struct.unpack("<3d", b[155:179])
    return dict(ver=ver, hsize=hsize, off_pts=off_pts, nvlr=nvlr, pf=pf & 0x3F, rec_len=rec_len, n=n,
                scale=np.array(scale), offset=np.array(offset))


def read_epsg(path, H):
    with open(path, "rb") as f:
        f.seek(H["hsize"])
        data = f.read(max(0, H["off_pts"] - H["hsize"]))
    pos = 0
    for _ in range(H["nvlr"]):
        if pos + 54 > len(data):
            break
        rid, rl = struct.unpack("<HH", data[pos + 18:pos + 22])
        body = data[pos + 54:pos + 54 + rl]
        if rid == 34735 and len(body) >= 8:
            v = struct.unpack(f"<{len(body) // 2}H", body[:len(body) // 2 * 2])
            for k in range(1, v[3] + 1):
                if 4 * k + 3 < len(v) and v[4 * k] == 3072:
                    return int(v[4 * k + 3])
        if rid == 2112:  # OGC WKT
            s = body.decode("ascii", "ignore")
            import re
            m = re.findall(r'AUTHORITY\["EPSG","(\d+)"\]', s)
            if m:
                return int(m[-1])
        pos += 54 + rl
    return None


def points_dtype(H):
    names, formats, offsets = ["X", "Y", "Z"], ["<i4", "<i4", "<i4"], [0, 4, 8]
    if H["pf"] in RGB_OFFSET:
        o = RGB_OFFSET[H["pf"]]
        names += ["R", "G", "B"]
        formats += ["<u2"] * 3
        offsets += [o, o + 2, o + 4]
    return np.dtype(dict(names=names, formats=formats, offsets=offsets, itemsize=H["rec_len"]))


def read_points(path, H):
    a = np.fromfile(path, dtype=points_dtype(H), count=H["n"], offset=H["off_pts"])
    xyz = np.c_[a["X"] * H["scale"][0] + H["offset"][0],
                a["Y"] * H["scale"][1] + H["offset"][1],
                a["Z"] * H["scale"][2] + H["offset"][2]]
    rgb = None
    if "R" in a.dtype.names:
        rgb = np.c_[a["R"], a["G"], a["B"]].astype(np.float64)
        rgb = rgb / (257.0 if rgb.max() > 255 else 1.0)
    return xyz, rgb


# ----------------------------------------------------------------------------- CRS -> UTM zone
def utm_zone_from_epsg(epsg):
    if epsg is None:
        return None
    if 32601 <= epsg <= 32660:
        return epsg - 32600, False
    if 32701 <= epsg <= 32760:
        return epsg - 32700, True
    if 28348 <= epsg <= 28358:          # GDA94 / MGA
        return epsg - 28300, True
    if 7846 <= epsg <= 7859:            # GDA2020 / MGA
        return epsg - 7800, True
    if 26901 <= epsg <= 26923:          # NAD83 / UTM north
        return epsg - 26900, False
    if 25828 <= epsg <= 25838:          # ETRS89 / UTM
        return epsg - 25800, False
    return None


# ----------------------------------------------------------------------------- top-down render
def render(xyz, rgb, res, mode):
    lo = np.floor(xyz[:, :2].min(0) / res) * res - res
    hi = xyz[:, :2].max(0) + res
    W = int((hi[0] - lo[0]) / res) + 1
    Hh = int((hi[1] - lo[1]) / res) + 1
    if W * Hh > 40_000_000:
        raise SystemExit(f"image would be {W}x{Hh} px - use a coarser --res")
    col = ((xyz[:, 0] - lo[0]) / res).astype(np.int64)
    row = (Hh - 1 - ((xyz[:, 1] - lo[1]) / res)).astype(np.int64)
    lin = row * W + col
    z = xyz[:, 2]
    # choose one point per pixel: highest (what a satellite sees) or lowest (ground)
    order = np.lexsort((z if mode == "top" else -z, lin))       # last per pixel = chosen
    ls = lin[order]
    last = np.r_[ls[1:] != ls[:-1], True]
    sel = order[last]
    img = np.zeros((Hh * W, 4), np.uint8)
    if rgb is not None:
        c = np.clip(rgb[sel], 0, 255)
    else:  # height colouring
        t = (z[sel] - np.percentile(z, 2)) / max(1e-6, np.ptp(np.percentile(z, [2, 98])))
        t = np.clip(t, 0, 1)
        c = np.c_[255 * t, 255 * (1 - abs(t - 0.5) * 2), 255 * (1 - t)]
    img[lin[sel], :3] = c.astype(np.uint8)
    img[lin[sel], 3] = 255
    img = img.reshape(Hh, W, 4)
    # fill 1-pixel holes so the overlay reads as a surface
    a = img[..., 3] > 0
    for _ in range(2):
        pad = np.pad(img, ((1, 1), (1, 1), (0, 0)))
        pa = pad[..., 3] > 0
        acc = np.zeros(img.shape[:2] + (3,), np.float64)
        cnt = np.zeros(img.shape[:2], np.float64)
        for dy in (0, 1, 2):
            for dx in (0, 1, 2):
                m = pa[dy:dy + Hh, dx:dx + W]
                acc += pad[dy:dy + Hh, dx:dx + W, :3] * m[..., None]
                cnt += m
        fill = (~a) & (cnt >= 4)
        img[fill, :3] = (acc[fill] / cnt[fill, None]).astype(np.uint8)
        img[fill, 3] = 255
        a = img[..., 3] > 0
    return img, lo[0], lo[1] + Hh * res   # left edge easting, top edge northing


def png_bytes(img):
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


# ----------------------------------------------------------------------------- prepare
def cmd_prepare(a):
    las = pathlib.Path(a.las)
    H = read_header(las)
    epsg = a.epsg or read_epsg(las, H)
    zone = utm_zone_from_epsg(epsg)
    if zone is None:
        raise SystemExit(f"Could not work out the UTM/MGA zone (EPSG={epsg}). Give it with --epsg, e.g. --epsg 32755")
    print(f"{las.name}: {H['n']:,} points, LAS {H['ver'][0]}.{H['ver'][1]}, point format {H['pf']}, EPSG {epsg} "
          f"(zone {zone[0]}{'S' if zone[1] else 'N'})")
    xyz, rgb = read_points(las, H)
    if a.max_points and len(xyz) > a.max_points:
        idx = np.random.default_rng(0).choice(len(xyz), a.max_points, replace=False)
        xyz = xyz[idx]
        rgb = rgb[idx] if rgb is not None else None
    img, E0, N0 = render(xyz, rgb, a.res, a.mode)
    print(f"rendered {img.shape[1]}x{img.shape[0]} px at {a.res} m/px ({a.mode} view)")
    centre = [float((xyz[:, 0].min() + xyz[:, 0].max()) / 2), float((xyz[:, 1].min() + xyz[:, 1].max()) / 2)]
    init = {"translation": [0.0, 0.0], "rotation_deg": 0.0, "scale": 1.0}
    if a.init:
        j = json.loads(pathlib.Path(a.init).read_text())
        init = {k: j[k] for k in init}
        if "pivot" in j and np.hypot(j["pivot"][0] - centre[0], j["pivot"][1] - centre[1]) > 1e-3:
            centre = j["pivot"]
        print(f"starting from {a.init}")
    meta = dict(name=las.stem, epsg=epsg, zone=zone[0], south=zone[1], res=a.res, E0=float(E0), N0=float(N0),
                width=int(img.shape[1]), height=int(img.shape[0]), pivot=centre, init=init,
                img="data:image/png;base64," + base64.b64encode(png_bytes(img)).decode())
    html = HTML.replace("__META__", json.dumps(meta))
    out = pathlib.Path(a.out) if a.out else las.with_name(las.stem + "_register.html")
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out}")
    if not a.no_browser:
        webbrowser.open(out.resolve().as_uri())


# ----------------------------------------------------------------------------- apply
def transform_xy(E, N, T):
    c = np.array(T["pivot"])
    t = np.array(T["translation"])
    th = math.radians(T["rotation_deg"])
    s = float(T["scale"])
    R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]]) * s
    dE, dN = E - c[0], N - c[1]
    return (R[0, 0] * dE + R[0, 1] * dN + c[0] + t[0],
            R[1, 0] * dE + R[1, 1] * dN + c[1] + t[1])


def cmd_apply(a):
    src = pathlib.Path(a.las)
    T = json.loads(pathlib.Path(a.transform).read_text())
    H = read_header(src)
    buf = bytearray(src.read_bytes())
    n, rl, off = H["n"], H["rec_len"], H["off_pts"]
    pts = np.frombuffer(buf, dtype=np.dtype(dict(names=["X", "Y", "Z"], formats=["<i4"] * 3,
                                                  offsets=[0, 4, 8], itemsize=rl)),
                        count=n, offset=off).copy()
    sc, of = H["scale"], H["offset"]
    E = pts["X"] * sc[0] + of[0]
    N = pts["Y"] * sc[1] + of[1]
    Z = pts["Z"] * sc[2] + of[2]
    E2, N2 = transform_xy(E, N, T)
    if a.scale_z:
        zc = float(np.median(Z))
        Z = (Z - zc) * float(T["scale"]) + zc
    # keep the file's scale; re-centre the offset on the new data so integers can't overflow
    new_off = of.copy()
    new_off[0] = math.floor(E2.min())
    new_off[1] = math.floor(N2.min())
    X = np.round((E2 - new_off[0]) / sc[0])
    Y = np.round((N2 - new_off[1]) / sc[1])
    Zi = np.round((Z - new_off[2]) / sc[2])
    for v in (X, Y, Zi):
        if v.min() < -2**31 or v.max() > 2**31 - 1:
            raise SystemExit("coordinates overflow the LAS integer range - check the transform")
    # write the three int32 fields back into every record (everything else untouched)
    rec = np.frombuffer(buf, dtype=np.uint8, count=n * rl, offset=off).reshape(n, rl)
    xyz_i = np.c_[X, Y, Zi].astype("<i4")
    rec[:, 0:12] = xyz_i.view(np.uint8).reshape(n, 12)
    struct.pack_into("<3d", buf, 155, *new_off)
    Zf = Zi * sc[2] + new_off[2]
    struct.pack_into("<6d", buf, 179, E2.max(), E2.min(), N2.max(), N2.min(), Zf.max(), Zf.min())
    out = pathlib.Path(a.out)
    if out.resolve() == src.resolve():
        raise SystemExit("refusing to overwrite the input file - choose a new output name")
    out.write_bytes(bytes(buf))
    c = np.array(T["pivot"])
    print(f"wrote {out}  ({n:,} points)")
    print(f"  pivot E {c[0]:.3f} N {c[1]:.3f} | move E {T['translation'][0]:+.3f} N {T['translation'][1]:+.3f} m | "
          f"rotate {T['rotation_deg']:+.3f} deg | scale {T['scale']:.5f}{' (Z too)' if a.scale_z else ' (XY only)'}")
    print(f"  centroid moved by {np.hypot((E2 - E).mean(), (N2 - N).mean()):.3f} m")


# ----------------------------------------------------------------------------- merge
def cmd_merge(a):
    """concatenate LAS files that share a point format (e.g. individually registered scans)"""
    hs=[(pathlib.Path(p),read_header(p)) for p in a.inputs]
    pf={h["pf"] for _,h in hs}; rl={h["rec_len"] for _,h in hs}
    if len(pf)>1 or len(rl)>1:
        raise SystemExit(f"inputs have different point formats {pf} / record lengths {rl}")
    first,H0=hs[0]
    raw0=first.read_bytes()
    head=bytearray(raw0[:H0["off_pts"]])
    sc=H0["scale"]; recs=[]; allmin=np.full(3,np.inf); allmax=np.full(3,-np.inf); xyzs=[]
    for p,H in hs:
        dtp=np.dtype(dict(names=["X","Y","Z"],formats=["<i4"]*3,offsets=[0,4,8],itemsize=H["rec_len"]))
        pts=np.fromfile(p,dtype=dtp,count=H["n"],offset=H["off_pts"])
        xyz=np.c_[pts["X"]*H["scale"][0]+H["offset"][0],pts["Y"]*H["scale"][1]+H["offset"][1],pts["Z"]*H["scale"][2]+H["offset"][2]]
        rec=np.fromfile(p,dtype=np.uint8,count=H["n"]*H["rec_len"],offset=H["off_pts"]).reshape(H["n"],H["rec_len"])
        xyzs.append(xyz); recs.append(rec); allmin=np.minimum(allmin,xyz.min(0)); allmax=np.maximum(allmax,xyz.max(0))
        print(f"  {p.name}: {H['n']:,} points")
    off=np.floor(allmin)
    out=[]
    for xyz,rec in zip(xyzs,recs):
        ints=np.round((xyz-off)/sc).astype("<i4"); rec=rec.copy(); rec[:,0:12]=ints.view(np.uint8).reshape(len(ints),12); out.append(rec)
    body=np.vstack(out).tobytes(); n=sum(len(r) for r in out)
    struct.pack_into("<L",head,107,n if n<2**32 else 0)
    if H0["ver"]>=(1,4):
        struct.pack_into("<Q",head,247,n)
        struct.pack_into("<QL",head,235,0,0)   # EVLRs are not carried over
    struct.pack_into("<5L",head,111,n,0,0,0,0) if H0["ver"]<(1,4) else None
    struct.pack_into("<3d",head,155,*off)
    struct.pack_into("<6d",head,179,allmax[0],allmin[0],allmax[1],allmin[1],allmax[2],allmin[2])
    pathlib.Path(a.out).write_bytes(bytes(head)+body)
    print(f"wrote {a.out} ({n:,} points)")


# ----------------------------------------------------------------------------- page
HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>Scan registration</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--g:#1A4A35;--gold:#C88F32;--bg:#FDFAF7;--ch:#323232}
*{box-sizing:border-box}body{margin:0;font:13px/1.4 Inter,Segoe UI,Arial,sans-serif;color:var(--ch);background:var(--bg);overflow:hidden}
#map{position:absolute;inset:0 330px 0 0;background:#222;cursor:grab}#map.drag{cursor:grabbing}
canvas{display:block}
#panel{position:absolute;top:0;right:0;width:330px;height:100%;overflow:auto;padding:14px 16px;background:var(--bg);border-left:1px solid #ddd}
h1{font-size:17px;margin:0 0 2px;color:var(--g)}.sub{color:#777;font-size:12px;margin-bottom:10px}
fieldset{min-width:0;border:1px solid #ddd;border-radius:8px;margin:0 0 10px;padding:8px 10px}legend{font-weight:700;color:var(--g);padding:0 4px}
.tools{display:flex;gap:4px}.tools button{flex:1}
button{font:inherit;padding:6px 8px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
button.on{background:var(--g);color:#fff;border-color:var(--g)}button.primary{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:700;width:100%;padding:9px}
label.row{display:flex;align-items:center;justify-content:space-between;margin:4px 0}
label.row input[type=number]{width:120px;font:inherit;padding:3px 5px}
input[type=range]{width:150px}
.keys{font-size:12px;color:#555}.keys b{display:inline-block;min-width:74px;color:var(--ch)}
code{word-break:break-all}textarea{width:100%;height:120px;font:11px monospace}
#status{position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:4px;font-size:12px}
</style></head><body>
<div id="map"><canvas id="cv"></canvas><div id="status"></div></div>
<div id="panel">
<h1>Scan registration</h1><div class="sub" id="nm"></div>
<fieldset><legend>Tool (left-drag)</legend>
<div class="tools"><button data-t="move" class="on">Move</button><button data-t="rotate">Rotate</button><button data-t="scale">Scale</button><button data-t="pan">Pan map</button></div>
<div class="keys" style="margin-top:6px">Right- or middle-drag always pans · wheel zooms</div></fieldset>
<fieldset><legend>Transform</legend>
<label class="row">Move East (m)<input type="number" step="0.05" id="tE"></label>
<label class="row">Move North (m)<input type="number" step="0.05" id="tN"></label>
<label class="row">Rotate (deg, CCW)<input type="number" step="0.1" id="rot"></label>
<label class="row">Scale<input type="number" step="0.001" id="scl"></label>
<label class="row"><span><input type="checkbox" id="lockscale" checked> lock scale at 1</span></label>
<button id="reset">Reset</button></fieldset>
<fieldset><legend>View</legend>
<label class="row">Cloud opacity<input type="range" id="op" min="0" max="100" value="70"></label>
<label class="row">Imagery<select id="src"><option value="esri">Esri World Imagery</option><option value="osm">OpenStreetMap</option></select></label>
<label class="row"><span><input type="checkbox" id="flick"> flicker cloud on/off</span></label>
<button id="zoomcloud">Zoom to cloud</button></fieldset>
<fieldset><legend>Save</legend>
<button class="primary" id="save">Save transform (.json)</button>
<div class="keys" style="margin:6px 0">Then run:<br><code id="cmd"></code></div>
<textarea id="json" readonly></textarea>
<label class="row">Load a saved transform<input type="file" id="load" accept=".json"></label></fieldset>
<fieldset><legend>Keys</legend><div class="keys">
<div><b>Arrows</b>move 5 cm (Shift 50 cm)</div><div><b>[ ]</b>rotate 0.1° (Shift 1°)</div>
<div><b>- =</b>scale 0.05% (Shift 0.5%)</div><div><b>H</b>hide / show cloud</div><div><b>Z</b>zoom to cloud</div></div></fieldset>
<div class="keys">Imagery © Esri, Maxar, Earthstar Geographics · © OpenStreetMap contributors. Satellite imagery can itself be offset by ~1 m; check several features.</div>
</div>
<script>
const M=__META__;
document.getElementById('nm').textContent=M.name+' · EPSG '+M.epsg+' · '+M.width+'×'+M.height+' px @ '+M.res+' m';
// ---------------- geodesy: UTM <-> lat/lon (WGS84) and Web Mercator
const A=6378137, F=1/298.257223563, E2=F*(2-F), EP2=E2/(1-E2), K0=0.9996;
function utm2ll(E,N){const x=E-500000,y=M.south?N-10000000:N;const Mm=y/K0;
 const mu=Mm/(A*(1-E2/4-3*E2*E2/64-5*E2*E2*E2/256));const e1=(1-Math.sqrt(1-E2))/(1+Math.sqrt(1-E2));
 const p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
 const C1=EP2*Math.cos(p1)**2,T1=Math.tan(p1)**2,N1=A/Math.sqrt(1-E2*Math.sin(p1)**2),R1=A*(1-E2)/Math.pow(1-E2*Math.sin(p1)**2,1.5),D=x/(N1*K0);
 const lat=p1-(N1*Math.tan(p1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*EP2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*EP2-3*C1*C1)*D**6/720);
 const lon=(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*EP2+24*T1*T1)*D**5/120)/Math.cos(p1);
 return [lat*180/Math.PI,(M.zone-1)*6-180+3+lon*180/Math.PI];}
function ll2w(lat,lon){const s=Math.sin(lat*Math.PI/180);return [(lon+180)/360*256,(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*256];}
function utm2w(E,N){const l=utm2ll(E,N);return ll2w(l[0],l[1]);}
// ---------------- state
const S={t:[M.init.translation[0],M.init.translation[1]],rot:M.init.rotation_deg,s:M.init.scale};
const P=M.pivot; let view={cx:0,cy:0,z:20}; let tool='move', hidden=false, src='esri';
const cv=document.getElementById('cv'),ctx=cv.getContext('2d'),mapEl=document.getElementById('map');
const img=new Image();img.onload=()=>draw();img.src=M.img;
const tiles=new Map();
function tileURL(z,x,y){return src==='esri'?`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`:`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;}
function getTile(z,x,y){const k=src+z+'/'+x+'/'+y;let t=tiles.get(k);if(!t){t=new Image();t.onload=()=>draw();t.src=tileURL(z,x,y);tiles.set(k,t);}return t;}
function resize(){cv.width=mapEl.clientWidth*devicePixelRatio;cv.height=mapEl.clientHeight*devicePixelRatio;cv.style.width=mapEl.clientWidth+'px';cv.style.height=mapEl.clientHeight+'px';draw();}
function w2s(wx,wy){const k=Math.pow(2,view.z)*devicePixelRatio;return [(wx-view.cx)*k+cv.width/2,(wy-view.cy)*k+cv.height/2];}
function s2w(sx,sy){const k=Math.pow(2,view.z)*devicePixelRatio;return [(sx-cv.width/2)/k+view.cx,(sy-cv.height/2)/k+view.cy];}
// local linearisation of UTM -> screen at the pivot
function jac(){const c=utm2w(P[0],P[1]),e=utm2w(P[0]+1,P[1]),n=utm2w(P[0],P[1]+1);const k=Math.pow(2,view.z)*devicePixelRatio;
 return {c:w2s(c[0],c[1]),J:[[(e[0]-c[0])*k,(n[0]-c[0])*k],[(e[1]-c[1])*k,(n[1]-c[1])*k]]};}
function screenToUtmDelta(dx,dy,J){const d=J[0][0]*J[1][1]-J[0][1]*J[1][0];return [( J[1][1]*dx-J[0][1]*dy)/d,(-J[1][0]*dx+J[0][0]*dy)/d];}
function draw(){
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#222';ctx.fillRect(0,0,cv.width,cv.height);
 const zt=Math.max(0,Math.min(src==='esri'?19:19,Math.floor(view.z)));const n=Math.pow(2,zt);const ts=256/n; // world units per tile
 const a=s2w(0,0),b=s2w(cv.width,cv.height);
 for(let x=Math.floor(a[0]/ts);x<=Math.floor(b[0]/ts);x++)for(let y=Math.floor(a[1]/ts);y<=Math.floor(b[1]/ts);y++){
   if(x<0||y<0||x>=n||y>=n)continue;const t=getTile(zt,x,y);if(!t.complete||!t.naturalWidth)continue;
   const p=w2s(x*ts,y*ts),q=w2s((x+1)*ts,(y+1)*ts);ctx.drawImage(t,p[0],p[1],q[0]-p[0]+0.5,q[1]-p[1]+0.5);}
 const L=jac();
 if(img.complete&&!hidden){
  const th=S.rot*Math.PI/180,cs=Math.cos(th)*S.s,sn=Math.sin(th)*S.s;const J=L.J;
  const K=[[J[0][0]*cs+J[0][1]*sn,-J[0][0]*sn+J[0][1]*cs],[J[1][0]*cs+J[1][1]*sn,-J[1][0]*sn+J[1][1]*cs]];
  const dx0=M.E0-P[0],dy0=M.N0-P[1],r=M.res;
  const e=L.c[0]+J[0][0]*S.t[0]+J[0][1]*S.t[1]+K[0][0]*dx0+K[0][1]*dy0;
  const f=L.c[1]+J[1][0]*S.t[0]+J[1][1]*S.t[1]+K[1][0]*dx0+K[1][1]*dy0;
  ctx.globalAlpha=document.getElementById('op').value/100;
  ctx.setTransform(K[0][0]*r,K[1][0]*r,-K[0][1]*r,-K[1][1]*r,e,f);ctx.imageSmoothingEnabled=view.z<22;ctx.drawImage(img,0,0);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;}
 // pivot marker
 const pc=[L.c[0]+L.J[0][0]*S.t[0]+L.J[0][1]*S.t[1],L.c[1]+L.J[1][0]*S.t[0]+L.J[1][1]*S.t[1]];
 ctx.strokeStyle='#C88F32';ctx.lineWidth=2*devicePixelRatio;ctx.beginPath();ctx.arc(pc[0],pc[1],7*devicePixelRatio,0,7);ctx.moveTo(pc[0]-12*devicePixelRatio,pc[1]);ctx.lineTo(pc[0]+12*devicePixelRatio,pc[1]);ctx.moveTo(pc[0],pc[1]-12*devicePixelRatio);ctx.lineTo(pc[0],pc[1]+12*devicePixelRatio);ctx.stroke();
 // scale bar
 const mpp=1/Math.hypot(L.J[0][0],L.J[1][0])*devicePixelRatio;let bar=[0.5,1,2,5,10,20,50,100].find(v=>v/mpp>80)||100;const bw=bar/mpp*devicePixelRatio;
 ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(cv.width-bw-30*devicePixelRatio,cv.height-40*devicePixelRatio,bw+20*devicePixelRatio,28*devicePixelRatio);
 ctx.fillStyle='#fff';ctx.fillRect(cv.width-bw-20*devicePixelRatio,cv.height-20*devicePixelRatio,bw,4*devicePixelRatio);ctx.font=(11*devicePixelRatio)+'px sans-serif';ctx.fillText(bar+' m',cv.width-bw-20*devicePixelRatio,cv.height-25*devicePixelRatio);
 sync();}
function sync(){
 const set=(id,v)=>{const el=document.getElementById(id);if(document.activeElement!==el)el.value=v;};
 set('tE',S.t[0].toFixed(3));set('tN',S.t[1].toFixed(3));set('rot',S.rot.toFixed(3));set('scl',S.s.toFixed(5));
 const J=buildJSON();document.getElementById('json').value=JSON.stringify(J,null,1);
 document.getElementById('cmd').textContent='python scan_register.py apply '+M.name+'.las '+M.name+'_transform.json '+M.name+'_registered.las';
 const ll=utm2ll(P[0]+S.t[0],P[1]+S.t[1]);document.getElementById('status').textContent=`cloud centre ${ll[0].toFixed(6)}, ${ll[1].toFixed(6)} · zoom ${view.z.toFixed(1)}`;}
function buildJSON(){const th=S.rot*Math.PI/180,a=S.s*Math.cos(th),b=-S.s*Math.sin(th),c=S.s*Math.sin(th),d=S.s*Math.cos(th);
 const tx=P[0]+S.t[0]-(a*P[0]+b*P[1]),ty=P[1]+S.t[1]-(c*P[0]+d*P[1]);
 return {source:M.name+'.las',crs_epsg:M.epsg,pivot:P,translation:S.t,rotation_deg:S.rot,scale:S.s,
  note:"E',N' = scale*R(rotation)*([E,N]-pivot)+pivot+translation; Z unchanged",
  matrix_4x4_absolute:[[a,b,0,tx],[c,d,0,ty],[0,0,1,0],[0,0,0,1]],created:new Date().toISOString()};}
function zoomToCloud(){const c=utm2w(P[0]+S.t[0],P[1]+S.t[1]);view.cx=c[0];view.cy=c[1];
 const span=Math.max(M.width,M.height)*M.res;const L=jac();const pxPerM=Math.hypot(L.J[0][0],L.J[1][0])/Math.pow(2,view.z);
 view.z=Math.log2(Math.min(cv.width,cv.height)*0.8/(span*pxPerM));draw();}
// ---------------- interaction
let drag=null;
mapEl.addEventListener('contextmenu',e=>e.preventDefault());
mapEl.addEventListener('mousedown',e=>{const r=cv.getBoundingClientRect();const sx=(e.clientX-r.left)*devicePixelRatio,sy=(e.clientY-r.top)*devicePixelRatio;
 const mode=(e.button!==0||tool==='pan')?'pan':tool;drag={mode,sx,sy,S0:JSON.parse(JSON.stringify(S)),v0:{...view},L:jac()};mapEl.classList.add('drag');});
window.addEventListener('mouseup',()=>{drag=null;mapEl.classList.remove('drag');});
window.addEventListener('mousemove',e=>{if(!drag)return;const r=cv.getBoundingClientRect();const sx=(e.clientX-r.left)*devicePixelRatio,sy=(e.clientY-r.top)*devicePixelRatio;
 const dx=sx-drag.sx,dy=sy-drag.sy,L=drag.L;
 if(drag.mode==='pan'){const k=Math.pow(2,view.z)*devicePixelRatio;view.cx=drag.v0.cx-dx/k;view.cy=drag.v0.cy-dy/k;}
 else if(drag.mode==='move'){const d=screenToUtmDelta(dx,dy,L.J);S.t=[drag.S0.t[0]+d[0],drag.S0.t[1]+d[1]];}
 else{const pc=[L.c[0]+L.J[0][0]*drag.S0.t[0]+L.J[0][1]*drag.S0.t[1],L.c[1]+L.J[1][0]*drag.S0.t[0]+L.J[1][1]*drag.S0.t[1]];
  const v0=screenToUtmDelta(drag.sx-pc[0],drag.sy-pc[1],L.J),v1=screenToUtmDelta(sx-pc[0],sy-pc[1],L.J);
  if(drag.mode==='rotate'){let a=(Math.atan2(v1[1],v1[0])-Math.atan2(v0[1],v0[0]))*180/Math.PI;if(e.shiftKey)a*=0.1;S.rot=drag.S0.rot+a;}
  else if(!document.getElementById('lockscale').checked){let f=Math.hypot(v1[0],v1[1])/Math.max(1e-6,Math.hypot(v0[0],v0[1]));if(e.shiftKey)f=1+(f-1)*0.1;S.s=drag.S0.s*f;}}
 draw();});
mapEl.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();const sx=(e.clientX-r.left)*devicePixelRatio,sy=(e.clientY-r.top)*devicePixelRatio;
 const w0=s2w(sx,sy);view.z=Math.max(3,Math.min(25,view.z-e.deltaY*0.002));const w1=s2w(sx,sy);view.cx+=w0[0]-w1[0];view.cy+=w0[1]-w1[1];draw();},{passive:false});
document.querySelectorAll('.tools button').forEach(b=>b.onclick=()=>{tool=b.dataset.t;document.querySelectorAll('.tools button').forEach(x=>x.classList.toggle('on',x===b));});
window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;const big=e.shiftKey;
 const mv=big?0.5:0.05,rt=big?1:0.1,sc=big?0.005:0.0005;let used=true;
 if(e.key==='ArrowLeft')S.t[0]-=mv;else if(e.key==='ArrowRight')S.t[0]+=mv;else if(e.key==='ArrowUp')S.t[1]+=mv;else if(e.key==='ArrowDown')S.t[1]-=mv;
 else if(e.key==='['||e.key==='{')S.rot+=rt;else if(e.key===']'||e.key==='}')S.rot-=rt;
 else if((e.key==='='||e.key==='+')&&!document.getElementById('lockscale').checked)S.s*=1+sc;else if((e.key==='-'||e.key==='_')&&!document.getElementById('lockscale').checked)S.s/=1+sc;
 else if(e.key==='h'||e.key==='H')hidden=!hidden;else if(e.key==='z'||e.key==='Z')zoomToCloud();else used=false;
 if(used){e.preventDefault();draw();}});
const num=(id,f)=>document.getElementById(id).addEventListener('change',e=>{const v=parseFloat(e.target.value);if(isFinite(v)){f(v);draw();}});
num('tE',v=>S.t[0]=v);num('tN',v=>S.t[1]=v);num('rot',v=>S.rot=v);num('scl',v=>{if(!document.getElementById('lockscale').checked)S.s=v;});
document.getElementById('lockscale').onchange=e=>{if(e.target.checked){S.s=1;draw();}};
if(Math.abs(S.s-1)>1e-9)document.getElementById('lockscale').checked=false;
document.getElementById('reset').onclick=()=>{S.t=[0,0];S.rot=0;S.s=1;draw();};
document.getElementById('op').oninput=draw;
document.getElementById('src').onchange=e=>{src=e.target.value;draw();};
document.getElementById('zoomcloud').onclick=zoomToCloud;
let fl=null;document.getElementById('flick').onchange=e=>{if(e.target.checked)fl=setInterval(()=>{hidden=!hidden;draw();},600);else{clearInterval(fl);hidden=false;draw();}};
document.getElementById('save').onclick=()=>{const blob=new Blob([JSON.stringify(buildJSON(),null,1)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=M.name+'_transform.json';a.click();};
document.getElementById('load').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{const j=JSON.parse(t);S.t=j.translation;S.rot=j.rotation_deg;S.s=j.scale;
 document.getElementById('lockscale').checked=Math.abs(S.s-1)<1e-9;draw();});};
window.addEventListener('resize',resize);
resize();zoomToCloud();
</script></body></html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare", help="render the cloud and open the registration page")
    p.add_argument("las")
    p.add_argument("--res", type=float, default=0.04, help="render resolution in metres/pixel (default 0.04)")
    p.add_argument("--mode", choices=["top", "ground"], default="top",
                   help="top = highest point per pixel (like a satellite); ground = lowest point")
    p.add_argument("--epsg", type=int, help="override the CRS EPSG code")
    p.add_argument("--init", help="start from a saved transform .json")
    p.add_argument("--max-points", type=int, default=0, help="subsample for a faster render (0 = all points)")
    p.add_argument("--out", help="output .html path")
    p.add_argument("--no-browser", action="store_true")
    q = sub.add_parser("apply", help="apply a saved transform to the full point cloud")
    q.add_argument("las")
    q.add_argument("transform")
    q.add_argument("out")
    q.add_argument("--scale-z", action="store_true", help="also scale heights (default: XY only)")
    m = sub.add_parser("merge", help="merge several LAS files (same point format) into one")
    m.add_argument("out")
    m.add_argument("inputs", nargs="+")
    a = ap.parse_args()
    {"prepare": cmd_prepare, "apply": cmd_apply, "merge": cmd_merge}[a.cmd](a)


if __name__ == "__main__":
    main()
