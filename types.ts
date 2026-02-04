
import { TelemetryState } from './constants/telemetryData';

export interface SecurityLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCK' | 'NORMALIZATION';
  message: string;
  details?: any;
}

export interface SecurityTransaction {
  transaction_id: string;
  timestamp: string;
  input_layer: {
    user_prompt: string;
    normalized_prompt?: string;
    obfuscation_check: 'PASS' | 'FAIL';
    vector_similarity_score: number;
  };
  context_layer: {
    connector_used: string;
    live_state: Partial<TelemetryState>;
  };
  agentic_evaluation: {
    agent_role: string;
    reasoning: string;
    verdict: 'ALLOW' | 'BLOCK' | 'DENIED';
    risk_score: number;
  };
  final_decision: 'AUTHORIZED' | 'DENIED' | 'FILTERED';
  output_layer?: {
    raw_response: string;
    filtered_response: string;
  };
}

export interface SafetyThresholds {
  max_rpm: number;
  max_acceleration_rpm: number;
  max_torque_nm: number;
  max_position_error_mm: number;
  vibration_trip_threshold_g: number;
  max_voltage: number;
  min_voltage_cutoff: number;
  max_current_continuous_amps: number;
  max_current_peak_amps: number;
  max_power_watts: number;
  insulation_resistance_min_ohm: number;
  max_temp: number;
  max_case_temp: number;
  min_coolant_flow_lpm: number;
  max_humidity_percent: number;
  max_pressure_psi: number;
  max_latency_ms: number;
  max_packet_loss_percent: number;
  allowed_ports: number[];
  allowed_modes: string[];
  emergency_stop_override: boolean;
  requires_physical_key: boolean;
  geo_fencing_radius_m: number;
}

export interface MiddlewareResponse {
  allowed: boolean;
  reason?: string;
  normalizedPrompt?: string;
  riskScore: number;
  semanticRisk: number;
  physicalRisk: number;
  logs: SecurityLog[];
  predictedState?: Partial<TelemetryState>;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system' | 'security';
  text: string;
  timestamp: number;
  blocked?: boolean;
  intent?: any;
  reaction?: string;
  chatResponse?: string;
}
