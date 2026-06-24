import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { G, Rect, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

const VerticalGauge = ({ label, value, unit, color = '#10B981', min = 0, max = 50, size = 280 }) => {
    // Proportional dimensions for the 12.7" tablet
    const width = 200;
    const height = 300; // Total height for SVG area
    const center = width / 2;

    const range = max - min;
    const percentage = Math.min(Math.max((value - min) / range, 0), 1);

    // Geometry from reference image
    const tubeWidth = 14;
    const bulbRadius = 18;
    const topY = 40;
    const bottomY = height - 50;
    const totalHeight = bottomY - topY;
    const fillHeight = percentage * totalHeight;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{label.toUpperCase()}</Text>
                <Text style={styles.unitText}>{unit}</Text>
            </View>

            <View style={styles.insetContainer}>
                <Text style={styles.gaugeSubTitle}>TEMPERATURE °C</Text>

                <View style={styles.svgWrapper}>
                    <Svg width={width} height={height}>
                        <Defs>
                            <LinearGradient id="liquidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <Stop offset="0%" stopColor={color} />
                                <Stop offset="100%" stopColor={color} stopOpacity="0.6" />
                            </LinearGradient>
                        </Defs>

                        {/* Scale Labels */}
                        {[0, 13, 25, 38, 50].map((v) => {
                            const y = bottomY - ((v / 50) * totalHeight);
                            return (
                                <G key={v}>
                                    <Line x1={center + 15} y1={y} x2={center + 25} y2={y} stroke="#334155" strokeWidth="1" />
                                    <SvgText
                                        x={center + 32}
                                        y={y + 4}
                                        fill="#475569"
                                        fontSize="12"
                                        fontWeight="900"
                                        textAnchor="start"
                                    >
                                        -{v}
                                    </SvgText>
                                </G>
                            );
                        })}

                        {/* Glass Tube Frame */}
                        <Rect
                            x={center - tubeWidth / 2 - 2}
                            y={topY - 4}
                            width={tubeWidth + 4}
                            height={totalHeight + 8}
                            rx={(tubeWidth + 4) / 2}
                            fill="#0B0E14"
                        />

                        {/* Glass Tube Background */}
                        <Rect
                            x={center - tubeWidth / 2}
                            y={topY}
                            width={tubeWidth}
                            height={totalHeight}
                            rx={tubeWidth / 2}
                            fill="#161D26"
                        />

                        {/* Liquid Active Fill */}
                        <Rect
                            x={center - tubeWidth / 2}
                            y={bottomY - fillHeight}
                            width={tubeWidth}
                            height={fillHeight}
                            rx={tubeWidth / 2}
                            fill="url(#liquidGrad)"
                        />

                        {/* Bottom Glowing Bulb */}
                        <Circle cx={center} cy={bottomY} r={bulbRadius} fill={color} />
                        <Circle cx={center - 5} cy={bottomY - 5} r={4} fill="white" fillOpacity="0.2" />
                    </Svg>
                </View>

                {/* Digital Readout */}
                <View style={styles.valueDisplay}>
                    <Text style={[styles.mainValue, { color: value > 40 ? '#EF4444' : '#10B981' }]}>
                        {value.toFixed(1)} <Text style={{ fontSize: 14 }}>°C</Text>
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: value > 40 ? '#7F1D1D' : '#064E3B' }]}>
                        <Text style={[styles.statusText, { color: value > 40 ? '#F87171' : '#10B981' }]}>
                            {value > 40 ? 'DANGER' : 'NORMAL'}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.footerLine}>
                <Text style={styles.footerVal}>{value.toFixed(1)}°</Text>
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
        position: 'relative',
    },
    gaugeSubTitle: {
        color: '#475569',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.5,
        marginTop: 15,
    },
    svgWrapper: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    valueDisplay: {
        marginBottom: 20,
        alignItems: 'center',
    },
    mainValue: {
        fontSize: 26,
        fontWeight: '900',
        marginBottom: 6,
    },
    statusPill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    statusText: {
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

export default VerticalGauge;
