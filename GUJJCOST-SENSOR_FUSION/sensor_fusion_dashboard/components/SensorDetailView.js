import React, { useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import Svg, { Polyline, G, Line, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { ChevronLeft, Info, TrendingUp, ShieldAlert, Activity, ShieldCheck, Zap } from 'lucide-react-native';

const SensorDetailView = ({ sensor, value, history = [], confidence = 98.4, onBack }) => {
    const { width } = Dimensions.get('window');
    const chartHeight = 180;
    const chartWidth = width * 0.6;

    const points = useMemo(() => {
        if (history.length < 2) return "";
        const minVal = Math.min(...history);
        const maxVal = Math.max(...history);
        const range = maxVal - minVal || 1;

        return history.map((val, i) => {
            const x = (i / (history.length - 1)) * chartWidth;
            const y = chartHeight - ((val - minVal) / range) * chartHeight;
            return `${x},${y}`;
        }).join(' ');
    }, [history, chartWidth]);

    const stats = [
        { label: 'PEAK VALUE', val: Math.max(...history, value).toFixed(1), icon: <TrendingUp color="#EF4444" size={16} /> },
        { label: 'AVG (FUSED)', val: (history.reduce((a, b) => a + b, 0) / (history.length || 1)).toFixed(1), icon: <Activity color="#3B82F6" size={16} /> },
        { label: 'SIGNAL CONFIDENCE', val: `${confidence.toFixed(1)}%`, icon: <Zap color="#FBBF24" size={16} /> }
    ];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ChevronLeft color="#3B82F6" size={32} />
                    <Text style={styles.backText}>BACK TO SYSTEMS</Text>
                </TouchableOpacity>
                <View style={styles.headerTitleGroup}>
                    <View style={styles.fusedBadge}>
                        <ShieldCheck color="#10B981" size={12} />
                        <Text style={styles.fusedText}>KALMAN FILTER ACTIVE</Text>
                    </View>
                    <Text style={styles.title}>{sensor.toUpperCase()} System Analysis</Text>
                </View>
            </View>

            <View style={styles.mainContent}>
                {/* Left Side: Stats & Details */}
                <View style={styles.leftPanel}>
                    <View style={styles.mainDisplay}>
                        <Text style={styles.sensorName}>STATE ESTIMATION</Text>
                        <Text style={styles.currentVal}>{value.toFixed(1)}</Text>
                        <Text style={styles.unitText}>FUSED DATA SOURCE</Text>
                    </View>

                    <View style={styles.statsGrid}>
                        {stats.map((stat, i) => (
                            <View key={i} style={styles.statCard}>
                                <View style={styles.statHeader}>
                                    {stat.icon}
                                    <Text style={styles.statLabel}>{stat.label}</Text>
                                </View>
                                <Text style={[styles.statVal, stat.label === 'SIGNAL CONFIDENCE' && { color: confidence > 90 ? '#10B981' : '#FBBF24' }]}>{stat.val}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.probabilityPanel}>
                        <View style={styles.probHeader}>
                            <Info color="#3B82F6" size={16} />
                            <Text style={styles.probTitle}>PROBABILITY ANALYSIS</Text>
                        </View>
                        <Text style={styles.probDesc}>Real-time state estimation using a recursive Kalman filter. Signal noise is suppressed by {(100 - (100 - confidence) * 2).toFixed(1)}% accuracy.</Text>
                        <View style={styles.confidenceBarTrack}>
                            <View style={[styles.confidenceFill, { width: `${confidence}%`, backgroundColor: confidence > 90 ? '#10B981' : '#FBBF24' }]} />
                        </View>
                    </View>
                </View>

                {/* Right Side: High-Fidelity Graph */}
                <View style={styles.rightPanel}>
                    <View style={styles.chartHeader}>
                        <Activity color="#475569" size={16} />
                        <Text style={styles.chartTitle}>ESTIMATED TRAJECTORY (FUSED)</Text>
                    </View>

                    <View style={styles.chartWrapper}>
                        <Svg width={chartWidth} height={chartHeight}>
                            <Defs>
                                <LinearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                                    <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                                </LinearGradient>
                            </Defs>

                            {/* Grid Lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                                <Line
                                    key={i}
                                    x1="0" y1={chartHeight * p}
                                    x2={chartWidth} y2={chartHeight * p}
                                    stroke="#1e293b"
                                    strokeWidth="1"
                                    strokeDasharray="4,4"
                                />
                            ))}

                            {/* Data Line (Smoothed) */}
                            <Polyline
                                points={points}
                                fill="none"
                                stroke="#3B82F6"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />

                            {/* Area Fill */}
                            <Polyline
                                points={`${points} ${chartWidth},${chartHeight} 0,${chartHeight}`}
                                fill="url(#chartGrad)"
                                stroke="none"
                            />
                        </Svg>
                    </View>

                    <View style={styles.infoFooter}>
                        <Text style={styles.footerText}>ALGORITHM: 1D KALMAN (RECURSIVE)</Text>
                        <Text style={styles.footerText}>STABILITY: {confidence > 98 ? 'HIGH' : 'OPTIMAL'}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0E14', padding: 30 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
    backBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingRight: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' },
    backText: { color: '#3B82F6', fontWeight: '900', fontSize: 12, marginLeft: 8 },
    headerTitleGroup: { marginLeft: 30 },
    fusedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    fusedText: { color: '#10B981', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
    title: { color: 'white', fontSize: 28, fontWeight: 'bold' },
    mainContent: { flex: 1, flexDirection: 'row', gap: 30 },
    leftPanel: { flex: 1, gap: 24 },
    rightPanel: { flex: 1.5, backgroundColor: '#161D26', borderRadius: 24, padding: 30, borderWidth: 1, borderColor: '#1e293b' },
    mainDisplay: { backgroundColor: '#161D26', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
    sensorName: { color: '#3B82F6', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
    currentVal: { color: 'white', fontSize: 72, fontWeight: '900' },
    unitText: { color: '#475569', fontSize: 10, fontWeight: 'bold', marginTop: 10 },
    statsGrid: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: '#0B0E14', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1e293b' },
    statHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    statLabel: { color: '#475569', fontSize: 9, fontWeight: '900' },
    statVal: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    probabilityPanel: { backgroundColor: '#161D26', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1e293b', gap: 12 },
    probHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    probTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    probDesc: { color: '#475569', fontSize: 11, lineHeight: 16 },
    confidenceBarTrack: { height: 6, backgroundColor: '#0B0E14', borderRadius: 3, overflow: 'hidden', marginTop: 10 },
    confidenceFill: { height: '100%', borderRadius: 3 },
    chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 30 },
    chartTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    chartWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    infoFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#1e293b' },
    footerText: { color: '#475569', fontSize: 10, fontWeight: '900' }
});

export default SensorDetailView;
