import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://192.168.1.100:5000'; // Change to server IP

export const useMissionAPI = () => {
    const [status, setStatus] = useState('offline');
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/status`);
            const data = await res.json();
            setStatus(data.status);
        } catch (e) {
            setStatus('offline');
        }
    };

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/telemetry/history`);
            const data = await res.json();
            setHistory(data);
        } catch (e) {
            console.error('Failed to fetch history');
        } finally {
            setIsLoading(false);
        }
    };

    const sendCommand = async (command, params = {}) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, params }),
            });
            return await res.json();
        } catch (e) {
            return { error: 'Failed to relay command' };
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    return { status, history, isLoading, fetchHistory, sendCommand };
};
