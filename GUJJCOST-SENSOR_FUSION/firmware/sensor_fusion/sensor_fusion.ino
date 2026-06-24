/*
  ESP32 Dual-Core Sensor Hub — Noise-Filtered Edition v3
  =====================================================
  Core 1: All sensor reads at full rate — ADXL345, TF-Luna, DHT11, Flame, Mic, Gas
  Core 0: WiFi management + WebSocket broadcast — zero sensor timing interference

  Fixes in v3:
  DHT11:   3-attempt retry, range validation, stale-data timeout, dht_errors counter
  Sound:   digitalRead threshold detection + analogRead raw level on separate fields
           mic_digital = 1 when sound detected (DO pin)
           mic_raw     = 0..4095 analog level (AO pin, connect to GPIO35)

  Noise filters (v2):
  ADXL345: Hardware BW register 12.5Hz, dead-band 0.05g, IIR low-pass alpha=0.15
  TF-Luna: Strength gate >200, jump gate 50cm/frame, 5-sample median filter
*/

#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <esp_task_wdt.h>

// ─── Network ───────────────────────────────────────────────────────────────
const char *WIFI_SSID        = "Airtel_SKPM69";
const char *WIFI_PASS        = "qwertyuiopA@1";
const uint16_t  WS_PORT      = 81;
const uint32_t  WIFI_RETRY_MS = 5000;

// ─── Pin Definitions ───────────────────────────────────────────────────────
#define I2C_SDA       21
#define I2C_SCL       22
#define TFLUNA_RX     16    // ESP32 RX2 ← TF-Luna TX
#define TFLUNA_TX     17    // ESP32 TX2 → TF-Luna RX
#define DHTPIN        32
#define DHTTYPE       DHT11
// Sound sensor:
//   DO (digital threshold out) → GPIO33  — gives 0/1 on loud sound
//   AO (analog raw mic level)  → GPIO35  — gives 0..4095 continuous level
//   If you only have DO wired, leave SOUND_AO_PIN as-is, mic_raw will be 0.
#define SOUND_DO_PIN  33    // digital threshold output (DO)
#define SOUND_AO_PIN  35    // analog raw output (AO) — input-only pin, safe
#define FLAME_PIN     25
#define GAS_PIN       34

// ─── Timing ────────────────────────────────────────────────────────────────
#define SENSOR_LOOP_MS    10    // 100Hz sensor loop
#define BROADCAST_MS     100    // 10Hz WebSocket broadcast
#define WDT_TIMEOUT_S      5
#define DHT_POLL_MS     2500    // 2.5s — DHT11 needs >2s between reads
#define DHT_STALE_MS   10000    // mark invalid if no good read for 10s

// ─── ADXL345 direct register addresses ────────────────────────────────────
#define ADXL_ADDR            0x53
#define ADXL_REG_RATE        0x2C
#define ADXL_REG_POWER       0x2D
#define ADXL_REG_FORMAT      0x31
#define ADXL_REG_FIFO        0x38
#define ADXL_VAL_RATE_12HZ   0x07  // 12.5Hz BW — kills WiFi-induced spikes
#define ADXL_VAL_MEASURE     0x08
#define ADXL_VAL_FULLRES_4G  0x09  // full resolution ±4g, 3.9mg/LSB
#define ADXL_VAL_FIFO_STREAM 0x80

// ─── Filter constants ──────────────────────────────────────────────────────
#define ADXL_DEAD_BAND      0.05f
#define ADXL_IIR_ALPHA      0.15f
#define LUNA_STRENGTH_MIN    200
#define LUNA_STRENGTH_MAX  65000
#define LUNA_JUMP_LIMIT_CM    50
#define LUNA_MEDIAN_N          5

// ─── Shared Data Structure ─────────────────────────────────────────────────
struct SensorData {
    // TF-Luna
    int      lidar_cm         = 0;
    int      lidar_strength   = 0;
    bool     lidar_valid      = false;

    // ADXL345 (filtered, gravity removed from Z)
    float    ax = 0, ay = 0, az = 0;
    float    roll = 0, pitch = 0;
    bool     imu_valid        = false;

    // DHT11
    float    temp_c           = 0;
    float    humidity         = 0;
    bool     dht_valid        = false;
    uint32_t dht_last_good_ms = 0;   // timestamp of last successful read
    uint32_t dht_errors       = 0;   // failed read attempts

