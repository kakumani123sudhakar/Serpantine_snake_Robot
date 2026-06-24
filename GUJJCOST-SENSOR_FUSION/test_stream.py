import time, urllib.request

url = 'http://10.204.186.133:5050/stream'
print(f"Connecting to {url}...")
try:
    stream = urllib.request.urlopen(url, timeout=5)
    bytes_data = b''
    frames = 0
    start = time.time()
    
    while time.time() - start < 10:
        chunk = stream.read(4096)
        if not chunk:
            break
        bytes_data += chunk
        
        a = bytes_data.find(b'\xff\xd8')
        b = bytes_data.find(b'\xff\xd9')
        
        if a != -1 and b != -1:
            jpg = bytes_data[a:b+2]
            bytes_data = bytes_data[b+2:]
            frames += 1
            print(f"Received frame {frames}, FPS: {frames / (time.time() - start):.2f}", end='\r')
            
    avg_fps = frames / (time.time() - start)
    print(f"\nFinal FPS: {avg_fps:.2f}")
except Exception as e:
    print(f"\nError: {e}")
