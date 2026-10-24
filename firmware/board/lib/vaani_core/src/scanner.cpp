#include "scanner.h"

#include "timing.h"
#include "vocab.h"

Scanner::Scanner(uint8_t numKeys) : n_(numKeys > MAX_KEYS ? MAX_KEYS : numKeys) {}

void Scanner::restart(uint32_t t, uint32_t delayMs) {
  cursor_ = -1;
  next_ = t + delayMs;
}

uint8_t Scanner::buildList(const Listening& hl, uint8_t* out) const {
  uint8_t len = 0;
  for (uint8_t i = CORE_KEYS; i < n_; i++) {
    if (hl.lit(i)) out[len++] = i;
  }
  const uint8_t upto = len > 0 ? CORE_KEYS : n_;
  for (uint8_t i = 0; i < upto; i++) out[len++] = i;
  return len;
}

bool Scanner::step(uint32_t t, bool active, uint16_t scanMs, const Listening& hl) {
  if (!active) {
    cursor_ = -1;
    return false;
  }
  if (!reached(t, next_)) return false;
  uint8_t list[MAX_KEYS];
  const uint8_t len = buildList(hl, list);
  pos_ = cursor_ < 0 ? 0 : (pos_ + 1) % len;
  cursor_ = list[pos_];
  next_ = t + scanMs;
  return true;
}

int8_t Scanner::select(uint32_t t) {
  if (cursor_ < 0) return -1;
  if (everSelected_ && t - lastSelect_ < SWITCH_GAP_MS) return -1;
  everSelected_ = true;
  lastSelect_ = t;
  return cursor_;
}
