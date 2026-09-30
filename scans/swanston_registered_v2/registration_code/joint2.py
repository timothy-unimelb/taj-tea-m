import pickle,numpy as np,sys
from evalc import P,O0,X
from icp import apply, Target, icp6, voxel_idx
Tm=dict(pickle.load(open('Tm_joint.pkl','rb'))['Tm'])
res=pickle.load(open('fix102451.pkl','rb'))
T2=res[1][2]   # init (4.0,-16.0): best occupancy ratio
D=T2@np.linalg.inv(Tm['102451'])
Tm['102451']=T2; Tm['103212']=D@Tm['103212']
keys=['101315','101840','102451','103212']
src={k:X[k][voxel_idx(X[k],0.08)] for k in keys}
for rnd in range(5):
    mx=0
    for k in keys:
        if k=='101840': continue
        others=np.vstack([apply(Tm[o],src[o]) for o in keys if o!=k]); tgt=Target(others,0.06)
        T,rms,f,tilt=icp6(src[k],tgt,Tm[k],dmax=(0.3,0.1))
        d=np.linalg.inv(Tm[k])@T; dr=np.degrees(np.arccos(np.clip((np.trace(d[:3,:3])-1)/2,-1,1))); dt=np.linalg.norm(d[:3,3])
        mx=max(mx,dt); Tm[k]=T
        print(f'round {rnd} {k}: rms {rms:.3f} overlap {f:.2f} tilt {tilt:.2f} | update {dr:.3f} deg {dt:.3f} m',flush=True)
    if mx<0.01: break
pickle.dump(dict(Tm=Tm,O0=O0),open('Tm_joint2.pkl','wb'))
