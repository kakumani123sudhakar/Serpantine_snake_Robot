import { useState, useEffect, useRef } from 'react';

export const useSensorData = (ipAddress, port = 81) => {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('disconnected');
    const ws = useRef(null);

    useEffect(() => {
        if (!ipAddress) {
            console.warn('⚠️ No IP address provided to useSensorData');
            return;
        }

        console.log(`🔌 Connecting to ws://${ipAddress}:${port}`);

        const connect = () => {
            try {
                ws.current = new WebSocket(`ws://${ipAddress}:${port}`);

                ws.current.onopen = () => {
                    setStatus('connected');
                    console.log('✅ Connected to ESP32 WebSocket');
                };

                ws.current.onmessage = (e) => {
                    try {
                        if (!e || !e.data) {
                            console.warn('⚠️ Empty WebSocket message');
                            return;
                        }

                        // Log raw data for debugging
                        console.log('📥 RAW WebSocket data:', e.data.substring(0, 100));

                        const json = JSON.parse(e.data);

                        // Log parsed data
                        console.log('📦 Parsed data:', json);

                        // Filter: Only update with sensor data from Nano
                        // Ignore stats and lidar messages
                        // DATA ROUTING LOGIC
                        if (json.source === 'nano' || json.source === 'esp32_sensor_hub' || json.temp !== undefined || json.pitch !== undefined || json.roll !== undefined) {
                            // Valid sensor data packet (including TF-Luna lidar_cm)
                            setData({ ...json, _receivedAt: Date.now() });
                        } else if (json.type === 'stats') {
                            // System stats (RPM, Scan Count - legacy or future use)
                            setData({ ...json, source: 'system_stats', _receivedAt: Date.now() });
                        } else {
                            // Fallback for any other valid JSON
                            setData({ ...json, _receivedAt: Date.now() });
                        }
                    } catch (err) {
                        console.error('❌ Failed to parse sensor data:', err.message);
                        console.error('   Raw data:', e.data);
                    }
                };

                ws.current.onclose = () => {
                    setStatus('disconnected');
                    console.log('🔌 Disconnected from ESP32, reconnecting in 3s...');
                    setTimeout(connect, 3000);
                };

                ws.current.onerror = (e) => {
                    setStatus('error');
                    console.error('❌ WebSocket Error:', e.message || 'Unknown error');
                    console.error('   Check if ESP32 IP is correct:', ipAddress);
                };
            } catch (err) {
                console.error('❌ Failed to create WebSocket:', err.message);
                setStatus('error');
                setTimeout(connect, 5000);
            }
        };

        connect();

        return () => {
            if (ws.current) {
                console.log('🔌 Closing WebSocket connection');
                ws.current.close();
            }
        };
    }, [ipAddress, port]);

    return { data, status };
};
