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

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>

#include "audio.h"
#include "config.h"
#include "pins.h"
#include "vocab.h"

namespace {

constexpr const char* FW_VERSION = "0.1.0";
constexpr uint32_t POLL_MS = 5;
constexpr uint32_t DEBOUNCE_MS = 30;
constexpr uint32_t PALM_WINDOW_MS = 50;      // min hold, so a palm press is seen as 3+ keys first
constexpr uint32_t SWITCH_GAP_MS = 300;      // min time between access-switch selections
constexpr uint32_t HIGHLIGHT_MS = 10000;
constexpr float KW_THRESHOLD = 0.8f;
constexpr uint32_t KW_PAIR_MS = 1500;        // two confident results must arrive this close together
constexpr uint32_t WORD_ON_SCREEN_MS = 3000;
constexpr uint32_t FLASH_MS = 700;

struct Debounced {
  bool raw = false;
  bool stable = false;
  uint32_t changedAt = 0;
};

struct KeyState {
  Debounced in;
  bool fired = false;
  uint32_t downAt = 0;
  uint32_t lastFire = 0;
  bool everFired = false;
};

LiquidCrystal_I2C* lcd = nullptr;
uint32_t lcdHoldUntil = 0;
bool idleDirty = true;

KeyState keys[NUM_KEYS];
Debounced accessIn, reedIn;
bool palm = false;
bool caregiver = false;
uint32_t lastPoll = 0;
uint32_t lastSwitchSelect = 0;

uint32_t flashUntil[NUM_KEYS] = {};
uint32_t hlUntil[NUM_KEYS] = {};  // 0 = not highlighted

uint8_t scanList[NUM_KEYS];
uint8_t scanLen = 0, scanPos = 0;
int8_t cursor = -1;
uint32_t scanNext = 0;

char lastKw[16] = "";
float lastKwConf = 0;
uint32_t lastKwAt = 0;

char lineBuf[256];
size_t lineLen = 0;

bool reached(uint32_t now, uint32_t when) { return (int32_t)(now - when) >= 0; }

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
  Serial.printf("EVT,%lu,%s,%s,%02d,%s,%s,%s\n", (unsigned long)millis(), cfg.child, event, key + 1,
                key >= 0 ? VOCAB[key].en : "-", cfg.lang, input);
}

void printCfg() {
  JsonDocument doc;
  configToJson(doc);
  doc["keys"] = NUM_KEYS;
  doc["fw"] = FW_VERSION;
  Serial.print("CFG ");
  serializeJson(doc, Serial);
  Serial.println();
}

void printHighlights() {
  Serial.print("HL ");
  bool any = false;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (!hlUntil[i]) continue;
    Serial.printf(any ? ",%u" : "%u", i + 1);
    any = true;
  }
  Serial.println(any ? "" : "-");
}

// ---------------------------------------------------------------- highlights and scanning

void restartScan(uint32_t delayMs) {
  cursor = -1;
  scanNext = millis() + delayMs;
}

void clearHighlights() {
  bool any = false;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (hlUntil[i]) any = true;
    hlUntil[i] = 0;
  }
  if (any) printHighlights();
}

void expireHighlights(uint32_t t) {
  bool changed = false;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (hlUntil[i] && reached(t, hlUntil[i])) {
      hlUntil[i] = 0;
      changed = true;
    }
  }
  if (changed) printHighlights();
}

// Lit keys first, then the core row, so the child can still refuse the suggestion.
void buildScanList() {
  scanLen = 0;
  for (uint8_t i = CORE_KEYS; i < NUM_KEYS; i++) {
    if (hlUntil[i]) scanList[scanLen++] = i;
  }
  const uint8_t upto = scanLen > 0 ? CORE_KEYS : NUM_KEYS;
  for (uint8_t i = 0; i < upto; i++) scanList[scanLen++] = i;
}