    // Sound sensor — two fields
    bool     mic_digital      = false;  // DO: threshold trigger (loud = true)
    int      mic_raw          = 0;      // AO: 0..4095 analog level

    // Other sensors
    bool     flame_detected   = false;
    int      gas_raw          = 0;

    // Health counters
    uint32_t lidar_frames     = 0;
    uint32_t lidar_discarded  = 0;
    uint32_t imu_reads        = 0;
    uint32_t checksum_errors  = 0;
    uint32_t last_updated_ms  = 0;
};

SensorData        sensorData;
SemaphoreHandle_t dataMutex;

// ─── Objects ───────────────────────────────────────────────────────────────
DHT                      dht(DHTPIN, DHTTYPE);
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
WebSocketsServer         webSocket = WebSocketsServer(WS_PORT);

// ─── Task Handles ──────────────────────────────────────────────────────────
TaskHandle_t sensorTaskHandle = NULL;
TaskHandle_t wifiTaskHandle   = NULL;

// ─── TF-Luna parser + filter state ─────────────────────────────────────────
static uint8_t luna_frame[9];
static uint8_t luna_idx         = 0;
static int     luna_median_buf[LUNA_MEDIAN_N] = {0};
static int     luna_median_pos  = 0;
static bool    luna_median_full = false;
static int     luna_prev_dist   = -1;

static int luna_median_calc() {
    int tmp[LUNA_MEDIAN_N];
    int n = luna_median_full ? LUNA_MEDIAN_N : luna_median_pos;
    if (n == 0) return 0;
    memcpy(tmp, luna_median_buf, n * sizeof(int));
    for (int i = 1; i < n; i++) {
        int key = tmp[i], j = i - 1;
        while (j >= 0 && tmp[j] > key) { tmp[j+1] = tmp[j--]; }
        tmp[j+1] = key;
    }
    return tmp[n / 2];
}

