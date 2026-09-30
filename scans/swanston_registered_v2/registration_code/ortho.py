import numpy as np, cv2
from load import load_all
from feat import clean, ground_plane
RES_O=0.025
def ortho(d, res=RES_O, hmax=0.4):
    x=d['xyz']; m=clean(x); x=x[m]; rgb=(d['rgb'][m]/257).astype(np.uint8)
    pl=ground_plane(x); h=x[:,2]-(pl[0]*x[:,0]+pl[1]*x[:,1]+pl[2])
    g=np.abs(h)<hmax; x=x[g]; rgb=rgb[g]; h=h[g]
    o=np.floor(x[:,:2].min(0))-1; ij=((x[:,:2]-o)/res).astype(int); W,H=ij.max(0)+3
    img=np.zeros((H,W,3),np.uint8); cnt=np.zeros((H,W),np.int32)
    acc=np.zeros((H,W,3),np.float64)
    r=H-1-ij[:,1]; c=ij[:,0]
    np.add.at(acc,(r,c),rgb); np.add.at(cnt,(r,c),1)
    mask=cnt>0; img[mask]=(acc[mask]/cnt[mask,None]).astype(np.uint8)
    # fill small holes
    hole=(~mask).astype(np.uint8)
    dil=cv2.dilate(mask.astype(np.uint8),np.ones((5,5),np.uint8))
    img=cv2.inpaint(img,(hole&dil).astype(np.uint8),3,cv2.INPAINT_TELEA)
    valid=cv2.erode(dil,np.ones((3,3),np.uint8))>0
    img[~valid]=0
    # georef: pixel (row r, col c) -> x = o_x + (c+0.5)*res, y = o_y + (H-1-r+0.5)*res
    return img, valid, o, H, pl
if __name__=='__main__':
    import pickle
    S=load_all(); O={}
    for n,d in S.items():
        img,valid,o,H,pl=ortho(d); cv2.imwrite(f'ortho_{n}.png',img[:,:,::-1]); O[n]=dict(img=img,valid=valid,o=o,H=H,pl=pl)
        print(n,img.shape,valid.mean().round(2))
    pickle.dump(O,open('ortho.pkl','wb'))
