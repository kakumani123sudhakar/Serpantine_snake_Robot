import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

const AccelerometerCard = ({ x, y, z }) => {
    const { width } = useWindowDimensions();
    const isLandscape = width > 500;

    const Axis = ({ label, value, color, fullLabel }) => (
        <View style={[styles.axisItem, isLandscape && { flex: 1 }]}>
            <View style={styles.axisHeader}>
                <Text style={styles.axisLabel}>{isLandscape ? fullLabel : label}</Text>
                <Text style={styles.axisValue}>{value.toFixed(2)}G</Text>
            </View>
            <View style={styles.track}>
                <View
                    style={[
                        styles.fill,
                        {
                            width: `${Math.min(Math.abs(value) * 10, 100)}%`,
                            backgroundColor: color,
                        }
                    ]}
                />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Motion Dynamics</Text>

            <View style={[styles.content, isLandscape && styles.contentLandscape]}>
                <Axis label="X-Axis" fullLabel="Lateral Motion (X)" value={x} color="#818CF8" />
                <Axis label="Y-Axis" fullLabel="Vertical Motion (Y)" value={y} color="#34D399" />
                <Axis label="Z-Axis" fullLabel="Gravity Influence (Z)" value={z} color="#FBBF24" />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1E293B',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    title: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 20,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    content: {
        gap: 16,
    },
    contentLandscape: {
        flexDirection: 'row',
        gap: 24,
    },
    axisItem: {
        gap: 8,
    },
    axisHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    axisLabel: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '500',
    },
    axisValue: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    track: {
        height: 6,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 3,
    },
});

export default AccelerometerCard;
