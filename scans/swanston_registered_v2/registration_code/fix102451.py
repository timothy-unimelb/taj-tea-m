import numpy as np,pickle,cv2
from evalc import P,O0,X
from icp import apply, Target, icp6, icp4, voxel_idx
from georef import scan_layers
from render import overlay
from occfast import Fixed, Moving, score
Tm=dict(pickle.load(open('Tm_joint.pkl','rb'))['Tm'])
x,c,ids,h=scan_layers()
def delta(yaw_deg,shift,center):
    t=np.radians(yaw_deg); R=np.array([[np.cos(t),-np.sin(t),0],[np.sin(t),np.cos(t),0],[0,0,1]])
    D=np.eye(4); D[:3,:3]=R; D[:3,3]=center-R@center+np.r_[shift,0]; return D
cB=x[ids==2].mean(0); cB[2]=0
res=[]
for (yaw,sx,sy) in [(3.0,-0.40,-16.10),(4.0,-0.20,-16.00),(2.0,-0.55,-15.60),(3.0,-0.30,-15.10),(2.0,-0.45,-14.60),(4.0,-0.50,-19.55),(0.0,-0.5,-10.85)]:
    D=delta(yaw,np.r_[sx,sy],cB)
    # ICP 102451 (raw->merged) against 101315+101840 in merged frame
    tgt=Target(np.vstack([apply(Tm[k],X[k]) for k in ['101315','101840']]),0.05)
    src=X['102451'][voxel_idx(X['102451'],0.06)]
    T0=D@Tm['102451']
    T,rms,f,tilt=icp6(src,tgt,T0,dmax=(0.5,0.12))
    Dn=T@np.linalg.inv(Tm['102451'])
    # consistency with occupancy
    xm=x.copy()
    a=0
    print(f'init yaw {yaw} ({sx},{sy}) -> rms {rms:.3f} overlap {f:.2f} tilt {tilt:.2f}',flush=True)
    res.append((f,rms,T,yaw,sx,sy))
pickle.dump(res,open('fix102451.pkl','wb'))
