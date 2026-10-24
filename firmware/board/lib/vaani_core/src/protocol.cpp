#include "protocol.h"

#include <stdlib.h>
#include <string.h>

#include "timing.h"

LineBuffer::Result LineBuffer::feed(char c) {
  if (c == '\n') {
    const bool dropped = overflow_;
    buf_[len_] = 0;
    len_ = 0;
    overflow_ = false;
    if (dropped) {
      buf_[0] = 0;
      return TOO_LONG;
    }
    return LINE;
  }
  if (overflow_) return NONE;
  if (len_ < SERIAL_LINE_MAX) buf_[len_++] = c;
  else overflow_ = true;
  return NONE;
}

char* trimLine(char* line) {
  while (*line == ' ' || *line == '\t') line++;
  size_t n = strlen(line);
  while (n && (line[n - 1] == ' ' || line[n - 1] == '\r' || line[n - 1] == '\t')) line[--n] = 0;
  return line;
}

const char* parseKw(const char* args, char* word, size_t wordSize, float& conf) {
  static const char* const USAGE = "usage: kw <word> <confidence 0-1>";
  while (*args == ' ') args++;
  size_t n = 0;
  while (args[n] && args[n] != ' ') n++;
  if (n == 0) return USAGE;
  if (n >= wordSize) return "keyword too long (max 15 characters)";
  memcpy(word, args, n);
  word[n] = 0;

  const char* rest = args + n;
  while (*rest == ' ') rest++;
  if (!*rest) return USAGE;
  char* end = nullptr;
  const double v = strtod(rest, &end);
  while (end && *end == ' ') end++;
  if (end == rest || (end && *end)) return USAGE;
  if (!(v >= 0.0 && v <= 1.0)) return "confidence must be between 0 and 1";
  conf = (float)v;
  return nullptr;
}

int parseKeyNumber(const char* s, uint8_t numKeys) {
  while (*s == ' ') s++;
  if (!*s) return -1;
  int v = 0;
  for (; *s >= '0' && *s <= '9'; s++) {
    v = v * 10 + (*s - '0');
    if (v > 255) return -1;
  }
  while (*s == ' ') s++;
  if (*s || v < 1 || v > numKeys) return -1;
  return v - 1;
}

void csvSafe(char* s) {
  for (; *s; s++) {
    if (*s == ',' || *s == '\r' || *s == '\n') *s = '_';
  }
}

Caregiver::Change Caregiver::update(bool magnet, uint32_t t) {
  if (!magnet) {
    latched_ = false;
    if (active_) {
      active_ = false;
      return EXITED;
    }
    return NONE;
  }
  if (!active_ && !latched_) {
    active_ = true;
    last_ = t;
    return ENTERED;
  }
  if (active_ && t - last_ >= CAREGIVER_IDLE_MS) {
    active_ = false;
    latched_ = true;
    return TIMED_OUT;
  }
  return NONE;
}