void stepScan(uint32_t t) {
  if (cfg.mode != MODE_SCAN || caregiver) {
    cursor = -1;
    return;
  }
  if (!reached(t, scanNext)) return;
  buildScanList();
  scanPos = cursor < 0 ? 0 : (scanPos + 1) % scanLen;
  cursor = scanList[scanPos];
  scanNext = t + cfg.scanMs;
  Serial.printf("CUR %d\n", cursor + 1);
  if (!lcdHoldUntil) {
    char b[17];
    snprintf(b, sizeof(b), "> %s", VOCAB[cursor].label[langIndex()]);
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
  lcdLines(w.label[langIndex()], b);
  lcdHoldUntil = millis() + WORD_ON_SCREEN_MS;

  logEvent("select", i, input);
  clearHighlights();  // the child has answered
  if (cfg.mode == MODE_SCAN) restartScan(1000);
}

void onKeyword(const char* word, float conf, uint32_t t) {
  if (!cfg.listening) {
    Serial.println("OK kw ignored: listening is off");
    return;
  }
  if (audioBusy()) {
    Serial.println("OK kw ignored: board is speaking");
    return;
  }
  int key = -1;
  for (const KeywordMap& m : KEYWORDS) {
    if (strcasecmp(m.word, word) == 0) key = m.key;
  }
  const bool confident = conf >= KW_THRESHOLD;
  const bool twice = confident && lastKwConf >= KW_THRESHOLD && strcasecmp(lastKw, word) == 0 &&
                     t - lastKwAt <= KW_PAIR_MS;
  strlcpy(lastKw, word, sizeof(lastKw));
  lastKwConf = conf;
  lastKwAt = t;

  if (key < 0 || key >= NUM_KEYS) {
    Serial.printf("OK kw %s: no matching key on this board\n", word);
    return;
  }
  if (!twice) {
    Serial.printf("OK kw %s %.2f: %s\n", word, conf,
                  confident ? "waiting for a second confident result" : "below threshold, no highlight");
    return;
  }
  lastKwConf = 0;  // the next highlight needs a fresh pair
  hlUntil[key] = t + HIGHLIGHT_MS;
  printHighlights();
  logEvent("highlight", key, "listen");
  if (cfg.mode == MODE_SCAN) restartScan(0);
}

// ---------------------------------------------------------------- caregiver mode

uint16_t nextStep(uint16_t current, const uint16_t* steps, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (steps[i] > current) return steps[i];
  }
  return steps[0];
}

void onCaregiverKey(uint8_t i) {
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
      configNextLang();
      snprintf(b, sizeof(b), "Language: %s", cfg.lang);
      break;
    case 3:
      cfg.holdMs = nextStep(cfg.holdMs, HOLD_STEPS, 5);
      snprintf(b, sizeof(b), "Hold: %u ms", cfg.holdMs);
      break;
    default:
      return;
  }
  lcdLines("CAREGIVER MODE", b);
  audioSay("", 1);
}

void setCaregiver(bool on) {
  if (on == caregiver) return;
  caregiver = on;
  if (on) {
    clearHighlights();
    lcdLines("CAREGIVER MODE", "1mode 2scan 3lng");
    lcdHoldUntil = 0;
    logEvent("caregiver_on", -1, "reed");
  } else {
    configSave();
    printCfg();
    logEvent("caregiver_off", -1, "reed");
    restartScan(500);
    idleDirty = true;
  }
}

// ---------------------------------------------------------------- inputs

// Returns true when the debounced state changes.
bool debounce(Debounced& d, bool now, uint32_t t) {
  if (now != d.raw) {
    d.raw = now;
    d.changedAt = t;
  }
  if (d.stable != d.raw && t - d.changedAt >= DEBOUNCE_MS) {
    d.stable = d.raw;
    return true;
  }
  return false;
}

void pollKeys(uint32_t t) {
  uint8_t down = 0;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    KeyState& k = keys[i];
    if (debounce(k.in, digitalRead(KEY_PINS[i]) == LOW, t)) {
      k.fired = false;
      if (k.in.stable) k.downAt = t;
    }
    if (k.in.stable) down++;
  }

  // Three or more keys at once is a palm or forearm, not a choice.
  if (down >= 3 && !palm) {
    palm = true;
    logEvent("palm", -1, "press");
  }
  if (palm) {
    for (KeyState& k : keys) {
      if (k.in.stable) k.fired = true;
    }
    if (down == 0) palm = false;
    return;
  }

  const uint32_t hold = max<uint32_t>(cfg.holdMs, PALM_WINDOW_MS);
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    KeyState& k = keys[i];
    if (!k.in.stable || k.fired || t - k.downAt < hold) continue;
    k.fired = true;
    if (caregiver) {
      onCaregiverKey(i);
    } else if (!k.everFired || t - k.lastFire >= cfg.lockoutMs) {
      k.everFired = true;
      k.lastFire = t;
      onSelect(i, "press");
    }
  }
}

