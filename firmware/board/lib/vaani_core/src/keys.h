#pragma once
#include <stdint.h>

constexpr uint8_t MAX_KEYS = 8;
constexpr uint32_t DEBOUNCE_MS = 30;
constexpr uint32_t PALM_WINDOW_MS = 50;  // min hold, so a palm press is seen as 3+ keys first
constexpr uint8_t PALM_KEYS = 3;         // this many keys down at once is a palm or forearm

struct Debounced {
  bool raw = false;
  bool stable = false;
  uint32_t changedAt = 0;
};

// Returns true when the debounced state changes.
bool debounce(Debounced& d, bool now, uint32_t t);

enum class KeyAction : uint8_t { Select, Caregiver, Palm };

struct KeyEvent {
  KeyAction action;
  int8_t key;  // 0-based; -1 for Palm
};

// Debounce, hold-to-speak, per-key repeat lockout and palm rejection for the
// key matrix. Feed it raw readings every poll; it reports what to act on.
class KeyInput {
 public:
  explicit KeyInput(uint8_t numKeys);

  // pressed[i]: raw reading of key i (true = down). Writes events to `out`
  // (room for MAX_KEYS + 1) and returns how many.
  uint8_t poll(uint32_t t, const bool* pressed, uint16_t holdMs, uint16_t lockoutMs, bool caregiver, KeyEvent* out);

  bool palmActive() const { return palm_; }

 private:
  struct State {
    Debounced in;
    bool fired = false;
    uint32_t downAt = 0;
    uint32_t lastFire = 0;
    bool everFired = false;
  };
  uint8_t n_;
  State keys_[MAX_KEYS];
  bool palm_ = false;
};
