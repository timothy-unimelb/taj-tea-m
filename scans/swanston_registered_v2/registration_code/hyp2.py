import numpy as np,pickle
from scipy.spatial import cKDTree
from georef import scan_layers
from icp import Target, icp6, apply, voxel_idx
x,c,ids,h=scan_layers()
Tm=pickle.load(open('Tm_joint.pkl','rb'))['Tm']
th=np.radians(84.7); Ud=np.array([np.cos(th),np.sin(th),0])
def pick(idx,struct_only=False,gsub=10):
    m=np.isin(ids,idx); s=m&(h>0.15)&(h<3); g=m&(np.abs(h)<=0.15)
    gi=np.flatnonzero(g)[::gsub]
    pts=np.vstack([x[s],x[gi]]) if not struct_only else x[s]
    return pts[voxel_idx(pts,0.04)]
def wall_frac(mov,fix,dT,thr=0.05):
    wf=(h>0.3)&(h<2.5)&np.isin(ids,fix); wm=(h>0.3)&(h<2.5)&(ids==mov)
    tf=cKDTree(x[wf][voxel_idx(x[wf],0.03)]); pm=apply(dT,x[wm][voxel_idx(x[wm],0.03)])
    d,_=tf.query(pm,distance_upper_bound=1.0); return (d<thr).mean()
def ground_ncc(mov,fix,dT,res=0.05):
    # compare ground brightness rasters in overlap
    gf=(np.abs(h)<0.1)&np.isin(ids,fix); gm=(np.abs(h)<0.1)&(ids==mov)
    pf=x[gf][:,:2]; pm=apply(dT,x[gm])[:,:2]
    lo=np.minimum(pf.min(0),pm.min(0)); 
    def ras(p,col):
        ij=((p-lo)/res).astype(int); sh=ij.max(0)+2; A=np.zeros(sh); N=np.zeros(sh)
        np.add.at(A,(ij[:,0],ij[:,1]),col); np.add.at(N,(ij[:,0],ij[:,1]),1); return A,N
    bf=c[gf].mean(1); bm=c[gm].mean(1)
    Af,Nf=ras(pf,bf); Am,Nm=ras(pm,bm)
    sh=np.minimum(Af.shape,Am.shape); Af,Nf,Am,Nm=[a[:sh[0],:sh[1]] for a in (Af,Nf,Am,Nm)]
    ov=(Nf>0)&(Nm>0)
    if ov.sum()<500: return np.nan,ov.sum()
    a=Af[ov]/Nf[ov]; b=Am[ov]/Nm[ov]
    # high-pass: subtract local mean via 1D normalisation
    a=(a-a.mean())/a.std(); b=(b-b.mean())/b.std(); return float((a*b).mean()), int(ov.sum())
