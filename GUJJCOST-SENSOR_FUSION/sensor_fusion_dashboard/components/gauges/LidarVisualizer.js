import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText, Defs, RadialGradient, Stop } from 'react-native-svg';

const LidarVisualizer = ({ distance = 250, maxRange = 500, size = 320 }) => {
    const center = size / 2;
    const radius = size * 0.42;
    const normalizedDist = Math.min(distance / maxRange, 1) * radius;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>LIDAR MAPPING</Text>
                <Text style={styles.unitText}>NAV-NODE</Text>
            </View>

            <View style={styles.insetContainer}>
                <View style={styles.radarWrapper}>
                    <Svg width={size} height={size}>
                        <Defs>
                            <RadialGradient id="radarGrad" cx="50%" cy="50%" rx="50%" ry="50%">
                                <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                                <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
                            </RadialGradient>
                        </Defs>

                        {/* Outer Glow */}
                        <Circle cx={center} cy={center} r={radius + 15} fill="#020617" stroke="#1e293b" strokeWidth="1" />

                        {/* Radar Grids */}
                        <Circle cx={center} cy={center} r={radius} fill="url(#radarGrad)" stroke="#1e293b" strokeWidth="1" />
                        <Circle cx={center} cy={center} r={radius * 0.75} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
                        <Circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
                        <Circle cx={center} cy={center} r={radius * 0.25} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />

                        {/* Axis Lines */}
                        <Line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="#1e293b" strokeWidth="1" />
                        <Line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="#1e293b" strokeWidth="1" />

                        {/* Range Markers */}
                        <SvgText x={center + 5} y={center - radius + 15} fill="#475569" fontSize="10" fontWeight="900">{maxRange}</SvgText>
                        <SvgText x={center + 5} y={center - radius * 0.5 + 15} fill="#475569" fontSize="10" fontWeight="900">{maxRange / 2}</SvgText>

                        {/* Detection Beacon */}
                        {distance > 0 && (
                            <G transform={`translate(${center}, ${center - normalizedDist})`}>
                                <Circle cx="0" cy="0" r="8" fill="#EF4444" />
                                <Circle cx="0" cy="0" r="16" fill="#EF4444" fillOpacity="0.2" />
                                <Line x1="0" y1="0" x2="0" y2={normalizedDist} stroke="#EF4444" strokeWidth="1" strokeDasharray="2,2" strokeOpacity="0.5" />
                            </G>
                        )}
                    </Svg>

                    {/* Central Value Panel */}
                    <View style={styles.valueBox}>
                        <Text style={styles.valueText}>{distance.toFixed(1)} <Text style={{ fontSize: 10 }}>cm</Text></Text>
                        <Text style={styles.valueLabel}>PROXIMITY</Text>
                    </View>
                </View>

                {/* Status Overlay */}
                <View style={styles.statusPill}>
                    <View style={[styles.dot, { backgroundColor: distance < 50 ? '#EF4444' : '#10B981' }]} />
                    <Text style={[styles.pillText, { color: distance < 50 ? '#EF4444' : '#10B981' }]}>
                        {distance < 50 ? 'OBSTACLE DETECTED' : 'RANGE CLEAR'}
                    </Text>
                </View>
            </View>

            {/* Footer row */}
            <View style={styles.footerLine}>
                <Text style={styles.footerVal}>{normalizedDist.toFixed(0)}</Text>
                <View style={styles.footerBadge}>
                    <Text style={styles.footerBadgeText}>NAV: OK</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#161D26',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1e293b',
        flex: 1,
        height: 540,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    cardTitle: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
    },
    unitText: {
        color: '#475569',
        fontSize: 10,
        fontWeight: 'bold',
    },
    insetContainer: {
        backgroundColor: '#0B0E14',
        borderRadius: 12,
        flex: 1,
        padding: 5,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1e293b',
        justifyContent: 'center',
    },
    radarWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    valueBox: {
        position: 'absolute',
        bottom: '20%',
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#1e293b',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        alignItems: 'center',
    },
    valueText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '900',
    },
    valueLabel: {
        color: '#475569',
        fontSize: 8,
        fontWeight: '900',
        marginTop: 2,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.4)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#1e293b',
        marginTop: 20,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 8,
    },
    pillText: {
        fontSize: 10,
        fontWeight: '900',
    },
    footerLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderColor: '#1e293b',
    },
    footerVal: {
        color: 'white',
        fontSize: 20,
        fontWeight: '900',
    },
    footerBadge: {
        backgroundColor: '#064E3B',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    footerBadgeText: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: '900',
    }
});

export default LidarVisualizer;
