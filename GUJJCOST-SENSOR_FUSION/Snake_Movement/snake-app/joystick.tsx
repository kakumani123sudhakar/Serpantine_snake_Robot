import React, { useRef, useEffect } from "react";
import { View, Animated, PanResponder } from "react-native";
import * as utils from "./utils";

export interface JoystickUpdateEvent {
    type: "move" | "stop" | "start";
    position: {
        x: number;
        y: number;
    };
    force: number;
    angle: {
        radian: number;
        degree: number;
    };
}

interface Props {
    onStart?: (e: JoystickUpdateEvent) => void;
    onMove?: (e: any) => void;
    onStop?: (e: JoystickUpdateEvent) => void;
    radius?: number;
    color?: string;
}

const AxisPad: React.FC<Props> = (props: Props) => {
    const { onStart, onMove, onStop, color = "#2196F3", radius = 75 } = props;

    const nippleRadius = radius / 2.5;
    
    // pan is now 0,0 based (offset from center)
    const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const scale = useRef(new Animated.Value(1)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                Animated.timing(scale, {
                    toValue: 1.2,
                    duration: 100,
                    useNativeDriver: true,
                }).start();

                if (onStart) {
                    onStart({
                        force: 0,
                        position: { x: 0, y: 0 },
                        angle: { radian: 0, degree: 0 },
                        type: "start",
                    });
                }
            },
            onPanResponderMove: (evt, gestureState) => {
                const { dx, dy } = gestureState;
                
                // Calculate distance from center (0,0)
                let dist = Math.sqrt(dx * dx + dy * dy);
                const angleRad = Math.atan2(dy, dx);
                let angleDeg = (angleRad * 180) / Math.PI;
                
                // Normalize angle to 0-360
                if (angleDeg < 0) angleDeg += 360;

                // Limit distance to radius
                const limitedDist = Math.min(dist, radius);
                const limitedX = limitedDist * Math.cos(angleRad);
                const limitedY = limitedDist * Math.sin(angleRad);

                pan.setValue({ x: limitedX, y: limitedY });

                if (onMove) {
                    onMove({
                        position: { x: limitedX, y: limitedY },
                        angle: {
                            radian: angleRad,
                            degree: angleDeg,
                        },
                        force: limitedDist / radius,
                        type: "move",
                    });
                }
            },
            onPanResponderRelease: () => {
                // Animate back to center
                Animated.parallel([
                    Animated.spring(pan, {
                        toValue: { x: 0, y: 0 },
                        friction: 5,
                        tension: 40,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, {
                        toValue: 1,
                        duration: 150,
                        useNativeDriver: true,
                    })
                ]).start();

                if (onStop) {
                    onStop({
                        force: 0,
                        position: { x: 0, y: 0 },
                        angle: { radian: 0, degree: 0 },
                        type: "stop",
                    });
                }
            },
        })
    ).current;

    return (
        <View
            style={{
                width: 2 * radius,
                height: 2 * radius,
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            {/* Outer Ring */}
            <View
                style={{
                    width: 2 * radius,
                    height: 2 * radius,
                    borderRadius: radius,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 2,
                    borderColor: `${color}44`,
                    justifyContent: 'center',
                    alignItems: 'center',
                    position: 'absolute'
                }}
            />
            
            {/* Inner Dimple */}
            <View
                style={{
                    width: radius / 2,
                    height: radius / 2,
                    borderRadius: radius / 4,
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    position: 'absolute'
                }}
            />

            {/* The Knob */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    {
                        height: 2 * nippleRadius,
                        width: 2 * nippleRadius,
                        borderRadius: nippleRadius,
                        backgroundColor: color,
                        elevation: 5,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 3,
                    },
                    {
                        transform: [
                            { translateX: pan.x },
                            { translateY: pan.y },
                            { scale: scale }
                        ],
                    },
                ]}
            />
        </View>
    );
};

export default AxisPad;


