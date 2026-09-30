import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
def pair_plot(xa,xb,fn,title='',hmin=0.25):
    fig,axs=plt.subplots(1,2,figsize=(18,9),dpi=100)
    for ax,(lo,hi) in zip(axs,[(-0.3,0.25),(hmin,3)]):
        for x,c in [(xa,'tab:blue'),(xb,'tab:red')]:
            m=(x[:,2]>lo)&(x[:,2]<hi); s=np.flatnonzero(m)[::2]
            ax.scatter(x[s,0],x[s,1],s=0.3,c=c,alpha=0.5,linewidths=0)
        ax.set_aspect('equal'); ax.set_title(f'{title}  z in [{lo},{hi}]')
    plt.savefig(fn,bbox_inches='tight')
