
import { TelemetryState } from '../constants/telemetryData';

export interface CSVExtractionResult {
  parameters: Array<{
    name: string;
    value: number;
    mappedKey: keyof TelemetryState | null;
    unit: string;
  }>;
  partialState: Partial<TelemetryState>;
}

export class CSVConnector {
  private keyMapping: Record<string, keyof TelemetryState> = {
    'axis_1_rpm': 'axis_1_rpm',
    'axis 1 rpm': 'axis_1_rpm',
    'a1_rpm': 'axis_1_rpm',
    'axis_1_temp': 'axis_1_temp_c',
    'axis 1 temp': 'axis_1_temp_c',
    'a1_temp': 'axis_1_temp_c',
    'axis_1_torque': 'axis_1_torque_nm',
    'axis 1 torque': 'axis_1_torque_nm',
    'a1_torque': 'axis_1_torque_nm',
    
    'axis_2_rpm': 'axis_2_rpm',
    'axis 2 rpm': 'axis_2_rpm',
    'a2_rpm': 'axis_2_rpm',
    'axis_2_temp': 'axis_2_temp_c',
    'axis 2 temp': 'axis_2_temp_c',
    'a2_temp': 'axis_2_temp_c',
    'axis_2_torque': 'axis_2_torque_nm',
    'axis 2 torque': 'axis_2_torque_nm',
    'a2_torque': 'axis_2_torque_nm',

    'rpm': 'axis_1_rpm',
    'speed': 'axis_1_rpm',
    'temp': 'axis_1_temp_c',
    'torque': 'axis_1_torque_nm',
    
    'power': 'power_draw_kw',
    'kw': 'power_draw_kw',
    'pressure': 'main_pressure_psi',
    'psi': 'main_pressure_psi',
    'voltage': 'voltage_v',
    'volt': 'voltage_v',
    'coolant': 'coolant_flow_lpm',
    'flow': 'coolant_flow_lpm',
    'latency': 'network_jitter_ms',
    'jitter': 'network_jitter_ms',
    'cpu': 'controller_cpu_load',
    'load': 'controller_cpu_load'
  };

  private unitMapping: Record<string, string> = {
    'axis_1_rpm': 'RPM',
    'axis_1_temp_c': '°C',
    'axis_1_torque_nm': 'Nm',
    'axis_2_rpm': 'RPM',
    'axis_2_temp_c': '°C',
    'axis_2_torque_nm': 'Nm',
    'power_draw_kw': 'kW',
    'main_pressure_psi': 'PSI',
    'coolant_flow_lpm': 'LPM',
    'voltage_v': 'V',
    'network_jitter_ms': 'ms',
    'controller_cpu_load': '%'
  };

  public extract(csvContent: string): CSVExtractionResult {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      return { parameters: [], partialState: {} };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dataValues = lines[1].split(',').map(v => v.trim());

    const parameters: CSVExtractionResult['parameters'] = [];
    const partialState: Partial<TelemetryState> = {};

    headers.forEach((header, index) => {
      const rawValue = dataValues[index];
      const numericValue = parseFloat(rawValue);
      
      if (!isNaN(numericValue)) {
        let mappedKey: keyof TelemetryState | null = null;
        
        // Exact match check first
        if (this.keyMapping[header]) {
          mappedKey = this.keyMapping[header];
        } else {
          // Partial match check
          for (const [key, stateKey] of Object.entries(this.keyMapping)) {
            if (header.includes(key)) {
              mappedKey = stateKey;
              break;
            }
          }
        }

        if (mappedKey) {
          (partialState as any)[mappedKey] = numericValue;
        }

        parameters.push({
          name: header.toUpperCase(),
          value: numericValue,
          mappedKey,
          unit: mappedKey ? this.unitMapping[mappedKey] || '' : ''
        });
      }
    });

    return { parameters, partialState };
  }
}
