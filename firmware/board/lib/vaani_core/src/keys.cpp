#include "keys.h"

bool debounce(Debounced& d, bool now, uint32_t t) {
  if (now != d.raw) {
    d.raw = now;
    d.changedAt = t;
  }
  if (d.stable != d.raw && t - d.changedAt >= DEBOUNCE_MS) {
    d.stable = d.raw;
    return true;
  }
  return false;
}

KeyInput::KeyInput(uint8_t numKeys) : n_(numKeys > MAX_KEYS ? MAX_KEYS : numKeys) {}

uint8_t KeyInput::poll(uint32_t t, const bool* pressed, uint16_t holdMs, uint16_t lockoutMs, bool caregiver,
                       KeyEvent* out) {
  uint8_t count = 0;
  uint8_t down = 0;
  for (uint8_t i = 0; i < n_; i++) {
    State& k = keys_[i];
    if (debounce(k.in, pressed[i], t)) {
      k.fired = false;
      if (k.in.stable) k.downAt = t;
    }
    if (k.in.stable) down++;
  }

  if (down >= PALM_KEYS && !palm_) {
    palm_ = true;
    out[count++] = {KeyAction::Palm, -1};
  }
  if (palm_) {
    // Every key that was part of the palm is used up until it is released.
    for (uint8_t i = 0; i < n_; i++) {
      if (keys_[i].in.stable) keys_[i].fired = true;
    }
    if (down == 0) palm_ = false;
    return count;
  }

  const uint32_t hold = holdMs > PALM_WINDOW_MS ? holdMs : PALM_WINDOW_MS;
  for (uint8_t i = 0; i < n_; i++) {
    State& k = keys_[i];
    if (!k.in.stable || k.fired || t - k.downAt < hold) continue;
    k.fired = true;
    if (caregiver) {
      out[count++] = {KeyAction::Caregiver, (int8_t)i};
    } else if (!k.everFired || t - k.lastFire >= lockoutMs) {
      k.everFired = true;
      k.lastFire = t;
      out[count++] = {KeyAction::Select, (int8_t)i};
    }
  }
  return count;
}
