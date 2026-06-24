import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Switch } from 'react-native';
import { Shield, Target, AlertTriangle, Zap, Activity } from 'lucide-react-native';

/**
 * YOLO Detection Overlay Component
 * Displays real-time object detection results over the camera feed
 */
const YOLODetectionOverlay = ({ cameraIp, isStreaming }) => {
    const [detectionEnabled, setDetectionEnabled] = useState(false);
    const [detections, setDetections] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState({ count: 0, fps: 0, lastUpdate: '' });
    const intervalRef = useRef(null);
    const fpsRef = useRef({ lastTime: Date.now(), frames: 0 });

    const YOLO_API_URL = 'http://10.241.70.77:5001';
    const DETECTION_FPS = 2; // Process 2 frames per second

    useEffect(() => {
        if (detectionEnabled && isStreaming) {
            startDetection();
        } else {
            stopDetection();
        }

        return () => stopDetection();
    }, [detectionEnabled, isStreaming]);

    const startDetection = () => {
        console.log('🎯 Starting YOLO detection...');
        intervalRef.current = setInterval(async () => {
            await captureAndDetect();
        }, 1000 / DETECTION_FPS);
    };

    const stopDetection = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setDetections([]);
        setStats({ count: 0, fps: 0, lastUpdate: '' });
    };

    const captureAndDetect = async () => {
        if (isProcessing) return;

        try {
            setIsProcessing(true);

            // Fetch a single frame from the capture endpoint
            const streamUrl = cameraIp.startsWith('http') ? cameraIp : `http://${cameraIp}`;
            const captureUrl = `${streamUrl}/capture`;

            console.log('📸 Capturing frame from:', captureUrl);

            const frameResponse = await fetch(captureUrl);

            if (!frameResponse.ok) {
                console.log('❌ Failed to capture frame:', frameResponse.status);
                return;
            }

            const frameBlob = await frameResponse.blob();
            console.log('✅ Frame captured, size:', frameBlob.size, 'bytes');

            // Send to YOLO API
            const formData = new FormData();
            formData.append('image', frameBlob, 'frame.jpg');

            console.log('🔍 Sending to YOLO API:', YOLO_API_URL);
            const detectResponse = await fetch(`${YOLO_API_URL}/detect`, {
                method: 'POST',
                body: formData,
            });

            if (detectResponse.ok) {
                const result = await detectResponse.json();
                console.log('🎯 Detection result:', result);

                setDetections(result.detections || []);
                setStats({
                    count: result.count || 0,
                    fps: calculateFPS(),
                    lastUpdate: new Date().toLocaleTimeString()
                });

                if (result.count > 0) {
                    console.log(`✨ Detected ${result.count} object(s)!`);
                }
            } else {
                console.log('❌ YOLO API error:', detectResponse.status);
            }

        } catch (error) {
            console.error('❌ Detection error:', error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const calculateFPS = () => {
        const now = Date.now();
        fpsRef.current.frames++;

        const elapsed = (now - fpsRef.current.lastTime) / 1000;
        if (elapsed >= 1) {
            const fps = fpsRef.current.frames / elapsed;
            fpsRef.current.lastTime = now;
            fpsRef.current.frames = 0;
            return fps.toFixed(1);
        }
        return stats.fps;
    };

    if (!isStreaming) return null;

    return (
        <View style={styles.container}>
            {/* Detection Control Panel */}
            <View style={styles.controlPanel}>
                <View style={styles.controlRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Target color="#3B82F6" size={16} />
                        <Text style={styles.controlLabel}>YOLO DETECTION</Text>
                    </View>
                    <Switch
                        value={detectionEnabled}
                        onValueChange={setDetectionEnabled}
                        trackColor={{ false: "#1E293B", true: "#3B82F6" }}
                    />
                </View>

                {detectionEnabled && (
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Shield color={stats.count > 0 ? "#10B981" : "#64748B"} size={12} />
                            <Text style={styles.statText}>OBJECTS: {stats.count}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Zap color="#F59E0B" size={12} />
                            <Text style={styles.statText}>FPS: {stats.fps}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <View style={[styles.statusDot, { backgroundColor: isProcessing ? '#3B82F6' : '#10B981' }]} />
                            <Text style={styles.statText}>{isProcessing ? 'SCAN' : 'READY'}</Text>
                        </View>
                    </View>
                )}
            </View>

            {/* Detection Results */}
            {detectionEnabled && detections.length > 0 && (
                <View style={styles.detectionsList}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={styles.detectionsTitle}>🎯 DETECTED OBJECTS</Text>
                        <Text style={styles.timestamp}>{stats.lastUpdate}</Text>
                    </View>
                    {detections.slice(0, 5).map((detection, index) => (
                        <View key={index} style={styles.detectionItem}>
                            <View style={styles.detectionBadge}>
                                <Text style={styles.detectionIndex}>{index + 1}</Text>
                            </View>
                            <Text style={styles.detectionClass}>{detection.class.toUpperCase()}</Text>
                            <View style={styles.confidenceBar}>
                                <View style={[styles.confidenceFill, { width: `${detection.confidence * 100}%` }]} />
                            </View>
                            <Text style={styles.detectionConf}>{(detection.confidence * 100).toFixed(0)}%</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* No Detections Message */}
            {detectionEnabled && detections.length === 0 && !isProcessing && (
                <View style={styles.noDetections}>
                    <Activity color="#64748B" size={16} />
                    <Text style={styles.noDetectionsText}>Scanning for objects...</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 10,
    },
    controlPanel: {
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#3B82F6',
    },
    controlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    controlLabel: {
        color: '#94A3B8',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 15,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statText: {
        color: '#64748B',
        fontSize: 9,
        fontWeight: 'bold',
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    detectionsList: {
        marginTop: 10,
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#10B981',
    },
    detectionsTitle: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    timestamp: {
        color: '#64748B',
        fontSize: 8,
        fontWeight: 'bold',
    },
    detectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#1E293B',
    },
    detectionBadge: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    detectionIndex: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    detectionClass: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        flex: 1,
    },
    confidenceBar: {
        width: 60,
        height: 4,
        backgroundColor: '#1E293B',
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        backgroundColor: '#10B981',
    },
    detectionConf: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: 'bold',
        width: 35,
        textAlign: 'right',
    },
    noDetections: {
        marginTop: 10,
        backgroundColor: 'rgba(2, 6, 23, 0.9)',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1E293B',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    noDetectionsText: {
        color: '#64748B',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default YOLODetectionOverlay;
