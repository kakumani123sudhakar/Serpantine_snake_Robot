import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  useWindowDimensions,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Alert,
  Animated,
  Platform,
  StatusBar as RNStatusBar
} from 'react-native';
import {
  Bell,
  Search,
  LayoutDashboard,
  AlertCircle,
  BarChart3,
  Radio,
  Settings,
  Pencil,
  Navigation,
  LogOut,
  ChevronLeft,
  ShieldCheck,
  Activity,
  Cpu,
  Wifi,
  Battery,
  Terminal,
  Zap,
  Layers,
  Video as VideoIcon,
  X,
  Gamepad2
} from 'lucide-react-native';
import { useSensorData } from './hooks/useSensorData';
import { createSensorFilters } from './utils/filters';

import VerticalGauge from './components/gauges/VerticalGauge';
import SemiCircularGauge from './components/gauges/SemiCircularGauge';
import FlameSensor from './components/gauges/FlameSensor';
import MotionSensor from './components/gauges/MotionSensor';
import LidarVisualizer from './components/gauges/LidarVisualizer';
import CameraFeed from './components/gauges/CameraFeed';
import MicSensor from './components/gauges/MicSensor';
import LidarMap from './components/LidarMap';
import SensorDetailView from './components/SensorDetailView';
import DoFDetailView from './components/DoFDetailView';
import SurveillanceView from './components/SurveillanceView';
import RobotMissionView from './components/RobotMissionView';

