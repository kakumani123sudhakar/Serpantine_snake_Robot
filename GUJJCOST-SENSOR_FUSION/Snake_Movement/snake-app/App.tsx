
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Slider from '@react-native-community/slider'
import { Text, TouchableOpacity, View, Alert, ScrollView, Image, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AxisPad, { JoystickUpdateEvent } from './joystick';
import styles from './styles';

interface Props { }

const App: React.FC<Props> = () => {

  const [showGame, setShowGame] = useState(false)

  const [run, setRun] = useState(false)
  const [WLsliderValue, setWLSliderValue] = useState(1)
  const [AmplsliderValue, setAmplSliderValue] = useState(40)
  const [FreqsliderValue, setFreqSliderValue] = useState(2)
  const [SpeedSliderValue, setSpeedSliderValue] = useState(1)
  const [isConcertinaPressed, setIsConcertinaPressed] = useState(false)
  const [isUndulatedPressed, setIsUndulatedPressed] = useState(false)
  const [isBackwardsPressed, setIsBackwards] = useState(false)
  const [isForwardPressed, setIsForward] = useState(false)
  const [isInchwormPressed, setIsInchworm] = useState(false)
  const [espIP, setEspIP] = useState('10.204.186.172')
  const [isConnected, setIsConnected] = useState(false)

  const [angle, setAngle] = useState(90)
  const [moveJoy, setMoveJoy] = useState(false)
  const lastRequestTime = useRef(0);

  function sendOffset() {
    if (run && moveJoy) {
      console.log(`Sending OFFSET: ${angle.toString()} to snake...`);
      sendRequests("off", angle.toString(), "params")
    }
  }

  useEffect(() => {
    sendOffset()
  }, [angle, moveJoy, run]);

  function findNearestMultipleOf10(input: number): number {
    const remainder = input % 10;
    const result = remainder <= 5 ? input - remainder : input + (10 - remainder);
    console.log(`Joystick Angle: ${input} -> Nearest 10: ${result}`);
    return result;
  }

  function sendRequests(key: string, val: string, root: string) {
    // Throttle requests to one every 100ms to prevent crashing the network/app
    const now = Date.now();
    if (now - lastRequestTime.current < 100 && root === "params") {
      return; 
    }
    lastRequestTime.current = now;

    const url = `http://${espIP}/${root}`;
    axios.post(url, {
      [key]: val
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 1000 // Add a timeout to prevent hanging requests
    }).then(() => {
      setIsConnected(true);
    }).catch((error) => {
      console.log("Request failed:", error.message);
      setIsConnected(false);
    });
  }

  const handleConnect = () => {
    console.log(`Connecting to http://${espIP}...`);
    // Ping with current mode (safe)
    axios.post(`http://${espIP}/mode`, {
      value: run ? "1" : "0"
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 2000
    }).then(() => {
      setIsConnected(true);
      Alert.alert("Success", "Connected to Flipper Snake!");
    }).catch((err) => {
      setIsConnected(false);
      Alert.alert("Connection Failed", "Could not reach the ESP32. Check IP and WiFi.");
    });
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    console.log("Disconnected manually");
  };

  const handleButtonStartPress = () => {
    if (((isUndulatedPressed)
      && (isBackwardsPressed || isForwardPressed)) || isConcertinaPressed || isInchwormPressed) {
      setRun(true)
      sendRequests("value", "1", "mode")
      console.log('START')
      setShowGame(true)
    }
    else createButtonAlert("Please select a motion and a direction before starting!")
  }


  const handleButtonStopStartPress = () => {
    if (run) {
      sendRequests("value", "0", "mode")
      setRun(false)
      console.log("STOP")
    }
    else {
      sendRequests("value", "1", "mode")
      setRun(true)
      console.log('START')
    }
  }

  const handleButtonConcertina = () => {
    if (isConcertinaPressed) return
    else {
      setIsConcertinaPressed(true);
      setIsUndulatedPressed(false)
      setIsInchworm(false)
      console.log('CONCERTINA BUTTON ENABLED')
      sendRequests("value", "0", "motion")
    }
  }

  const handleButtonUndulated = () => {
    if (isUndulatedPressed) return
    else {
      setIsUndulatedPressed(!isUndulatedPressed);
      setIsConcertinaPressed(false)
      setIsInchworm(false)
      console.log('UNDULATED BUTTON ENABLED')
      sendRequests("value", "1", "motion")
    }
  }

  const handleButtonInchworm = () => {
    if (isInchwormPressed) return
    else {
      setIsInchworm(!isInchwormPressed)
      setIsConcertinaPressed(false)
      setWLSliderValue(1)
      setFreqSliderValue(2)
      setAmplSliderValue(40)
      setIsUndulatedPressed(false)
      console.log('INCHWORM BUTTON ENABLED')
      sendRequests("value", "2", "motion")
    }
  }

  const handleWLChange = (value: number) => {
    if (isUndulatedPressed) {
      console.log('new WL value updated')
      setWLSliderValue(value / 10);
      sendRequests("wl", String(value / 10), "params")
    }
  }

  const handleFreqChange = (value: number) => {
    if (isUndulatedPressed) {
      console.log('new Freq value updated')
      setFreqSliderValue(value / 10);
      sendRequests("freq", String(value / 10), "params")
    }
  }

  const handleAmplChange = (value: number) => {
    if (isUndulatedPressed) {
      console.log('new Ampl value updated')
      setAmplSliderValue(value);
      sendRequests("amp", String(value), "params")
    }
  }

  const handleSpeedInchwormChange = (value: number) => {
    if (isInchwormPressed) {
      console.log('new Speed value updated')
      setSpeedSliderValue(value / 10);
      sendRequests("speed", String(value / 10), "params")
    }
  }

  const handleButtonReset = () => {
    sendRequests("value", "0", "reset")
    setRun(false)
    setIsForward(false)
    setIsBackwards(false)
    setIsConcertinaPressed(false)
    setIsUndulatedPressed(false)
    setIsInchworm(false)
    setAmplSliderValue(40)
    setFreqSliderValue(2)
    setWLSliderValue(1)
    setSpeedSliderValue(1)
    setAngle(90)
    setMoveJoy(false)
    console.log("RESET")
    if (showGame) {
      setShowGame(false)
    }
  }

  const handleBackwards = () => {
    console.log("BACKWARDS")
    setIsBackwards(true)
    setIsForward(false)
    sendRequests("value", "0", "direction")
  }

  const handleForward = () => {
    console.log("FORWARDS")
    setIsBackwards(false)
    setIsForward(true)
    sendRequests("value", "1", "direction")
  }

  const createButtonAlert = (message: string) => {
    Alert.alert("ERROR", message, [
      { text: 'OK', onPress: () => console.log('OK Pressed') },
    ]);
  }

  if (showGame) {
    if (isUndulatedPressed) {
      return (
        <View style={[styles.container1, { marginTop: 80, marginBottom: 80, marginLeft: 30, marginRight: 30 }]}>

          <View style={styles.containerButtons}>
            <TouchableOpacity style={[styles.button, isBackwardsPressed && styles.pressedButton,
            moveJoy ? styles.disabledButton : styles.shit]}
              onPress={handleBackwards}
              disabled={isConcertinaPressed}>
              <Text style={styles.buttonMotion}>Backwards</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, isForwardPressed && styles.pressedButton
              , moveJoy ? styles.disabledButton : styles.shit]}
              onPress={handleForward}
              disabled={isConcertinaPressed}>
              <Text style={styles.buttonMotion}>Forward</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.containerButtons, { marginBottom: 30 }]}>
            <TouchableOpacity style={[styles.button, moveJoy ? styles.disabledButton : styles.shit]} onPress={handleButtonReset}>
              <Text style={styles.buttonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, moveJoy ? styles.disabledButton : styles.shit]} onPress={handleButtonStopStartPress}>
              <Text style={styles.buttonText}>{run ? 'STOP' : 'START'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.sliderContainer, moveJoy ? styles.disabledButton : styles.shit]}>
            <Text style={styles.subTitle}>Set WaveLength</Text>
            <Slider
              style={{ width: 250, height: 40 }}
              minimumValue={10}
              maximumValue={30}
              step={5}
              value={WLsliderValue * 10}
              minimumTrackTintColor="#2196F3"
              maximumTrackTintColor="#000000"
              thumbTintColor="#00BCD4"
              onValueChange={(value) => setWLSliderValue(value / 10)}
              onSlidingComplete={(value) => handleWLChange(value)}
            />
            <Text style={styles.sliderValueText}>{WLsliderValue.toFixed(1)}</Text>
          </View>

          <View style={[styles.sliderContainer, moveJoy ? styles.disabledButton : styles.shit]}>
            <Text style={styles.subTitle}>Set Amplitude</Text>
            <Slider
              style={{ width: 250, height: 40 }}
              minimumValue={20}
              maximumValue={70}
              step={1}
              value={AmplsliderValue}
              minimumTrackTintColor="#E91E63"
              maximumTrackTintColor="#000000"
              thumbTintColor="#FF4081"
              onSlidingComplete={(value) => handleAmplChange(value)}
              onValueChange={(value) => setAmplSliderValue(value)}
            />
            <Text style={styles.sliderValueText}>{AmplsliderValue}</Text>
          </View>

          {!moveJoy ? (
            <View style={styles.sliderContainer}>
              <Text style={styles.subTitle}>Set Frequency</Text>
              <Slider
                style={{ width: 250, height: 40 }}
                value={FreqsliderValue * 10}
                minimumValue={5}
                maximumValue={100}
                step={1}
                minimumTrackTintColor="#4CAF50"
                maximumTrackTintColor="#000000"
                thumbTintColor="#8BC34A"
                onValueChange={(value) => setFreqSliderValue(value / 10)}
                onSlidingComplete={(value) => handleFreqChange(value)}
              />
              <Text style={styles.sliderValueText}>{FreqsliderValue.toFixed(1)}</Text>
            </View>
          ) : null}

          <GestureHandlerRootView style={{ marginTop: 80 }}>
            <View style={(isConcertinaPressed || isInchwormPressed) && styles.disabledButton}>
              <AxisPad color="#06b6d4" radius={75} onMove={(data: JoystickUpdateEvent) => {
                const newAngle = findNearestMultipleOf10(data.angle.degree);
                setAngle(newAngle);
              }}
                onStop={(data: JoystickUpdateEvent) => {
                  console.log("JOYSTICK STOPPED");
                  setMoveJoy(false)
                }}
                onStart={(data: JoystickUpdateEvent) => {
                  console.log("JOYSTICK STARTED");
                  setMoveJoy(true)
                }} />
            </View>
          </GestureHandlerRootView>

        </View>
      )
    } else {
      return (
        <View style={styles.container1}>
          <TouchableOpacity style={styles.button} onPress={handleButtonReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>

          <View style={styles.arrowButtonContainer}>

            <TouchableOpacity style={[styles.button, { marginTop: 50 }]} onPress={handleButtonStopStartPress}>
              <Text style={styles.buttonText}>{run ? 'STOP' : 'START'}</Text>
            </TouchableOpacity>

          </View>

          {isInchwormPressed ? (
            <View style={styles.sliderContainer}>
              <Text style={styles.subTitle}>Set Speed Inchworm</Text>
              <Slider
                style={{ width: 250, height: 40 }}
                value={SpeedSliderValue * 10}
                onValueChange={(value) => setSpeedSliderValue(value / 10)}
                onSlidingComplete={(value) => handleSpeedInchwormChange(value)}
                minimumValue={2}
                maximumValue={40}
                step={1}
                minimumTrackTintColor="#FF9800"
                maximumTrackTintColor="#000000"
                thumbTintColor="#FFC107"
                disabled={isUndulatedPressed || isConcertinaPressed ||
                  (!isConcertinaPressed && !isUndulatedPressed && !isInchwormPressed)}
              />
              <Text style={styles.sliderValueText}>{SpeedSliderValue.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      )
    }
  }

  return (
    <ScrollView>

      <View style={[styles.container1, { marginTop: 80, marginBottom: 80, marginLeft: 30, marginRight: 30 }]}>

        <Image source={require('./head.jpeg')} style={[{ marginBottom: 30 }]} />

        <Text style={styles.titleMode}>ESP32 IP ADDRESS</Text>
        <View style={styles.connectionContainer}>
          <TextInput
            style={[styles.textInput, { marginTop: 0, width: '50%' }]}
            onChangeText={setEspIP}
            value={espIP}
            placeholder="e.g. 192.168.1.50"
            keyboardType="numeric"
          />
          
          <TouchableOpacity 
            style={isConnected ? styles.disconnectButton : styles.connectButton} 
            onPress={isConnected ? handleDisconnect : handleConnect}
          >
            <Text style={[styles.buttonText, { fontSize: 12 }]}>
              {isConnected ? "OFF" : "ON"}
            </Text>
          </TouchableOpacity>

          <View style={[styles.led, isConnected ? styles.ledConnected : styles.ledDisconnected]} />
        </View>

        <TouchableOpacity style={[styles.button, { marginTop: 20 }]} onPress={handleButtonReset}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>

        <Text style={styles.titleMode}>MODE</Text>

        <View style={styles.containerButtons}>
          <TouchableOpacity style={[styles.button, run && styles.pressedButton]} onPress={handleButtonStartPress}>
            <Text style={styles.buttonText}>Start</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.titleMode}>MOTION</Text>

        <View style={styles.containerButtons}>
          <TouchableOpacity style={[styles.button, isConcertinaPressed && styles.pressedButton]} onPress={handleButtonConcertina}>
            <Text style={styles.buttonMotion}>Concertina</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, isUndulatedPressed && styles.pressedButton]} onPress={handleButtonUndulated}>
            <Text style={styles.buttonMotion}>Undulated</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, isInchwormPressed && styles.pressedButton]} onPress={handleButtonInchworm}>
            <Text style={styles.buttonMotion}>Inchworm</Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.titleMode}>DIRECTION</Text>
        <View style={styles.containerButtons}>
          <TouchableOpacity style={[styles.button, isBackwardsPressed && styles.pressedButton, (isConcertinaPressed || isInchwormPressed) && styles.disabledButton]}
            onPress={handleBackwards}
            disabled={isConcertinaPressed}>
            <Text style={styles.buttonMotion}>Backwards</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, isForwardPressed && styles.pressedButton, (isConcertinaPressed || isInchwormPressed) && styles.disabledButton]}
            onPress={handleForward}
            disabled={isConcertinaPressed}>
            <Text style={styles.buttonMotion}>Forward</Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.titleMode}>PARAMETERS</Text>

        <View style={styles.sliderContainer}>
          <Text style={styles.subTitle}>Set WaveLength</Text>
          <Slider
            style={{ width: 250, height: 40 }}
            minimumValue={10}
            maximumValue={30}
            step={5}
            value={WLsliderValue * 10}
            minimumTrackTintColor="#2196F3"
            maximumTrackTintColor="#000000"
            thumbTintColor="#00BCD4"
            disabled={isInchwormPressed || isConcertinaPressed ||
              (!isConcertinaPressed && !isUndulatedPressed && !isInchwormPressed)}
            onValueChange={(value) => setWLSliderValue(value / 10)}
            onSlidingComplete={(value) => handleWLChange(value)}
          />
          <Text style={styles.sliderValueText}>{WLsliderValue.toFixed(1)}</Text>
        </View>


        <View style={styles.sliderContainer}>
          <Text style={styles.subTitle}>Set Amplitude</Text>
          <Slider
            style={{ width: 250, height: 40 }}
            minimumValue={20}
            maximumValue={70}
            step={1}
            value={AmplsliderValue}
            minimumTrackTintColor="#E91E63"
            maximumTrackTintColor="#000000"
            thumbTintColor="#FF4081"
            disabled={isInchwormPressed || isConcertinaPressed ||
              (!isConcertinaPressed && !isUndulatedPressed && !isInchwormPressed)}
            onSlidingComplete={(value) => handleAmplChange(value)}
            onValueChange={(value) => setAmplSliderValue(value)}
          />
          <Text style={styles.sliderValueText}>{AmplsliderValue}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Text style={styles.subTitle}>Set Frequency</Text>
          <Slider
            style={{ width: 250, height: 40 }}
            value={FreqsliderValue * 10}
            minimumValue={5}
            maximumValue={100}
            step={1}
            minimumTrackTintColor="#4CAF50"
            maximumTrackTintColor="#000000"
            thumbTintColor="#8BC34A"
            disabled={isInchwormPressed || isConcertinaPressed ||
              (!isConcertinaPressed && !isUndulatedPressed && !isInchwormPressed)}
            onValueChange={(value) => setFreqSliderValue(value / 10)}
            onSlidingComplete={(value) => handleFreqChange(value)}
          />
          <Text style={styles.sliderValueText}>{FreqsliderValue.toFixed(1)}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Text style={styles.subTitle}>Set Speed Inchworm</Text>
          <Slider
            style={{ width: 250, height: 40 }}
            value={SpeedSliderValue * 10}
            minimumValue={2}
            maximumValue={40}
            step={1}
            minimumTrackTintColor="#FF9800"
            maximumTrackTintColor="#000000"
            thumbTintColor="#FFC107"
            disabled={isUndulatedPressed || isConcertinaPressed ||
              (!isConcertinaPressed && !isUndulatedPressed && !isInchwormPressed)}
            onValueChange={(value) => setSpeedSliderValue(value / 10)}
            onSlidingComplete={(value) => handleSpeedInchwormChange(value)}
          />
          <Text style={styles.sliderValueText}>{SpeedSliderValue.toFixed(1)}</Text>
        </View>

      </View>
    </ScrollView>
  );
}

export default App;