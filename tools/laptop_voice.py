# /// script
# requires-python = ">=3.10"
# dependencies = ["pyserial>=3.5"]
# ///
import glob
import json
import subprocess
import sys
from pathlib import Path

import serial

ROOT = Path(__file__).resolve().parent.parent
VOICES = {"hi": "Lekha", "ta": "Vani", "bn": "Piya", "mr": "Lekha", "pa": "Lekha", "or": "Lekha", "en": "Rishi"}


SPECIAL = {"\u0a70": "\u0902", "\u0a71": "", "\u0b2f": "\u091c", "\u0b5f": "\u092f", "\u0b71": "\u0935"}


def to_devanagari(text, base):
    out = []
    for ch in text:
        c = ord(ch)
        if ch in SPECIAL:
            out.append(SPECIAL[ch])
        elif base <= c <= base + 0x6F:
            out.append(chr(c - base + 0x0900))
        else:
            out.append(ch)
    return "".join(out)


def load_words():
    words = {}
    for lang in VOICES:
        pack = json.loads((ROOT / "language-packs" / f"{lang}.json").read_text(encoding="utf-8"))
        words[lang] = {int(k["id"][1:]): k["label_native"] for k in pack["keys"]}
    words["pa"] = {k: to_devanagari(v, 0x0A00) for k, v in words["pa"].items()}
    words["or"] = {k: to_devanagari(v, 0x0B00) for k, v in words["or"].items()}
    return words


def find_port():
    if len(sys.argv) > 1:
        return sys.argv[1]
    ports = glob.glob("/dev/cu.usbserial*") + glob.glob("/dev/cu.SLAB*") + glob.glob("/dev/cu.wchusb*")
    if not ports:
        sys.exit("ESP32 not found. Plug it in, or run: uv run tools/laptop_voice.py /dev/cu.<port>")
    return ports[0]


def main():
    words = load_words()
    port = find_port()
    ser = serial.Serial(port, 115200, timeout=1)
    print(f"Listening on {port}. Press a key on the board; Ctrl+C to stop.")
    speaking = None
    while True:
        line = ser.readline().decode(errors="ignore").strip()
        if not line.startswith("EVT,"):
            continue
        parts = line.split(",")
        if len(parts) < 8 or parts[3] != "select":
            continue
        key, lang = int(parts[4]), parts[6]
        text = words.get(lang, words["hi"]).get(key, parts[5])
        print(f"key {key:02d} -> {text} ({parts[5]}, {parts[7]})")
        if speaking and speaking.poll() is None:
            speaking.terminate()
        speaking = subprocess.Popen(["say", "-v", VOICES.get(lang, "Lekha"), text])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
