"""
YOLO-Enhanced Webcam Streamer
Streams webcam with real-time YOLO detection bounding boxes
"""

import cv2
from flask import Flask, Response
from flask_cors import CORS
from ultralytics import YOLO
import numpy as np

app = Flask(__name__)
CORS(app)

# YOLO Configuration
MODEL_PATH = "C:/Users/marri kuthik/Downloads/IIT_Bombay_Snake/esp32_yolo_live_detection/laptop_api/yolo11l.pt"
CONFIDENCE_THRESHOLD = 0.4
DETECT_CLASSES = None  # None = all classes, [0] = person only

print("="*60)
print("🎥 YOLO-Enhanced Webcam Streamer")
print("="*60)
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

camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("❌ CRITICAL ERROR: Could not open webcam")
    exit(1)

print("✅ Webcam opened successfully!")
print("="*60)

def generate_frames_with_yolo():
    """Generate MJPEG stream with YOLO bounding boxes"""
    frame_count = 0
    
    while True:
        success, frame = camera.read()
        if not success:
            break
        
        frame_count += 1
        
        # Run YOLO detection every frame
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
    return "<h1>🐍 Snake Robot: YOLO-Enhanced Camera</h1><p>Status: OPERATIONAL</p><p>Stream: <a href='/stream'>/stream</a> (with YOLO detection)</p><p>Capture: <a href='/capture'>/capture</a></p>"

@app.route('/stream')
def video_feed():
    return Response(generate_frames_with_yolo(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/capture')
def capture_frame():
    """Capture a single frame with YOLO detection"""
    success, frame = camera.read()
    if success:
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
    else:
        return "Camera error", 500

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 YOLO-Enhanced Webcam Server Running!")
    print("="*60)
    print("📍 Stream URL: http://10.241.70.77:5050/stream")
    print("📸 Capture URL: http://10.241.70.77:5050/capture")
    print("🎯 Real-time YOLO detection enabled!")
    print("💡 Bounding boxes will appear on the video stream")
    print("\n⌨️  Press Ctrl+C to stop")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5050, threaded=True)
