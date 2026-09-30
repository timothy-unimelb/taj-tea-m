import numpy as np
from scipy import ndimage
from georef import scan_layers
x,c,ids,h=scan_layers()
RES=0.1
class Fixed:
    def __init__(s,fix,pad=30):
        m=np.isin(ids,fix); p=x[m]; hh=h[m]
        s.lo=p[:,:2].min(0)-pad; s.sh=tuple(((p[:,:2].max(0)+pad-s.lo)/RES).astype(int)+1)
        s.G,s.O=s.grid(p,hh); s.Od=ndimage.binary_dilation(s.O>0,iterations=1)
    def grid(s,p,hh):
        ij=((p[:,:2]-s.lo)/RES).astype(int); ok=(ij>=0).all(1)&(ij[:,0]<s.sh[0])&(ij[:,1]<s.sh[1]); ij=ij[ok]; hh=hh[ok]
        lin=ij[:,0]*s.sh[1]+ij[:,1]; n=s.sh[0]*s.sh[1]
        G=np.bincount(lin[np.abs(hh)<0.08],minlength=n).reshape(s.sh); O=np.bincount(lin[(hh>0.3)&(hh<2.0)],minlength=n).reshape(s.sh)
        return G,O
class Moving:
    def __init__(s,mov,sub=3):
        m=np.flatnonzero((ids==mov)&((np.abs(h)<0.08)|((h>0.3)&(h<2.0))))[::sub]
        s.p=x[m]; s.h=h[m]; s.c=s.p[:,:2].mean(0)
def score(F,M,yaw,t):
    R=np.array([[np.cos(yaw),-np.sin(yaw)],[np.sin(yaw),np.cos(yaw)]])
    p=M.p.copy(); p[:,:2]=(p[:,:2]-M.c)@R.T+M.c+t
    Gm,Om=F.grid(p,M.h); Omd=ndimage.binary_dilation(Om>0,iterations=1)
    agree=((Om>0)&F.Od).sum()+((F.O>0)&Omd).sum()
    conf=((Om>0)&(F.G>=3)&~F.Od).sum()+((F.O>0)&(Gm>=2)&~Omd).sum()
    return agree,conf
