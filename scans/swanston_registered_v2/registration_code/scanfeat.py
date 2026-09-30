import pickle,numpy as np
from scipy import ndimage
from evalc import P,O0
from icp import apply
import os
Tm=pickle.load(open(os.environ.get('TMFILE','Tm_joint.pkl'),'rb'))['Tm']
keys=['101315','101840','102451','103212']
def merged(full=False):
    xs=[];cs=[];ids=[]
    for i,k in enumerate(keys):
        x=P[k]['x']-O0; xs.append(apply(Tm[k],x)); cs.append(P[k]['rgb']); ids.append(np.full(len(x),i))
    return np.vstack(xs),np.vstack(cs),np.concatenate(ids)
def edges(x,res=0.05,thr=0.6):
    # ground-level min-z raster
    lo=x[:,:2].min(0)-1; ij=((x[:,:2]-lo)/res).astype(int); sh=ij.max(0)+1
    z=x[:,2]; zmed=np.median(z); g=(z<zmed+1.0)&(z>zmed-2)
    mn=np.full(sh,np.nan); o=np.argsort(-z[g]); ii=ij[g][o]; mn[ii[:,0],ii[:,1]]=z[g][o]
    occ=~np.isnan(mn); f=ndimage.median_filter(np.where(occ,mn,np.nanmedian(mn)),5)
    gx=ndimage.sobel(f,0)/(8*res); gy=ndimage.sobel(f,1)/(8*res); mag=np.hypot(gx,gy)
    val=ndimage.binary_erosion(occ,iterations=4)
    E=(mag>thr)&(mag<6)&val
    pts=np.argwhere(E)*res+lo+res/2
    # walls: cells with points 0.6-2.0 m above local min
    mx=np.full(sh,-np.inf); np.maximum.at(mx,(ij[:,0],ij[:,1]),z)
    return pts, lo, mn
