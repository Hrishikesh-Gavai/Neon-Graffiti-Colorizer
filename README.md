# <img src="https://api.iconify.design/tabler/spray.svg?color=%23FF1FCB" width="30"/> Neon Graffiti Colorizer

Turns grayscale and black-and-white images into neon graffiti art, pixel by pixel. No AI, just image processing. Black linework is never touched, and the output keeps the exact resolution of the input.

## <img src="https://api.iconify.design/tabler/photo.svg?color=%233CCBEA" width="22"/> Before / After

| Before | After |
|:---:|:---:|
| <img src="1.jpg" width="420"/> | <img src="1_neon.png" width="420"/> |
| <img src="2.jpg" width="420"/> | <img src="2_neon.png" width="420"/> |

## <img src="https://api.iconify.design/tabler/palette.svg?color=%23CC14FF" width="22"/> Colors

![](https://img.shields.io/badge/FF1FCB-FF1FCB?style=flat-square)
![](https://img.shields.io/badge/B5148A-B5148A?style=flat-square)
![](https://img.shields.io/badge/E040FB-E040FB?style=flat-square)
![](https://img.shields.io/badge/CC14FF-CC14FF?style=flat-square)
![](https://img.shields.io/badge/7A2BE0-7A2BE0?style=flat-square)
![](https://img.shields.io/badge/5B2BFF-5B2BFF?style=flat-square)
![](https://img.shields.io/badge/2240D8-2240D8?style=flat-square)
![](https://img.shields.io/badge/3CCBEA-3CCBEA?style=flat-square)
![](https://img.shields.io/badge/1ECFA0-1ECFA0?style=flat-square)
![](https://img.shields.io/badge/F7E51C-F7E51C?style=flat-square)

## <img src="https://api.iconify.design/tabler/rocket.svg?color=%23F7E51C" width="22"/> Quick Start

```bash
pip install numpy pillow scipy
python neon_graffiti_colorizer.py input.jpg
```

The result is saved as `input_neon.png`.

| Option | Effect |
|---|---|
| `-o out.png` | Custom output name |
| `--seed 42` | Different color layout |
| `--black 20` | Color more of the dark areas |
| `--gradient 0` | Flat fills, no fades |
| `--bg none` | Color the background neon too |

## <img src="https://api.iconify.design/tabler/settings.svg?color=%231ECFA0" width="22"/> How It Works

1. <img src="https://api.iconify.design/tabler/pencil.svg?color=%23FF1FCB" width="16"/> **Detect outlines:** near-black pixels, adaptive dark strokes, and Sobel edges.
2. <img src="https://api.iconify.design/tabler/wall.svg?color=%23E040FB" width="16"/> **Close gaps:** broken outlines are sealed so color can't leak.
3. <img src="https://api.iconify.design/tabler/puzzle.svg?color=%23CC14FF" width="16"/> **Find shapes:** connected-component labelling splits the image into regions.
4. <img src="https://api.iconify.design/tabler/target.svg?color=%235B2BFF" width="16"/> **Assign colors:** graph coloring ensures neighboring shapes never share a color.
5. <img src="https://api.iconify.design/tabler/brush.svg?color=%233CCBEA" width="16"/> **Paint:** solid fills with subtle fades; textured areas get neon gradient maps.
6. <img src="https://api.iconify.design/tabler/shield.svg?color=%231ECFA0" width="16"/> **Protect black:** near-black pixels are copied from the original unchanged.
