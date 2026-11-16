import math, random
R = random.Random(7)
def f(v): return f"{v:.1f}".rstrip('0').rstrip('.')
def pt(p): return f"{f(p[0])} {f(p[1])}"

def shag_closed(cx, cy, rx, ry, n, tip, valley, sweep=6, droop=0.0):
    """Closed tufted ellipse: valleys on (1-valley), tips on (1+tip), swept clockwise-ish & drooping."""
    pts = []
    for i in range(n):
        a0 = 2*math.pi*i/n
        am = 2*math.pi*(i+0.5)/n
        tv = 1 - valley*(0.6+0.8*R.random())
        tt = 1 + tip*(0.6+0.8*R.random())
        v = (cx + rx*tv*math.cos(a0), cy + ry*tv*math.sin(a0))
        s = math.radians(sweep)
        t = (cx + rx*tt*math.cos(am+s), cy + ry*tt*math.sin(am+s) + droop*max(0, math.sin(am))*ry*0.08)
        pts.append((v, t))
    d = f"M{pt(pts[0][0])}"
    for i in range(n):
        v, t = pts[i]
        nv = pts[(i+1) % n][0]
        c1 = ((v[0]*0.4+t[0]*0.6), (v[1]*0.4+t[1]*0.6))
        c1 = (c1[0] + (t[0]-cx)*0.03, c1[1] + (t[1]-cy)*0.03)
        c2 = ((nv[0]*0.5+t[0]*0.5), (nv[1]*0.5+t[1]*0.5))
        d += f" Q{pt(c1)} {pt(t)} Q{pt(c2)} {pt(nv)}"
    return d + " Z"

def leaf(root, tip, w, bend):
    """Narrow pointed hair lock from root to tip, width w, bent sideways by bend."""
    dx, dy = tip[0]-root[0], tip[1]-root[1]
    L = math.hypot(dx, dy); nx, ny = -dy/L, dx/L
    a = (root[0]+nx*w/2, root[1]+ny*w/2); b = (root[0]-nx*w/2, root[1]-ny*w/2)
    m = (root[0]+dx*0.55+nx*bend, root[1]+dy*0.55+ny*bend)
    c1 = (m[0]+nx*w*0.35, m[1]+ny*w*0.35); c2 = (m[0]-nx*w*0.35, m[1]-ny*w*0.35)
    return f"M{pt(a)} Q{pt(c1)} {pt(tip)} Q{pt(c2)} {pt(b)} Z"

def strand(p0, p1, bend):
    dx, dy = p1[0]-p0[0], p1[1]-p0[1]; L = math.hypot(dx, dy) or 1
    nx, ny = -dy/L, dx/L
    c = ((p0[0]+p1[0])/2+nx*bend, (p0[1]+p1[1])/2+ny*bend)
    return f"M{pt(p0)} Q{pt(c)} {pt(p1)}"

out = {}
# head silhouette
out['head'] = shag_closed(120, 113, 69, 64, 30, 0.10, 0.02, sweep=5, droop=1.0)
# body
out['body'] = shag_closed(120, 198, 58, 33, 28, 0.06, 0.02, sweep=4, droop=1.0)
# ears: built from leaves stacked
def ear(side):
    s = -1 if side == 'L' else 1
    cx = 120 + s*54
    locks = []
    for k in range(7):
        rx = cx + s*(-10 + k*4.2) + R.uniform(-1.5, 1.5)
        root = (rx, 82 + k*2)
        tip = (cx + s*(-12 + k*5) + R.uniform(-2, 2), 188 + R.uniform(0, 10) - abs(k-3)*2)
        locks.append(leaf(root, tip, 19 + R.uniform(0, 6), s*R.uniform(2, 9)))
    return " ".join(locks)
out['earL'] = ear('L'); out['earR'] = ear('R')
def ear_strands(side):
    s = -1 if side == 'L' else 1; cx = 120 + s*54; parts = []
    for k in range(9):
        x0 = cx + s*(-8 + k*3.4); parts.append(strand((x0, 92 + k), (x0 + s*(k-4)*1.6 + R.uniform(-2, 2), 182 + R.uniform(0, 14)), s*R.uniform(-6, 6)))
    return " ".join(parts)
