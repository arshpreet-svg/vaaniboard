#include "profile.h"

#include <string.h>

#include "timing.h"

namespace {

void report(ConfigWarn warn, void* ctx, const char* field, const char* reason) {
  if (warn) warn(field, reason, ctx);
}

// Reads an integer field and clamps it. Returns false if absent.
bool readRange(JsonVariantConst in, const char* field, int lo, int hi, int& out, ConfigWarn warn, void* ctx) {
  JsonVariantConst v = in[field];
  if (v.isNull()) return false;
  if (!v.is<int>()) {
    report(warn, ctx, field, "must be a whole number");
    return false;
  }
  const int raw = v.as<int>();
  out = raw < lo ? lo : raw > hi ? hi : raw;
  if (out != raw) report(warn, ctx, field, "out of range, clamped");
  return true;
}

bool knownField(const char* k) {
  static const char* const FIELDS[] = {"child", "lang", "mode", "hold_ms", "lockout_ms", "scan_ms", "volume", "listening",
                                       // read-only fields that Studio may echo back from CFG
                                       "keys", "fw", "proto", "langs"};
  for (const char* f : FIELDS) {
    if (strcmp(k, f) == 0) return true;
  }
  return false;
}

}  // namespace

void configDefaults(Config& c) {
  copyStr(c.child, "C01", sizeof(c.child));
  copyStr(c.lang, LANG_CODES[0], sizeof(c.lang));
  c.mode = MODE_DIRECT;
  c.holdMs = 0;
  c.lockoutMs = 1500;
  c.scanMs = 1500;
  c.volume = 60;
  c.listening = true;
}

bool childCodeValid(const char* s) {
  if (!s || !*s) return false;
  size_t n = 0;
  for (; s[n]; n++) {
    const char ch = s[n];
    const bool ok = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_';
    if (!ok || n >= CHILD_CODE_MAX) return false;
  }
  return true;
}

bool configApplyJson(Config& c, JsonVariantConst in, ConfigWarn warn, void* ctx) {
  if (!in.is<JsonObjectConst>()) return false;

  for (JsonPairConst kv : in.as<JsonObjectConst>()) {
    if (!knownField(kv.key().c_str())) report(warn, ctx, kv.key().c_str(), "unknown field, ignored");
  }

  JsonVariantConst v = in["child"];
  if (!v.isNull()) {
    if (v.is<const char*>() && childCodeValid(v.as<const char*>())) copyStr(c.child, v.as<const char*>(), sizeof(c.child));
    else report(warn, ctx, "child", "use 1-7 letters, digits, - or _ (a code, never a name)");
  }

  v = in["lang"];
  if (!v.isNull()) {
    bool found = false;
    if (v.is<const char*>()) {
      for (const char* known : LANG_CODES) {
        if (strcmp(v.as<const char*>(), known) == 0) {
          copyStr(c.lang, known, sizeof(c.lang));
          found = true;
        }
      }
    }
    if (!found) report(warn, ctx, "lang", "language not on this board");
  }

  v = in["mode"];
  if (!v.isNull()) {
    const char* m = v.is<const char*>() ? v.as<const char*>() : "";
    if (strcmp(m, "scan") == 0) c.mode = MODE_SCAN;
    else if (strcmp(m, "direct") == 0) c.mode = MODE_DIRECT;
    else report(warn, ctx, "mode", "must be \"direct\" or \"scan\"");
  }

  int n;
  if (readRange(in, "hold_ms", 0, 1000, n, warn, ctx)) c.holdMs = n;
  if (readRange(in, "lockout_ms", 300, 3000, n, warn, ctx)) c.lockoutMs = n;
  if (readRange(in, "scan_ms", 800, 3000, n, warn, ctx)) c.scanMs = n;
  if (readRange(in, "volume", 0, VOLUME_CAP, n, warn, ctx)) c.volume = n;

  v = in["listening"];
  if (!v.isNull()) {
    if (v.is<bool>()) c.listening = v.as<bool>();
    else report(warn, ctx, "listening", "must be true or false");
  }
  return true;
}

void configToJson(const Config& c, JsonDocument& doc) {
  doc["child"] = c.child;
  doc["lang"] = c.lang;
  doc["mode"] = c.mode == MODE_SCAN ? "scan" : "direct";
  doc["hold_ms"] = c.holdMs;
  doc["lockout_ms"] = c.lockoutMs;
  doc["scan_ms"] = c.scanMs;
  doc["volume"] = c.volume;
  doc["listening"] = c.listening;
}

uint8_t langIndex(const Config& c) {
  for (uint8_t i = 0; i < NUM_LANGS; i++) {
    if (strcmp(c.lang, LANG_CODES[i]) == 0) return i;
  }
  return 0;
}

void configNextLang(Config& c) { copyStr(c.lang, LANG_CODES[(langIndex(c) + 1) % NUM_LANGS], sizeof(c.lang)); }
