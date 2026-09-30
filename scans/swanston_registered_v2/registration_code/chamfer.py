import numpy as np, json, cv2, pickle
from scipy import fft, ndimage
from utm import ll_to_utm
from evalc import O0
REF=json.load(open('/mnt/user-data/uploads/FEIT Smart City Hackathon/Claude outputs/_ref_clip.json'))
def rings(g):
    t=g['type'];cc=g['coordinates']
    if t=='Polygon': return cc
    if t=='MultiPolygon': return [r for p in cc for r in p]
    if t=='LineString': return [cc]
    if t=='MultiLineString': return cc
    return []
def ref_lines(layers=('footpaths','bike','buildings')):
    L=[]
    for key in layers:
        for f in REF[key]:
            for r in rings(f['g']):
                r=np.array(r); E,N=ll_to_utm(r[:,1],r[:,0]); L.append((key,np.c_[E-O0[0],N-O0[1]]))
    return L
def dt_image(lines,lo,shape,res,trunc=1.5):
    img=np.ones(shape,np.uint8)
    for _,l in lines:
        p=((l-lo)/res).astype(np.int32)
        cv2.polylines(img,[p[:,::-1].reshape(-1,1,2)],False,0,1)  # row=x index, col=y index
    dt=ndimage.distance_transform_edt(img)*res
    return np.minimum(dt,trunc)
def search(src,lines,yaws,res=0.1,maxshift=30.0,trunc=1.5,center=None):
    c=src.mean(0) if center is None else center
    lo=src.min(0)-maxshift-10; hi=src.max(0)+maxshift+10
    shape=tuple(((hi-lo)/res).astype(int)+1)
    D=dt_image(lines,lo,shape,res,trunc); FD=fft.rfft2(D)
    best=[]
    for y in yaws:
        t=np.radians(y); R=np.array([[np.cos(t),-np.sin(t)],[np.sin(t),np.cos(t)]])
        p=(src-c)@R.T+c
        S=np.zeros(shape); ij=((p-lo)/res).astype(int); np.add.at(S,(ij[:,0],ij[:,1]),1)
        # score(s)=sum_p D(p+s) = corr(D,S)[s]
        C=fft.irfft2(FD*np.conj(fft.rfft2(S)),s=shape)/len(p)
        lim=int(maxshift/res); ri=np.r_[0:lim+1,shape[0]-lim:shape[0]]; ci=np.r_[0:lim+1,shape[1]-lim:shape[1]]
        sub=C[np.ix_(ri,ci)]; k=np.argmin(sub); i,j=np.unravel_index(k,sub.shape)
        di=ri[i] if ri[i]<=shape[0]//2 else ri[i]-shape[0]; dj=ci[j] if ci[j]<=shape[1]//2 else ci[j]-shape[1]
        best.append((y,sub[i,j],di*res,dj*res))
    return best,D,lo
