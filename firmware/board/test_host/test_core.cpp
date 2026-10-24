// Laptop tests for lib/vaani_core: the board's decision logic with no hardware.
// Build and run with test_host/run.sh (g++ or clang++, C++17).
//
// Shared vectors in tests/vectors/ are also run by the Studio simulator tests,
// so the simulator and the firmware are held to the same rules.

#include <ArduinoJson.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <functional>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "keys.h"
#include "listening.h"
#include "profile.h"
#include "protocol.h"
#include "scanner.h"
#include "timing.h"
#include "vocab.h"

#ifndef VECTORS_DIR
#define VECTORS_DIR "../../tests/vectors"
#endif

// ---------------------------------------------------------------- tiny harness

static int g_checks = 0, g_failures = 0;
static std::string g_current;

#define CHECK(cond)                                                                       \
  do {                                                                                    \
    g_checks++;                                                                           \
    if (!(cond)) {                                                                        \
      g_failures++;                                                                       \
      std::printf("  FAIL [%s] %s:%d: %s\n", g_current.c_str(), __FILE__, __LINE__, #cond); \
    }                                                                                     \
  } while (0)

#define CHECK_MSG(cond, msg)                                                                     \
  do {                                                                                           \
    g_checks++;                                                                                  \
    if (!(cond)) {                                                                               \
      g_failures++;                                                                              \
      std::printf("  FAIL [%s] %s:%d: %s (%s)\n", g_current.c_str(), __FILE__, __LINE__, #cond, \
                  std::string(msg).c_str());                                                     \
    }                                                                                            \
  } while (0)

struct TestCase {
  const char* name;
  std::function<void()> fn;
};
static std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}
struct Registrar {
  Registrar(const char* n, std::function<void()> f) { registry().push_back({n, std::move(f)}); }
};
#define TEST(name)                                \
  static void name();                             \
  static Registrar reg_##name(#name, name);       \
  static void name()

static bool loadJson(const char* file, JsonDocument& doc) {
  std::ifstream in(std::string(VECTORS_DIR) + "/" + file);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  return !deserializeJson(doc, ss.str());
}

// ---------------------------------------------------------------- profile

struct WarnLog {
  std::set<std::string> fields;
};
static void collectWarn(const char* field, const char*, void* ctx) { static_cast<WarnLog*>(ctx)->fields.insert(field); }

static std::string cfgField(const Config& c, const char* f) {
  JsonDocument d;
  configToJson(c, d);
  std::string out;
  serializeJson(d[f], out);
  return out;
}

TEST(config_vectors) {
  JsonDocument doc;
  CHECK_MSG(loadJson("config.json", doc), "tests/vectors/config.json not found or invalid");
  Config def;
  configDefaults(def);
  for (JsonPairConst kv : doc["defaults"].as<JsonObjectConst>()) {
    std::string want;
    serializeJson(kv.value(), want);
    CHECK_MSG(cfgField(def, kv.key().c_str()) == want, std::string("default ") + kv.key().c_str());
  }
  for (JsonObjectConst tc : doc["cases"].as<JsonArrayConst>()) {
    const std::string name = tc["name"].as<const char*>();
    Config c;
    configDefaults(c);
    WarnLog log;
    CHECK_MSG(configApplyJson(c, tc["input"], collectWarn, &log), name);
    for (JsonPairConst kv : tc["expect"].as<JsonObjectConst>()) {
      std::string want;
      serializeJson(kv.value(), want);
      const std::string got = cfgField(c, kv.key().c_str());
      CHECK_MSG(got == want, name + ": " + kv.key().c_str() + " = " + got + ", want " + want);
    }
    std::set<std::string> want;
    for (const char* w : tc["warnings"].as<JsonArrayConst>()) want.insert(w);
    CHECK_MSG(log.fields == want, name + ": warnings differ");
  }
  for (const char* raw : doc["not_objects"].as<JsonArrayConst>()) {
    JsonDocument in;
    deserializeJson(in, raw);
    Config c;
    configDefaults(c);
    CHECK_MSG(!configApplyJson(c, in.as<JsonVariantConst>()), raw);
  }
}

