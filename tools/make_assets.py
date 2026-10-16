#!/usr/bin/env python3
"""
Builds every image asset in public/assets from code - no stock photos and no
AI image generators.

  * demo-before.png  - original black & white line art (brick wall, bubble
                       letters, spray can, crown, stars, drips), drawn here
  * og-image.jpg     - 1200x630 social preview: demo-before, and the same art
                       run through lib/neon_graffiti_colorizer.py
  * favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png,
    icon-192.png, icon-512.png - red blackletter N (tools/fonts/KaTeX_Fraktur-Bold.ttf)

Run from the project root:
    python tools/make_assets.py            # everything
    python tools/make_assets.py --icons    # favicons only
"""

import math
import os
import random
import sys
from argparse import Namespace

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lib"))
import neon_graffiti_colorizer as ngc  # noqa: E402

OUT = os.path.join(ROOT, "public", "assets")
os.makedirs(OUT, exist_ok=True)

W, H = 1600, 1000
S = 3                       # supersampling factor for smooth outlines
LW = 5 * S                  # main outline width
FONT = "/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf"

INK, PAPER = 0, 236         # outline ink and off-white paper


def s(v):
    return int(round(v * S))


def brick_wall(d):
    bh, bw = 92, 210
    y, row = -20, 0
    while y < H + bh:
        d.line([(0, s(y)), (s(W), s(y))], fill=INK, width=s(3.2))
        off = -bw / 2 if row % 2 else 0
        x = off
        while x < W + bw:
            d.line([(s(x), s(y)), (s(x), s(y + bh))], fill=INK, width=s(3.2))
            x += bw
        y += bh
        row += 1


