import numpy as np,pickle
from scipy.spatial import cKDTree
from georef import scan_layers
from icp import Target, icp6, apply, voxel_idx
x,c,ids,h=scan_layers()
keys=['101315','101840','102451','103212']
Tm=pickle.load(open('Tm_joint.pkl','rb'))['Tm']
th=np.radians(84.7); Ud=np.array([np.cos(th),np.sin(th),0])
def struct_frac(mov_idx,fix_idx,dT=np.eye(4),thr=0.07):
    wf=(h>0.3)&(h<2.5)&np.isin(ids,fix_idx); wm=(h>0.3)&(h<2.5)&(ids==mov_idx)
    tf=cKDTree(x[wf][voxel_idx(x[wf],0.03)]); pm=x[wm][voxel_idx(x[wm],0.03)]
    pm=apply(dT,pm); d,_=tf.query(pm,distance_upper_bound=1.0)
    return (d<thr).mean(), np.isfinite(d).mean()