TEST(config_round_trip) {
  Config a;
  configDefaults(a);
  JsonDocument in;
  deserializeJson(in, R"({"child":"T9","lang":"bn","mode":"scan","hold_ms":150,"scan_ms":2000,"listening":false})");
  configApplyJson(a, in.as<JsonVariantConst>());
  JsonDocument saved;
  configToJson(a, saved);
  Config b;
  configDefaults(b);
  configApplyJson(b, saved.as<JsonVariantConst>());
  for (const char* f : {"child", "lang", "mode", "hold_ms", "lockout_ms", "scan_ms", "volume", "listening"})
    CHECK_MSG(cfgField(a, f) == cfgField(b, f), f);
  CHECK(std::strcmp(b.child, "T9") == 0 && std::strcmp(b.lang, "bn") == 0 && b.mode == MODE_SCAN && !b.listening);
}

TEST(language_cycle) {
  Config c;
  configDefaults(c);
  CHECK(langIndex(c) == 0);
  for (uint8_t i = 1; i <= NUM_LANGS; i++) {
    configNextLang(c);
    CHECK(langIndex(c) == i % NUM_LANGS);
    CHECK(std::strcmp(c.lang, LANG_CODES[i % NUM_LANGS]) == 0);
  }
  std::strcpy(c.lang, "zz");  // corrupt value falls back to the first language
  CHECK(langIndex(c) == 0);
}

// ---------------------------------------------------------------- vocabulary

TEST(vocabulary_core_row_is_fixed) {
  CHECK(CORE_KEYS == 4);
  CHECK(std::strcmp(VOCAB[0].en, "yes") == 0);
  CHECK(std::strcmp(VOCAB[1].en, "no") == 0);
  CHECK(std::strcmp(VOCAB[2].en, "help") == 0);
  CHECK(std::strcmp(VOCAB[3].en, "stop") == 0);
  for (size_t i = 0; i < NUM_KEYWORDS; i++) CHECK(KEYWORDS[i].key >= CORE_KEYS && KEYWORDS[i].key < VOCAB_KEYS);
  for (const Word& w : VOCAB)
    for (const char* l : w.label) CHECK(l && std::strlen(l) > 0 && std::strlen(l) <= 16);
}

// ---------------------------------------------------------------- listening (shared vectors)

static const char* kwName(KwResult r) {
  switch (r) {
    case KwResult::Off: return "off";
    case KwResult::Speaking: return "speaking";
    case KwResult::NoKey: return "nokey";
    case KwResult::Below: return "below";
    case KwResult::Waiting: return "waiting";
    case KwResult::Highlight: return "highlight";
  }
  return "?";
}

TEST(listening_vectors) {
  JsonDocument doc;
  CHECK_MSG(loadJson("listening.json", doc), "tests/vectors/listening.json not found or invalid");
  for (JsonObjectConst tc : doc["cases"].as<JsonArrayConst>()) {
    const std::string name = tc["name"].as<const char*>();
    Listening hl(tc["keys"].as<uint8_t>());
    const bool enabled = tc["listening"].as<bool>();
    int step = 0;
    for (JsonObjectConst s : tc["steps"].as<JsonArrayConst>()) {
      const uint32_t t = s["t"].as<uint32_t>();
      const std::string where = name + " step " + std::to_string(step++);
      hl.expire(t);
      if (s["clear"].as<bool>()) hl.clear();
      if (!s["kw"].isNull()) {
        const KwOutcome o = hl.onKeyword(s["kw"].as<const char*>(), s["conf"].as<float>(), t, enabled,
                                         s["speaking"].as<bool>());
        CHECK_MSG(std::string(kwName(o.result)) == s["expect"].as<const char*>(),
                  where + ": got " + kwName(o.result));
      }
      if (!s["lit"].isNull()) {
        std::set<int> want, got;
        for (int k : s["lit"].as<JsonArrayConst>()) want.insert(k);
        for (uint8_t i = 0; i < MAX_KEYS; i++)
          if (hl.lit(i)) got.insert(i + 1);
        CHECK_MSG(got == want, where + ": lit keys differ");
      }
    }
  }
}

