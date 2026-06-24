import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Animated, Platform } from 'react-native';
import { Shield, Target, Activity, Zap, Radio, Camera, Cpu, Eye, AlertTriangle, Play, Square, BrainCircuit, Maximize, Minimize } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import CameraFeed from './gauges/CameraFeed';
import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const SurveillanceView = ({ cameraIp, onUpdateIp, sensorData, addLog }) => {
    const [logs, setLogs] = useState([
        { id: 1, time: '09:12:44', msg: 'System armed', type: 'info' },
        { id: 2, time: '09:12:50', msg: 'Motion sensor calibrated', type: 'success' },
        { id: 3, time: '09:13:05', msg: 'Camera feed synchronized', type: 'info' }
    ]);

    const [isRecording, setIsRecording] = useState(false);
    const [isAiMode, setIsAiMode] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [aiObjects, setAiObjects] = useState([]);
    const [alertOpacity] = useState(new Animated.Value(0));
    const [aiScanningAnim] = useState(new Animated.Value(0));
    const [tfModel, setTfModel] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Load MobileNet Model on mount
    useEffect(() => {
        async function loadTFModel() {
            try {
                const newLog = {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    msg: 'Booting MobileNet AI engine...',
                    type: 'info'
                };
                setLogs(prev => [newLog, ...prev].slice(0, 5));
                if (addLog) addLog(newLog.msg, newLog.type);
                
                await tf.ready();
                const model = await cocoSsd.load({ base: 'mobilenet_v2' });
                setTfModel(model);
                
                const successLog = {
                    id: Date.now() + 1,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    msg: 'MobileNet engine ready.',
                    type: 'success'
                };
                setLogs(prev => [successLog, ...prev].slice(0, 5));
                if (addLog) addLog(successLog.msg, successLog.type);
            } catch (error) {
                console.error("TF model load error:", error);
                const errLog = {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    msg: 'MobileNet load failed.',
                    type: 'alert'
                };
                setLogs(prev => [errLog, ...prev].slice(0, 5));
                if (addLog) addLog(errLog.msg, errLog.type);
            }
        }
        loadTFModel();
    }, []);

    // Recording Timer Logic
    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => setRecTime(prev => prev + 1), 1000);
        } else {
            setRecTime(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle Image Capture (Snapshot)
    const takeSnapshot = async () => {
        try {
            // First check existing permissions
            const current = await MediaLibrary.getPermissionsAsync();
            let status = current.status;

            // If not granted, request them
            if (status !== 'granted') {
                const requested = await MediaLibrary.requestPermissionsAsync();
                status = requested.status;
            }

            if (status !== 'granted') {
                throw new Error("Storage Permission Denied");
            }

            const timestamp = new Date().getTime();
            const fileName = `surveillance_cap_${timestamp}.jpg`;
            
            // Actually download the JPEG frame from the camera's capture endpoint
            const captureUrl = cameraIp.startsWith('http') ? `${cameraIp}/capture` : `http://${cameraIp}/capture`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            const { uri } = await FileSystem.downloadAsync(captureUrl, fileUri);
            
            // Save the downloaded file directly to the device's photo gallery
            await MediaLibrary.saveToLibraryAsync(uri);

            const newLog = {
                id: Date.now(),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                msg: `SNAPSHOT SAVED: ${fileName}`,
                type: 'success'
            };

            setLogs(prev => [newLog, ...prev].slice(0, 5));
            if (addLog) addLog(newLog.msg, newLog.type);
            alert('Snapshot successfully saved to your phone gallery!');
        } catch (error) {
            console.error('Capture error:', error);
            const errLog = {
                id: Date.now(),
                time: new Date().toLocaleTimeString(),
                msg: "CAPTURE_ERR: System permission conflict",
                type: "alert"
            };
            setLogs(prev => [errLog, ...prev].slice(0, 5));
            if (addLog) addLog(errLog.msg, 'alert');
        }
    };

    // Real-Time MobileNet Object Detection
    useEffect(() => {
        let detectionInterval;

        if (isAiMode && tfModel && cameraIp) {
            // Start scanning animation ONCE on activation
            aiScanningAnim.setValue(0);
            Animated.sequence([
                Animated.timing(aiScanningAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
                Animated.timing(aiScanningAnim, { toValue: 2, duration: 0, useNativeDriver: true }) // Set to 2 to trigger hiding
            ]).start();

            detectionInterval = setInterval(async () => {
                try {
                    // Fetch a single frame from the ESP32
                    const captureUrl = cameraIp.startsWith('http') 
                        ? `${cameraIp}/capture` 
                        : `http://${cameraIp}/capture`;

                    const imageResponse = await fetch(captureUrl);
                    if (!imageResponse.ok) throw new Error("Capture failed");

                    const arrayBuffer = await imageResponse.arrayBuffer();
                    const imageData = new Uint8Array(arrayBuffer);
                    
                    // Decode to a TFJS Tensor
                    const imageTensor = decodeJpeg(imageData);
                    const [imgHeight, imgWidth] = imageTensor.shape;
                    
                    // Run MobileNet inference
                    const predictions = await tfModel.detect(imageTensor);
                    
                    // Dynamically Map boxes to % based on actual incoming frame shape
                    const mappedObjects = predictions.filter(p => p.score > 0.4).map((p, index) => ({
                        id: index,
                        label: p.class.toUpperCase(),
                        conf: p.score,
                        x: (p.bbox[0] / imgWidth) * 100, 
                        y: (p.bbox[1] / imgHeight) * 100, 
                        w: (p.bbox[2] / imgWidth) * 100,
                        h: (p.bbox[3] / imgHeight) * 100
                    }));

                    setAiObjects(mappedObjects);
                    
                    // Free memory to prevent leaks (CRITICAL IN TFJS)
                    tf.dispose(imageTensor);
                    
                } catch (err) {
                    // Silent catch to prevent flooding console if stream hiccups
                }
            }, 500); // Poll twice a second
        } else {
            setAiObjects([]);
            aiScanningAnim.setValue(0);
        }

        return () => clearInterval(detectionInterval);
    }, [isAiMode, tfModel, cameraIp]);

    // Simulate motion alerts based on sensor data if available
    useEffect(() => {
        if (sensorData?.motion) {
            const newLog = {
                id: Date.now(),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                msg: 'MOTION DETECTED IN QUADRANT A-1',
                type: 'alert'
            };
            setLogs(prev => [newLog, ...prev].slice(0, 5));
            if (addLog) addLog('SURVEILLANCE: Motion detected!', 'alert');

            Animated.sequence([
                Animated.timing(alertOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(alertOpacity, { toValue: 0.3, duration: 200, useNativeDriver: true }),
                Animated.timing(alertOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(alertOpacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
            ]).start();
        }
    }, [sensorData?.motion]);

    return (
        <View style={styles.container}>
            <View style={styles.contentLayout}>
                {/* Main Camera Column */}
                <View style={[styles.cameraColumn, isFullscreen && styles.fullscreenCameraColumn]}>
                    
                    {/* Status Bar moved ABOVE the feed to stop overlapping */}
                    <View style={styles.hudBar}>
                        <View style={styles.hudTopLeft}>
                            <TouchableOpacity
                                style={[styles.recordingPill, isRecording && { backgroundColor: 'rgba(239, 68, 68, 0.3)' }]}
                                onPress={() => setIsRecording(!isRecording)}
                            >
                                <View style={[styles.redDot, isRecording && styles.redDotActive]} />
                                <Text style={styles.hudText}>{isRecording ? formatTime(recTime) : 'REC'}</Text>
                            </TouchableOpacity>
                            <Text style={styles.timestamp}>{new Date().toLocaleTimeString()}</Text>
                        </View>

                        <View style={styles.hudTopRight}>
                            <View style={styles.hudPill}>
                                <Activity color="#10B981" size={12} />
                                <Text style={styles.hudText}>THREAT LEVEL: LOW</Text>
                            </View>
                            <TouchableOpacity style={styles.viewToggleBtn} onPress={() => setIsFullscreen(!isFullscreen)}>
                                {isFullscreen ? <Minimize color="#3B82F6" size={16} /> : <Maximize color="#3B82F6" size={16} />}
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={[styles.mainFeedWrapper, isFullscreen && styles.fullscreenFeedWrapper]}>
                        <CameraFeed cameraIp={cameraIp} onUpdateIp={onUpdateIp} />

                        {/* Overlay Elements */}
                        <Animated.View style={[styles.alertOverlay, { opacity: alertOpacity }]}>
                            <AlertTriangle color="#EF4444" size={48} />
                            <Text style={styles.alertText}>MOTION ALERT</Text>
                        </Animated.View>

                        {/* AI Bounding Boxes */}
                        {isAiMode && aiObjects.map(obj => (
                            <View
                                key={obj.id}
                                style={[styles.aiBox, {
                                    left: `${obj.x}%`,
                                    top: `${obj.y}%`,
                                    width: `${obj.w}%`,
                                    height: `${obj.h}%`
                                }]}
                            >
                                <View style={styles.aiTag}>
                                    <Text style={styles.aiTagText}>{obj.label} {(obj.conf * 100).toFixed(0)}%</Text>
                                </View>
                            </View>
                        ))}

                        {/* AI Scanning Line */}
                        {isAiMode && (
                            <Animated.View style={[
                                styles.aiScanLine,
                                { 
                                    transform: [{ translateY: aiScanningAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 500, 0] }) }],
                                    opacity: aiScanningAnim.interpolate({ inputRange: [0, 0.9, 1, 2], outputRange: [1, 1, 0, 0] })
                                }
                            ]} />
                        )}

                        {/* UI Removed from overlay and placed cleanly above feed into the HUD */}
                    </View>

                    {/* Quick Stats Below Camera */}
                    {!isFullscreen && (
                        <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Cpu color="#3B82F6" size={16} />
                            <View>
                                <Text style={styles.statLabel}>CORE LOAD</Text>
                                <Text style={styles.statValue}>12%</Text>
                            </View>
                        </View>
                        <View style={styles.statCard}>
                            <Zap color="#F59E0B" size={16} />
                            <View>
                                <Text style={styles.statLabel}>SIGNAL STRENGTH</Text>
                                <Text style={styles.statValue}>-42 dBm</Text>
                            </View>
                        </View>
                        <View style={styles.statCard}>
                            <Shield color="#10B981" size={16} />
                            <View>
                                <Text style={styles.statLabel}>FIRMWARE</Text>
                                <Text style={styles.statValue}>v2.0.4-CAM</Text>
                            </View>
                        </View>
                    </View>
                    )}
                </View>

                {/* Right Panel: Intelligence & Logs */}
                {!isFullscreen && (
                    <View style={styles.sidePanel}>
                        <View style={styles.panelHeader}>
                        <Eye color="#3B82F6" size={16} />
                        <Text style={styles.panelTitle}>INTELLIGENCE LOGS</Text>
                    </View>

                    <ScrollView style={styles.logsContainer}>
                        {logs.map(log => (
                            <View key={log.id} style={[styles.logItem, log.type === 'alert' && styles.logAlert]}>
                                <View style={styles.logHeader}>
                                    <Text style={styles.logTime}>{log.time}</Text>
                                    <View style={[styles.logTypeTag, { backgroundColor: log.type === 'alert' ? '#7F1D1D' : '#1E293B' }]}>
                                        <Text style={styles.logTypeText}>{log.type.toUpperCase()}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.logMsg, log.type === 'alert' && { color: '#FECACA' }]}>{log.msg}</Text>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.targetLock}>
                        <Target color="#EF4444" size={24} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.panelSubTitle}>AI OBJECT TRACKING</Text>
                            <Text style={styles.panelDesc}>Auto-detection engine active. Scanning for entities...</Text>
                        </View>
                    </View>

                    <View style={styles.controlGrid}>
                        <TouchableOpacity style={styles.controlBtn} onPress={takeSnapshot}>
                            <Camera color="#3B82F6" size={20} />
                            <Text style={styles.controlBtnText}>SNAPSHOT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.controlBtn, isAiMode && styles.activeControlBtn]}
                            onPress={() => setIsAiMode(!isAiMode)}
                        >
                            <BrainCircuit color={isAiMode ? "#10B981" : "#94A3B8"} size={20} />
                            <Text style={[styles.controlBtnText, isAiMode && { color: '#10B981' }]}>AI VISION</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 4,
    },
    contentLayout: {
        flexDirection: 'row',
        gap: 20,
    },
    cameraColumn: {
        flex: 2,
    },
    fullscreenCameraColumn: {
        flex: 1,
        width: '100%',
        margin: -5, 
    },
    mainFeedWrapper: {
        position: 'relative',
        height: 540,
        backgroundColor: '#000',
        borderRadius: 12,
        overflow: 'hidden',
    },
    fullscreenFeedWrapper: {
        height: '100%',
        borderRadius: 0,
    },
    fullscreenBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 50,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        padding: 10,
        borderRadius: 8,
    },
    sidePanel: {
        flex: 0.8,
        backgroundColor: '#161D26',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        padding: 20,
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    panelTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 2,
    },
    panelSubTitle: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    panelDesc: {
        color: '#475569',
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
    },
    logsContainer: {
        flex: 1,
    },
    logItem: {
        padding: 12,
        backgroundColor: '#0B0E14',
        borderRadius: 8,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#3B82F6',
    },
    logAlert: {
        borderLeftColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    logTime: {
        color: '#475569',
        fontSize: 10,
        fontWeight: 'bold',
    },
    logTypeTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    logTypeText: {
        color: 'white',
        fontSize: 8,
        fontWeight: '900',
    },
    logMsg: {
        color: '#94A3B8',
        fontSize: 11,
        fontWeight: '600',
    },
    targetLock: {
        flexDirection: 'row',
        gap: 12,
        padding: 15,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
        marginTop: 20,
        alignItems: 'center',
    },
    controlGrid: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 20,
    },
    controlBtn: {
        flex: 1,
        backgroundColor: '#0B0E14',
        borderWidth: 1,
        borderColor: '#1e293b',
        borderRadius: 8,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    controlBtnText: {
        color: '#94A3B8',
        fontSize: 10,
        fontWeight: '900',
    },
    statsRow: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#161D26',
        borderRadius: 10,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    statLabel: {
        color: '#475569',
        fontSize: 10,
        fontWeight: '900',
    },
    statValue: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    hudBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingBottom: 15,
        paddingTop: 5,
    },
    hudTopRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    viewToggleBtn: {
        backgroundColor: '#0F172A',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3B82F6',
    },
    hudTopLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    hudPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    recordingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
        marginBottom: 8,
    },
    redDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
    },
    hudText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    timestamp: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    alertOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        zIndex: 20,
        pointerEvents: 'none',
    },
    alertText: {
        color: '#EF4444',
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 4,
        marginTop: 10,
    },
    aiBox: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#10B981',
        borderRadius: 4,
        zIndex: 15,
    },
    aiTag: {
        position: 'absolute',
        top: -20,
        left: -2,
        backgroundColor: '#10B981',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
    },
    aiTagText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '900',
    },
    aiScanLine: {
        position: 'absolute',
        top: 0,
        left: '5%',
        width: '90%',
        height: 2,
        backgroundColor: '#10B981',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        zIndex: 15,
    },
    redDotActive: {
        opacity: 0.8,
        transform: [{ scale: 1.2 }],
    },
    activeControlBtn: {
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
    }
});

export default SurveillanceView;
