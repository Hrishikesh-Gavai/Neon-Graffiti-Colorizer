#!/usr/bin/env python3
"""
neon_graffiti_colorizer.py
==========================

Purely algorithmic (no AI / no ML / no trained models) colorizer that turns any
grayscale or black-and-white image into a rich, deep, neon street-art /
graffiti style image.

How it works (pixel by pixel, classic image processing only)
------------------------------------------------------------
1.  Load the image and compute a luminance value for every pixel.
2.  Find "ink" / outlines:
      * pure black / near-black pixels           (global threshold)
      * locally dark strokes on grey paper       (adaptive threshold)
      * strong intensity edges                   (Gaussian-smoothed Sobel gradient)
    Together these form "walls" that colour must not cross.
3.  Close tiny gaps in the walls (morphological dilation) so colour does not
    leak through broken outlines.
4.  Connected-component labelling (flood fill) of everything that is not a
    wall -> every enclosed area becomes its own region.
5.  Tiny specks are merged away, then every pixel gets the label of its
    nearest region (Euclidean distance transform) so anti-aliased edges blend.
6.  Region-adjacency graph + greedy graph colouring from a deep neon palette,
    so neighbouring areas across an outline never share a colour.
7.  Each region is classified:
      * flat area (low texture)  -> solid spray-paint fill with an analogous
                                    two-tone fade (pink->magenta, cyan->teal ...)
      * textured / photographic  -> neon gradient map (indigo -> blue -> cyan
                                    or indigo -> violet -> pink) on luminance
      * background               -> deep indigo/violet fade
8.  Shading never goes grey or white: shadows sink into deep saturated indigo
    (like real mural photos), lights stay at full paint colour. A final
    saturation push keeps everything rich.
9.  Black / near-black pixels are NEVER coloured: they are copied from the
    original exactly. A short soft ramp above the threshold keeps outlines
    anti-aliased.
10. Output has exactly the same width and height as the input. No resizing,
    cropping or resampling happens anywhere.

Requirements
------------
    pip install numpy pillow scipy

Usage
-----
    python neon_graffiti_colorizer.py input.jpg
    python neon_graffiti_colorizer.py input.png -o output.png
    python neon_graffiti_colorizer.py input.png --seed 42
    python neon_graffiti_colorizer.py input.png --bg none          # neon background too
    python neon_graffiti_colorizer.py input.png --depth 0.9        # even deeper shadows

Run with -h to see every option.
"""

import argparse
import os
import sys
import time

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


# ---------------------------------------------------------------------------
# Deep neon graffiti palette (measured from mural street-art photos:
# fully saturated, never pastel)
# ---------------------------------------------------------------------------
DEFAULT_PALETTE = [
    "#FF1FCB",  # 0 neon magenta-pink (cool pink, no orange in it)
    "#B5148A",  # 1 deep magenta
    "#3CCBEA",  # 2 neon cyan
    "#2240D8",  # 3 electric blue
    "#F7E51C",  # 4 electric yellow (only warm colour)
    "#1ECFA0",  # 5 mint / teal-green
    "#7A2BE0",  # 6 violet
    "#E040FB",  # 7 neon orchid (purple-pink)
    "#CC14FF",  # 8 neon purple
    "#5B2BFF",  # 9 ultraviolet (blue-purple)
]
# Fade partner for each colour, so fades stay cool and analogous
DEFAULT_PARTNER = [7, 8, 5, 9, 5, 2, 9, 8, 6, 3]

# Deep saturated shadow ink: shadows sink into this instead of grey/black
SHADOW_INK = "#140733"

# Background fade (deep urban indigo -> violet)
DEFAULT_BG = ("#120A4A", "#5A1AA8")

# Neon gradient maps for textured / photographic regions (luminance -> colour)
COOL_MAP = [(0.00, "#05030C"), (0.12, "#120630"), (0.26, "#2A0F55"), (0.40, "#2B2F9E"),
            (0.55, "#2456D6"), (0.70, "#3FB4DE"), (0.85, "#8BE2F6"), (1.00, "#F2FAFF")]
