# VaaniBoard

An offline, personalized AAC (augmentative and alternative communication) board for non-verbal and minimally verbal children. Each key speaks a word in the child's home language, in a voice recorded by their teacher or parent. Optional on-device listening lights the likely answers to a teacher's question. The board never needs internet, an app or a phone.

Vishwakarma Awards 2026-27 · Assistive Solutions · Application ID **VK26-IITI-AS-0216**
Team: Arshpreet Sukhdeep Singh Dhillon, Payal Priyadarshini Sahoo, Anusha Sharma

## Design principles
- **Communication always works.** The core row (Yes, No, Help, Stop) is never highlighted, dimmed or remapped.
- **Listening only assists.** A key lights only after two confident keyword results in a row. Highlights never speak, they fade after 10 s, and every key stays selectable.
- **Access for any body.** Direct press, or switch scanning with one big switch (lit keys first, then the core row).
- **Personal.** Per-child profiles (language, access method, hold time, scan speed) and familiar recorded voices.

## Repository
| Folder | What |
|---|---|
| `firmware/board/` | ESP32 firmware (PlatformIO, Arduino framework) for the breadboard prototype |
| `firmware/board/data/` | Voice clips uploaded to the board's flash (`<lang>/NN.wav`) |
| `studio/` | VaaniBoard Studio: offline caregiver web app (Next.js, Web Serial over USB) |
| `cad/` | Parametric CadQuery model, STEP/STL parts, keyguard DXF, A3 drawing, renders |
| `docs/BUILD_GUIDE.md` | How to wire, flash and run everything |

## Quick start
```bash
# Firmware (VS Code + PlatformIO, board plugged in by USB)
cd firmware/board
pio run -e esp32dev -t upload && pio device monitor

# Studio (Chrome or Edge)
cd studio
npm install
npm run dev        # open http://localhost:3000
```

Full instructions: [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md).

## Status (Stage 2, October 2026)
Breadboard prototype on a classic ESP32 DevKit: core row, switch scanning, profiles, caregiver mode, event log, voice playback through the DAC. The listening model (INMP441 mic + Edge Impulse) and the 16-key board (MCP23017, MAX98357A, WS2812B, 3D-printed housing) are next; see the roadmap in the Stage 2 deck. All performance figures are design targets until measured in Stage 3.
