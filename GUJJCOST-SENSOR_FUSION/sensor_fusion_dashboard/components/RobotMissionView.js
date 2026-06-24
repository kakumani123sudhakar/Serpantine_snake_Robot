import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Easing } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import AxisPad from './Joystick';
import { RefreshCcw, Power, Play, Square, Activity, ArrowUp, ArrowDown, Zap, Bot, User } from 'lucide-react-native';

const headImg = require('../assets/head.jpeg');

export default function RobotMissionView({ espIp }) {
    // Ported Snake Movement States
    const [run, setRun] = useState(false);
    const [motionType, setMotionType] = useState('NONE'); 
    const [direction, setDirection] = useState('FORWARD'); 
    const [isAuto, setIsAuto] = useState(false);
    
    const [WLsliderValue, setWLSliderValue] = useState(1);
    const [AmplsliderValue, setAmplSliderValue] = useState(40);
    const [FreqsliderValue, setFreqSliderValue] = useState(2);
    const [SpeedSliderValue, setSpeedSliderValue] = useState(1);
    
    const [angle, setAngle] = useState(90);
    const [moveJoy, setMoveJoy] = useState(false);
    const lastRequestTime = useRef(0);

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (run) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
            Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        }
    }, [run]);

    function findNearestMultipleOf10(input) {
        const remainder = input % 10;
        return remainder <= 5 ? input - remainder : input + (10 - remainder);
    }

    function sendRequests(key, val, root) {
        const now = Date.now();
        if (now - lastRequestTime.current < 100 && root === "params") return;
        lastRequestTime.current = now;

        const url = `http://${espIp}/${root}`;
        const payload = `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
        
        console.log(`[>> TX] POST ${url} | Payload: ${payload}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload,
            signal: controller.signal
        })
        .then(res => {
            console.log(`[<< RX] SUCCESS | ${root} Code: ${res.status}`);
            return res;
        })
        .catch((error) => console.log(`[!! ER] FAILED (${root}):`, error.message))
        .finally(() => clearTimeout(timeoutId));
    }

    useEffect(() => {
        if (run && moveJoy) {
            sendRequests("off", angle.toString(), "params");
        }
    }, [angle, moveJoy, run]);

    const handleToggleRun = () => {
        if (run) {
            sendRequests("value", "0", "mode");
            setRun(false);
            setMotionType('NONE');
        } else {
            sendRequests("value", "1", "mode");
            setRun(true);
        }
    }

    const handleToggleAuto = (autoSelected) => {
        setIsAuto(autoSelected);
        sendRequests("auto", autoSelected ? "1" : "0", "mode");
    }

    const setMotion = (typeStr, endpointVal) => {
        setMotionType(typeStr);
        sendRequests("value", endpointVal, "motion");
    }

    const setDir = (dirStr, endpointVal) => {
        setDirection(dirStr);
        sendRequests("value", endpointVal, "direction");
    }

    const handleReset = () => {
        sendRequests("value", "0", "reset");
        setRun(false);
        setMotionType('NONE');
        setDirection('FORWARD');
        setAmplSliderValue(40);
        setFreqSliderValue(2);
        setWLSliderValue(1);
        setSpeedSliderValue(1);
        setAngle(90);
        setMoveJoy(false);
    }

    const isUndulated = motionType === 'UNDULATED';
    const isInchworm = motionType === 'INCHWORM';
    const isConcertina = motionType === 'CONCERTINA';

    return (
        <View style={styles.container}>
            
            {/* HERO SNAKE HEADER */}
            <View style={styles.heroSection}>
                <Animated.View style={[styles.imageContainer, { transform: [{ scale: pulseAnim }], borderColor: run ? '#10B981' : '#1e293b' }]}>
                    <Image source={headImg} style={styles.heroImage} resizeMode="contain" />
                    <View style={[styles.statusRing, { backgroundColor: run ? '#10B981' : '#EF4444' }]} />
                </Animated.View>
                <View style={styles.heroTextContainer}>
                    <Text style={styles.heroTitle}>ST3020 SERPENTINE NODE</Text>
                    <Text style={styles.heroSub}>
                        {run ? 'SYSTEM ENGAGED & LIVE' : 'AWAITING FIRMWARE STIMULUS'} 
                        {isAuto ? ' • (AUTONOMOUS)' : ' • (MANUAL OVERRIDE)'}
                    </Text>
                    
                    <View style={styles.heroControlsRow}>
                        <TouchableOpacity 
                            style={[styles.mainPowerBtn, { backgroundColor: run ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', borderColor: run ? '#EF4444' : '#10B981' }]} 
                            onPress={handleToggleRun}
                        >
                            {run ? <Square color="#EF4444" fill="#EF4444" size={20} /> : <Zap color="#10B981" fill="#10B981" size={20} />}
                            <Text style={[styles.mainPowerText, { color: run ? '#EF4444' : '#10B981' }]}>{run ? 'HALT KINEMATICS' : 'ENGAGE DRIVE'}</Text>
                        </TouchableOpacity>

                        <View style={styles.segmentedControl}>
                            <TouchableOpacity 
                                activeOpacity={0.7}
                                style={[styles.segBtn, !isAuto && styles.segBtnManual]} 
                                onPress={() => handleToggleAuto(false)}
                            >
                                <User color={!isAuto ? "#60A5FA" : "#475569"} size={13} style={{ marginRight: 6 }} />
                                <Text style={[styles.segBtnText, !isAuto && styles.segTextManual]}>MANUAL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                activeOpacity={0.7}
                                style={[styles.segBtn, isAuto && styles.segBtnAuto]} 
                                onPress={() => handleToggleAuto(true)}
                            >
                                <Bot color={isAuto ? "#C084FC" : "#475569"} size={13} style={{ marginRight: 6 }} />
                                <Text style={[styles.segBtnText, isAuto && styles.segTextAuto]}>AUTO</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.dashboardGrid}>
                {/* 1. GAIT & DIRECTION ENGINES */}
                <View style={styles.card}>
                    <LinearGradient colors={['rgba(30, 41, 59, 0.5)', 'transparent']} style={styles.cardGradient} />
                    <Text style={styles.cardHeader}>1. LOCOMOTION ENGINE</Text>

                    <Text style={styles.sectionSub}>GAIT SELECTOR</Text>
                    <View style={styles.btnGroup}>
                        <TouchableOpacity style={[styles.toggleBtn, isConcertina && styles.toggleActive]} onPress={() => setMotion('CONCERTINA', '0')}>
                            <Text style={[styles.toggleBtnText, isConcertina && styles.toggleTextActive]}>Concertina</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleBtn, isUndulated && styles.toggleActive]} onPress={() => setMotion('UNDULATED', '1')}>
                            <Text style={[styles.toggleBtnText, isUndulated && styles.toggleTextActive]}>Undulated</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleBtn, isInchworm && styles.toggleActive]} onPress={() => setMotion('INCHWORM', '2')}>
                            <Text style={[styles.toggleBtnText, isInchworm && styles.toggleTextActive]}>Inchworm</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.sectionSub}>DIRECTION VECTOR</Text>
                    <View style={styles.btnGroup}>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, direction === 'FORWARD' && styles.toggleActive, (isConcertina || isInchworm) && styles.toggleDisabled]} 
                            onPress={() => setDir('FORWARD', '1')} disabled={isConcertina}
                        >
                            <ArrowUp color={direction === 'FORWARD' ? '#3B82F6' : '#94A3B8'} size={16} style={{marginRight: 6}}/>
                            <Text style={[styles.toggleBtnText, direction === 'FORWARD' && styles.toggleTextActive]}>Forward</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, direction === 'BACKWARD' && styles.toggleActive, (isConcertina || isInchworm) && styles.toggleDisabled]} 
                            onPress={() => setDir('BACKWARD', '0')} disabled={isConcertina}
                        >
                            <ArrowDown color={direction === 'BACKWARD' ? '#3B82F6' : '#94A3B8'} size={16} style={{marginRight: 6}}/>
                            <Text style={[styles.toggleBtnText, direction === 'BACKWARD' && styles.toggleTextActive]}>Reverse</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                        <RefreshCcw color="#F59E0B" size={16} />
                        <Text style={styles.resetBtnText}>EMERGENCY RESET</Text>
                    </TouchableOpacity>
                </View>

                {/* 2. DYNAMIC SLIDER PARAMETERS */}
                <View style={styles.card}>
                    <LinearGradient colors={['rgba(30, 41, 59, 0.5)', 'transparent']} style={styles.cardGradient} />
                    <Text style={styles.cardHeader}>2. WAVEFORM PARAMETERS</Text>
                    
                    <View style={styles.sliderBox}>
                        <View style={styles.sliderHeader}>
                            <Text style={styles.sliderLabel}>WAVELENGTH</Text>
                            <Text style={[styles.sliderVal, { color: isUndulated ? '#60A5FA' : '#475569' }]}>{WLsliderValue.toFixed(1)} λ</Text>
                        </View>
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={10} maximumValue={30} step={5}
                            value={WLsliderValue * 10}
                            minimumTrackTintColor={isUndulated ? "#3B82F6" : "#1e293b"}
                            maximumTrackTintColor="#0B0E14"
                            thumbTintColor={isUndulated ? "#60A5FA" : "#1e293b"}
                            disabled={!isUndulated}
                            onValueChange={(val) => setWLSliderValue(val / 10)}
                            onSlidingComplete={(val) => sendRequests("wl", String(val / 10), "params")}
                        />
                    </View>

                    <View style={styles.sliderBox}>
                        <View style={styles.sliderHeader}>
                            <Text style={styles.sliderLabel}>AMPLITUDE</Text>
                            <Text style={[styles.sliderVal, { color: isUndulated ? '#34D399' : '#475569' }]}>{AmplsliderValue}°</Text>
                        </View>
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={20} maximumValue={70} step={1}
                            value={AmplsliderValue}
                            minimumTrackTintColor={isUndulated ? "#10B981" : "#1e293b"}
                            maximumTrackTintColor="#0B0E14"
                            thumbTintColor={isUndulated ? "#34D399" : "#1e293b"}
                            disabled={!isUndulated}
                            onValueChange={(val) => setAmplSliderValue(val)}
                            onSlidingComplete={(val) => sendRequests("amp", String(val), "params")}
                        />
                    </View>

                    <View style={styles.sliderBox}>
                        <View style={styles.sliderHeader}>
                            <Text style={styles.sliderLabel}>FREQUENCY / SPEED</Text>
                            <Text style={[styles.sliderVal, { color: isUndulated ? '#A78BFA' : '#475569' }]}>{FreqsliderValue.toFixed(1)} Hz</Text>
                        </View>
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={5} maximumValue={100} step={1}
                            value={FreqsliderValue * 10}
                            minimumTrackTintColor={isUndulated ? "#8B5CF6" : "#1e293b"}
                            maximumTrackTintColor="#0B0E14"
                            thumbTintColor={isUndulated ? "#A78BFA" : "#1e293b"}
                            disabled={!isUndulated}
                            onValueChange={(val) => setFreqSliderValue(val / 10)}
                            onSlidingComplete={(val) => sendRequests("freq", String(val / 10), "params")}
                        />
                    </View>

                    <View style={styles.sliderBox}>
                        <View style={styles.sliderHeader}>
                            <Text style={styles.sliderLabel}>INCHWORM THROTTLE</Text>
                            <Text style={[styles.sliderVal, { color: isInchworm ? '#FBBF24' : '#475569' }]}>{SpeedSliderValue.toFixed(1)}x</Text>
                        </View>
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={2} maximumValue={40} step={1}
                            value={SpeedSliderValue * 10}
                            minimumTrackTintColor={isInchworm ? "#F59E0B" : "#1e293b"}
                            maximumTrackTintColor="#0B0E14"
                            thumbTintColor={isInchworm ? "#FBBF24" : "#1e293b"}
                            disabled={!isInchworm}
                            onValueChange={(val) => setSpeedSliderValue(val / 10)}
                            onSlidingComplete={(val) => sendRequests("speed", String(val / 10), "params")}
                        />
                    </View>
                </View>

                {/* 3. VECTOR STEERING (JOYSTICK) */}
                <View style={[styles.card, { alignItems: 'center'}]}>
                    <LinearGradient colors={['rgba(30, 41, 59, 0.5)', 'transparent']} style={styles.cardGradient} />
                    <Text style={styles.cardHeader}>3. LIVE VECTOR STEERING</Text>
                    <Text style={[styles.diagnosticText, isUndulated && styles.diagnosticTextActive]}>
                        Steer the primary Head Vector in real-time. {"\n"}(Requires Undulated Mode)
                    </Text>
                    
                    <View style={[styles.joystickContainer, (!isUndulated) && styles.disabledContainer]}>
                        <View style={styles.joystickRing}>
                            <AxisPad 
                                color={isUndulated ? "#3B82F6" : "#475569"} 
                                radius={90} 
                                onMove={(data) => {
                                    const newAngle = findNearestMultipleOf10(data.angle.degree);
                                    setAngle(newAngle);
                                }}
                                onStop={() => setMoveJoy(false)}
                                onStart={() => setMoveJoy(true)} 
                            />
                        </View>
                    </View>
                    
                    <View style={[styles.hudBadge, isUndulated && { borderColor: 'rgba(59, 130, 246, 0.5)', shadowColor: '#3B82F6', shadowOpacity: 0.8, shadowRadius: 15, elevation: 20 }]}>
                         <Activity color={isUndulated ? "#3B82F6" : "#475569"} size={16} style={{ marginRight: 8 }} />
                         <Text style={[styles.hudLabel, isUndulated && { color: '#93C5FD' }]}>YAW STEERING OFFSET: </Text>
                         <Text style={[styles.hudValue, { color: isUndulated ? '#60A5FA' : '#475569' }]}>{angle}°</Text>
                    </View>
                </View>

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingBottom: 40 },
    
    heroSection: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161D26', borderRadius: 20, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#1e293b', gap: 24 },
    imageContainer: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0E14' },
    heroImage: { width: 74, height: 74, borderRadius: 37 },
    statusRing: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#161D26' },
    heroTextContainer: { flex: 1, flexShrink: 1 },
    heroTitle: { color: 'white', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 4, flexWrap: 'wrap' },
    heroSub: { color: '#94A3B8', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 16, flexWrap: 'wrap' },
    heroControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
    mainPowerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
    mainPowerText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },

    segmentedControl: { flexDirection: 'row', backgroundColor: '#0B0E14', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#1e293b' },
    segBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
    
    segBtnManual: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.4)' },
    segTextManual: { color: '#60A5FA', textShadowColor: 'rgba(59, 130, 246, 0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    
    segBtnAuto: { backgroundColor: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.4)' },
    segTextAuto: { color: '#C084FC', textShadowColor: 'rgba(168, 85, 247, 0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },

    segBtnText: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    dashboardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between' },
    card: { 
        backgroundColor: '#161D26', 
        borderRadius: 20, 
        borderWidth: 1, 
        borderColor: '#1e293b', 
        padding: 24, 
        flex: 1, 
        minWidth: 300,
        marginBottom: 24,
        overflow: 'hidden'
    },
    cardGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
    cardHeader: { color: 'white', fontSize: 13, fontWeight: '900', letterSpacing: 2, marginBottom: 24, textTransform: 'uppercase' },
    
    sectionSub: { color: '#94A3B8', fontSize: 11, fontWeight: '900', marginBottom: 10, marginTop: 5, letterSpacing: 1.5, textTransform: 'uppercase' },
    btnGroup: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#0B0E14', borderRadius: 10, padding: 4, marginBottom: 18, borderWidth: 1, borderColor: '#1e293b' },
    toggleBtn: { flex: 1, minWidth: 80, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexDirection: 'row' },
    toggleActive: { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: 'rgba(59, 130, 246, 0.5)', borderWidth: 1 },
    toggleDisabled: { opacity: 0.3 },
    toggleBtnText: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
    toggleTextActive: { color: '#60A5FA', textShadowColor: 'rgba(59, 130, 246, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },

    resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5, backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
    resetBtnText: { color: '#F59E0B', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },

    sliderBox: { marginBottom: 20, backgroundColor: '#0B0E14', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
    sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    sliderLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
    sliderVal: { fontSize: 14, fontWeight: '900' },

    diagnosticText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginBottom: 20, fontStyle: 'italic', letterSpacing: 0.5 },
    diagnosticTextActive: { color: '#94A3B8' },
    joystickContainer: { height: 240, justifyContent: 'center', alignItems: 'center' },
    joystickRing: { padding: 16, borderRadius: 120, backgroundColor: '#0B0E14', borderWidth: 1, borderColor: '#1e293b', elevation: 10 },
    disabledContainer: { opacity: 0.3 },
    
    hudBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B0E14', borderWidth: 1, borderColor: '#1e293b', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 14, marginTop: 0 },
    hudLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    hudValue: { fontSize: 16, fontWeight: '900' }
});
