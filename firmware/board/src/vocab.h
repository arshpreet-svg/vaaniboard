#pragma once
#include <Arduino.h>

// Labels are transliterated because the 16x2 LCD cannot show Devanagari,
// Tamil or Bengali script. Order: Hindi, Tamil, Bengali.
struct Word {
  const char* label[3];
  const char* en;
  bool urgent;  // urgent words beep three times when no voice file is loaded
};

// Keys 0-3 are the core row: never highlighted, dimmed or remapped, so the
// child can always refuse a suggestion or ask for help.
constexpr uint8_t CORE_KEYS = 4;

constexpr Word VOCAB[8] = {
    {{"HAAN", "AAMAM", "HYAN"}, "yes", false},
    {{"NAHI", "ILLAI", "NA"}, "no", false},
    {{"MADAD", "UDHAVI", "SAHAJYO"}, "help", true},
    {{"RUKO", "NILLU", "THAMO"}, "stop", true},
    {{"PAANI", "THANNEER", "JOL"}, "water", false},
    {{"KHANA", "SAAPADU", "KHABAR"}, "food", false},
    {{"TOILET", "TOILET", "TOILET"}, "toilet", true},
    {{"DARD", "VALI", "BYATHA"}, "pain", true},
};

// Keyword reported by the listening model -> vocabulary key it highlights.
// Only vocabulary keys appear here; the core row is never highlighted.
struct KeywordMap {
  const char* word;
  uint8_t key;
};

constexpr KeywordMap KEYWORDS[] = {
    {"paani", 4}, {"thanneer", 4}, {"jol", 4},
    {"khana", 5}, {"saapadu", 5},  {"khabar", 5},
    {"toilet", 6},
    {"dard", 7},  {"vali", 7},     {"byatha", 7},
};
