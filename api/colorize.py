"""
Vercel Python serverless function:  POST /api/colorize

Body:   the raw image bytes (any format Pillow can read), Content-Type image/*
Query:  optional tuning, all clamped to safe ranges
          seed        int      colour layout            (default 7)
          style       auto | flat                       (default auto)
                       flat  = every region gets solid spray paint
                       auto  = textured areas get neon gradient maps
          bg          auto | none                       (default auto)
          depth       0 .. 1.2                          (default 0.7)
          saturation  1 .. 1.6                          (default 1.15)
          gradient    0 .. 1                            (default 0.6)

Response: the colorized image, same width and height as the input.
          PNG when it fits under the platform response limit, otherwise a
          high-quality JPEG (same pixels dimensions, never resized).

The colorizer itself lives untouched in lib/neon_graffiti_colorizer.py.
"""

import io
import json
import os
import sys
import tempfile
import uuid
from argparse import Namespace
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "lib"))

from PIL import Image, UnidentifiedImageError  # noqa: E402

import neon_graffiti_colorizer as ngc  # noqa: E402

MAX_UPLOAD = int(4.4 * 1024 * 1024)      # Vercel request body limit is 4.5 MB
MAX_RESPONSE = int(4.3 * 1024 * 1024)    # Vercel response body limit is 4.5 MB
MAX_PIXELS = 24_000_000                  # keeps memory inside the function limit


def _num(q, key, default, lo, hi, cast=float):
    try:
        v = cast(q.get(key, [default])[0])
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


def build_args(query):
    q = parse_qs(query)
    style = q.get("style", ["auto"])[0].lower()
    bg = q.get("bg", ["auto"])[0].lower()
    return Namespace(
        seed=_num(q, "seed", 7, 0, 2**31 - 1, int),
        black=35.0, black_soft=20.0,
        edge=0.30, edge_sigma=1.2,
        adaptive=25.0, adaptive_sigma=12.0,
        gap=1, min_region=0,
        gradient=_num(q, "gradient", 0.6, 0.0, 1.0),
        detail=0.8,
        depth=_num(q, "depth", 0.7, 0.0, 1.2),
        saturation=_num(q, "saturation", 1.15, 1.0, 1.6),
        photo_std=90.0 if style == "flat" else 26.0,
        bg="none" if bg == "none" else "auto",
        bg_frac=0.15,
        palette="",
    )


def colorize_bytes(data, query=""):
    """Run the colorizer on raw image bytes. Returns (bytes, mime, (w, h))."""
    with Image.open(io.BytesIO(data)) as probe:
        w, h = probe.size
        if w * h > MAX_PIXELS:
            raise ValueError(f"Image is {w}x{h}; please keep it under {MAX_PIXELS // 1_000_000} megapixels.")
        probe.verify()

    tmp = tempfile.gettempdir()
    uid = uuid.uuid4().hex
    src = os.path.join(tmp, f"in_{uid}")
    dst = os.path.join(tmp, f"out_{uid}.png")
    try:
        with open(src, "wb") as f:
            f.write(data)
        ngc.colorize(src, dst, build_args(query))
        with open(dst, "rb") as f:
            out = f.read()
        mime = "image/png"
        if len(out) > MAX_RESPONSE:
            # same pixels, smaller container: high-quality JPEG
            with Image.open(io.BytesIO(out)) as im:
                rgb = im.convert("RGB")
                for q in (95, 90, 85, 80, 72):
                    buf = io.BytesIO()
                    rgb.save(buf, "JPEG", quality=q, subsampling=0 if q >= 90 else 2, optimize=True)
                    if buf.tell() <= MAX_RESPONSE:
                        break
                out, mime = buf.getvalue(), "image/jpeg"
        return out, mime, (w, h)
    finally:
        for p in (src, dst):
            try:
                os.remove(p)
            except OSError:
                pass


class handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._json(200, {"ok": True, "usage": "POST raw image bytes to /api/colorize"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._json(400, {"error": "Send an image in the request body."})
        if length > MAX_UPLOAD:
            return self._json(413, {"error": "Image is too large. Please keep uploads under 4.4 MB."})

        data = self.rfile.read(length)
        try:
            out, mime, (w, h) = colorize_bytes(data, urlparse(self.path).query)
        except Image.DecompressionBombError:
            return self._json(400, {"error": "That image has too many pixels to paint here."})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except (UnidentifiedImageError, SyntaxError, OSError):
            return self._json(415, {"error": "That file could not be read as an image."})
        except Exception as e:  # anything inside the colorizer
            print("colorize failed:", repr(e))
            return self._json(500, {"error": "Something went wrong while painting. Try another image."})

        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(out)))
        self.send_header("X-Image-Size", f"{w}x{h}")
        self.send_header("Access-Control-Expose-Headers", "X-Image-Size")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(out)
