import pickle,numpy as np
from icp import Target, apply, voxel_idx, normals
from scipy.spatial import cKDTree
D=pickle.load(open('Tm_partial.pkl','rb')); Tm,O0=D['Tm'],D['O0']
P=pickle.load(open('pre.pkl','rb')); X={k:v['x']-O0 for k,v in P.items()}
def struct_score(src,tgt,T,thr=0.06):
    y=apply(T,src); tr=cKDTree(y); n,_=normals(y,tr)
    vert=np.abs(n[:,2])<0.5   # walls / kerb faces
    d,j=tgt.tree.query(y[vert],distance_upper_bound=0.5)
    ok=np.isfinite(d); agree=np.zeros(vert.sum(),bool)
    agree[ok]=(d[ok]<thr)&(np.abs(np.einsum('ij,ij->i',n[vert][ok],tgt.n[j[ok]]))>0.8)
    # also ground: colour? just return
    return vert.sum(), agree.mean(), np.median(d[ok]) if ok.any() else np.inf
