// VaaniBoard main-board firmware: breadboard prototype.
//
// Layer A (communication always works): keys speak their word with debounce,
// hold time, repeat lockout and palm rejection; the core row is never
// highlighted or remapped.
// Layer B (listening only assists): keyword results ("kw <word> <confidence>")
// light the likely answers only after two confident results in a row; the
// highlight never speaks and fades after 10 s. Until the INMP441 mic and the
// Edge Impulse model are added, VaaniBoard Studio sends these results.
// Access: direct press, or switch scanning (lit keys first, then the core row).
// Caregiver mode (magnet on the reed switch) changes settings without a laptop.
//
// The decisions live in lib/vaani_core (hardware-free, tested on a laptop in
// test_host/); this file wires them to pins, the LCD, audio and the serial port.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>

#include "audio.h"
#include "config.h"
#include "keys.h"
#include "listening.h"
#include "pins.h"
#include "protocol.h"
#include "scanner.h"
#include "timing.h"
#include "vocab.h"

static_assert(NUM_KEYS <= VOCAB_KEYS, "every key needs a word in language-packs/keys.json");

namespace {

constexpr const char* FW_VERSION = "0.2.0";
constexpr uint32_t POLL_MS = 5;
constexpr uint32_t WORD_ON_SCREEN_MS = 3000;
constexpr uint32_t FLASH_MS = 700;

LiquidCrystal_I2C* lcd = nullptr;
uint32_t lcdHoldUntil = 0;
bool idleDirty = true;

KeyInput keyInput(NUM_KEYS);
Listening listening(NUM_KEYS);
Scanner scanner(NUM_KEYS);
Caregiver caregiverMode;
Debounced accessIn, reedIn;
LineBuffer serialLine;
uint32_t lastPoll = 0;

uint32_t flashUntil[NUM_KEYS] = {};

// ---------------------------------------------------------------- display

void lcdLines(const char* a, const char* b) {
  if (!lcd) return;
  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(a);
  lcd->setCursor(0, 1);
  lcd->print(b);
}

void lcdLine2(const char* b) {
  if (!lcd) return;
  char padded[17];
  snprintf(padded, sizeof(padded), "%-16s", b);
  lcd->setCursor(0, 1);
  lcd->print(padded);
}

void lcdBegin() {
  Wire.begin(I2C_SDA, I2C_SCL);
  for (uint8_t addr : {0x27, 0x3F}) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      lcd = new LiquidCrystal_I2C(addr, 16, 2);
      lcd->init();
      lcd->backlight();
      Serial.printf("OK lcd at 0x%02X\n", addr);
      return;
    }
  }
  Serial.println("WARN no LCD found: check SDA=21, SCL=22, VCC=5V");
}

void showIdle() {
  char a[17], b[17];
  snprintf(a, sizeof(a), "VaaniBoard  %c%c", toupper(cfg.lang[0]), toupper(cfg.lang[1]));
  snprintf(b, sizeof(b), "%s%s", cfg.mode == MODE_SCAN ? "SCAN" : "DIRECT", cfg.listening ? "   LISTEN" : "");
  lcdLines(a, b);
}

// ---------------------------------------------------------------- logging

// EVT,<ms>,<child>,<event>,<key>,<word>,<lang>,<input>
void logEvent(const char* event, int key, const char* input) {
  char child[sizeof(cfg.child)];
  copyStr(child, cfg.child, sizeof(child));
  csvSafe(child);
  Serial.printf("EVT,%lu,%s,%s,%02d,%s,%s,%s\n", (unsigned long)millis(), child, event, key + 1,
                key >= 0 ? VOCAB[key].en : "-", cfg.lang, input);
}

void addBoardFields(JsonDocument& doc) {
  doc["keys"] = NUM_KEYS;
  doc["fw"] = FW_VERSION;
  doc["proto"] = PROTO_VERSION;
  JsonArray langs = doc["langs"].to<JsonArray>();
  for (const char* l : LANG_CODES) langs.add(l);
}

void printCfg() {
  JsonDocument doc;
  configToJson(cfg, doc);
  addBoardFields(doc);
  Serial.print("CFG ");
  serializeJson(doc, Serial);
  Serial.println();
}

