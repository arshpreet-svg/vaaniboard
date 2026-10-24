#pragma once
#include <ArduinoJson.h>
#include <stdint.h>

#include "vocab.h"

enum AccessMode : uint8_t { MODE_DIRECT = 0, MODE_SCAN = 1 };

// Enforced in code whatever a profile asks for.
constexpr uint8_t VOLUME_CAP = 80;
constexpr uint8_t CHILD_CODE_MAX = 7;

// One child's profile. Stored in flash (NVS) and edited from VaaniBoard Studio
// or, without a laptop, in caregiver mode.
struct Config {
  char child[CHILD_CODE_MAX + 1];  // child code only (e.g. "C01"), never a name
  char lang[4];               // a code from LANG_CODES, e.g. "hi"
  uint8_t mode;               // AccessMode
  uint16_t holdMs;            // 0-1000: how long a key must be held before it speaks
  uint16_t lockoutMs;         // 300-3000: same key ignored for this long after speaking
  uint16_t scanMs;            // 800-3000: scan cursor step
  uint8_t volume;             // 0-VOLUME_CAP percent
  bool listening;             // prompt-assisted highlights on/off
};

// Called once for each field configApplyJson could not use as given.
using ConfigWarn = void (*)(const char* field, const char* reason, void* ctx);

void configDefaults(Config& c);
// Applies any fields present in `in`, clamping each to its safe range. Fields
// that are invalid are skipped (and reported through `warn`); the rest still
// apply. Returns false only when `in` is not a JSON object.
bool configApplyJson(Config& c, JsonVariantConst in, ConfigWarn warn = nullptr, void* ctx = nullptr);
void configToJson(const Config& c, JsonDocument& doc);
uint8_t langIndex(const Config& c);  // index into LANG_CODES; unknown -> 0
void configNextLang(Config& c);
// 1-7 characters from A-Z a-z 0-9 - _ : keeps codes short, name-free and safe
// inside the comma-separated EVT line.
bool childCodeValid(const char* s);
