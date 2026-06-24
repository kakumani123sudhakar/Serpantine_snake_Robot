import AsyncStorage from '@react-native-async-storage/async-storage';

const MAP_STORAGE_KEY = '@fused_lidar_map_data';

/**
 * Persists the current SLAM map to local storage
 * @param {Array} points Array of {x, y, timestamp}
 * @param {Object} pose {x, y, theta}
 */
export const saveMapToStorage = async (points, pose) => {
    try {
        const data = {
            points: points.slice(-5000), // Save top 5000 points
            pose,
            savedAt: Date.now()
        };
        await AsyncStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save map:', e);
    }
};

/**
 * Retrieves the last saved mission map
 * @returns {Object|null}
 */
export const loadMapFromStorage = async () => {
    try {
        const jsonValue = await AsyncStorage.getItem(MAP_STORAGE_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
        console.error('Failed to load map:', e);
        return null;
    }
};

/**
 * Clears the persisted map
 */
export const clearMapStorage = async () => {
    try {
        await AsyncStorage.removeItem(MAP_STORAGE_KEY);
    } catch (e) {
        console.error('Failed to clear map storage:', e);
    }
};
