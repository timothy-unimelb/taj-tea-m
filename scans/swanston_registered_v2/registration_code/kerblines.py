import numpy as np
from scipy import ndimage
def step_edges(x,res=0.05,thr=0.35):
    lo=x[:,:2].min(0)-1; ij=((x[:,:2]-lo)/res).astype(int); sh=ij.max(0)+1
    z=x[:,2]; mn=np.full(sh,np.inf); np.minimum.at(mn,(ij[:,0],ij[:,1]),z); mn[np.isinf(mn)]=np.nan
    occ=~np.isnan(mn)
    f=ndimage.generic_filter(np.where(occ,mn,np.nan),np.nanmedian,size=3,mode='constant',cval=np.nan)
    occ=~np.isnan(f); f0=np.where(occ,f,np.nanmedian(f))
    gx=ndimage.sobel(f0,0)/(8*res); gy=ndimage.sobel(f0,1)/(8*res); mag=np.hypot(gx,gy)
    E=(mag>thr)&(mag<4)&ndimage.binary_erosion(occ,iterations=3)
    return np.argwhere(E)*res+lo+res/2
def ransac_lines(p,n_lines=4,thr=0.06,iters=3000,min_in=150,angle_rng=(70,110),rng=np.random.default_rng(0)):
    out=[]; p=p.copy()
    for _ in range(n_lines):
        best=None
        for _ in range(iters):
            i,j=rng.choice(len(p),2,replace=False); d=p[j]-p[i]; L=np.hypot(*d)
            if L<1.0: continue
            ang=np.degrees(np.arctan2(d[1],d[0]))%180
            if not angle_rng[0]<ang<angle_rng[1]: continue
            n=np.array([-d[1],d[0]])/L; r=np.abs((p-p[i])@n); inl=r<thr
            if best is None or inl.sum()>best[0]: best=(inl.sum(),inl)
        if best is None or best[0]<min_in: break
        q=p[best[1]]; c=q.mean(0); u,s,vt=np.linalg.svd(q-c); d=vt[0]
        ang=np.degrees(np.arctan2(d[1],d[0]))%180
        t=(q-c)@d
        out.append(dict(ang=ang,c=c,n=len(q),span=(t.min(),t.max()),d=d))
        p=p[~best[1]]
    return out
