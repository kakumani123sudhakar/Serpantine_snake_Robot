/**
 * Simple 1D Kalman Filter for Sensor Fusion
 * Used for noise reduction and state estimation in robotic telemetry.
 */
export class KalmanFilter {
    constructor(options = {}) {
        this.R = options.R || 1; // Measurement noise covariance
        this.Q = options.Q || 0.1; // Process noise covariance
        this.A = 1; // State transition matrix
        this.C = 1; // Measurement matrix

        this.x = options.initialValue || 0; // State estimate
        this.P = 1; // Estimation error covariance
        this.K = 0; // Kalman gain
    }

    /**
     * Filter a new measurement
     * @param {number} measurement The raw sensor value
     * @returns {Object} { value: filteredValue, confidence: probabilityScore }
     */
    filter(measurement) {
        // Prediction
        this.x = this.A * this.x;
        this.P = this.A * this.P * this.A + this.Q;

        // Update
        this.K = (this.P * this.C) / (this.C * this.P * this.C + this.R);
        this.x = this.x + this.K * (measurement - this.C * this.x);
        this.P = (1 - this.K * this.C) * this.P;

        // Probability Analysis: Higher P means lower confidence. 
        // We map normalized P to a 0-100% score.
        const confidence = Math.max(0, Math.min(100, (1 - this.P) * 100));

        return {
            value: this.x,
            confidence: confidence
        };
    }
}

/**
 * Factory to create filters for all dashboard sensors
 */
export const createSensorFilters = () => ({
    temp: new KalmanFilter({ R: 0.1, Q: 0.01 }),
    humidity: new KalmanFilter({ R: 0.5, Q: 0.1 }),
    gas: new KalmanFilter({ R: 5, Q: 1 }),
    light: new KalmanFilter({ R: 10, Q: 5 }),
    mic: new KalmanFilter({ R: 20, Q: 10 }),
    distance: new KalmanFilter({ R: 2, Q: 0.5 }),
    roll: new KalmanFilter({ R: 0.5, Q: 0.05 }),
    pitch: new KalmanFilter({ R: 0.5, Q: 0.05 }),
    yaw: new KalmanFilter({ R: 0.5, Q: 0.05 }),
    ax: new KalmanFilter({ R: 0.2, Q: 0.02 }),
    ay: new KalmanFilter({ R: 0.2, Q: 0.02 }),
    az: new KalmanFilter({ R: 0.2, Q: 0.02 }),
    gx: new KalmanFilter({ R: 0.5, Q: 0.05 }),
    gy: new KalmanFilter({ R: 0.5, Q: 0.05 }),
    gz: new KalmanFilter({ R: 0.5, Q: 0.05 })
});