// INFO {json}: what this board can do and which voice clips it holds, so
// Studio can show missing clips (a missing clip beeps; it never blocks a key).
void printInfo() {
  JsonDocument doc;
  addBoardFields(doc);
  doc["fs"] = audioFsMounted();
  JsonArray caps = doc["caps"].to<JsonArray>();
  for (const char* c : {"direct", "scan", "listen", "caregiver", "switch"}) caps.add(c);
  if (audioFsMounted()) caps.add("clips");
  JsonObject clips = doc["clips"].to<JsonObject>();
  for (const char* l : LANG_CODES) {
    char have[NUM_KEYS + 1];
    for (uint8_t i = 0; i < NUM_KEYS; i++) {
      char path[24];
      snprintf(path, sizeof(path), "/%s/%02u.wav", l, i + 1);
      have[i] = audioClipExists(path) ? '1' : '0';
    }
    have[NUM_KEYS] = 0;
    clips[l] = have;
  }
  Serial.print("INFO ");
  serializeJson(doc, Serial);
  Serial.println();
}

void printHighlights() {
  Serial.print("HL ");
  bool any = false;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (!listening.lit(i)) continue;
    Serial.printf(any ? ",%u" : "%u", i + 1);
    any = true;
  }
  Serial.println(any ? "" : "-");
}

// ---------------------------------------------------------------- highlights and scanning

void clearHighlights() {
  if (listening.clear()) printHighlights();
}

void stepScan(uint32_t t) {
  if (!scanner.step(t, cfg.mode == MODE_SCAN && !caregiverMode.active(), cfg.scanMs, listening)) return;
  const int8_t cur = scanner.cursor();
  Serial.printf("CUR %d\n", cur + 1);
  if (!lcdHoldUntil) {
    char b[17];
    snprintf(b, sizeof(b), "> %s", VOCAB[cur].label[langIndex(cfg)]);
    lcdLine2(b);
  }
}

// ---------------------------------------------------------------- speaking

void onSelect(uint8_t i, const char* input) {
  const Word& w = VOCAB[i];
  char path[24];
  snprintf(path, sizeof(path), "/%s/%02u.wav", cfg.lang, i + 1);
  audioSay(path, w.urgent ? 3 : 1);

  flashUntil[i] = millis() + FLASH_MS;
  char b[17];
  snprintf(b, sizeof(b), "(%s)", w.en);
  lcdLines(w.label[langIndex(cfg)], b);
  lcdHoldUntil = millis() + WORD_ON_SCREEN_MS;

  logEvent("select", i, input);
  clearHighlights();  // the child has answered
  if (cfg.mode == MODE_SCAN) scanner.restart(millis(), 1000);
}

bool boardSpeaking(uint32_t t) { return audioBusy() || t - audioLastEndMs() < SPEAK_MUTE_MS; }

void onKeyword(const char* word, float conf, uint32_t t) {
  const KwOutcome o = listening.onKeyword(word, conf, t, cfg.listening, boardSpeaking(t));
  switch (o.result) {
    case KwResult::Off:
      Serial.println("OK kw ignored: listening is off");
      break;
    case KwResult::Speaking:
      Serial.println("OK kw ignored: board is speaking");
      break;
    case KwResult::NoKey:
      Serial.printf("OK kw %s: no matching key on this board\n", word);
      break;
    case KwResult::Below:
      Serial.printf("OK kw %s %.2f: below threshold, no highlight\n", word, conf);
      break;
    case KwResult::Waiting:
      Serial.printf("OK kw %s %.2f: waiting for a second confident result\n", word, conf);
      break;
    case KwResult::Highlight:
      printHighlights();
      logEvent("highlight", o.key, "listen");
      if (cfg.mode == MODE_SCAN) scanner.restart(t, 0);
      break;
  }
}

// ---------------------------------------------------------------- caregiver mode

uint16_t nextStep(uint16_t current, const uint16_t* steps, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (steps[i] > current) return steps[i];
  }
  return steps[0];
}

