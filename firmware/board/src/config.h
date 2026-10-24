#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

enum AccessMode : uint8_t { MODE_DIRECT = 0, MODE_SCAN = 1 };

// Enforced in code whatever a profile asks for.
constexpr uint8_t VOLUME_CAP = 80;

// One child's profile. Stored in flash (NVS) and edited from VaaniBoard Studio
// or, without a laptop, in caregiver mode.
struct Config {
  char child[8];       // child code only (e.g. "C01"), never a name
  char lang[3];        // "hi", "ta" or "bn"
  uint8_t mode;        // AccessMode
  uint16_t holdMs;     // 0-1000: how long a key must be held before it speaks
  uint16_t lockoutMs;  // 300-3000: same key ignored for this long after speaking
  uint16_t scanMs;     // 800-3000: scan cursor step
  uint8_t volume;      // 0-VOLUME_CAP percent
  bool listening;      // prompt-assisted highlights on/off
};

extern Config cfg;

void configDefaults();
void configLoad();
void configSave();
// Applies any fields present in `in`, clamping each to its safe range.
bool configApplyJson(JsonVariantConst in);
void configToJson(JsonDocument& doc);
uint8_t langIndex();  // 0 = hi, 1 = ta, 2 = bn
void configNextLang();
