#!/usr/bin/env python
#
# *********     STServo Web API Backend     *********
#
# Flask REST API for STServo control
# Features: Discovery, Control, Telemetry, Diagnostics
#

import sys
import time
import json
import threading
import math
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import os

# Add parent directory to path for STservo_sdk
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from STservo_sdk import *
from STservo_sdk.sts import (
    STS_ACC, STS_MODE, STS_GOAL_SPEED_L, STS_GOAL_SPEED_H,
    STS_TORQUE_ENABLE, STS_PRESENT_POSITION_L, STS_PRESENT_SPEED_L,
    STS_PRESENT_LOAD_L, STS_PRESENT_VOLTAGE, STS_PRESENT_TEMPERATURE,
    STS_MOVING, STS_PRESENT_CURRENT_L, STS_PRESENT_CURRENT_H,
    STS_GOAL_POSITION_L, STS_GOAL_POSITION_H, STS_GOAL_TIME_L, STS_GOAL_TIME_H,
    STS_MIN_ANGLE_LIMIT_L, STS_MAX_ANGLE_LIMIT_L, STS_CW_DEAD, STS_CCW_DEAD,
    STS_OFS_L, STS_OFS_H, STS_LOCK, STS_ID, STS_BAUD_RATE
)
from STservo_sdk.group_sync_write import GroupSyncWrite
from STservo_sdk.group_sync_read import GroupSyncRead

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Global variables
connection_status = {"connected": False, "port": "", "baudrate": 0}

