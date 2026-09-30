import pickle,numpy as np
from evalc import P,Tm,O0,X
from icp import apply, Target, icp6, voxel_idx
Tm=pickle.load(open('Tm_joint.pkl','rb'))['Tm']
keys=['101315','101840','102451','103212']
src={k:X[k][voxel_idx(X[k],0.08)] for k in keys}
for rnd in range(3):
    for k in keys:
        if k=='101840': continue
        others=np.vstack([apply(Tm[o],src[o]) for o in keys if o!=k])
        tgt=Target(others,0.06)
        T,rms,f,tilt=icp6(src[k],tgt,Tm[k])
        d=np.linalg.inv(Tm[k])@T
        print(f'round {rnd} {k}: rms {rms:.3f} overlap {f:.2f} tilt {tilt:.2f} deg | update rot {np.degrees(np.arccos(np.clip((np.trace(d[:3,:3])-1)/2,-1,1))):.3f} deg, trans {np.linalg.norm(d[:3,3]):.3f} m',flush=True)
        Tm[k]=T
pickle.dump(dict(Tm=Tm,O0=O0),open('Tm_joint.pkl','wb'))
