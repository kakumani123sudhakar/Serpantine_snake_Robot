/*
 * seeed_studio_esp32c3.ino
 * Robust control for Flipper Snake using ST3020 Serial Bus Servos
 * 
 * Mapping:
 * ID 1: Mouth
 * ID 2: Head (Y-axis lift)
 * IDs 3-13: Body (X-axis movement)
 */

#include <SCServo.h>

#if defined(ESP32)
  #include <WiFi.h>
  #include <AsyncTCP.h>
  #include <ESPmDNS.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESPAsyncTCP.h>
  #include <ESP8266mDNS.h>
#endif
#include <ESPAsyncWebServer.h>

// -------------------------------------------------------------------------------------
// CONFIGURATION & DEFINES
// -------------------------------------------------------------------------------------

// Servo IDs
#define ID_MOUTH 1
#define ID_HEAD  2
#define ID_BODY_START 3
#define N_BODY_SERVOS 11
#define MAX_SERVO_ID 13

// Motion Parameters
#define DEFAULT_AMP 40.0
#define DEFAULT_FREQ 1.0
#define DEFAULT_OFF 0.0
#define DEFAULT_WL 1.0
#define DEFAULT_SPEED_INCH 1.0

// STS Servo Position Range (0-4095 for ~360 deg)
// Mapping 0-180 degrees to center-aligned range
// Center (90 deg) = 2048
// 0 deg = 1024
// 180 deg = 3072
#define POS_CENTER 2048
#define POS_MIN    1024
#define POS_MAX    3072

// UART Settings for ST servos
#if defined(ESP32)
  #define S_RXD 20 // D7
  #define S_TXD 21 // D6
  #define SERVO_SERIAL Serial1 // Changed from Serial2 to Serial1 for ESP32-C3 compatibility
#else
  #define SERVO_SERIAL Serial // Use main hardware serial for ESP8266
#endif

// -------------------------------------------------------------------------------------
// GLOBALS
// -------------------------------------------------------------------------------------
SMS_STS st;
AsyncWebServer server(80);

const char* ssid = "Airtel_SKPM69";
const char* password = "qwertyuiopA@1";

typedef enum { UNDULATED, CONCERTINA, INCHWORM, NONE } motion;
typedef enum { FORWARD, BACKWARD, NO_MOVE } direction;

int is_running = 0;
motion motion_snake = NONE;
direction dir_snake = NO_MOVE;

double speed_inchworm = DEFAULT_SPEED_INCH;
double amplitude = DEFAULT_AMP;
double offset = DEFAULT_OFF;
double wavelength = DEFAULT_WL;
double frequency = DEFAULT_FREQ;

int even = 1;

// -------------------------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------------------------

// Map 0-180 degrees to STS servo position
uint16_t map_angle(double angle) {
  // Constrain angle to safe movement range
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;
  return (uint16_t)map(angle * 10, 0, 1800, POS_MIN, POS_MAX);
}

// Rotate a specific servo ID directly
void rotate_id(uint8_t id, double angle, uint16_t speed = 0, uint8_t acc = 0) {
  if (id == 2) {
    st.WritePosEx(2, 2097, speed, acc);
    return;
  }
  if (id == 4) {
    st.WritePosEx(4, 2144, speed, acc);
    return;
  }
  st.WritePosEx(id, map_angle(angle), speed, acc);
}

// Map original logic indices (0-11) to new IDs
uint8_t get_id_from_index(int index) {
  if (index == 11) return ID_HEAD;
  if (index >= 0 && index <= 10) return (uint8_t)(index + ID_BODY_START);
  return 0;
}

// Wrapper for existing rotation logic using indices
void rotate(int index, double angle) {
  uint8_t id = get_id_from_index(index);
  if (id > 0) {
    rotate_id(id, angle);
  }
}

// -------------------------------------------------------------------------------------
// MOTION SEQUENCES
// -------------------------------------------------------------------------------------

void straight() {
  uint8_t ids[MAX_SERVO_ID];
  int16_t positions[MAX_SERVO_ID];
  uint16_t speeds[MAX_SERVO_ID];
  uint8_t accs[MAX_SERVO_ID];

  for (int i = 0; i < MAX_SERVO_ID; i++) {
    ids[i] = i + 1;
    if (ids[i] == 2) {
      positions[i] = 2097;
    } else if (ids[i] == 4) {
      positions[i] = 2144;
    } else {
      positions[i] = POS_CENTER;
    }
    speeds[i] = 1500; // Increased speed for faster reset
    accs[i] = 30; // Increased acceleration
  }
  st.SyncWritePosEx(ids, MAX_SERVO_ID, positions, speeds, accs);
  delay(1000);
}

