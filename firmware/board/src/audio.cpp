#include "audio.h"

#include <LittleFS.h>

#include "config.h"
#include "pins.h"

namespace {

struct Job {
  char path[24];
  uint8_t beeps;
};

constexpr uint32_t MAX_CLIP_SECONDS = 3;  // keeps a clip in RAM and under the task watchdog

QueueHandle_t jobs;
volatile bool busy = false;
volatile bool abortClip = false;
volatile uint32_t lastEnd = 0;
bool fsMounted = false;

uint32_t le32(const uint8_t* b) { return b[0] | b[1] << 8 | b[2] << 16 | (uint32_t)b[3] << 24; }
uint16_t le16(const uint8_t* b) { return b[0] | b[1] << 8; }

// Loads a mono 8- or 16-bit PCM WAV into RAM as unsigned 8-bit samples.
uint8_t* loadWav(const char* path, uint32_t& samples, uint32_t& rate) {
  if (!fsMounted || !LittleFS.exists(path)) return nullptr;
  File f = LittleFS.open(path, "r");
  if (!f) return nullptr;

  uint8_t hdr[12];
  if (f.read(hdr, 12) != 12 || memcmp(hdr, "RIFF", 4) != 0 || memcmp(hdr + 8, "WAVE", 4) != 0) {
    f.close();
    return nullptr;
  }
  uint16_t format = 0, channels = 0, bits = 0;
  uint32_t dataLen = 0;
  bool haveData = false;
  rate = 0;
  while (f.available() >= 8) {
    uint8_t c[8];
    f.read(c, 8);
    uint32_t len = le32(c + 4);
    if (memcmp(c, "fmt ", 4) == 0 && len >= 16) {
      uint8_t b[16];
      if (f.read(b, 16) != 16) break;
      format = le16(b);
      channels = le16(b + 2);
      rate = le32(b + 4);
      bits = le16(b + 14);
      f.seek(f.position() + len - 16);
    } else if (memcmp(c, "data", 4) == 0) {
      dataLen = len;
      haveData = true;
      break;
    } else {
      f.seek(f.position() + len + (len & 1));
    }
  }
  if (!haveData || format != 1 || channels != 1 || (bits != 8 && bits != 16) || rate < 4000 || rate > 22050) {
    f.close();
    return nullptr;
  }

  const uint32_t bytesPerSample = bits / 8;
  samples = min(dataLen / bytesPerSample, rate * MAX_CLIP_SECONDS);
  uint8_t* buf = (uint8_t*)malloc(samples);
  if (!buf) {
    f.close();
    return nullptr;
  }
  if (bits == 8) {
    samples = f.read(buf, samples);
  } else {
    int16_t chunk[256];
    uint32_t done = 0;
    while (done < samples) {
      size_t want = min<uint32_t>(256, samples - done);
      size_t got = f.read((uint8_t*)chunk, want * 2) / 2;
      if (got == 0) break;
      for (size_t i = 0; i < got; i++) buf[done + i] = (uint8_t)((chunk[i] >> 8) + 128);
      done += got;
    }
    samples = done;
  }
  f.close();
  return buf;
}

bool playWav(const char* path) {
  uint32_t samples = 0, rate = 0;
  uint8_t* buf = loadWav(path, samples, rate);
  if (!buf) return false;

  const int vol = min(cfg.volume, VOLUME_CAP);
  for (uint32_t i = 0; i < samples; i++) buf[i] = (uint8_t)(128 + ((int)buf[i] - 128) * vol / 100);

  // The whole clip is in RAM, so timing is a simple paced loop with no flash access.
  const int64_t t0 = esp_timer_get_time();
  for (uint32_t i = 0; i < samples && !abortClip; i++) {
    const int64_t due = t0 + (int64_t)i * 1000000 / rate;
    while (esp_timer_get_time() < due) {
    }
    dacWrite(AUDIO_DAC_PIN, buf[i]);
  }
  dacWrite(AUDIO_DAC_PIN, 128);
  dacDisable(AUDIO_DAC_PIN);  // silences idle hiss
  free(buf);
  return true;
}

void audioTask(void*) {
  Job job;
  for (;;) {
    if (xQueueReceive(jobs, &job, portMAX_DELAY) != pdTRUE) continue;
    busy = true;
    abortClip = false;
    if (!(job.path[0] && playWav(job.path))) {
      for (uint8_t i = 0; i < job.beeps && !abortClip; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        vTaskDelay(pdMS_TO_TICKS(80));
        digitalWrite(BUZZER_PIN, LOW);
        vTaskDelay(pdMS_TO_TICKS(90));
      }
    }
    lastEnd = millis();
    busy = false;
  }
}

}  // namespace

void audioBegin() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  fsMounted = LittleFS.begin(false);  // no filesystem uploaded yet = beeps only
  jobs = xQueueCreate(2, sizeof(Job));
  xTaskCreatePinnedToCore(audioTask, "audio", 4096, nullptr, 2, nullptr, 0);
}

void audioSay(const char* path, uint8_t fallbackBeeps) {
  Job job;
  strlcpy(job.path, path ? path : "", sizeof(job.path));
  job.beeps = fallbackBeeps;
  if (busy) abortClip = true;  // a new press interrupts the current word
  xQueueReset(jobs);
  xQueueSend(jobs, &job, 0);
}

bool audioBusy() { return busy; }

bool audioFsMounted() { return fsMounted; }

bool audioClipExists(const char* path) { return fsMounted && LittleFS.exists(path); }

uint32_t audioLastEndMs() { return lastEnd; }
