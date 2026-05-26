#!/usr/bin/env python3
"""Generates apps/vscode-extension/media/icon.png (128x128) without external deps."""
import struct, zlib, math, os

W = H = 128

def rgb(r, g, b, a=255):
    return (r, g, b, a)

BG      = rgb(15,  23, 42)
NAVY    = rgb(30,  58, 95)
CYAN    = rgb(6,  182, 212)
GREEN   = rgb(34, 197,  94)
LGREEN  = rgb(101,163, 13)
DGREEN  = rgb(22, 163,  74)
DCYAN   = rgb(8,  145, 178)
SKY     = rgb(14, 165, 233)
WHITE   = rgb(255,255,255)

pixels = [[BG]*W for _ in range(H)]

def px(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        pixels[y][x] = c

def fill_rect(x, y, w, h, c):
    for dy in range(h):
        for dx in range(w):
            px(x+dx, y+dy, c)

def fill_rect_aa(x1f, y1f, x2f, y2f, c):
    for y in range(int(y1f), int(y2f)+1):
        for x in range(int(x1f), int(x2f)+1):
            px(x, y, c)

def draw_arc(cx, cy, rx, ry, a_start, a_end, c, thick=3):
    steps = 400
    for i in range(steps+1):
        t = a_start + (a_end - a_start) * i / steps
        bx = cx + rx * math.cos(t)
        by = cy + ry * math.sin(t)
        for dx in range(-thick, thick+1):
            for dy in range(-thick, thick+1):
                if dx*dx + dy*dy <= thick*thick:
                    px(int(bx+dx), int(by+dy), c)

# Background rounded rect (simulate)
fill_rect(0, 0, W, H, BG)
for r in range(20):
    for corner in [(r,r),(W-1-r,r),(r,H-1-r),(W-1-r,H-1-r)]:
        for dx in range(-1,2):
            for dy in range(-1,2):
                if (corner[0]+dx-r)**2 + (corner[1]+dy-r)**2 > (20-r)**2:
                    px(corner[0], corner[1], BG)

# Left signal arcs
draw_arc(44, 56, 18, 18, -math.pi*0.75, -math.pi*0.25, GREEN, 2)
draw_arc(44, 56, 30, 30, -math.pi*0.75, -math.pi*0.25, DGREEN, 2)
# Right signal arcs
draw_arc(84, 56, 18, 18, -math.pi*0.75+math.pi, -math.pi*0.25+math.pi, CYAN, 2)
draw_arc(84, 56, 30, 30, -math.pi*0.75+math.pi, -math.pi*0.25+math.pi, DCYAN, 2)

# Lighthouse body (trapezoid)
for y in range(42, 96):
    progress = (y - 42) / (96 - 42)
    x_left  = int(53 + (42 - 53) * (1 - progress))
    x_right = int(75 + (86 - 75) * (1 - progress))
    for x in range(x_left, x_right+1):
        px(x, y, NAVY)

# Analytics bars inside lighthouse
bar_data = [
    (45, 66, 12, 30, CYAN),
    (59, 74, 12, 22, GREEN),
    (73, 80, 10, 16, LGREEN),
]
for bx, by, bw, bh, bc in bar_data:
    for y in range(by, by+bh):
        progress = (y - 42) / (96 - 42)
        x_left  = int(53 + (42 - 53) * (1 - progress))
        x_right = int(75 + (86 - 75) * (1 - progress))
        for x in range(bx, bx+bw):
            if x_left <= x <= x_right:
                px(x, y, bc)

# Balcony
fill_rect(52, 42, 24, 4, NAVY)

# Lantern room
fill_rect(57, 24, 14, 18, NAVY)
fill_rect(59, 27, 4, 7, WHITE)
fill_rect(65, 27, 4, 7, WHITE)

# Lantern roof (triangle)
for y in range(14, 24):
    frac = (y - 14) / 10
    x_left = int(64 - 11*frac)
    x_right = int(64 + 11*frac)
    for x in range(x_left, x_right+1):
        px(x, y, NAVY)

# Base platform
fill_rect(36, 96, 56, 5, NAVY)

# Write PNG
def write_png(path, pixels, W, H):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    raw = b''
    for row in pixels:
        raw += b'\x00'
        for (r,g,b,a) in row:
            raw += bytes([r,g,b,a])

    compressed = zlib.compress(raw, 9)
    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

# Fix IHDR: bit depth + color type for RGBA
def write_png_rgba(path, pixels, W, H):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    raw = b''
    for row in pixels:
        raw += b'\x00'
        for (r,g,b,a) in row:
            raw += bytes([r,g,b,a])

    compressed = zlib.compress(raw, 9)
    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))  # color type 6 = RGBA
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

out = os.path.join(os.path.dirname(__file__), '..', 'apps', 'vscode-extension', 'media', 'icon.png')
write_png_rgba(out, pixels, W, H)
print(f"Written: {os.path.abspath(out)}")
