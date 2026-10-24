#include "listening.h"

#include <strings.h>

#include "timing.h"
#include "vocab.h"

int8_t keywordKey(const char* word) {
  for (size_t i = 0; i < NUM_KEYWORDS; i++) {
    if (strcasecmp(KEYWORDS[i].word, word) == 0) return KEYWORDS[i].key;
  }
  return -1;
}

Listening::Listening(uint8_t numKeys) : n_(numKeys > MAX_KEYS ? MAX_KEYS : numKeys) {}

KwOutcome Listening::onKeyword(const char* word, float conf, uint32_t t, bool enabled, bool speaking) {
  if (!enabled) return {KwResult::Off, -1};
  if (speaking) return {KwResult::Speaking, -1};

  const int8_t key = keywordKey(word);
  const bool confident = conf >= KW_THRESHOLD;
  const bool twice =
      confident && lastConf_ >= KW_THRESHOLD && strcasecmp(lastKw_, word) == 0 && t - lastAt_ <= KW_PAIR_MS;
  copyStr(lastKw_, word, sizeof(lastKw_));
  lastConf_ = conf;
  lastAt_ = t;

  // The core row is never highlighted, whatever the keyword table says.
  if (key < CORE_KEYS || key >= n_) return {KwResult::NoKey, key};
  if (!twice) return {confident ? KwResult::Waiting : KwResult::Below, key};

  lastConf_ = 0;  // the next highlight needs a fresh pair
  until_[key] = t + HIGHLIGHT_MS;
  if (until_[key] == 0) until_[key] = 1;  // 0 means "off"
  return {KwResult::Highlight, key};
}

bool Listening::expire(uint32_t t) {
  bool changed = false;
  for (uint8_t i = 0; i < n_; i++) {
    if (until_[i] && reached(t, until_[i])) {
      until_[i] = 0;
      changed = true;
    }
  }
  return changed;
}

bool Listening::clear() {
  bool any = false;
  for (uint8_t i = 0; i < n_; i++) {
    if (until_[i]) any = true;
    until_[i] = 0;
  }
  return any;
}

bool Listening::any() const {
  for (uint8_t i = 0; i < n_; i++) {
    if (until_[i]) return true;
  }
  return false;
}
