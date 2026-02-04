
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
}

const DEFAULT_AUX = {
  fire_sprinkler_active: 0,
  emergency_lights_active: 0,
  ventilation_active: 1,
  aux_maglock_active: 1,
};

export const SYSTEM_TELEMETRY: TelemetryState[] = [
  { timestamp_seq: 1, cycle_id: "CYC-X100", op_mode: "IDLE", safety_lock: "LOCKED", axis_1_rpm: 0, axis_1_temp_c: 22, axis_1_torque_nm: 0, axis_2_rpm: 0, axis_2_temp_c: 21.5, axis_2_torque_nm: 0, main_pressure_psi: 50, coolant_flow_lpm: 0, power_draw_kw: 0.5, voltage_v: 220.1, network_jitter_ms: 2, controller_cpu_load: 5, ...DEFAULT_AUX },
  { timestamp_seq: 4, cycle_id: "CYC-X100", op_mode: "NORMAL", safety_lock: "UNLOCKED", axis_1_rpm: 1500, axis_1_temp_c: 35.2, axis_1_torque_nm: 120, axis_2_rpm: 1200, axis_2_temp_c: 36.8, axis_2_torque_nm: 110, main_pressure_psi: 1500, coolant_flow_lpm: 15.2, power_draw_kw: 4.5, voltage_v: 219.9, network_jitter_ms: 4, controller_cpu_load: 25, ...DEFAULT_AUX },
  { timestamp_seq: 10, cycle_id: "CYC-X102", op_mode: "HIGH_LOAD", safety_lock: "UNLOCKED", axis_1_rpm: 3200, axis_1_temp_c: 60.2, axis_1_torque_nm: 310, axis_2_rpm: 2400, axis_2_temp_c: 65.2, axis_2_torque_nm: 290, main_pressure_psi: 2200, coolant_flow_lpm: 14.2, power_draw_kw: 10.2, voltage_v: 218.1, network_jitter_ms: 15, controller_cpu_load: 60, ...DEFAULT_AUX },
  { timestamp_seq: 15, cycle_id: "CYC-X104", op_mode: "DEGRADED", safety_lock: "UNLOCKED", axis_1_rpm: 4300, axis_1_temp_c: 78.9, axis_1_torque_nm: 440, axis_2_rpm: 3600, axis_2_temp_c: 94.2, axis_2_torque_nm: 430, main_pressure_psi: 2700, coolant_flow_lpm: 6.5, power_draw_kw: 14.8, voltage_v: 216.5, network_jitter_ms: 68, controller_cpu_load: 82, ...DEFAULT_AUX },
  { timestamp_seq: 18, cycle_id: "CYC-X105", op_mode: "CRITICAL", safety_lock: "UNLOCKED", axis_1_rpm: 5100, axis_1_temp_c: 90.5, axis_1_torque_nm: 510, axis_2_rpm: 4200, axis_2_temp_c: 108.5, axis_2_torque_nm: 490, main_pressure_psi: 3100, coolant_flow_lpm: 3.5, power_draw_kw: 17.1, voltage_v: 215, network_jitter_ms: 150, controller_cpu_load: 92, ...DEFAULT_AUX },
  { timestamp_seq: 22, cycle_id: "CYC-X106", op_mode: "EMERGENCY", safety_lock: "UNLOCKED", axis_1_rpm: 8900, axis_1_temp_c: 125.2, axis_1_torque_nm: 850, axis_2_rpm: 6000, axis_2_temp_c: 148.2, axis_2_torque_nm: 720, main_pressure_psi: 4500, coolant_flow_lpm: 1, power_draw_kw: 23.8, voltage_v: 210.5, network_jitter_ms: 800, controller_cpu_load: 100, ...DEFAULT_AUX }
];
