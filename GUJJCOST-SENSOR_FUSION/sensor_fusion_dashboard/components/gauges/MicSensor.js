import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Animated } from 'react-native';
import { Mic, MicOff } from 'lucide-react-native';
import Svg, { Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';

const MicSensor = ({ value = 0, max = 1023 }) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(animatedValue, {
            toValue: value,
            useNativeDriver: false,
            friction: 4,
            tension: 40
        }).start();
    }, [value]);

    const percentage = Math.min(Math.max(value / max, 0), 1);
    const bars = 15;
    const isActive = value > 100;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>ACOUSTIC SENSOR</Text>
                <Text style={styles.unitText}>RAW/ADC</Text>
            </View>

            <View style={styles.insetContainer}>
                <View style={styles.micIconRow}>
                    <View style={[styles.iconCircle, { backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(71, 85, 105, 0.1)' }]}>
                        {isActive ? (
                            <Mic color="#3B82F6" size={24} />
                        ) : (
                            <MicOff color="#475569" size={24} />
                        )}
                    </View>
                    <View>
                        <Text style={styles.statusLabel}>INPUT STATUS</Text>
                        <Text style={[styles.statusValue, { color: isActive ? '#3B82F6' : '#475569' }]}>
                            {isActive ? 'SIGNAL DETECTED' : 'QUIET'}
                        </Text>
                    </View>
                </View>

                <View style={styles.meterContainer}>
                    <Svg width="100%" height="160">
                        <Defs>
                            <LinearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <Stop offset="0%" stopColor="#3B82F6" />
                                <Stop offset="100%" stopColor="#1D4ED8" />
                            </LinearGradient>
                            <LinearGradient id="warnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <Stop offset="0%" stopColor="#EF4444" />
                                <Stop offset="100%" stopColor="#B91C1C" />
                            </LinearGradient>
                        </Defs>

                        <G>
                            {Array.from({ length: bars }).map((_, i) => {
                                const barIdx = bars - 1 - i;
                                const threshold = (barIdx / bars);
                                const isLit = percentage >= threshold;
                                const isWarning = barIdx >= bars - 3; // Top 3 bars are red

                                return (
                                    <Rect
                                        key={i}
                                        x="10%"
                                        y={i * 10 + 5}
                                        width="80%"
                                        height="6"
                                        rx="3"
                                        fill={isLit ? (isWarning ? "url(#warnGrad)" : "url(#barGrad)") : "#1e293b"}
                                        opacity={isLit ? 1 : 0.3}
                                    />
                                );
                            })}
                        </G>
                    </Svg>
                </View>

                <View style={styles.digitalReadout}>
                    <Text style={styles.mainValue}>{Math.round(value)}</Text>
                    <Text style={styles.maxText}>/ {max}</Text>
                </View>
            </View>

            <View style={styles.footerLine}>
                <Text style={styles.footerVal}>{isActive ? 'LIVE' : 'IDLE'}</Text>
                <View style={[styles.footerBadge, { backgroundColor: isActive ? '#1E3A8A' : '#161D26' }]}>
                    <Text style={[styles.footerBadgeText, { color: isActive ? '#3B82F6' : '#475569' }]}>
                        SENSITIVITY: HIGH
                    </Text>
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
        padding: 20,
        borderWidth: 1,
        borderColor: '#1e293b',
        justifyContent: 'space-between',
    },
    micIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusLabel: {
        color: '#475569',
        fontSize: 10,
        fontWeight: '900',
    },
    statusValue: {
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 2,
    },
    meterContainer: {
        flex: 1,
        justifyContent: 'center',
        marginVertical: 20,
    },
    digitalReadout: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
    },
    mainValue: {
        color: 'white',
        fontSize: 32,
        fontWeight: '900',
    },
    maxText: {
        color: '#475569',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 8,
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
        fontSize: 18,
        fontWeight: '900',
    },
    footerBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    footerBadgeText: {
        fontSize: 10,
        fontWeight: '900',
    }
});

export default MicSensor;
