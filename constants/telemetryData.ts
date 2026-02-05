
export interface TelemetryState {
  timestamp_seq: number;
  cycle_id: string;
  op_mode: string;
  safety_lock: 'LOCKED' | 'UNLOCKED';
  axis_1_rpm: number;
  axis_1_temp_c: number;
  axis_1_torque_nm: number;
  axis_2_rpm: number;
  axis_2_temp_c: number;
  axis_2_torque_nm: number;
  main_pressure_psi: number;
  coolant_flow_lpm: number;
  power_draw_kw: number;
  voltage_v: number;
  network_jitter_ms: number;
  controller_cpu_load: number;
  // Auxiliary Non-Dependent Systems
  fire_sprinkler_active: number;
  emergency_lights_active: number;
  ventilation_active: number;
  aux_maglock_active: number;
  // Environmental Hazards for Logical Reasoning
  hazard_detected: 'NONE' | 'FIRE' | 'GAS_LEAK' | 'OVERHEAT';
  system_health_status: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
}

const DEFAULT_AUX = {
  fire_sprinkler_active: 0,
  emergency_lights_active: 0,
  ventilation_active: 1,
  aux_maglock_active: 1,
  hazard_detected: 'NONE' as const,
  system_health_status: 'OPTIMAL' as const
};

export const SYSTEM_TELEMETRY: TelemetryState[] = [
  { timestamp_seq: 1, cycle_id: "CYC-X100", op_mode: "IDLE", safety_lock: "LOCKED", axis_1_rpm: 0, axis_1_temp_c: 22, axis_1_torque_nm: 0, axis_2_rpm: 0, axis_2_temp_c: 21.5, axis_2_torque_nm: 0, main_pressure_psi: 50, coolant_flow_lpm: 0, power_draw_kw: 0.5, voltage_v: 220.1, network_jitter_ms: 2, controller_cpu_load: 5, ...DEFAULT_AUX },
  { 
    timestamp_seq: 4, 
    cycle_id: "CYC-X100", 
    op_mode: "NORMAL", 
    safety_lock: "UNLOCKED", 
    axis_1_rpm: 1500, 
    axis_1_temp_c: 35.2, 
    axis_1_torque_nm: 120, 
    axis_2_rpm: 1200, 
    axis_2_temp_c: 36.8, 
    axis_2_torque_nm: 110, 
    main_pressure_psi: 1500, 
    coolant_flow_lpm: 15.2, 
    power_draw_kw: 4.5, 
    voltage_v: 219.9, 
    network_jitter_ms: 4, 
    controller_cpu_load: 25, 
    ...DEFAULT_AUX,
    hazard_detected: 'FIRE', // Initial state for testing the "Fire in room" logic
    fire_sprinkler_active: 1,
    system_health_status: 'DEGRADED'
  }
];
