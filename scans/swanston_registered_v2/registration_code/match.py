import numpy as np, cv2, pickle, itertools
from ortho import RES_O
O=pickle.load(open('ortho.pkl','rb'))
def px2w(o,H,pts,res=RES_O):
    return np.c_[o[0]+(pts[:,0]+0.5)*res, o[1]+(H-1-pts[:,1]+0.5)*res]
sift=cv2.SIFT_create(nfeatures=20000,contrastThreshold=0.02)
K={}
for n,d in O.items():
    g=cv2.cvtColor(d['img'],cv2.COLOR_RGB2GRAY)
    g=cv2.createCLAHE(2.0,(8,8)).apply(g)
    mask=cv2.erode(d['valid'].astype(np.uint8)*255,np.ones((9,9),np.uint8))
    kp,des=sift.detectAndCompute(g,mask)
    K[n]=(np.array([k.pt for k in kp]),des); print(n,len(kp))
res={}
bf=cv2.BFMatcher(cv2.NORM_L2)
for a,b in itertools.combinations(sorted(O),2):
    pa,da=K[a]; pb,db=K[b]
    m=bf.knnMatch(db,da,k=2)
    good=[x for x,y in m if x.distance<0.8*y.distance]
    if len(good)<6: print(a,b,'few',len(good)); continue
    wa=px2w(O[a]['o'],O[a]['H'],pa[[g.trainIdx for g in good]])
    wb=px2w(O[b]['o'],O[b]['H'],pb[[g.queryIdx for g in good]])
    M,inl=cv2.estimateAffinePartial2D(wb.astype(np.float32),wa.astype(np.float32),method=cv2.RANSAC,ransacReprojThreshold=0.15,maxIters=20000,confidence=0.999)
    if M is None: print(a,b,'no model'); continue
    sc=np.hypot(M[0,0],M[1,0]); yaw=np.degrees(np.arctan2(M[1,0],M[0,0])); ni=int(inl.sum())
    cb=wb.mean(0); shift=(M[:,:2]@cb+M[:,2])-cb
    print(f'{a} <- {b}: good {len(good)} inliers {ni} scale {sc:.3f} yaw {yaw:.1f} shift at b-centre {shift.round(2)}')
    res[(a,b)]=dict(M=M,inl=ni,good=len(good),wa=wa[inl.ravel()==1],wb=wb[inl.ravel()==1])
pickle.dump(res,open('sift.pkl','wb'))