export default function App() {
  const { width } = useWindowDimensions();
  const [espIp, setEspIp] = useState('robot.local');
  const [tempIp, setTempIp] = useState('robot.local');
  const [cameraIp, setCameraIp] = useState('camera.local:5050');
  const [seeedIp, setSeeedIp] = useState('robotcontrol.local');
  const [tempSeeedIp, setTempSeeedIp] = useState('robotcontrol.local');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isLogsVisible, setIsLogsVisible] = useState(false);
  const [currentView, setCurrentView] = useState('sensors');
  const [selectedSensor, setSelectedSensor] = useState(null);

  // Settings States
  const [isAutoConnect, setIsAutoConnect] = useState(true);
  const [isAlertOn, setIsAlertOn] = useState(true);
  const [refreshRate, setRefreshRate] = useState('100');

  const { data: realData, status: connectionStatus } = useSensorData(espIp, 81);

  // Initialize Kalman Filters
  const filters = useRef(createSensorFilters());

  const [sensors, setSensors] = useState({
    temp: 0, humidity: 0, gas: 0, light: 0, mic: 0,
    flame: false, motion: false, distance: 0, battery: 100,
    roll: 0, pitch: 0, yaw: 0, speed: 0,
    joints: new Array(13).fill(0),
    lidar_scans: 0, rpm: 0, lastUpdate: null
  });

  const [probAnalysis, setProbAnalysis] = useState({
    temp: 0, humidity: 0, gas: 0, light: 0, mic: 0, distance: 0, roll: 0, pitch: 0, yaw: 0
  });

  const [history, setHistory] = useState({
    temp: [], humidity: [], gas: [], light: [], mic: [], distance: [], roll: [], pitch: [], yaw: []
  });

  const [logs, setLogs] = useState([
    { id: 1, time: '22:15:04', msg: 'System initialized', type: 'info' },
    { id: 2, time: '22:15:10', msg: 'Searching for ESP32...', type: 'warn' },
    { id: 3, time: '22:15:30', msg: 'Bridge connection established', type: 'success' },
  ]);

  const isConnected = connectionStatus === 'connected';

  // Process data through Kalman Filter
  const processSensorPacket = (raw) => {
    if (!raw) return { processed: {}, newConfidence: {} };

    const processed = { ...raw };
    const newConfidence = { ...probAnalysis };

    // RECALCULATE ATTITUDE FROM RAW ACCELEROMETER (Frontend Fusion)
    if (processed.ax !== undefined && processed.ay !== undefined && processed.az !== undefined) {
      // Roll: atan2(ay, az)
      const rollRad = Math.atan2(processed.ay, processed.az);
      processed.roll = (rollRad * 180) / Math.PI;

      // Pitch: atan2(-ax, sqrt(ay*ay + az*az))
      const pitchRad = Math.atan2(-processed.ax, Math.sqrt(processed.ay * processed.ay + processed.az * processed.az));
      processed.pitch = (pitchRad * 180) / Math.PI;

      // Normalize to 1 decimal place
      processed.roll = Math.round(processed.roll * 10) / 10.0;
      processed.pitch = Math.round(processed.pitch * 10) / 10.0;
    }

    // Velocity Estimation from Accelerometer
    if (processed.ax !== undefined && processed.ay !== undefined && processed.az !== undefined) {
      const rawMag = Math.sqrt(processed.ax ** 2 + processed.ay ** 2 + processed.az ** 2);
      const linAcc = Math.abs(rawMag - 1.0);
      processed.speed = linAcc * 4;
    }

    return { processed, newConfidence };
  };

  // Process Real-time Telemetry
  useEffect(() => {
    if (connectionStatus === 'connected') {
      addLog('Bridge connection established', 'success');
    } else if (connectionStatus === 'error') {
      addLog('Connection error - check IP', 'alert');
    } else if (connectionStatus === 'disconnected') {
      addLog('Searching for ESP32...', 'warn');
    }
  }, [connectionStatus]);

  useEffect(() => {
    if (realData) {
      try {
        const { processed, newConfidence } = processSensorPacket(realData);

        setSensors(prev => {
          if (!prev) return prev;

          // RELATIVE YAW INTEGRATION (Kinematic Fusion)
          const now = realData._receivedAt || Date.now();
          const dt = prev.lastUpdate ? (now - prev.lastUpdate) / 1000.0 : 0.1;

          let deltaYaw = 0;
          if (processed.gz !== undefined && processed.gz !== 0) {
            // Apply deadzone to filter real gyro drift (0.5 deg/sec)
            const gz = Math.abs(processed.gz) > 0.5 ? processed.gz : 0;
            deltaYaw = gz * dt;
          } else if (processed.roll !== undefined) {
            // HARDWARE FALLBACK: The ADXL345 lacks a physical Gyroscope.
            // Estimate Yaw turn rate using bank angle (Roll) via airplane turning physics.
            if (Math.abs(processed.roll) > 5) { // 5 degree deadzone
               deltaYaw = (processed.roll * 0.5) * dt;
            }
          }

          let newYaw = (prev.yaw || 0) + deltaYaw;
          // Wrap heading to -180 to 180 range
          while (newYaw > 180) newYaw -= 360;
          while (newYaw < -180) newYaw += 360;

          return {
            ...prev,
            ...processed,
            yaw: Math.round(newYaw * 10) / 10.0,
            lidar_scans: realData.lidar_scans !== undefined ? realData.lidar_scans : prev.lidar_scans,
            rpm: realData.rpm !== undefined ? realData.rpm : prev.rpm,
            joints: realData.joints || prev.joints || new Array(13).fill(0),
            lastUpdate: now
          };
        });

        if (newConfidence) {
          setProbAnalysis(prev => ({ ...prev, ...newConfidence }));
        }

        setHistory(prev => {
          if (!prev) return prev;
          return {
            temp: [...(prev.temp || []), processed.temp || 0].slice(-100),
            humidity: [...(prev.humidity || []), processed.humidity || 0].slice(-100),
            gas: [...(prev.gas || []), processed.gas || 0].slice(-100),
            light: [...(prev.light || []), processed.light || 0].slice(-100),
            mic: [...(prev.mic || []), processed.mic || 0].slice(-100),
            distance: [...(prev.distance || []), processed.distance || 0].slice(-100),
            roll: [...(prev.roll || []), processed.roll || 0].slice(-100),
            pitch: [...(prev.pitch || []), processed.pitch || 0].slice(-100),
            yaw: [...(prev.yaw || []), processed.yaw || 0].slice(-100),
          };
        });
      } catch (e) {
        console.log('App: Data process error', e.message);
      }
    }
  }, [realData]);

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ id: Date.now(), time, msg, type }, ...prev].slice(0, 50));
  };

  if (selectedSensor === 'dof') {
    return (
      <DoFDetailView
        roll={sensors.roll || 0}
        pitch={sensors.pitch || 0}
        yaw={sensors.yaw || 0}
        speed={sensors.speed || 0}
        segments={sensors.joints || new Array(13).fill(0)}
        onBack={() => setSelectedSensor(null)}
      />
    );
  }

  if (selectedSensor) {
    return (
      <SensorDetailView
        sensor={selectedSensor}
        value={sensors[selectedSensor] || 0}
        history={history[selectedSensor] || []}
        confidence={probAnalysis[selectedSensor] || 95}
        onBack={() => setSelectedSensor(null)}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? 40 : 10 }]}>
      <RNStatusBar barStyle="light-content" />
      <View style={styles.appLayout}>
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <View style={styles.logoCircle}><Radio color="#3B82F6" size={20} /></View>
            <View><Text style={styles.brandTitle}>Serpentine</Text><Text style={styles.brandSubtitle}>Snake Robot Control</Text></View>
          </View>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={[styles.menuItem, currentView === 'sensors' && styles.menuActive]} onPress={() => setCurrentView('sensors')}>
              <LayoutDashboard color={currentView === 'sensors' ? "#3B82F6" : "#94A3B8"} size={20} /><Text style={[styles.menuText, currentView === 'sensors' && styles.menuTextActive]}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, currentView === 'robot' && styles.menuActive]} onPress={() => setCurrentView('robot')}>
              <Gamepad2 color={currentView === 'robot' ? "#3B82F6" : "#94A3B8"} size={20} /><Text style={[styles.menuText, currentView === 'robot' && styles.menuTextActive]}>Robot Mission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, currentView === 'mission' && styles.menuActive]} onPress={() => setCurrentView('mission')}>
              <Navigation color={currentView === 'mission' ? "#3B82F6" : "#94A3B8"} size={20} /><Text style={[styles.menuText, currentView === 'mission' && styles.menuTextActive]}>Mission Control</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, currentView === 'surveillance' && styles.menuActive]} onPress={() => setCurrentView('surveillance')}>
              <VideoIcon color={currentView === 'surveillance' ? "#3B82F6" : "#94A3B8"} size={20} /><Text style={[styles.menuText, currentView === 'surveillance' && styles.menuTextActive]}>Surveillance</Text>
            </TouchableOpacity>

            <View style={styles.menuSectionDivider} />
            <Text style={styles.menuHeader}>SYSTEM INFRASTRUCTURE</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => setIsLogsVisible(true)}>
              <Terminal color="#94A3B8" size={20} />
              <Text style={styles.menuText}>System Logs</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setIsSettingsVisible(true)}>
              <Settings color="#94A3B8" size={20} />
              <Text style={styles.menuText}>User Settings</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sidebarStatus}>
            <Text style={styles.statusLabel}>HARDWARE STACK</Text>
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Cpu color="#3B82F6" size={14} /><Text style={styles.statusMachine}>HARDWARE: <Text style={{ color: isConnected ? '#10B981' : '#EF4444' }}>{isConnected ? 'LIVE' : 'IDLE'}</Text></Text>
              </View>
              <Text style={styles.statusIp}>SENSOR FUSION: {espIp}</Text>
              <Text style={styles.statusIp}>CAMERA: {cameraIp}</Text>
              <Text style={styles.statusIp}>ROBOT CONTROL: {seeedIp}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => setIsModalVisible(true)}><Pencil color="#3B82F6" size={14} style={{ marginRight: 6 }} /><Text style={styles.editBtnText}>Configure Network</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.mainPanel}>
          <View style={styles.topNav}>
            <View style={styles.navHeaderGroup}>
              {currentView !== 'sensors' && (
                <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentView('sensors')}><ChevronLeft color="#3B82F6" size={24} /></TouchableOpacity>
              )}
              <View>
                <Text style={styles.breadcrumb}>FUSED SENSORS • {currentView.toUpperCase()}</Text>
                <Text style={styles.pageTitle}>
                  {currentView === 'sensors' ? 'Tactical Sensor Grid' :
                    currentView === 'robot' ? 'Kinematic Drive Control' :
                    currentView === 'mission' ? 'Mission Control Center' :
                      'Surveillance Terminal'}
                </Text>
              </View>
            </View>
            <View style={styles.navActions}>
              <View style={styles.statPills}>
                <View style={styles.statPill}><Wifi color={isConnected ? "#10B981" : "#EF4444"} size={14} /><Text style={[styles.pillVal, { color: isConnected ? "#10B981" : "#EF4444" }]}>{isConnected ? "Connected" : "Offline"}</Text></View>
              </View>
              <View style={styles.userCircle}><ShieldCheck color="white" size={20} /></View>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {currentView === 'sensors' && (
              <View style={{ width: '100%' }}>
                <View style={styles.gridRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('temp')}><VerticalGauge label="Ambient Temp" value={sensors.temp} unit="°C" color="#10B981" /></TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('humidity')}><SemiCircularGauge label="Relative Humidity" value={sensors.humidity} unit="%" variant="blue" /></TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('gas')}><SemiCircularGauge label="Toxic Gas" value={sensors.gas} unit="PPM" variant="colored" max={1023} /></TouchableOpacity>
                </View>
                <View style={styles.gridRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('light')}><SemiCircularGauge label="Luminosity" value={sensors.light} unit="LUX" variant="colored" max={1023} /></TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('flame')}><FlameSensor detected={sensors.flame} /></TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('dof')}><MotionSensor moving={sensors.motion} pitch={sensors.pitch} roll={sensors.roll} /></TouchableOpacity>
                </View>
                <View style={styles.gridRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedSensor('mic')}><MicSensor value={sensors.mic} /></TouchableOpacity>
                  <View style={{ flex: 1, backgroundColor: '#161D26', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                    <Activity color="#475569" size={32} />
                    <Text style={{ color: '#475569', fontSize: 10, fontWeight: '900', marginTop: 10 }}>FUSION NODE A</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#161D26', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                    <Cpu color="#475569" size={32} />
                    <Text style={{ color: '#475569', fontSize: 10, fontWeight: '900', marginTop: 10 }}>NODE B ACTIVE</Text>
                  </View>
                </View>
              </View>
            )}
            
            <View style={{ display: currentView === 'robot' ? 'flex' : 'none', width: '100%' }}>
              <RobotMissionView espIp={seeedIp} />
            </View>

            <View style={{ display: currentView === 'mission' ? 'flex' : 'none', width: '100%' }}>
              <LidarMap espIp={espIp} />
            </View>

            {currentView === 'surveillance' && (
              <SurveillanceView
                cameraIp={cameraIp}
                onUpdateIp={setCameraIp}
                sensorData={sensors}
                addLog={addLog}
              />
            )}
          </ScrollView>
        </View>
      </View>

      <Modal animationType="slide" transparent visible={isModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Cpu color="#3B82F6" size={24} />
              <Text style={styles.modalTitle}>Network Config</Text>
            </View>
            <Text style={styles.label}>SENSOR FUSION IP</Text>
            <TextInput style={styles.modalInput} value={tempIp} onChangeText={setTempIp} placeholder="e.g. robot.local or 192.168.4.1" placeholderTextColor="#475569" />

            <Text style={styles.label}>CAMERA IP & PORT</Text>
            <TextInput style={styles.modalInput} value={cameraIp} onChangeText={setCameraIp} placeholder="e.g. camera.local:5050 or 192.168.4.2:5050" placeholderTextColor="#475569" />

            <Text style={styles.label}>ROBOT CONTROL IP</Text>
            <TextInput style={styles.modalInput} value={tempSeeedIp} onChangeText={setTempSeeedIp} placeholder="e.g. robotcontrol.local or 10.204.186.172" placeholderTextColor="#475569" />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1E293B' }]} onPress={() => setIsModalVisible(false)}><Text style={styles.modalBtnText}>CANCEL</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={() => { 
                setEspIp(tempIp); 
                setSeeedIp(tempSeeedIp);
                addLog('Config updated'); 
                setIsModalVisible(false); 
              }}><Text style={styles.modalBtnText}>APPLY CHANGES</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal animationType="slide" transparent visible={isSettingsVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                <Settings color="#3B82F6" size={24} />
                <Text style={styles.modalTitle}>System Settings</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSettingsVisible(false)}>
                <X color="#94A3B8" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Auto-Connect</Text>
                <Text style={styles.settingDesc}>Reconnect automatically on signal loss</Text>
              </View>
              <Switch value={isAutoConnect} onValueChange={setIsAutoConnect} trackColor={{ false: '#1E293B', true: '#3B82F6' }} />
            </View>

            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Safety Alerts</Text>
                <Text style={styles.settingDesc}>Notify on critical sensor thresholds</Text>
              </View>
              <Switch value={isAlertOn} onValueChange={setIsAlertOn} trackColor={{ false: '#1E293B', true: '#3B82F6' }} />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Telemetry Rate (ms)</Text>
                <TextInput style={styles.smallInput} value={refreshRate} onChangeText={setRefreshRate} keyboardType="numeric" />
              </View>
            </View>

            <TouchableOpacity style={[styles.modalBtn, { marginTop: 20 }]} onPress={() => setIsSettingsVisible(false)}>
              <Text style={styles.modalBtnText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Logs Modal */}
      <Modal animationType="slide" transparent visible={isLogsVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                <Terminal color="#3B82F6" size={24} />
                <Text style={styles.modalTitle}>System Logs</Text>
              </View>
              <TouchableOpacity onPress={() => setIsLogsVisible(false)}>
                <X color="#94A3B8" size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.logsList}>
              {logs.map(log => (
                <View key={log.id} style={styles.logLine}>
                  <Text style={styles.logTime}>[{log.time}]</Text>
                  <Text style={[styles.logMsg, { color: log.type === 'success' ? '#10B981' : log.type === 'alert' ? '#EF4444' : log.type === 'warn' ? '#F59E0B' : '#94A3B8' }]}>
                    {log.msg}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.modalBtn, { marginTop: 20 }]} onPress={() => setIsLogsVisible(false)}>
              <Text style={styles.modalBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  appLayout: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 260, backgroundColor: '#161D26', borderRightWidth: 1, borderColor: '#1e293b', padding: 24 },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 48 },
  logoCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(59, 130, 246, 0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.1)' },
  brandTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  brandSubtitle: { color: '#475569', fontSize: 9, fontWeight: '700' },
  menuContainer: { flex: 1, gap: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8 },
  menuActive: { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
  menuText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  menuTextActive: { color: '#3B82F6' },
  menuSectionDivider: { height: 1, backgroundColor: '#1e293b', marginVertical: 12, marginHorizontal: 16 },
  menuHeader: { color: '#475569', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginHorizontal: 16, marginBottom: 8, marginTop: 4 },
  sidebarStatus: { marginTop: 40 },
  statusLabel: { color: '#475569', fontSize: 10, fontWeight: '900', marginBottom: 12, letterSpacing: 1 },
  statusCard: { backgroundColor: '#0B0E14', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#1e293b', gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusMachine: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold' },
  statusIp: { color: '#475569', fontSize: 11, marginBottom: 10 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', height: 36, borderRadius: 8 },
  editBtnText: { color: '#3B82F6', fontSize: 11, fontWeight: 'bold' },
  mainPanel: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  navHeaderGroup: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(59, 130, 246, 0.1)', justifyContent: 'center', alignItems: 'center' },
  breadcrumb: { fontSize: 10, fontWeight: '900', color: '#475569', marginBottom: 4, letterSpacing: 1 },
  pageTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  statPills: { flexDirection: 'row', gap: 10 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#161D26', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#1e293b' },
  pillVal: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  userCircle: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  gridRow: { flexDirection: 'row', gap: 24, marginBottom: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: '#161D26', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#1e293b', width: '100%', maxWidth: 450 },
  modalTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
  label: { color: '#475569', fontSize: 10, fontWeight: '900', marginBottom: 10, letterSpacing: 1 },
  modalInput: { backgroundColor: '#0B0E14', height: 50, borderRadius: 12, paddingHorizontal: 16, color: 'white', fontSize: 14, marginBottom: 20, borderWidth: 1, borderColor: '#1e293b' },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, height: 56, backgroundColor: '#3B82F6', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBtnText: { color: 'white', fontSize: 14, fontWeight: '900' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  settingLabel: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  settingDesc: { color: '#475569', fontSize: 11, marginTop: 2 },
  smallInput: { backgroundColor: '#0B0E14', height: 36, borderRadius: 8, paddingHorizontal: 10, color: '#3B82F6', fontSize: 13, borderSize: 1, borderColor: '#1e293b', width: 80, marginTop: 10 },
  logsList: { maxHeight: 300, backgroundColor: '#0B0E14', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#1e293b' },
  logLine: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  logTime: { color: '#475569', fontSize: 11, fontFamily: 'monospace' },
  logMsg: { fontSize: 11, fontWeight: '600', flex: 1 },
});
