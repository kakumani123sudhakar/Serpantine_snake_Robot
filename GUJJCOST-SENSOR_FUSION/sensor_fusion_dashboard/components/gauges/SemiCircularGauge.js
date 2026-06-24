import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { G, Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

const SemiCircularGauge = ({ label, value, unit, variant = 'blue', min = 0, max = 100, size = 300 }) => {
    const center = size / 2;
    const radius = size * 0.38;
    const strokeWidth = 10;

    // Normalize value
    const range = max - min;
    const percentage = Math.min(Math.max((value - min) / range, 0), 1);

    const startAngle = -210;
    const totalSweep = 240;
    const currentAngle = startAngle + (percentage * totalSweep);

    const getCoord = (angle, r) => {
        const rad = (angle * Math.PI) / 180;
        return {
            x: center + r * Math.cos(rad),
            y: center + r * Math.sin(rad)
        };
    };

    const start = getCoord(startAngle, radius);
    const end = getCoord(startAngle + totalSweep, radius);
    const activePoint = getCoord(currentAngle, radius);

    const backgroundArc = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
    const activeArc = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${percentage * totalSweep > 180 ? 1 : 0} 1 ${activePoint.x} ${activePoint.y}`;

    // Ticks matching ref
    const humidityTicks = [0, 17, 33, 50, 67, 83, 100];
    const gasTicks = [0, 171, 341, 512, 682, 853, 1023];
    const ticks = variant === 'blue' ? humidityTicks : gasTicks;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{label.toUpperCase()}</Text>
                <Text style={styles.unitText}>{unit}</Text>
            </View>

            <View style={styles.insetContainer}>
                {/* Status Badge in corner */}
                <View style={styles.statusBadgeCorner}>
                    <View style={[styles.dot, { backgroundColor: variant === 'blue' ? '#3B82F6' : '#10B981' }]} />
                    <Text style={[styles.statusTextCorner, { color: variant === 'blue' ? '#3B82F6' : '#10B981' }]}>NORMAL</Text>
                </View>

                <View style={styles.illustrationArea}>
                    <Svg width={size} height={size * 0.75}>
                        <Defs>
                            <LinearGradient id="arcColors" x1="0%" y1="0%" x2="100%" y2="0%">
                                <Stop offset="0%" stopColor="#10B981" />
                                <Stop offset="50%" stopColor="#F59E0B" />
                                <Stop offset="100%" stopColor="#EF4444" />
                            </LinearGradient>
                        </Defs>

                        {/* Scale Ticks & Text */}
                        {ticks.map((val, i) => {
                            const angle = startAngle + (i * totalSweep / (ticks.length - 1));
                            const p1 = getCoord(angle, radius + 2);
                            const p2 = getCoord(angle, radius + 12);
                            const pText = getCoord(angle, radius - 20);
                            return (
                                <G key={i}>
                                    <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth="1.5" />
                                    <SvgText
                                        x={pText.x}
                                        y={pText.y + 4}
                                        fill="#475569"
                                        fontSize="11"
                                        fontWeight="900"
                                        textAnchor="middle"
                                    >
                                        {val}
                                    </SvgText>
                                </G>
                            );
                        })}

                        {/* Background Arc */}
                        <Path d={backgroundArc} fill="none" stroke="#1E292E" strokeWidth={strokeWidth} strokeLinecap="round" />

                        {/* Active Arc */}
                        {variant === 'blue' ? (
                            <Path d={activeArc} fill="none" stroke="#3B82F6" strokeWidth={strokeWidth} strokeLinecap="round" />
                        ) : (
                            <Path d={backgroundArc} fill="none" stroke="url(#arcColors)" strokeWidth={strokeWidth} strokeLinecap="round" />
                        )}

                        {/* Refined Needle */}
                        <G transform={`rotate(${currentAngle + 90}, ${center}, ${center})`}>
                            <Line x1={center} y1={center} x2={center} y2={center - radius - 15} stroke={variant === 'blue' ? '#3B82F6' : '#EF4444'} strokeWidth="2.5" strokeLinecap="round" />
                            <Circle cx={center} cy={center} r="6" fill="#0B0E14" stroke={variant === 'blue' ? '#3B82F6' : '#EF4444'} strokeWidth="2" />
                        </G>
                    </Svg>

                    {/* Recessed Value Instrument Panel */}
                    <View style={styles.instrumentValueBox}>
                        <Text style={styles.valueLabel}>CURRENT VALUE</Text>
                        <Text style={styles.valueMain}>{value.toFixed(1)} <Text style={{ fontSize: 12 }}>{unit}</Text></Text>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressLine, { width: `${percentage * 100}%`, backgroundColor: variant === 'blue' ? '#3B82F6' : '#EF4444' }]} />
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.footerRow}>
                <Text style={styles.footerVal}>{value.toFixed(1)}</Text>
                <View style={styles.footerPill}>
                    <Text style={styles.footerPillText}>NORMAL</Text>
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
        position: 'relative',
    },
    statusBadgeCorner: {
        position: 'absolute',
        top: 15,
        right: 15,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.4)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1e293b',
        zIndex: 5,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusTextCorner: {
        fontSize: 10,
        fontWeight: '900',
    },
    illustrationArea: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    instrumentValueBox: {
        backgroundColor: '#020617',
        borderWidth: 1,
        borderColor: '#1e293b',
        width: '70%',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: -30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },
    valueLabel: {
        color: '#475569',
        fontSize: 9,
        fontWeight: '900',
        marginBottom: 4,
    },
    valueMain: {
        color: 'white',
        fontSize: 24,
        fontWeight: '900',
    },
    progressTrack: {
        width: '100%',
        height: 2,
        backgroundColor: '#1e293b',
        marginTop: 10,
        borderRadius: 1,
        overflow: 'hidden',
    },
    progressLine: {
        height: '100%',
    },
    footerRow: {
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
    footerPill: {
        backgroundColor: '#064E3B',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    footerPillText: {
        color: '#10B981',
        fontSize: 10,
        fontWeight: '900',
    }
});

export default SemiCircularGauge;
