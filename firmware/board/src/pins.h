#pragma once
#include <Arduino.h>

// Every pin lives in this file, so moving to the ESP32-S3 later is a one-file change.

#ifndef NUM_KEYS
#define NUM_KEYS 4
#endif

static_assert(NUM_KEYS == 4 || NUM_KEYS == 8, "NUM_KEYS must be 4 or 8");

// Keys 0-3 are the core row (Yes, No, Help, Stop); keys 4-7 are vocabulary keys.
// Each key: one leg to the GPIO, the diagonally opposite leg to GND.
// GPIO 34, 35, 36 and 39 are input-only with no internal pull-up, so keys 4-7
// also need a 10k resistor from the GPIO to 3V3.
constexpr uint8_t KEY_PINS[8] = {32, 33, 27, 13, 34, 35, 36, 39};

// One LED above each key: GPIO -> 220 ohm -> LED long leg; short leg -> GND.
constexpr int8_t LED_PINS[8] = {16, 17, 18, 19, 5, 26, 15, 2};

// Listening / status LED. The 8-key build needs GPIO 2 for key 8's LED,
// so status is shown on the LCD only.
constexpr int8_t STATUS_LED = (NUM_KEYS == 4) ? 2 : -1;

constexpr uint8_t ACCESS_PIN = 14;     // big access switch (5th push button) to GND
constexpr uint8_t REED_PIN = 4;        // hidden caregiver switch (magnet)
constexpr bool REED_ACTIVE_LOW = true; // most reed modules pull DO low near a magnet
constexpr uint8_t BUZZER_PIN = 23;     // buzzer + ; buzzer - to GND
constexpr uint8_t AUDIO_DAC_PIN = 25;  // DAC1 -> amplifier input (PAM8403 / similar)
constexpr uint8_t I2C_SDA = 21;
constexpr uint8_t I2C_SCL = 22;
