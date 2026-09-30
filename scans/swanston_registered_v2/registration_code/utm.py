import numpy as np
def ll_to_utm(lat,lon,zone=55):
    a=6378137.0; f=1/298.257223563; k0=0.9996; e2=f*(2-f); ep2=e2/(1-e2)
    lat=np.radians(np.asarray(lat,float)); lon=np.radians(np.asarray(lon,float)); lon0=np.radians((zone-1)*6-180+3)
    N=a/np.sqrt(1-e2*np.sin(lat)**2); T=np.tan(lat)**2; C=ep2*np.cos(lat)**2; A=np.cos(lat)*(lon-lon0)
    M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*lat-(3*e2/8+3*e2**2/32+45*e2**3/1024)*np.sin(2*lat)+(15*e2**2/256+45*e2**3/1024)*np.sin(4*lat)-(35*e2**3/3072)*np.sin(6*lat))
    E=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep2)*A**5/120)+500000
    Nn=k0*(M+N*np.tan(lat)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep2)*A**6/720))+10000000
    return E,Nn
