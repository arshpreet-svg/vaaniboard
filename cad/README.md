# VaaniBoard v2 CAD

Parametric model built with CadQuery (Python) and rendered in Blender. Every dimension is a named parameter at the top of `vaaniboard_cad.py`.

## Files
| Folder | What | Use it for |
|---|---|---|
| `step/VaaniBoard_v2_assembly.step` | Full coloured assembly (35 bodies) | Import into **Fusion 360 / Onshape** |
| `step/*.step` | Each printed part | Editing, printing |
| `stl/*.stl` | Every part, in assembled position | 3D printing (housing_top, base_plate, battery_door, bezels, keycaps_*, access_switch_*, badge_case) |
| `dxf/keyguard_3mm_acrylic.dxf` | Keyguard outline, 1:1 | Laser cutting, 3 mm clear acrylic |
| `renders/` | hero, hero_board (no badge), exploded, cutaway, top, rear | Stage 2 deck, CAD slide |
| `drawings/VaaniBoard_v2_GA_drawing.pdf` | A3 dimensioned drawing (top, side and rear views) | "Dimensions" requirement |

## Rebuild
```
python3.12 -m venv .venv && .venv/bin/pip install cadquery matplotlib
.venv/bin/python vaaniboard_cad.py          # STEP, STL, DXF
.venv/bin/python drawing_sheet.py           # A3 drawing
/Applications/Blender.app/Contents/MacOS/Blender -b -P render_blender.py -- hero hero_board exploded cutaway top rear
```

## Design changes from the early concept
- **Footprint 240 × 250 mm**, height 40 → 84 mm at 10° (it was "≈ 250 × 250 × 55"). Inside height has to fit 30 mm arcade buttons, and the width fits a 256 mm print bed.
- **The picture is on the key:** each 40 mm keycap holds a 34 mm laminated picture disc under a clear lens. So the keyguard holes become **Ø44** (they were 36), and vocabulary is swapped by changing the discs.
- **Translucent bezels** with a WS2812B under each one, so the whole key glows when the board highlights it.
- Keycap colours follow the Fitzgerald key: yellow people, green actions, orange things, pink urgent/social.

## Before printing
- Measure your real arcade buttons (snap-in hole, plunger diameter) and update `BTN_HOLE` and the keycap socket (Ø24.4) in `vaaniboard_cad.py`.
- Print one test key cell first to check the button fit before the 15-20 h housing print.

Renders in `renders/` are AI-generated from this model and are labelled as such wherever they are used.