void reset() {
  dir_snake = NO_MOVE;
  frequency = DEFAULT_FREQ;
  wavelength = DEFAULT_WL;
  offset = DEFAULT_OFF;
  amplitude = DEFAULT_AMP;
  speed_inchworm = DEFAULT_SPEED_INCH;
  straight();
}

void undulated_motion() {
  uint8_t ids[N_BODY_SERVOS + 2]; // +2 for head (ID 2) and lifter (ID 4)
  int16_t positions[N_BODY_SERVOS + 2];
  uint16_t speeds[N_BODY_SERVOS + 2];
  uint8_t accs[N_BODY_SERVOS + 2];

  // Static variables for exponential smoothing. 
  // This acts as a "shock absorber" to prevent physical jerks when the App 
  // suddenly changes the offset (from the joystick) or a slider value!
  static float smooth_amp = 0.0;
  static float smooth_freq = frequency;
  static float smooth_wl = wavelength;
  static float smooth_off = offset;
  static float current_phase = 0.0;

  for (int i = 0; i < 360; i++) {
    if (motion_snake != UNDULATED || is_running == 0) {
      smooth_amp = 0.0; // Reset amplitude so it starts softly next time
      return;
    }

    // Smoothly calculate the current parameters (0.05 = strong filter, 1.0 = no filter)
    smooth_amp += (amplitude - smooth_amp) * 0.05;
    smooth_freq += (frequency - smooth_freq) * 0.05;
    smooth_wl += (wavelength - smooth_wl) * 0.05;
    smooth_off += (offset - smooth_off) * 0.1; // Offset is slightly faster so joystick is responsive

    // Advance the continuous phase
    current_phase += (smooth_freq * PI / 180.0);
    if (current_phase >= 2 * PI) current_phase -= 2 * PI;
    
    // 1. Calculate the X-Axis body wave (IDs 3, 5, 6, 7, 8, 9, 10, 11, 12, 13)
    int idx = 0;
    for (int j = 0; j < N_BODY_SERVOS; j++) {
      uint8_t current_id = j + ID_BODY_START;
      
      // Skip ID 4 because it is being used for Vertical (Y-axis) lift
      if (current_id == 4) continue; 
      
      ids[idx] = current_id;
      
      double wave;
      if (dir_snake == FORWARD) {
        wave = sin(current_phase + (smooth_wl * j * 2 * PI) / (N_BODY_SERVOS - 1));
      } else {
        wave = sin(-current_phase + (smooth_wl * j * 2 * PI) / (N_BODY_SERVOS - 1));
      }
      
      positions[idx] = map_angle(90 + smooth_off + smooth_amp * wave);
      speeds[idx] = 0; // Max speed
      accs[idx] = 0;
      idx++;
    }
    // 2. Vertical axes (ID 2 and ID 4) 
    // Both are fixed with torque enabled
    // This provides maximum grip and support for the forward crawling motion.
    
    // ID 2 (Head Lift) fixed
    ids[idx] = 2;
    positions[idx] = 2097;
    speeds[idx] = 0;
    accs[idx] = 0;
    idx++;
    
    // ID 4 (Body Lift) fixed
    ids[idx] = 4;
    positions[idx] = 2144;
    speeds[idx] = 0;
    accs[idx] = 0;
    idx++;

    // Send all synchronized commands at once
    st.SyncWritePosEx(ids, idx, positions, speeds, accs);
    delay(10);
  }
}

void inchworm_motion() {
  // Phase 1: Arch up
  for (int phi = 0; phi < 90; ++phi) {
    if (motion_snake != INCHWORM || is_running == 0) { reset(); return; }
    rotate(0, 90 - phi);
    rotate(1, 90 - phi);
    rotate(2, 90 + phi);
    delay(10);
  }

  // Phase 2: Propagation
  for (int i = 0; i <= 12 - 4; ++i) { // Based on original N_SERVOS=12
    for (int phi = 0; phi < 90; ++phi) {
      if (motion_snake != INCHWORM || is_running == 0) { reset(); return; }
      if (i > 0) rotate(i - 1, 180 - phi);
      rotate(i, 2 * phi);
      rotate(i + 2, 180 - 2 * phi);
      rotate(i + 3, 90 + phi);
      delay(10);
    }
    delay(1000 / speed_inchworm);
  }
}

