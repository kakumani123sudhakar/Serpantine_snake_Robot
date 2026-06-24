import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Radar, Activity, Crosshair, Map as MapIcon, Save, ZoomIn, ZoomOut, Trash2, Database } from 'lucide-react-native';
import Svg, { Circle, Line, Polyline, G, Text as SvgText, Path } from 'react-native-svg';
import { saveMapToStorage, loadMapFromStorage, clearMapStorage } from '../utils/mapPersistence';

const LidarMap = ({ espIp }) => {
    // Persistent World State
    const [points, setPoints] = useState([]);
    const [stats, setStats] = useState({ scans: 0, rpm: 0 });
    const [isConnected, setIsConnected] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    // Core Pose State
    const [pose, setPose] = useState({ x: 0, y: 0, theta: 0, vx: 0, vy: 0 });
    const [path, setPath] = useState([{x:0, y:0}]);
    const [obstacleDist, setObstacleDist] = useState(null);

    // UI Controls
    const [zoom, setZoom] = useState(0.85);
    const [isAutoCentering, setIsAutoCentering] = useState(true);

    const poseRef = useRef({ x: 0, y: 0, theta: 0, vx: 0, vy: 0 });
    const lastImuTime = useRef(Date.now());
    const wsRef = useRef(null);
    const lastPersistTime = useRef(Date.now());

    const maxPoints = 5000;
    const size = 520;
    const center = size / 2;

    useEffect(() => {
        const initMap = async () => {
            try {
                const savedData = await loadMapFromStorage();
                if (savedData && Array.isArray(savedData.points)) {
                    setPoints(savedData.points);
                    if (savedData.pose) {
                        setPose(savedData.pose);
                        poseRef.current = { ...savedData.pose };
                    }
                    setLastSaved(new Date(savedData.savedAt).toLocaleTimeString());
                }
            } catch (e) {
                console.log('SLAM: Load error', e.message);
            }
        };
        initMap();

        connectWebSocket();
        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [espIp]);

    const updateOdometry = (imuData) => {
        if (!imuData) return;
        const now = Date.now();
        const dt = (now - lastImuTime.current) / 1000;
        lastImuTime.current = now;

        if (dt <= 0 || dt > 1.0) return;

        const { ax = 0, ay = 0, gz = 0 } = imuData;
        
        // Transform the 2D Acceleration force into a viable heading (Yaw)
        // Since we lack a physical gyro, we infer turning from the lateral lean vector
        if (Math.abs(ax) > 0.05 || Math.abs(ay) > 0.05) {
             const targetTheta = Math.atan2(ay, ax);
             // Smooth lerp to the new vector angle so the arrow glides smoothly
             poseRef.current.theta += (targetTheta - poseRef.current.theta) * 0.15;
        }

        const deltaTheta = (gz * (Math.PI / 180)) * dt;
        if(gz) poseRef.current.theta += deltaTheta;

        const accelX = Math.abs(ax) > 0.15 ? ax * 9.8 : 0;
        const accelY = Math.abs(ay) > 0.15 ? ay * 9.8 : 0;

        // Heavily damp velocity so it doesn't drift to infinity from gravity
        const damping = 0.50; 
        poseRef.current.vx = (poseRef.current.vx + accelX * dt) * damping;
        poseRef.current.vy = (poseRef.current.vy + accelY * dt) * damping;

        if (Math.abs(poseRef.current.vx) < 0.1) poseRef.current.vx = 0;
        if (Math.abs(poseRef.current.vy) < 0.1) poseRef.current.vy = 0;

        const cosTheta = Math.cos(poseRef.current.theta);
        const sinTheta = Math.sin(poseRef.current.theta);

        const moveScale = 5;
        poseRef.current.x += (poseRef.current.vx * cosTheta - poseRef.current.vy * sinTheta) * dt * moveScale;
        poseRef.current.y += (poseRef.current.vx * sinTheta + poseRef.current.vy * cosTheta) * dt * moveScale;

        setPose({ ...poseRef.current });

        // Record the continuous path planning line
        setPath(prev => {
            const last = prev[prev.length - 1];
            // Lowered threshold specifically to trace the line much more frequently
            if (!last || Math.abs(last.x - poseRef.current.x) > 0.5 || Math.abs(last.y - poseRef.current.y) > 0.5) {
                return [...prev, { x: poseRef.current.x, y: poseRef.current.y }].slice(-1000);
            }
            return prev;
        });
    };

    const connectWebSocket = () => {
        if (!espIp) return;
        try {
            const ws = new WebSocket(`ws://${espIp}:81`);
            ws.onopen = () => setIsConnected(true);
            ws.onclose = () => {
                setIsConnected(false);
                setTimeout(connectWebSocket, 5000);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data) return;

                    if (data.source === 'nano' || data.source === 'esp32_sensor_hub') {
                        updateOdometry(data);
                        
                        // Parse TF-Luna 1D point (always shooting straight ahead, angle = 0 relative to robot)
                        if (data.lidar_cm !== undefined && data.lidar_strength !== undefined) {
                            // Update TF-Luna stats (signal strength instead of RPM)
                            setStats(prev => ({ scans: (prev.scans || 0) + 1, strength: data.lidar_strength }));

                            if (data.lidar_strength > 20 && data.lidar_cm > 2) { 
                                setObstacleDist(data.lidar_cm); // Bind to visual reach envelope
                                const dCm = data.lidar_cm;
                                const globalAngle = poseRef.current.theta || 0;
                                const pt = {
                                    x: (poseRef.current.x || 0) + dCm * Math.cos(globalAngle),
                                    y: (poseRef.current.y || 0) + dCm * Math.sin(globalAngle),
                                    timestamp: Date.now()
                                };
                                setPoints(prev => [...(prev || []), pt].slice(-maxPoints));
                            } else {
                                setObstacleDist(null); // Clear obstacle bounding if void
                            }
                        }
                    }
                } catch (e) {
                    // console.log('SLAM: WS Message Error', e.message);
                }
            };
            wsRef.current = ws;
        } catch (e) { }
    };

    // Mapping Viz Logic
    const viewScale = 1.2 * zoom;

    const mapElements = useMemo(() => {
        if (!Array.isArray(points)) return null;

        const centerX = isAutoCentering ? (pose.x || 0) : 0;
        const centerY = isAutoCentering ? (pose.y || 0) : 0;

        return points.map((p, i) => {
            if (!p || typeof p.x === 'undefined' || typeof p.y === 'undefined') return null;

            const relX = center + (p.x - centerX) * viewScale;
            const relY = center + (p.y - centerY) * viewScale;

            if (relX < -size || relX > size * 2 || relY < -size || relY > size * 2) return null;

            const age = Date.now() - p.timestamp;
            const opacity = Math.max(0.4, 1 - age / 300000); // Higher min-opacity so map outline doesn't vanish quickly

            return (
                <G key={`pt-${i}`}>
                    <Circle
                        cx={relX}
                        cy={relY}
                        r={2.5}
                        fill="#F59E0B"
                        opacity={opacity}
                    />
                    <Circle
                        cx={relX}
                        cy={relY}
                        r={6}
                        fill="rgba(245, 158, 11, 0.2)"
                        opacity={opacity}
                    />
                </G>
            );
        });
    }, [points, pose, zoom, isAutoCentering]);

    const handleClear = async () => {
        setPoints([]);
        poseRef.current = { x: 0, y: 0, theta: 0, vx: 0, vy: 0 };
        setPose({ ...poseRef.current });
        await clearMapStorage();
        setLastSaved(null);
    };

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.titleBlock}>
                    <Database color="#3B82F6" size={20} />
                    <View>
                        <Text style={styles.mainTitle}>LUNA SLAM ENGINE</Text>
                        <Text style={styles.subTitle}>{lastSaved ? `RESTORATION ACTIVE - SYNC ${lastSaved}` : '1D REAL-TIME MAPPING'}</Text>
                    </View>
                </View>

                <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.roundBtn} onPress={handleClear}><Trash2 color="#EF4444" size={16} /></TouchableOpacity>
                    <TouchableOpacity style={styles.roundBtn} onPress={() => setZoom(z => Math.max(0.2, z - 0.1))}><ZoomOut color="#94A3B8" size={16} /></TouchableOpacity>
                    <TouchableOpacity style={styles.roundBtn} onPress={() => setZoom(z => Math.min(5, z + 0.1))}><ZoomIn color="#94A3B8" size={16} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.roundBtn, isAutoCentering && styles.activeBtn]} onPress={() => setIsAutoCentering(!isAutoCentering)}><Crosshair color={isAutoCentering ? "#3B82F6" : "#94A3B8"} size={16} /></TouchableOpacity>
                </View>
            </View>

            <View style={styles.mapFrame}>
                <Svg width="100%" height={size} style={styles.svg}>
                    {mapElements}

                    {/* Path History */}
                    {path.length > 1 && (
                        <Polyline
                            points={path.map(p => `${center + (p.x - (isAutoCentering ? (pose.x || 0) : 0)) * viewScale},${center + (p.y - (isAutoCentering ? (pose.y || 0) : 0)) * viewScale}`).join(' ')}
                            fill="none"
                            stroke="rgba(16, 185, 129, 0.6)"
                            strokeWidth="3"
                        />
                    )}

                    {/* Robot Avatar & Lidar Reach Obstacle Envelope */}
                    <G transform={`translate(${center + ((pose.x || 0) - (isAutoCentering ? (pose.x || 0) : 0)) * viewScale}, ${center + ((pose.y || 0) - (isAutoCentering ? (pose.y || 0) : 0)) * viewScale}) rotate(${((pose.theta || 0) * 180) / Math.PI + 90})`}>
                        
                        {/* Collision Perimeter Envelope (If Lidar reads obstacle within 150cm) */}
                        {obstacleDist && obstacleDist < 150 && (
                            <G>
                                <Path 
                                    d={`M0 0 L-25 ${-obstacleDist * viewScale} A${obstacleDist * viewScale} ${obstacleDist * viewScale} 0 0 1 25 ${-obstacleDist * viewScale} Z`} 
                                    fill="rgba(239, 68, 68, 0.15)" stroke="#EF4444" strokeWidth="1" strokeDasharray="4,4" 
                                />
                                <Circle cx="0" cy={-obstacleDist * viewScale} r="3" fill="#EF4444" />
                                <Circle cx="0" cy={-obstacleDist * viewScale} r="10" fill="rgba(239, 68, 68, 0.4)" />
                            </G>
                        )}
                        
                        <Path d="M0 -15 L10 10 L0 5 L-10 10 Z" fill="#3B82F6" stroke="white" strokeWidth="2" />
                    </G>
                </Svg>

                <View style={styles.telemetryOverlay}>
                    <Text style={styles.telText}>X: {(pose.x || 0).toFixed(0)} Y: {(pose.y || 0).toFixed(0)}</Text>
                    <Text style={styles.telText}>θ: {(((pose.theta || 0) * 180) / Math.PI).toFixed(1)}°</Text>
                    <Text style={styles.telText}>PTS: {points.length || 0}</Text>
                </View>
            </View>

            <View style={styles.footer}>
                <View style={styles.infoCol}>
                    <Text style={styles.infoVal}>{(stats.strength || 0).toFixed(0)}</Text>
                    <Text style={styles.infoKey}>LUNA STRENGTH</Text>
                </View>
                <View style={styles.infoCol}>
                    <View style={[styles.statusBox, { borderColor: isConnected ? '#10B98133' : '#EF444433' }]}>
                        <Text style={[styles.statusBoxText, { color: isConnected ? '#10B981' : '#EF4444' }]}>
                            {isConnected ? 'HW LINK ACTIVE' : 'HW LINK LOST'}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: { backgroundColor: '#161D26', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1e293b', marginBottom: 24 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    titleBlock: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    mainTitle: { color: 'white', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    subTitle: { color: '#475569', fontSize: 9, fontWeight: 'bold' },
    btnRow: { flexDirection: 'row', gap: 8 },
    roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
    activeBtn: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: '#3B82F6' },
    mapFrame: { backgroundColor: '#020617', borderRadius: 20, borderWidth: 1, borderColor: '#1e293b', overflow: 'hidden' },
    svg: { width: '100%' },
    telemetryOverlay: { position: 'absolute', bottom: 15, left: 15, backgroundColor: 'rgba(15, 23, 42, 0.8)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' },
    telText: { color: 'white', fontSize: 9, fontWeight: 'bold', fontFamily: 'monospace' },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
    infoCol: { alignItems: 'center' },
    infoVal: { color: 'white', fontSize: 18, fontWeight: '900' },
    infoKey: { color: '#475569', fontSize: 8, fontWeight: 'bold' },
    statusBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    statusBoxText: { fontSize: 9, fontWeight: '900' }
});

export default LidarMap;
