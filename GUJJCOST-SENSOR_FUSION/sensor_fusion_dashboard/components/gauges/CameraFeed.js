import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Switch, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera as CameraIcon, Play, Video as VideoIcon, Capture, ShieldCheck, Power, RefreshCw, Circle, ExternalLink, Settings, Sun, Maximize, FlipVertical, FlipHorizontal, Lightbulb } from 'lucide-react-native';

const CameraFeed = ({ cameraIp = '192.168.4.2', onUpdateIp }) => {
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [hasError, setHasError] = React.useState(false);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [localIp, setLocalIp] = React.useState(cameraIp);
    const [showSettings, setShowSettings] = React.useState(false);

    // Camera State
    const [camConfig, setCamConfig] = React.useState({
        framesize: 5, // 5 = QVGA, 6 = VGA, 8 = SVGA
        quality: 10,
        vflip: 0,
        hmirror: 0,
        led_intensity: 0
    });

    React.useEffect(() => {
        setLocalIp(cameraIp);
    }, [cameraIp]);

    const ipMatch = localIp.match(/(?:http:\/\/)?([a-zA-Z0-9.-]+)/);
    const pureIp = ipMatch ? ipMatch[1] : '192.168.4.2';
    
    // ESP32-CAM default example ports: Stream is 81, Controls are 80
    const streamUrl = `http://${pureIp}:81/stream`;
    const controlUrl = `http://${pureIp}:80/control`;

    const streamHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
                body, html {
                    margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000;
                    display: flex; align-items: center; justify-content: center;
                }
                img {
                    width: 100%; height: 100%; object-fit: fill; image-rendering: -webkit-optimize-contrast;
                }
            </style>
        </head>
        <body>
            <img src="${streamUrl}" alt="Stream" onerror="window.ReactNativeWebView.postMessage('error')" />
        </body>
        </html>
    `;

    const sendControl = async (variable, val) => {
        try {
            await fetch(`${controlUrl}?var=${variable}&val=${val}`);
            setCamConfig(prev => ({ ...prev, [variable]: val }));
        } catch (e) {
            console.error("Control failed:", e);
        }
    };

    const handleSync = () => {
        setHasError(false);
        setIsLoading(true);
        if (onUpdateIp) onUpdateIp(localIp);
        setReloadKey(prev => prev + 1);
        setIsStreaming(true);
    };

    const testInBrowser = () => {
        Linking.openURL(streamUrl).catch(err => console.error("Couldn't load page", err));
    };

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <VideoIcon color="#3B82F6" size={16} />
                    <Text style={styles.cardTitle}>LIVE CAMERA FEED</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 15 }}>
                    <TouchableOpacity onPress={() => setShowSettings(!showSettings)}>
                        <Settings color={showSettings ? "#10B981" : "#475569"} size={16} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSync}>
                        <RefreshCw color={isLoading ? "#3B82F6" : "#475569"} size={16} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.insetContainer}>
                <View style={styles.feedArea}>
                    <View style={styles.scanLine} />
                    {/* Corners... */}
                    <View style={styles.cornerTL} /> <View style={styles.cornerTR} />
                    <View style={styles.cornerBL} /> <View style={styles.cornerBR} />

                    {isStreaming && !hasError ? (
                        <View style={{ width: '100%', height: '100%' }}>
                            <WebView
                                key={reloadKey} source={{ html: streamHtml }}
                                style={styles.fullFeed}
                                scrollEnabled={false} bounces={false}
                                onLoadStart={() => setIsLoading(true)}
                                onLoad={() => { setIsLoading(false); setHasError(false); }}
                                onMessage={(e) => {
                                    if(e.nativeEvent.data === 'error') {
                                        setHasError(true); setIsLoading(false);
                                    }
                                }}
                            />
                            {isLoading && (
                                <View style={styles.loadingOverlay}>
                                    <ActivityIndicator color="#3B82F6" size="large" />
                                    <Text style={styles.loadingText}>BUFFERING STREAM...</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.overlayContent}>
                            <View style={styles.iconCircle}>
                                <VideoIcon color={hasError ? "#EF4444" : "#475569"} size={40} />
                            </View>
                            <Text style={styles.overlayTitle}>{hasError ? "CONNECTION FAILED" : "SIGNAL LOSS"}</Text>
                            <TouchableOpacity style={styles.syncBtn} onPress={handleSync}>
                                <Play color="white" size={14} fill="white" />
                                <Text style={styles.syncBtnText}>{hasError ? "RETRY CONNECTION" : "ACTIVATE STREAM"}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={{ marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={testInBrowser}>
                                <ExternalLink color="#3B82F6" size={12} />
                                <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: 'bold' }}>TEST IN BROWSER</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Settings Overlay */}
                    {showSettings && (
                        <ScrollView style={styles.settingsOverlay}>
                            <Text style={styles.settingsTitle}>OVERRIDE CONTROLS</Text>
                            
                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Resolution</Text>
                                <View style={styles.btnGroup}>
                                    <TouchableOpacity style={[styles.ctrlBtn, camConfig.framesize === 4 && styles.activeBtn]} onPress={() => sendControl('framesize', 4)}>
                                        <Text style={styles.btnText}>HQVGA</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.ctrlBtn, camConfig.framesize === 5 && styles.activeBtn]} onPress={() => sendControl('framesize', 5)}>
                                        <Text style={styles.btnText}>QVGA</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.ctrlBtn, camConfig.framesize === 6 && styles.activeBtn]} onPress={() => sendControl('framesize', 6)}>
                                        <Text style={styles.btnText}>VGA</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Flip Vertical</Text>
                                <Switch 
                                    value={camConfig.vflip === 1} 
                                    onValueChange={(v) => sendControl('vflip', v ? 1 : 0)}
                                    trackColor={{ false: "#1E293B", true: "#3B82F6" }}
                                />
                            </View>

                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Mirror Horizontal</Text>
                                <Switch 
                                    value={camConfig.hmirror === 1} 
                                    onValueChange={(v) => sendControl('hmirror', v ? 1 : 0)}
                                    trackColor={{ false: "#1E293B", true: "#3B82F6" }}
                                />
                            </View>
                            
                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Flashlight</Text>
                                <Switch 
                                    value={camConfig.led_intensity > 0} 
                                    onValueChange={(v) => sendControl('led_intensity', v ? 255 : 0)}
                                    trackColor={{ false: "#1E293B", true: "#3B82F6" }}
                                />
                            </View>

                        </ScrollView>
                    )}
                </View>

                {/* Info Bar */}
                <View style={styles.infoBar}>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>STATUS</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[styles.dot, { backgroundColor: isStreaming ? '#10B981' : '#EF4444' }]} />
                            <Text style={[styles.infoVal, { color: isStreaming ? '#10B981' : '#EF4444' }]}>{isStreaming ? 'LIVE' : 'IDLE'}</Text>
                        </View>
                    </View>
                    <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>ROUTING IP</Text>
                        <TextInput style={styles.infoInput} value={localIp} onChangeText={setLocalIp} placeholder="IP" placeholderTextColor="#475569" />
                    </View>
                    <TouchableOpacity style={styles.infoItem} onPress={() => isStreaming ? setIsStreaming(false) : handleSync()}>
                        <Text style={styles.infoLabel}>ENGINE</Text>
                        <Power color={isStreaming ? '#EF4444' : '#3B82F6'} size={14} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: { backgroundColor: '#161D26', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e293b', flex: 2, height: 540 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    cardTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    insetContainer: { backgroundColor: '#0B0E14', borderRadius: 12, flex: 1, padding: 5, borderWidth: 1, borderColor: '#1e293b', overflow: 'hidden' },
    feedArea: { flex: 1, backgroundColor: '#020617', borderRadius: 8, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
    fullFeed: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2, 6, 23, 0.8)', justifyContent: 'center', alignItems: 'center', gap: 15 },
    loadingText: { color: '#3B82F6', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    scanLine: { position: 'absolute', top: '20%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)' },
    overlayContent: { alignItems: 'center' },
    iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(30, 41, 59, 0.4)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    overlayTitle: { color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
    syncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, gap: 10, marginTop: 15 },
    syncBtnText: { color: 'white', fontSize: 13, fontWeight: '900' },
    infoBar: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#0B121B', borderTopWidth: 1, borderColor: '#1e293b' },
    infoItem: { gap: 4 },
    infoLabel: { color: '#475569', fontSize: 9, fontWeight: '900' },
    infoVal: { color: 'white', fontSize: 13, fontWeight: 'bold' },
    infoInput: { color: '#3B82F6', fontSize: 12, fontWeight: 'bold', padding: 0, minWidth: 100 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    settingsOverlay: { position: 'absolute', right: 10, top: 10, bottom: 10, width: 220, backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#334155', zIndex: 10 },
    settingsTitle: { color: '#94A3B8', fontSize: 10, fontWeight: '900', marginBottom: 15, letterSpacing: 1, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 5 },
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 5 },
    settingLabel: { color: 'white', fontSize: 11, fontWeight: 'bold' },
    btnGroup: { flexDirection: 'row', gap: 5 },
    ctrlBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
    activeBtn: { backgroundColor: '#3B82F6' },
    btnText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    cornerTL: { position: 'absolute', top: 15, left: 15, width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#1e293b' },
    cornerTR: { position: 'absolute', top: 15, right: 15, width: 20, height: 20, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#1e293b' },
    cornerBL: { position: 'absolute', bottom: 15, left: 15, width: 20, height: 20, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: '#1e293b' },
    cornerBR: { position: 'absolute', bottom: 15, right: 15, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#1e293b' }
});

export default CameraFeed;