def star(cx, cy, r_out, r_in, rot=0.0, pts=5):
    out = []
    for i in range(pts * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + math.pi * i / pts - math.pi / 2
        out.append((s(cx + r * math.cos(a)), s(cy + r * math.sin(a))))
    return out


def outlined_poly(d, pts, width=LW):
    d.polygon(pts, fill=PAPER)
    d.line(pts + [pts[0]], fill=INK, width=width, joint="curve")


def outlined_ellipse(d, box, width=LW):
    d.ellipse([s(v) for v in box], fill=PAPER, outline=INK, width=width)


def outlined_rrect(d, box, r, width=LW):
    d.rounded_rectangle([s(v) for v in box], radius=s(r), fill=PAPER, outline=INK, width=width)


def bubble_text(d, text, cx, cy, size):
    font = ImageFont.truetype(FONT, s(size))
    stroke = s(9)
    # 3D extrusion: several stacked copies, then the face on top
    for k in range(6, 0, -1):
        off = s(k * 3.2)
        d.text((s(cx) + off, s(cy) + off), text, font=font, anchor="mm",
               fill=PAPER, stroke_width=stroke, stroke_fill=INK)
    # fill the extrusion solid so it reads as one shape
    d.text((s(cx) + s(19), s(cy) + s(19)), text, font=font, anchor="mm",
           fill=PAPER, stroke_width=stroke, stroke_fill=INK)
    d.text((s(cx) + s(9), s(cy) + s(9)), text, font=font, anchor="mm", fill=PAPER)
    # face
    d.text((s(cx), s(cy)), text, font=font, anchor="mm",
           fill=PAPER, stroke_width=stroke, stroke_fill=INK)
    # highlight shine lines on the face
    return font


def spray_can(d, x, y, sc=1.0, tilt=0):
    can = Image.new("L", (s(260 * sc), s(520 * sc)), 255)
    cd = ImageDraw.Draw(can)
    w, h = 260 * sc, 520 * sc

    def b(*v):
        return [s(q) for q in v]

    # nozzle + cap
    cd.rounded_rectangle(b(w * 0.42, h * 0.02, w * 0.58, h * 0.09), radius=s(6), fill=PAPER, outline=INK, width=LW)
    cd.rectangle(b(w * 0.58, h * 0.04, w * 0.70, h * 0.065), fill=PAPER, outline=INK, width=s(4))
    cd.rounded_rectangle(b(w * 0.24, h * 0.08, w * 0.76, h * 0.22), radius=s(40 * sc), fill=PAPER, outline=INK, width=LW)
    # shoulder
    cd.chord(b(w * 0.10, h * 0.16, w * 0.90, h * 0.36), 180, 360, fill=PAPER, outline=INK, width=LW)
    # body
    cd.rounded_rectangle(b(w * 0.10, h * 0.26, w * 0.90, h * 0.97), radius=s(22 * sc), fill=PAPER, outline=INK, width=LW)
    # label band
    cd.rectangle(b(w * 0.10, h * 0.45, w * 0.90, h * 0.75), fill=PAPER, outline=INK, width=LW)
    # label star + stripes
    pts = star(w * 0.5 / S * S, h * 0.60, 52 * sc, 22 * sc, 0.2)
    cd.polygon(pts, fill=PAPER)
    cd.line(pts + [pts[0]], fill=INK, width=s(4), joint="curve")
    for fy in (0.79, 0.86):
        cd.line(b(w * 0.10, h * fy, w * 0.90, h * fy), fill=INK, width=s(4))
    # shine
    cd.rounded_rectangle(b(w * 0.18, h * 0.30, w * 0.25, h * 0.43), radius=s(8), fill=PAPER, outline=INK, width=s(4))
    can = can.rotate(tilt, resample=Image.BICUBIC, expand=True, fillcolor=255)
    return can


def drips(d, xs, y_top, rng):
    for x in xs:
        L = rng.uniform(60, 150)
        wdt = rng.uniform(16, 26)
        d.rounded_rectangle([s(x - wdt / 2), s(y_top), s(x + wdt / 2), s(y_top + L)],
                            radius=s(wdt / 2), fill=PAPER, outline=INK, width=s(4.5))
        r = wdt * 0.72
        d.ellipse([s(x - r), s(y_top + L - r * 0.9), s(x + r), s(y_top + L + r * 1.1)],
                  fill=PAPER, outline=INK, width=s(4.5))


def crown(cx, cy, w, h):
    pts = [(-0.5, 0.5), (-0.5, -0.1), (-0.38, -0.5), (-0.22, 0.0), (0.0, -0.62),
           (0.22, 0.0), (0.38, -0.5), (0.5, -0.1), (0.5, 0.5)]
    return [(s(cx + px * w), s(cy + py * h)) for px, py in pts]


def make_line_art(path):
    rng = random.Random(11)
    img = Image.new("L", (s(W), s(H)), PAPER)
    d = ImageDraw.Draw(img)
    brick_wall(d)

    # big burst behind the letters
    burst = star(800, 470, 470, 330, 0.08, pts=14)
    outlined_poly(d, burst, width=s(6))
    burst2 = star(800, 470, 360, 285, 0.30, pts=14)
    outlined_poly(d, burst2, width=s(5))

    # drips first, so the letters sit on top of their roots
    drips(d, [440, 520, 700, 905, 1010, 1165], 560, rng)

    bubble_text(d, "NEON", 790, 455, 330)

    # crown over the letters
    cp = crown(600, 215, 170, 120)
    outlined_poly(d, cp, width=s(6))
    for px in (-0.38, 0.0, 0.38):
        outlined_ellipse(d, (600 + px * 170 - 13, 215 - (0.62 if px == 0 else 0.5) * 120 - 26,
                             600 + px * 170 + 13, 215 - (0.62 if px == 0 else 0.5) * 120 + 0), width=s(4.5))

    # spray can, tilted, bottom right
    can = spray_can(d, 0, 0, sc=0.95, tilt=-16)
    # paste the can with a mask of its full silhouette (outline + interior)
    from PIL import ImageDraw as _ID
    sil = can.point(lambda v: 0 if v < 128 else 255)
    _ID.floodfill(sil, (0, 0), 128)
    inside = sil.point(lambda v: 0 if v == 128 else 255)
    img.paste(can, (s(1270), s(470)), inside)

    # spray mist puffs from the nozzle
    for (cx, cy, r) in [(1450, 498, 24), (1408, 462, 18), (1376, 434, 13)]:
        outlined_ellipse(d, (cx - r, cy - r, cx + r, cy + r), width=s(4.5))

    # stars
    for cx, cy, r in [(170, 180, 70), (1430, 150, 58), (250, 820, 48), (1080, 860, 40), (120, 520, 34)]:
        outlined_poly(d, star(cx, cy, r, r * 0.45, rng.uniform(0, 1)), width=s(5))

    # arrow sweeping under the letters
    arrow = [(300, 735), (900, 690), (898, 660), (980, 712), (902, 772), (900, 742), (305, 785)]
    outlined_poly(d, [(s(x), s(y)) for x, y in arrow], width=s(5.5))

    # tag-style circles
    for cx, cy, r in [(1525, 330, 40), (95, 330, 28), (700, 900, 30)]:
        outlined_ellipse(d, (cx - r, cy - r, cx + r, cy + r), width=s(5))
        outlined_ellipse(d, (cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5), width=s(4))

    img = img.resize((W, H), Image.LANCZOS)
    img.save(path, optimize=True)
    return img


def colorize_file(src, dst, seed, photo_std=90.0):
    args = Namespace(seed=seed, black=35.0, black_soft=20.0, edge=0.30, edge_sigma=1.2,
                     adaptive=25.0, adaptive_sigma=12.0, gap=1, min_region=0, gradient=0.6,
                     detail=0.8, depth=0.7, saturation=1.15, photo_std=photo_std, bg="auto",
                     bg_frac=0.15, palette="")
    ngc.colorize(src, dst, args)


# ---------------------------------------------------------------------------
# favicons: a neon drip "N" on black, drawn with plain shapes
# ---------------------------------------------------------------------------
FRAKTUR = os.path.join(ROOT, "tools", "fonts", "KaTeX_Fraktur-Bold.ttf")   # from KaTeX, open-source licence in tools/fonts/LICENSE-KaTeX.txt
ICON_RED = (234, 28, 36, 255)


def favicon(size):
    """Red blackletter N on a black rounded tile. Small sizes get less padding so the letter stays legible."""
    k = 4
    N = size * k
    pad = 0.07 if size <= 32 else 0.13
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * 0.22), fill=(0, 0, 0, 255))
    probe = ImageFont.truetype(FRAKTUR, N)
    l, t, r, b = d.textbbox((0, 0), "N", font=probe)
    scale = N * (1 - 2 * pad) / max(r - l, b - t)
    font = ImageFont.truetype(FRAKTUR, max(1, int(N * scale)))
    l, t, r, b = d.textbbox((0, 0), "N", font=font)
    d.text(((N - (r - l)) / 2 - l, (N - (b - t)) / 2 - t), "N", font=font, fill=ICON_RED)
    return im.resize((size, size), Image.LANCZOS)


