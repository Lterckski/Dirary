"""
Ink from the Gemini art: cuts each mood out of its green background, lines them up, and writes every
picture the apps use (moods, paws, app icon, splash, favicon, widget previews, notification icon).
Sources are in tools/mascot/source: peek.png (happy and the paws come from it), coach, cheer, sleepy, worried.
Run from the repo root: python3 tools/mascot/cutout.py  (needs numpy, scipy and Pillow)
"""
import os
ROOT=os.path.normpath(os.path.join(os.path.dirname(__file__),'..','..'))
SRC=os.path.join(os.path.dirname(__file__),'source')
OUT={}
import numpy as np
from PIL import Image
def key(path):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    r,g,b=a[...,0],a[...,1],a[...,2]
    k=g-np.maximum(r,b)
    alpha=1-np.clip((k-18)/55,0,1)
    # despill: pull green down toward the other channels where it leads
    g2=np.minimum(g,np.maximum(r,b)+8)
    out=np.dstack([r,g2,b,alpha*255]).clip(0,255).astype(np.uint8)
    return Image.fromarray(out,'RGBA')

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

def clean(im):
    a=np.asarray(im).copy(); m=a[...,3]>40
    lab,n=ndimage.label(m); sizes=ndimage.sum(m,lab,range(1,n+1)); big=int(np.argmax(sizes))+1
    H,W=m.shape
    for i in range(1,n+1):
        if i==big: continue
        ys,xs=np.where(lab==i)
        if ys.min()==0 or xs.min()==0 or ys.max()==H-1 or xs.max()==W-1 or sizes[i-1]<30:
            a[lab==i,3]=0
    # main bbox
    ys,xs=np.where(lab==big)
    return Image.fromarray(a,'RGBA'), (xs.min(),ys.min(),xs.max()+1,ys.max()+1)

peek,_=clean(key(f'{SRC}/peek.png'))
pa=np.asarray(peek).copy()
H,W=pa.shape[:2]; yy,xx=np.mgrid[0:H,0:W]
def ell(cx,cy,rx,ry): return ((xx-cx)/rx)**2+((yy-cy)/ry)**2<=1
paws_mask=(ell(334,440,76,84)|ell(692,440,76,84))&(yy>372)
happy=pa.copy()
chest=pa[445,430].copy()
# Like the other moods: cut along a circle under the head, with the chest filled in where the paws were.
circle=((xx-512)**2+(yy-292)**2)<=218**2
tag=ell(518,480,30,30)&(yy>455)
fill=circle&(yy>372)&(happy[...,3]<250)
happy[paws_mask,3]=0
happy[fill,:3]=chest[:3]; happy[fill,3]=255
happy[~circle&~tag&(yy>330),3]=0
happy[(yy>366)&((xx<380)|(xx>644)),3]=0
happy=Image.fromarray(happy,'RGBA')
paws=pa.copy(); paws[~paws_mask,3]=0
paws=Image.fromarray(paws,'RGBA')

moods={'happy':happy}
for n in ['coach','cheer','sleepy','worried']:
    moods[n],_=clean(key(f'{SRC}/{n}.png'))

def body_box(im):
    a=np.asarray(im)[...,3]>40; lab,n=ndimage.label(a); sizes=ndimage.sum(a,lab,range(1,n+1)); big=int(np.argmax(sizes))+1
    ys,xs=np.where(lab==big); return xs.min(),ys.min(),xs.max()+1,ys.max()+1

# Square, bottom-aligned, the dog's body the same width in every mood so they line up.
def square(im, size=512, width=0.80):
    x0,y0,x1,y1=body_box(im); full=im.getbbox()
    s=size*width/(x1-x0)
    big=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    cx=(x0+x1)/2*s; bottom=y1*s
    out=Image.new('RGBA',(size,size),(0,0,0,0))
    out.paste(big,(round(size/2-cx),round(size-bottom)),big)
    return out

SCALE={'happy':1.0,'coach':0.86,'cheer':0.97,'sleepy':0.94,'worried':0.97}
sq={k:square(v,width=0.80*SCALE[k]) for k,v in moods.items()}
for k,v in sq.items(): OUT[k]=v
# paws: same scale as happy's head, cropped to a 4:1 strip
x0,y0,x1,y1=body_box(happy); s=512*0.80/(x1-x0)
pb=paws.getbbox(); strip=paws.crop((x0,pb[1],x1,pb[3]))
strip=strip.resize((round(strip.width*s),round(strip.height*s)),Image.LANCZOS)
OUT['paws']=strip

import os
from PIL import Image, ImageDraw
BLUE=(0x7C,0x83,0xFF,255)
O=ROOT
def mood(m): return OUT[m]
def save(im,path):
    p=os.path.join(O,path); os.makedirs(os.path.dirname(p),exist_ok=True); im.save(p,optimize=True); print(path, im.size)
def mask(W,shape):
    m=Image.new('L',(W*4,W*4),0); d=ImageDraw.Draw(m)
    if shape=='circle': d.ellipse([0,0,W*4-1,W*4-1],fill=255)
    elif shape=='round': d.rounded_rectangle([0,0,W*4-1,W*4-1],radius=W*4*0.22,fill=255)
    else: d.rectangle([0,0,W*4,W*4],fill=255)
    return m.resize((W,W),Image.LANCZOS)
def framed(m,W,shape=None,bg=BLUE,fill=0.98):
    ink=mood(m); s=round(W*fill); ink=ink.resize((s,s),Image.LANCZOS)
    layer=Image.new('RGBA',(W,W),(0,0,0,0)); layer.paste(ink,((W-s)//2,W-s),ink)
    if shape is None: return layer
    out=Image.new('RGBA',(W,W),(0,0,0,0)); mk=mask(W,shape)
    out.paste(Image.new('RGBA',(W,W),bg),(0,0),mk)
    from PIL import ImageChops
    a=ImageChops.multiply(layer.getchannel('A'),mk); layer.putalpha(a)
    return Image.alpha_composite(out,layer)
for m in ['happy','coach','cheer','sleepy','worried','paws']:
    im=mood(m); save(im,f'apps/mobile/assets/mascot/ink-{m}.png'); save(im,f'apps/web/public/ink/ink-{m}.png')
save(framed('happy',1024,'square').convert('RGB'),'apps/mobile/assets/images/icon.png')
save(framed('happy',1024,None,fill=0.80),'apps/mobile/assets/images/android-icon-foreground.png')
save(Image.new('RGB',(1024,1024),BLUE[:3]),'apps/mobile/assets/images/android-icon-background.png')
save(framed('happy',512,None,fill=1.0),'apps/mobile/assets/images/splash-icon.png')
save(framed('happy',192,'circle'),'apps/web/public/favicon.png')
for name,m,shape in [('today-tasks','happy','circle'),('ink-progress','cheer','round'),('today-spend','coach','round'),('food-today','cheer','circle'),('workout-today','coach','circle'),('day','happy','circle')]:
    save(framed(m,400,shape),f'apps/mobile/assets/widgets/{name}-preview.png')
