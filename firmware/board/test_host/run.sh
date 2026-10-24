#!/usr/bin/env bash
# Builds and runs the laptop tests for lib/vaani_core (no ESP32 needed).
#
#   CXX       C++17 compiler (default g++; e.g. CXX="zig c++" or clang++)
#   ARDUINOJSON_DIR  ArduinoJson src folder (default: the one PlatformIO fetched;
#                    run `pio pkg install` or `pio run` once first)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
board="$here/.."
CXX="${CXX:-g++}"
ARDUINOJSON_DIR="${ARDUINOJSON_DIR:-$board/.pio/libdeps/esp32dev/ArduinoJson/src}"
if [ ! -f "$ARDUINOJSON_DIR/ArduinoJson.h" ]; then
  echo "ArduinoJson not found at $ARDUINOJSON_DIR. Run 'pio pkg install -e esp32dev' in firmware/board first." >&2
  exit 2
fi
out="$here/build"
mkdir -p "$out"
# shellcheck disable=SC2086
$CXX -std=c++17 -Wall -Wextra -Wno-nullability-completeness -O1 \
  -I "$board/lib/vaani_core/src" -I "$ARDUINOJSON_DIR" \
  -DVECTORS_DIR="\"$board/../../tests/vectors\"" \
  "$here/test_core.cpp" "$board"/lib/vaani_core/src/*.cpp \
  -o "$out/test_core"
"$out/test_core"
