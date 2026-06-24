import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Flame } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';

const FlameSensor = ({ detected = false, size = 260 }) => {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>FLAME DETECTION</Text>
                <Text style={styles.unitText}>STATUS</Text>
            </View>

            <View style={styles.insetContainer}>
                {/* Visual Radar Area */}
                <View style={styles.illustrationArea}>
                    <View style={styles.radarWrapper}>
                        <Svg width={size * 0.75} height={size * 0.75}>
                            <Circle cx={size * 0.375} cy={size * 0.375} r={size * 0.32} stroke="#1e293b" strokeWidth="1" fill="none" />
                            <Circle cx={size * 0.375} cy={size * 0.375} r={size * 0.27} stroke="#334155" strokeWidth="2" strokeDasharray="4,4" fill="none" />
                            <Circle cx={size * 0.375} cy={size * 0.375} r={size * 0.22} stroke={detected ? "#EF4444" : "#F59E0B"} strokeWidth="1" strokeOpacity="0.3" fill="none" />
                        </Svg>
                        <View style={styles.iconOverlay}>
                            <Flame color={detected ? "#EF4444" : "#F59E0B"} size={64} fill={detected ? "#EF4444" : "transparent"} />
                            <Text style={[styles.statusMain, { color: detected ? '#EF4444' : '#94A3B8' }]}>
                                {detected ? 'DETECTED' : 'NONE'}
                            </Text>
                        </View>
                    </View>

                    {/* Subtitle */}
                    <Text style={styles.sensorSubtitle}>FLAME DETECTION</Text>

                    {/* Status Pill */}
                    <View style={[styles.statusPill, { backgroundColor: detected ? '#7F1D1D' : '#065F4633', borderColor: detected ? '#F8717133' : '#10B98133' }]}>
                        <View style={[styles.dot, { backgroundColor: detected ? '#EF4444' : '#10B981' }]} />
                        <Text style={[styles.pillText, { color: detected ? '#F87171' : '#10B981' }]}>
                            {detected ? 'ACTIVE' : 'NORMAL'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Footer row */}
            <View style={styles.footerLine}>
                <Text style={styles.footerVal}>{detected ? 'IDLE' : 'STABLE'}</Text>
                <View style={styles.footerBadge}>
                    <Text style={styles.footerBadgeText}>NORMAL</Text>
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
    radarWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    iconOverlay: {
        position: 'absolute',
        alignItems: 'center',
    },
    statusMain: {
        fontSize: 18,
        fontWeight: '900',
        marginTop: 15,
        letterSpacing: 1,
    },
    sensorSubtitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: '900',
        marginTop: 40,
        marginBottom: 24,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 4,
        borderWidth: 1,
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

export default FlameSensor;