WARM_MAP = [(0.00, "#05030C"), (0.12, "#1A0636"), (0.26, "#3E0F5E"), (0.40, "#6A1890"),
            (0.55, "#A01E9A"), (0.70, "#E0288A"), (0.85, "#FF6FA8"), (1.00, "#FFE0EE")]


def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"Bad hex colour: {h!r}")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def build_map(stops):
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    cs = np.array([hex_to_rgb(s[1]) for s in stops], dtype=np.float32)
    return xs, cs


def apply_map(lum, cmap):
    xs, cs = cmap
    return np.stack([np.interp(lum, xs, cs[:, k]) for k in range(3)], axis=-1).astype(np.float32)


# ---------------------------------------------------------------------------
# Loading / saving (resolution is never touched)
# ---------------------------------------------------------------------------
def load_image(path):
    """Return (original_rgb uint8 HxWx3, gray float32 HxW in 0..255, alpha or None, PIL info)."""
    img = Image.open(path)
    img.load()
    info = dict(img.info)

    alpha = None
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        alpha = np.asarray(img.convert("RGBA"))[..., 3].copy()

    if img.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        arr = np.asarray(img).astype(np.float64)
        if img.mode == "F":
            lo, hi = float(arr.min()), float(arr.max())
            arr = (arr - lo) / (hi - lo if hi > lo else 1.0) * 255.0
        elif arr.max() > 255:
            arr = arr / 257.0
        gray = np.clip(arr, 0, 255).astype(np.float32)
        orig_rgb = np.repeat(np.round(gray).astype(np.uint8)[..., None], 3, axis=2)
    else:
        orig_rgb = np.asarray(img.convert("RGB")).copy()
        f = orig_rgb.astype(np.float32)
        gray = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]

    return orig_rgb, gray, alpha, info


def save_image(path, rgb, alpha, info):
    if alpha is not None:
        out = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
        if os.path.splitext(path)[1].lower() in (".jpg", ".jpeg"):
            out = out.convert("RGB")
    else:
        out = Image.fromarray(rgb, "RGB")

    kwargs = {}
    if "dpi" in info:
        kwargs["dpi"] = info["dpi"]
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        kwargs.update(quality=97, subsampling=0, optimize=True)
    elif ext == ".png":
        kwargs.update(compress_level=6)
    out.save(path, **kwargs)
    return out.size


# ---------------------------------------------------------------------------
# Outline / edge detection
# ---------------------------------------------------------------------------
def detect_walls(gray, black_thr, edge_thr, edge_sigma, adaptive_delta, adaptive_sigma):
    dark = gray <= black_thr

    if adaptive_delta > 0:
        local_mean = ndi.gaussian_filter(gray, adaptive_sigma)
        adaptive = (gray < local_mean - adaptive_delta) & (gray < 140)
    else:
        adaptive = np.zeros_like(dark)

    if edge_thr > 0:
        sm = ndi.gaussian_filter(gray, edge_sigma)
        mag = np.hypot(ndi.sobel(sm, axis=1), ndi.sobel(sm, axis=0))
        ref = np.percentile(mag, 99.5)
        edges = (mag / ref) > edge_thr if ref > 1e-6 else np.zeros_like(dark)
    else:
        edges = np.zeros_like(dark)

    return dark | adaptive | edges, dark


# ---------------------------------------------------------------------------
# Regions
# ---------------------------------------------------------------------------
def build_regions(walls, gap_close, min_area):
    barrier = ndi.binary_dilation(walls, iterations=gap_close) if gap_close > 0 else walls

    labels, n = ndi.label(~barrier)  # 4-connectivity
    if n == 0:
        return None, 0, None

    sizes = np.bincount(labels.ravel())
    keep = sizes >= min_area
    keep[0] = False
    if not keep[1:].any():
        keep[np.argmax(sizes[1:]) + 1] = True

    remap = np.zeros(n + 1, dtype=np.int32)
    remap[keep] = np.arange(1, int(keep.sum()) + 1, dtype=np.int32)
    labels = remap[labels]
    n = int(keep.sum())

    idx = ndi.distance_transform_edt(labels == 0, return_distances=False, return_indices=True)
    full = labels[idx[0], idx[1]]
    del idx

    sizes = np.bincount(labels.ravel(), minlength=n + 1).astype(np.int64)
    sizes[0] = 0
    return full, n, sizes


