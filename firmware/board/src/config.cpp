#include "config.h"

#include <Preferences.h>

Config cfg;

static Preferences prefs;
static const char* const LANGS[] = {"hi", "ta", "bn"};

void configDefaults() {
  strlcpy(cfg.child, "C01", sizeof(cfg.child));
  strlcpy(cfg.lang, "hi", sizeof(cfg.lang));
  cfg.mode = MODE_DIRECT;
  cfg.holdMs = 0;
  cfg.lockoutMs = 1500;
  cfg.scanMs = 1500;
  cfg.volume = 60;
  cfg.listening = true;
}

void configLoad() {
  configDefaults();
  prefs.begin("vaani", true);
  String saved = prefs.getString("json", "");
  prefs.end();
  if (saved.isEmpty()) return;
  JsonDocument doc;
  // A broken saved profile falls back to the defaults set above.
  if (!deserializeJson(doc, saved)) configApplyJson(doc.as<JsonVariantConst>());
}

void configSave() {
  JsonDocument doc;
  configToJson(doc);
  String out;
  serializeJson(doc, out);
  prefs.begin("vaani", false);
  prefs.putString("json", out);
  prefs.end();
}

bool configApplyJson(JsonVariantConst in) {
  if (!in.is<JsonObjectConst>()) return false;
  if (in["child"].is<const char*>()) strlcpy(cfg.child, in["child"].as<const char*>(), sizeof(cfg.child));
  if (in["lang"].is<const char*>()) {
    const char* l = in["lang"].as<const char*>();
    for (const char* known : LANGS) {
      if (strcmp(l, known) == 0) strlcpy(cfg.lang, l, sizeof(cfg.lang));
    }
  }
  if (in["mode"].is<const char*>()) {
    cfg.mode = strcmp(in["mode"].as<const char*>(), "scan") == 0 ? MODE_SCAN : MODE_DIRECT;
  }
  if (in["hold_ms"].is<int>()) cfg.holdMs = constrain(in["hold_ms"].as<int>(), 0, 1000);
  if (in["lockout_ms"].is<int>()) cfg.lockoutMs = constrain(in["lockout_ms"].as<int>(), 300, 3000);
  if (in["scan_ms"].is<int>()) cfg.scanMs = constrain(in["scan_ms"].as<int>(), 800, 3000);
  if (in["volume"].is<int>()) cfg.volume = constrain(in["volume"].as<int>(), 0, (int)VOLUME_CAP);
  if (in["listening"].is<bool>()) cfg.listening = in["listening"].as<bool>();
  return true;
}

void configToJson(JsonDocument& doc) {
  doc["child"] = cfg.child;
  doc["lang"] = cfg.lang;
  doc["mode"] = cfg.mode == MODE_SCAN ? "scan" : "direct";
  doc["hold_ms"] = cfg.holdMs;
  doc["lockout_ms"] = cfg.lockoutMs;
  doc["scan_ms"] = cfg.scanMs;
  doc["volume"] = cfg.volume;
  doc["listening"] = cfg.listening;
}

uint8_t langIndex() {
  for (uint8_t i = 0; i < 3; i++) {
    if (strcmp(cfg.lang, LANGS[i]) == 0) return i;
  }
  return 0;
}

void configNextLang() {
  strlcpy(cfg.lang, LANGS[(langIndex() + 1) % 3], sizeof(cfg.lang));
}
