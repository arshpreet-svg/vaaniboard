#pragma once
#include <stdint.h>

#include "keys.h"
#include "listening.h"

constexpr uint32_t SWITCH_GAP_MS = 300;  // min time between access-switch selections

// Switch scanning: a cursor steps through the keys and one switch press
// selects the lit key. When listening has highlighted answers, the cursor
// visits those first and then the core row, so the child can still refuse.
class Scanner {
 public:
  explicit Scanner(uint8_t numKeys);

  void restart(uint32_t t, uint32_t delayMs);  // cursor off, first step after delayMs
  // Advances the cursor when its time is due. Returns true when it moved.
  bool step(uint32_t t, bool active, uint16_t scanMs, const Listening& hl);
  int8_t cursor() const { return cursor_; }
  // Fills `out` (room for MAX_KEYS) with the visiting order and returns its length.
  uint8_t buildList(const Listening& hl, uint8_t* out) const;
  // Access switch pressed: returns the key to select, or -1 (no cursor, or too
  // soon after the previous selection).
  int8_t select(uint32_t t);

 private:
  uint8_t n_;
  int8_t cursor_ = -1;
  uint8_t pos_ = 0;
  uint32_t next_ = 0;
  uint32_t lastSelect_ = 0;
  bool everSelected_ = false;
};