void concertina_motion() {
  if (even == 1) {
    for (int phi = 0; phi <= 90; phi++) {
      rotate(11, 90 - phi); rotate(10, 90 + phi); rotate(9, 90 + phi);
      rotate(7, 90 - phi); rotate(6, 90 - phi); rotate(5, 90 + phi);
      delay(5);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(5, 180 - phi); rotate(4, 90 + phi); rotate(3, 90 + phi);
      rotate(1, 90 - phi); rotate(0, 90 - phi);
      delay(30);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(5, 90 - phi); rotate(6, phi); rotate(7, phi);
      rotate(9, 180 - phi); rotate(10, 180 - phi); rotate(11, phi);
      delay(5);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(0, 180 - phi); rotate(1, 180 - phi); rotate(3, phi);
      rotate(4, phi); rotate(5, phi + 10);
      delay(5);
    }
    delay(100);
  } else {
    for (int phi = 0; phi <= 90; phi++) {
      rotate(11, 90 + phi); rotate(10, 90 - phi); rotate(9, 90 - phi);
      rotate(7, 90 + phi); rotate(6, 90 + phi); rotate(5, 90 - phi);
      delay(5);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(5, phi); rotate(4, 90 - phi); rotate(3, 90 - phi);
      rotate(1, 90 + phi); rotate(0, 90 + phi);
      delay(30);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(5, 90 + phi); rotate(6, 180 - phi); rotate(7, 180 - phi);
      rotate(9, phi); rotate(10, phi); rotate(11, 180 - phi);
      delay(5);
    }
    delay(100);
    for (int phi = 0; phi <= 90; phi++) {
      rotate(0, phi); rotate(1, phi); rotate(3, 180 - phi);
      rotate(4, 180 - phi); rotate(5, 180 - phi);
      delay(5);
    }
    delay(100);
  }
}

// -------------------------------------------------------------------------------------
// WEB SERVER SETUP
// -------------------------------------------------------------------------------------

void setup_server() {
  server.on("/reset", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("value", true)) {
      if (request->getParam("value", true)->value().toInt() == 0) motion_snake = NONE;
      request->send(200, "text/html", "Reset success");
    } else {
      request->send(400, "text/html", "Missing value");
    }
  });

  server.on("/mode", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("value", true)) {
      is_running = request->getParam("value", true)->value().toInt();
      request->send(200, "text/html", "Mode updated");
    }
  });

  server.on("/motion", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("value", true)) {
      int val = request->getParam("value", true)->value().toInt();
      if (val == 1) motion_snake = UNDULATED;
      else if (val == 0) motion_snake = CONCERTINA;
      else if (val == 2) motion_snake = INCHWORM;
      dir_snake = FORWARD;
      request->send(200, "text/html", "Motion updated");
    }
  });

  server.on("/params", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("amp", true)) amplitude = request->getParam("amp", true)->value().toDouble();
    if (request->hasParam("wl", true)) wavelength = request->getParam("wl", true)->value().toDouble();
    if (request->hasParam("freq", true)) frequency = request->getParam("freq", true)->value().toDouble();
    if (request->hasParam("speed", true)) speed_inchworm = request->getParam("speed", true)->value().toDouble();
    if (request->hasParam("off", true)) {
      int val = request->getParam("off", true)->value().toInt();
      offset = map(val, 0, 180, -11, 11);
    }
    request->send(200, "text/html", "Params updated");
  });

  server.on("/direction", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("value", true)) {
      int val = request->getParam("value", true)->value().toInt();
      dir_snake = (val == 1) ? FORWARD : BACKWARD;
      request->send(200, "text/html", "Direction updated");
    }
  });

  server.begin();
}

// -------------------------------------------------------------------------------------
// CORE FUNCTIONS
// -------------------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  
  // Setup Servo Serial
#if defined(ESP32)
  SERVO_SERIAL.begin(1000000, SERIAL_8N1, S_RXD, S_TXD);
#else
  SERVO_SERIAL.begin(1000000); // ESP8266 default pins for Serial
#endif
  st.pSerial = &SERVO_SERIAL;

  // Configure WiFi
  WiFi.mode(WIFI_STA); // Station mode only (important for ESP32 stability)
  WiFi.setHostname("FlipperSnake");
  
  Serial.print("Connecting to WiFi: ");
  Serial.print(ssid);
  
  WiFi.begin(ssid, password);
  
  // Wait for connection with a timeout to prevent infinite hangs
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    if (MDNS.begin("robotcontrol")) {
      Serial.println("MDNS responder started at robotcontrol.local");
    }
  } else {
    Serial.println("\nWiFi Connection FAILED. Check credentials.");
    // We don't block here, the loop will try to reconnect later
  }

  setup_server();
  
  // Initialize servos
  straight();
  delay(1000);
}

void loop() {
  // Reconnect WiFi if lost
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 5000) delay(100);
  }

  if (is_running == 1) {
    switch (motion_snake) {
      case CONCERTINA:
        concertina_motion();
        even = (even == 1) ? 0 : 1;
        break;
      case INCHWORM:
        inchworm_motion();
        break;
      case UNDULATED:
        undulated_motion();
        break;
      case NONE:
        is_running = 0;
        break;
      default:
        break;
    }
  } else {
    delay(100); // Idle delay to yield to web server
  }
}
