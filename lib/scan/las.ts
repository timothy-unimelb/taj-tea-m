// Reads and writes LAS point clouds for scan registration. Reads the whole
// cloud (every point, with colour) in map coordinates. Writes one LAS 1.2
// file from several registered clouds, keeping the first file's map
// projection record so the result stays georeferenced.

export type LasCloud = {
  name: string;
  count: number;
  xyz: Float64Array;        // map coordinates (metres), 3 per point
  rgb: Uint8Array | null;   // 0 to 255, 3 per point
  epsg: number | null;      // projection from the file's GeoKeys or WKT
  vlr: Uint8Array;          // the file's variable length records (projection)
  format: number;
};

const RGB_OFFSET: Record<number, number> = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };

export function readLas(buffer: ArrayBuffer, name: string): LasCloud {
  const v = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "LASF") throw new Error(`${name} is not a LAS file.`);
  const major = bytes[24], minor = bytes[25];
  const headerSize = v.getUint16(94, true), offset = v.getUint32(96, true), vlrCount = v.getUint32(100, true);
  const formatByte = v.getUint8(104), recordLength = v.getUint16(105, true);
  if (formatByte & 0xc0) throw new Error(`${name} is compressed (LAZ). Export it as LAS.`);
  const format = formatByte & 0x3f;
  let count = v.getUint32(107, true);
  if (major === 1 && minor >= 4 && buffer.byteLength > 255) { const n = Number(v.getBigUint64(247, true)); if (n) count = n; }
  const sx = v.getFloat64(131, true), sy = v.getFloat64(139, true), sz = v.getFloat64(147, true);
  const ox = v.getFloat64(155, true), oy = v.getFloat64(163, true), oz = v.getFloat64(171, true);
  count = Math.min(count, Math.floor((buffer.byteLength - offset) / recordLength));
  // Projection from the variable length records.
  const vlr = bytes.slice(headerSize, offset);
  let epsg: number | null = null;
  let pos = 0;
  for (let i = 0; i < vlrCount && pos + 54 <= vlr.length; i++) {
    const vv = new DataView(vlr.buffer, vlr.byteOffset + pos);
    const recordId = vv.getUint16(18, true), length = vv.getUint16(20, true);
    const body = vlr.subarray(pos + 54, pos + 54 + length);
    if (recordId === 34735 && body.length >= 8) {
      const bv = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const keys = bv.getUint16(6, true);
      for (let k = 1; k <= keys && 8 * k + 7 < body.length; k++) if (bv.getUint16(8 * k, true) === 3072) epsg = bv.getUint16(8 * k + 6, true);
    } else if (recordId === 2112 && epsg === null) {
      const text = new TextDecoder("ascii").decode(body);
      const m = [...text.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/g)];
      if (m.length) epsg = Number(m[m.length - 1][1]);
    }
    pos += 54 + length;
  }
  const xyz = new Float64Array(count * 3);
  const rgbAt = RGB_OFFSET[format];
  const rgb = rgbAt !== undefined && rgbAt + 6 <= recordLength ? new Uint8Array(count * 3) : null;
  // Scaniverse writes 16-bit colour. Some tools write 8-bit values in the 16-bit fields.
  let sixteenBit = false;
  if (rgb) for (let i = 0; i < Math.min(count, 2000); i++) { const o = offset + i * recordLength + rgbAt; if (v.getUint16(o, true) > 255 || v.getUint16(o + 2, true) > 255 || v.getUint16(o + 4, true) > 255) { sixteenBit = true; break; } }
  for (let i = 0; i < count; i++) {
    const o = offset + i * recordLength;
    xyz[i * 3] = v.getInt32(o, true) * sx + ox;
    xyz[i * 3 + 1] = v.getInt32(o + 4, true) * sy + oy;
    xyz[i * 3 + 2] = v.getInt32(o + 8, true) * sz + oz;
    if (rgb) {
      const c = o + rgbAt, d = sixteenBit ? 257 : 1;
      rgb[i * 3] = v.getUint16(c, true) / d; rgb[i * 3 + 1] = v.getUint16(c + 2, true) / d; rgb[i * 3 + 2] = v.getUint16(c + 4, true) / d;
    }
  }
  return { name, count, xyz, rgb, epsg, vlr, format };
}

export type LasPart = { xyz: Float64Array; rgb: Uint8Array | null; count: number };

// One LAS 1.2 file (point format 2 with colour, else 0) from several clouds in the same map coordinates.
export function writeLas(parts: LasPart[], vlr: Uint8Array, software = "Barrier Brain registration"): Uint8Array {
  const colour = parts.every(p => p.rgb);
  const format = colour ? 2 : 0, recordLength = colour ? 26 : 20;
  const total = parts.reduce((n, p) => n + p.count, 0);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.count; i++) for (let k = 0; k < 3; k++) { const x = p.xyz[i * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
  const scale = 0.0001, origin = min.map(Math.floor);
  const headerSize = 227, offset = headerSize + vlr.length;
  const out = new Uint8Array(offset + total * recordLength), v = new DataView(out.buffer);
  out.set([0x4c, 0x41, 0x53, 0x46], 0);
  out[24] = 1; out[25] = 2;
  out.set(new TextEncoder().encode("Barrier Brain").subarray(0, 32), 26);
  out.set(new TextEncoder().encode(software).subarray(0, 32), 58);
  const now = new Date();
  v.setUint16(90, Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000) + 1, true);
  v.setUint16(92, now.getUTCFullYear(), true);
  v.setUint16(94, headerSize, true);
  v.setUint32(96, offset, true);
  // Count the projection records we copy.
  let vlrCount = 0;
  for (let pos = 0; pos + 54 <= vlr.length; vlrCount++) pos += 54 + new DataView(vlr.buffer, vlr.byteOffset + pos).getUint16(20, true);
  v.setUint32(100, vlrCount, true);
  v.setUint8(104, format);
  v.setUint16(105, recordLength, true);
  v.setUint32(107, total, true);
  v.setUint32(111, total, true);
  [scale, scale, scale, origin[0], origin[1], origin[2], max[0], min[0], max[1], min[1], max[2], min[2]].forEach((x, i) => v.setFloat64(131 + i * 8, x, true));
  out.set(vlr, headerSize);
  let o = offset;
  for (const p of parts) for (let i = 0; i < p.count; i++) {
    v.setInt32(o, Math.round((p.xyz[i * 3] - origin[0]) / scale), true);
    v.setInt32(o + 4, Math.round((p.xyz[i * 3 + 1] - origin[1]) / scale), true);
    v.setInt32(o + 8, Math.round((p.xyz[i * 3 + 2] - origin[2]) / scale), true);
    out[o + 14] = 0b00001001; // first of one return
    if (colour && p.rgb) { v.setUint16(o + 20, p.rgb[i * 3] * 257, true); v.setUint16(o + 22, p.rgb[i * 3 + 1] * 257, true); v.setUint16(o + 24, p.rgb[i * 3 + 2] * 257, true); }
    o += recordLength;
  }
  return out;
}
