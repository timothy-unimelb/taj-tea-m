import numpy as np
from scipy.spatial import cKDTree
from icp import apply, voxel_idx, normals
def metrics(xa,ha,xb,hb):
    """xb moving already transformed. wall: median point-to-plane dist of b wall pts to a wall; ground: same for ground"""
    out={}
    for nm,ma,mb in [('wall',(ha>0.3)&(ha<3),(hb>0.3)&(hb<3)),('ground',np.abs(ha)<0.3,np.abs(hb)<0.3)]:
        A=xa[ma]; A=A[voxel_idx(A,0.04)]; B=xb[mb]; B=B[voxel_idx(B,0.04)]
        t=cKDTree(A); n,_=normals(A,t)
        d,j=t.query(B,distance_upper_bound=0.4); ok=np.isfinite(d)
        r=np.abs(np.einsum('ij,ij->i',B[ok]-A[j[ok]],n[j[ok]]))
        out[nm]=(ok.sum(), np.median(r).round(3) if ok.any() else None, (r<0.05).mean().round(2) if ok.any() else None)
    return out
