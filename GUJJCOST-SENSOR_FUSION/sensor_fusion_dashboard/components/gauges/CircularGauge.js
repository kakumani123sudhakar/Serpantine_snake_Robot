import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText, Path, Defs, LinearGradient, Stop, RadialGradient } from 'react-native-svg';
import { Thermometer, Gauge, Mic } from 'lucide-react-native';

const CircularGauge = ({ value, min = 0, max = 100, label, unit, size = 120, color = "#10B981" }) => {
    const center = size / 2;
    const radius = size * 0.42;

    const angleRange = 240;
    const startAngle = -120;
    const normalizedValue = Math.min(Math.max(value, min), max);
    const needleAngle = startAngle + ((normalizedValue - min) / (max - min)) * angleRange;

    // Helper to calculate arc path
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    const describeArc = (x, y, radius, startAngle, endAngle) => {
        const start = polarToCartesian(x, y, radius, endAngle);
        const end = polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        const d = [
            "M", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
        return d;
    };

    const renderIcon = () => {
        const iconProps = { size: 18, color: color, strokeWidth: 2.5 };
        if (label.toLowerCase().includes('temp')) return <Thermometer {...iconProps} />;
        if (label.toLowerCase().includes('gas')) return <Gauge {...iconProps} />;
        if (label.toLowerCase().includes('mic')) return <Mic {...iconProps} />;
        return null;
    };

    return (
        <View style={styles.outerContainer}>
            <View style={[styles.container, { width: size, height: size }]}>
                <Svg width={size} height={size}>
                    <Defs>
                        <RadialGradient id="innerFace" cx="50%" cy="50%" rx="50%" ry="50%">
                            <Stop offset="0%" stopColor="#1E293B" />
                            <Stop offset="100%" stopColor="#0F172A" />
                        </RadialGradient>
                        <LinearGradient id="needleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor="#FFF" />
                            <Stop offset="100%" stopColor="#94A3B8" />
                        </LinearGradient>
                        <LinearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <Stop offset="0%" stopColor={color} stopOpacity="0.6" />
                            <Stop offset="100%" stopColor={color} stopOpacity="0.2" />
                        </LinearGradient>
                    </Defs>

                    {/* Outer Bezel */}
                    <Circle cx={center} cy={center} r={radius + 8} stroke="#334155" strokeWidth="2" fill="#0F172A" />

                    {/* Glowing Outer Ring */}
                    <Circle cx={center} cy={center} r={radius + 4} stroke={color} strokeWidth="1.5" fill="none" strokeOpacity="0.3" />

                    {/* Inner Face */}
                    <Circle cx={center} cy={center} r={radius} fill="url(#innerFace)" />

                    {/* Colored Path (The Sector) */}
                    <Path
                        d={describeArc(center, center, radius - 8, startAngle, needleAngle)}
                        fill="none"
                        stroke={color}
                        strokeWidth="16"
                        strokeOpacity="0.2"
                    />

                    {/* Ticks and Numbers */}
                    {Array.from({ length: 9 }).map((_, i) => {
                        const angle = startAngle + (i / 8) * angleRange;
                        const rad = (angle * Math.PI) / 180;
                        const x1 = center + (radius - 12) * Math.sin(rad);
                        const y1 = center - (radius - 12) * Math.cos(rad);
                        const x2 = center + radius * Math.sin(rad);
                        const y2 = center - radius * Math.cos(rad);
                        const tx = center + (radius - 22) * Math.sin(rad);
                        const ty = center - (radius - 22) * Math.cos(rad);

                        return (
                            <G key={i}>
                                <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
                                <SvgText x={tx} y={ty + 3} fill="white" fontSize="8" fontWeight="bold" textAnchor="middle" fillOpacity="0.7">
                                    {Math.round(min + (i / 8) * (max - min))}
                                </SvgText>
                            </G>
                        );
                    })}

                    {/* Needle */}
                    <G transform={`rotate(${needleAngle}, ${center}, ${center})`}>
                        <Path d={`M ${center - 2} ${center} L ${center + 2} ${center} L ${center} ${center - radius + 5} Z`} fill="url(#needleGrad)" />
                        <Circle cx={center} cy={center} r="5" fill="#FFF" />
                        <Circle cx={center} cy={center} r="2" fill="#0F172A" />
                    </G>
                </Svg>

                <View style={styles.centerInfo}>
                    {renderIcon()}
                    <Text style={[styles.valueText, { color }]}>
                        {value}<Text style={styles.unitText}>{unit}</Text>
                    </Text>
                </View>
            </View>
            <Text style={styles.bottomLabel}>{label.toUpperCase()}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    outerContainer: {
        alignItems: 'center',
        marginBottom: 10,
    },
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    centerInfo: {
        position: 'absolute',
        bottom: 12,
        alignItems: 'center',
    },
    valueText: {
        fontSize: 14,
        fontWeight: '900',
        marginTop: 2,
    },
    unitText: {
        fontSize: 10,
        fontWeight: '700',
    },
    bottomLabel: {
        color: '#94A3B8',
        fontSize: 10,
        fontWeight: '800',
        marginTop: 10,
        letterSpacing: 1,
    }
});

export default CircularGauge;
