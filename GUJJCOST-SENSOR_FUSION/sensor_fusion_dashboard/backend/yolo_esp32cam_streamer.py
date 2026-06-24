"""
YOLO-Enhanced ESP32-CAM Streamer
Pulls stream from ESP32-CAM, adds YOLO detection, and re-streams with bounding boxes
"""

import cv2
from flask import Flask, Response
from flask_cors import CORS
from ultralytics import YOLO
import numpy as np
import requests
from io import BytesIO
from PIL import Image

app = Flask(__name__)
CORS(app)

# Configuration
ESP32_CAM_IP = "10.241.70.133"  # Change this to your ESP32-CAM IP
ESP32_STREAM_URL = f"http://{ESP32_CAM_IP}/stream"
MODEL_PATH = "C:/Users/marri kuthik/Downloads/IIT_Bombay_Snake/esp32_yolo_live_detection/laptop_api/yolo11l.pt"
CONFIDENCE_THRESHOLD = 0.4
DETECT_CLASSES = None  # None = all classes, [0] = person only

print("="*60)
print("🎥 YOLO-Enhanced ESP32-CAM Streamer")
print("="*60)
print(f"📡 ESP32-CAM IP: {ESP32_CAM_IP}")
print(f"📦 Loading YOLO model...")

try:
    model = YOLO(MODEL_PATH)
    print(f"✅ YOLO11L loaded successfully!")
    print(f"🎯 Detecting: {'ALL 80 classes' if DETECT_CLASSES is None else 'Person only'}")
    print(f"📊 Confidence: {CONFIDENCE_THRESHOLD}")
except Exception as e:
    print(f"❌ Error loading YOLO: {e}")
    print("⚠️  Falling back to raw stream (no detection)")
    model = None

print("="*60)

class ESP32CamStream:
    """Handle MJPEG stream from ESP32-CAM"""
    def __init__(self, url):
        self.url = url
        self.stream = None
        self.connect()
    
    def connect(self):
        """Connect to ESP32-CAM stream"""
        try:
            print(f"📡 Connecting to ESP32-CAM at {self.url}...")
            self.stream = requests.get(self.url, stream=True, timeout=5)
            print("✅ Connected to ESP32-CAM!")
        except Exception as e:
            print(f"❌ Failed to connect to ESP32-CAM: {e}")
            self.stream = None
    
    def get_frame(self):
        """Extract a single frame from MJPEG stream"""
        if not self.stream:
            return None
        
        try:
            # Read until we find JPEG start marker
            bytes_data = b''
            for chunk in self.stream.iter_content(chunk_size=1024):
                bytes_data += chunk
                
                # Look for JPEG markers
                a = bytes_data.find(b'\xff\xd8')  # JPEG start
                b = bytes_data.find(b'\xff\xd9')  # JPEG end
                
                if a != -1 and b != -1:
                    jpg = bytes_data[a:b+2]
                    bytes_data = bytes_data[b+2:]
                    
                    # Decode JPEG
                    img = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                    return img
        except Exception as e:
            print(f"⚠️  Frame read error: {e}")
            self.connect()  # Try to reconnect
            return None

# Initialize ESP32-CAM stream
esp32_stream = ESP32CamStream(ESP32_STREAM_URL)

def generate_frames_with_yolo():
    """Generate MJPEG stream with YOLO bounding boxes from ESP32-CAM"""
    frame_count = 0
    error_count = 0
    
    while True:
        # Get frame from ESP32-CAM
        frame = esp32_stream.get_frame()
        
        if frame is None:
            error_count += 1
            if error_count > 10:
                print("❌ Too many errors, reconnecting...")
                esp32_stream.connect()
                error_count = 0
            continue
        
        error_count = 0
        frame_count += 1
        
        # Run YOLO detection
        if model is not None:
            try:
                results = model(frame, conf=CONFIDENCE_THRESHOLD, classes=DETECT_CLASSES, verbose=False)
                
                detection_count = 0
                for result in results:
                    boxes = result.boxes
                    for box in boxes:
                        detection_count += 1
                        
                        # Get box coordinates
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])
                        class_name = model.names[class_id]
                        
                        # Tactical cyan bounding box
                        color = (255, 255, 0)  # Cyan in BGR
                        cv2.rectangle(frame, 
                                    (int(x1), int(y1)), 
                                    (int(x2), int(y2)), 
                                    color, 3)
                        
                        # Label with background
                        label = f"{class_name} {confidence:.2f}"
                        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                        cv2.rectangle(frame, 
                                    (int(x1), int(y1) - 30), 
                                    (int(x1) + w + 10, int(y1)), 
                                    color, -1)
                        cv2.putText(frame, label, 
                                  (int(x1) + 5, int(y1) - 8), 
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.7, 
                                  (0, 0, 0), 2)
                
                # Add detection count overlay
                if detection_count > 0:
                    overlay_text = f"DETECTED: {detection_count}"
                    cv2.rectangle(frame, (10, 10), (250, 50), (0, 255, 255), -1)
                    cv2.putText(frame, overlay_text, (20, 38), 
                              cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
                    
                    if frame_count % 30 == 0:  # Log every 30 frames
                        print(f"🎯 Frame {frame_count}: Detected {detection_count} object(s)")
                        
            except Exception as e:
                if frame_count % 100 == 0:  # Log errors occasionally
                    print(f"⚠️  Detection error: {e}")
        
        # Encode frame
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_bytes = buffer.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n'
               b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n' + 
               frame_bytes + b'\r\n')

@app.route('/')
def index():
    return f"<h1>🐍 Snake Robot: YOLO-Enhanced ESP32-CAM</h1><p>Status: OPERATIONAL</p><p>ESP32-CAM: {ESP32_CAM_IP}</p><p>Stream: <a href='/stream'>/stream</a> (with YOLO detection)</p><p>Capture: <a href='/capture'>/capture</a></p>"

@app.route('/stream')
def video_feed():
    return Response(generate_frames_with_yolo(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/capture')
def capture_frame():
    """Capture a single frame with YOLO detection"""
    frame = esp32_stream.get_frame()
    
    if frame is None:
        return "ESP32-CAM error", 500
    
    # Run YOLO on the captured frame
    if model is not None:
        try:
            results = model(frame, conf=CONFIDENCE_THRESHOLD, classes=DETECT_CLASSES, verbose=False)
            
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]
                    
                    color = (255, 255, 0)
                    cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 3)
                    
                    label = f"{class_name} {confidence:.2f}"
                    (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                    cv2.rectangle(frame, (int(x1), int(y1) - 30), (int(x1) + w + 10, int(y1)), color, -1)
                    cv2.putText(frame, label, (int(x1) + 5, int(y1) - 8), 
                              cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
        except Exception as e:
            print(f"⚠️  Capture detection error: {e}")
    
    ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(buffer.tobytes(), mimetype='image/jpeg')

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 YOLO-Enhanced ESP32-CAM Server Running!")
    print("="*60)
    print(f"📡 Source: ESP32-CAM at {ESP32_CAM_IP}")
    print(f"📍 Stream URL: http://10.241.70.77:5050/stream")
    print(f"📸 Capture URL: http://10.241.70.77:5050/capture")
    print("🎯 Real-time YOLO detection enabled!")
    print("💡 Bounding boxes will appear on the video stream")
    print("\n⚠️  IMPORTANT: Make sure ESP32-CAM is powered on and streaming!")
    print(f"   Test ESP32-CAM at: {ESP32_STREAM_URL}")
    print("\n⌨️  Press Ctrl+C to stop")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5050, threaded=True)
