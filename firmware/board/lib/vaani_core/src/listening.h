#pragma once
#include <stdint.h>

#include "keys.h"

constexpr uint32_t HIGHLIGHT_MS = 10000;  // a highlight fades after 10 s
constexpr float KW_THRESHOLD = 0.8f;
constexpr uint32_t KW_PAIR_MS = 1500;     // two confident results must arrive this close together
constexpr uint32_t SPEAK_MUTE_MS = 300;   // keyword results are ignored this long after the board speaks

enum class KwResult : uint8_t {
  Off,        // listening is switched off in the profile
  Speaking,   // the board is (or was just) speaking: its own voice must not trigger a highlight
  NoKey,      // keyword does not map to a vocabulary key on this board
  Below,      // confidence under the threshold
  Waiting,    // first confident result: needs a second one in a row
  Highlight,  // second confident result: key lit
};

struct KwOutcome {
  KwResult result;
  int8_t key;  // 0-based key the keyword maps to, or -1
};

// Listening only assists. A keyword can light a vocabulary key, but only after
// two confident results in a row; the light never speaks or selects anything,
// fades after HIGHLIGHT_MS, and the core row can never be lit.
class Listening {
 public:
  explicit Listening(uint8_t numKeys);

  KwOutcome onKeyword(const char* word, float conf, uint32_t t, bool enabled, bool speaking);
  bool expire(uint32_t t);  // true if any highlight ended
  bool clear();             // true if anything was lit
  bool lit(uint8_t key) const { return key < n_ && until_[key] != 0; }
  bool any() const;
  // Clamped to 0..1; the parser rejects anything outside before it gets here.
  static bool confidenceValid(float conf) { return conf >= 0.0f && conf <= 1.0f; }

 private:
  uint8_t n_;
  uint32_t until_[MAX_KEYS] = {};  // 0 = not highlighted
  char lastKw_[16] = "";
  float lastConf_ = 0;
  uint32_t lastAt_ = 0;
};

// Maps a keyword to its key (0-based) using the generated KEYWORDS table, or -1.
int8_t keywordKey(const char* word);