void pollAccess(uint32_t t) {
  if (!debounce(accessIn, digitalRead(ACCESS_PIN) == LOW, t) || !accessIn.stable) return;
  if (caregiver) return;
  if (cfg.mode != MODE_SCAN) {
    lcdLines("Access switch", "scan mode is off");
    lcdHoldUntil = t + 1500;
    return;
  }
  if (cursor < 0 || t - lastSwitchSelect < SWITCH_GAP_MS) return;
  lastSwitchSelect = t;
  onSelect(cursor, "switch");
}

void pollReed(uint32_t t) {
  const bool magnet = (digitalRead(REED_PIN) == LOW) == REED_ACTIVE_LOW;
  if (debounce(reedIn, magnet, t)) setCaregiver(reedIn.stable);
}

// ---------------------------------------------------------------- LEDs

void renderLeds(uint32_t t) {
  const bool blink = (t / 400) % 2;
  for (uint8_t i = 0; i < NUM_KEYS; i++) {
    if (LED_PINS[i] < 0) continue;
    bool on;
    if (!reached(t, flashUntil[i])) on = true;               // just spoke
    else if (caregiver) on = i < CORE_KEYS && blink;         // settings keys
    else if (cursor == i) on = true;                         // scan cursor
    else if (hlUntil[i]) on = blink;                         // likely answer
    else on = false;
    digitalWrite(LED_PINS[i], on ? HIGH : LOW);
  }
  if (STATUS_LED >= 0) digitalWrite(STATUS_LED, cfg.listening && !caregiver ? HIGH : LOW);
}

// ---------------------------------------------------------------- serial commands

void printHelp() {
  Serial.println("OK commands: ping | cfg | set {json} | kw <word> <conf> | press <n> | clear | reset | help");
}

void handleLine(char* line) {
  while (*line == ' ') line++;
  size_t n = strlen(line);
  while (n && (line[n - 1] == ' ' || line[n - 1] == '\r')) line[--n] = 0;
  if (!n) return;

  if (strcmp(line, "ping") == 0) {
    Serial.printf("OK vaaniboard %s keys=%d\n", FW_VERSION, NUM_KEYS);
  } else if (strcmp(line, "cfg") == 0) {
    printCfg();
  } else if (strncmp(line, "set ", 4) == 0) {
    JsonDocument doc;
    if (deserializeJson(doc, line + 4) || !configApplyJson(doc.as<JsonVariantConst>())) {
      Serial.println("ERR set expects a JSON object");
      return;
    }
    configSave();
    printCfg();
    restartScan(500);
    idleDirty = true;
  } else if (strncmp(line, "kw ", 3) == 0) {
    char word[16];
    float conf;
    if (sscanf(line + 3, "%15s %f", word, &conf) == 2) onKeyword(word, conf, millis());
    else Serial.println("ERR usage: kw <word> <confidence 0-1>");
  } else if (strncmp(line, "press ", 6) == 0) {
    const int k = atoi(line + 6);
    if (k >= 1 && k <= NUM_KEYS) onSelect(k - 1, "sim");
    else Serial.printf("ERR key must be 1-%d\n", NUM_KEYS);
  } else if (strcmp(line, "clear") == 0) {
    clearHighlights();
  } else if (strcmp(line, "reset") == 0) {
    configDefaults();
    configSave();
    printCfg();
    idleDirty = true;
  } else if (strcmp(line, "help") == 0) {
    printHelp();
  } else {
    Serial.printf("ERR unknown command: %s\n", line);
  }
}

void readSerial() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\n') {
      lineBuf[lineLen] = 0;
      handleLine(lineBuf);
      lineLen = 0;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
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

  Serial.printf("HELLO vaaniboard %s keys=%d fs=%s\n", FW_VERSION, NUM_KEYS,
                audioFsMounted() ? "littlefs" : "none");
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
  expireHighlights(t);
  stepScan(t);
  renderLeds(t);

  if (lcdHoldUntil && reached(t, lcdHoldUntil)) {
    lcdHoldUntil = 0;
    idleDirty = true;
  }
  if (idleDirty && !lcdHoldUntil && !caregiver) {
    idleDirty = false;
    showIdle();
  }
}
