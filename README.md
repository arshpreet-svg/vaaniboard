# VaaniBoard

An offline, personalised AAC (augmentative and alternative communication) board for non-verbal and minimally verbal children. Each key speaks a word in the child's home language, in a voice recorded by their teacher or parent. Optional listening assistance lights the likely answers to a teacher's question. The board never needs internet, an app or a phone.

Vishwakarma Awards 2026-27 · Assistive Solutions · Application ID **VK26-IITI-AS-0216**
Team: Arshpreet Sukhdeep Singh Dhillon, Payal Priyadarshini Sahoo, Anusha Sharma

> **Status (October 2026, firmware 0.2.0 / Studio 0.2.0).** Breadboard prototype on a classic ESP32 DevKit plus the VaaniBoard Studio web app. Software is built and tested on a laptop and in CI (192 automated tests). **Firmware 0.2.0 has not yet been run on the physical board**: see [Current limitations](#21-current-limitations) and the hardware checklist in [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md#5-physical-hardware-validation-manual-not-yet-performed-for-firmware-020). Listening is simulated; there is no microphone or keyword model yet.

---

## 1. Overview
VaaniBoard is two things:
- **The board** (essential): ESP32 firmware that reads big keys, speaks words, shows them on an LCD and lights LEDs. It works on its own from a USB power bank.
- **VaaniBoard Studio** (optional): a web app on the teacher's laptop that sets the board up over the USB cable and shows what the child said. It includes a simulator, so it can be tried with no hardware.

## 2. Problem and solution
**Problem.** Children who cannot speak need to ask for water, say they are in pain, or refuse something. Commercial AAC devices are expensive, need tablets and internet, and rarely speak Hindi, Tamil or Bengali in a familiar voice.
**Solution.** A low-cost physical board with fixed, always-working Yes / No / Help / Stop keys and vocabulary keys that play recordings made by the child's own teacher or parent. Big-switch scanning serves children who cannot press small keys, and settings can be changed with a magnet, no laptop needed.

## 3. Key features (implemented)
| | Feature |
|---|---|
| Communication | Core row Yes / No / Help / Stop that is never highlighted, dimmed or remapped; 4- or 8-key builds; recorded voice per language, beep fallback |
| Safe input | 30 ms debounce, hold-to-speak 0-1000 ms, per-key repeat lockout, palm rejection (3+ keys ignored) |
| Access | Direct press, or switch scanning with one big switch (suggested keys first, then the core row) |
| Personal | Per-child profile (code, language, access, timings, volume capped at 80 %, listening on/off) saved on the board |
| Caregiver mode | Magnet on a hidden reed switch turns the keys into settings keys; ends on its own after 2 minutes |
| Listening assistance | A key lights only after two confident (≥ 0.8) keyword results in a row, fades after 10 s, never speaks or selects. **Simulated** in Studio for now |
| Studio | Dashboard, live board, profiles, vocabulary packs, voice clips, simulated listening, history + CSV, diagnostics, simulator |
| Accessibility (Studio) | Keyboard-only use, screen-reader labels and announcements, visible focus, high contrast, larger text, reduced motion |
| Multilingual | Hindi, Tamil, Bengali vocabulary from JSON language packs; add a language without code changes |

## 4. Target users and use cases
- **Children** aged roughly 3-12 who are non-verbal or minimally verbal (autism, cerebral palsy, apraxia), including those who need switch access.
- **Special educators and parents** who set the board up, record voices and review which words are used.
- Use cases: daily needs in class (water, food, toilet, pain); answering yes/no questions; asking for help or saying stop; recording which words a child uses so the vocabulary can be adjusted.

## 5. Architecture
```mermaid
flowchart LR
    child([Child]) --> board[Board: ESP32 firmware<br/>keys, LCD, LEDs, speaker]
    board --> child
    teacher([Teacher]) --> studio[Studio: static web app<br/>Chrome / Edge, offline]
    studio <-- "USB serial (optional)" --> board
    packs[(language-packs/*.json)] -- tools/vocab.mjs --> board
    packs -- tools/vocab.mjs --> studio
```
No backend, database server, cloud service or account is involved; the reasons are in [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) (ADR-1).

| Folder | What |
|---|---|
| `firmware/board/` | ESP32 firmware (PlatformIO, Arduino). `src/` hardware layer, `lib/vaani_core/` hardware-free logic, `test_host/` laptop tests, `data/` voice clips (not committed) |
| `studio/` | VaaniBoard Studio (Next.js 14 static export, React 18, Web Serial) with `test/` |
| `language-packs/` | Vocabulary source of truth: `keys.json` + one file per language |
| `tools/vocab.mjs` | Validates packs and generates the firmware and Studio vocabulary |
| `tests/vectors/` | Rule test cases shared by the firmware and simulator tests |
| `sample-data/` | Fictional profiles, demo events, example language packs |
| `cad/` | CadQuery model, STEP/STL, keyguard DXF, A3 drawing, renders |
| `docs/` | Build guide, design, protocol, test plan, privacy, release checklist, demo script, audit |

## 6. Prerequisites
**Software:** Git; Node.js 20 or newer (tested with 24.22); for firmware, PlatformIO Core 6.2 (`pip install platformio==6.2.0`, or the PlatformIO IDE extension for VS Code); for firmware host tests, a C++17 compiler (`g++`, `clang++`, or `pip install ziglang` → `zig c++`).
**Hardware (optional):** ESP32 DevKit (WROOM-32), 5 push buttons (9 for the 8-key build), LEDs, 220 Ω and 10 kΩ resistors, 16×2 I2C LCD, buzzer, reed switch + magnet, breadboards; optional PAM8403 amplifier and speaker. Full list and wiring: [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md).

## 7. Supported systems and browsers
| | Supported |
|---|---|
| Studio with a board | **Chrome or Edge** (desktop, version 89+) on Windows, macOS, Linux or ChromeOS, opened from `http://localhost` (Web Serial needs a secure context) |
| Studio without a board (simulator, profiles, vocabulary, voices, history) | Any current browser, including Firefox and Safari |
| Firmware build | Windows, macOS, Linux (PlatformIO) |
| USB driver | Silicon Labs CP210x (or CH340, depending on the DevKit) |

## 8. Installation
```bash
git clone https://github.com/arshpreet-svg/vaaniboard.git   # repository exists but is empty until the first push
cd vaaniboard
cd studio && npm ci && cd ..
pip install platformio==6.2.0        # only for firmware work
```
Optional, to keep the Next.js CLI from sending anonymous usage data while you develop: `cd studio && npx next telemetry disable`.

## 9. Environment variables
None are needed. VaaniBoard has no API keys, secrets or servers, so there is no `.env.example`. `PORT` is the only variable read (by `npm start`, default 3000). CI sets `NEXT_TELEMETRY_DISABLED=1`.

## 10. Studio: run and build
```bash
cd studio
npm run dev        # development: http://localhost:3000
npm run build      # static export to studio/out/
npm start          # serve studio/out/ on http://localhost:3000 (offline, localhost only, no extra packages)
npm run lint
npm test
```
Open **http://localhost:3000** in Chrome or Edge. Click **Connect board** and choose the CP210x port, or **Use simulator**. Close any PlatformIO / Arduino serial monitor first: only one program can use the port.

## 11-12. Backend and database
There is no backend and no database. The board keeps its profile in its own flash; Studio keeps profiles, settings and (only if you opt in) the event history in the browser's `localStorage`, with JSON and CSV export for backup. See ADR-1 in [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md).

## 13. Firmware: build and flash
```bash
cd firmware/board
pio run                              # builds esp32dev (4 keys) and esp32dev_8keys
pio run -e esp32dev -t upload        # flash the 4-key build (hold BOOT if it stalls at "Connecting...")
pio run -e esp32dev_8keys -t upload  # or the 8-key build
pio device monitor                   # 115200 baud
```
Expected on the monitor after a reset:
```
OK lcd at 0x27
HELLO vaaniboard 0.2.0 keys=4 fs=none proto=1
CFG {"child":"C01","lang":"hi","mode":"direct","hold_ms":0,"lockout_ms":1500,"scan_ms":1500,"volume":60,"listening":true,"keys":4,"fw":"0.2.0","proto":1,"langs":["hi","ta","bn"]}
```
(These lines are what the code prints; they have not yet been captured from a board running 0.2.0.) Serial commands: [`docs/SERIAL_PROTOCOL.md`](docs/SERIAL_PROTOCOL.md). Pin map: `firmware/board/src/pins.h` and [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) §4.

## 14. Simulator
Studio → **Use simulator** (header) or Home → **Simulator, 8 keys / 4 keys**. The simulator runs the board's rules in the browser and answers the same serial commands, so every tab works. Everything it produces is marked **SIMULATOR** on screen and `simulator` in History and in CSV exports. Diagnostics → **Simulate USB unplug** shows how Studio handles a pulled cable.

## 15. Connecting a physical board
1. Wire it as in [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) §4 and flash it (§13 above).
2. Close the serial monitor. Run Studio (§10) and open it in Chrome or Edge.
3. **Connect board** → pick the CP210x / USB serial port. Home shows firmware, protocol, keys, languages and which voice clips are on the board.
4. Unplugging is safe: the board keeps working, and Studio reconnects when the same port comes back.

## 16. Vocabulary, languages and voice clips
- **Languages:** Hindi (`hi`), Tamil (`ta`), Bengali (`bn`): 8 words each.

  | | hi | ta | bn |
  |---|---|---|---|
  | LCD transliteration | 8/8, team-authored | 8/8, team-authored | 8/8, team-authored |
  | Native script (Studio) | 8/8, **unverified** | 8/8, **unverified** | 8/8, **unverified** |
  | Recorded speech | none shipped (record your own) | none shipped | none shipped |
  | Text-to-speech / speech recognition | not implemented | not implemented | not implemented |

  Native-script labels need review by a native speaker before classroom use. `node tools/vocab.mjs report` prints the current state.
- **Change or add words/languages:** edit `language-packs/*.json` (schema in `docs/TECHNICAL_DESIGN.md` §7), then `node tools/vocab.mjs gen` and re-flash. Studio → Vocabulary can edit a copy, import or export a pack and validate it first. To add a language, create `language-packs/<code>.json`, add the code to `keys.json` `languages`, regenerate and rebuild. No code changes.
- **Voice clips:** Studio → Voices → record (or import) each word, check the result, download `NN.wav`, save it to `firmware/board/data/<lang>/`, then `pio run -e esp32dev -t uploadfs`. Board format: mono PCM, 8 or 16-bit, 4-22.05 kHz, ≤ 3 s. Recordings are git-ignored; never commit them, and never record the child.

## 17. Tests
```bash
node tools/vocab.mjs check                              # vocabulary in sync
cd studio && npm test                                   # 162 tests: unit, simulator, links, jsdom workflows
cd firmware/board && pio run && bash test_host/run.sh   # firmware builds + 30 host tests (CXX=g++ by default)
```
Without `g++` (e.g. Windows): `pip install ziglang`, then `CXX="py -m ziglang c++" bash test_host/run.sh` from Git Bash (`python3 -m ziglang c++` elsewhere). Full plan, coverage and the manual hardware checklist: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## 18. Sample data and expected results
| File | Use | Expected |
|---|---|---|
| `sample-data/profiles/sample-profiles.json` | Studio → Profiles → Import | 3 profiles imported (S01-S03); S04 skipped (volume 95 > 80) |
| `sample-data/events/demo-session.json` | Studio → History → Load fictional demo session | 13 events marked `demo`: 8 words, 4 by switch, 2 highlights, 1 palm |
| `sample-data/language-packs/mr-partial.json` | Studio → Vocabulary → Import pack, or `node tools/vocab.mjs validate …` | Imported with warnings; missing keys show their English meaning |
| `sample-data/language-packs/invalid-example.json` | same | Rejected with 5 errors |

All sample data is fictional.

## 19. Troubleshooting
| Problem | Fix |
|---|---|
| "Connect board" greyed out | Use Chrome or Edge; Firefox and Safari have no Web Serial |
| No COM port | Install the CP210x driver; try a data (not charge-only) USB cable |
| "Port could not be opened" | Close the PlatformIO / Arduino serial monitor and other Studio tabs |
| Connected but no reply | Press EN/RESET on the ESP32; check it runs VaaniBoard firmware (Diagnostics shows details) |
| `WARN set …` after sending a profile | The board refused or clamped that field; the rest was saved |
| Keys beep instead of speaking | No clip for that key and language; upload clips (§16) |
| `test_host/run.sh`: ArduinoJson not found | Run `pio run` (or `pio pkg install -e esp32dev`) in `firmware/board` first |
| Firmware build on Windows: `fatal error: …: No such file or directory` for a file that exists | Windows 260-character path limit. Keep the project in a short folder (e.g. `C:\dev\vaaniboard`) or set `PLATFORMIO_WORKSPACE_DIR` to a short folder |
More in [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) §11 and Studio → Diagnostics.

## 20. Security, privacy and offline behaviour
Only a child code (like `C01`) is stored, never a name. No audio of the child is recorded. Nothing leaves the laptop or the board: the Studio page makes no network requests and `npm start` serves it on localhost only. Voice clips, exported logs and profiles are git-ignored. Details, retention and deletion: [`docs/THREAT_MODEL_AND_PRIVACY.md`](docs/THREAT_MODEL_AND_PRIVACY.md).

## 21. Current limitations
- **Not yet hardware-verified:** firmware 0.2.0 compiles for both builds and its logic passes laptop tests, but it has not been run on the breadboard. Run the checks in [Before a demo](#before-a-demo-on-the-board) once the board is built.
- Listening is simulated in Studio: no INMP441 microphone or keyword model yet.
- Native-script labels are unverified; Studio's own interface is English only; no text-to-speech.
- No voice clips ship with the repository.
- Event times are milliseconds since the board started (no real-time clock).
- Studio data lives in one browser profile; clearing site data removes it (export first).
- Not built yet: 16-key board, WS2812B lights, I2S amplifier, microSD, battery, 3D-printed housing (designs in `cad/`).

## 22. License and contributing
Software (firmware, Studio, tools, tests, CAD scripts): **MIT** ([`LICENSE`](LICENSE)). CAD hardware files: **CERN-OHL-P-2.0**. Documentation, vocabulary and sample data: **CC BY 4.0**. Details and third-party components: [`LICENSES/README.md`](LICENSES/README.md). Contributions: [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## 23. Documentation
[Implementation tracker](implementation.md) · [Implementation audit](docs/IMPLEMENTATION_AUDIT.md) · [Technical design](docs/TECHNICAL_DESIGN.md) · [Serial protocol](docs/SERIAL_PROTOCOL.md) · [Test plan](docs/TEST_PLAN.md) · [Threat model and privacy](docs/THREAT_MODEL_AND_PRIVACY.md) · [Build guide](docs/BUILD_GUIDE.md) · [Demo script](docs/DEMO.md) · [Release checklist](docs/RELEASE_CHECKLIST.md) · [CAD](cad/README.md)

## 24. Links
- Repository: https://github.com/arshpreet-svg/vaaniboard (exists and is public; **empty until the first push**)
- Demo video: not recorded yet. Storyboard in [`docs/DEMO.md`](docs/DEMO.md)