void onCaregiverKey(uint8_t i, uint32_t t) {
  static const uint16_t SCAN_STEPS[] = {800, 1200, 1500, 2000, 3000};
  static const uint16_t HOLD_STEPS[] = {0, 150, 300, 500, 1000};
  char b[17];
  switch (i) {
    case 0:
      cfg.mode = cfg.mode == MODE_SCAN ? MODE_DIRECT : MODE_SCAN;
      snprintf(b, sizeof(b), "Mode: %s", cfg.mode == MODE_SCAN ? "scan" : "direct");
      break;
    case 1:
      cfg.scanMs = nextStep(cfg.scanMs, SCAN_STEPS, 5);
      snprintf(b, sizeof(b), "Scan: %u ms", cfg.scanMs);
      break;
    case 2:
      configNextLang(cfg);
      snprintf(b, sizeof(b), "Language: %s", cfg.lang);
      break;
    case 3:
      cfg.holdMs = nextStep(cfg.holdMs, HOLD_STEPS, 5);
      snprintf(b, sizeof(b), "Hold: %u ms", cfg.holdMs);
      break;
    default:
      return;
  }
  caregiverMode.activity(t);
  lcdLines("CAREGIVER MODE", b);
  audioSay("", 1);
}

void leaveCaregiver(const char* event, uint32_t t) {
  configSave();
  printCfg();
  logEvent(event, -1, "reed");
  scanner.restart(t, 500);
  idleDirty = true;
}

void pollReed(uint32_t t) {
  const bool magnet = (digitalRead(REED_PIN) == LOW) == REED_ACTIVE_LOW;
  debounce(reedIn, magnet, t);
  switch (caregiverMode.update(reedIn.stable, t)) {
    case Caregiver::ENTERED:
      clearHighlights();
      lcdLines("CAREGIVER MODE", "1mode 2scan 3lng");
      lcdHoldUntil = 0;
      logEvent("caregiver_on", -1, "reed");
      break;
    case Caregiver::EXITED:
      leaveCaregiver("caregiver_off", t);
      break;
    case Caregiver::TIMED_OUT:
      // Magnet left in place: give the keys back to the child.
      leaveCaregiver("caregiver_timeout", t);
      lcdLines("Settings saved", "remove magnet");
      lcdHoldUntil = t + WORD_ON_SCREEN_MS;
      break;
    case Caregiver::NONE:
      break;
  }
}

// ---------------------------------------------------------------- inputs

void pollKeys(uint32_t t) {
  bool pressed[NUM_KEYS];
  for (uint8_t i = 0; i < NUM_KEYS; i++) pressed[i] = digitalRead(KEY_PINS[i]) == LOW;
  KeyEvent events[MAX_KEYS + 1];
  const uint8_t n = keyInput.poll(t, pressed, cfg.holdMs, cfg.lockoutMs, caregiverMode.active(), events);
  for (uint8_t e = 0; e < n; e++) {
    switch (events[e].action) {
      case KeyAction::Palm:
        logEvent("palm", -1, "press");
        break;
      case KeyAction::Caregiver:
        onCaregiverKey(events[e].key, t);
        break;
      case KeyAction::Select:
        onSelect(events[e].key, "press");
        break;
    }
  }
}

// Access switch (or the "switch" command): selects the key under the scan cursor.
const char* switchSelect(uint32_t t, const char* input) {
  if (caregiverMode.active()) return "caregiver mode is on";
  if (cfg.mode != MODE_SCAN) return "scan mode is off";
  const int8_t k = scanner.select(t);
  if (k < 0) return "no key under the cursor yet";
  onSelect(k, input);
  return nullptr;
}

void pollAccess(uint32_t t) {
  if (!debounce(accessIn, digitalRead(ACCESS_PIN) == LOW, t) || !accessIn.stable) return;
  if (!caregiverMode.active() && cfg.mode != MODE_SCAN) {
    lcdLines("Access switch", "scan mode is off");
    lcdHoldUntil = t + 1500;
    return;
  }
  switchSelect(t, "switch");
}

// ---------------------------------------------------------------- LEDs

void renderLeds(uint32_t t) {
  const bool blink = (t / 400) % 2;
  const bool caregiver = caregiverMode.active();
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (LED_PINS[i] < 0) continue;
    bool on;
    if (!reached(t, flashUntil[i])) on = true;               // just spoke
    else if (caregiver) on = i < CORE_KEYS && blink;         // settings keys
    else if (scanner.cursor() == i) on = true;               // scan cursor
    else if (listening.lit(i)) on = blink;                   // likely answer
    else on = false;
    digitalWrite(LED_PINS[i], on ? HIGH : LOW);
  }
  if (STATUS_LED >= 0) digitalWrite(STATUS_LED, cfg.listening && !caregiver ? HIGH : LOW);
}

// ---------------------------------------------------------------- serial commands

void printHelp() {
  Serial.println(
      "OK commands: ping | cfg | info | set {json} | kw <word> <conf> | press <n> | switch | clear | reset | help");
}

