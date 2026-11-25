from pathlib import Path
import math
import struct
import zlib

SIZE = 1024
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "icon.png"
OUT.parent.mkdir(parents=True, exist_ok=True)


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def smooth(edge, value):
    return clamp(edge - value)


nodes = [(math.cos(math.radians(a)) * 310, math.sin(math.radians(a)) * 310) for a in (18, 102, 198, 286)]
rows = []
for y in range(SIZE):
    row = bytearray([0])
    for x in range(SIZE):
        dx, dy = x - SIZE / 2, y - SIZE / 2
        radius = math.hypot(dx, dy)

        # Rounded-square alpha.
        qx = abs(dx) - (SIZE / 2 - 24 - 220)
        qy = abs(dy) - (SIZE / 2 - 24 - 220)
        sdf = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - 220
        alpha = clamp(0.5 - sdf)
        if alpha == 0:
            row.extend((0, 0, 0, 0))
            continue

        t = clamp(1 - radius / 720)
        r = 5 + 8 * t
        g = 10 + 20 * t
        b = 20 + 30 * t

        # Main aura and three crisp orbital rings.
        aura = math.exp(-radius / 175) * 0.30
        r += 10 * aura
        g += 155 * aura
        b += 140 * aura
        angle = math.atan2(dy, dx)
        for idx, orbit in enumerate((155, 235, 310)):
            band = math.exp(-((radius - orbit) / (3.2 + idx)) ** 2)
            dash = 0.32 + 0.68 * clamp(math.sin(angle * (2 + idx) + idx) * 1.8 + 0.4)
            r += 24 * band * dash
            g += (130 + idx * 25) * band * dash
            b += (145 + idx * 20) * band * dash

        # Data links and agent nodes.
        for idx, (nx, ny) in enumerate(nodes):
            length = math.hypot(nx, ny)
            ux, uy = nx / length, ny / length
            projection = clamp(dx * ux + dy * uy, 112, 310)
            line_dist = math.hypot(dx - ux * projection, dy - uy * projection)
            link = math.exp(-(line_dist / 3.2) ** 2) * 0.45
            r += 35 * link
            g += 175 * link
            b += 160 * link
            node_dist = math.hypot(dx - nx, dy - ny)
            node_radius = 32 if idx == 0 else 24
            node = smooth(node_radius + 1, node_dist)
            if node:
                nr, ng, nb = ((180, 255, 224) if idx == 0 else (70, 235, 211))
                r = r * (1 - node) + nr * node
                g = g * (1 - node) + ng * node
                b = b * (1 - node) + nb * node
            hot = smooth(9, node_dist)
            r = r * (1 - hot) + 245 * hot
            g = g * (1 - hot) + 255 * hot
            b = b * (1 - hot) + 250 * hot

        # Multi-layer plasma core.
        if radius < 113:
            core = smooth(113, radius)
            if radius < 25:
                color = (230, 255, 248)
            elif radius < 58:
                color = (105, 255, 225)
            elif radius < 88:
                color = (24, 206, 183)
            else:
                color = (16, 105, 112)
            r = r * (1 - core) + color[0] * core
            g = g * (1 - core) + color[1] * core
            b = b * (1 - core) + color[2] * core

        row.extend((int(clamp(r / 255) * 255), int(clamp(g / 255) * 255), int(clamp(b / 255) * 255), int(alpha * 255)))
    rows.append(bytes(row))

raw = b"".join(rows)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(raw, 9))
png += chunk(b"IEND", b"")
OUT.write_bytes(png)
print(OUT)
