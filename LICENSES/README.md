# Licensing

VaaniBoard mixes software, a hardware design and documentation, so each part has the licence that fits it. Copyright © 2026 Arshpreet Sukhdeep Singh Dhillon, Payal Priyadarshini Sahoo, Anusha Sharma.

| Part | Paths | Licence | Text |
|---|---|---|---|
| Software | `firmware/`, `studio/`, `tools/`, `tests/`, `cad/*.py` (CadQuery and Blender scripts) | MIT | [`../LICENSE`](../LICENSE) |
| Hardware design | `cad/step/`, `cad/stl/`, `cad/dxf/`, `cad/render/parts.json` | CERN-OHL-P-2.0 (permissive) | [`CERN-OHL-P-2.0.txt`](CERN-OHL-P-2.0.txt) |
| Documentation and drawings | `README.md` files, `cad/drawings/` | CC BY 4.0 | [`CC-BY-4.0.txt`](CC-BY-4.0.txt) |
| Vocabulary data | `language-packs/` | CC BY 4.0 | [`CC-BY-4.0.txt`](CC-BY-4.0.txt) |
| Sample data | `sample-data/` | CC BY 4.0 (all fictional) | [`CC-BY-4.0.txt`](CC-BY-4.0.txt) |

The licence texts in this folder were downloaded unmodified from the official sources on 2026-10-25: CERN-OHL-P v2 from ohwr.org (CERN's Open Hardware Repository) and CC BY 4.0 legal code from creativecommons.org.

## Notes

- **Renders** in `cad/renders/` are AI-generated from the CAD model (see `cad/README.md`). They are shared under CC BY 4.0 as far as any copyright exists in them; label them as AI-generated wherever they are used.
- **No voice recordings are distributed.** `firmware/board/data/` holds only empty folders. Recordings a family or teacher makes belong to them and must not be committed.
- **Fonts and images:** Studio uses the operating system's fonts only; no font files are bundled.
- **The confidential response-loop design** described in the team's (unpublished) dossier is not part of this repository and is not licensed by it.

## Third-party components (not covered by the licences above)

| Component | Used by | Licence |
|---|---|---|
| ArduinoJson 7.2.1 (Benoît Blanchon) | firmware | MIT |
| LiquidCrystal_I2C 1.1.4 (marcoschwartz) | firmware | No licence file in the published package; widely redistributed with Arduino libraries. Check before commercial use |
| Arduino-ESP32 core, ESP-IDF (Espressif) | firmware | LGPL-2.1 / Apache-2.0 |
| Next.js 14.2.35, React 18.3.1 | Studio | MIT |
| Vitest, Testing Library, jsdom, ESLint | Studio (development only) | MIT |
| CadQuery, Blender | CAD rebuild (not distributed) | Apache-2.0, GPL-2.0+ |