class ServoController:
    def __init__(self):
        self.port_handler = None
        self.packet_handler = None
        self.is_connected = False
        self.discovered_servos = {}
        self.continuous_movement_threads = {}
        self.movement_patterns = {}
        
        # Centralized group sync write instances to prevent conflicts
        self.group_sync_write_lock = threading.Lock()
        self.pause_lock = threading.Lock()  # ✅ RACE-CONDITION-FIX: Add lock for pause operations
        self.group_sync_speed_writer = None
        self.group_sync_position_writer = None
        
    def connect(self, port, baudrate):
        """Connect to servo bus"""
        try:
            print(f"Debug: Attempting to connect to port {port} at {baudrate} baud...")
            
            # If already connected, disconnect first
            if self.is_connected:
                print("Debug: Already connected, disconnecting first...")
                self.disconnect()
                time.sleep(0.5)  # Give port time to release
            
            # Create new port handler
            self.port_handler = PortHandler(port)
            self.packet_handler = sts(self.port_handler)
            
            if not self.port_handler.openPort():
                print(f"Error: Failed to open port {port}!")
                return {"success": False, "error": f"Failed to open port {port}"}
                
            print(f"Debug: Port {port} opened successfully.")
            if not self.port_handler.setBaudRate(baudrate):
                print(f"Error: Failed to set baudrate {baudrate}!")
                self.port_handler.closePort()
                return {"success": False, "error": f"Failed to set baudrate {baudrate}"}
                
            print(f"Debug: Baudrate {baudrate} set successfully. Connected.")
            self.is_connected = True
            
            # Initialize centralized group sync write instances
            self._initialize_group_sync_writers()
            
            return {"success": True, "message": f"Connected to {port} at {baudrate} baud"}
            
        except Exception as e:
            print(f"Error connecting to servo bus: {e}")
            return {"success": False, "error": str(e)}
    
    def disconnect(self):
        """Disconnect from servo bus"""
        print("Debug: Attempting to disconnect...")
        if self.port_handler:
            self.port_handler.closePort()
            print("Debug: Port closed.")
        self.is_connected = False
        self.discovered_servos = {}
        print("Debug: Disconnected successfully.")
        
        # Clear group sync write instances
        self.group_sync_speed_writer = None
        self.group_sync_position_writer = None
        
        return {"success": True, "message": "Disconnected"}
    
    def discover_servos(self, start_id=0, end_id=20):
        """Discover servos in range"""
        if not self.is_connected:
            print("Error: Not connected. Cannot discover servos.")
            return {"success": False, "error": "Not connected"}
            
        discovered = {}
        print(f"Debug: Starting servo discovery from ID {start_id} to {end_id}...")
        
        for servo_id in range(start_id, end_id + 1):
            try:
                print(f"Debug: Pinging servo ID {servo_id}...")
                model, comm_result, error = self.packet_handler.ping(servo_id)
                if comm_result == COMM_SUCCESS:
                    discovered[servo_id] = {
                        "model": model,
                        "status": "online",
                        "id": servo_id
                    }
                    print(f"Debug: Discovered Servo ID: {servo_id}, Model: {model}")
                    time.sleep(0.05)  # Add small delay after successful ping for stability
                else:
                    print(f"Debug: Servo ID {servo_id} not found or communication error: {self.packet_handler.getTxRxResult(comm_result)} (Error Code: {comm_result}, Lib Error: {error})")
            except Exception as e:
                print(f"Error: Exception during ping for servo {servo_id}: {e}")
                import traceback
                traceback.print_exc()  # Print full stack trace
            time.sleep(0.01)  # Small delay between pings
            
        self.discovered_servos = discovered
        print(f"Debug: Discovery complete. Found {len(discovered)} servos.")
        return {"success": True, "servos": discovered}
    
    def _initialize_group_sync_writers(self):
        """Initialize centralized group sync write instances to prevent conflicts"""
        try:
            with self.group_sync_write_lock:
                # Initialize position writer (uses existing groupSyncWrite from packet_handler)
                if self.packet_handler and self.packet_handler.groupSyncWrite:
                    self.group_sync_position_writer = self.packet_handler.groupSyncWrite
                    print("Debug: Centralized group sync position writer initialized")
                
                # Initialize speed writer
                if self.packet_handler:
                    self.group_sync_speed_writer = GroupSyncWrite(self.packet_handler, STS_GOAL_SPEED_L, 2)
                    print("Debug: Centralized group sync speed writer initialized")
                
        except Exception as e:
            print(f"Error initializing group sync writers: {e}")
    
    def _get_group_sync_position_writer(self):
        """Get the centralized position writer with thread safety"""
        with self.group_sync_write_lock:
            if not self.group_sync_position_writer and self.packet_handler:
                self._initialize_group_sync_writers()
            return self.group_sync_position_writer
    
    def _get_group_sync_speed_writer(self):
        """Get the centralized speed writer with thread safety"""
        with self.group_sync_write_lock:
            if not self.group_sync_speed_writer and self.packet_handler:
                self._initialize_group_sync_writers()
            return self.group_sync_speed_writer
    
    def get_servo_telemetry(self, servo_id):
        """Get comprehensive telemetry for a servo with retry logic"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            telemetry = {}
            errors = []
            
            # Position with retry
            position = None
            for attempt in range(3):
                try:
                    position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                    if comm_result == COMM_SUCCESS:
                        telemetry["position"] = position
                        telemetry["angle"] = round((position - 2048) * 0.088, 2)  # Convert to degrees
                        break
                    elif attempt < 2:
                        time.sleep(0.05)  # Wait before retry
                        continue
                    else:
                        errors.append(f"Position read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Position read exception: {str(e)}")
            
            # Speed with retry
            speed = None
            for attempt in range(3):
                try:
                    speed, comm_result, error = self.packet_handler.ReadSpeed(servo_id)
                    if comm_result == COMM_SUCCESS:
                        telemetry["speed"] = speed
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Speed read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Speed read exception: {str(e)}")
            
            # Moving status with retry
            moving = None
            for attempt in range(3):
                try:
                    moving, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MOVING)
                    if comm_result == COMM_SUCCESS:
                        telemetry["moving"] = "Yes" if moving else "No"
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["moving"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["moving"] = "N/A"
                        break
            
            # Goal position with retry
            goal_position = None
            for attempt in range(3):
                try:
                    goal_position, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_POSITION_L)
                    if comm_result == COMM_SUCCESS:
                        telemetry["goal_position"] = goal_position
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["goal_position"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["goal_position"] = "N/A"
                        break
            
            # Goal speed with retry
            goal_speed = None
            for attempt in range(3):
                try:
                    goal_speed, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_SPEED_L)
                    if comm_result == COMM_SUCCESS:
                        telemetry["goal_speed"] = goal_speed
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["goal_speed"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["goal_speed"] = "N/A"
                        break
            
            # Acceleration with retry
            acceleration = None
            for attempt in range(3):
                try:
                    acceleration, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_ACC)
                    if comm_result == COMM_SUCCESS:
                        telemetry["acceleration"] = acceleration
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["acceleration"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["acceleration"] = "N/A"
                        break
            
            # Mode (servo/motor) with retry
            mode = None
            for attempt in range(3):
                try:
                    mode, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MODE)
                    if comm_result == COMM_SUCCESS:
                        telemetry["mode"] = "Motor" if mode else "Servo"
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["mode"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["mode"] = "N/A"
                        break
            
            # Voltage with retry
            voltage = None
            for attempt in range(3):
                try:
                    voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                    if comm_result == COMM_SUCCESS:
                        telemetry["voltage"] = round(voltage * 0.1, 2)  # Convert to volts
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Voltage read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Voltage read exception: {str(e)}")
            
            # Temperature with retry
            temperature = None
            for attempt in range(3):
                try:
                    temperature, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                    if comm_result == COMM_SUCCESS:
                        telemetry["temperature"] = temperature
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Temperature read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        errors.append(f"Temperature read exception: {str(e)}")
            
            # Current (if available) with retry
            current = None
            for attempt in range(3):
                try:
                    current, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_CURRENT_L)
                    if comm_result == COMM_SUCCESS:
                        telemetry["current"] = current
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["current"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["current"] = "N/A"
                        break
            
            # Torque status with retry
            torque = None
            for attempt in range(3):
                try:
                    torque, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_TORQUE_ENABLE)
                    if comm_result == COMM_SUCCESS:
                        telemetry["torque"] = "Enabled" if torque else "Disabled"
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["torque"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["torque"] = "N/A"
                        break
            
            # Load (if available) with retry
            load = None
            for attempt in range(3):
                try:
                    load, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_LOAD_L)
                    if comm_result == COMM_SUCCESS:
                        telemetry["load"] = load
                        break
                    elif attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["load"] = "N/A"
                        break
                except Exception as e:
                    if attempt < 2:
                        time.sleep(0.05)
                        continue
                    else:
                        telemetry["load"] = "N/A"
                        break
            
            # Add communication status
            if errors:
                telemetry["communication_status"] = "degraded"
                telemetry["errors"] = errors
            else:
                telemetry["communication_status"] = "excellent"
            
            # Add timestamp
            telemetry["timestamp"] = datetime.now().isoformat()
            
            return {"success": True, "telemetry": telemetry}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_servo_position(self, servo_id, position, speed=100, acceleration=50):
        """Set servo position with speed and acceleration"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            comm_result, error = self.packet_handler.WritePosEx(servo_id, position, speed, acceleration) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Position set to {position}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_servo_speed(self, servo_id, speed):
        """Set servo speed"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Read current position and acceleration
            current_pos, comm_result, error = self.packet_handler.ReadPos(servo_id) # Corrected: Removed self.port_handler
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": "Failed to read current position"}
            
            current_acc, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_ACC) # Corrected: Removed self.port_handler
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": "Failed to read current acceleration"}
            
            # Use WritePosEx with current position to update speed and acceleration
            comm_result, error = self.packet_handler.WritePosEx(servo_id, current_pos, speed, current_acc) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Speed set to {speed}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_servo_acceleration(self, servo_id, acceleration):
        """Set servo acceleration"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Read current position and speed
            current_pos, comm_result, error = self.packet_handler.ReadPos(servo_id) # Corrected: Removed self.port_handler
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": "Failed to read current position"}
            
            current_speed, comm_result, error = self.packet_handler.ReadSpeed(servo_id) # Corrected: Removed self.port_handler
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": "Failed to read current speed"}
            
            # Use WritePosEx with current position to update speed and acceleration
            comm_result, error = self.packet_handler.WritePosEx(servo_id, current_pos, current_speed, acceleration) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Acceleration set to {acceleration}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_servo_speed_and_acceleration(self, servo_id, speed, acceleration):
        """Set both servo speed and acceleration at once"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Read current position
            current_pos, comm_result, error = self.packet_handler.ReadPos(servo_id) # Corrected: Removed self.port_handler
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": "Failed to read current position"}
            
            # Use WritePosEx with current position to update both speed and acceleration
            comm_result, error = self.packet_handler.WritePosEx(servo_id, current_pos, speed, acceleration) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Speed set to {speed}, Acceleration set to {acceleration}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def enable_torque(self, servo_id):
        """Enable torque for a servo"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        try:
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Torque enabled for servo {servo_id}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def disable_torque(self, servo_id):
        """Disable torque for a servo"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        try:
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 0) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "message": f"Torque disabled for servo {servo_id}"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def change_servo_id(self, old_id, new_id):
        """Change servo ID"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        # Validate input parameters
        if not isinstance(old_id, int) or not isinstance(new_id, int):
            return {"success": False, "error": "Invalid ID format. IDs must be integers."}
        
        if old_id < 0 or old_id > 253 or new_id < 0 or new_id > 253:
            return {"success": False, "error": "Invalid ID range. IDs must be between 0 and 253."}
        
        if old_id == new_id:
            return {"success": False, "error": "Old and new IDs must be different."}
            
        try:
            print(f"Debug: Starting ID change from {old_id} to {new_id}...")
            
            # First, verify the old servo is still accessible
            model, comm_result, error = self.packet_handler.ping(old_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Servo with ID {old_id} not found or not responding"}
            
            print(f"Debug: Servo {old_id} found, model: {model}")
            
            # Check if the new ID is already in use by another servo
            print(f"Debug: Checking if new ID {new_id} is already in use...")
            try:
                existing_model, comm_result, error = self.packet_handler.ping(new_id)
                if comm_result == COMM_SUCCESS:
                    return {"success": False, "error": f"ID {new_id} is already in use by servo model {existing_model}. Please choose a different ID."}
                print(f"Debug: New ID {new_id} is available")
            except Exception as check_error:
                print(f"Debug: Could not check new ID availability: {check_error}")
                # Continue anyway, as this might be a temporary communication issue
            
            # Unlock EEPROM
            print(f"Debug: Unlocking EEPROM for servo {old_id}...")
            comm_result, error = self.packet_handler.unLockEprom(old_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to unlock EEPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            print(f"Debug: EEPROM unlocked successfully")
            time.sleep(0.1)  # Increased delay for stability
            
            # Write new ID
            print(f"Debug: Writing new ID {new_id} to servo...")
            comm_result, error = self.packet_handler.write1ByteTxRx(old_id, STS_ID, new_id)
            if comm_result != COMM_SUCCESS:
                # Try to lock EEPROM back before returning error
                try:
                    self.packet_handler.LockEprom(old_id)
                except:
                    pass
                return {"success": False, "error": f"Failed to write new ID: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            print(f"Debug: New ID written successfully")
            time.sleep(0.15)  # Increased delay for stability
            
            # Lock EEPROM
            print(f"Debug: Locking EEPROM for new servo ID {new_id}...")
            comm_result, error = self.packet_handler.LockEprom(new_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to lock EEPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            print(f"Debug: EEPROM locked successfully")
            
            # Verify the change by pinging the new ID
            time.sleep(0.2)  # Wait for servo to restart with new ID
            print(f"Debug: Verifying ID change by pinging new ID {new_id}...")
            
            try:
                new_model, comm_result, error = self.packet_handler.ping(new_id)
                if comm_result == COMM_SUCCESS:
                    print(f"Debug: ID change verified successfully. New servo {new_id} responds with model: {new_model}")
                    return {"success": True, "message": f"Servo ID changed from {old_id} to {new_id}. Model: {new_model}"}
                else:
                    print(f"Warning: ID change may have failed. New ID {new_id} not responding")
                    return {"success": False, "error": f"ID change verification failed. New ID {new_id} not responding"}
            except Exception as verify_error:
                print(f"Warning: Error during ID change verification: {verify_error}")
                return {"success": False, "error": f"ID change verification failed: {str(verify_error)}"}
            
        except Exception as e:
            print(f"Error during servo ID change: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": f"Unexpected error during ID change: {str(e)}"}
    
    def ping_servo(self, servo_id):
        """Ping a specific servo"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            model, comm_result, error = self.packet_handler.ping(servo_id) # Corrected: Removed self.port_handler
            if comm_result == COMM_SUCCESS:
                return {"success": True, "model": model, "status": "online"}
            else:
                return {"success": False, "error": self.packet_handler.getTxRxResult(comm_result)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def start_continuous_movement(self, movement_configs):
        """Start continuous movement for multiple servos with angle constraints support"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            results = []
            
            for config in movement_configs:
                servo_id = config.get("servo_id")
                pattern_type = config.get("type", "sweep")
                speed = config.get("speed", 100)
                acceleration = config.get("acceleration", 50)
                
                # New: Angle constraints support
                angle_constraints = config.get("angle_constraints", {})
                min_angle = angle_constraints.get("min_angle")
                max_angle = angle_constraints.get("max_angle")
                enable_constraints = angle_constraints.get("enabled", False)
                
                if not servo_id:
                    results.append({"servo_id": None, "success": False, "error": "Missing servo_id"})
                    continue
                
                # Apply angle constraints if enabled
                if enable_constraints and min_angle is not None and max_angle is not None:
                    print(f"Debug: Applying angle constraints for servo {servo_id}: {min_angle} - {max_angle}")
                    constraint_result = self.set_angle_limits(servo_id, min_angle, max_angle)
                    if not constraint_result.get("success"):
                        results.append({"servo_id": servo_id, "success": False, "error": f"Failed to set angle constraints: {constraint_result.get('error')}"})
                        continue
                
                # Create movement pattern
                pattern = {
                    "type": pattern_type,
                    "speed": speed,
                    "acceleration": acceleration,
                    "running": True,
                    "paused": False,
                    "immediate_stop": False,  # Flag for immediate stop during pause
                    "emergency_stop": False,  # ✅ Enhanced: Additional safety flag
                    "current_position": 0,
                    "angle_constraints": {
                        "enabled": enable_constraints,
                        "min_angle": min_angle,
                        "max_angle": max_angle
                    }
                }
                
                # Add pattern-specific parameters
                if pattern_type == "sweep":
                    pattern.update({
                        "min_position": config.get("min_position", 0),
                        "max_position": config.get("max_position", 4095),
                        "direction": 1
                    })
                elif pattern_type == "wave":
                    pattern.update({
                        "amplitude": config.get("amplitude", 1000),
                        "frequency": config.get("frequency", 1.0),
                        "center_position": config.get("center_position", 2048),
                        "phase": 0
                    })
                elif pattern_type == "rotation":
                    pattern.update({
                        "direction": config.get("direction", 1)  # 1 for CCW, -1 for CW
                    })
                
                self.movement_patterns[servo_id] = pattern
                
                # Start movement thread
                if servo_id in self.continuous_movement_threads:
                    # Stop existing thread
                    self.movement_patterns[servo_id]["running"] = False
                    if self.continuous_movement_threads[servo_id].is_alive():
                        self.continuous_movement_threads[servo_id].join(timeout=1.0)
                
                # Create new thread
                thread = threading.Thread(
                    target=self._continuous_movement_worker,
                    args=(servo_id, pattern),
                    daemon=True
                )
                self.continuous_movement_threads[servo_id] = thread
                thread.start()
                
                results.append({"servo_id": servo_id, "success": True, "message": f"Started {pattern_type} movement"})
            
            # Start periodic monitoring if not already active
            if not hasattr(self, 'monitoring_active') or not self.monitoring_active:
                self.start_periodic_monitoring()
                print("Started periodic monitoring for enhanced robustness")
            
            return {"success": True, "results": results}
            
        except Exception as e:
            print(f"Error starting continuous movement: {e}")
            return {"success": False, "error": str(e)}
    
    def stop_continuous_movement(self, servo_ids):
        """Stop continuous movement for a list of servos"""
        results = []
        for servo_id in servo_ids:
            if not self.is_connected:
                results.append({"servo_id": servo_id, "success": False, "error": "Not connected"})
                continue

            if servo_id in self.movement_patterns: # Only try to stop if a pattern exists for this servo
                # Signal thread to stop if it's running
                if self.movement_patterns[servo_id].get("running", False):
                    self.movement_patterns[servo_id]["running"] = False # Signal thread to stop
                
                # Wait for thread to finish cleanly, if it exists and is alive
                if servo_id in self.continuous_movement_threads and self.continuous_movement_threads[servo_id].is_alive():
                    print(f"Debug: Waiting for servo {servo_id} thread to join for stop.")
                    self.continuous_movement_threads[servo_id].join(timeout=2.0) # Give it more time
                    if self.continuous_movement_threads[servo_id].is_alive():
                        print(f"Warning: Thread for servo {servo_id} did not terminate gracefully on stop.")
                
                # Check pattern type for specific stop behavior
                pattern_type = self.movement_patterns[servo_id].get("type", "unknown")
                if pattern_type == "rotation":
                    print(f"Debug: Stopping rotation for servo {servo_id}: setting speed to 0 and mode to joint.")
                    try:
                        # Set speed to 0 first using proper SDK method
                        comm_result_speed, error_speed = self.packet_handler.WriteSpec(servo_id, 0, 50)
                        if comm_result_speed != COMM_SUCCESS:
                            print(f"Warning: Failed to set speed to 0 for servo {servo_id} during stop: {self.packet_handler.getTxRxResult(comm_result_speed)} (Error Code: {comm_result_speed}, Lib Error: {error_speed})")
                        time.sleep(0.05) # Small delay for command to take effect

                        # Then set mode to joint mode (0) using proper SDK method
                        comm_result_mode, error_mode = self.packet_handler.write1ByteTxRx(servo_id, STS_MODE, 0)
                        if comm_result_mode != COMM_SUCCESS:
                            print(f"Warning: Failed to set servo {servo_id} to Joint Mode during stop: {self.packet_handler.getTxRxResult(comm_result_mode)} (Error Code: {comm_result_mode}, Lib Error: {error_mode})")
                        
                        # Ensure torque is still enabled to hold it in place after mode change
                        comm_result_torque, error_torque = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                        if comm_result_torque != COMM_SUCCESS:
                            print(f"Warning: Failed to ensure torque enabled for servo {servo_id} after rotation stop: {self.packet_handler.getTxRxResult(comm_result_torque)} (Error Code: {comm_result_torque}, Lib Error: {error_torque})")

                    except Exception as e:
                        print(f"Warning: Error during rotation stop for servo {servo_id}: {e}")
                        import traceback
                        traceback.print_exc() # Print full stack trace
                else:
                    # Original logic for positional movements
                    # Read current position after thread has stopped or timed out
                    current_pos, comm_result_read_pos, error_read_pos = None, None, None
                    try:
                        current_pos, comm_result_read_pos, error_read_pos = self.packet_handler.ReadPos(servo_id)
                    except Exception as e:
                        print(f"Error reading position for servo {servo_id} during stop: {e}")
                        import traceback
                        traceback.print_exc() # Print full stack trace
    
                    if comm_result_read_pos != COMM_SUCCESS or current_pos is None:
                        print(f"Warning: Failed to read current position for servo {servo_id} during stop: {self.packet_handler.getTxRxResult(comm_result_read_pos) if comm_result_read_pos is not None else 'No result'}")
                        current_pos = 2048 # Fallback to center position
                    
                    # Immediately set goal position to current position with zero speed/acceleration to hold it
                    try:
                        comm_result_set_pos, error_set_pos = self.packet_handler.WritePosEx(servo_id, int(current_pos), 0, 0) # Set to current position, 0 speed, 0 acceleration
                        if comm_result_set_pos != COMM_SUCCESS:
                            print(f"Warning: Failed to send position hold command to servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result_set_pos)} (Error Code: {comm_result_set_pos}, Lib Error: {error_set_pos})")
                    except Exception as e:
                        print(f"Warning: Error sending position hold command to servo {servo_id}: {e}")
                        import traceback
                        traceback.print_exc() # Print full stack trace
                    
                    # Ensure torque is enabled to hold position firmly
                    try:
                        comm_result_torque, error_torque = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1) # Ensure torque enabled
                        if comm_result_torque != COMM_SUCCESS:
                            print(f"Warning: Failed to enable torque for servo {servo_id} during stop: {self.packet_handler.getTxRxResult(comm_result_torque)} (Error Code: {comm_result_torque}, Lib Error: {error_torque})")
                    except Exception as e:
                        print(f"Warning: Error enabling torque for servo {servo_id} during stop: {e}")
                        import traceback
                        traceback.print_exc() # Print full stack trace
                
                # Clean up resources after the thread has joined or timed out
                if servo_id in self.continuous_movement_threads:
                    del self.continuous_movement_threads[servo_id]
                # Retrieve the pattern from movement_patterns if it exists
                current_pattern = self.movement_patterns.get(servo_id)
                if current_pattern and not current_pattern.get("running", False): # Ensure it's truly stopped
                    del self.movement_patterns[servo_id]
                
                results.append({"servo_id": servo_id, "success": True, "message": "Stopped"})
            else:
                results.append({"servo_id": servo_id, "success": False, "error": "No running movement found for servo"})
        return {"success": True, "results": results}
    
    def pause_continuous_movement(self, servo_ids):
        """Pause continuous movement for a list of servos with RACE-CONDITION-FREE immediate stop"""
        results = []
        
        # ✅ Enhanced: Validate input
        if not servo_ids or not isinstance(servo_ids, (list, tuple)):
            return {"success": False, "error": "Invalid servo_ids parameter"}
        
        # ✅ Enhanced: Check connection first
        if not self.is_connected:
            return {"success": False, "error": "Not connected to any port"}
        
        # ✅ Enhanced: Track overall success
        overall_success = True
        paused_count = 0
        
        for servo_id in servo_ids:
            # ✅ Enhanced: Validate servo ID
            if not isinstance(servo_id, int) or servo_id < 0 or servo_id > 253:
                results.append({"servo_id": servo_id, "success": False, "error": "Invalid servo ID"})
                overall_success = False
                continue

            if servo_id in self.movement_patterns and self.movement_patterns[servo_id].get("running", False):
                try:
                    print(f"Debug: Starting RACE-CONDITION-FREE pause for servo {servo_id}")
                    
                    # ✅ RACE-CONDITION-FIX: Use lock to prevent race conditions
                    with self.pause_lock:
                        # Set stop flags FIRST and wait for worker thread to see them
                        self.movement_patterns[servo_id]["immediate_stop"] = True
                        self.movement_patterns[servo_id]["emergency_stop"] = True
                        self.movement_patterns[servo_id]["paused"] = True
                    
                    # ✅ RACE-CONDITION-FIX: Wait LONGER for worker thread to process stop flags
                    time.sleep(0.1)  # Increased to 0.1 seconds to ensure worker thread sees flags
                    
                    # ✅ RACE-CONDITION-FIX: Verify stop flags are still set
                    if not self.movement_patterns[servo_id].get("immediate_stop", False):
                        print(f"Warning: Immediate stop flag not set for servo {servo_id}, retrying...")
                        self.movement_patterns[servo_id]["immediate_stop"] = True
                        self.movement_patterns[servo_id]["emergency_stop"] = True
                        time.sleep(0.05)
                
                    # ✅ RACE-CONDITION-FIX: Send immediate stop commands AFTER worker thread has seen flags
                    pattern_type = self.movement_patterns[servo_id].get("type", "unknown")
                    if pattern_type == "rotation":
                        print(f"Debug: Sending immediate rotation stop for servo {servo_id}")
                        try:
                            # Set speed to 0 for rotation to stop movement immediately
                            comm_result_speed, error_speed = self.packet_handler.WriteSpec(servo_id, 0, 50)
                            if comm_result_speed != COMM_SUCCESS:
                                print(f"Warning: Failed to set speed to 0 for servo {servo_id} during pause: {self.packet_handler.getTxRxResult(comm_result_speed)}")
                                results.append({"servo_id": servo_id, "success": False, "error": f"Failed to set speed to 0: {self.packet_handler.getTxRxResult(comm_result_speed)}"})
                                self.movement_patterns[servo_id]["paused"] = False
                                self.movement_patterns[servo_id]["immediate_stop"] = False
                                self.movement_patterns[servo_id]["emergency_stop"] = False
                                continue
                            else:
                                print(f"Debug: Successfully set rotation speed to 0 for servo {servo_id}")
                        except Exception as e:
                            print(f"Error setting speed to 0 for servo {servo_id} during pause: {e}")
                            results.append({"servo_id": servo_id, "success": False, "error": str(e)})
                            self.movement_patterns[servo_id]["paused"] = False
                            self.movement_patterns[servo_id]["immediate_stop"] = False
                            self.movement_patterns[servo_id]["emergency_stop"] = False
                            continue
                        
                        # Ensure torque is enabled to hold position
                        try:
                            comm_result_torque, error_torque = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                            if comm_result_torque != COMM_SUCCESS:
                                print(f"Warning: Failed to ensure torque enabled for servo {servo_id} after rotation pause: {self.packet_handler.getTxRxResult(comm_result_torque)}")
                        except Exception as e:
                            print(f"Warning: Error ensuring torque for servo {servo_id} after rotation pause: {e}")

                    else:
                        # For positional movements, immediately hold current position
                        print(f"Debug: Sending immediate positional stop for servo {servo_id}")
                        current_pos, comm_result_read_pos, error_read_pos = None, None, None
                        try:
                            current_pos, comm_result_read_pos, error_read_pos = self.packet_handler.ReadPos(servo_id)
                        except Exception as e:
                            print(f"Error reading position for servo {servo_id} during pause: {e}")
        
                        if comm_result_read_pos != COMM_SUCCESS or current_pos is None:
                            print(f"Warning: Failed to read current position for servo {servo_id} during pause")
                            current_pos = 2048  # Fallback to center position
                        
                        # Immediately set goal position to current position with zero speed/acceleration to hold it
                        try:
                            comm_result_set_pos, error_set_pos = self.packet_handler.WritePosEx(servo_id, int(current_pos), 0, 0)
                            if comm_result_set_pos != COMM_SUCCESS:
                                print(f"Warning: Failed to send position hold command to servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result_set_pos)}")
                            else:
                                print(f"Debug: Successfully sent position hold command to servo {servo_id} at position {current_pos}")
                        except Exception as e:
                            print(f"Warning: Error sending position hold command to servo {servo_id}: {e}")
                        
                        # Ensure torque is enabled to hold position firmly
                        try:
                            comm_result_torque, error_torque = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                            if comm_result_torque != COMM_SUCCESS:
                                results.append({"servo_id": servo_id, "success": False, "error": f"Failed to enable torque: {self.packet_handler.getTxRxResult(comm_result_torque)}"})
                                self.movement_patterns[servo_id]["paused"] = False
                                self.movement_patterns[servo_id]["immediate_stop"] = False
                                self.movement_patterns[servo_id]["emergency_stop"] = False
                                continue
                        except Exception as e:
                            print(f"Error enabling torque for servo {servo_id} during pause: {e}")
                            results.append({"servo_id": servo_id, "success": False, "error": str(e)})
                            self.movement_patterns[servo_id]["paused"] = False
                            self.movement_patterns[servo_id]["immediate_stop"] = False
                            self.movement_patterns[servo_id]["emergency_stop"] = False
                            continue

                    # ✅ RACE-CONDITION-FIX: Wait a bit more to ensure commands are processed
                    time.sleep(0.05)
                    
                    # ✅ RACE-CONDITION-FIX: Clear only emergency_stop flag, keep immediate_stop and paused
                    self.movement_patterns[servo_id]["emergency_stop"] = False
                    # Keep immediate_stop and paused flags to prevent race conditions
                    
                    paused_count += 1
                    results.append({"servo_id": servo_id, "success": True, "message": "Paused immediately with race-condition-free stop"})
                    print(f"Debug: Successfully paused servo {servo_id} with race-condition-free stop")
                    
                except Exception as e:
                    print(f"Error pausing servo {servo_id}: {e}")
                    results.append({"servo_id": servo_id, "success": False, "error": f"Exception: {str(e)}"})
                    overall_success = False
            else:
                results.append({"servo_id": servo_id, "success": False, "error": "No running movement found for servo"})
                
        # ✅ Enhanced: Return comprehensive result
        return {
            "success": overall_success,
            "results": results,
            "paused_count": paused_count,
            "total_servos": len(servo_ids)
        }
    
    def resume_continuous_movement(self, servo_ids):
        """Resume continuous movement for a list of servos"""
        results = []
        for servo_id in servo_ids:
            if not self.is_connected:
                results.append({"servo_id": servo_id, "success": False, "error": "Not connected"})
                continue

            # Only attempt to resume if a movement pattern is active and currently paused
            if servo_id in self.movement_patterns and self.movement_patterns[servo_id].get("running", False) and self.movement_patterns[servo_id].get("paused", False):
                # ✅ RACE-CONDITION-FIX: Use lock to prevent race conditions
                with self.pause_lock:
                    self.movement_patterns[servo_id]["paused"] = False # Signal thread to resume
                    self.movement_patterns[servo_id]["immediate_stop"] = False # Clear immediate stop flag
                
                # Ensure torque is enabled when resuming
                try:
                    comm_result_torque, error_torque = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1) # Enable torque
                    if comm_result_torque != COMM_SUCCESS:
                        print(f"Warning: Failed to enable torque for servo {servo_id} during resume: {self.packet_handler.getTxRxResult(comm_result_torque)} (Error Code: {comm_result_torque}, Lib Error: {error_torque})")
                except Exception as e:
                    print(f"Warning: Error enabling torque for servo {servo_id} during resume: {e}")
                    import traceback
                    traceback.print_exc() # Print full stack trace
                
                results.append({"servo_id": servo_id, "success": True, "message": "Resumed"})
            else:
                results.append({"servo_id": servo_id, "success": False, "error": "No running/paused movement found for servo to resume"})
            
        return {"success": True, "results": results}
    
    def force_stop_all_movements(self):
        """Force stop all movements immediately to prevent random movement"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            stopped_count = 0
            
            # Set immediate stop flag for all running patterns
            for servo_id, pattern in self.movement_patterns.items():
                if pattern.get("running", False):
                    pattern["immediate_stop"] = True
                    pattern["paused"] = True
                    pattern["running"] = False
                    stopped_count += 1
                    print(f"Debug: Force stop flag set for servo {servo_id}")
            
            # Wait a moment for threads to see the stop flags
            time.sleep(0.05)
            
            # Send immediate stop commands to all servos
            for servo_id in self.movement_patterns.keys():
                try:
                    # For rotation patterns, set speed to 0
                    pattern = self.movement_patterns.get(servo_id)
                    if pattern and pattern.get("type") == "rotation":
                        comm_result, error = self.packet_handler.WriteSpec(servo_id, 0, 50)
                        if comm_result == COMM_SUCCESS:
                            print(f"Debug: Force stopped rotation for servo {servo_id}")
                    else:
                        # For positional movements, hold current position
                        current_pos, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            self.packet_handler.WritePosEx(servo_id, int(current_pos), 0, 0)
                            print(f"Debug: Force stopped positional movement for servo {servo_id}")
                except Exception as e:
                    print(f"Warning: Error force stopping servo {servo_id}: {e}")
            
            # Clear all movement patterns
            self.movement_patterns.clear()
            
            # Stop all threads
            for servo_id, thread in self.continuous_movement_threads.items():
                if thread and thread.is_alive():
                    thread.join(timeout=1.0)
            
            self.continuous_movement_threads.clear()
            
            print(f"Debug: Force stopped {stopped_count} movements")
            return {"success": True, "stopped_count": stopped_count}
            
        except Exception as e:
            print(f"Error in force_stop_all_movements: {e}")
            return {"success": False, "error": str(e)}
    
    def get_all_movement_status(self):
        """Get status of all active continuous movements with comprehensive telemetry"""
        all_status = {}
        # Create a copy of the dictionary to avoid iteration issues
        try:
            movement_patterns_copy = dict(self.movement_patterns)
            for servo_id, pattern in movement_patterns_copy.items():
                status = {
                    "running": pattern.get("running", False),
                    "paused": pattern.get("paused", False),
                    "pattern_type": pattern.get("type", "unknown"),
                    "current_position": pattern.get("current_position", None),
                    "cycle_count": pattern.get("cycle_count", 0),
                    "target_cycles": pattern.get("cycles", -1)
                }
                
                # Enhanced telemetry reading with retry logic
                if self.is_connected:
                    try:
                        # Read live position with retry
                        live_pos = None
                        for attempt in range(3):
                            try:
                                live_pos, comm_result_live, _ = self.packet_handler.ReadPos(servo_id)
                                if comm_result_live == COMM_SUCCESS:
                                    status["current_position"] = live_pos
                                    # Debug: Log position updates for stuck servos
                                    if pattern.get("current_position") != live_pos:
                                        print(f"Debug: Servo {servo_id} position updated: {pattern.get('current_position')} -> {live_pos}")
                                    break
                                else:
                                    print(f"Debug: Servo {servo_id} position read failed (attempt {attempt + 1}): {self.packet_handler.getTxRxResult(comm_result_live)}")
                                    if attempt < 2:
                                        time.sleep(0.01)  # Short delay before retry
                            except Exception as e:
                                print(f"Debug: Servo {servo_id} position read exception (attempt {attempt + 1}): {e}")
                                if attempt < 2:
                                    time.sleep(0.01)
                        
                        if live_pos is None:
                            status["communication_status"] = "poor"
                            print(f"Debug: Servo {servo_id} position read failed after 3 attempts")
                        
                        # Read comprehensive telemetry data
                        telemetry_data = self._get_servo_telemetry_robust(servo_id)
                        status.update(telemetry_data)
                        
                        # Check if servo is actually moving
                        try:
                            moving, comm_result_moving, _ = self.packet_handler.read1ByteTxRx(servo_id, STS_MOVING)
                            if comm_result_moving == COMM_SUCCESS:
                                status["is_moving"] = bool(moving)
                            else:
                                status["is_moving"] = "N/A"
                        except:
                            status["is_moving"] = "N/A"
                        
                        # Enhanced communication health check
                        if servo_id in self.continuous_movement_threads:
                            thread = self.continuous_movement_threads[servo_id]
                            if thread and thread.is_alive():
                                status["thread_status"] = "alive"
                            else:
                                status["thread_status"] = "dead"
                                status["running"] = False  # Mark as not running if thread is dead
                                print(f"Warning: Servo {servo_id} movement thread is dead, marking as not running")
                        else:
                            status["thread_status"] = "none"
                        
                    except Exception as e:
                        print(f"Warning: Could not read comprehensive status for servo {servo_id}: {e}")
                        status["communication_status"] = "error"
                        status["running"] = False  # Mark as not running if we can't communicate

                all_status[servo_id] = status
        except Exception as e:
            print(f"Error in get_all_movement_status: {e}")
            import traceback
            traceback.print_exc()
            # Return empty status on error
            return {"success": False, "error": str(e), "all_servos_status": {}}
            
        return {"success": True, "all_servos_status": all_status}
    
    def _get_servo_telemetry_robust(self, servo_id):
        """Get comprehensive telemetry data for a servo with robust error handling"""
        telemetry = {}
        
        try:
            # Speed (Present Speed)
            try:
                speed, comm_result, _ = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_SPEED_L)
                if comm_result == COMM_SUCCESS:
                    telemetry["speed"] = speed
                else:
                    telemetry["speed"] = "N/A"
            except:
                telemetry["speed"] = "N/A"
            
            # Voltage
            try:
                voltage, comm_result, _ = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                if comm_result == COMM_SUCCESS:
                    telemetry["voltage"] = round(voltage * 0.1, 2)
                else:
                    telemetry["voltage"] = "N/A"
            except:
                telemetry["voltage"] = "N/A"
            
            # Temperature
            try:
                temperature, comm_result, _ = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                if comm_result == COMM_SUCCESS:
                    telemetry["temperature"] = temperature
                else:
                    telemetry["temperature"] = "N/A"
            except:
                telemetry["temperature"] = "N/A"
            
            # Current (Present Current)
            try:
                current, comm_result, _ = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_CURRENT_L)
                if comm_result == COMM_SUCCESS:
                    telemetry["current"] = current
                else:
                    telemetry["current"] = "N/A"
            except:
                telemetry["current"] = "N/A"
            
            # Torque (Present Load)
            try:
                torque, comm_result, _ = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_LOAD_L)
                if comm_result == COMM_SUCCESS:
                    telemetry["torque"] = torque
                else:
                    telemetry["torque"] = "N/A"
            except:
                telemetry["torque"] = "N/A"
            
            # Goal Position
            try:
                goal_position, comm_result, _ = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_POSITION_L)
                if comm_result == COMM_SUCCESS:
                    telemetry["goal_position"] = goal_position
                else:
                    telemetry["goal_position"] = "N/A"
            except:
                telemetry["goal_position"] = "N/A"
            
            # Goal Speed
            try:
                goal_speed, comm_result, _ = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_SPEED_L)
                if comm_result == COMM_SUCCESS:
                    telemetry["goal_speed"] = goal_speed
                else:
                    telemetry["goal_speed"] = "N/A"
            except:
                telemetry["goal_speed"] = "N/A"
            
            # Acceleration
            try:
                acceleration, comm_result, _ = self.packet_handler.read1ByteTxRx(servo_id, STS_ACC)
                if comm_result == COMM_SUCCESS:
                    telemetry["acceleration"] = acceleration
                else:
                    telemetry["acceleration"] = "N/A"
            except:
                telemetry["acceleration"] = "N/A"
            
            # Mode (servo/motor)
            try:
                mode, comm_result, _ = self.packet_handler.read1ByteTxRx(servo_id, STS_MODE)
                if comm_result == COMM_SUCCESS:
                    telemetry["mode"] = "Motor" if mode else "Servo"
                else:
                    telemetry["mode"] = "N/A"
            except:
                telemetry["mode"] = "N/A"
                
        except Exception as e:
            print(f"Error reading telemetry for servo {servo_id}: {e}")
            # Set all telemetry to N/A on error
            telemetry.update({
                "speed": "N/A",
                "voltage": "N/A", 
                "temperature": "N/A",
                "current": "N/A",
                "torque": "N/A",
                "goal_position": "N/A",
                "goal_speed": "N/A",
                "acceleration": "N/A",
                "mode": "N/A"
            })
        
        return telemetry
    
    def get_movement_status(self, servo_id):
        """Get status of continuous movement for a servo"""
        if servo_id in self.movement_patterns:
            pattern = self.movement_patterns[servo_id]
            status = {
                "success": True,
                "running": pattern.get("running", False),
                "paused": pattern.get("paused", False),
                "pattern_type": pattern.get("type", "unknown"),
                "current_position": pattern.get("current_position", 0),
                "cycle_count": pattern.get("cycle_count", 0),
                "target_cycles": pattern.get("cycles", -1)
            }
            # Attempt to read live position for more accurate status display
            if self.is_connected:
                try:
                    live_pos, comm_result_live, _ = self.packet_handler.ReadPos(servo_id) # Corrected: Removed self.port_handler
                    if comm_result_live == COMM_SUCCESS:
                        status["current_position"] = live_pos
                except Exception as e:
                    print(f"Warning: Could not read live position for servo {servo_id} in status update: {e}")
                    import traceback
                    traceback.print_exc() # Print full stack trace

            return status
        return {"success": False, "error": f"No movement pattern found for servo {servo_id}"}
    
    def _create_sweep_pattern(self, servo_id, params):
        """Create a sweep movement pattern"""
        start_pos = params.get("start_position", 0)
        end_pos = params.get("end_position", 4095)
        speed = params.get("speed", 100)
        acceleration = params.get("acceleration", 50)
        cycles = params.get("cycles", -1)  # -1 for infinite
        
        return {
            "type": "sweep",
            "running": True,
            "paused": False,
            "start_position": start_pos,
            "end_position": end_pos,
            "speed": speed,
            "acceleration": acceleration,
            "cycles": cycles,
            "current_position": start_pos, # Initial current position for the pattern
            "cycle_count": 0,
            "direction": 1  # 1 for forward, -1 for backward
        }
    
    def _create_rotation_pattern(self, servo_id, params):
        """Create a rotation movement pattern"""
        center_pos = params.get("center_position", 2048)
        amplitude = params.get("amplitude", 1000)
        speed = params.get("speed", 100)
        acceleration = params.get("acceleration", 50)
        cycles = params.get("cycles", -1)
        
        return {
            "type": "rotation",
            "running": True,
            "paused": False,
            "center_position": center_pos,
            "amplitude": amplitude,
            "speed": speed,
            "acceleration": acceleration,
            "cycles": cycles,
            "current_position": center_pos, # Initial current position
            "cycle_count": 0,
            "angle": 0 # Current angle in degrees for tracking
        }
    
    def _create_wave_pattern(self, servo_id, params):
        """Create a wave movement pattern"""
        center_pos = params.get("center_position", 2048)
        amplitude = params.get("amplitude", 500)
        frequency = params.get("frequency", 1.0)  # Hz
        speed = params.get("speed", 100)
        acceleration = params.get("acceleration", 50)
        cycles = params.get("cycles", -1)
        
        return {
            "type": "wave",
            "running": True,
            "paused": False,
            "center_position": center_pos,
            "amplitude": amplitude,
            "speed": speed,
            "acceleration": acceleration,
            "frequency": frequency,
            "cycles": cycles,
            "current_position": center_pos, # Initial current position
            "cycle_count": 0,
            "time_start": time.time() # Reference time for wave calculation
        }

    def _wait_for_servo_to_stop(self, servo_id, target_position, timeout=5.0, tolerance=5):
        """Waits for a servo to reach a target position or stop moving within tolerance."""
        start_time = time.time()
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        while time.time() - start_time < timeout:
            if not self.is_connected: 
                print(f"Debug: Disconnected during wait for servo {servo_id}")
                return False # Early exit if disconnected
            
            try:
                # Add retry logic for ReadPos
                position = None
                comm_result = None
                error = None
                
                # Try to read position with retries
                for attempt in range(3):
                    try:
                        position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            consecutive_failures = 0  # Reset failure counter on success
                            break
                        else:
                            if attempt < 2:  # Not the last attempt
                                time.sleep(0.01)  # Small delay before retry
                                continue
                    except Exception as e:
                        if attempt < 2:  # Not the last attempt
                            time.sleep(0.01)
                            continue
                        else:
                            raise e
                
                if comm_result == COMM_SUCCESS and position is not None:
                    # Check if position is within tolerance
                    if abs(position - target_position) <= tolerance:
                        return True # Servo has reached target
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"Warning: Too many consecutive ReadPos failures for servo {servo_id}, stopping wait")
                        return False
                    
                    if comm_result is not None:
                        print(f"Warning: ReadPos for servo {servo_id} failed with result: {comm_result} ({self.packet_handler.getTxRxResult(comm_result)}), error: {error}")
                    else:
                        print(f"Warning: ReadPos for servo {servo_id} returned no result")
                        
            except Exception as e:
                print(f"Warning: Exception reading position for servo {servo_id} while waiting: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_consecutive_failures:
                    print(f"Warning: Too many consecutive exceptions for servo {servo_id}, stopping wait")
                    return False
                
            time.sleep(0.05) # Poll every 50ms
        
        print(f"Warning: Servo {servo_id} did not reach target {target_position} within {timeout}s (current: {position if 'position' in locals() and position is not None else 'N/A'})")
        return False # Timeout

    def _wait_for_group_synchronization(self, movement_configs, timeout=1.0):
        """Wait for all servos in a group to reach their target positions for better synchronization"""
        if not movement_configs:
            return True
            
        start_time = time.time()
        servo_targets = {servo_id: target_pos for servo_id, target_pos, _, _ in movement_configs}
        reached_targets = set()
        
        while time.time() - start_time < timeout and len(reached_targets) < len(servo_targets):
            for servo_id, target_pos in servo_targets.items():
                if servo_id in reached_targets:
                    continue
                    
                try:
                    position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                    if comm_result == COMM_SUCCESS and position is not None:
                        if abs(position - target_pos) <= 10:  # Tolerance of 10 units
                            reached_targets.add(servo_id)
                            print(f"Debug: Servo {servo_id} reached target {target_pos} (current: {position})")
                except Exception as e:
                    # Skip failed reads, continue with others
                    pass
                    
            if len(reached_targets) < len(servo_targets):
                time.sleep(0.02)  # Check every 20ms
        
        if len(reached_targets) == len(servo_targets):
            print(f"Debug: All {len(servo_targets)} servos synchronized successfully")
            return True
        else:
            remaining = set(servo_targets.keys()) - reached_targets
            print(f"Warning: {len(remaining)} servos not synchronized: {remaining}")
            return False

    def _attempt_servo_recovery(self, servo_id):
        """Attempt to recover communication with a servo"""
        try:
            print(f"Attempting to recover communication with servo {servo_id}...")
            
            # First, try to ping the servo
            model, comm_result, error = self.packet_handler.ping(servo_id)
            if comm_result == COMM_SUCCESS:
                print(f"Servo {servo_id} is responding to ping, communication recovered")
                return True
            
            # If ping fails, try to reset communication
            print(f"Ping failed for servo {servo_id}, attempting communication reset...")
            
            # Try to read a simple register to test communication
            try:
                # Try to read the torque enable status
                torque_status, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_TORQUE_ENABLE)
                if comm_result == COMM_SUCCESS:
                    print(f"Servo {servo_id} communication recovered through register read")
                    return True
            except Exception as e:
                print(f"Register read failed for servo {servo_id}: {e}")
            
            # If all else fails, try to re-enable torque
            try:
                comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                if comm_result == COMM_SUCCESS:
                    print(f"Servo {servo_id} communication recovered through torque enable")
                    return True
            except Exception as e:
                print(f"Torque enable failed for servo {servo_id}: {e}")
            
            print(f"Failed to recover communication with servo {servo_id}")
            return False
            
        except Exception as e:
            print(f"Error during servo recovery for {servo_id}: {e}")
            return False

    def force_stop_all_movements(self):
        """Force stop all movements immediately - emergency stop"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        print("🚨 EMERGENCY STOP: Force stopping all movements...")
        
        stopped_count = 0
        errors = []
        
        # First, signal all threads to stop
        for servo_id, pattern in self.movement_patterns.items():
            if pattern.get("running", False):
                pattern["running"] = False
                print(f"  Signaling servo {servo_id} to stop...")
        
        # Wait a moment for threads to respond
        time.sleep(0.1)
        
        # Force stop each servo individually
        for servo_id in list(self.movement_patterns.keys()):
            try:
                print(f"  Force stopping servo {servo_id}...")
                
                # Check pattern type for specific stop behavior
                pattern = self.movement_patterns[servo_id]
                pattern_type = pattern.get("type", "unknown")
                
                if pattern_type == "rotation":
                    # For rotation, set speed to 0 and mode to joint
                    try:
                        # Set speed to 0
                        comm_result, error = self.packet_handler.WriteSpec(servo_id, 0, 50)
                        if comm_result != COMM_SUCCESS:
                            print(f"    Warning: Failed to set speed to 0 for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                        
                        # Set to joint mode
                        comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_MODE, 0)
                        if comm_result != COMM_SUCCESS:
                            print(f"    Warning: Failed to set servo {servo_id} to joint mode: {self.packet_handler.getTxRxResult(comm_result)}")
                    except Exception as e:
                        print(f"    Error during rotation stop for servo {servo_id}: {e}")
                        errors.append(f"Servo {servo_id} rotation stop error: {e}")
                else:
                    # For positional movements, read current position and hold it
                    try:
                        current_pos, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            # Hold current position
                            comm_result, error = self.packet_handler.WritePosEx(servo_id, int(current_pos), 0, 0)
                            if comm_result != COMM_SUCCESS:
                                print(f"    Warning: Failed to hold position for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                        else:
                            print(f"    Warning: Failed to read position for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                    except Exception as e:
                        print(f"    Error during positional stop for servo {servo_id}: {e}")
                        errors.append(f"Servo {servo_id} positional stop error: {e}")
                
                # Ensure torque is enabled to hold position
                try:
                    comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                    if comm_result != COMM_SUCCESS:
                        print(f"    Warning: Failed to enable torque for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                except Exception as e:
                    print(f"    Error enabling torque for servo {servo_id}: {e}")
                    errors.append(f"Servo {servo_id} torque enable error: {e}")
                
                stopped_count += 1
                print(f"    ✅ Servo {servo_id} force stopped")
                
            except Exception as e:
                print(f"    ❌ Error force stopping servo {servo_id}: {e}")
                errors.append(f"Servo {servo_id} general error: {e}")
        
        # Clean up all threads and patterns
        print("  Cleaning up threads and patterns...")
        
        # Wait for threads to finish
        for servo_id, thread in self.continuous_movement_threads.items():
            if thread.is_alive():
                thread.join(timeout=1.0)
                if thread.is_alive():
                    print(f"    Warning: Thread for servo {servo_id} did not terminate gracefully")
        
        # Clear all data structures
        self.continuous_movement_threads.clear()
        self.movement_patterns.clear()
        
        print(f"🚨 EMERGENCY STOP COMPLETE: {stopped_count} servos stopped")
        if errors:
            print(f"⚠️ {len(errors)} errors occurred during emergency stop")
            for error in errors:
                print(f"    {error}")
        
        return {
            "success": True,
            "stopped_count": stopped_count,
            "errors": errors,
            "message": f"Emergency stop completed. {stopped_count} servos stopped."
        }

    def restart_failed_movements(self):
        """Restart any failed movement threads"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        restarted_count = 0
        failed_servos = []
        
        # Check for servos with running patterns but no active threads
        for servo_id, pattern in self.movement_patterns.items():
            if pattern.get("running", False):
                thread = self.continuous_movement_threads.get(servo_id)
                
                # Check if thread is missing or dead
                if thread is None or not thread.is_alive():
                    failed_servos.append(servo_id)
                    print(f"Found failed movement for servo {servo_id}, attempting restart...")
                    
                    # Stop the failed pattern
                    self.stop_continuous_movement([servo_id])
                    time.sleep(0.1)
                    
                    # Restart the movement
                    try:
                        result = self.start_continuous_movement([servo_id], pattern["type"], {
                            "speed": pattern.get("speed", 100),
                            "acceleration": pattern.get("acceleration", 50),
                            "cycles": pattern.get("cycles", -1),
                            "start_position": pattern.get("start_position", 0),
                            "end_position": pattern.get("end_position", 4095),
                            "center_position": pattern.get("center_position", 2048)
                        })
                        
                        if result["success"]:
                            restarted_count += 1
                            print(f"Successfully restarted movement for servo {servo_id}")
                        else:
                            print(f"Failed to restart movement for servo {servo_id}: {result.get('error', 'Unknown error')}")
                            
                    except Exception as e:
                        print(f"Exception restarting movement for servo {servo_id}: {e}")
                        import traceback
                        traceback.print_exc()
        
        if restarted_count > 0:
            print(f"Successfully restarted {restarted_count} failed movements")
        else:
            print("No failed movements to restart")
        
        return {
            "success": True,
            "restarted_count": restarted_count,
            "failed_servos": failed_servos
        }

    def _continuous_movement_worker(self, servo_id, pattern):
        """Worker thread for continuous movement with enhanced robustness and error recovery"""
        print(f"Debug: Starting enhanced continuous movement worker for servo {servo_id}")
        
        # Initialize monitoring variables
        consecutive_failures = 0
        max_consecutive_failures = 5
        last_successful_position = None
        health_check_interval = 20  # Check health every 20 steps
        step_count = 0
        
        # ✅ Enhanced: Initialize pattern with proper defaults to prevent crashes
        try:
            # Ensure pattern has all required fields
            if "current_position" not in pattern:
                # Try to read current position from servo
                try:
                    position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                    if comm_result == COMM_SUCCESS:
                        pattern["current_position"] = position
                        print(f"Debug: Servo {servo_id} initial position: {position}")
                    else:
                        pattern["current_position"] = 2048  # Default center position
                        print(f"Debug: Servo {servo_id} using default position: 2048")
                except Exception as e:
                    pattern["current_position"] = 2048  # Default center position
                    print(f"Debug: Servo {servo_id} using default position due to error: {e}")
            
            # Set other required defaults
            if "direction" not in pattern:
                pattern["direction"] = 1
            if "cycle_count" not in pattern:
                pattern["cycle_count"] = 0
            if "start_position" not in pattern:
                pattern["start_position"] = 0
            if "end_position" not in pattern:
                pattern["end_position"] = 4095
            if "center_position" not in pattern:
                pattern["center_position"] = 2048
                
            print(f"Debug: Servo {servo_id} pattern initialized successfully")
            
        except Exception as e:
            print(f"Error initializing pattern for servo {servo_id}: {e}")
            pattern["running"] = False
            return
        
        try:
            while pattern.get("running", False):
                # ✅ Enhanced: Check multiple stop flags for maximum safety
                if pattern.get("immediate_stop", False) or pattern.get("emergency_stop", False):
                    print(f"Debug: Immediate/emergency stop detected for servo {servo_id}, stopping movement")
                    time.sleep(0.1)
                    continue
                
                # ✅ RACE-CONDITION-FIX: Use lock when checking pause flags
                with self.pause_lock:
                    if pattern.get("paused", False):
                        time.sleep(0.1)
                        continue
                
                try:
                    # ✅ RACE-CONDITION-FIX: Check stop flags BEFORE any calculations
                    if pattern.get("immediate_stop", False) or pattern.get("emergency_stop", False):
                        print(f"Debug: Immediate/emergency stop detected for servo {servo_id} before position calculation")
                        break
                    
                    # Calculate next position based on pattern type
                    next_position = self._calculate_next_position(servo_id, pattern)
                    
                    # ✅ RACE-CONDITION-FIX: Check stop flags AFTER position calculation
                    if pattern.get("immediate_stop", False) or pattern.get("emergency_stop", False):
                        print(f"Debug: Immediate/emergency stop detected for servo {servo_id} after position calculation")
                        break
                    
                    # Apply angle constraints if enabled
                    angle_constraints = pattern.get("angle_constraints", {})
                    if angle_constraints.get("enabled", False):
                        min_angle = angle_constraints.get("min_angle")
                        max_angle = angle_constraints.get("max_angle")
                        
                        if min_angle is not None and max_angle is not None:
                            # Clamp position within angle constraints
                            if next_position < min_angle:
                                print(f"Debug: Servo {servo_id} position {next_position} below min angle {min_angle}, clamping")
                                next_position = min_angle
                                # Reverse direction for sweep patterns
                                if pattern["type"] == "sweep":
                                    pattern["direction"] *= -1
                            elif next_position > max_angle:
                                print(f"Debug: Servo {servo_id} position {next_position} above max angle {max_angle}, clamping")
                                next_position = max_angle
                                # Reverse direction for sweep patterns
                                if pattern["type"] == "sweep":
                                    pattern["direction"] *= -1
                    
                    # ✅ RACE-CONDITION-FIX: Check stop flags AFTER angle constraints
                    if pattern.get("immediate_stop", False) or pattern.get("emergency_stop", False):
                        print(f"Debug: Immediate/emergency stop detected for servo {servo_id} after angle constraints")
                        break
                    
                    # Execute movement step with retry logic
                    movement_success = False
                    for attempt in range(3):  # Try up to 3 times
                        # ✅ Enhanced: Check multiple stop flags before each attempt
                        if pattern.get("immediate_stop", False) or pattern.get("emergency_stop", False):
                            print(f"Debug: Immediate/emergency stop detected for servo {servo_id} during movement retry")
                            break
                            
                        try:
                            if pattern["type"] == "sweep":
                                self._execute_sweep_step(servo_id, pattern, next_position)
                            elif pattern["type"] == "rotation":
                                self._execute_rotation_step(servo_id, pattern)
                            elif pattern["type"] == "wave":
                                self._execute_wave_step(servo_id, pattern, next_position)
                            
                            movement_success = True
                            break
                        except Exception as e:
                            print(f"Debug: Servo {servo_id} movement attempt {attempt + 1} failed: {e}")
                            if attempt < 2:
                                time.sleep(0.02)  # Short delay before retry
                    
                    if movement_success:
                        # Update current position
                        pattern["current_position"] = next_position
                        last_successful_position = next_position
                        consecutive_failures = 0  # Reset failure counter
                        
                        # Update cycle count for sweep patterns
                        if pattern["type"] == "sweep":
                            if (pattern["direction"] == 1 and next_position >= pattern["end_position"]) or \
                               (pattern["direction"] == -1 and next_position <= pattern["start_position"]):
                                pattern["cycle_count"] += 1
                                print(f"Debug: Servo {servo_id} completed cycle {pattern['cycle_count']}")
                    else:
                        consecutive_failures += 1
                        print(f"Warning: Servo {servo_id} movement failed after 3 attempts (consecutive failures: {consecutive_failures})")
                        
                        # If too many consecutive failures, attempt recovery - NEVER STOP THE MOTOR
                        if consecutive_failures >= max_consecutive_failures:
                            print(f"Critical: Servo {servo_id} has {consecutive_failures} consecutive failures, attempting recovery...")
                            recovery_success = False
                            
                            # Try multiple recovery attempts
                            for recovery_attempt in range(3):
                                if self._attempt_servo_recovery(servo_id, pattern):
                                    consecutive_failures = 0
                                    print(f"Recovery successful for servo {servo_id} on attempt {recovery_attempt + 1}")
                                    recovery_success = True
                                    break
                                else:
                                    print(f"Recovery attempt {recovery_attempt + 1} failed for servo {servo_id}")
                                    time.sleep(0.1)
                            
                            # Even if all recovery attempts fail, DON'T STOP THE MOTOR
                            if not recovery_success:
                                print(f"Warning: All recovery attempts failed for servo {servo_id}, but continuing movement anyway")
                                consecutive_failures = 0  # Reset counter to prevent infinite loop
                                # Continue movement despite failures
                    
                    # Enhanced communication health check - NEVER STOP THE MOTOR
                    step_count += 1
                    if step_count % health_check_interval == 0:
                        health_status = self._check_communication_health_during_movement(servo_id, pattern)
                        # Health check will handle recovery internally and NEVER stop the motor
                        if not health_status:
                            print(f"Warning: Servo {servo_id} health check returned False, but continuing movement anyway")
                            # Continue movement regardless of health check result
                    
                    # Pattern-specific delays
                    if pattern["type"] == "rotation":
                        time.sleep(0.05)  # Faster for rotation
                    else:
                        time.sleep(0.1)  # Standard delay for sweep/wave
                        
                except Exception as e:
                    consecutive_failures += 1
                    print(f"Error in continuous movement worker for servo {servo_id}: {e}")
                    
                    # NEVER STOP THE MOTOR - just log and continue
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"Warning: Servo {servo_id} has {consecutive_failures} consecutive failures, but continuing movement anyway")
                        consecutive_failures = 0  # Reset counter to prevent infinite loop
                        # Continue movement despite errors
                    
                    time.sleep(0.1)  # Wait before retrying
                    
        except Exception as e:
            print(f"Critical error in continuous movement worker for servo {servo_id}: {e}")
            pattern["running"] = False
        finally:
            print(f"Debug: Enhanced continuous movement worker for servo {servo_id} stopped")
            # Ensure the pattern is marked as not running
            pattern["running"] = False
    
    def _attempt_servo_recovery(self, servo_id, pattern):
        """Attempt to recover a servo that has communication issues"""
        try:
            print(f"Attempting recovery for servo {servo_id}...")
            
            # 1. Check if servo is still responding
            try:
                ping_result, comm_result, _ = self.packet_handler.ping(servo_id)
                if comm_result != COMM_SUCCESS:
                    print(f"Servo {servo_id} not responding to ping")
                    return False
            except:
                print(f"Servo {servo_id} ping failed")
                return False
            
            # 2. Re-enable torque
            try:
                comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                if comm_result != COMM_SUCCESS:
                    print(f"Failed to re-enable torque for servo {servo_id}")
                    return False
            except Exception as e:
                print(f"Exception re-enabling torque for servo {servo_id}: {e}")
                return False
            
            # 3. Read current position to verify communication
            try:
                current_pos, comm_result, _ = self.packet_handler.ReadPos(servo_id)
                if comm_result == COMM_SUCCESS:
                    pattern["current_position"] = current_pos
                    print(f"Servo {servo_id} recovery successful, current position: {current_pos}")
                    return True
                else:
                    print(f"Failed to read position for servo {servo_id} during recovery")
                    return False
            except Exception as e:
                print(f"Exception reading position for servo {servo_id} during recovery: {e}")
                return False
                
        except Exception as e:
            print(f"Exception during servo {servo_id} recovery: {e}")
            return False

    def _group_continuous_movement_worker(self, servo_ids, patterns):
        """Worker thread for group continuous movement (using group sync write)"""
        try:
            print(f"[Group Thread] Starting group movement for servos: {servo_ids}")
            
            # Track active servos (servos that are still working)
            active_servos = set(servo_ids)
            failed_servos = set()
            
            # Ensure torque is enabled for all servos when the group thread starts with retry logic
            for servo_id in servo_ids:
                retry_count = 0
                max_retries = 5
                while retry_count < max_retries:
                    try:
                        comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                        if comm_result == COMM_SUCCESS:
                            print(f"[Group Thread] Torque enabled for servo {servo_id} after {retry_count + 1} attempts.")
                            break
                        else:
                            print(f"Warning: Failed to enable torque for servo {servo_id} (attempt {retry_count + 1}/{max_retries}): {self.packet_handler.getTxRxResult(comm_result)}")
                            retry_count += 1
                            time.sleep(0.05)  # Wait before retry
                    except Exception as e:
                        print(f"Exception enabling torque for servo {servo_id}: {e}")
                        retry_count += 1
                        time.sleep(0.05)
                
                if retry_count >= max_retries:
                    print(f"Error: Failed to enable torque for servo {servo_id} after {max_retries} attempts, removing from group")
                    active_servos.discard(servo_id)
                    failed_servos.add(servo_id)
                    continue
            
            # Set to Wheel Mode for rotation patterns with retry logic
            for servo_id in list(active_servos):
                if patterns[servo_id]["type"] == 'rotation':
                    retry_count = 0
                    max_retries = 5
                    while retry_count < max_retries:
                        try:
                            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_MODE, 1)
                            if comm_result == COMM_SUCCESS:
                                print(f"[Group Thread] Servo {servo_id} set to Wheel Mode (STS_MODE = 1) after {retry_count + 1} attempts.")
                                break
                            else:
                                print(f"Warning: Failed to set servo {servo_id} to Wheel Mode (attempt {retry_count + 1}/{max_retries}): {self.packet_handler.getTxRxResult(comm_result)}")
                                retry_count += 1
                                if retry_count < max_retries:
                                    time.sleep(0.05)
                        except Exception as e:
                            print(f"Exception setting servo {servo_id} to Wheel Mode: {e}")
                            retry_count += 1
                            if retry_count < max_retries:
                                time.sleep(0.05)
                    if retry_count >= max_retries:
                        print(f"Error: Failed to set servo {servo_id} to Wheel Mode after {max_retries} attempts, removing from group")
                        active_servos.discard(servo_id)
                        failed_servos.add(servo_id)
                        continue

            # Move all servos to initial positions using group sync write
            initial_configs = []
            for servo_id in list(active_servos):
                pattern = patterns[servo_id]
                if pattern["type"] == 'sweep':
                    initial_pos = pattern.get('start_position', 0)
                    initial_configs.append((servo_id, initial_pos, 100, 50, pattern["type"])) # Add pattern type
                elif pattern["type"] in ['rotation', 'wave']:
                    initial_pos = pattern.get('center_position', 2048)
                    initial_configs.append((servo_id, initial_pos, 100, 50, pattern["type"])) # Add pattern type
                else:
                    initial_pos = 2048  # Default center
                    initial_configs.append((servo_id, initial_pos, 100, 50, pattern["type"])) # Add pattern type
            
            # Execute initial position movement
            if initial_configs:
                try:
                    result = self.syncWrite(initial_configs)
                    if result != COMM_SUCCESS:
                        print(f"Warning: Initial position sync write failed: {result}")
                        # Continue anyway, individual servos might still work
                except Exception as e:
                    print(f"Error during initial position sync write: {e}")
            
            # Wait for initial movements to complete (only for positional movements)
            for servo_id in list(active_servos):
                pattern = patterns[servo_id]
                if pattern["type"] != 'rotation':  # Don't wait for rotation as it's continuous
                    try:
                        self._wait_for_servo_to_stop(servo_id, pattern.get("current_position", 2048))
                    except Exception as e:
                        print(f"Warning: Error waiting for servo {servo_id} to reach initial position: {e}")
                        # Remove from active servos if we can't communicate
                        active_servos.discard(servo_id)
                        failed_servos.add(servo_id)
            
            # Reset cycle count for all active servos
            for servo_id in active_servos:
                patterns[servo_id]["cycle_count"] = 0

            # Main movement loop
            while len(active_servos) > 0:
                # Check if any patterns should stop
                stopped_servos = []
                for servo_id in list(active_servos):
                    pattern = patterns[servo_id]
                    if not pattern.get("running", False):
                        stopped_servos.append(servo_id)
                        continue
                    
                    if pattern.get("paused", False):
                        continue
                    
                    # Check for cycle completion
                    if pattern.get("cycles", -1) > 0 and pattern.get("cycle_count", 0) >= pattern["cycles"]:
                        pattern["running"] = False
                        stopped_servos.append(servo_id)
                        print(f"[Group Thread] Servo {servo_id} completed {pattern['cycles']} cycles.")
                        continue
                
                # Remove stopped servos from active list
                for servo_id in stopped_servos:
                    active_servos.discard(servo_id)
                    print(f"[Group Thread] Servo {servo_id} removed from active group")
                
                # If no active servos remain, exit
                if len(active_servos) == 0:
                    print("[Group Thread] No active servos remaining, exiting group movement")
                    break
                
                # Execute movement step for all active servos
                try:
                    if self._execute_group_movement_step(active_servos, patterns):
                        # Update cycle counts for successful movements
                        for servo_id in active_servos:
                            if patterns[servo_id].get("running", False):
                                patterns[servo_id]["cycle_count"] = patterns[servo_id].get("cycle_count", 0) + 1
                    else:
                        # Some servos failed, check which ones
                        failed_this_step = self._check_group_communication_health(active_servos)
                        for servo_id in failed_this_step:
                            print(f"[Group Thread] Servo {servo_id} communication failed, removing from group")
                            active_servos.discard(servo_id)
                            failed_servos.add(servo_id)
                            
                            # Try to recover the servo
                            if self._attempt_servo_recovery(servo_id):
                                print(f"[Group Thread] Servo {servo_id} recovered, adding back to group")
                                active_servos.add(servo_id)
                                failed_servos.discard(servo_id)
                
                except Exception as e:
                    print(f"[Group Thread] Error during group movement step: {e}")
                    # Check all servos for communication issues
                    failed_this_step = self._check_group_communication_health(active_servos)
                    for servo_id in failed_this_step:
                        print(f"[Group Thread] Servo {servo_id} communication failed due to error, removing from group")
                        active_servos.discard(servo_id)
                        failed_servos.add(servo_id)
                
                # Small delay for smooth movement
                time.sleep(0.02)
            
            print(f"[Group Thread] Group movement completed. Active: {len(active_servos)}, Failed: {len(failed_servos)}")
            
        except Exception as e:
            print(f"Error in group movement worker: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("[Group Thread] Group movement worker thread terminating")
            # Clean up group thread references
            for servo_id in servo_ids:
                if servo_id in self.continuous_movement_threads:
                    del self.continuous_movement_threads[servo_id]

    def _execute_sweep_step(self, servo_id, pattern, next_position):
        """Execute one step of sweep movement"""
        # Use the centralized calculation method for consistency
        try:
            # ✅ Enhanced: Validate inputs before sending command
            if not isinstance(next_position, (int, float)) or next_position < 0 or next_position > 4095:
                print(f"Warning: Invalid position {next_position} for servo {servo_id}, using current position")
                next_position = pattern.get("current_position", 2048)
            
            speed = pattern.get("speed", 100)
            acceleration = pattern.get("acceleration", 50)
            
            # ✅ Enhanced: Validate speed and acceleration
            speed = max(0, min(1023, speed))
            acceleration = max(0, min(254, acceleration))
            
            comm_result, error = self.packet_handler.WritePosEx(servo_id, int(next_position), speed, acceleration)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Sweep WritePosEx for servo {servo_id} failed: {self.packet_handler.getTxRxResult(comm_result)}")
            else:
                # Update current_position after successful movement
                pattern["current_position"] = next_position
                print(f"Debug: Servo {servo_id} position updated: {pattern.get('current_position', 0)} -> {next_position}")
        except Exception as e:
            print(f"Error in sweep step for servo {servo_id}: {e}")
            # ✅ Enhanced: Don't stop the motor, just log the error
            # pattern["running"] = False  # Stop on error

    def _execute_rotation_step(self, servo_id, pattern):
        """Execute one step of rotation movement (continuous rotation)"""
        speed = pattern.get("speed", 100)

        # ✅ Enhanced: Validate speed input
        if not isinstance(speed, (int, float)):
            print(f"Warning: Invalid speed {speed} for servo {servo_id}, using default 100")
            speed = 100

        # Apply signed speed conversion: 0-1023 for CCW, 1024-2047 for CW
        effective_speed = abs(speed)
        if speed < 0:
            effective_speed += 1024 # Add 1024 for CW direction
        
        # ✅ Enhanced: Validate effective speed
        effective_speed = max(0, min(2047, effective_speed))
        acceleration = max(0, min(254, pattern.get("acceleration", 50)))
        
        # Use proper SDK method for speed control
        try:
            comm_result, error = self.packet_handler.WriteSpec(servo_id, effective_speed, acceleration)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Continuous rotation WriteSpec for servo {servo_id} failed: {self.packet_handler.getTxRxResult(comm_result)}")
            else:
                print(f"Debug: Servo {servo_id} rotation speed set to {effective_speed}")
        except Exception as e:
            print(f"Error in continuous rotation step for servo {servo_id}: {e}")
            # ✅ Enhanced: Don't stop the motor, just log the error
            # pattern["running"] = False # Stop on error

    def _execute_wave_step(self, servo_id, pattern, next_position):
        """Execute one step of wave movement"""
        # Use the centralized calculation method for consistency
        try:
            # ✅ Enhanced: Validate inputs before sending command
            if not isinstance(next_position, (int, float)) or next_position < 0 or next_position > 4095:
                print(f"Warning: Invalid position {next_position} for servo {servo_id}, using current position")
                next_position = pattern.get("current_position", 2048)
            
            speed = pattern.get("speed", 100)
            acceleration = pattern.get("acceleration", 50)
            
            # ✅ Enhanced: Validate speed and acceleration
            speed = max(0, min(1023, speed))
            acceleration = max(0, min(254, acceleration))
            
            comm_result, error = self.packet_handler.WritePosEx(servo_id, int(next_position), speed, acceleration)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Wave WritePosEx for servo {servo_id} failed: {self.packet_handler.getTxRxResult(comm_result)}")
            else:
                # Update current_position after successful movement
                pattern["current_position"] = next_position
                print(f"Debug: Servo {servo_id} wave position updated: {pattern.get('current_position', 0)} -> {next_position}")
        except Exception as e:
            print(f"Error in wave step for servo {servo_id}: {e}")
            # ✅ Enhanced: Don't stop the motor, just log the error
            # pattern["running"] = False  # Stop on error

    def syncWrite(self, servo_data):
        """Execute group sync write for multiple servos using centralized instances to prevent conflicts"""
        try:
            # Get centralized position writer with thread safety
            position_writer = self._get_group_sync_position_writer()
            if not position_writer:
                print("Error: Position writer not initialized")
                return COMM_TX_ERROR
            
            # Clear any existing parameters in the group sync write
            position_writer.clearParam()
            
            # Track which servos were successfully added
            added_servos = []
            failed_servos = []
            
            # Add parameters for each servo (don't return early on failures)
            for servo_id, position, speed, acceleration in servo_data:
                # Use the SDK's SyncWritePosEx method to add parameters
                result = self.packet_handler.SyncWritePosEx(servo_id, int(position), speed, acceleration)
                if result:
                    added_servos.append(servo_id)
                    print(f"Debug: Successfully added servo {servo_id} to group sync write")
                else:
                    failed_servos.append(servo_id)
                    print(f"Warning: Failed to add servo {servo_id} to group sync write")
            
            # If no servos were added, return error
            if not added_servos:
                print(f"Error: No servos were successfully added to group sync write")
                return COMM_TX_ERROR
            
            # Execute the group sync write with retry logic
            max_retries = 2
            for attempt in range(max_retries):
                result = position_writer.txPacket()
                if result == COMM_SUCCESS:
                    print(f"Debug: Group sync write executed successfully for {len(added_servos)} servos: {added_servos}")
                    if failed_servos:
                        print(f"Warning: Failed to add {len(failed_servos)} servos to group: {failed_servos}")
                    return result
                else:
                    if attempt < max_retries - 1:
                        print(f"Warning: Group sync write failed (attempt {attempt + 1}/{max_retries}): {result}")
                        time.sleep(0.05)  # Small delay before retry
                    else:
                        print(f"Warning: Group sync write failed after {max_retries} attempts: {result}")
            
            return result
            
        except Exception as e:
            print(f"Error in syncWrite: {e}")
            return COMM_TX_ERROR

    def syncWriteContinuousSpeed(self, servo_data):
        """Execute group sync write for multiple servos to control continuous speed using centralized instances"""
        try:
            # Get centralized speed writer with thread safety
            speed_writer = self._get_group_sync_speed_writer()
            if not speed_writer:
                print("Error: Speed writer not initialized")
                return COMM_TX_ERROR
            
            # Clear any existing parameters
            speed_writer.clearParam()

            # Track which servos were successfully added
            added_servos = []
            failed_servos = []

            for servo_id, speed in servo_data:
                # Apply signed speed conversion: 0-1023 for CCW, 1024-2047 for CW
                effective_speed = abs(speed)
                if speed < 0:
                    effective_speed += 1024  # Add 1024 for CW direction

                # Prepare 2-byte data for speed
                data_bytes = [
                    self.packet_handler.sts_lobyte(effective_speed),
                    self.packet_handler.sts_hibyte(effective_speed)
                ]
                
                result = speed_writer.addParam(servo_id, data_bytes)
                if result:
                    added_servos.append(servo_id)
                    print(f"Debug: Successfully added servo {servo_id} to continuous speed group sync write")
                else:
                    failed_servos.append(servo_id)
                    print(f"Warning: Failed to add servo {servo_id} (speed: {speed}) to group sync write for continuous speed")
            
            # If no servos were added, return error
            if not added_servos:
                print(f"Error: No servos were successfully added to continuous speed group sync write")
                return COMM_TX_ERROR
            
            max_retries = 2
            for attempt in range(max_retries):
                result = speed_writer.txPacket()
                if result == COMM_SUCCESS:
                    print(f"Debug: Group sync write for continuous speed executed successfully for {len(added_servos)} servos: {added_servos}")
                    if failed_servos:
                        print(f"Warning: Failed to add {len(failed_servos)} servos to continuous speed group: {failed_servos}")
                    return result
                else:
                    if attempt < max_retries - 1:
                        print(f"Warning: Group sync write for continuous speed failed (attempt {attempt + 1}/{max_retries}): {result}")
                        time.sleep(0.05)
                    else:
                        print(f"Warning: Group sync write for continuous speed failed after {max_retries} attempts: {result}")
            
            return result

        except Exception as e:
            print(f"Error in syncWriteContinuousSpeed: {e}")
            return COMM_TX_ERROR

    def _calculate_next_position(self, servo_id, pattern):
        """Calculate the next position for a servo based on its movement pattern"""
        try:
            # ✅ Enhanced: Validate pattern and current position
            if not isinstance(pattern, dict):
                print(f"Error: Invalid pattern for servo {servo_id}")
                return 2048
            
            current_pos = pattern.get("current_position", 2048)
            if not isinstance(current_pos, (int, float)) or current_pos < 0 or current_pos > 4095:
                print(f"Warning: Invalid current position {current_pos} for servo {servo_id}, using 2048")
                current_pos = 2048
            
            pattern_type = pattern.get("type", "sweep")
            
            if pattern_type == "sweep":
                return self._calculate_sweep_position(servo_id, pattern, current_pos)
            elif pattern_type == "rotation":
                # For continuous rotation, position is not directly controlled in this loop.
                # The speed is sent directly. So we just return the current position.
                return current_pos
            elif pattern_type == "wave":
                return self._calculate_wave_position(servo_id, pattern, current_pos)
            else:
                print(f"Warning: Unknown pattern type '{pattern_type}' for servo {servo_id}, maintaining current position")
                return current_pos  # Unknown pattern type, maintain current position
                
        except Exception as e:
            print(f"Error calculating next position for servo {servo_id}: {e}")
            import traceback
            traceback.print_exc()
            return pattern.get("current_position", 2048)
    
    def _calculate_sweep_position(self, servo_id, pattern, current_pos):
        """Calculate next position for sweep movement"""
        try:
            # ✅ Enhanced: Validate all inputs
            start_pos = pattern.get("start_position", 0)
            end_pos = pattern.get("end_position", 4095)
            speed = pattern.get("speed", 100)
            direction = pattern.get("direction", 1)
            
            # Validate inputs
            if not isinstance(start_pos, (int, float)) or start_pos < 0 or start_pos > 4095:
                start_pos = 0
            if not isinstance(end_pos, (int, float)) or end_pos < 0 or end_pos > 4095:
                end_pos = 4095
            if not isinstance(speed, (int, float)) or speed < 0:
                speed = 100
            if direction not in [1, -1]:
                direction = 1
            
            # Ensure start_pos <= end_pos
            if start_pos > end_pos:
                start_pos, end_pos = end_pos, start_pos
            
            # Determine next target position
            target_pos = current_pos
            if direction == 1:  # Forward
                if current_pos >= end_pos:
                    pattern["direction"] = -1
                    pattern["cycle_count"] = pattern.get("cycle_count", 0) + 1
                    target_pos = end_pos
                else:
                    target_pos = min(end_pos, current_pos + speed)
            else:  # Backward
                if current_pos <= start_pos:
                    pattern["direction"] = 1
                    pattern["cycle_count"] = pattern.get("cycle_count", 0) + 1
                    target_pos = start_pos
                else:
                    target_pos = max(start_pos, current_pos - speed)
            
            # Clamp target position to valid range
            target_pos = max(0, min(4095, target_pos))
            return target_pos
            
        except Exception as e:
            print(f"Error in sweep position calculation for servo {servo_id}: {e}")
            return current_pos
    
    def _calculate_rotation_position(self, servo_id, pattern, current_pos):
        """Calculate next position for rotation movement"""
        center_pos = pattern.get("center_position", 2048)
        radius = pattern.get("radius", 500)
        speed = pattern.get("speed", 100)
        angle = pattern.get("angle", 0)
        
        # Calculate next angle
        angle += speed * 0.01  # Convert speed to angular velocity
        pattern["angle"] = angle
        
        # Calculate new position using circular motion
        target_pos = center_pos + int(radius * math.sin(angle))
        
        # Clamp target position to valid range
        target_pos = max(0, min(4095, target_pos))
        return target_pos
    
    def _calculate_wave_position(self, servo_id, pattern, current_pos):
        """Calculate next position for wave movement"""
        center_pos = pattern.get("center_position", 2048)
        amplitude = pattern.get("amplitude", 500)
        frequency = pattern.get("frequency", 1.0)
        time_start = pattern.get("time_start", time.time())
        
        # Calculate current time and wave position
        current_time = time.time()
        elapsed_time = current_time - time_start
        
        # Calculate new position using sine wave
        target_pos = center_pos + int(amplitude * math.sin(2 * math.pi * frequency * elapsed_time))
        
        # Clamp target position to valid range
        target_pos = max(0, min(4095, target_pos))
        return target_pos

    def test_servo_communication(self, servo_id):
        """Test communication with a specific servo"""
        if not self.is_connected:
            return False
        
        try:
            print(f"Testing communication with servo {servo_id}...")
            
            # Test 1: Ping
            print(f"  [1/4] Testing ping...")
            model, comm_result, error = self.packet_handler.ping(servo_id)
            if comm_result != COMM_SUCCESS:
                print(f"    ❌ Ping failed: {self.packet_handler.getTxRxResult(comm_result)}")
                return False
            print(f"    ✅ Ping successful - Model: {model}")
            
            # Test 2: Read position
            print(f"  [2/4] Testing position read...")
            position, comm_result, error = self.packet_handler.ReadPos(servo_id)
            if comm_result != COMM_SUCCESS:
                print(f"    ❌ Position read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                return False
            print(f"    ✅ Position read successful - Position: {position}")
            
            # Test 3: Read torque status
            print(f"  [3/4] Testing torque status read...")
            torque_status, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_TORQUE_ENABLE)
            if comm_result != COMM_SUCCESS:
                print(f"    ❌ Torque status read failed: {self.packet_handler.getTxRxResult(comm_result)}")
                return False
            print(f"    ✅ Torque status read successful - Status: {torque_status}")
            
            # Test 4: Write torque enable (toggle and restore)
            print(f"  [4/4] Testing torque control...")
            original_torque = torque_status
            
            # Toggle torque off
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 0)
            if comm_result != COMM_SUCCESS:
                print(f"    ❌ Torque disable failed: {self.packet_handler.getTxRxResult(comm_result)}")
                return False
            print(f"    ✅ Torque disabled successfully")
            
            # Restore original torque state
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, original_torque)
            if comm_result != COMM_SUCCESS:
                print(f"    ❌ Torque restore failed: {self.packet_handler.getTxRxResult(comm_result)}")
                return False
            print(f"    ✅ Torque restored successfully")
            
            print(f"✅ All communication tests passed for servo {servo_id}")
            return True
            
        except Exception as e:
            print(f"❌ Communication test failed for servo {servo_id}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def recover_servo_communication(self, servo_ids):
        """Attempt to recover communication with multiple servos"""
        if not self.is_connected:
            return []
        
        recovered_servos = []
        
        for servo_id in servo_ids:
            try:
                print(f"Attempting to recover communication with servo {servo_id}...")
                
                # First try simple recovery
                if self._attempt_servo_recovery(servo_id):
                    recovered_servos.append(servo_id)
                    print(f"Servo {servo_id} recovered through simple recovery")
                    continue
                
                # If simple recovery fails, try full reset
                print(f"Simple recovery failed for servo {servo_id}, attempting full reset...")
                if self.reset_servo_communication(servo_id):
                    recovered_servos.append(servo_id)
                    print(f"Servo {servo_id} recovered through full reset")
                else:
                    print(f"Failed to recover servo {servo_id}")
                    
            except Exception as e:
                print(f"Error during recovery for servo {servo_id}: {e}")
                import traceback
                traceback.print_exc()
        
        return recovered_servos

    def reset_servo_communication(self, servo_id):
        """Reset communication with a specific servo"""
        if not self.is_connected:
            return False
        
        try:
            print(f"Resetting communication with servo {servo_id}...")
            
            # Stop any ongoing movement
            if servo_id in self.movement_patterns:
                self.stop_continuous_movement([servo_id])
            
            # Wait a moment for cleanup
            time.sleep(0.1)
            
            # Try to ping the servo
            model, comm_result, error = self.packet_handler.ping(servo_id)
            if comm_result != COMM_SUCCESS:
                print(f"Servo {servo_id} not responding to ping after reset")
                return False
            
            # Disable torque temporarily
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 0)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Failed to disable torque during reset: {self.packet_handler.getTxRxResult(comm_result)}")
            
            # Wait a moment
            time.sleep(0.1)
            
            # Re-enable torque
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Failed to re-enable torque after reset: {self.packet_handler.getTxRxResult(comm_result)}")
            
            # Test communication
            if self.test_servo_communication(servo_id):
                print(f"Communication reset successful for servo {servo_id}")
                return True
            else:
                print(f"Communication reset failed for servo {servo_id}")
                return False
                
        except Exception as e:
            print(f"Error during communication reset for servo {servo_id}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def check_servo_communication_health(self, servo_id):
        """Check the communication health of a specific servo"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            health_status = {
                "servo_id": servo_id,
                "ping_status": False,
                "position_read": False,
                "torque_control": False,
                "overall_health": "unknown"
            }
            
            # Test ping
            try:
                model, comm_result, error = self.packet_handler.ping(servo_id)
                if comm_result == COMM_SUCCESS:
                    health_status["ping_status"] = True
                    health_status["model"] = model
                else:
                    health_status["ping_error"] = self.packet_handler.getTxRxResult(comm_result)
            except Exception as e:
                health_status["ping_error"] = str(e)
            
            # Test position read
            try:
                position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                if comm_result == COMM_SUCCESS:
                    health_status["position_read"] = True
                    health_status["current_position"] = position
                else:
                    health_status["position_error"] = self.packet_handler.getTxRxResult(comm_result)
            except Exception as e:
                health_status["position_error"] = str(e)
            
            # Test torque control
            try:
                # Read current torque status
                torque_status, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_TORQUE_ENABLE)
                if comm_result == COMM_SUCCESS:
                    health_status["current_torque"] = torque_status
                    
                    # Try to toggle torque (disable and re-enable)
                    comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 0)
                    if comm_result == COMM_SUCCESS:
                        time.sleep(0.05)
                        comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, torque_status)
                        if comm_result == COMM_SUCCESS:
                            health_status["torque_control"] = True
                        else:
                            health_status["torque_restore_error"] = self.packet_handler.getTxRxResult(comm_result)
                    else:
                        health_status["torque_disable_error"] = self.packet_handler.getTxRxResult(comm_result)
                else:
                    health_status["torque_read_error"] = self.packet_handler.getTxRxResult(comm_result)
            except Exception as e:
                health_status["torque_error"] = str(e)
            
            # Determine overall health
            if health_status["ping_status"] and health_status["position_read"] and health_status["torque_control"]:
                health_status["overall_health"] = "excellent"
            elif health_status["ping_status"] and health_status["position_read"]:
                health_status["overall_health"] = "good"
            elif health_status["ping_status"]:
                health_status["overall_health"] = "poor"
            else:
                health_status["overall_health"] = "critical"
            
            health_status["success"] = True
            return health_status
            
        except Exception as e:
            return {
                "success": False,
                "servo_id": servo_id,
                "error": str(e),
                "overall_health": "error"
            }

    def verify_servo_positions(self):
        """Verify actual positions of all servos vs expected positions"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        verification_results = {}
        
        for servo_id, pattern in self.movement_patterns.items():
            if pattern.get("running", False):
                try:
                    # Read actual position
                    actual_pos, comm_result, error = self.packet_handler.ReadPos(servo_id)
                    expected_pos = pattern.get("current_position", "N/A")
                    
                    verification_results[servo_id] = {
                        "expected_position": expected_pos,
                        "actual_position": actual_pos if comm_result == COMM_SUCCESS else "Failed",
                        "communication_status": "OK" if comm_result == COMM_SUCCESS else f"Failed: {self.packet_handler.getTxRxResult(comm_result)}",
                        "position_difference": abs(actual_pos - expected_pos) if comm_result == COMM_SUCCESS and isinstance(expected_pos, (int, float)) else "N/A",
                        "pattern_type": pattern.get("type", "unknown"),
                        "running": pattern.get("running", False),
                        "paused": pattern.get("paused", False)
                    }
                    
                    # Check for significant position differences
                    if comm_result == COMM_SUCCESS and isinstance(expected_pos, (int, float)):
                        diff = abs(actual_pos - expected_pos)
                        if diff > 100:  # More than 100 units difference
                            print(f"Warning: Large position difference for servo {servo_id}: expected {expected_pos}, actual {actual_pos}, diff {diff}")
                            
                except Exception as e:
                    verification_results[servo_id] = {
                        "expected_position": pattern.get("current_position", "N/A"),
                        "actual_position": "Error",
                        "communication_status": f"Exception: {str(e)}",
                        "position_difference": "N/A",
                        "pattern_type": pattern.get("type", "unknown"),
                        "running": pattern.get("running", False),
                        "paused": pattern.get("paused", False)
                    }
                    print(f"Error verifying position for servo {servo_id}: {e}")
        
        return {
            "success": True,
            "verification_results": verification_results,
            "total_servos": len(verification_results),
            "timestamp": datetime.now().isoformat()
        }

    def cleanup_orphaned_threads(self):
        """Clean up orphaned threads and patterns"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        cleaned_count = 0
        orphaned_threads = []
        orphaned_patterns = []
        
        # Find orphaned threads (threads without corresponding patterns)
        for servo_id, thread in self.continuous_movement_threads.items():
            if servo_id not in self.movement_patterns:
                orphaned_threads.append(servo_id)
                print(f"Found orphaned thread for servo {servo_id}")
            elif not thread.is_alive():
                orphaned_threads.append(servo_id)
                print(f"Found dead thread for servo {servo_id}")
        
        # Find orphaned patterns (patterns without corresponding threads)
        for servo_id, pattern in self.movement_patterns.items():
            thread = self.continuous_movement_threads.get(servo_id)
            if thread is None or not thread.is_alive():
                if pattern.get("running", False):
                    orphaned_patterns.append(servo_id)
                    print(f"Found orphaned running pattern for servo {servo_id}")
        
        # Clean up orphaned threads
        for servo_id in orphaned_threads:
            try:
                thread = self.continuous_movement_threads[servo_id]
                if thread.is_alive():
                    thread.join(timeout=1.0)
                del self.continuous_movement_threads[servo_id]
                cleaned_count += 1
                print(f"Cleaned up orphaned thread for servo {servo_id}")
            except Exception as e:
                print(f"Error cleaning up thread for servo {servo_id}: {e}")
        
        # Clean up orphaned patterns
        for servo_id in orphaned_patterns:
            try:
                # Stop the pattern
                self.movement_patterns[servo_id]["running"] = False
                del self.movement_patterns[servo_id]
                cleaned_count += 1
                print(f"Cleaned up orphaned pattern for servo {servo_id}")
            except Exception as e:
                print(f"Error cleaning up pattern for servo {servo_id}: {e}")
        
        return {
            "success": True,
            "cleaned_count": cleaned_count,
            "orphaned_threads": orphaned_threads,
            "orphaned_patterns": orphaned_patterns
        }

    def get_comprehensive_servo_status(self, servo_id):
        """Get comprehensive status for a specific servo"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        if servo_id not in self.discovered_servos:
            return {"success": False, "error": "Servo not discovered"}
        
        try:
            status = {
                "servo_id": servo_id,
                "discovery_info": self.discovered_servos[servo_id],
                "communication_health": self.check_servo_communication_health(servo_id),
                "movement_status": None,
                "telemetry": {},
                "timestamp": datetime.now().isoformat()
            }
            
            # Get movement status if available
            if servo_id in self.movement_patterns:
                pattern = self.movement_patterns[servo_id]
                status["movement_status"] = {
                    "running": pattern.get("running", False),
                    "paused": pattern.get("paused", False),
                    "pattern_type": pattern.get("type", "unknown"),
                    "current_position": pattern.get("current_position", None),
                    "cycle_count": pattern.get("cycle_count", 0),
                    "target_cycles": pattern.get("cycles", -1)
                }
                
                # Check if thread is alive
                thread = self.continuous_movement_threads.get(servo_id)
                status["movement_status"]["thread_alive"] = thread.is_alive() if thread else False
            
            # Get basic telemetry
            try:
                # Read position
                position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["position"] = position
                
                # Read speed
                speed, comm_result, error = self.packet_handler.ReadSpeed(servo_id)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["speed"] = speed
                
                # Read moving status
                moving, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MOVING)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["moving"] = "Yes" if moving else "No"
                else:
                    status["telemetry"]["moving"] = "N/A"
                
                # Read voltage
                voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["voltage"] = round(voltage * 0.1, 2)
                else:
                    status["telemetry"]["voltage"] = "N/A"
                
                # Read temperature
                temperature, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["temperature"] = temperature
                else:
                    status["telemetry"]["temperature"] = "N/A"
                
                # Read goal position
                goal_position, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_POSITION_L)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["goal_position"] = goal_position
                else:
                    status["telemetry"]["goal_position"] = "N/A"
                
                # Read goal speed
                goal_speed, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_SPEED_L)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["goal_speed"] = goal_speed
                else:
                    status["telemetry"]["goal_speed"] = "N/A"
                
                # Read acceleration
                acceleration, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_ACC)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["acceleration"] = acceleration
                else:
                    status["telemetry"]["acceleration"] = "N/A"
                
                # Read mode (servo/motor)
                mode, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MODE)
                if comm_result == COMM_SUCCESS:
                    status["telemetry"]["mode"] = "Motor" if mode else "Servo"
                else:
                    status["telemetry"]["mode"] = "N/A"
            
            except Exception as e:
                status["telemetry"]["error"] = str(e)
            
            status["success"] = True
            return status
            
        except Exception as e:
            return {
                "success": False,
                "servo_id": servo_id,
                "error": str(e)
            }

    def _execute_group_movement_step(self, active_servos, patterns):
        """Execute one step of group movement for all active servos"""
        try:
            # Prepare movement data for different pattern types
            positional_movements = []
            rotation_speeds = []
            
            for servo_id in active_servos:
                pattern = patterns[servo_id]
                
                if pattern["type"] == "rotation":
                    # For rotation, set continuous speed
                    speed = pattern.get("speed", 100)
                    rotation_speeds.append((servo_id, speed))
                else:
                    # For positional movements, calculate next position
                    if pattern["type"] == "sweep":
                        next_pos = self._calculate_sweep_position(servo_id, pattern, pattern.get("current_position", 2048))
                    elif pattern["type"] == "wave":
                        next_pos = self._calculate_wave_position(servo_id, pattern, pattern.get("current_position", 2048))
                    else:
                        next_pos = pattern.get("current_position", 2048)
                    
                    # Update pattern with new position
                    pattern["current_position"] = next_pos
                    positional_movements.append((servo_id, next_pos, pattern.get("speed", 100), pattern.get("acceleration", 50)))
            
            # Execute positional movements
            if positional_movements:
                result = self.syncWrite(positional_movements)
                if result != COMM_SUCCESS:
                    print(f"Warning: Group positional movement failed: {result}")
                    return False
            
            # Execute rotation speed updates
            if rotation_speeds:
                result = self.syncWriteContinuousSpeed(rotation_speeds)
                if result != COMM_SUCCESS:
                    print(f"Warning: Group rotation speed update failed: {result}")
                    return False
            
            return True
            
        except Exception as e:
            print(f"Error in group movement step execution: {e}")
            return False
    
    def _check_group_communication_health(self, active_servos):
        """Check communication health for all active servos in a group"""
        failed_servos = []
        
        for servo_id in active_servos:
            try:
                # Try to read position as a communication test
                position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                if comm_result != COMM_SUCCESS:
                    print(f"Communication health check failed for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                    failed_servos.append(servo_id)
            except Exception as e:
                print(f"Exception during communication health check for servo {servo_id}: {e}")
                failed_servos.append(servo_id)
        
        return failed_servos

    def _check_communication_health_during_movement(self, servo_id, pattern):
        """Check communication health during movement and attempt recovery if needed - NEVER STOP THE MOTOR"""
        try:
            # Try to read position as a communication test
            position, comm_result, error = self.packet_handler.ReadPos(servo_id)
            if comm_result != COMM_SUCCESS:
                print(f"Warning: Communication health check failed for servo {servo_id}: {self.packet_handler.getTxRxResult(comm_result)}")
                
                # Attempt recovery - NEVER STOP THE MOTOR
                recovery_attempts = 0
                max_recovery_attempts = 3
                
                while recovery_attempts < max_recovery_attempts:
                    print(f"Attempting recovery for servo {servo_id} (attempt {recovery_attempts + 1}/{max_recovery_attempts})...")
                    
                    if self._attempt_servo_recovery(servo_id, pattern):
                        print(f"Communication recovered for servo {servo_id}, continuing movement")
                        return True
                    else:
                        recovery_attempts += 1
                        if recovery_attempts < max_recovery_attempts:
                            print(f"Recovery attempt {recovery_attempts} failed, retrying...")
                            time.sleep(0.1)  # Short delay before retry
                
                # Even if all recovery attempts fail, DON'T STOP THE MOTOR
                print(f"Warning: All recovery attempts failed for servo {servo_id}, but continuing movement anyway")
                return True  # Continue movement even with communication issues
            
            # Update current position if successful
            pattern["current_position"] = position
            return True
            
        except Exception as e:
            print(f"Exception during communication health check for servo {servo_id}: {e}")
            # DON'T STOP THE MOTOR - just log the error and continue
            print(f"Continuing movement for servo {servo_id} despite communication error")
            return True

    def get_all_servos_telemetry(self):
        """Get telemetry for all discovered servos efficiently"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        if not self.discovered_servos:
            return {"success": False, "error": "No servos discovered"}
        
        try:
            all_telemetry = {}
            timestamp = datetime.now().isoformat()
            
            for servo_id in self.discovered_servos.keys():
                try:
                    # Get basic telemetry with reduced retry attempts for efficiency
                    telemetry = {}
                    
                    # Position
                    try:
                        position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            telemetry["position"] = position
                            telemetry["angle"] = round((position - 2048) * 0.088, 2)
                    except:
                        telemetry["position"] = "N/A"
                    
                    # Moving status
                    try:
                        moving, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MOVING)
                        if comm_result == COMM_SUCCESS:
                            telemetry["moving"] = "Yes" if moving else "No"
                        else:
                            telemetry["moving"] = "N/A"
                    except:
                        telemetry["moving"] = "N/A"
                    
                    # Voltage
                    try:
                        voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                        if comm_result == COMM_SUCCESS:
                            telemetry["voltage"] = round(voltage * 0.1, 2)
                        else:
                            telemetry["voltage"] = "N/A"
                    except:
                        telemetry["voltage"] = "N/A"
                    
                    # Temperature
                    try:
                        temperature, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                        if comm_result == COMM_SUCCESS:
                            telemetry["temperature"] = temperature
                        else:
                            telemetry["temperature"] = "N/A"
                    except:
                        telemetry["temperature"] = "N/A"
                    
                    # Goal position
                    try:
                        goal_position, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_POSITION_L)
                        if comm_result == COMM_SUCCESS:
                            telemetry["goal_position"] = goal_position
                        else:
                            telemetry["goal_position"] = "N/A"
                    except:
                        telemetry["goal_position"] = "N/A"
                    
                    # Goal speed
                    try:
                        goal_speed, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_GOAL_SPEED_L)
                        if comm_result == COMM_SUCCESS:
                            telemetry["goal_speed"] = goal_speed
                        else:
                            telemetry["goal_speed"] = "N/A"
                    except:
                        telemetry["goal_speed"] = "N/A"
                    
                    # Acceleration
                    try:
                        acceleration, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_ACC)
                        if comm_result == COMM_SUCCESS:
                            telemetry["acceleration"] = acceleration
                        else:
                            telemetry["acceleration"] = "N/A"
                    except:
                        telemetry["acceleration"] = "N/A"
                    
                    # Mode (servo/motor)
                    try:
                        mode, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_MODE)
                        if comm_result == COMM_SUCCESS:
                            telemetry["mode"] = "Motor" if mode else "Servo"
                        else:
                            telemetry["mode"] = "N/A"
                    except:
                        telemetry["mode"] = "N/A"
                    
                    # Movement status if available
                    if servo_id in self.movement_patterns:
                        pattern = self.movement_patterns[servo_id]
                        telemetry["movement_status"] = {
                            "running": pattern.get("running", False),
                            "paused": pattern.get("paused", False),
                            "pattern_type": pattern.get("type", "unknown"),
                            "cycle_count": pattern.get("cycle_count", 0)
                        }
                    
                    # Add timestamp
                    telemetry["timestamp"] = timestamp
                    
                    all_telemetry[servo_id] = telemetry
                    
                except Exception as e:
                    all_telemetry[servo_id] = {
                        "error": str(e),
                        "timestamp": timestamp
                    }
            
            return {
                "success": True,
                "telemetry": all_telemetry,
                "total_servos": len(all_telemetry),
                "timestamp": timestamp
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    def monitor_and_recover_group_movements(self):
        """Monitor group movements and attempt to recover failed servos"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        recovered_count = 0
        failed_count = 0
        
        try:
            # Check for group movements that have failed servos
            group_servos = set()
            for servo_id, pattern in self.movement_patterns.items():
                if pattern.get("running", False):
                    # Check if this servo has a thread
                    thread = self.continuous_movement_threads.get(servo_id)
                    if thread is None or not thread.is_alive():
                        group_servos.add(servo_id)
            
            if not group_servos:
                return {"success": True, "message": "No group movements to monitor"}
            
            print(f"Monitoring {len(group_servos)} servos in group movements...")
            
            for servo_id in group_servos:
                try:
                    # Check communication health
                    if self._check_communication_health_during_movement(servo_id, self.movement_patterns[servo_id]):
                        print(f"Servo {servo_id} communication recovered")
                        recovered_count += 1
                        
                        # Restart movement if it was running
                        pattern = self.movement_patterns[servo_id]
                        if pattern.get("running", False):
                            # Create new thread for this servo
                            thread = threading.Thread(
                                target=self._continuous_movement_worker,
                                args=(servo_id, pattern),
                                daemon=True
                            )
                            self.continuous_movement_threads[servo_id] = thread
                            thread.start()
                            print(f"Restarted movement thread for servo {servo_id}")
                    else:
                        print(f"Servo {servo_id} communication recovery failed")
                        failed_count += 1
                        
                except Exception as e:
                    print(f"Error monitoring servo {servo_id}: {e}")
                    failed_count += 1
            
            return {
                "success": True,
                "recovered_count": recovered_count,
                "failed_count": failed_count,
                "total_monitored": len(group_servos)
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_real_time_movement_status(self):
        """Get real-time movement status for all servos with communication health"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            status = {
                "timestamp": datetime.now().isoformat(),
                "total_servos": len(self.discovered_servos),
                "active_movements": 0,
                "paused_movements": 0,
                "failed_movements": 0,
                "servo_status": {}
            }
            
            for servo_id in self.discovered_servos.keys():
                servo_status = {
                    "id": servo_id,
                    "discovered": True,
                    "movement": None,
                    "communication": "unknown",
                    "position": "N/A",
                    "voltage": "N/A",
                    "temperature": "N/A"
                }
                
                # Check movement status
                if servo_id in self.movement_patterns:
                    pattern = self.movement_patterns[servo_id]
                    servo_status["movement"] = {
                        "running": pattern.get("running", False),
                        "paused": pattern.get("paused", False),
                        "pattern_type": pattern.get("type", "unknown"),
                        "cycle_count": pattern.get("cycle_count", 0),
                        "current_position": pattern.get("current_position", "N/A")
                    }
                    
                    if pattern.get("running", False):
                        status["active_movements"] += 1
                    if pattern.get("paused", False):
                        status["paused_movements"] += 1
                
                # Check thread status
                thread = self.continuous_movement_threads.get(servo_id)
                if thread:
                    servo_status["thread_alive"] = thread.is_alive()
                    if not thread.is_alive() and servo_id in self.movement_patterns:
                        if self.movement_patterns[servo_id].get("running", False):
                            status["failed_movements"] += 1
                            servo_status["movement"]["status"] = "failed"
                
                # ✅ Enhanced: ULTRA-ROBUST communication test with maximum recovery mechanisms
                communication_attempts = 0
                max_communication_attempts = 5  # Increased from 3 to 5
                communication_success = False
                
                while communication_attempts < max_communication_attempts and not communication_success:
                    try:
                        # Try to read position as a communication test
                        position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            servo_status["communication"] = "excellent"
                            servo_status["position"] = position
                            communication_success = True
                            
                            # ✅ Enhanced: ULTRA-ROBUST voltage reading with maximum retry
                            voltage_read_success = False
                            for voltage_attempt in range(5):  # Increased from 2 to 5
                                try:
                                    voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                                    if comm_result == COMM_SUCCESS:
                                        servo_status["voltage"] = round(voltage * 0.1, 2)
                                        voltage_read_success = True
                                        break
                                    else:
                                        print(f"Debug: Voltage read failed for servo {servo_id} (attempt {voltage_attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                                        time.sleep(0.01)
                                except Exception as e:
                                    print(f"Debug: Voltage read exception for servo {servo_id} (attempt {voltage_attempt + 1}): {e}")
                                    time.sleep(0.01)
                            
                            if not voltage_read_success:
                                servo_status["voltage"] = "N/A"
                                print(f"Warning: All voltage read attempts failed for servo {servo_id}")
                            
                            # ✅ Enhanced: ULTRA-ROBUST temperature reading with maximum retry
                            temperature_read_success = False
                            for temp_attempt in range(5):  # Increased from 2 to 5
                                try:
                                    temperature, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                                    if comm_result == COMM_SUCCESS:
                                        servo_status["temperature"] = temperature
                                        temperature_read_success = True
                                        break
                                    else:
                                        print(f"Debug: Temperature read failed for servo {servo_id} (attempt {temp_attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                                        time.sleep(0.01)
                                except Exception as e:
                                    print(f"Debug: Temperature read exception for servo {servo_id} (attempt {temp_attempt + 1}): {e}")
                                    time.sleep(0.01)
                            
                            if not temperature_read_success:
                                servo_status["temperature"] = "N/A"
                                print(f"Warning: All temperature read attempts failed for servo {servo_id}")
                            
                            # ✅ Enhanced: ULTRA-ROBUST current reading with maximum retry
                            current_read_success = False
                            for current_attempt in range(5):  # Increased from 2 to 5
                                try:
                                    current, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_CURRENT_L)
                                    if comm_result == COMM_SUCCESS:
                                        servo_status["current"] = current
                                        current_read_success = True
                                        break
                                    else:
                                        print(f"Debug: Current read failed for servo {servo_id} (attempt {current_attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                                        time.sleep(0.01)
                                except Exception as e:
                                    print(f"Debug: Current read exception for servo {servo_id} (attempt {current_attempt + 1}): {e}")
                                    time.sleep(0.01)
                            
                            if not current_read_success:
                                servo_status["current"] = "N/A"
                                print(f"Warning: All current read attempts failed for servo {servo_id}")
                            
                            # ✅ Enhanced: ULTRA-ROBUST speed reading with maximum retry
                            speed_read_success = False
                            for speed_attempt in range(5):  # Increased from 2 to 5
                                try:
                                    speed, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_SPEED_L)
                                    if comm_result == COMM_SUCCESS:
                                        servo_status["speed"] = speed
                                        speed_read_success = True
                                        break
                                    else:
                                        print(f"Debug: Speed read failed for servo {servo_id} (attempt {speed_attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                                        time.sleep(0.01)
                                except Exception as e:
                                    print(f"Debug: Speed read exception for servo {servo_id} (attempt {speed_attempt + 1}): {e}")
                                    time.sleep(0.01)
                            
                            if not speed_read_success:
                                servo_status["speed"] = "N/A"
                                print(f"Warning: All speed read attempts failed for servo {servo_id}")
                            
                            # ✅ Enhanced: ULTRA-ROBUST torque reading with maximum retry
                            torque_read_success = False
                            for torque_attempt in range(5):  # Increased from 2 to 5
                                try:
                                    torque, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_TORQUE_ENABLE)
                                    if comm_result == COMM_SUCCESS:
                                        servo_status["torque"] = torque
                                        torque_read_success = True
                                        break
                                    else:
                                        print(f"Debug: Torque read failed for servo {servo_id} (attempt {torque_attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                                        time.sleep(0.01)
                                except Exception as e:
                                    print(f"Debug: Torque read exception for servo {servo_id} (attempt {torque_attempt + 1}): {e}")
                                    time.sleep(0.01)
                            
                            if not torque_read_success:
                                servo_status["torque"] = "N/A"
                                print(f"Warning: All torque read attempts failed for servo {servo_id}")
                            
                            break  # Success, exit retry loop
                        else:
                            communication_attempts += 1
                            print(f"Debug: Communication failed for servo {servo_id} (attempt {communication_attempts}/{max_communication_attempts}): {self.packet_handler.getTxRxResult(comm_result)}")
                            
                            # ✅ Enhanced: Attempt robust recovery before next retry
                            if communication_attempts < max_communication_attempts:
                                print(f"Debug: Attempting robust communication recovery for servo {servo_id}...")
                                self._robust_servo_communication_recovery(servo_id)
                                time.sleep(0.05)  # Wait before retry
                            
                    except Exception as e:
                        communication_attempts += 1
                        print(f"Debug: Communication exception for servo {servo_id} (attempt {communication_attempts}/{max_communication_attempts}): {e}")
                        
                        if communication_attempts < max_communication_attempts:
                            time.sleep(0.05)  # Wait before retry
                
                # ✅ Enhanced: Handle communication failure after all attempts
                if not communication_success:
                    servo_status["communication"] = "failed"
                    servo_status["communication_error"] = f"Failed after {max_communication_attempts} attempts"
                    servo_status["position"] = "N/A"
                    servo_status["voltage"] = "N/A"
                    servo_status["temperature"] = "N/A"
                    servo_status["current"] = "N/A"
                    servo_status["speed"] = "N/A"
                    servo_status["torque"] = "N/A"
                    print(f"Warning: Communication completely failed for servo {servo_id} after {max_communication_attempts} attempts")
                
                status["servo_status"][servo_id] = servo_status
            
            return status
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_servo_offset(self, servo_id, offset):
        """Set servo offset (middle position) - ST3020 specific feature"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Unlock EPROM first
            comm_result, error = self.packet_handler.unLockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to unlock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)  # Small delay for EPROM unlock
            
            # Write offset value (16-bit)
            comm_result, error = self.packet_handler.write2ByteTxRx(servo_id, STS_OFS_L, offset)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to set offset: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)  # Small delay for write
            
            # Lock EPROM
            comm_result, error = self.packet_handler.LockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to lock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            return {"success": True, "message": f"Offset set to {offset} for servo {servo_id}"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_angle_limits(self, servo_id, min_angle, max_angle):
        """Set servo angle limits - ST3020 specific feature"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Unlock EPROM first
            comm_result, error = self.packet_handler.unLockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to unlock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)
            
            # Set minimum angle limit
            comm_result, error = self.packet_handler.write2ByteTxRx(servo_id, STS_MIN_ANGLE_LIMIT_L, min_angle)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to set min angle: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.05)
            
            # Set maximum angle limit
            comm_result, error = self.packet_handler.write2ByteTxRx(servo_id, STS_MAX_ANGLE_LIMIT_L, max_angle)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to set max angle: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)
            
            # Lock EPROM
            comm_result, error = self.packet_handler.LockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to lock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            return {"success": True, "message": f"Angle limits set to {min_angle}-{max_angle} for servo {servo_id}"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_dead_zone(self, servo_id, cw_dead, ccw_dead):
        """Set servo dead zone - ST3020 specific feature"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            # Unlock EPROM first
            comm_result, error = self.packet_handler.unLockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to unlock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)
            
            # Set CW dead zone
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_CW_DEAD, cw_dead)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to set CW dead zone: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.05)
            
            # Set CCW dead zone
            comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_CCW_DEAD, ccw_dead)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to set CCW dead zone: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            time.sleep(0.1)
            
            # Lock EPROM
            comm_result, error = self.packet_handler.LockEprom(servo_id)
            if comm_result != COMM_SUCCESS:
                return {"success": False, "error": f"Failed to lock EPROM: {self.packet_handler.getTxRxResult(comm_result)}"}
            
            return {"success": True, "message": f"Dead zone set to CW:{cw_dead}, CCW:{ccw_dead} for servo {servo_id}"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_servo_config(self, servo_id):
        """Get servo configuration including offset, limits, dead zone - ST3020 specific"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
            
        try:
            config = {}
            
            # Read offset
            offset, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_OFS_L)
            if comm_result == COMM_SUCCESS:
                config["offset"] = offset
            else:
                config["offset"] = None
                config["offset_error"] = self.packet_handler.getTxRxResult(comm_result)
            
            # Read angle limits
            min_angle, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_MIN_ANGLE_LIMIT_L)
            if comm_result == COMM_SUCCESS:
                config["min_angle"] = min_angle
            else:
                config["min_angle"] = None
                config["min_angle_error"] = self.packet_handler.getTxRxResult(comm_result)
            
            max_angle, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_MAX_ANGLE_LIMIT_L)
            if comm_result == COMM_SUCCESS:
                config["max_angle"] = max_angle
            else:
                config["max_angle"] = None
                config["max_angle_error"] = self.packet_handler.getTxRxResult(comm_result)
            
            # Read dead zones
            cw_dead, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_CW_DEAD)
            if comm_result == COMM_SUCCESS:
                config["cw_dead"] = cw_dead
            else:
                config["cw_dead"] = None
                config["cw_dead_error"] = self.packet_handler.getTxRxResult(comm_result)
            
            ccw_dead, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_CCW_DEAD)
            if comm_result == COMM_SUCCESS:
                config["ccw_dead"] = ccw_dead
            else:
                config["ccw_dead"] = None
                config["ccw_dead_error"] = self.packet_handler.getTxRxResult(comm_result)
            
            return {"success": True, "config": config, "servo_id": servo_id}
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    def start_periodic_monitoring(self):
        """Start periodic monitoring of all active movements"""
        if hasattr(self, 'monitoring_thread') and self.monitoring_thread and self.monitoring_thread.is_alive():
            print("Monitoring thread already running")
            return {"success": True, "message": "Monitoring already active"}
        
        self.monitoring_active = True
        self.monitoring_thread = threading.Thread(target=self._monitoring_worker, daemon=True)
        self.monitoring_thread.start()
        print("Periodic monitoring started")
        return {"success": True, "message": "Periodic monitoring started"}
    
    def stop_periodic_monitoring(self):
        """Stop periodic monitoring"""
        self.monitoring_active = False
        if hasattr(self, 'monitoring_thread') and self.monitoring_thread:
            self.monitoring_thread.join(timeout=2.0)
        print("Periodic monitoring stopped")
        return {"success": True, "message": "Periodic monitoring stopped"}
    
    def _monitoring_worker(self):
        """Worker thread for periodic monitoring of all active movements"""
        print("Starting periodic monitoring worker")
        
        while self.monitoring_active:
            try:
                # Check all active movements
                active_servos = []
                for servo_id, pattern in self.movement_patterns.items():
                    if pattern.get("running", False):
                        active_servos.append(servo_id)
                
                if active_servos:
                    print(f"Monitoring {len(active_servos)} active servos: {active_servos}")
                    
                    # Check each active servo
                    for servo_id in active_servos:
                        try:
                            # Check if thread is alive
                            thread = self.continuous_movement_threads.get(servo_id)
                            if thread is None or not thread.is_alive():
                                print(f"Warning: Servo {servo_id} movement thread is dead, attempting recovery...")
                                
                                # Attempt to recover the servo
                                pattern = self.movement_patterns[servo_id]
                                if self._attempt_servo_recovery(servo_id, pattern):
                                    # Restart the movement thread
                                    new_thread = threading.Thread(
                                        target=self._continuous_movement_worker,
                                        args=(servo_id, pattern),
                                        daemon=True
                                    )
                                    self.continuous_movement_threads[servo_id] = new_thread
                                    new_thread.start()
                                    print(f"Successfully restarted movement thread for servo {servo_id}")
                                else:
                                    print(f"Failed to recover servo {servo_id}, marking as stopped")
                                    pattern["running"] = False
                            
                            # Check communication health
                            if not self._check_communication_health_during_movement(servo_id, pattern):
                                print(f"Warning: Servo {servo_id} communication health check failed during monitoring")
                                if not self._attempt_servo_recovery(servo_id, pattern):
                                    print(f"Failed to recover servo {servo_id} during monitoring, stopping movement")
                                    pattern["running"] = False
                                    
                        except Exception as e:
                            print(f"Error monitoring servo {servo_id}: {e}")
                
                # Sleep for monitoring interval (5 seconds)
                time.sleep(5)
                
            except Exception as e:
                print(f"Error in monitoring worker: {e}")
                time.sleep(5)  # Continue monitoring even if there's an error
        
        print("Periodic monitoring worker stopped")

    def _robust_servo_communication_recovery(self, servo_id):
        """Enhanced robust communication recovery for a specific servo to prevent N/A values"""
        try:
            print(f"Debug: Starting ENHANCED robust communication recovery for servo {servo_id}")
            
            # ✅ Enhanced: Multiple recovery strategies with increased attempts
            recovery_strategies = [
                self._recovery_strategy_ping,
                self._recovery_strategy_torque_reset,
                self._recovery_strategy_baudrate_check,
                self._recovery_strategy_voltage_reset,
                self._recovery_strategy_position_hold
            ]
            
            for strategy_index, strategy in enumerate(recovery_strategies):
                print(f"Debug: Trying recovery strategy {strategy_index + 1}/{len(recovery_strategies)} for servo {servo_id}")
                
                for attempt in range(3):  # Try each strategy up to 3 times
                    try:
                        if strategy(servo_id):
                            print(f"Debug: Recovery strategy {strategy_index + 1} successful for servo {servo_id}")
                            return True
                        else:
                            print(f"Debug: Recovery strategy {strategy_index + 1} failed for servo {servo_id} (attempt {attempt + 1})")
                            time.sleep(0.05)  # Brief delay between attempts
                    except Exception as e:
                        print(f"Debug: Exception in recovery strategy {strategy_index + 1} for servo {servo_id}: {e}")
                        time.sleep(0.05)
                
                time.sleep(0.1)  # Delay between strategies
            
            print(f"Warning: All recovery strategies failed for servo {servo_id}")
            return False
            
        except Exception as e:
            print(f"Error in enhanced robust communication recovery for servo {servo_id}: {e}")
            return False
    
    def _recovery_strategy_ping(self, servo_id):
        """Recovery strategy 1: Ping test with multiple attempts"""
        for attempt in range(5):  # Increased attempts
            try:
                model, comm_result, error = self.packet_handler.ping(servo_id)
                if comm_result == COMM_SUCCESS:
                    print(f"Debug: Ping successful for servo {servo_id} (attempt {attempt + 1})")
                    return True
                else:
                    print(f"Debug: Ping failed for servo {servo_id} (attempt {attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                    time.sleep(0.02)
            except Exception as e:
                print(f"Debug: Ping exception for servo {servo_id} (attempt {attempt + 1}): {e}")
                time.sleep(0.02)
        return False
    
    def _recovery_strategy_torque_reset(self, servo_id):
        """Recovery strategy 2: Enhanced torque reset with multiple cycles"""
        try:
            # Multiple torque reset cycles
            for cycle in range(3):
                print(f"Debug: Torque reset cycle {cycle + 1} for servo {servo_id}")
                
                # Disable torque
                comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 0)
                if comm_result == COMM_SUCCESS:
                    print(f"Debug: Torque disabled for servo {servo_id} (cycle {cycle + 1})")
                    time.sleep(0.1)
                    
                    # Re-enable torque
                    comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_TORQUE_ENABLE, 1)
                    if comm_result == COMM_SUCCESS:
                        print(f"Debug: Torque re-enabled for servo {servo_id} (cycle {cycle + 1})")
                        
                        # Test communication after torque reset
                        position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                        if comm_result == COMM_SUCCESS:
                            print(f"Debug: Communication verified after torque reset for servo {servo_id}")
                            return True
                        else:
                            print(f"Debug: Communication still failed after torque reset for servo {servo_id}")
                    else:
                        print(f"Debug: Failed to re-enable torque for servo {servo_id} (cycle {cycle + 1})")
                else:
                    print(f"Debug: Failed to disable torque for servo {servo_id} (cycle {cycle + 1})")
                
                time.sleep(0.1)
            
            return False
        except Exception as e:
            print(f"Debug: Exception during torque reset for servo {servo_id}: {e}")
            return False
    
    def _recovery_strategy_baudrate_check(self, servo_id):
        """Recovery strategy 3: Check and reset baudrate if needed"""
        try:
            # Try to read baudrate
            baudrate, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_BAUD_RATE)
            if comm_result == COMM_SUCCESS:
                print(f"Debug: Current baudrate for servo {servo_id}: {baudrate}")
                
                # If baudrate is not correct, try to set it
                if baudrate != 1:  # Assuming 1 is the correct baudrate for 1000000
                    print(f"Debug: Attempting to correct baudrate for servo {servo_id}")
                    comm_result, error = self.packet_handler.write1ByteTxRx(servo_id, STS_BAUD_RATE, 1)
                    if comm_result == COMM_SUCCESS:
                        print(f"Debug: Baudrate corrected for servo {servo_id}")
                        time.sleep(0.1)
                        return True
            else:
                print(f"Debug: Could not read baudrate for servo {servo_id}")
            
            return False
        except Exception as e:
            print(f"Debug: Exception during baudrate check for servo {servo_id}: {e}")
            return False
    
    def _recovery_strategy_voltage_reset(self, servo_id):
        """Recovery strategy 4: Try to read voltage with multiple attempts"""
        for attempt in range(5):  # Increased attempts
            try:
                voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                if comm_result == COMM_SUCCESS:
                    voltage_v = round(voltage * 0.1, 2)
                    print(f"Debug: Voltage read successful for servo {servo_id}: {voltage_v}V (attempt {attempt + 1})")
                    return True
                else:
                    print(f"Debug: Voltage read failed for servo {servo_id} (attempt {attempt + 1}): {self.packet_handler.getTxRxResult(comm_result)}")
                    time.sleep(0.02)
            except Exception as e:
                print(f"Debug: Voltage read exception for servo {servo_id} (attempt {attempt + 1}): {e}")
                time.sleep(0.02)
        return False
    
    def _recovery_strategy_position_hold(self, servo_id):
        """Recovery strategy 5: Try to read and hold position"""
        try:
            # Try to read current position
            position, comm_result, error = self.packet_handler.ReadPos(servo_id)
            if comm_result == COMM_SUCCESS:
                print(f"Debug: Position read successful for servo {servo_id}: {position}")
                
                # Try to hold current position
                comm_result, error = self.packet_handler.WritePosEx(servo_id, int(position), 0, 0)
                if comm_result == COMM_SUCCESS:
                    print(f"Debug: Position hold successful for servo {servo_id}")
                    return True
                else:
                    print(f"Debug: Position hold failed for servo {servo_id}")
            else:
                print(f"Debug: Position read failed for servo {servo_id}")
            
            return False
        except Exception as e:
            print(f"Debug: Exception during position hold for servo {servo_id}: {e}")
            return False

    def force_communication_recovery(self, servo_ids=None):
        """Force communication recovery for specific servos or all servos"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            if servo_ids is None:
                # Recover all discovered servos
                servo_ids = list(self.discovered_servos.keys())
            
            results = {}
            recovered_count = 0
            
            for servo_id in servo_ids:
                print(f"Debug: Force communication recovery for servo {servo_id}")
                
                # Try multiple recovery cycles
                recovery_success = False
                for cycle in range(3):
                    print(f"Debug: Recovery cycle {cycle + 1} for servo {servo_id}")
                    
                    if self._robust_servo_communication_recovery(servo_id):
                        recovery_success = True
                        print(f"Debug: Recovery successful for servo {servo_id} on cycle {cycle + 1}")
                        break
                    else:
                        print(f"Debug: Recovery failed for servo {servo_id} on cycle {cycle + 1}")
                        time.sleep(0.2)  # Wait between cycles
                
                if recovery_success:
                    recovered_count += 1
                    results[servo_id] = {"success": True, "message": "Recovery successful"}
                else:
                    results[servo_id] = {"success": False, "message": "Recovery failed after 3 cycles"}
            
            return {
                "success": True,
                "recovered_count": recovered_count,
                "total_servos": len(servo_ids),
                "results": results
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_communication_statistics(self):
        """Get communication statistics for all servos"""
        if not self.is_connected:
            return {"success": False, "error": "Not connected"}
        
        try:
            stats = {
                "total_servos": len(self.discovered_servos),
                "communication_status": {},
                "n_a_count": 0,
                "excellent_count": 0,
                "poor_count": 0,
                "failed_count": 0
            }
            
            for servo_id in self.discovered_servos.keys():
                servo_stats = {
                    "servo_id": servo_id,
                    "communication_quality": "unknown",
                    "n_a_values": 0,
                    "last_successful_read": None
                }
                
                # Test communication
                try:
                    # Test position read
                    position, comm_result, error = self.packet_handler.ReadPos(servo_id)
                    if comm_result == COMM_SUCCESS:
                        servo_stats["last_successful_read"] = "position"
                        
                        # Test voltage read
                        voltage, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_VOLTAGE)
                        if comm_result != COMM_SUCCESS:
                            servo_stats["n_a_values"] += 1
                        
                        # Test temperature read
                        temperature, comm_result, error = self.packet_handler.read1ByteTxRx(servo_id, STS_PRESENT_TEMPERATURE)
                        if comm_result != COMM_SUCCESS:
                            servo_stats["n_a_values"] += 1
                        
                        # Test current read
                        current, comm_result, error = self.packet_handler.read2ByteTxRx(servo_id, STS_PRESENT_CURRENT_L)
                        if comm_result != COMM_SUCCESS:
                            servo_stats["n_a_values"] += 1
                        
                        # Determine communication quality
                        if servo_stats["n_a_values"] == 0:
                            servo_stats["communication_quality"] = "excellent"
                            stats["excellent_count"] += 1
                        elif servo_stats["n_a_values"] <= 2:
                            servo_stats["communication_quality"] = "good"
                        else:
                            servo_stats["communication_quality"] = "poor"
                            stats["poor_count"] += 1
                        
                        stats["n_a_count"] += servo_stats["n_a_values"]
                    else:
                        servo_stats["communication_quality"] = "failed"
                        stats["failed_count"] += 1
                        
                except Exception as e:
                    servo_stats["communication_quality"] = "failed"
                    servo_stats["error"] = str(e)
                    stats["failed_count"] += 1
                
                stats["communication_status"][servo_id] = servo_stats
            
            return {"success": True, "statistics": stats}
            
        except Exception as e:
            return {"success": False, "error": str(e)}

# Global servo controller instance
servo_ctrl = ServoController()

# API Routes
@app.route('/api/connect', methods=['POST'])
def api_connect():
    data = request.json
    port = data.get('port', 'COM7')
    baudrate = int(data.get('baudrate', 1000000))
    
    result = servo_ctrl.connect(port, baudrate)
    if result["success"]:
        connection_status.update({
            "connected": True,
            "port": port,
            "baudrate": baudrate
        })
    
    return jsonify(result)

@app.route('/api/disconnect', methods=['POST'])
def api_disconnect():
    result = servo_ctrl.disconnect()
    connection_status.update({
        "connected": False,
        "port": "",
        "baudrate": 0
    })
    return jsonify(result)

@app.route('/api/discover', methods=['POST'])
def api_discover():
    data = request.json
    start_id = int(data.get('start_id', 0))
    end_id = int(data.get('end_id', 20))
    
    result = servo_ctrl.discover_servos(start_id, end_id)
    return jsonify(result)

@app.route('/api/telemetry/<int:servo_id>', methods=['GET'])
def api_telemetry(servo_id):
    result = servo_ctrl.get_servo_telemetry(servo_id)
    return jsonify(result)

@app.route('/api/position', methods=['POST'])
def api_set_position():
    data = request.json
    servo_id = int(data.get('servo_id'))
    position = int(data.get('position'))
    speed = int(data.get('speed', 100))
    acceleration = int(data.get('acceleration', 50))
    
    result = servo_ctrl.set_servo_position(servo_id, position, speed, acceleration)
    return jsonify(result)

@app.route('/api/speed', methods=['POST'])
def api_set_speed():
    data = request.json
    servo_id = int(data.get('servo_id'))
    speed = int(data.get('speed'))
    
    result = servo_ctrl.set_servo_speed(servo_id, speed)
    return jsonify(result)

@app.route('/api/acceleration', methods=['POST'])
def api_set_acceleration():
    data = request.json
    servo_id = int(data.get('servo_id'))
    acceleration = int(data.get('acceleration'))
    
    result = servo_ctrl.set_servo_acceleration(servo_id, acceleration)
    return jsonify(result)

@app.route('/api/speed-acceleration', methods=['POST'])
def api_set_speed_acceleration():
    data = request.json
    servo_id = int(data.get('servo_id'))
    speed = int(data.get('speed'))
    acceleration = int(data.get('acceleration'))
    
    result = servo_ctrl.set_servo_speed_and_acceleration(servo_id, speed, acceleration)
    return jsonify(result)

@app.route('/api/enable-torque/<int:servo_id>', methods=['POST'])
def api_enable_torque(servo_id):
    result = servo_ctrl.enable_torque(servo_id)
    return jsonify(result)

@app.route('/api/disable-torque/<int:servo_id>', methods=['POST'])
def api_disable_torque(servo_id):
    result = servo_ctrl.disable_torque(servo_id)
    return jsonify(result)

@app.route('/api/change_id', methods=['POST'])
def api_change_id():
    data = request.json
    old_id = int(data.get('old_id'))
    new_id = int(data.get('new_id'))
    
    result = servo_ctrl.change_servo_id(old_id, new_id)
    return jsonify(result)

@app.route('/api/check_id_availability/<int:servo_id>', methods=['GET'])
def api_check_id_availability(servo_id):
    """Check if a servo ID is available (not in use)"""
    if not servo_ctrl.is_connected:
        return jsonify({"success": False, "error": "Not connected"})
    
    try:
        # Try to ping the servo ID
        model, comm_result, error = servo_ctrl.packet_handler.ping(servo_id)
        if comm_result == COMM_SUCCESS:
            return jsonify({
                "success": True, 
                "available": False, 
                "message": f"ID {servo_id} is already in use by servo model {model}"
            })
        else:
            return jsonify({
                "success": True, 
                "available": True, 
                "message": f"ID {servo_id} is available"
            })
    except Exception as e:
        return jsonify({
            "success": False, 
            "error": f"Error checking ID availability: {str(e)}"
        })

@app.route('/api/ping/<int:servo_id>', methods=['GET'])
def api_ping(servo_id):
    result = servo_ctrl.ping_servo(servo_id)
    return jsonify(result)

@app.route('/api/continuous-movement/start', methods=['POST'])
def api_start_continuous_movement():
    """Start continuous movement with angle constraints support"""
    try:
        data = request.json
        movement_configs = data.get('movement_configs', [])
        
        if not movement_configs:
            return jsonify({"success": False, "error": "No movement configurations provided"}), 400
        
        result = servo_ctrl.start_continuous_movement(movement_configs)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/continuous-movement/enable-angle-constraints', methods=['POST'])
def api_enable_angle_constraints():
    """Enable angle constraints for running continuous movements"""
    try:
        data = request.json
        servo_ids = data.get('servo_ids', [])
        min_angle = data.get('min_angle')
        max_angle = data.get('max_angle')
        enabled = data.get('enabled', True)
        
        if not servo_ids:
            return jsonify({"success": False, "error": "No servo IDs provided"}), 400
        
        if enabled and (min_angle is None or max_angle is None):
            return jsonify({"success": False, "error": "min_angle and max_angle required when enabling constraints"}), 400
        
        results = []
        for servo_id in servo_ids:
            if servo_id in servo_ctrl.movement_patterns:
                # Update the pattern with new angle constraints
                servo_ctrl.movement_patterns[servo_id]["angle_constraints"] = {
                    "enabled": enabled,
                    "min_angle": min_angle,
                    "max_angle": max_angle
                }
                
                # Apply angle limits to servo if enabling
                if enabled:
                    constraint_result = servo_ctrl.set_angle_limits(servo_id, min_angle, max_angle)
                    if constraint_result.get("success"):
                        results.append({"servo_id": servo_id, "success": True, "message": "Angle constraints enabled"})
                    else:
                        results.append({"servo_id": servo_id, "success": False, "error": constraint_result.get("error")})
                else:
                    results.append({"servo_id": servo_id, "success": True, "message": "Angle constraints disabled"})
            else:
                results.append({"servo_id": servo_id, "success": False, "error": "No active movement for this servo"})
        
        return jsonify({"success": True, "results": results})
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/continuous-movement/angle-constraints-status', methods=['GET'])
def api_get_angle_constraints_status():
    """Get current angle constraints status for all running movements"""
    try:
        status = {}
        for servo_id, pattern in servo_ctrl.movement_patterns.items():
            if pattern.get("running", False):
                angle_constraints = pattern.get("angle_constraints", {})
                status[servo_id] = {
                    "enabled": angle_constraints.get("enabled", False),
                    "min_angle": angle_constraints.get("min_angle"),
                    "max_angle": angle_constraints.get("max_angle"),
                    "current_position": pattern.get("current_position", 0),
                    "pattern_type": pattern.get("type", "unknown")
                }
        
        return jsonify({"success": True, "angle_constraints": status})
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/continuous-movement/stop', methods=['POST'])
def api_stop_continuous_movement():
    data = request.json
    # This endpoint still expects a flat list of servo_ids, as stopping doesn't need pattern info
    servo_ids = data.get('servo_ids', [])  # Expecting a list of servo IDs

    if not isinstance(servo_ids, list):
        return jsonify({"success": False, "error": "'servo_ids' must be a list"}), 400

    results = []
    for servo_id in servo_ids:
        result = servo_ctrl.stop_continuous_movement([servo_id]) # Pass as list to the method
        results.append({"servo_id": servo_id, "result": result})
    
    return jsonify({"success": True, "results": results})

@app.route('/api/continuous-movement/pause', methods=['POST'])
def api_pause_continuous_movement():
    data = request.json
    servo_ids = data.get('servo_ids', [])  # Expecting a list of servo IDs

    if not isinstance(servo_ids, list):
        return jsonify({"success": False, "error": "'servo_ids' must be a list"}), 400

    results = []
    for servo_id in servo_ids:
        result = servo_ctrl.pause_continuous_movement([servo_id]) # Pass as list to the method
        results.append({"servo_id": servo_id, "result": result})
    
    return jsonify({"success": True, "results": results})

@app.route('/api/continuous-movement/resume', methods=['POST'])
def api_resume_continuous_movement():
    data = request.json
    servo_ids = data.get('servo_ids', [])  # Expecting a list of servo IDs

    if not isinstance(servo_ids, list):
        return jsonify({"success": False, "error": "'servo_ids' must be a list"}), 400

    results = []
    for servo_id in servo_ids:
        result = servo_ctrl.resume_continuous_movement([servo_id]) # Pass as list to the method
        results.append({"servo_id": servo_id, "result": result})
    
    return jsonify({"success": True, "results": results})

@app.route('/api/continuous-movement/status/<int:servo_id>', methods=['GET'])
def api_get_movement_status(servo_id):
    result = servo_ctrl.get_movement_status(servo_id)
    return jsonify(result)

@app.route('/api/continuous-movement/all-status', methods=['GET'])
def api_get_all_movement_status():
    result = servo_ctrl.get_all_movement_status()
    return jsonify(result)

@app.route('/api/continuous-movement/force-stop-all', methods=['POST'])
def api_force_stop_all_movements():
    """Emergency stop all movements"""
    result = servo_ctrl.force_stop_all_movements()
    return jsonify(result)

@app.route('/api/continuous-movement/restart-failed', methods=['POST'])
def api_restart_failed_movements():
    """Restart any failed movement threads"""
    result = servo_ctrl.restart_failed_movements()
    return jsonify(result)

@app.route('/api/continuous-movement/verify-positions', methods=['POST'])
def api_verify_servo_positions():
    """Verify actual positions of all servos vs expected positions"""
    result = servo_ctrl.verify_servo_positions()
    return jsonify(result)

@app.route('/api/servo/communication-test/<int:servo_id>', methods=['GET'])
def api_test_servo_communication(servo_id):
    """Test communication with a specific servo"""
    result = servo_ctrl.test_servo_communication(servo_id)
    return jsonify({"success": result, "servo_id": servo_id})

@app.route('/api/servo/recover-communication', methods=['POST'])
def api_recover_servo_communication():
    """Attempt to recover communication with multiple servos"""
    data = request.json
    servo_ids = data.get('servo_ids', [])
    
    if not isinstance(servo_ids, list) or not servo_ids:
        return jsonify({"success": False, "error": "'servo_ids' must be a non-empty list"}), 400
    
    recovered_servos = servo_ctrl.recover_servo_communication(servo_ids)
    
    return jsonify({
        "success": len(recovered_servos) > 0,
        "recovered_servos": recovered_servos,
        "total_servos": len(servo_ids)
    })

@app.route('/api/servo/reset-communication/<int:servo_id>', methods=['POST'])
def api_reset_servo_communication(servo_id):
    """Reset communication with a specific servo"""
    result = servo_ctrl.reset_servo_communication(servo_id)
    return jsonify({
        "success": result,
        "servo_id": servo_id,
        "message": "Communication reset successful" if result else "Communication reset failed"
    })

@app.route('/api/status')
def api_status():
    return jsonify({
        "connection": connection_status,
        "discovered_servos": servo_ctrl.discovered_servos
    })

@app.route('/api/ports')
def api_ports():
    """Get available COM ports"""
    import serial.tools.list_ports
    ports = [port.device for port in serial.tools.list_ports.comports()]
    return jsonify({"ports": ports})

@app.route('/api/servo/communication-health/<int:servo_id>', methods=['GET'])
def api_check_servo_communication_health(servo_id):
    """Check the communication health of a specific servo"""
    result = servo_ctrl.check_servo_communication_health(servo_id)
    return jsonify(result)

@app.route('/api/system/diagnostics', methods=['GET'])
def api_system_diagnostics():
    """Get comprehensive system diagnostics"""
    try:
        diagnostics = {
            "connection_status": connection_status,
            "servo_controller_status": {
                "is_connected": servo_ctrl.is_connected,
                "discovered_servos_count": len(servo_ctrl.discovered_servos),
                "active_movements_count": len([p for p in servo_ctrl.movement_patterns.values() if p.get("running", False)]),
                "paused_movements_count": len([p for p in servo_ctrl.movement_patterns.values() if p.get("paused", False)]),
                "active_threads_count": len([t for t in servo_ctrl.continuous_movement_threads.values() if t.is_alive()])
            },
            "communication_health": {},
            "system_info": {
                "python_version": sys.version,
                "flask_version": "2.3.3",
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Check communication health for all discovered servos
        if servo_ctrl.is_connected:
            for servo_id in servo_ctrl.discovered_servos.keys():
                health = servo_ctrl.check_servo_communication_health(servo_id)
                diagnostics["communication_health"][servo_id] = health
        
        return jsonify(diagnostics)
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/system/health-check', methods=['GET'])
def api_system_health_check():
    """Quick system health check"""
    try:
        health_status = "healthy"
        issues = []
        
        # Check connection
        if not servo_ctrl.is_connected:
            health_status = "critical"
            issues.append("Not connected to servo bus")
        
        # Check discovered servos
        if len(servo_ctrl.discovered_servos) == 0 and servo_ctrl.is_connected:
            health_status = "warning"
            issues.append("No servos discovered")
        
        # Check for stuck movements
        stuck_movements = [sid for sid, pattern in servo_ctrl.movement_patterns.items() 
                          if pattern.get("running", False) and not servo_ctrl.continuous_movement_threads.get(sid, None)]
        if stuck_movements:
            health_status = "warning"
            issues.append(f"Stuck movements detected: {stuck_movements}")
        
        return jsonify({
            "status": health_status,
            "issues": issues,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/system/cleanup-orphaned', methods=['POST'])
def api_cleanup_orphaned():
    """Clean up orphaned threads and patterns"""
    result = servo_ctrl.cleanup_orphaned_threads()
    return jsonify(result)

@app.route('/api/servo/comprehensive-status/<int:servo_id>', methods=['GET'])
def api_get_comprehensive_servo_status(servo_id):
    """Get comprehensive status for a specific servo"""
    result = servo_ctrl.get_comprehensive_servo_status(servo_id)
    return jsonify(result)

@app.route('/api/telemetry/all', methods=['GET'])
def api_all_telemetry():
    """Get telemetry for all discovered servos"""
    result = servo_ctrl.get_all_servos_telemetry()
    return jsonify(result)

@app.route('/api/continuous-movement/monitor-and-recover', methods=['POST'])
def api_monitor_and_recover_group_movements():
    """Monitor group movements and attempt to recover failed servos"""
    result = servo_ctrl.monitor_and_recover_group_movements()
    return jsonify(result)

@app.route('/api/continuous-movement/real-time-status', methods=['GET'])
def api_real_time_movement_status():
    """Get real-time movement status for all servos"""
    result = servo_ctrl.get_real_time_movement_status()
    return jsonify(result)

@app.route('/api/servo/config/<int:servo_id>', methods=['GET'])
def api_get_servo_config(servo_id):
    """Get servo configuration (offset, limits, dead zone) - ST3020 specific"""
    result = servo_ctrl.get_servo_config(servo_id)
    return jsonify(result)

@app.route('/api/servo/offset/<int:servo_id>', methods=['POST'])
def api_set_servo_offset(servo_id):
    """Set servo offset (middle position) - ST3020 specific"""
    data = request.json
    offset = data.get('offset')
    
    if offset is None:
        return jsonify({"success": False, "error": "'offset' parameter is required"}), 400
    
    result = servo_ctrl.set_servo_offset(servo_id, offset)
    return jsonify(result)

@app.route('/api/servo/angle-limits/<int:servo_id>', methods=['POST'])
def api_set_angle_limits(servo_id):
    """Set servo angle limits - ST3020 specific"""
    data = request.json
    min_angle = data.get('min_angle')
    max_angle = data.get('max_angle')
    
    if min_angle is None or max_angle is None:
        return jsonify({"success": False, "error": "'min_angle' and 'max_angle' parameters are required"}), 400
    
    result = servo_ctrl.set_angle_limits(servo_id, min_angle, max_angle)
    return jsonify(result)

@app.route('/api/servo/dead-zone/<int:servo_id>', methods=['POST'])
def api_set_dead_zone(servo_id):
    """Set servo dead zone - ST3020 specific"""
    data = request.json
    cw_dead = data.get('cw_dead')
    ccw_dead = data.get('ccw_dead')
    
    if cw_dead is None or ccw_dead is None:
        return jsonify({"success": False, "error": "'cw_dead' and 'ccw_dead' parameters are required"}), 400
    
    result = servo_ctrl.set_dead_zone(servo_id, cw_dead, ccw_dead)
    return jsonify(result)

@app.route('/api/continuous-movement/start-monitoring', methods=['POST'])
def api_start_monitoring():
    """Start periodic monitoring of all active movements"""
    result = servo_ctrl.start_periodic_monitoring()
    return jsonify(result)

@app.route('/api/continuous-movement/stop-monitoring', methods=['POST'])
def api_stop_monitoring():
    """Stop periodic monitoring"""
    result = servo_ctrl.stop_periodic_monitoring()
    return jsonify(result)

@app.route('/api/continuous-movement/monitoring-status', methods=['GET'])
def api_get_monitoring_status():
    """Get monitoring system status"""
    monitoring_active = hasattr(servo_ctrl, 'monitoring_active') and servo_ctrl.monitoring_active
    monitoring_thread_alive = hasattr(servo_ctrl, 'monitoring_thread') and servo_ctrl.monitoring_thread and servo_ctrl.monitoring_thread.is_alive()
    
    return jsonify({
        "success": True,
        "monitoring_active": monitoring_active,
        "monitoring_thread_alive": monitoring_thread_alive,
        "active_movements_count": len([p for p in servo_ctrl.movement_patterns.values() if p.get("running", False)]),
        "active_threads_count": len([t for t in servo_ctrl.continuous_movement_threads.values() if t.is_alive()])
    })

if __name__ == '__main__':
    print("🚀 Starting STServo Web API Backend...")
    print("📡 API will be available at: http://localhost:5000")
    print("🔧 Features: Discovery, Control, Telemetry, Diagnostics")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