def favicon_svg(path, view=32, pad=2.6):
    """Same icon as a vector: the glyph outline is copied out of the font with fontTools."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.boundsPen import BoundsPen
    font = TTFont(FRAKTUR)
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord("N")]
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    sp = SVGPathPen(gs)
    gs[name].draw(sp)
    sc = (view - 2 * pad) / max(x1 - x0, y1 - y0)
    tx = (view - (x1 - x0) * sc) / 2 - x0 * sc
    ty = (view + (y1 - y0) * sc) / 2 + y0 * sc
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}">\n'
        f'  <rect width="{view}" height="{view}" rx="7" fill="#000000"/>\n'
        f'  <path fill="#EA1C24" transform="translate({tx:.3f} {ty:.3f}) scale({sc:.5f} {-sc:.5f})" d="{sp.getCommands()}"/>\n'
        f'</svg>\n'
    )
    with open(path, "w") as f:
        f.write(svg)


def write_icons():
    pub = os.path.join(ROOT, "public")
    favicon_svg(os.path.join(pub, "favicon.svg"))
    favicon(32).save(os.path.join(pub, "favicon-32.png"))
    favicon(180).save(os.path.join(pub, "apple-touch-icon.png"))
    favicon(192).save(os.path.join(OUT, "icon-192.png"))
    favicon(512).save(os.path.join(OUT, "icon-512.png"))
    ico = [favicon(n) for n in (16, 32, 48, 64)]
    ico[-1].save(os.path.join(pub, "favicon.ico"), sizes=[(n, n) for n in (16, 32, 48, 64)], append_images=ico[:-1])


def og_image(before, after_path, path):
    Wo, Ho = 1200, 630
    a = Image.open(after_path).convert("RGB")
    b = before.convert("RGB")

    def cover(im):
        r = max(Wo / im.width, Ho / im.height)
        im = im.resize((int(im.width * r + 1), int(im.height * r + 1)), Image.LANCZOS)
        x = (im.width - Wo) // 2
        y = (im.height - Ho) // 2
        return im.crop((x, y, x + Wo, y + Ho))

    a, b = cover(a), cover(b)
    mask = Image.new("L", (Wo, Ho), 0)
    ImageDraw.Draw(mask).polygon([(Wo * 0.42, 0), (Wo, 0), (Wo, Ho), (Wo * 0.30, Ho)], fill=255)
    out = b.copy()
    out.paste(a, (0, 0), mask)
    d = ImageDraw.Draw(out)
    d.line([(Wo * 0.42, 0), (Wo * 0.30, Ho)], fill=(255, 255, 255), width=6)
    # bottom title bar
    bar = Image.new("RGBA", (Wo, 120), (0, 0, 0, 200))
    out.paste(bar, (0, Ho - 120), bar)
    f = ImageFont.truetype(FONT, 54)
    f2 = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 24)
    d.text((40, Ho - 96), "NEON GRAFFITI", font=f, fill=(255, 31, 203))
    d.text((470, Ho - 82), "B&W in. Street-art neon out. No AI.", font=f2, fill=(235, 235, 245))
    out.save(path, quality=90, optimize=True)


def main():
    before_png = os.path.join(OUT, "demo-before.png")
    after_png = os.path.join(OUT, "_demo-after.png")
    seed = int(os.environ.get("DEMO_SEED", "7"))
    before = make_line_art(before_png)
    colorize_file(before_png, after_png, seed)
    og_image(before, after_png, os.path.join(OUT, "og-image.jpg"))
    os.remove(after_png)

    write_icons()
    print("assets written to", OUT)


if __name__ == "__main__":
    if "--icons" in sys.argv:
        write_icons()
        print("icons written")
    else:
        main()