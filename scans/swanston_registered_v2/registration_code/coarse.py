import numpy as np
from scipy import fft
from feat import image, RES

ZERO = np.zeros(3)
NORM = 'global'


def rotz(t):
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rel(P):
    """points with z replaced by height above the scan's own ground plane"""
    x = P['x'].copy()
    pl = P['plane']
    x[:, 2] = x[:, 2] - (pl[0] * x[:, 0] + pl[1] * x[:, 1] + pl[2])
    return x


def feats(x, origin, shape):
    o, e, occ = image(x, origin, shape, ZERO)
    f = np.stack([o / 2.5, e / 0.6])
    f = f - f.mean(axis=(1, 2), keepdims=True) * 0  # keep raw (non-negative) features
    return f, occ.astype(float)


def xcorr(a, b):
    return fft.irfft2(fft.rfft2(a) * np.conj(fft.rfft2(b)), s=a.shape)


def coarse(xa, xb, yaws=np.arange(-45, 45.1, 1.0), maxshift=15.0, ref_center=None):
    """Find yaw (deg, about centroid of xb) and xy shift aligning xb (moving) onto xa (fixed).
    Score = feature correlation normalised by sqrt of feature energy inside the overlap."""
    ca = (xa.mean(0) + xb.mean(0)) / 2
    cb = xb.mean(0)
    span = np.ptp(np.r_[xa[:, :2], xb[:, :2]], 0).max() + 2 * maxshift + 10
    n = int(2 ** np.ceil(np.log2(span / RES)))
    origin = ca[:2] - n * RES / 2
    shape = (n, n)
    fa, oa = feats(xa, origin, shape)
    Fa = [fft.rfft2(c) for c in fa]
    Oa = fft.rfft2(oa)
    ea = [fft.rfft2(c * c) for c in fa]
    best = (-1, None)
    res = []
    lim = int(maxshift / RES)
    for y in yaws:
        R = rotz(np.radians(y))
        xbr = (xb - np.r_[cb[:2], 0]) @ R.T + np.r_[cb[:2], 0]
        fb, ob = feats(xbr, origin, shape)
        num = 0
        ena = 0
        enb = 0
        Ob = fft.rfft2(ob)
        for k in range(2):
            Fb = fft.rfft2(fb[k])
            num = num + fft.irfft2(Fa[k] * np.conj(Fb), s=shape)
            # energy of a within b's footprint and of b within a's footprint (for normalisation)
            ena = ena + fft.irfft2(ea[k] * np.conj(Ob), s=shape)
            enb = enb + fft.irfft2(Oa * np.conj(fft.rfft2(fb[k] * fb[k])), s=shape)
        ov = fft.irfft2(Oa * np.conj(Ob), s=shape)
        score = num / np.sqrt(np.maximum(ena, 1e-6) * np.maximum(enb, 1e-6)) if NORM == 'local' else num / np.sqrt(sum((c*c).sum() for c in fa) * sum((c*c).sum() for c in fb))
        score[ov < 400] = 0  # need >= 4 m2 overlap
        # restrict to +-maxshift (circular indices)
        idx = np.r_[0:lim + 1, n - lim:n]
        sub = score[np.ix_(idx, idx)]
        i, j = np.unravel_index(np.argmax(sub), sub.shape)
        s = sub[i, j]
        di = idx[i] if idx[i] <= n // 2 else idx[i] - n
        dj = idx[j] if idx[j] <= n // 2 else idx[j] - n
        res.append((y, s, di * RES, dj * RES, ov[idx[i], idx[j]] * RES * RES))
        if s > best[0]:
            best = (s, (y, di * RES, dj * RES))
    # transform: x' = R(x - cb_xy) + ca_xy + shift
    y, dx, dy = best[1]
    R = rotz(np.radians(y))
    t = np.r_[cb[:2], 0] + np.r_[dx, dy, 0] - R @ np.r_[cb[:2], 0]
    return R, t, best[0], res