TEST(listening_never_lights_core_row) {
  Listening hl(8);
  // Every keyword, twice, confidently: no core key may light.
  uint32_t t = 0;
  for (size_t i = 0; i < NUM_KEYWORDS; i++) {
    hl.onKeyword(KEYWORDS[i].word, 1.0f, t += 10, true, false);
    hl.onKeyword(KEYWORDS[i].word, 1.0f, t += 10, true, false);
  }
  for (uint8_t k = 0; k < CORE_KEYS; k++) CHECK(!hl.lit(k));
  CHECK(hl.any());
}

TEST(listening_survives_millis_wrap) {
  Listening hl(8);
  const uint32_t t = 0xFFFFFF00u;
  hl.onKeyword("paani", 0.9f, t, true, false);
  CHECK(hl.onKeyword("paani", 0.9f, t + 100, true, false).result == KwResult::Highlight);
  CHECK(!hl.expire(t + 5000));  // wraps past 0 but is only 5 s later
  CHECK(hl.lit(4));
  CHECK(hl.expire(t + 100 + HIGHLIGHT_MS));
  CHECK(!hl.lit(4));
}

// ---------------------------------------------------------------- keys

struct Board {
  KeyInput in;
  bool down[MAX_KEYS] = {};
  uint32_t t = 0;
  std::vector<KeyEvent> events;
  explicit Board(uint8_t n) : in(n) {}
  // Advance time in 5 ms polls, like the firmware loop.
  void run(uint32_t ms, uint16_t hold = 0, uint16_t lockout = 1500, bool caregiver = false) {
    for (uint32_t end = t + ms; t < end; t += 5) {
      KeyEvent ev[MAX_KEYS + 1];
      uint8_t n = in.poll(t, down, hold, lockout, caregiver, ev);
      events.insert(events.end(), ev, ev + n);
    }
  }
  int selects(int key = -1) const {
    int n = 0;
    for (auto& e : events) n += e.action == KeyAction::Select && (key < 0 || e.key == key);
    return n;
  }
  int palms() const {
    int n = 0;
    for (auto& e : events) n += e.action == KeyAction::Palm;
    return n;
  }
};

TEST(debounce_ignores_bounce) {
  Debounced d;
  CHECK(!debounce(d, true, 0));
  CHECK(!debounce(d, false, 10));  // bounce
  CHECK(!debounce(d, true, 15));
  CHECK(!debounce(d, true, 40));   // only 25 ms stable
  CHECK(debounce(d, true, 45));    // 30 ms stable
  CHECK(d.stable);
}

TEST(key_press_selects_once) {
  Board b(4);
  b.down[0] = true;
  b.run(500);
  CHECK(b.selects(0) == 1);  // held key speaks once, not repeatedly
  b.down[0] = false;
  b.run(100);
  CHECK(b.selects() == 1);
}

TEST(key_needs_palm_window_hold) {
  Board b(4);
  b.down[1] = true;
  b.run(70);  // 30 ms debounce + under 50 ms hold
  CHECK(b.selects() == 0);
  b.run(20);
  CHECK(b.selects(1) == 1);
}

TEST(key_hold_time) {
  Board b(4);
  b.down[2] = true;
  b.run(300, 500);  // released before the 500 ms hold
  b.down[2] = false;
  b.run(100, 500);
  CHECK(b.selects() == 0);
  b.down[2] = true;
  b.run(600, 500);
  CHECK(b.selects(2) == 1);
}

TEST(key_repeat_lockout) {
  Board b(4);
  for (int i = 0; i < 5; i++) {  // hammer the key every 200 ms
    b.down[0] = true;
    b.run(100);
    b.down[0] = false;
    b.run(100);
  }
  CHECK(b.selects(0) == 1);
  b.run(1500);
  b.down[0] = true;
  b.run(100);
  CHECK(b.selects(0) == 2);
}

TEST(lockout_is_per_key) {
  Board b(4);
  b.down[0] = true;
  b.run(100);
  b.down[0] = false;
  b.down[3] = true;  // Stop right after Yes still works
  b.run(100);
  CHECK(b.selects(0) == 1);
  CHECK(b.selects(3) == 1);
}

