import numpy as np, cv2
from render import ortho_pts
def dom_dir(x,rgb,res=0.03):
    lo=x[:,:2].min(0)-1; hi=x[:,:2].max(0)+1
    img,v=ortho_pts(x,rgb,lo,hi,res)
    g=cv2.cvtColor(img,cv2.COLOR_RGB2GRAY); g=cv2.GaussianBlur(g,(5,5),0)
    e=cv2.Canny(g,40,110); e[cv2.erode(v.astype(np.uint8),np.ones((15,15),np.uint8))==0]=0
    L=cv2.HoughLinesP(e,1,np.pi/720,60,minLineLength=int(2.0/res),maxLineGap=int(0.3/res))
    if L is None: return None
    L=L[:,0]; dx=L[:,2]-L[:,0]; dy=-(L[:,3]-L[:,1]); ln=np.hypot(dx,dy)
    ang=np.degrees(np.arctan2(dy,dx))%180
    h,b=np.histogram(ang,bins=360,range=(0,180),weights=ln); 
    from scipy.ndimage import gaussian_filter1d
    hs=gaussian_filter1d(h,3,mode='wrap'); k=np.argmax(hs)
    sel=np.abs(((ang-b[k])+90)%180-90)<3
    a=np.degrees(np.arctan2(np.sum(ln[sel]*np.sin(np.radians(2*ang[sel]))),np.sum(ln[sel]*np.cos(np.radians(2*ang[sel])))))/2%180
    return a, ln[sel].sum(), len(L)
