import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { G, Rect, Circle, Line, Path, Defs, ClipPath, LinearGradient, Stop, RadialGradient } from 'react-native-svg';

const AttitudeIndicator = ({ pitch, roll, size = 220 }) => {
    const center = size / 2;
    const radius = size * 0.42;

    // Pitch shifts horizon
    const pitchOffset = (pitch / 90) * (size * 0.5);

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Defs>
                    <ClipPath id="attitudeClip">
                        <Circle cx={center} cy={center} r={radius} />
                    </ClipPath>

                    <LinearGradient id="skyBlue" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="#41B6E6" />
                        <Stop offset="100%" stopColor="#41B6E6" />
                    </LinearGradient>

                    <LinearGradient id="groundBrown" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="#8B5E3C" />
                        <Stop offset="100%" stopColor="#8B5E3C" />
                    </LinearGradient>

                    <LinearGradient id="bezelMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#475569" />
                        <Stop offset="100%" stopColor="#1E293B" />
                    </LinearGradient>
                </Defs>

                {/* Instrument Square Frame (Matching Image) */}
                <Rect x="0" y="0" width={size} height={size} rx="15" fill="#334155" />
                {/* Screws */}
                <Circle cx="15" cy="15" r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy="15" r="4" fill="#1E293B" />
                <Circle cx="15" cy={size - 15} r="4" fill="#1E293B" />
                <Circle cx={size - 15} cy={size - 15} r="4" fill="#1E293B" />

                {/* Inner Face */}
                <Circle cx={center} cy={center} r={radius + 8} fill="url(#bezelMetal)" />
                <G clipPath="url(#attitudeClip)">
                    <G transform={`rotate(${-roll}, ${center}, ${center}) translate(0, ${pitchOffset})`}>
                        <Rect x={center - size} y={center - size * 1.5} width={size * 2} height={size * 1.5} fill="url(#skyBlue)" />
                        <Rect x={center - size} y={center} width={size * 2} height={size * 1.5} fill="url(#groundBrown)" />
                        <Line x1={center - size} y1={center} x2={center + size} y2={center} stroke="white" strokeWidth="2.5" />

                        {/* Pitch Ticks */}
                        {[-20, -10, 10, 20].map(deg => {
                            const y = (deg / 90) * (size * 0.5);
                            return (
                                <Line
                                    key={deg}
                                    x1={center - 30} y1={center - y} x2={center + 30} y2={center - y}
                                    stroke="white" strokeWidth="2" strokeOpacity="0.8"
                                />
                            );
                        })}
                    </G>
                </G>

                {/* Static Reference (The Yellow W silhouette from image) */}
                <G transform={`translate(${center}, ${center})`}>
                    {/* Center Point */}
                    <Circle cx="0" cy="0" r="3" fill="#FBBF24" />
                    {/* Left Wing */}
                    <Path d="M -60 0 L -30 0 L -25 5 L -15 5 L -10 0" fill="none" stroke="#FBBF24" strokeWidth="4" />
                    {/* Right Wing */}
                    <Path d="M 60 0 L 30 0 L 25 5 L 15 5 L 10 0" fill="none" stroke="#FBBF24" strokeWidth="4" />
                </G>

                {/* Top Reference Triangle */}
                <Path d={`M ${center} ${center - radius + 5} L ${center - 8} ${center - radius + 18} L ${center + 8} ${center - radius + 18} Z`} fill="#FBBF24" />
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

export default AttitudeIndicator;