TEST(palm_rejection) {
  Board b(8);
  b.down[0] = b.down[1] = b.down[2] = true;
  b.run(400);
  CHECK(b.selects() == 0);
  CHECK(b.palms() == 1);
  b.down[0] = false;  // lifting part of the palm does not fire the others
  b.run(200);
  CHECK(b.selects() == 0);
  b.down[1] = b.down[2] = false;
  b.run(100);
  b.down[3] = true;  // a clean press afterwards works
  b.run(100);
  CHECK(b.selects(3) == 1);
}

TEST(two_keys_is_not_a_palm) {
  Board b(4);
  b.down[0] = b.down[3] = true;
  b.run(200);
  CHECK(b.palms() == 0);
  CHECK(b.selects() == 2);
}

TEST(caregiver_keys_are_settings) {
  Board b(4);
  b.down[1] = true;
  b.run(200, 0, 1500, true);
  CHECK(b.selects() == 0);
  CHECK(b.events.size() == 1 && b.events[0].action == KeyAction::Caregiver && b.events[0].key == 1);
}

// ---------------------------------------------------------------- scanning

TEST(scan_order_without_highlights) {
  Listening hl(8);
  Scanner s(8);
  uint8_t list[MAX_KEYS];
  CHECK(s.buildList(hl, list) == 8);
  for (uint8_t i = 0; i < 8; i++) CHECK(list[i] == i);
}

TEST(scan_lit_keys_first_then_core_row) {
  Listening hl(8);
  hl.onKeyword("khana", 0.9f, 0, true, false);
  hl.onKeyword("khana", 0.9f, 10, true, false);
  hl.onKeyword("paani", 0.9f, 20, true, false);
  hl.onKeyword("paani", 0.9f, 30, true, false);
  Scanner s(8);
  uint8_t list[MAX_KEYS];
  const uint8_t n = s.buildList(hl, list);
  const uint8_t want[] = {4, 5, 0, 1, 2, 3};
  CHECK(n == 6);
  for (uint8_t i = 0; i < n && i < 6; i++) CHECK(list[i] == want[i]);
}

TEST(scan_steps_and_wraps) {
  Listening hl(4);
  Scanner s(4);
  s.restart(0, 0);
  std::vector<int> seen;
  for (uint32_t t = 0; t <= 6000; t += 5)
    if (s.step(t, true, 1000, hl)) seen.push_back(s.cursor());
  const std::vector<int> want = {0, 1, 2, 3, 0, 1, 2};
  CHECK(seen == want);
}

TEST(scan_inactive_hides_cursor) {
  Listening hl(4);
  Scanner s(4);
  s.step(0, true, 1000, hl);
  CHECK(s.cursor() == 0);
  s.step(10, false, 1000, hl);
  CHECK(s.cursor() == -1);
  CHECK(s.select(20) == -1);
}

TEST(switch_selects_cursor_with_gap) {
  Listening hl(4);
  Scanner s(4);
  s.step(0, true, 1000, hl);
  CHECK(s.select(400) == 0);
  CHECK(s.select(500) == -1);  // 100 ms later: too soon
  CHECK(s.select(700) == 0);
}

// ---------------------------------------------------------------- serial protocol

static std::vector<std::string> feedAll(LineBuffer& lb, const std::string& bytes, int* tooLong = nullptr) {
  std::vector<std::string> lines;
  for (char c : bytes) {
    auto r = lb.feed(c);
    if (r == LineBuffer::LINE) lines.push_back(trimLine(lb.line()));
    if (r == LineBuffer::TOO_LONG && tooLong) (*tooLong)++;
  }
  return lines;
}

TEST(line_buffer_partial_lines) {
  LineBuffer lb;
  auto a = feedAll(lb, "pi");
  CHECK(a.empty());
  auto b = feedAll(lb, "ng\r\ncfg\n");
  CHECK(b.size() == 2 && b[0] == "ping" && b[1] == "cfg");
}

TEST(line_buffer_drops_long_line_whole) {
  LineBuffer lb;
  int tooLong = 0;
  std::string big = "press 1" + std::string(400, ' ') + "x\n";
  auto lines = feedAll(lb, big + "ping\n", &tooLong);
  CHECK(tooLong == 1);
  CHECK(lines.size() == 1 && lines[0] == "ping");  // next line unaffected
}

