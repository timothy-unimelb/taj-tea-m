import numpy as np
from scipy.spatial import cKDTree
def voxel_idx(x,v):
    k=np.floor(x/v).astype(np.int64); k-=k.min(0)
    key=(k[:,0]*200000+k[:,1])*200000+k[:,2]; _,idx=np.unique(key,return_index=True); return idx
def normals(x,tree,k=12):
    d,i=tree.query(x,k=k); nb=x[i]-x[i].mean(1,keepdims=True)
    C=np.einsum('nki,nkj->nij',nb,nb); w,v=np.linalg.eigh(C)
    n=v[:,:,0]; curv=w[:,0]/np.maximum(w.sum(1),1e-12)
    return n,curv
def T4(yaw,t):
    c,s=np.cos(yaw),np.sin(yaw); T=np.eye(4); T[:3,:3]=[[c,-s,0],[s,c,0],[0,0,1]]; T[:3,3]=t; return T
def apply(T,x): return x@T[:3,:3].T+T[:3,3]
class Target:
    def __init__(s,x,v=0.1):
        s.x=x[voxel_idx(x,v)]; s.tree=cKDTree(s.x); s.n,s.curv=normals(s.x,s.tree)
def icp4(src,tgt,T0,iters=40,dmax=(1.0,0.3),trim=0.8,center=None):
    """4-DOF (yaw about z + xyz) point-to-plane ICP. returns T, rms, inlier fraction"""
    T=T0.copy(); c=center if center is not None else src.mean(0)
    for it in range(iters):
        d_lim=dmax[0]+(dmax[1]-dmax[0])*min(1,it/(iters*0.6))
        y=apply(T,src); d,j=tgt.tree.query(y,distance_upper_bound=d_lim)
        ok=np.isfinite(d)
        if ok.sum()<50: return T,np.inf,0.0
        yy=y[ok]; q=tgt.x[j[ok]]; n=tgt.n[j[ok]]
        r=np.einsum('ij,ij->i',yy-q,n)
        keep=np.abs(r)<=np.quantile(np.abs(r),trim)
        yy,q,n,r=yy[keep],q[keep],n[keep],r[keep]
        # linearise yaw about current centroid
        cc=apply(T,c[None])[0]; p=yy-cc
        J=np.c_[n[:,0]*(-p[:,1])+n[:,1]*p[:,0], n[:,0], n[:,1], n[:,2]]
        dx=np.linalg.lstsq(J,-r,rcond=None)[0]
        dT=np.eye(4); cy,sy=np.cos(dx[0]),np.sin(dx[0]); Rz=np.array([[cy,-sy,0],[sy,cy,0],[0,0,1]])
        dT[:3,:3]=Rz; dT[:3,3]=cc-Rz@cc+dx[1:]
        T=dT@T
        if np.abs(dx).max()<1e-5: break
    y=apply(T,src); d,j=tgt.tree.query(y,distance_upper_bound=0.2); ok=np.isfinite(d)
    rr=np.abs(np.einsum('ij,ij->i',y[ok]-tgt.x[j[ok]],tgt.n[j[ok]]))
    return T, float(np.sqrt(np.mean(rr**2))) if ok.any() else np.inf, float(ok.mean())

def icp6(src,tgt,T0,iters=30,dmax=(0.4,0.15),trim=0.85,maxtilt_deg=3.0):
    """6-DOF point-to-plane ICP (small-angle), tilt limited"""
    T=T0.copy()
    for it in range(iters):
        d_lim=dmax[0]+(dmax[1]-dmax[0])*min(1,it/(iters*0.6))
        y=apply(T,src); d,j=tgt.tree.query(y,distance_upper_bound=d_lim); ok=np.isfinite(d)
        if ok.sum()<100: break
        yy=y[ok]; q=tgt.x[j[ok]]; n=tgt.n[j[ok]]; r=np.einsum('ij,ij->i',yy-q,n)
        keep=np.abs(r)<=np.quantile(np.abs(r),trim); yy,n,r=yy[keep],n[keep],r[keep]
        cc=yy.mean(0); p=yy-cc
        J=np.c_[np.cross(p,n),n]
        dx=np.linalg.lstsq(J,-r,rcond=None)[0]
        a,b,g=dx[:3]
        Rs=np.array([[1,-g,b],[g,1,-a],[-b,a,1]]); U_,_,Vt=np.linalg.svd(Rs); Rs=U_@Vt
        dT=np.eye(4); dT[:3,:3]=Rs; dT[:3,3]=cc-Rs@cc+dx[3:]
        T=dT@T
        if np.abs(dx).max()<1e-6: break
    tilt=np.degrees(np.arccos(np.clip(T[2,2],-1,1)))
    y=apply(T,src); d,j=tgt.tree.query(y,distance_upper_bound=0.15); ok=np.isfinite(d)
    rr=np.abs(np.einsum('ij,ij->i',y[ok]-tgt.x[j[ok]],tgt.n[j[ok]]))
    return T,float(np.sqrt(np.mean(rr**2))),float(ok.mean()),tilt
