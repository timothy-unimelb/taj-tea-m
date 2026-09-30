import numpy as np
from georef import scan_layers
from icp import apply
x,c,ids,h=scan_layers()
RES=0.1
def grids(pts,hh,lo,sh):
    ij=((pts[:,:2]-lo)/RES).astype(int); ok=(ij>=0).all(1)&(ij[:,0]<sh[0])&(ij[:,1]<sh[1]); ij=ij[ok]; hh=hh[ok]
    G=np.zeros(sh,int); O=np.zeros(sh,int)
    g=np.abs(hh)<0.08; o=(hh>0.3)&(hh<2.0)
    np.add.at(G,(ij[g,0],ij[g,1]),1); np.add.at(O,(ij[o,0],ij[o,1]),1)
    return G,O
def consistency(mov,fix,dT):
    pm=apply(dT,x[ids==mov]); hm=h[ids==mov]
    fm=np.isin(ids,fix); pf=x[fm]; hf=h[fm]
    lo=np.minimum(pm[:,:2].min(0),pf[:,:2].min(0))-1; hi=np.maximum(pm[:,:2].max(0),pf[:,:2].max(0))+1
    sh=tuple(((hi-lo)/RES).astype(int)+1)
    Gm,Om=grids(pm,hm,lo,sh); Gf,Of=grids(pf,hf,lo,sh)
    from scipy import ndimage
    Om2=ndimage.binary_dilation(Om>0,iterations=1); Of2=ndimage.binary_dilation(Of>0,iterations=1)
    agree=((Om>0)&Of2).sum()+((Of>0)&Om2).sum()
    conf=((Om>0)&(Gf>=3)&~Of2).sum()+((Of>0)&(Gm>=3)&~Om2).sum()
    both=((Gm+Om)>0)&((Gf+Of)>0)
    return agree, conf, agree/max(1,agree+conf), both.sum()*RES*RES