TEST(line_buffer_exact_limit) {
  LineBuffer lb;
  int tooLong = 0;
  auto lines = feedAll(lb, std::string(SERIAL_LINE_MAX, 'a') + "\n", &tooLong);
  CHECK(tooLong == 0 && lines.size() == 1 && lines[0].size() == SERIAL_LINE_MAX);
  lines = feedAll(lb, std::string(SERIAL_LINE_MAX + 1, 'a') + "\n", &tooLong);
  CHECK(tooLong == 1 && lines.empty());
}

TEST(parse_kw) {
  char w[16];
  float c = -1;
  CHECK(parseKw("paani 0.9", w, sizeof(w), c) == nullptr && std::strcmp(w, "paani") == 0 && std::fabs(c - 0.9f) < 1e-6);
  CHECK(parseKw("  toilet   1  ", w, sizeof(w), c) == nullptr && c == 1.0f);
  CHECK(parseKw("paani 0", w, sizeof(w), c) == nullptr && c == 0.0f);
  CHECK(parseKw("paani", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("paani 1.5", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("paani -0.1", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("paani nan", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("paani 0.9x", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("paani 0.9 extra", w, sizeof(w), c) != nullptr);
  CHECK(parseKw("averyveryverylongword 0.9", w, sizeof(w), c) != nullptr);
}

TEST(parse_key_number) {
  CHECK(parseKeyNumber("1", 4) == 0);
  CHECK(parseKeyNumber(" 4 ", 4) == 3);
  CHECK(parseKeyNumber("8", 8) == 7);
  CHECK(parseKeyNumber("5", 4) == -1);
  CHECK(parseKeyNumber("0", 4) == -1);
  CHECK(parseKeyNumber("", 4) == -1);
  CHECK(parseKeyNumber("1abc", 4) == -1);
  CHECK(parseKeyNumber("-1", 4) == -1);
  CHECK(parseKeyNumber("99999999999", 8) == -1);
}

TEST(csv_safe) {
  char s[] = "a,b\r\nc";
  csvSafe(s);
  CHECK(std::strcmp(s, "a_b__c") == 0);
}

TEST(child_code_rules) {
  CHECK(childCodeValid("C01"));
  CHECK(childCodeValid("ABC-12_"));
  CHECK(!childCodeValid("ABCDEFGH"));
  CHECK(!childCodeValid(""));
  CHECK(!childCodeValid(nullptr));
  CHECK(!childCodeValid("C,01"));
  CHECK(!childCodeValid("C 01"));
}

// ---------------------------------------------------------------- caregiver mode

TEST(caregiver_enter_exit) {
  Caregiver c;
  CHECK(c.update(false, 0) == Caregiver::NONE);
  CHECK(c.update(true, 10) == Caregiver::ENTERED && c.active());
  CHECK(c.update(true, 20) == Caregiver::NONE);
  CHECK(c.update(false, 30) == Caregiver::EXITED && !c.active());
}

TEST(caregiver_times_out_if_magnet_left) {
  Caregiver c;
  c.update(true, 0);
  c.activity(60000);  // a settings key a minute in
  CHECK(c.update(true, 60000 + CAREGIVER_IDLE_MS - 1) == Caregiver::NONE);
  CHECK(c.update(true, 60000 + CAREGIVER_IDLE_MS) == Caregiver::TIMED_OUT);
  CHECK(!c.active());
  // Magnet still there: stays off, so the child keeps the keys.
  CHECK(c.update(true, 400000) == Caregiver::NONE && !c.active());
  CHECK(c.update(false, 400010) == Caregiver::NONE);
  CHECK(c.update(true, 400020) == Caregiver::ENTERED);
}

// ---------------------------------------------------------------- main

int main() {
  for (auto& tc : registry()) {
    g_current = tc.name;
    const int before = g_failures;
    tc.fn();
    std::printf("%s %s\n", g_failures == before ? "ok  " : "FAIL", tc.name);
  }
  std::printf("\n%zu tests, %d checks, %d failures\n", registry().size(), g_checks, g_failures);
  return g_failures ? 1 : 0;
}
