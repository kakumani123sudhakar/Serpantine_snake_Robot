import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

const Compass = ({ heading, size = 220 }) => {
    const center = size / 2;
    const radius = size * 0.42;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Defs>
                    <LinearGradient id="compBezel" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#475569" />
                        <Stop offset="100%" stopColor="#0F172A" />
                    </LinearGradient>
                </Defs>

                {/* Instrument Square Frame */}
                <Rect x="0" y="0" width={size} height={size} rx="15" fill="#334155" />
                <Circle cx="15" cy="15" r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy="15" r="4" fill="#1E293B" />
                <Circle cx="15" cy={size - 15} r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy={size - 15} r="4" fill="#1E293B" />

                {/* Main Face */}
                <Circle cx={center} cy={center} r={radius + 8} fill="url(#compBezel)" />
                <Circle cx={center} cy={center} r={radius} fill="#020617" />

                {/* Rotating Dial */}
                <G transform={`rotate(${-heading}, ${center}, ${center})`}>
                    {/* Degree Marks (Every 5 degrees) */}
                    {Array.from({ length: 72 }).map((_, i) => {
                        const angle = i * 5;
                        const rad = (angle * Math.PI) / 180;
                        const isMajor = angle % 30 === 0;
                        const tickLen = isMajor ? 15 : 8;

                        const x1 = center + (radius - tickLen) * Math.sin(rad);
                        const y1 = center - (radius - tickLen) * Math.cos(rad);
                        const x2 = center + (radius - 2) * Math.sin(rad);
                        const y2 = center - (radius - 2) * Math.cos(rad);

                        return (
                            <G key={angle}>
                                <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={isMajor ? 2.5 : 1} />
                                {isMajor && (
                                    <SvgText
                                        x={center + (radius - 30) * Math.sin(rad)}
                                        y={center - (radius - 30) * Math.cos(rad) + 5}
                                        fill="white"
                                        fontSize="14"
                                        fontWeight="900"
                                        textAnchor="middle"
                                        transform={`rotate(${angle}, ${center + (radius - 30) * Math.sin(rad)}, ${center - (radius - 30) * Math.cos(rad)})`}
                                    >
                                        {angle === 0 ? 'N' : angle === 90 ? 'E' : angle === 180 ? 'S' : angle === 270 ? 'W' : angle / 10}
                                    </SvgText>
                                )}
                            </G>
                        );
                    })}
                </G>

                {/* Static Airplane Reference (Yellow Outline from image) */}
                <G transform={`translate(${center}, ${center}) scale(0.8)`}>
                    <Path
                        d="M 0 -60 L 5 -50 L 5 -10 L 40 10 L 40 20 L 5 15 L 5 45 L 20 55 L 20 60 L 0 58 L -20 60 L -20 55 L -5 45 L -5 15 L -40 20 L -40 10 L -5 -10 L -5 -50 Z"
                        fill="none"
                        stroke="#FBBF24"
                        strokeWidth="3.5"
                    />
                </G>

                {/* Top Reference Index */}
                <Path d={`M ${center} ${center - radius} L ${center - 8} ${center - radius + 15} L ${center + 8} ${center - radius + 15} Z`} fill="white" />
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

export default Compass;
