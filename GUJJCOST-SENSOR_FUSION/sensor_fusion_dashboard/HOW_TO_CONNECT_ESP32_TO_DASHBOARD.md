# 🔗 Connecting ESP32 to Mission Control Dashboard

## 📱 Complete Connection Guide

### Step 1: Upload Firmware to ESP32

1. **Open Arduino IDE**
2. **Open**: `TEST_LIDAR_ONLY__esp32_rplidar.ino`
3. **Select Board**: ESP32 Dev Module
4. **Select Port**: Your ESP32's COM port
5. **Click Upload** ⬆️
6. **Wait** for "Done uploading"

---

### Step 2: Get ESP32 IP Address

1. **Open Serial Monitor** (Tools → Serial Monitor)
2. **Set baud rate**: 115200
3. **Look for this line**:
   ```
   📍 ESP32 IP Address: 10.241.70.XXX
   ```
4. **Write down this IP address!** (Example: `10.241.70.130`)

---

### Step 3: Make Sure Both Devices Are on Same WiFi

**ESP32:**
- ✅ Connected to WiFi: "Pradeep"
- ✅ IP Address: `10.241.70.XXX`

**Your Phone/Laptop:**
- ✅ Must be connected to the SAME WiFi: "Pradeep"
- ✅ Both devices can talk to each other on this network

---

### Step 4: Open Mission Control Dashboard

1. **On your phone**, open the **Expo Go** app
2. **Scan the QR code** from the terminal (or open the running app)
3. **Dashboard loads** - you'll see the sensor view first

---

### Step 5: Update ESP32 IP in Dashboard

**Option A: Using Settings (Recommended)**

1. **Tap the Settings icon** ⚙️ (top right)
2. **Find "ESP32 IP Address"** field
3. **Clear the old IP** and enter your new IP (from Step 2)
   - Example: `10.241.70.130`
4. **Tap "Save"** or close settings
5. **Dashboard will reconnect** automatically

**Option B: Using Network Modal**

1. **Tap the WiFi icon** 📡 (top bar)
2. **Enter ESP32 IP** in the field
3. **Tap "Connect"**

---

### Step 6: Navigate to Mission Control View

1. **Swipe LEFT** on the dashboard
   - You'll see: Sensors → **Mission Control** → Analytics
2. **Or tap the navigation dots** at the bottom
3. **Mission Control view** will show:
   - Camera Feed (top)
   - **LiDAR Map** (bottom) ← This is what you want!

---

### Step 7: Verify Connection

**You should see:**

✅ **LiDAR Map shows**:
- Green dot: "ACTIVE" (top right of LiDAR card)
- Scan points appearing on the circular map
- Statistics updating (Scans, RPM, Points)

✅ **Serial Monitor shows**:
```
📡 Client #1 connected from 10.241.70.XXX
📊 Scans: 360 | RPM: 5.2 | Queue: 12 | Clients: 1
```

---

## 🔍 Troubleshooting

### Problem: "OFFLINE" status on LiDAR Map

**Solution:**
1. Check ESP32 IP is correct in dashboard
2. Make sure phone and ESP32 are on same WiFi
3. Try pinging ESP32 from phone:
   - Open browser on phone
   - Go to: `http://10.241.70.XXX` (your ESP32 IP)
   - You should see a response

### Problem: No scan points appearing

**Solution:**
1. Check RPLIDAR is powered (separate 5V supply!)
2. Check Serial Monitor for "RPLIDAR scan started"
3. Verify motor is spinning (you should hear it)
4. Check wiring:
   - TX → GPIO 16
   - RX → GPIO 17
   - Motor → GPIO 14

### Problem: Can't find ESP32 IP

**Solution:**
1. Check Serial Monitor (115200 baud)
2. Press RESET button on ESP32
3. Look for the IP address in the startup messages
4. Or check your router's connected devices list

---

## 📊 What You'll See

### On Dashboard (Mission Control View):

```
┌─────────────────────────────────┐
│  LIDAR MAPPING        ● ACTIVE  │
├─────────────────────────────────┤
│                                 │
│        [Circular Map]           │
│     • • • scan points • •       │
│    •  range rings  •            │
│   •    (1m, 2m, 3m)   •         │
│    •                •           │
│     • • • • • • • •             │
│                                 │
├─────────────────────────────────┤
│  SCANS    RPM      POINTS       │
│  1250     5.2      360          │
├─────────────────────────────────┤
│ ● Close  ● Medium  ● Far        │
└─────────────────────────────────┘
```

### On Serial Monitor:

```
📊 Scans: 1250 | RPM: 5.2 | Queue: 12 | Clients: 1
📊 Scans: 1610 | RPM: 5.1 | Queue: 8 | Clients: 1
📊 Scans: 1970 | RPM: 5.3 | Queue: 15 | Clients: 1
```

---

## 🎯 Quick Connection Checklist

- [ ] ESP32 firmware uploaded
- [ ] ESP32 connected to WiFi "Pradeep"
- [ ] ESP32 IP address noted (e.g., 10.241.70.130)
- [ ] Phone/laptop on same WiFi "Pradeep"
- [ ] Dashboard app running (Expo Go)
- [ ] ESP32 IP entered in dashboard settings
- [ ] Navigated to Mission Control view (swipe left)
- [ ] RPLIDAR powered with external 5V
- [ ] RPLIDAR wired correctly to ESP32
- [ ] Green "ACTIVE" status on LiDAR map
- [ ] Scan points appearing on map

---

## 🌐 Network Architecture

```
┌─────────────────┐
│   WiFi Router   │
│   "Pradeep"     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│ ESP32 │ │  Phone  │
│ .130  │ │  .181   │
└───┬───┘ └──┬──────┘
    │        │
    │ WebSocket
    │ Port 81
    │        │
    └────────┘
```

Both devices communicate via WebSocket on port 81 over your local WiFi network.

---

## 💡 Pro Tips

1. **Keep Serial Monitor open** while testing - it shows real-time connection status
2. **The IP address might change** if ESP32 restarts - check Serial Monitor
3. **Dashboard auto-reconnects** if connection drops
4. **Scan points fade** after 2 seconds to show recent data
5. **Color coding** helps identify obstacle distances:
   - Red = Danger (close)
   - Yellow = Caution (medium)
   - Cyan = Safe (far)

---

**You're all set! The LiDAR map should now be showing live 360° scans!** 🎯📡✨
