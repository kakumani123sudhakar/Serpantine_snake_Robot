import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, ScrollView, Platform, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { G, Circle, Line, Path, Rect, Defs, LinearGradient, Stop, RadialGradient, Mask, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, Layers, Maximize2, Crosshair, Compass as CompassIcon, Gauge, Activity, Radio, ShieldAlert } from 'lucide-react-native';

const DoFDetailView = ({ roll = 0, pitch = 0, yaw = 0, speed = 0, segments = new Array(13).fill(0), onBack }) => {
    const { width, height } = Dimensions.get('window');
    const scanAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
                Animated.timing(scanAnim, { toValue: 0, duration: 0, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const size = 340;
    const center = size / 2;
    const radius = 120;

    return (
        <View style={styles.container}>
            {/* TACTICAL BACKGROUND OVERLAY */}
            <View style={styles.scanlineOverlay} pointerEvents="none" />

            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
                    <ChevronLeft color="#3B82F6" size={28} />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle}>KINEMATIC ANALYSIS</Text>
                    <View style={styles.headerSub}>
                        <Radio color="#10B981" size={10} />
                        <Text style={styles.headerSubText}>LIVE ROBOTIC TELEMETRY • ST3020 BUS SYNC</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <View style={styles.fusedBadge}>
                        <Activity color="#60A5FA" size={12} />
                        <Text style={styles.fusedText}>FUSION ACTIVE</Text>
                    </View>
                </View>
            </View>

            <View style={styles.contentGrid}>
                {/* LEFT COLUMN: EUCLIDEAN APPLET (Wider Frame) */}
                <View style={[styles.col, { flex: 1.5 }]}>
                    <View style={styles.skeletonCard}>
                        <View style={styles.cardHeader}>
                            <Layers color="#3B82F6" size={16} />
                            <Text style={styles.cardLabel}>EUCLIDEAN KINEMATIC SIMULATION</Text>
                        </View>

                        <Text style={styles.diagnosticText}>REAL-TIME VECTOR SYNC</Text>

                        <View style={styles.canvasContainer}>
                            <WebView 
                                source={{ uri: 'https://www.geogebra.org/calculator/bxwqg3t7?embed' }}
                                style={styles.webViewCanvas}
                                javaScriptEnabled={true}
                                domStorageEnabled={true}
                                bounces={false}
                                scrollEnabled={true}
                                androidHardwareAccelerationDisabled={false}
                            />
                        </View>

                        <View style={styles.skeletonFooter}>
                            <ShieldAlert color="#475569" size={14} />
                            <Text style={styles.footerText}>CANVAS ENGINE • OPENGL ACCELERATED</Text>
                        </View>
                    </View>
                </View>

                {/* RIGHT COLUMN: PRIMARY ATTITUDE (AhRS) (Narrow Frame) */}
                <View style={[styles.col, { flex: 1 }]}>
                    <View style={styles.instrumentPanel}>
                        <View style={styles.cardHeader}>
                            <Crosshair color="#3B82F6" size={16} />
                            <Text style={styles.cardLabel}>PRIMARY ATTITUDE INDICATOR (AHRS)</Text>
                        </View>

                        <View style={styles.mainVisualizer}>
                            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                                <Defs>
                                    <LinearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <Stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.9" />
                                        <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0.4" />
                                    </LinearGradient>
                                    <LinearGradient id="groundGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <Stop offset="0%" stopColor="#854d0e" stopOpacity="0.8" />
                                        <Stop offset="100%" stopColor="#451a03" stopOpacity="0.9" />
                                    </LinearGradient>
                                    <Mask id="sphereMask">
                                        <Circle cx={center} cy={center} r={radius} fill="white" />
                                    </Mask>
                                </Defs>

                                {/* GIMBAL RING */}
                                <Circle cx={center} cy={center} r={radius + 15} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="5,5" />
                                <Circle cx={center} cy={center} r={radius + 10} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth="8" />

                                <G mask="url(#sphereMask)">
                                    {/* ROTATING HORIZON */}
                                    <G transform={`rotate(${-roll} ${center} ${center}) translate(0 ${pitch * 3})`}>
                                        <Rect x={center - 300} y={center - 400} width={600} height={400} fill="url(#skyGrad)" />
                                        <Rect x={center - 300} y={center} width={600} height={400} fill="url(#groundGrad)" />

                                        {/* PITCH TICKS */}
                                        {[-30, -20, -10, 10, 20, 30].map(p => (
                                            <G key={p} transform={`translate(0, ${-p * 3})`}>
                                                <Line x1={center - 40} y1={center} x2={center + 40} y2={center} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                                                <SvgText x={center + 50} y={center + 4} fill="rgba(255,255,255,0.5)" fontSize="10" fontWeight="bold">{Math.abs(p)}</SvgText>
                                            </G>
                                        ))}
                                        <Line x1={center - 200} y1={center} x2={center + 200} y2={center} stroke="white" strokeWidth="2" />
                                    </G>
                                </G>

                                {/* FIXED AIRCRAFT SYMBOL */}
                                <Path d={`M${center - 60} ${center} L${center - 30} ${center} L${center} ${center + 15} L${center + 30} ${center} L${center + 60} ${center}`} fill="none" stroke="#FBBF24" strokeWidth="4" strokeLinecap="round" />
                                <Circle cx={center} cy={center} r={4} fill="#FBBF24" />

                                {/* BEZEL */}
                                <Circle cx={center} cy={center} r={radius} fill="none" stroke="#334155" strokeWidth="6" />
                            </Svg>
                        </View>

                        <View style={styles.metricsRow}>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>ROLL</Text>
                                <Text style={[styles.metricVal, { color: Math.abs(roll) > 20 ? '#ef4444' : 'white' }]}>{roll.toFixed(1)}°</Text>
                            </View>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>PITCH</Text>
                                <Text style={[styles.metricVal, { color: Math.abs(pitch) > 15 ? '#ef4444' : 'white' }]}>{pitch.toFixed(1)}°</Text>
                            </View>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>YAW</Text>
                                <Text style={styles.metricVal}>{yaw.toFixed(1)}°</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.secondaryGrid}>
                        <View style={styles.subCard}>
                            <CompassIcon color="#60A5FA" size={14} />
                            <View style={styles.subCardContent}>
                                <Text style={styles.subLabel}>HEADING</Text>
                                <Text style={styles.subVal}>{Math.abs(yaw).toFixed(1)}° {yaw > 0 ? 'EAST' : 'WEST'}</Text>
                            </View>
                        </View>
                        <View style={styles.subCard}>
                            <Gauge color="#60A5FA" size={14} />
                            <View style={styles.subCardContent}>
                                <Text style={styles.subLabel}>VELOCITY</Text>
                                <Text style={styles.subVal}>{speed.toFixed(1)} cm/s</Text>
                            </View>
                        </View>
                    </View>
                </View>

            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617', padding: 24 },
    scanlineOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', zIndex: 10, borderWidth: 0, borderTopWidth: 2, borderTopColor: 'rgba(59,130,246,0.05)', height: 2 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 20 },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
    headerInfo: { flex: 1 },
    headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold', letterSpacing: 0.5 },
    headerSub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    headerSubText: { color: '#475569', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
    headerRight: { justifyContent: 'center' },
    fusedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' },
    fusedText: { color: '#60A5FA', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    contentGrid: { flex: 1, flexDirection: 'row', gap: 24 },
    col: { gap: 24 },
    instrumentPanel: { flex: 1, backgroundColor: '#0f172a', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1e293b' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
    cardLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    mainVisualizer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    metricsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, backgroundColor: '#020617', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b' },
    metricItem: { alignItems: 'center' },
    metricLabel: { color: '#475569', fontSize: 8, fontWeight: 'bold', marginBottom: 4 },
    metricVal: { color: 'white', fontSize: 16, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    secondaryGrid: { flexDirection: 'row', gap: 16 },
    subCard: { flex: 1, backgroundColor: '#0f172a', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#1e293b' },
    subCardContent: {},
    subLabel: { color: '#475569', fontSize: 8, fontWeight: 'bold' },
    subVal: { color: 'white', fontSize: 14, fontWeight: 'bold', marginTop: 2 },
    skeletonCard: { flex: 1, backgroundColor: '#0f172a', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1e293b' },
    diagnosticText: { color: '#3B82F6', fontSize: 10, fontWeight: 'bold', marginBottom: 20 },
    jointScroll: { flex: 1 },
    boneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    boneId: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
    boneIdText: { color: '#475569', fontSize: 10, fontWeight: 'bold' },
    artTrack: { flex: 1, height: 8, backgroundColor: '#020617', borderRadius: 4, overflow: 'hidden', position: 'relative' },
    artFill: { height: '100%', borderRadius: 4 },
    artPivot: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
    boneVal: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold', width: 45, textAlign: 'right', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    skeletonFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1e293b' },
    footerText: { color: '#475569', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5 },
    canvasContainer: { flex: 1, width: '100%', backgroundColor: '#020617', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1e293b' },
    webViewCanvas: { flex: 1, width: '100%', height: '100%', backgroundColor: 'transparent' }
});

export default DoFDetailView;
