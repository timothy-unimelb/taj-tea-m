import numpy as np, pickle
from scipy.spatial import cKDTree
from chamfer import REF, rings
from utm import ll_to_utm
from evalc import O0
from scanfeat import merged
K0=np.array([3.01,-50.84]); th=np.radians(83.51); U=np.array([np.cos(th),np.sin(th)]); V=np.array([np.sin(th),-np.cos(th)])
def sample_lines(keys,maxv=12,step=0.05,uv_filter=True):
    pts=[]
    for key in keys:
        for f in REF[key]:
            for r in rings(f['g']):
                r=np.array(r); E,N=ll_to_utm(r[:,1],r[:,0]); P=np.c_[E-O0[0],N-O0[1]]
                for a,b in zip(P[:-1],P[1:]):
                    L=np.hypot(*(b-a)); n=max(2,int(L/step)); t=np.linspace(0,1,n)[:,None]; pts.append(a+(b-a)*t)
    P=np.vstack(pts)
    d=P-K0; u=d@U; v=d@V
    m=(v>-1)&(v<maxv)&(u>-20)&(u<80) if uv_filter else np.ones(len(P),bool)
    return P[m]
def scan_layers():
    x,c,ids=merged()
    z=x[:,2]; cell=np.floor(x[:,:2]/1.0).astype(int); key=cell[:,0]*100000+cell[:,1]
    o=np.lexsort((z,key)); ks=key[o]; st=np.flatnonzero(np.r_[True,ks[1:]!=ks[:-1]]); en=np.r_[st[1:],len(o)]
    zs=z[o]; g5=np.array([np.percentile(zs[i:j],5) if j-i>10 else zs[i] for i,j in zip(st,en)])
    gm=dict(zip(ks[st],g5)); h=z-np.array([gm[k] for k in key])
    return x,c,ids,h
def rigid2d(p,q,w=None):
    w=np.ones(len(p)) if w is None else w
    pc=(w[:,None]*p).sum(0)/w.sum(); qc=(w[:,None]*q).sum(0)/w.sum()
    H=((p-pc)*w[:,None]).T@(q-qc); U_,S,Vt=np.linalg.svd(H); R=Vt.T@U_.T
    if np.linalg.det(R)<0: Vt[1]*=-1; R=Vt.T@U_.T
    return R,qc-R@pc
def icp2d(src,tgt,R,t,iters=60,dmax=(2.0,0.3)):
    tree=cKDTree(tgt)
    for it in range(iters):
        dl=dmax[0]+(dmax[1]-dmax[0])*min(1,it/(iters*0.6))
        y=src@R.T+t; d,j=tree.query(y,distance_upper_bound=dl); ok=np.isfinite(d)
        if ok.sum()<20: break
        dR,dt=rigid2d(y[ok],tgt[j[ok]]); R=dR@R; t=dR@t+dt
    y=src@R.T+t; d,j=tree.query(y); 
    return R,t,d
