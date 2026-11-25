from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "media" / "neural-space.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

random.seed(42)
rng = np.random.default_rng(42)
S = 2
W, H = 1280 * S, 640 * S

# Deep graphite space with restrained cyan and amber illumination.
yy, xx = np.mgrid[0:H, 0:W]
base = np.zeros((H, W, 3), dtype=np.float32)
base[:] = (2, 7, 15)
base += ((1 - yy / H) * 4)[..., None]

def radial(cx, cy, radius, color, strength):
    global base
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    a = np.clip(1 - d, 0, 1) ** 2 * strength
    base += a[..., None] * np.array(color, dtype=np.float32)

radial(970 * S, 310 * S, 520 * S, (3, 33, 46), 1.0)
radial(1080 * S, 170 * S, 340 * S, (10, 22, 37), 0.75)
radial(880 * S, 530 * S, 380 * S, (29, 18, 5), 0.38)
radial(160 * S, 500 * S, 500 * S, (4, 15, 22), 0.4)

# Extremely subtle surface grain prevents a flat synthetic background.
noise = rng.normal(0, 0.7, (H, W, 1))
base += noise
img = Image.fromarray(np.uint8(np.clip(base, 0, 255)), "RGB").convert("RGBA")

# Sparse stars, weighted away from the typography zone.
stars = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(stars)
for _ in range(290):
    x = random.randrange(W)
    if x < 650 * S and random.random() < 0.72:
        continue
    y = random.randrange(H)
    r = random.choice([0.45, 0.55, 0.7, 0.9, 1.2]) * S
    a = random.randrange(35, 120)
    tint = random.choice([(129, 211, 225, a), (183, 212, 222, a), (238, 190, 117, a // 2)])
    sd.ellipse((x-r, y-r, x+r, y+r), fill=tint)
for _ in range(13):
    x = random.randrange(700 * S, W)
    y = random.randrange(H)
    r = random.uniform(1.0, 1.5) * S
    sd.ellipse((x-r, y-r, x+r, y+r), fill=(174, 235, 244, 145))
    sd.line((x-4*S, y, x+4*S, y), fill=(123, 211, 225, 36), width=S)
    sd.line((x, y-4*S, x, y+4*S), fill=(123, 211, 225, 36), width=S)
img = Image.alpha_composite(img, stars)

# Technical perspective guides, intentionally faint and cropped.
guides = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(guides)
for x in range(660, 1401, 80):
    gd.line((x*S, 640*S, 940*S, 350*S), fill=(54, 152, 172, 14), width=S)
for y in [420, 470, 525, 590]:
    gd.line((620*S, y*S, 1280*S, y*S), fill=(54, 152, 172, 12), width=S)
for off in [0, 9, 18]:
    gd.line((62*S, (612+off)*S, 620*S, (612+off)*S), fill=(68, 193, 210, 12-off//3), width=S)
img = Image.alpha_composite(img, guides)

CX, CY = 944 * S, 320 * S

# Soft energy halo.
halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(halo)
for r, a in [(258, 12), (220, 18), (176, 24), (130, 32)]:
    hd.ellipse((CX-r*S, CY-r*S, CX+r*S, CY+r*S), fill=(24, 182, 205, a))
halo = halo.filter(ImageFilter.GaussianBlur(38 * S))
img = Image.alpha_composite(img, halo)

rings = [
    (278, 105, -17, (72, 222, 239), 0.2),
    (244, 92, 56, (64, 187, 214), 1.65),
    (202, 73, 105, (236, 174, 86), 3.35),
]

def orbit_point(ring, t):
    rx, ry, deg, _, _ = ring
    a = math.radians(deg)
    x, y = rx * math.cos(t), ry * math.sin(t)
    return (CX + S * (x * math.cos(a) - y * math.sin(a)),
            CY + S * (x * math.sin(a) + y * math.cos(a)))

def poly_glow(layer, points, color, width=1.25, alpha=150):
    d = ImageDraw.Draw(layer)
    rgb = color
    for factor, mul, a_mul in [(5.5, 0.22, 0.22), (2.8, 0.42, 0.40), (1.0, 1.0, 1.0)]:
        d.line(points, fill=(*rgb, int(alpha * a_mul)), width=max(1, int(width * S * factor * mul)), joint="curve")

# Data streams converging on the neural core.
streams = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for idx, (start, end, color) in enumerate([
    ((1285, 96), (1040, 254), (66, 206, 230)),
    ((1285, 495), (1030, 390), (230, 163, 78)),
    ((734, 645), (875, 423), (61, 179, 207)),
    ((1210, 645), (1020, 418), (56, 153, 183)),
]):
    p0 = np.array([start[0]*S, start[1]*S])
    p3 = np.array([end[0]*S, end[1]*S])
    p1 = p0 + np.array([-90*S, (35 if idx % 2 else 95)*S])
    p2 = p3 + np.array([100*S, (-45 if idx % 2 else 60)*S])
    ts = np.linspace(0, 1, 100)
    pts = [tuple((1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t*t*p2 + t**3*p3) for t in ts]
    poly_glow(streams, pts, color, width=0.85, alpha=82)
    for t in [0.28, 0.52, 0.76]:
        p = (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t*t*p2 + t**3*p3
        r = 1.8*S
        ImageDraw.Draw(streams).ellipse((p[0]-r,p[1]-r,p[0]+r,p[1]+r), fill=(*color,150))
img = Image.alpha_composite(img, streams)

# Rear orbit structures.
rear = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for ring in rings:
    color = ring[3]
    pts = [orbit_point(ring, t) for t in np.linspace(0, 2*math.pi, 260)]
    poly_glow(rear, pts, color, width=1.2 if color[0] < 100 else 1.0, alpha=135)
    # Broken outer telemetry arcs add precision without visual clutter.
    for start in [0.15, 2.3, 4.5]:
        arc = [orbit_point(ring, t) for t in np.linspace(start, start+0.36, 20)]
        poly_glow(rear, arc, color, width=2.2, alpha=180)
img = Image.alpha_composite(img, rear)

# Fine radial connections and sub-process satellites.
network = Image.new("RGBA", (W, H), (0, 0, 0, 0))
nd = ImageDraw.Draw(network)
node_positions = []
for ri, ring in enumerate(rings):
    for j, t in enumerate([0.35, 1.55, 2.7, 3.95, 5.15]):
        t += ring[4]
        x, y = orbit_point(ring, t)
        node_positions.append((x, y, ring[3], ri, j))
        if j % 2 == 0:
            nd.line((CX, CY, x, y), fill=(*ring[3], 28), width=S)
for x, y, color, ri, j in node_positions:
    r = (4.2 if ri < 2 else 3.8) * S
    nd.ellipse((x-r*2.6,y-r*2.6,x+r*2.6,y+r*2.6), fill=(*color,16))
    nd.ellipse((x-r*1.45,y-r*1.45,x+r*1.45,y+r*1.45), fill=(*color,42))
    nd.ellipse((x-r,y-r,x+r,y+r), fill=(5,17,25,255), outline=(*color,230), width=S)
    nd.ellipse((x-r*0.42,y-r*0.42,x+r*0.42,y+r*0.42), fill=(*color,245))
    # Tiny process tick next to each satellite.
    nd.line((x+r*1.8,y,x+r*3.2,y), fill=(*color,120), width=S)
img = Image.alpha_composite(img, network)

# Textured central energy sphere.
R = 104 * S
size = 2 * R
cy, cx = np.mgrid[0:size, 0:size]
nx = (cx - R) / R
ny = (cy - R) / R
dist = np.sqrt(nx**2 + ny**2)
mask = np.clip((1 - dist) * 18, 0, 1)
small_noise = rng.random((26, 26))
noise_img = Image.fromarray(np.uint8(small_noise * 255)).resize((size, size), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(3*S))
tex = np.asarray(noise_img).astype(np.float32) / 255.0
swirl = (np.sin(np.arctan2(ny, nx)*7 + dist*24) + 1) / 2
light = np.clip(0.72 - 0.36*nx - 0.42*ny, 0.12, 1.1)
texture = 0.56 + 0.28*tex + 0.16*swirl
sphere = np.zeros((size, size, 4), dtype=np.uint8)
for c, base_c in enumerate([(12, 92, 112), (22, 143, 157), (38, 105, 131)]):
    pass
rgb = np.stack([12*texture*light, 112*texture*light, 136*texture*light + 18*swirl], axis=-1)
rim = np.clip((dist - 0.78) / 0.22, 0, 1) * np.clip(0.85 - nx*0.35 - ny*0.45, 0.15, 1)
rgb += rim[..., None] * np.array([35, 105, 115])
sphere[..., :3] = np.uint8(np.clip(rgb, 0, 255))
sphere[..., 3] = np.uint8(mask * 255)
sphere_img = Image.fromarray(sphere, "RGBA")

core_glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cg = ImageDraw.Draw(core_glow)
cg.ellipse((CX-R-16*S,CY-R-16*S,CX+R+16*S,CY+R+16*S), fill=(38,209,224,72))
core_glow = core_glow.filter(ImageFilter.GaussianBlur(18*S))
img = Image.alpha_composite(img, core_glow)
img.alpha_composite(sphere_img, (int(CX-R), int(CY-R)))

# Surface arcs and a bright polar glint.
surface = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(surface)
for k in range(5):
    rr = (68 + k*7)*S
    start = 198 + k*11
    sd.arc((CX-rr,CY-rr,CX+rr,CY+rr), start=start, end=start+86, fill=(111,239,239,70-k*7), width=S)
sd.arc((CX-R,CY-R,CX+R,CY+R), start=196, end=318, fill=(161,249,248,205), width=2*S)
sd.ellipse((CX-34*S,CY-58*S,CX-18*S,CY-42*S), fill=(194,255,250,145))
surface = surface.filter(ImageFilter.GaussianBlur(0.45*S))
img = Image.alpha_composite(img, surface)

# A few crisp foreground arcs create depth over the sphere.
front = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for ring, a, b in [(rings[0], 0.05, 1.0), (rings[1], 3.25, 4.15), (rings[2], 0.15, 0.85)]:
    pts = [orbit_point(ring, t) for t in np.linspace(a, b, 90)]
    poly_glow(front, pts, ring[3], width=1.5, alpha=180)
img = Image.alpha_composite(img, front)

# Restrained vignette and left-side typography contrast.
vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vd = ImageDraw.Draw(vignette)
for i in range(90):
    alpha = int(1.4 * (90-i))
    vd.line((i*S,0,i*S,H), fill=(1,5,11,alpha), width=S)
img = Image.alpha_composite(img, vignette)

img = img.convert("RGB").resize((1280, 640), Image.Resampling.LANCZOS)
img.save(OUT, quality=95, optimize=True)
print(OUT)
