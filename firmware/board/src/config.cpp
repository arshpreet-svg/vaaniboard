#include "config.h"

#include <Preferences.h>

Config cfg;

static Preferences prefs;

void configLoad() {
  configDefaults(cfg);
  prefs.begin("vaani", true);
  String saved = prefs.getString("json", "");
  prefs.end();
  if (saved.isEmpty()) return;
  JsonDocument doc;
  // A broken saved profile falls back to the defaults set above.
  if (!deserializeJson(doc, saved)) configApplyJson(cfg, doc.as<JsonVariantConst>());
}

void configSave() {
  JsonDocument doc;
  configToJson(cfg, doc);
  String out;
  serializeJson(doc, out);
  prefs.begin("vaani", false);
  prefs.putString("json", out);
  prefs.end();
}
