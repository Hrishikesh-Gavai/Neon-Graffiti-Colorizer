# <img src="https://api.iconify.design/tabler/spray.svg?color=%23FF1FCB" width="30"/> Neon Graffiti

Turns grayscale and black-and-white images into deep neon street-art paintings using classic image processing. No AI, no trained models. Black linework is preserved, and the output retains the original image dimensions.

Upload an image, customize the available settings, and compare the original and neon-colored result with an interactive before-and-after slider.

## <img src="https://api.iconify.design/tabler/photo.svg?color=%233CCBEA" width="22"/> Before / After

| Before | After |
|:---:|:---:|
| <img src="example/1.jpg" width="420"/> | <img src="example/1_neon.png" width="420"/> |

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

## <img src="https://api.iconify.design/tabler/settings.svg?color=%231ECFA0" width="22"/> How It Works

1. <img src="https://api.iconify.design/tabler/pencil.svg?color=%23FF1FCB" width="16"/> **Detect outlines:** Identifies dark linework and image edges using classic image-processing techniques.
2. <img src="https://api.iconify.design/tabler/wall.svg?color=%23E040FB" width="16"/> **Close gaps:** Seals small gaps in outlines to reduce color leakage.
3. <img src="https://api.iconify.design/tabler/puzzle.svg?color=%23CC14FF" width="16"/> **Find shapes:** Uses connected-component labeling to identify separate image regions.
4. <img src="https://api.iconify.design/tabler/target.svg?color=%235B2BFF" width="16"/> **Assign colors:** Distributes neon colors across regions for a varied composition.
5. <img src="https://api.iconify.design/tabler/brush.svg?color=%233CCBEA" width="16"/> **Paint:** Applies color fills and gradients to create the neon street-art effect.
6. <img src="https://api.iconify.design/tabler/shield.svg?color=%231ECFA0" width="16"/> **Protect black:** Preserves dark linework to maintain the original illustration's definition.

## <img src="https://api.iconify.design/tabler/device-gamepad-2.svg?color=%23FF1FCB" width="22"/> Spray Defender

A retro arcade shooter built into the website, featuring marching enemy formations, diving enemies, destructible bunkers, power-ups, boss encounters, synthesized chiptune audio, and browser-saved high scores.

Play using the keyboard, on-screen touch controls, or a compatible gamepad.

## <img src="https://api.iconify.design/tabler/code.svg?color=%233CCBEA" width="22"/> Tech Stack

- **Python:** Image-processing backend and utilities.
- **NumPy, SciPy, Pillow:** Pixel manipulation and image processing.
- **JavaScript, HTML, CSS:** Website interface and interactions.
- **Swiper:** Hero carousel.
- **img-comparison-slider:** Before-and-after comparison.
- **Canvas API and Web Audio API:** Arcade game rendering and audio.
