#pragma once
#include <Arduino.h>

// Speech output. Plays a WAV clip from LittleFS through the DAC (pin 25) into an
// amplifier; if the clip is missing (no speaker or no voices uploaded yet) it
// beeps the buzzer `fallbackBeeps` times instead. Runs on its own task, so it
// never blocks key reading. A new request interrupts the current clip.
void audioBegin();
void audioSay(const char* path, uint8_t fallbackBeeps);
bool audioBusy();
bool audioFsMounted();
