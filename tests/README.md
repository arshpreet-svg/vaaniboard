# Shared test vectors

`vectors/*.json` describe the board's rules as data. The **same files** are run by:

- the firmware host tests: `firmware/board/test_host/test_core.cpp` (C++, against `lib/vaani_core`)
- the Studio simulator tests: `studio/test/simulator.test.js` (JavaScript, against `studio/lib/simulator.js`)

So when a rule changes, change the vector first; both implementations must then pass it.

| File | Rule |
|---|---|
| `vectors/config.json` | Profile validation: defaults, clamping, rejected fields and the warnings they produce |
| `vectors/listening.json` | Listening assistance: two confident results in a row, threshold, pairing window, 10 s fade, core row never lit, muted while speaking |

The other tests live next to the code they test (`firmware/board/test_host/`, `studio/test/`). How to run everything: [README §17](../README.md#17-tests).