def region_adjacency(full, n):
    base = np.int64(n + 1)
    keys = []
    for a, b in ((full[:, :-1], full[:, 1:]), (full[:-1, :], full[1:, :])):
        m = a != b
        if m.any():
            pa = a[m].astype(np.int64)
            pb = b[m].astype(np.int64)
            keys.append(np.minimum(pa, pb) * base + np.maximum(pa, pb))
    adj = [set() for _ in range(n + 1)]
    if keys:
        uk = np.unique(np.concatenate(keys))
        for lo, hi in zip((uk // base).tolist(), (uk % base).tolist()):
            adj[lo].add(hi)
            adj[hi].add(lo)
    return adj


def region_stats(gray, full, n):
    flat = full.ravel()
    g = gray.ravel().astype(np.float64)
    cnt = np.bincount(flat, minlength=n + 1)
    s1 = np.bincount(flat, weights=g, minlength=n + 1)
    s2 = np.bincount(flat, weights=g * g, minlength=n + 1)
    c = np.maximum(cnt, 1)
    mean = np.where(cnt > 0, s1 / c, 128.0)
    std = np.sqrt(np.maximum(s2 / c - mean ** 2, 0.0))
    return mean.astype(np.float32), std.astype(np.float32)


# ---------------------------------------------------------------------------
# Colour assignment
# ---------------------------------------------------------------------------
def find_background(full, sizes, frac):
    border = np.unique(np.concatenate([full[0], full[-1], full[:, 0], full[:, -1]]))
    border = border[border > 0]
    if border.size == 0:
        return 0
    best = border[np.argmax(sizes[border])]
    return int(best) if sizes[best] >= frac * full.size else 0


def assign_colours(n, sizes, adj, P, partner, rng, skip):
    """Greedy graph colouring: neighbours never share a colour when avoidable."""
    primary = np.zeros(n + 1, dtype=np.int32)
    usage = np.zeros(P, dtype=np.float64)
    assigned = np.zeros(n + 1, dtype=bool)

    order = np.argsort(-sizes[1:], kind="stable") + 1
    for r in order:
        if skip[r]:
            continue
        forbidden = {primary[nb] for nb in adj[r] if assigned[nb]}
        cands = [c for c in range(P) if c not in forbidden] or list(range(P))
        scores = [usage[c] + rng.random() * 0.9 for c in cands]
        c = cands[int(np.argmin(scores))]
        primary[r] = c
        usage[c] += 1.0
        assigned[r] = True

    secondary = np.array([partner[c] for c in primary], dtype=np.int32)
    return primary, secondary


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
MODE_PAINT, MODE_COOL, MODE_WARM = 0, 1, 2


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def render(orig_rgb, gray, full, n, sizes, mean_g, mode, c1, c2, strength, rng,
           detail, depth, saturation, black_thr, black_soft, chunk_rows=1024):
    H, W = gray.shape
    ids = np.arange(n + 1)
    ink = np.asarray(hex_to_rgb(SHADOW_INK), dtype=np.float32)
    cool, warm = build_map(COOL_MAP), build_map(WARM_MAP)

    # Per-region gradient direction and extent
    ang = rng.uniform(0, 2 * np.pi, n + 1).astype(np.float32)
    ca, sa = np.cos(ang), np.sin(ang)
    yy, xx = np.indices((H, W), dtype=np.float32)
    proj = xx * ca[full] + yy * sa[full]
    del yy, xx
    pmin = np.asarray(ndi.minimum(proj, full, ids), dtype=np.float32)
    pmax = np.asarray(ndi.maximum(proj, full, ids), dtype=np.float32)
    pmin = np.nan_to_num(pmin)
    span = np.maximum(np.nan_to_num(pmax) - pmin, 1.0)

    # How much paint vs. shadow a region gets overall: darker originals -> deeper
    base = 1.0 - depth * (1.0 - smoothstep((mean_g - 20.0) / 140.0)) * 0.55
    base = base.astype(np.float32)

    out = np.empty((H, W, 3), dtype=np.uint8)
    for y0 in range(0, H, chunk_rows):
        y1 = min(H, y0 + chunk_rows)
        L = full[y0:y1]
        g = gray[y0:y1]
        lum = g / 255.0
        m = mode[L]

        # ---- flat paint: analogous spray fade, shadows sink into deep ink ----
        t = smoothstep((proj[y0:y1] - pmin[L]) / span[L]) * strength[L]
        paint = c1[L] * (1.0 - t)[..., None] + c2[L] * t[..., None]

        tone = (g + 10.0) / (mean_g[L] + 10.0)
        tone = 1.0 + detail * (tone - 1.0)
        k = base[L] * tone
        kd = smoothstep(np.clip(k, 0.0, 1.0))[..., None]
        col = ink * (1.0 - kd) + paint * kd
        # brighter-than-average spots: a touch lighter, still saturated
        lift = (np.clip(k - 1.0, 0.0, 0.35) / 0.35 * 0.18)[..., None]
        col = col + (255.0 - col) * lift

        # ---- textured / photographic regions: neon gradient maps ----
        if (m == MODE_COOL).any():
            sel = m == MODE_COOL
            col[sel] = apply_map(lum[sel], cool)
        if (m == MODE_WARM).any():
            sel = m == MODE_WARM
            col[sel] = apply_map(lum[sel], warm)

        # ---- richness: push secondary channels down (more saturated, never pastel) ----
        if saturation != 1.0:
            mx = col.max(axis=2, keepdims=True)
            col = mx - (mx - col) * saturation
        col = np.clip(col, 0, 255)

        # ---- black protection ----
        a = smoothstep((g - black_thr) / max(black_soft, 1e-6))[..., None]
        o = orig_rgb[y0:y1].astype(np.float32)
        mixed = np.round(o * (1.0 - a) + col * a).astype(np.uint8)
        untouched = g <= black_thr
        mixed[untouched] = orig_rgb[y0:y1][untouched]
        out[y0:y1] = mixed

    return out


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def colorize(path_in, path_out, args):
    t0 = time.time()
    orig_rgb, gray, alpha, info = load_image(path_in)
    H, W = gray.shape
    print(f"[1/6] Loaded {path_in}  ({W} x {H})")

    if args.palette:
        palette = [hex_to_rgb(h) for h in args.palette.split(",") if h.strip()]
        partner = [(i + 1) % len(palette) for i in range(len(palette))]
    else:
        palette = [hex_to_rgb(h) for h in DEFAULT_PALETTE]
        partner = DEFAULT_PARTNER
    if len(palette) < 2:
        sys.exit("Palette needs at least 2 colours.")
    pal = np.asarray(palette, dtype=np.float32)

    walls, dark = detect_walls(gray, args.black, args.edge, args.edge_sigma,
                               args.adaptive, args.adaptive_sigma)
    print(f"[2/6] Outlines: {dark.mean() * 100:.1f}% near-black (kept), {walls.mean() * 100:.1f}% walls")

    min_area = args.min_region if args.min_region > 0 else max(25, int(H * W * 0.00003))
    full, n, sizes = build_regions(walls, args.gap, min_area)
    if n == 0:
        print("Image is entirely outline/black - nothing to fill. Writing original.")
        save_image(path_out, orig_rgb, alpha, info)
        return
    print(f"[3/6] Regions found: {n}")

    adj = region_adjacency(full, n)
    mean_g, std_g = region_stats(gray, full, n)
    rng = np.random.default_rng(args.seed)
    grad_min_area = max(min_area * 4, int(H * W * 0.002))

    # ---- classify regions ----
    mode = np.zeros(n + 1, dtype=np.int32)
    textured = (std_g >= args.photo_std) & (sizes >= grad_min_area)
    textured[0] = False
    for r in np.nonzero(textured)[0]:
        # bright textured areas (skies, light walls) read best cool; darker ones alternate
        if mean_g[r] > 140:
            mode[r] = MODE_COOL
        else:
            mode[r] = MODE_COOL if rng.random() < 0.5 else MODE_WARM

    bg_id = 0
    if args.bg.lower() != "none":
        bg_id = find_background(full, sizes, args.bg_frac)
        if bg_id and textured[bg_id]:
            mode[bg_id] = MODE_COOL  # photographic backdrop -> cool urban map
    print(f"[4/6] {int(textured.sum())} textured region(s) get neon gradient maps; "
          f"background: {'yes' if bg_id else 'none'}")

    skip = mode != MODE_PAINT
    if bg_id:
        skip = skip.copy()
        skip[bg_id] = True
    primary, secondary = assign_colours(n, sizes, adj, len(palette), partner, rng, skip)

    c1 = pal[primary].copy()
    c2 = pal[secondary].copy()
    strength = np.where(sizes >= grad_min_area, args.gradient, args.gradient * 0.5).astype(np.float32)
    if bg_id and mode[bg_id] == MODE_PAINT:
        if args.bg.lower() == "auto":
            bgc = [hex_to_rgb(h) for h in DEFAULT_BG]
        else:
            parts = [p for p in args.bg.split(",") if p.strip()]
            bgc = [hex_to_rgb(parts[0]), hex_to_rgb(parts[-1])]
        c1[bg_id], c2[bg_id] = bgc[0], bgc[1]
        strength[bg_id] = 1.0
    print("[5/6] Colours assigned (neighbours kept distinct)")

    out = render(orig_rgb, gray, full, n, sizes, mean_g, mode, c1, c2, strength, rng,
                 args.detail, args.depth, args.saturation, args.black, args.black_soft)

    assert out.shape[:2] == (H, W), "Resolution changed - this should never happen"
    size = save_image(path_out, out, alpha, info)
    print(f"[6/6] Saved {path_out}  ({size[0]} x {size[1]})  in {time.time() - t0:.1f}s")


def parse_args():
    p = argparse.ArgumentParser(
        description="Algorithmic deep-neon graffiti colorizer for grayscale / B&W images (no AI).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    p.add_argument("input", help="input image (any format Pillow can read)")
    p.add_argument("-o", "--output", help="output path (default: <input>_neon.png)")
    p.add_argument("--seed", type=int, default=7, help="change for a different colour layout")
    p.add_argument("--black", type=float, default=35.0,
                   help="luminance (0-255) at or below which pixels are black ink and never coloured")
    p.add_argument("--black-soft", type=float, default=20.0,
                   help="soft ramp above --black for anti-aliased outlines")
    p.add_argument("--edge", type=float, default=0.30,
                   help="Sobel edge threshold; lower = more regions, 0 = off")
    p.add_argument("--edge-sigma", type=float, default=1.2, help="blur before edge detection")
    p.add_argument("--adaptive", type=float, default=25.0,
                   help="adaptive dark-stroke detection strength; 0 = off")
    p.add_argument("--adaptive-sigma", type=float, default=12.0, help="neighbourhood for adaptive detection")
    p.add_argument("--gap", type=int, default=1, help="pixels of outline gap closing (stops colour leaks)")
    p.add_argument("--min-region", type=int, default=0, help="merge regions smaller than this (0 = auto)")
    p.add_argument("--gradient", type=float, default=0.6,
                   help="analogous spray-fade strength inside regions (0 = flat fills)")
    p.add_argument("--detail", type=float, default=0.8,
                   help="how much original shading is kept (as deep-ink shadows)")
    p.add_argument("--depth", type=float, default=0.7,
                   help="how far darker originals sink into deep indigo (0 = all full paint)")
    p.add_argument("--saturation", type=float, default=1.15,
                   help="final richness push (1 = off)")
    p.add_argument("--photo-std", type=float, default=26.0,
                   help="regions with more texture than this get neon gradient maps instead of flat paint")
    p.add_argument("--bg", default="auto",
                   help="'auto' (deep indigo fade), 'none', or two hex colours '#101040,#5a1fa0'")
    p.add_argument("--bg-frac", type=float, default=0.15,
                   help="min image fraction for a border region to count as background")
    p.add_argument("--palette", default="", help="comma-separated hex colours to override the palette")
    return p.parse_args()


def main():
    args = parse_args()
    if not os.path.isfile(args.input):
        sys.exit(f"Input not found: {args.input}")
    out = args.output or os.path.splitext(args.input)[0] + "_neon.png"
    colorize(args.input, out, args)


if __name__ == "__main__":
    main()
