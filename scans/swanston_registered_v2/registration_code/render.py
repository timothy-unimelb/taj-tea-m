import numpy as np, cv2
def ortho_pts(x,rgb,lo,hi,res=0.03):
    W=int((hi[0]-lo[0])/res)+1; H=int((hi[1]-lo[1])/res)+1
    c=((x[:,0]-lo[0])/res).astype(int); r=H-1-((x[:,1]-lo[1])/res).astype(int)
    ok=(c>=0)&(c<W)&(r>=0)&(r<H)
    img=np.zeros((H,W,3),np.float64); n=np.zeros((H,W))
    np.add.at(img,(r[ok],c[ok]),rgb[ok]); np.add.at(n,(r[ok],c[ok]),1)
    m=n>0; img[m]/=n[m,None]; img=img.astype(np.uint8)
    hole=(~m).astype(np.uint8); dil=cv2.dilate(m.astype(np.uint8),np.ones((5,5),np.uint8))
    img=cv2.inpaint(img,(hole&dil),3,cv2.INPAINT_TELEA); v=dil>0; img[~v]=0
    return img,v
def overlay(xa,ca,xb,cb,res=0.03,pad=1.0):
    lo=np.minimum(xa[:,:2].min(0),xb[:,:2].min(0))-pad; hi=np.maximum(xa[:,:2].max(0),xb[:,:2].max(0))+pad
    ia,va=ortho_pts(xa,ca,lo,hi,res); ib,vb=ortho_pts(xb,cb,lo,hi,res)
    ga=cv2.cvtColor(ia,cv2.COLOR_RGB2GRAY).astype(int); gb=cv2.cvtColor(ib,cv2.COLOR_RGB2GRAY).astype(int)
    out=np.full(ia.shape,255,np.uint8)
    both=va&vb; oa=va&~vb; ob=vb&~va
    out[both]=np.stack([(ga+gb)//2]*3,-1)[both]
    out[oa]=np.stack([ga*0+255,ga,ga],-1)[oa]*0+np.stack([ga,ga,ga*0+255],-1)[oa]  # a only: blue tint
    out[ob]=np.stack([gb*0+255,gb,gb],-1)[ob]  # b only: red tint
    return out
