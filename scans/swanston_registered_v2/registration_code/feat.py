import numpy as np
from scipy import ndimage
RES=0.1
def voxel(x, v, rgb=None):
    k=np.floor(x/v).astype(np.int64); k-=k.min(0)
    key=(k[:,0]*100000+k[:,1])*100000+k[:,2]
    _,idx=np.unique(key,return_index=True)
    return (x[idx], rgb[idx] if rgb is not None else None)
def clean(x):
    # drop low outliers (below ground) and far-flung points
    z=x[:,2]; zmed=np.median(z)
    return (z>zmed-2.5)&(z<zmed+8)
def ground_plane(x):
    # robust plane through lowest points in 1 m cells
    c=np.floor(x[:,:2]).astype(int); key=c[:,0]*100000+c[:,1]
    o=np.lexsort((x[:,2],key)); ks=key[o]; first=np.r_[True,ks[1:]!=ks[:-1]]
    g=x[o][first]
    for _ in range(3):
        A=np.c_[g[:,0],g[:,1],np.ones(len(g))]; p=np.linalg.lstsq(A,g[:,2],rcond=None)[0]
        r=g[:,2]-A@p; g=g[np.abs(r)<max(0.15,2.5*np.median(np.abs(r)))]
    return p
def image(x, origin, shape, plane):
    """2-channel feature image: object height (0-2.5 m) and kerb-edge strength"""
    h=x[:,2]-(plane[0]*x[:,0]+plane[1]*x[:,1]+plane[2])
    ij=np.floor((x[:,:2]-origin)/RES).astype(int)
    ok=(ij[:,0]>=0)&(ij[:,1]>=0)&(ij[:,0]<shape[0])&(ij[:,1]<shape[1])
    ij=ij[ok]; h=h[ok]
    mx=np.full(shape,-9.0); mn=np.full(shape,9.0)
    np.maximum.at(mx,(ij[:,0],ij[:,1]),h); np.minimum.at(mn,(ij[:,0],ij[:,1]),h)
    occ=mx>-9
    obj=np.clip(mx-np.where(occ,mn,0),0,2.5)*occ     # vertical extent in cell
    # fill min-z holes a little then gradient for kerbs
    mnf=np.where(occ,mn,np.nan)
    m=ndimage.generic_filter(mnf,np.nanmedian,size=3,mode='constant',cval=np.nan) if False else mnf
    gx=ndimage.sobel(np.nan_to_num(m,nan=0),0); gy=ndimage.sobel(np.nan_to_num(m,nan=0),1)
    valid=ndimage.binary_erosion(occ,iterations=2)
    edge=np.clip(np.hypot(gx,gy),0,0.6)*valid
    return obj, edge, occ