static bool adxl_reg_write(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(ADXL_ADDR);
    Wire.write(reg);
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SENSOR TASK — Core 1
// ═══════════════════════════════════════════════════════════════════════════
void sensorTask(void *param) {
    esp_task_wdt_add(NULL);

    Wire.begin(I2C_SDA, I2C_SCL);
    Serial2.begin(115200, SERIAL_8N1, TFLUNA_RX, TFLUNA_TX);

    // DHT11 init
    // Note: DHT11 needs a 4.7kΩ–10kΩ pull-up resistor on the data line.
    // Without it, reads fail intermittently. If you see constant -1 values,
    // this is the first thing to check before suspecting software.
    dht.begin();

    // Give DHT11 1 second to stabilise before first read
    delay(1000);
    esp_task_wdt_reset();

    pinMode(SOUND_DO_PIN, INPUT);
    // SOUND_AO_PIN (GPIO35) is input-only — no pinMode needed

    // ── ADXL345 init ──────────────────────────────────────────────────────
    bool adxl_ok = accel.begin();
    if (adxl_ok) {
        adxl_reg_write(ADXL_REG_RATE,   ADXL_VAL_RATE_12HZ);   // 12.5Hz HW BW
        adxl_reg_write(ADXL_REG_FORMAT, ADXL_VAL_FULLRES_4G);  // ±4g full res
        adxl_reg_write(ADXL_REG_POWER,  ADXL_VAL_MEASURE);     // wake up
        adxl_reg_write(ADXL_REG_FIFO,   ADXL_VAL_FIFO_STREAM); // FIFO stream
        Serial.println("[SENSOR] ADXL345 ready — BW=12.5Hz FIFO=stream ±4g");
    } else {
        Serial.println("[SENSOR] ADXL345 not found — check SDA=21 SCL=22");
    }

    // ── ADXL bias calibration: 100 samples ────────────────────────────────
    float bias_x = 0, bias_y = 0, bias_z = 0;
    if (adxl_ok) {
        Serial.println("[SENSOR] Keep still 2s — calibrating ADXL bias...");
        for (int i = 0; i < 100; i++) {
            sensors_event_t e;
            accel.getEvent(&e);
            bias_x += e.acceleration.x / 9.80665f;
            bias_y += e.acceleration.y / 9.80665f;
            bias_z += e.acceleration.z / 9.80665f;
            esp_task_wdt_reset();
            delay(20);
        }
        bias_x /= 100.0f;
        bias_y /= 100.0f;
        bias_z  = bias_z / 100.0f - 1.0f;
        Serial.printf("[SENSOR] Bias: ax=%.4f ay=%.4f az=%.4f g\n",
                      bias_x, bias_y, bias_z);
    }

    float ax_filt = 0, ay_filt = 0, az_filt = 0;
    uint32_t last_dht = 0;

    Serial.println("[SENSOR] Running on Core " + String(xPortGetCoreID()));

    for (;;) {
        uint32_t now = millis();
        esp_task_wdt_reset();

        // ══ TF-Luna ══════════════════════════════════════════════════════════
        while (Serial2.available()) {
            uint8_t b = Serial2.read();
            if (luna_idx == 0 && b != 0x59) continue;
            if (luna_idx == 1 && b != 0x59) { luna_idx = 0; continue; }
            luna_frame[luna_idx++] = b;
            if (luna_idx < 9) continue;
            luna_idx = 0;

            uint8_t cs = 0;
            for (int i = 0; i < 8; i++) cs += luna_frame[i];
            if (cs != luna_frame[8]) {
                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensorData.checksum_errors++;
                xSemaphoreGive(dataMutex);
                continue;
            }

            int raw_dist = luna_frame[2] + (luna_frame[3] << 8);
            int raw_str  = luna_frame[4] + (luna_frame[5] << 8);

            // Strength gate
            if (raw_str < LUNA_STRENGTH_MIN || raw_str > LUNA_STRENGTH_MAX) {
                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensorData.lidar_valid = false;
                sensorData.lidar_discarded++;
                xSemaphoreGive(dataMutex);
                continue;
            }
            // Jump gate
            if (luna_prev_dist > 0 &&
                abs(raw_dist - luna_prev_dist) > LUNA_JUMP_LIMIT_CM) {
                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensorData.lidar_discarded++;
                xSemaphoreGive(dataMutex);
                continue;
            }
            luna_prev_dist = raw_dist;

            // Median filter
            luna_median_buf[luna_median_pos] = raw_dist;
            luna_median_pos = (luna_median_pos + 1) % LUNA_MEDIAN_N;
            if (luna_median_pos == 0) luna_median_full = true;
            int filtered = luna_median_calc();

            xSemaphoreTake(dataMutex, portMAX_DELAY);
            sensorData.lidar_cm       = filtered;
            sensorData.lidar_strength = raw_str;
            sensorData.lidar_valid    = true;
            sensorData.lidar_frames++;
            xSemaphoreGive(dataMutex);
        }

        // ══ ADXL345 ══════════════════════════════════════════════════════════
        if (adxl_ok) {
            sensors_event_t event;
            if (accel.getEvent(&event)) {
                float ax_raw = event.acceleration.x / 9.80665f - bias_x;
                float ay_raw = event.acceleration.y / 9.80665f - bias_y;
                float az_raw = event.acceleration.z / 9.80665f - bias_z;

                // Dead-band
                if (fabsf(ax_raw) < ADXL_DEAD_BAND) ax_raw = 0.0f;
                if (fabsf(ay_raw) < ADXL_DEAD_BAND) ay_raw = 0.0f;
                if (fabsf(az_raw) < ADXL_DEAD_BAND) az_raw = 0.0f;

                // IIR low-pass
                ax_filt = ADXL_IIR_ALPHA*ax_raw + (1-ADXL_IIR_ALPHA)*ax_filt;
                ay_filt = ADXL_IIR_ALPHA*ay_raw + (1-ADXL_IIR_ALPHA)*ay_filt;
                az_filt = ADXL_IIR_ALPHA*az_raw + (1-ADXL_IIR_ALPHA)*az_filt;

                float roll  = atan2f(ay_filt, az_filt + 1.0f) * 180.0f / PI;
                float pitch = atan2f(-ax_filt,
                              sqrtf(ay_filt*ay_filt +
                                    (az_filt+1.0f)*(az_filt+1.0f))) * 180.0f / PI;

                xSemaphoreTake(dataMutex, portMAX_DELAY);
                sensorData.ax        = ax_filt;
                sensorData.ay        = ay_filt;
                sensorData.az        = az_filt;
                sensorData.roll      = roll;
                sensorData.pitch     = pitch;
                sensorData.imu_valid = true;
                sensorData.imu_reads++;
                xSemaphoreGive(dataMutex);
            }
        }

        // ══ DHT11 ════════════════════════════════════════════════════════════
        // Root causes of -1 readings:
        //   1. Missing pull-up resistor (4.7k–10k between data pin and 3.3V)
        //   2. Read interval too short (DHT11 needs >2s between reads)
        //   3. Long wire or noisy power supply
        //
        // This code: polls every 2.5s, retries up to 3 times on failure,
        // validates the range, and keeps the last good value until 10s stale.
        if (now - last_dht >= DHT_POLL_MS) {
            last_dht = now;
            float t = NAN, h = NAN;

            // Up to 3 attempts with 200ms recovery between each
            for (int attempt = 0; attempt < 3; attempt++) {
                t = dht.readTemperature();
                h = dht.readHumidity();
                if (!isnan(t) && !isnan(h)) break;
                delay(200);
                esp_task_wdt_reset();
            }

            xSemaphoreTake(dataMutex, portMAX_DELAY);
            // Validate range: DHT11 specs — temp -20..80°C, humidity 0..100%
            bool good = !isnan(t) && !isnan(h)
                        && t > -20.0f && t < 80.0f
                        && h >= 0.0f  && h <= 100.0f;

            if (good) {
                sensorData.temp_c            = t;
                sensorData.humidity          = h;
                sensorData.dht_valid         = true;
                sensorData.dht_last_good_ms  = now;
            } else {
                sensorData.dht_errors++;
                // If last good reading was more than 10s ago, mark invalid
                if (now - sensorData.dht_last_good_ms > DHT_STALE_MS) {
                    sensorData.dht_valid = false;
                }
                // If still within stale window, keep last good values
                // (avoid sending -1 for brief read failures)
            }
            xSemaphoreGive(dataMutex);
        }

        // ══ Sound sensor ══════════════════════════════════════════════════════
        // DO pin: digital threshold — HIGH when sound exceeds pot setting
        //   If you always get 0: turn the sensitivity pot clockwise
        //   If you always get 1: turn pot counter-clockwise
        // AO pin: raw analog level — higher = louder
        //   Connect AO to GPIO35 for continuous level monitoring
        bool  sound_digital = (digitalRead(SOUND_DO_PIN) == HIGH);
        int   sound_analog  = analogRead(SOUND_AO_PIN);  // 0..4095 on ESP32

        // ══ Other sensors ═════════════════════════════════════════════════════
        bool flame = (digitalRead(FLAME_PIN) == LOW);
        int  gas   = analogRead(GAS_PIN);

        xSemaphoreTake(dataMutex, portMAX_DELAY);
        sensorData.mic_digital     = sound_digital;
        sensorData.mic_raw         = sound_analog;
        sensorData.flame_detected  = flame;
        sensorData.gas_raw         = gas;
        sensorData.last_updated_ms = now;
        xSemaphoreGive(dataMutex);

        uint32_t elapsed = millis() - now;
        if (elapsed < SENSOR_LOOP_MS) {
            vTaskDelay(pdMS_TO_TICKS(SENSOR_LOOP_MS - elapsed));
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  WIFI TASK — Core 0
// ═══════════════════════════════════════════════════════════════════════════
void wifiTask(void *param) {
    esp_task_wdt_add(NULL);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("[WIFI] Connecting");
    uint32_t wifi_start = millis();

    while (WiFi.status() != WL_CONNECTED) {
        esp_task_wdt_reset();
        delay(500);
        Serial.print(".");
        if (millis() - wifi_start > 15000) {
            Serial.println("\n[WIFI] Timeout — retrying...");
            WiFi.disconnect();
            delay(1000);
            WiFi.begin(WIFI_SSID, WIFI_PASS);
            wifi_start = millis();
        }
    }
    Serial.println();
    Serial.printf("[WIFI] Connected. IP: %s\n", WiFi.localIP().toString().c_str());

    webSocket.begin();
    Serial.printf("[WIFI] WebSocket port %d — Core %d\n", WS_PORT, xPortGetCoreID());

    if (MDNS.begin("robot")) {
        Serial.println("[WIFI] mDNS responder started! You can connect to robot.local");
    }

    uint32_t last_broadcast    = 0;
    uint32_t last_wifi_check   = 0;
    uint32_t last_health_print = 0;

    for (;;) {
        esp_task_wdt_reset();
        uint32_t now = millis();

        webSocket.loop();

        if (now - last_wifi_check >= WIFI_RETRY_MS) {
            last_wifi_check = now;
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("[WIFI] Lost — reconnecting...");
                WiFi.disconnect();
                WiFi.begin(WIFI_SSID, WIFI_PASS);
            }
        }

        if (now - last_broadcast >= BROADCAST_MS) {
            last_broadcast = now;

            SensorData snap;
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            snap = sensorData;
            xSemaphoreGive(dataMutex);

            StaticJsonDocument<700> doc;
            doc["source"] = "esp32_sensor_hub";
            doc["t"]      = now;

            // Lidar
            doc["lidar_cm"]       = snap.lidar_valid ? snap.lidar_cm : -1;
            doc["lidar_strength"] = snap.lidar_strength;
            doc["lidar_valid"]    = snap.lidar_valid;

            // IMU
            doc["ax"]    = roundf(snap.ax    * 1000) / 1000.0f;
            doc["ay"]    = roundf(snap.ay    * 1000) / 1000.0f;
            doc["az"]    = roundf(snap.az    * 1000) / 1000.0f;
            doc["roll"]  = roundf(snap.roll  *   10) /   10.0f;
            doc["pitch"] = roundf(snap.pitch *   10) /   10.0f;
            doc["yaw"]   = 0;
            doc["gx"] = 0; doc["gy"] = 0; doc["gz"] = 0;

            // DHT11 — sends actual last-good value with validity flag
            // Python/dashboard should check dht_valid before using temp/humidity
            doc["temp"]      = snap.dht_valid ? roundf(snap.temp_c   * 10) / 10.0f : -1;
            doc["humidity"]  = snap.dht_valid ? roundf(snap.humidity * 10) / 10.0f : -1;
            doc["dht_valid"] = snap.dht_valid;
            doc["dht_errors"]= snap.dht_errors;

            // Sound — both digital and analog
            doc["mic"]        = snap.mic_raw / 4;  // Scale 4095 to 1023 for Dashboard compatibility
            doc["mic_digital"] = snap.mic_digital; // Make a distinct field for boolean threshold
            doc["mic_raw"]    = snap.mic_raw;       // 0..4095 analog level (if needed elsewhere)

            // Other
            doc["gas"]        = snap.gas_raw;
            doc["flame"]      = snap.flame_detected;

            // Health
            doc["imu_reads"]       = snap.imu_reads;
            doc["lidar_frames"]    = snap.lidar_frames;
            doc["lidar_discarded"] = snap.lidar_discarded;
            doc["checksum_errors"] = snap.checksum_errors;

            String payload;
            serializeJson(doc, payload);
            if (WiFi.status() == WL_CONNECTED) {
                webSocket.broadcastTXT(payload);
            }
        }

        if (now - last_health_print >= 5000) {
            last_health_print = now;
            SensorData snap;
            xSemaphoreTake(dataMutex, portMAX_DELAY);
            snap = sensorData;
            xSemaphoreGive(dataMutex);

            float accept = (snap.lidar_frames + snap.lidar_discarded) > 0
                ? 100.0f * snap.lidar_frames / (snap.lidar_frames + snap.lidar_discarded)
                : 0;

            Serial.printf(
                "[HEALTH] Lidar:%dcm valid=%d accept=%.0f%% discard=%lu | "
                "DHT: %.1fC %.0f%% valid=%d err=%lu | "
                "Sound: digital=%d raw=%d | "
                "IMU=%lu | WiFi=%s clients=%d\n",
                snap.lidar_cm, snap.lidar_valid, accept, snap.lidar_discarded,
                snap.temp_c, snap.humidity, snap.dht_valid, snap.dht_errors,
                snap.mic_digital, snap.mic_raw,
                snap.imu_reads,
                WiFi.status() == WL_CONNECTED ? "OK" : "DOWN",
                webSocket.connectedClients());
        }

        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== ESP32 Sensor Hub v3 (Noise-Filtered) ===");

    // ESP-IDF v5 / Arduino core 3.x WDT API
    const esp_task_wdt_config_t wdt_cfg = {
        .timeout_ms     = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = 0,
        .trigger_panic  = true
    };
    esp_task_wdt_reconfigure(&wdt_cfg);

    dataMutex = xSemaphoreCreateMutex();
    if (!dataMutex) {
        Serial.println("FATAL: mutex failed — halting");
        while (1);
    }

    xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, NULL, 2,
                            &sensorTaskHandle, 1);
    xTaskCreatePinnedToCore(wifiTask,   "WiFiTask",   8192, NULL, 1,
                            &wifiTaskHandle,   0);

    Serial.println("[SETUP] Tasks launched.");
    Serial.println("[SETUP] DHT11 tip: if temp=-1, check 4.7k pull-up on pin 32");
    Serial.println("[SETUP] Sound tip: adjust pot until LED barely off in silence");
}

void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}
