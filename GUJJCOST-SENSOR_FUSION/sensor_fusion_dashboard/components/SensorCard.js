import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import * as LucideIcons from 'lucide-react-native';

const SensorCard = ({ title, value, unit, iconName, accentColor, subtext }) => {
    const { width } = useWindowDimensions();
    const isLandscape = width > 500;

    // Calculate dynamic width based on orientation
    const cardWidth = isLandscape ? (width - 100) / 3 : (width - 64) / 2;

    const Icon = LucideIcons[iconName] || LucideIcons.Activity;

    return (
        <View style={[styles.card, { width: cardWidth }]}>
            <View style={styles.headerRow}>
                <View style={[styles.iconBox, { backgroundColor: `${accentColor}10` }]}>
                    <Icon size={16} color={accentColor} strokeWidth={2.5} />
                </View>
                <Text style={styles.label} numberOfLines={1}>{title}</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.valueRow}>
                    <Text style={styles.value}>{value}</Text>
                    <Text style={styles.unit}>{unit}</Text>
                </View>
                {subtext && (
                    <Text style={[styles.subtext, { color: value === "DETECTION" ? '#EF4444' : '#64748B' }]}>
                        {subtext}
                    </Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        color: '#94A3B8',
        fontSize: 13,
        fontWeight: '500',
        flex: 1,
    },
    content: {
        justifyContent: 'flex-end',
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    value: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    },
    unit: {
        color: '#475569',
        fontSize: 14,
        fontWeight: '600',
    },
    subtext: {
        fontSize: 10,
        marginTop: 4,
        fontWeight: '500',
    },
});

export default SensorCard;
