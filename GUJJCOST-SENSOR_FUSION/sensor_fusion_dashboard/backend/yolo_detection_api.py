"""
Enhanced YOLO Detection API for Snake Robot Dashboard
Returns annotated images with bounding boxes drawn
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
import base64
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

# Configuration
MODEL_PATH = "C:/Users/marri kuthik/Downloads/IIT_Bombay_Snake/esp32_yolo_live_detection/laptop_api/yolo11l.pt"
CONFIDENCE_THRESHOLD = 0.4  # Lowered for better detection
DETECT_CLASSES = None  # Detect ALL classes (80 COCO classes)
SAVE_DETECTIONS = False
OUTPUT_DIR = "detections"

print("="*60)
print("🐍 Snake Robot YOLO Detection API")
print("="*60)
print(f"📦 Loading YOLO model: {MODEL_PATH}")

try:
    model = YOLO(MODEL_PATH)
    print("✅ Model loaded successfully!")
    print(f"🎯 Detecting classes: {'ALL 80 COCO classes' if DETECT_CLASSES is None else DETECT_CLASSES}")
    print(f"📊 Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print(f"🏷️  Available classes: {len(model.names)} total")
    print(f"📝 Sample classes: person, car, dog, cat, chair, bottle, etc.")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    exit(1)

if SAVE_DETECTIONS and not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print("="*60)

def process_frame(image_data):
    """Process webcam/camera frame and run YOLO detection"""
    try:
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return None, "Invalid image data"
        
        print(f"🖼️  Processing image: {img.shape}")
        
        # Run YOLO detection
        results = model(img, conf=CONFIDENCE_THRESHOLD, classes=DETECT_CLASSES, verbose=False)
        
        detections = []
        annotated_img = img.copy()
        
        for result in results:
            boxes = result.boxes
            print(f"📦 Found {len(boxes)} detection(s)")
            
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                
                print(f"  ✨ {class_name}: {confidence:.2f} at [{int(x1)}, {int(y1)}, {int(x2)}, {int(y2)}]")
                
                detections.append({
                    'class': class_name,
                    'class_id': class_id,
                    'confidence': round(confidence, 2),
                    'bbox': [int(x1), int(y1), int(x2), int(y2)]
                })
                
                # Draw tactical bounding box (cyan for mission control)
                color = (255, 255, 0)  # Cyan in BGR
                cv2.rectangle(annotated_img, 
                            (int(x1), int(y1)), 
                            (int(x2), int(y2)), 
                            color, 3)
                
                # Draw label with dark background
                label = f"{class_name} {confidence:.2f}"
                (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
                cv2.rectangle(annotated_img, 
                            (int(x1), int(y1) - 30), 
                            (int(x1) + w + 10, int(y1)), 
                            color, -1)
                cv2.putText(annotated_img, label, 
                          (int(x1) + 5, int(y1) - 8), 
                          cv2.FONT_HERSHEY_SIMPLEX, 0.8, 
                          (0, 0, 0), 2)
        
        # Convert to base64 for web display
        _, buffer = cv2.imencode('.jpg', annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        if SAVE_DETECTIONS and len(detections) > 0:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{OUTPUT_DIR}/detection_{timestamp}.jpg"
            cv2.imwrite(filename, annotated_img)
            print(f"💾 Saved detection to: {filename}")
        
        result_data = {
            'detections': detections,
            'human_detected': any(d['class'] == 'person' for d in detections),
            'count': len(detections),
            'timestamp': datetime.now().isoformat(),
            'annotated_image': img_base64
        }
        
        print(f"✅ Returning {len(detections)} detection(s)")
        return result_data, None
        
    except Exception as e:
        print(f"❌ Processing error: {str(e)}")
        return None, str(e)

@app.route('/')
def index():
    return jsonify({
        'status': 'online',
        'model': 'YOLO11L',
        'confidence_threshold': CONFIDENCE_THRESHOLD,
        'detecting_classes': 'ALL' if DETECT_CLASSES is None else DETECT_CLASSES,
        'total_classes': len(model.names),
        'mission': 'Snake Robot Object Detection'
    })

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/detect', methods=['POST'])
def detect():
    """Main detection endpoint - receives image from dashboard"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        image_data = image_file.read()
        
        print(f"\n{'='*60}")
        print(f"🔍 New detection request - Image size: {len(image_data)} bytes")
        
        result, error = process_frame(image_data)
        
        if error:
            print(f"❌ Error: {error}")
            return jsonify({'error': error}), 500
        
        print(f"{'='*60}\n")
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/detect_stream', methods=['POST'])
def detect_stream():
    """Stream detection endpoint - for continuous camera feed"""
    try:
        data = request.get_json()
        
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        
        result, error = process_frame(image_data)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 YOLO Detection API Running!")
    print("="*60)
    print("📍 Access at: http://localhost:5001")
    print("🎯 Detecting ALL object classes")
    print("🐍 Integrated with Snake Robot Mission Control")
    print("\n💡 Tip: Point camera at objects to detect them!")
    print("   - People, cars, bottles, chairs, phones, etc.")
    print("\n⌨️  Press Ctrl+C to stop")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