out['earStrandsL'] = ear_strands('L'); out['earStrandsR'] = ear_strands('R')
# tail plume (right, behind body)
tl = [leaf((160, 196), (204 + R.uniform(-3, 3), 150 + k*7), 14, -8) for k in range(4)]
out['tail'] = " ".join(tl)
out['tailStrands'] = " ".join(strand((166, 192), (198, 156 + k*8), -6) for k in range(4))
# head fur strands (dark texture everywhere, sheen top-left)
dark, sheen = [], []
for k in range(70):
    a = R.uniform(0, 2*math.pi); r0 = R.uniform(0.25, 0.7); r1 = r0 + R.uniform(0.22, 0.38)
    p0 = (120 + 69*r0*math.cos(a), 113 + 64*r0*math.sin(a)); p1 = (120 + 69*min(r1, 1.02)*math.cos(a+0.12), 113 + 64*min(r1, 1.02)*math.sin(a+0.12) + 6)
    mx, my = (p0[0]+p1[0])/2, (p0[1]+p1[1])/2
    if 78 < mx < 162 and 98 < my < 175: continue
    (sheen if (math.cos(a) < 0.2 and math.sin(a) < 0.1) else dark).append(strand(p0, p1, R.uniform(-4, 4)))
out['headDark'] = " ".join(dark); out['headSheen'] = " ".join(sheen)
# body strands
out['bodyStrands'] = " ".join(strand((x, 176 + R.uniform(0, 8)), (x + R.uniform(-4, 4), 214 + R.uniform(0, 12)), R.uniform(-4, 4)) for x in [74, 84, 92, 104, 116, 128, 138, 150, 158, 166])
# fringe: back layer + front layer locks from crown arc to tips
def fringe(layer):
    locks = []
    xs = [62, 70, 79, 88, 97, 106, 114, 122, 130, 139, 148, 157, 166, 175] if layer == 'front' else [58, 68, 80, 92, 104, 116, 128, 140, 152, 164, 176, 184]
    for x in xs:
        u = (x - 120)/62
        root = (120 + u*44, 56 + abs(u)*10)
        near_eye = min(abs(x-94), abs(x-146))
        tipy = (104 if near_eye < 9 else 110) + R.uniform(-3, 2) if layer == 'front' else 96 + R.uniform(-4, 4)
        if abs(u) > 0.85: tipy += 8
        tip = (x + u*6 + R.uniform(-2, 2), tipy)
        locks.append(leaf(root, tip, (17 if layer == 'front' else 20) + R.uniform(0, 4), R.uniform(-5, 5)))
    return " ".join(locks)
out['fringeBack'] = fringe('back'); out['fringeFront'] = fringe('front')
out['fringeSheen'] = " ".join(strand((120 + (x-120)*0.7, 60 + abs(x-120)*0.12), (x + R.uniform(-1, 1), 92 + R.uniform(-4, 6)), R.uniform(-3, 3)) for x in [70, 82, 96, 110, 124, 138, 152, 166])
# beard (muzzle) + chin
out['beard'] = shag_closed(120, 156, 33, 25, 18, 0.16, 0.03, sweep=2, droop=2.2)
out['beardStrands'] = " ".join(strand((120 + dx, 146), (120 + dx*1.35 + R.uniform(-2, 2), 178 + R.uniform(0, 10)), R.uniform(-3, 3)) for dx in [-26, -19, -12, -6, 6, 12, 19, 26])
out['chinGrey'] = " ".join(strand((120 + dx, 170), (120 + dx*1.2 + R.uniform(-1, 1), 186 + R.uniform(0, 5)), R.uniform(-2, 2)) for dx in [-7, -3, 0, 3, 7])
# mustache sweeps
mL = [leaf((116, 140 + k*3), (84 - k*5 + R.uniform(-2, 2), 162 + k*6), 9, 4) for k in range(3)]
mR = [leaf((124, 140 + k*3), (156 + k*5 + R.uniform(-2, 2), 162 + k*6), 9, -4) for k in range(3)]
out['mustache'] = " ".join(mL + mR)
# cowlick
out['cowlick'] = " ".join([leaf((116, 58), (132, 8), 12, -6), leaf((124, 58), (148, 22), 10, -5), leaf((112, 60), (118, 22), 9, 4)])
out['cowlickSheen'] = " ".join([strand((118, 52), (131, 14), -4), strand((125, 52), (145, 25), -3)])
# paws
def paw(cx):
    return shag_closed(cx, 224, 17, 11, 10, 0.12, 0.03, sweep=0, droop=0)
out['pawL'] = paw(96); out['pawR'] = paw(144)
import json; json.dump(out, open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'paths.json'), 'w'))
print({k: len(v) for k, v in out.items()}, sum(len(v) for v in out.values()))
