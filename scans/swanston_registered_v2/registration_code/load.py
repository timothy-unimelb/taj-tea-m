import glob, numpy as np
from lasio import read_las
U='/root/.claude/uploads/bd6b9d8a-007e-5ddb-a80d-228f8e85cc7f/'
NAMES=['101315','101840','102451','103212']
def load_all():
    out={}
    for n in NAMES:
        p=glob.glob(U+f'*2026-09-30_{n}_1.las')[0]; d=read_las(p); d['path']=p; out[n]=d
    return out
