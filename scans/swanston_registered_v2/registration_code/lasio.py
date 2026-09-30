import struct, numpy as np
def read_las(p):
    b=open(p,'rb').read(4096)
    assert b[:4]==b'LASF'
    ver=(b[24],b[25]); hsize,off,nvlr=struct.unpack('<HIL',b[94:104]); pf,plen=struct.unpack('<BH',b[104:107]); n=struct.unpack('<L',b[107:111])[0]
    sx,sy,sz,ox,oy,oz=struct.unpack('<6d',b[131:179]); maxx,minx,maxy,miny,maxz,minz=struct.unpack('<6d',b[179:227])
    pos=hsize; vl=[]
    for i in range(nvlr):
        uid=b[pos+2:pos+18].rstrip(b'\0'); rid,rl=struct.unpack('<HH',b[pos+18:pos+22]); data=b[pos+54:pos+54+rl]; vl.append((uid,rid,data)); pos+=54+rl
    keys={}
    for uid,rid,data in vl:
        if rid==34735:
            v=struct.unpack(f'<{len(data)//2}H',data)
            for k in range(1,v[3]+1): keys[v[4*k]]=v[4*k+3]
    base=[('X','<i4'),('Y','<i4'),('Z','<i4'),('i','<u2'),('rn','u1'),('cls','u1'),('sa','i1'),('ud','u1'),('psid','<u2')]
    if pf in (1,3): base+= [('t','<f8')]
    if pf in (2,3): base+= [('R','<u2'),('G','<u2'),('B','<u2')]
    dt=np.dtype(base); assert dt.itemsize==plen,(dt.itemsize,plen,pf)
    a=np.fromfile(p,dtype=dt,offset=off,count=n)
    xyz=np.c_[a['X']*sx+ox,a['Y']*sy+oy,a['Z']*sz+oz]
    rgb=np.c_[a['R'],a['G'],a['B']] if 'R' in a.dtype.names else None
    return dict(ver=ver,pf=pf,n=n,sw=b[58:90].rstrip(b'\0'),sys=b[26:58].rstrip(b'\0'),keys=keys,xyz=xyz,rgb=rgb,scale=(sx,sy,sz))
