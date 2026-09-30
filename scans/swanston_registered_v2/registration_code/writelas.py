import numpy as np, struct
def write_las(path, xyz, rgb, geokey_vlr_data, sw=b'Claude registration', sysid=b'iPhone 16 (Scaniverse)'):
    scale=0.0001; off=np.floor(xyz.min(0))
    X=np.round((xyz-off)/scale).astype(np.int64); assert X.max()<2**31
    n=len(xyz)
    vlr=struct.pack('<H16sHH32s',0,b'LASF_Projection',34735,len(geokey_vlr_data),b'GeoTiff GeoKeyDirectoryTag')+geokey_vlr_data
    hsize=227; offset=hsize+len(vlr)
    mn=xyz.min(0); mx=xyz.max(0)
    h=bytearray(hsize)
    h[0:4]=b'LASF'; struct.pack_into('<H',h,4,0); struct.pack_into('<H',h,6,0)
    h[24]=1; h[25]=2; h[26:26+len(sysid)]=sysid[:32]; h[58:58+len(sw)]=sw[:32]
    struct.pack_into('<HHHIL',h,90,273,2026,hsize,offset,1)
    struct.pack_into('<BHL',h,104,2,26,n)
    struct.pack_into('<5L',h,111,n,0,0,0,0)
    struct.pack_into('<12d',h,131,scale,scale,scale,off[0],off[1],off[2],mx[0],mn[0],mx[1],mn[1],mx[2],mn[2])
    dt=np.dtype([('X','<i4'),('Y','<i4'),('Z','<i4'),('i','<u2'),('b','u1'),('cls','u1'),('sa','i1'),('ud','u1'),('psid','<u2'),('R','<u2'),('G','<u2'),('B','<u2')])
    a=np.zeros(n,dt); a['X'],a['Y'],a['Z']=X[:,0],X[:,1],X[:,2]; a['b']=0b00001001
    a['R'],a['G'],a['B']=rgb[:,0],rgb[:,1],rgb[:,2]
    with open(path,'wb') as f: f.write(bytes(h)); f.write(vlr); f.write(a.tobytes())
