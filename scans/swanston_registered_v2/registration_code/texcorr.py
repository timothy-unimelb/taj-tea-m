import numpy as np, cv2
from scipy import fft
from render import ortho_pts
def edge_img(x,rgb,lo,hi,res):
    img,v=ortho_pts(x,rgb,lo,hi,res)
    g=cv2.cvtColor(img,cv2.COLOR_RGB2GRAY).astype(np.float32)
    g=cv2.GaussianBlur(g,(0,0),1.5)
    gx=cv2.Sobel(g,cv2.CV_32F,1,0); gy=cv2.Sobel(g,cv2.CV_32F,0,1)
    m=np.hypot(gx,gy); vv=cv2.erode(v.astype(np.uint8),np.ones((7,7),np.uint8))>0
    m[~vv]=0; m=np.minimum(m,np.percentile(m[vv],99)) if vv.any() else m
    return m/ (m.max()+1e-6), vv.astype(np.float32)
def search(xa,ca,xb,cb,yaws,res=0.05,maxshift=30.0,min_ov=30.0):
    cB=xb[:,:2].mean(0)
    lo=np.minimum(xa[:,:2].min(0),xb[:,:2].min(0))-maxshift-2; hi=np.maximum(xa[:,:2].max(0),xb[:,:2].max(0))+maxshift+2
    A,va=edge_img(xa,ca,lo,hi,res); H,W=A.shape
    FA=fft.rfft2(A); FVa=fft.rfft2(va); FA2=fft.rfft2(A*A)
    out=[]
    for yaw in yaws:
        t=np.radians(yaw); R=np.array([[np.cos(t),-np.sin(t)],[np.sin(t),np.cos(t)]])
        y=xb.copy(); y[:,:2]=(xb[:,:2]-cB)@R.T+cB
        B,vb=edge_img(y,cb,lo,hi,res)
        FB=fft.rfft2(B); FVb=fft.rfft2(vb)
        num=fft.irfft2(FA*np.conj(FB),s=A.shape)
        ea=fft.irfft2(FA2*np.conj(FVb),s=A.shape); eb=fft.irfft2(FVa*np.conj(fft.rfft2(B*B)),s=A.shape)
        ov=fft.irfft2(FVa*np.conj(FVb),s=A.shape)*res*res
        sc=num/np.sqrt(np.maximum(ea,1e-6)*np.maximum(eb,1e-6)); sc[ov<min_ov]=0
        lim=int(maxshift/res); ri=np.r_[0:lim+1,H-lim:H]; ci=np.r_[0:lim+1,W-lim:W]
        sub=sc[np.ix_(ri,ci)]
        # top 3 peaks
        flat=np.argsort(sub.ravel())[::-1]; taken=[]
        for f in flat[:5000]:
            i,j=np.unravel_index(f,sub.shape); r_=ri[i]; c_=ci[j]
            dr=r_ if r_<=H//2 else r_-H; dc=c_ if c_<=W//2 else c_-W
            if any(abs(dr-a)<20 and abs(dc-b)<20 for a,b,_ in taken): continue
            taken.append((dr,dc,sub[i,j]))
            if len(taken)==3: break
        for dr,dc,s in taken:
            # image shift (rows down = -y): b moved by (dc*res, -dr*res)
            out.append((yaw,s,dc*res,-dr*res,ov[dr%H,dc%W]))
    return out, cB
