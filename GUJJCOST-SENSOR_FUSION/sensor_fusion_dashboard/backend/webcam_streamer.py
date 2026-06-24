import cv2
from flask import Flask, Response, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Enable CORS for all routes
camera = cv2.VideoCapture(0)  # Use 0 for laptop webcam

if not camera.isOpened():
    print("CRITICAL ERROR: Could not open webcam. Ensure no other app is using it.")

def generate_frames():
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            # The extra \r\n before the boundary is critical for some mobile renderers
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n'
                   b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n' + 
                   frame_bytes + b'\r\n')

@app.route('/')
def index():
    return "<h1>SNAKE ROBOT: Mission Control Webcam Server</h1><p>Status: OPERATIONAL</p><p>Stream URL: <a href='/stream'>/stream</a></p>"

@app.route('/stream')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/capture')
def capture_frame():
    """Capture a single frame for YOLO detection"""
    success, frame = camera.read()
    if success:
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    else:
        return "Camera error", 500

if __name__ == "__main__":
    print("=========================================")
    print("LAPTOP WEBCAM MJPEG SERVER STARTING")
    print("=========================================")
    print("1. Ensure 'opencv-python' and 'flask' are installed:")
    print("   pip install opencv-python flask")
    print("2. Run this script")
    print("3. In the Dashboard App, set Camera IP to your computer IP (e.g., 10.241.70.77:5050)")
    print("=========================================")
    # threaded=True is required so the browser and app can connect simultaneously!
    app.run(host='0.0.0.0', port=5050, threaded=True)
