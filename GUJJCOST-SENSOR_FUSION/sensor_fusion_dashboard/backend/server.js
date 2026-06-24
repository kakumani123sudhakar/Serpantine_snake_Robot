const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5000;
const LOG_FILE = path.join(__dirname, 'telemetry.log');

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store for the latest session
let latestTelemetry = null;
let telemetryHistory = [];
const MAX_HISTORY = 1000;

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        system: 'IIT Bombay Snake Robot Control',
        status: 'Operational',
        uptime: process.uptime(),
        active_connections: wss.clients.size
    });
});

app.get('/api/telemetry/latest', (req, res) => {
    res.json(latestTelemetry || { error: 'No data received yet' });
});

app.get('/api/telemetry/history', (req, res) => {
    res.json(telemetryHistory);
});

// ESP32 POSTs data here
app.post('/api/telemetry', (req, res) => {
    const data = req.body;
    if (data) {
        latestTelemetry = { ...data, timestamp: new Date().toISOString() };

        // Add to history
        telemetryHistory.push(latestTelemetry);
        if (telemetryHistory.length > MAX_HISTORY) telemetryHistory.shift();

        // Log to file
        fs.appendFileSync(LOG_FILE, JSON.stringify(latestTelemetry) + '\n');

        // Broadcast to all dashboard clients
        broadcast(JSON.stringify(latestTelemetry));

        res.status(200).send({ status: 'Data Received' });
    } else {
        res.status(400).send({ status: 'No data' });
    }
});

app.post('/api/command', (req, res) => {
    const { command, params } = req.body;
    console.log(`[COMMAND] Executing: ${command}`, params);

    // Relay command to ESP32 via WebSockets
    const payload = JSON.stringify({ type: 'CMD', command, params, timestamp: new Date() });
    broadcast(payload);

    res.json({ status: 'Command Relayed', command });
});

// WebSocket Logic
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] New connection from ${ip}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // If data is from the Robot (contains sensor fields)
            if (data.temp || data.yaw || data.ax) {
                latestTelemetry = { ...data, timestamp: new Date().toISOString() };

                // Add to history
                telemetryHistory.push(latestTelemetry);
                if (telemetryHistory.length > MAX_HISTORY) telemetryHistory.shift();

                // Log to file
                fs.appendFileSync(LOG_FILE, JSON.stringify(latestTelemetry) + '\n');
            }

            // Broadcast to all other clients (e.g., Dashboard)
            broadcast(message, ws);

        } catch (e) {
            console.error('[WS] Error parsing message:', e.message);
        }
    });

    ws.on('close', () => console.log(`[WS] Client disconnected (${ip})`));
});

function broadcast(data, skipWs = null) {
    wss.clients.forEach((client) => {
        if (client !== skipWs && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

server.listen(PORT, () => {
    console.log(`
    =========================================
    SNAKE ROBOT MISSION BACKEND INITIALIZED
    =========================================
    REST API: http://localhost:${PORT}/api
    WS RELAY: ws://localhost:${PORT}
    LOGGING TO: ${LOG_FILE}
    =========================================
    `);
});
