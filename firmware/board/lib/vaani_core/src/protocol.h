#pragma once
#include <stddef.h>
#include <stdint.h>

// Serial protocol version (README, "Serial commands"). Bump only for changes an
// older Studio cannot ignore; adding fields or commands keeps the version.
constexpr uint8_t PROTO_VERSION = 1;
constexpr size_t SERIAL_LINE_MAX = 255;

// Assembles serial bytes into lines. A line longer than SERIAL_LINE_MAX is dropped
// whole (never truncated and run), and reported once its newline arrives.
class LineBuffer {
 public:
  enum Result : uint8_t { NONE, LINE, TOO_LONG };
  Result feed(char c);
  // The completed line after LINE, valid until the next feed().
  char* line() { return buf_; }

 private:
  char buf_[SERIAL_LINE_MAX + 1] = "";
  size_t len_ = 0;
  bool overflow_ = false;
};

// Strips leading spaces and trailing spaces / CR in place.
char* trimLine(char* line);

// "kw <word> <confidence>": word 1-15 chars, confidence a number in 0..1.
// Returns nullptr on success, or the error text to print after "ERR ".
const char* parseKw(const char* args, char* word, size_t wordSize, float& conf);

// "press <n>": strictly a whole number 1..numKeys. Returns the 0-based key or -1.
int parseKeyNumber(const char* s, uint8_t numKeys);

// Event-log line fields are comma separated; replaces anything that would
// break the line ("," CR LF) so a stray value can never corrupt the log.
void csvSafe(char* s);

// Caregiver mode turns the keys into settings keys, so it must never be left on
// by accident: it ends when the magnet is removed or after CAREGIVER_IDLE_MS
// with no settings key pressed, and does not restart until the magnet is
// removed and brought back.
constexpr uint32_t CAREGIVER_IDLE_MS = 120000;

class Caregiver {
 public:
  enum Change : uint8_t { NONE, ENTERED, EXITED, TIMED_OUT };
  Change update(bool magnet, uint32_t t);  // magnet = debounced reed state
  void activity(uint32_t t) { last_ = t; }
  bool active() const { return active_; }

 private:
  bool active_ = false;
  bool latched_ = false;  // timed out while the magnet is still there
  uint32_t last_ = 0;
};
