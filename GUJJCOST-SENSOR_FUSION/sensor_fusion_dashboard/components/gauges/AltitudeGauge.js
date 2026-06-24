import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText, Path, Rect, Defs, LinearGradient, Stop, RadialGradient } from 'react-native-svg';

const AltitudeGauge = ({ value = 0, size = 220 }) => {
    const center = size / 2;
    const radius = size * 0.42;
    const padding = 20;

    // Normalizing value for a 0-100 scale (like a clock 0-10)
    const angle = (value / 100) * 360;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Defs>
                    <LinearGradient id="altBezel" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#475569" />
                        <Stop offset="45%" stopColor="#1E293B" />
                        <Stop offset="55%" stopColor="#1E293B" />
                        <Stop offset="100%" stopColor="#0F172A" />
                    </LinearGradient>

                    <RadialGradient id="altFace" cx="50%" cy="50%" rx="50%" ry="50%">
                        <Stop offset="0%" stopColor="#1E293B" />
                        <Stop offset="100%" stopColor="#020617" />
                    </RadialGradient>
                </Defs>

                {/* Outer Frame with Screws (Aesthetic from image) */}
                <Rect x="0" y="0" width={size} height={size} rx="15" fill="#334155" />
                <Circle cx="15" cy="15" r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy="15" r="4" fill="#1E293B" />
                <Circle cx="15" cy={size - 15} r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy={size - 15} r="4" fill="#1E293B" />

                {/* Main Gauge Face */}
                <Circle cx={center} cy={center} r={radius + 8} fill="url(#altBezel)" />
                <Circle cx={center} cy={center} r={radius} fill="url(#altFace)" />

                {/* Tick Marks (0-9) */}
                {Array.from({ length: 50 }).map((_, i) => {
                    const tickAngle = i * (360 / 50);
                    const isMajor = i % 5 === 0;
                    const rad = (tickAngle * Math.PI) / 180;

                    const x1 = center + (radius - (isMajor ? 18 : 10)) * Math.sin(rad);
                    const y1 = center - (radius - (isMajor ? 18 : 10)) * Math.cos(rad);
                    const x2 = center + (radius - 2) * Math.sin(rad);
                    const y2 = center - (radius - 2) * Math.cos(rad);

                    return (
                        <G key={i}>
                            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={isMajor ? 2.5 : 1} />
                            {isMajor && (
                                <SvgText
                                    x={center + (radius - 35) * Math.sin(rad)}
                                    y={center - (radius - 35) * Math.cos(rad) + 6}
                                    fill="white"
                                    fontSize="18"
                                    fontWeight="900"
                                    textAnchor="middle"
                                >
                                    {i / 5}
                                </SvgText>
                            )}
                        </G>
                    );
                })}

                {/* Center Labels */}
                <SvgText x={center} y={center - 35} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle" opacity="0.6">ALT</SvgText>

                {/* Numeric Readout Window (Matching Image) */}
                <Rect x={center - 35} y={center + 15} width={70} height={25} rx="2" fill="#000" />
                <SvgText x={center} y={center + 33} fill="#FFF" fontSize="16" fontWeight="900" textAnchor="middle" letterSpacing="2">
                    {Math.round(value).toString().padStart(4, '0')}
                </SvgText>

                {/* Needle (The longer 100ft style one) */}
                <G transform={`rotate(${angle}, ${center}, ${center})`}>
                    <Path
                        d={`M ${center - 4} ${center} L ${center} ${center - radius + 15} L ${center + 4} ${center} Z`}
                        fill="white"
                    />
                    <Circle cx={center} cy={center} r="6" fill="white" />
                </G>

                {/* Decorative Hub */}
                <Circle cx={center} cy={center} r="3" fill="#334155" />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default AltitudeGauge;
