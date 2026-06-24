# 📡 Sensor Fusion System: Wiring & Setup Guide

This guide explains how to connect your **Arduino Nano**, **ESP32**, and **RPLIDAR A1 M8** to work with the **Mission Control Dashboard**.

## 🏗️ System Architecture (Unified Private Network)
This setup creates a dedicated local network where the **ESP32-Bridge** acts as the central router (Access Point).

1.  **Arduino Nano**: Collects data from sensors and sends them to the ESP32-Bridge via Serial.
2.  **ESP32-Bridge (Master)**: 
    *   Creates a WiFi Hotspot (**SSID: ESP32**).
    *   Collects data from Nano and RPLIDAR.
    *   Streams sensor data over WebSocket (Port 81).
3.  **ESP32-CAM (Node)**:
    *   Connects to the Bridge's WiFi as a client.
    *   Streams MJPEG video on Port 5050.
4.  **React Dashboard**: Connects to the Bridge's WiFi and visualizes everything.

---

## 🔌 Wiring Diagram

### 1. Arduino Nano to Sensors
| Sensor | Nano Pin | Notes |
| :--- | :--- | :--- |
| **DHT11 (Data)** | D2 | Use 10k pull-up if needed |
| **MPU6050 (SDA)** | A4 | I2C Data |
| **MPU6050 (SCL)** | A5 | I2C Clock |
| **Flame Sensor** | A0 | Analog Output |
| **Microphone** | A1 | Analog Output |
| **Gas Sensor** | A2 | Analog Output (MQ series) |
| **LDR Sensor** | A6 | With voltage divider |

### 2. ESP32 to Arduino Nano (Serial Communication)
| Arduino Nano | ESP32 | Notes |
| :--- | :--- | :--- |
| **TX** | **GPIO 27 (RX1)** | Nano sends data to ESP32 |
| **RX** | **GPIO 26 (TX1)** | ESP32 can send commands to Nano |
| **GND** | **GND** | **CRITICAL:** Common ground is required! |

### 3. ESP32 to RPLIDAR A1 M8
| RPLIDAR Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **TX** | **GPIO 16 (RX2)** | LiDAR data stream |
| **RX** | **GPIO 17 (TX2)** | LiDAR commands |
| **VCC (5V)** | **External 5V** | LiDAR needs stable 5V (don't use ESP32 pin) |
| **GND** | **GND** | Common ground |
| **MOTO_PWM** | **GPIO 14** | Controls motor rotation speed |

---

## 🚀 Setup Instructions

### Step 1: Install Libraries
In the Arduino IDE, go to **Tools -> Manage Libraries** and install:
- **ArduinoJson** (by Benoit Blanchon) - *Required for both boards*
- **DHT sensor library** (by Adafruit) - *For Nano*
- **MPU6050** (by Electronic Cats or Jeff Rowberg) - *For Nano*
- **WebSockets** (by Markus Sattler) - *For ESP32*
- **RPLidar** (by RoboPeak) - *For ESP32*

### Step 2: Upload Firmware
1.  **Nano**: Open `firmware/nano_sensor_hub/nano_sensor_hub.ino` and upload to your Arduino Nano.
2.  **ESP32-Bridge**:
    *   Open `firmware/esp32_bridge/esp32_bridge.ino`.
    *   Upload to your standard ESP32. It will create an AP named `ESP32`.
3.  **ESP32-CAM**:
    *   Open `firmware/esp32_cam/esp32_cam.ino`.
    *   Upload to your ESP32-CAM. It will automatically connect to the Bridge.

### Step 3: Run the Dashboard
1.  Connect your phone/laptop to the WiFi network: **SSID: ESP32** (Pass: `1234567890`).
2.  Open the Dashboard app.
3.  Navigate to **Settings** (Gear icon):
    *   Set **Robot IP** to `192.168.4.1` (The Bridge).
    *   Check the ESP32-CAM serial monitor for its IP (usually `192.168.4.x`) and enter it in the **Camera Feed** routing box.
4.  Watch the sensors, LiDAR map, and Live Feed come to life!

---

## 🛠️ Troubleshooting
- **No Sensor Data**: Check if Nano TX is connected to ESP32 RX1 (GPIO 27). Verify common ground.
- **LiDAR Map Offline**: Ensure the ESP32 IP is correct in the dashboard settings and both devices are on the same WiFi.
- **LiDAR Not Spinning**: Ensure the RPLIDAR is getting enough current from a dedicated 5V power source. ESP32's 5V pin is often insufficient.
