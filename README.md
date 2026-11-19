# Focal

A photo coach that runs entirely in your browser. Drop in a photo and Focal checks the framing, light, sharpness, colour and camera settings, then draws what to fix right on the picture.

**Live site:** https://devadd2105-max.github.io/Focal/

**Your photo never leaves the page.** It is decoded and analysed locally. There is no server, no upload and no storage.

## What it checks

- **Framing:** rule of thirds, golden ratio, diagonals, centred subjects, rule of odds, leading lines and vanishing point, symmetry, reflections, frame within a frame, negative space, fill the frame, layers, repetition, isolation, headroom, Dutch angle, silhouette, low and high key, colour harmony, monochrome.
- **Impact (what makes a photo work):** how clearly the subject separates from its background, clutter, distractions at the frame edge, scattered bright highlights, the direction and hardness of the light, colour harmony and palette, depth and structure. The overall score is half fault-free technique and half impact, so a clean but plain picture no longer scores near the top. Night and low-key scenes with bright accents are not called underexposed.
- **Technical:** horizon tilt, leaning verticals, exposure, histogram, clipped highlights and shadows, contrast, sharpness against noise, colour cast, saturation.
- **Camera settings:** read from EXIF or typed in. Checks the exposure triangle (aperture, shutter, ISO), the 1/focal-length shake rule, diffraction, white balance mode, exposure compensation and flash, and suggests equivalent exposures.
- **Teaching:** names the histogram shape (balanced, underexposed, overexposed, dull, high-contrast, low-key), starting settings by situation, shooting and metering modes, white-balance presets, and questions that train the eye.
- **Crops and straighten:** tested crop suggestions with a preview, and a one-click straighten that crops to the largest clean rectangle.
- **Your goal:** say what you are trying to achieve (free text or chips). Findings are re-weighted and some "faults" are marked as deliberate, such as crushed shadows in a silhouette.

Every finding is labelled **measured** (read from pixels) or **estimate** (a rule of thumb that can be wrong).

## Limits

Focal is a rule engine with image maths, not a model. It reads your goal by matching keywords. It cannot judge emotion, story, originality, S-curves, juxtaposition or scale, so a low score does not mean a bad photograph.

## Run it

No build step.

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Run the tests with `node --test tests/*.test.mjs` (Node 20 or later).

## How it is built

Plain ES modules. `js/analyze.js` measures a photo, `js/geometry.js` finds lines, symmetry and space, `js/checks.js` turns measurements into findings and scores, `js/intent.js` reads goals, `js/settings.js` handles camera settings, `js/crops.js` suggests crops, `js/app.js` and `js/overlay.js` are the interface. Images are `{ w, h, data }` RGBA objects so the same code runs in the browser and in the tests.

## Licence

MIT. See `LICENSE`.
