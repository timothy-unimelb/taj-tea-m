import numpy as np, cv2, pickle, itertools
from match import K, O, px2w  # reuses keypoints (runs match.py prints)
rng=np.random.default_rng(1)
def rigid_fit(p,q):
    pc,qc=p.mean(0),q.mean(0); H=(p-pc).T@(q-qc); U,S,Vt=np.linalg.svd(H); R=Vt.T@U.T
    if np.linalg.det(R)<0: Vt[1]*=-1; R=Vt.T@U.T
    return R, qc-R@pc
def ransac_rigid(wb,wa,thr=0.2,iters=50000,maxyaw=50,maxshift=25):
    n=len(wb); best=(0,None)
    for _ in range(iters):
        i,j=rng.choice(n,2,replace=False)
        db=wb[j]-wb[i]; da=wa[j]-wa[i]
        if abs(np.linalg.norm(db)-np.linalg.norm(da))>thr or np.linalg.norm(db)<0.5: continue
        yaw=np.arctan2(da[1],da[0])-np.arctan2(db[1],db[0]); yaw=(yaw+np.pi)%(2*np.pi)-np.pi
        if abs(np.degrees(yaw))>maxyaw: continue
        R=np.array([[np.cos(yaw),-np.sin(yaw)],[np.sin(yaw),np.cos(yaw)]]); t=wa[i]-R@wb[i]
        if np.linalg.norm(R@wb.mean(0)+t-wb.mean(0))>maxshift: continue
        r=np.linalg.norm(wb@R.T+t-wa,axis=1); inl=r<thr; c=inl.sum()
        if c>best[0]: best=(c,inl)
    if best[1] is None: return None
    inl=best[1]; R,t=rigid_fit(wb[inl],wa[inl])
    for _ in range(3):
        r=np.linalg.norm(wb@R.T+t-wa,axis=1); inl=r<thr; R,t=rigid_fit(wb[inl],wa[inl])
    return R,t,inl,np.sqrt(np.mean(r[inl]**2))
bf=cv2.BFMatcher(cv2.NORM_L2)
res={}
for a,b in itertools.combinations(sorted(O),2):
    pa,da=K[a]; pb,db=K[b]
    m=bf.knnMatch(db,da,k=3)
    # keep top-2 candidates per keypoint with loose ratio (repetitive patterns)
    cand=[]
    for mm in m:
        if len(mm)<2: continue
        if mm[0].distance<0.9*mm[1].distance: cand.append(mm[0])
    wa=px2w(O[a]['o'],O[a]['H'],pa[[g.trainIdx for g in cand]])
    wb=px2w(O[b]['o'],O[b]['H'],pb[[g.queryIdx for g in cand]])
    out=ransac_rigid(wb,wa)
    if out is None: print(a,b,'none'); continue
    R,t,inl,rms=out; yaw=np.degrees(np.arctan2(R[1,0],R[0,0]))
    shift=R@wb.mean(0)+t-wb.mean(0)
    print(f'{a} <- {b}: cand {len(cand)} inliers {inl.sum()} rms {rms:.3f} yaw {yaw:.1f} shift {shift.round(2)}')
    res[(a,b)]=dict(R=R,t=t,inl=int(inl.sum()),rms=rms,wa=wa[inl],wb=wb[inl],ncand=len(cand))
pickle.dump(res,open('sift_rigid.pkl','wb'))
