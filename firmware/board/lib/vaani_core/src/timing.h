#pragma once
#include <stdint.h>

// Hardware-free core of the board firmware. Nothing in lib/vaani_core touches a
// pin, the serial port or flash, so it builds and runs on a laptop (test_host/).

// True once `now` has reached `when`, correct across the 49-day millis() wrap.
inline bool reached(uint32_t now, uint32_t when) { return (int32_t)(now - when) >= 0; }

// Bounded string copy that always terminates (strlcpy is not on every host libc).
inline void copyStr(char* dst, const char* src, uint32_t size) {
  if (!size) return;
  uint32_t i = 0;
  for (; src && src[i] && i + 1 < size; i++) dst[i] = src[i];
  dst[i] = 0;
}
