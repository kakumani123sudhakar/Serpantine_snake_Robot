import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText } from 'react-native-svg';

const MotionSensor = ({ moving = false, pitch = 0, roll = 0, size = 260 }) => {
    const directions = ['W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW'];
    const radius = size * 0.3;
    const center = size * 0.35;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>ATTITUDE & MOTION</Text>
                <Text style={styles.unitText}>DEG</Text>
            </View>

            <View style={styles.insetContainer}>
                {/* Navigational Dial Area */}
                <View style={styles.illustrationArea}>
                    <View style={styles.dialWrapper}>
                        <Svg width={size * 0.8} height={size * 0.8}>
                            {/* Protective Rings */}
                            <Circle cx={center} cy={center} r={radius} stroke="#10B981" strokeWidth="1" fill="none" strokeOpacity="0.2" />
                            <Circle cx={center} cy={center} r={radius * 1.3} stroke="#1e293b" strokeWidth="1" fill="none" />

                            {/* Crosshair / Attitude Visual */}
                            <G transform={`rotate(${roll}, ${center}, ${center}) translate(0, ${pitch})`}>
                                <Line x1={center - 30} y1={center} x2={center + 30} y2={center} stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                                <Line x1={center} y1={center - 5} x2={center} y2={center + 5} stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                            </G>

                            {/* Dial Directions */}
                            {directions.map((dir, i) => {
                                const angle = (i * 45 - 90) * (Math.PI / 180);
                                const x = center + (radius + 20) * Math.cos(angle);
                                const y = center + (radius + 20) * Math.sin(angle);
                                const isActive = dir === 'N';
                                return (
                                    <SvgText
                                        key={dir}
                                        x={x}
                                        y={y + 4}
                                        fill={isActive ? '#10B981' : '#475569'}
                                        fontSize="10"
                                        fontWeight="900"
                                        textAnchor="middle"
                                    >
                                        {dir}
                                    </SvgText>
                                );
                            })}
                        </Svg>
                    </View>

                    {/* Numeric IMU Data readout */}
                    <View style={styles.imuDataRow}>
                        <View style={styles.imuMetric}>
                            <Text style={styles.imuLabel}>PITCH</Text>
                            <Text style={styles.imuValue}>{pitch.toFixed(1)}°</Text>
                        </View>
                        <View style={styles.imuMetric}>
                            <Text style={styles.imuLabel}>ROLL</Text>
                            <Text style={styles.imuValue}>{roll.toFixed(1)}°</Text>
                        </View>
                    </View>

                    {/* Big Status Text */}
                    <Text style={[styles.mainStatus, { color: moving ? '#F59E0B' : '#10B981' }]}>
                        {moving ? 'MOVING' : 'STABLE'}
                    </Text>

                    {/* Status Pill */}
                    <View style={[styles.statusPill, { backgroundColor: moving ? '#78350F' : '#064E3B' }]}>
                        <View style={[styles.dot, { backgroundColor: moving ? '#F59E0B' : '#10B981' }]} />
                        <Text style={[styles.pillText, { color: moving ? '#F59E0B' : '#10B981' }]}>
                            {moving ? 'DETECTED' : 'SYSTEM OK'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Footer row */}
            <View style={styles.footerLine}>
                <Text style={styles.footerVal}>{moving ? 'MOTION' : 'STABLE'}</Text>
                <View style={styles.footerBadge}>
                    <Text style={styles.footerBadgeText}>IMU: {Math.abs(pitch) < 5 && Math.abs(roll) < 5 ? 'LEVEL' : 'TILT'}</Text>
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
    illustrationArea: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    imuDataRow: {
        flexDirection: 'row',
        gap: 30,
        backgroundColor: 'rgba(2, 6, 23, 0.5)',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    imuMetric: {
        alignItems: 'center',
    },
    imuLabel: {
        color: '#475569',
        fontSize: 8,
        fontWeight: '900',
    },
    imuValue: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 2,
    },
    mainStatus: {
        fontSize: 22,
        fontWeight: '900',
        marginTop: 20,
        marginBottom: 15,
        letterSpacing: 2,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 8,
    },
    pillText: {
        fontSize: 12,
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
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    footerBadgeText: {
        color: '#60A5FA',
        fontSize: 10,
        fontWeight: '900',
    }
});

export default MotionSensor;