void onSetWarning(const char* field, const char* reason, void*) { Serial.printf("WARN set %s: %s\n", field, reason); }

void handleLine(char* raw) {
  char* line = trimLine(raw);
  if (!*line) return;
  const uint32_t t = millis();

  if (strcmp(line, "ping") == 0) {
    Serial.printf("OK vaaniboard %s keys=%d proto=%d\n", FW_VERSION, NUM_KEYS, PROTO_VERSION);
  } else if (strcmp(line, "cfg") == 0) {
    printCfg();
  } else if (strcmp(line, "info") == 0) {
    printInfo();
  } else if (strncmp(line, "set ", 4) == 0) {
    JsonDocument doc;
    if (deserializeJson(doc, line + 4) || !configApplyJson(cfg, doc.as<JsonVariantConst>(), onSetWarning)) {
      Serial.println("ERR set expects a JSON object");
      return;
    }
    configSave();
    printCfg();
    scanner.restart(t, 500);
    idleDirty = true;
  } else if (strncmp(line, "kw ", 3) == 0) {
    char word[16];
    float conf = 0;
    const char* err = parseKw(line + 3, word, sizeof(word), conf);
    if (err) Serial.printf("ERR %s\n", err);
    else onKeyword(word, conf, t);
  } else if (strncmp(line, "press ", 6) == 0) {
    const int k = parseKeyNumber(line + 6, NUM_KEYS);
    if (k >= 0) onSelect(k, "sim");
    else Serial.printf("ERR key must be 1-%d\n", NUM_KEYS);
  } else if (strcmp(line, "switch") == 0) {
    const char* err = switchSelect(t, "sim");
    if (err) Serial.printf("ERR switch: %s\n", err);
  } else if (strcmp(line, "clear") == 0) {
    clearHighlights();
  } else if (strcmp(line, "reset") == 0) {
    configDefaults(cfg);
    configSave();
    clearHighlights();
    scanner.restart(t, 500);
    printCfg();
    idleDirty = true;
  } else if (strcmp(line, "help") == 0) {
    printHelp();
  } else {
    Serial.printf("ERR unknown command: %.40s\n", line);
  }
}

void readSerial() {
  while (Serial.available()) {
    switch (serialLine.feed(Serial.read())) {
      case LineBuffer::LINE:
        handleLine(serialLine.line());
        break;
      case LineBuffer::TOO_LONG:
        Serial.printf("ERR line too long (max %u characters)\n", (unsigned)SERIAL_LINE_MAX);
        break;
      case LineBuffer::NONE:
        break;
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    pinMode(KEY_PINS[i], KEY_PINS[i] >= 34 ? INPUT : INPUT_PULLUP);  // 34-39 use external 10k pull-ups
    if (LED_PINS[i] >= 0) pinMode(LED_PINS[i], OUTPUT);
  }
  pinMode(ACCESS_PIN, INPUT_PULLUP);
  pinMode(REED_PIN, INPUT_PULLUP);
  if (STATUS_LED >= 0) pinMode(STATUS_LED, OUTPUT);

  configLoad();
  audioBegin();
  lcdBegin();
  lcdLines("VaaniBoard", "starting...");

  // LED self-test: every key light in turn.
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (LED_PINS[i] < 0) continue;
    digitalWrite(LED_PINS[i], HIGH);
    delay(120);
    digitalWrite(LED_PINS[i], LOW);
  }

  Serial.printf("HELLO vaaniboard %s keys=%d fs=%s proto=%d\n", FW_VERSION, NUM_KEYS,
                audioFsMounted() ? "littlefs" : "none", PROTO_VERSION);
  printCfg();
  audioSay("/sys/chime.wav", 1);
  idleDirty = true;
}

void loop() {
  const uint32_t t = millis();
  readSerial();
  if (t - lastPoll >= POLL_MS) {
    lastPoll = t;
    pollReed(t);
    pollKeys(t);
    pollAccess(t);
  }
  if (listening.expire(t)) printHighlights();
  stepScan(t);
  renderLeds(t);

  if (lcdHoldUntil && reached(t, lcdHoldUntil)) {
    lcdHoldUntil = 0;
    idleDirty = true;
  }
  if (idleDirty && !lcdHoldUntil && !caregiverMode.active()) {
    idleDirty = false;
    showIdle();
  }
}
