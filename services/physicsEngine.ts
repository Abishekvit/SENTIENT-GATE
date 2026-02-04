
import { SAFETY_THRESHOLDS } from '../constants/securityData';

export interface PhysicalStatePrediction {
  expectedRpm: number;
  expectedTemp: number;
  expectedVibration: number;
  expectedTorque: number;
  expectedPower: number; // kW
  riskScore: number;
  status: 'SAFE' | 'WARNING' | 'CRITICAL' | 'FAIL_IMMINENT' | 'EMERGENCY';
}

const CORRELATION_MAP = [
  { rpm: 0, temp: 24.5, vib: 0.02, torque: 0, power: 50, voltage: 0, pressure: 50 },
  { rpm: 1200, temp: 35.2, vib: 0.15, torque: 100, power: 450, voltage: 12, pressure: 1000 },
  { rpm: 1500, temp: 42.1, vib: 0.18, torque: 120, power: 600, voltage: 24, pressure: 1500 },
  { rpm: 2500, temp: 51.0, vib: 0.28, torque: 130, power: 1000, voltage: 32, pressure: 2000 },
  { rpm: 3800, temp: 65.8, vib: 0.68, torque: 310, power: 1850, voltage: 40, pressure: 2800 },
  { rpm: 4500, temp: 78.1, vib: 1.10, torque: 440, power: 2500, voltage: 44, pressure: 3500 },
  { rpm: 5500, temp: 94.5, vib: 4.10, torque: 550, power: 3800, voltage: 48, pressure: 4500 },
  { rpm: 7500, temp: 105.2, vib: 6.80, torque: 750, power: 5000, voltage: 52, pressure: 6000 },
  { rpm: 9200, temp: 118.0, vib: 8.20, torque: 850, power: 6200, voltage: 60, pressure: 8000 }
];

export class PhysicsEngine {
  public predictStateFromParameter(param: string, targetValue: number): PhysicalStatePrediction {
    const sorted = [...CORRELATION_MAP].sort((a, b) => a.rpm - b.rpm);
    let targetRpm = 0;

    const normalizedParam = param.toLowerCase();

    if (normalizedParam === 'rpm') {
      targetRpm = targetValue;
    } else if (normalizedParam === 'voltage' || normalizedParam === 'v') {
      targetRpm = this.inverseLookup(sorted, 'voltage', targetValue);
    } else if (normalizedParam === 'pressure' || normalizedParam === 'psi') {
      targetRpm = this.inverseLookup(sorted, 'pressure', targetValue);
    } else if (normalizedParam === 'torque' || normalizedParam === 'nm') {
      targetRpm = this.inverseLookup(sorted, 'torque', targetValue);
    } else if (normalizedParam === 'temperature' || normalizedParam === 'temp') {
      targetRpm = this.inverseLookup(sorted, 'temp', targetValue);
    } else if (normalizedParam === 'power' || normalizedParam === 'kw') {
      targetRpm = this.inverseLookup(sorted, 'power', targetValue * 1000); 
    } else {
      targetRpm = 1500; // Baseline default
    }

    return this.predictFromRpm(targetRpm);
  }

  private inverseLookup(map: any[], key: string, val: number): number {
    const sortedMap = [...map].sort((a, b) => a[key] - b[key]);
    const lower = [...sortedMap].reverse().find(p => p[key] <= val) ?? sortedMap[0];
    const upper = sortedMap.find(p => p[key] >= val) ?? sortedMap[sortedMap.length - 1];
    
    const span = upper[key] - lower[key];
    if (span === 0) return lower.rpm;
    
    const factor = (val - lower[key]) / span;
    return lower.rpm + (upper.rpm - lower.rpm) * factor;
  }

  private predictFromRpm(requestedRpm: number): PhysicalStatePrediction {
    const sorted = [...CORRELATION_MAP].sort((a, b) => a.rpm - b.rpm);
    const rpm = Math.max(sorted[0].rpm, Math.min(requestedRpm, sorted[sorted.length - 1].rpm));

    const lower = [...sorted].reverse().find(p => p.rpm <= rpm) ?? sorted[0];
    const upper = sorted.find(p => p.rpm >= rpm) ?? sorted[sorted.length - 1];

    const span = upper.rpm - lower.rpm;
    const factor = span === 0 ? 0 : (rpm - lower.rpm) / span;

    const expectedTemp = lower.temp + (upper.temp - lower.temp) * factor;
    const expectedVibration = lower.vib + (upper.vib - lower.vib) * factor;
    const expectedTorque = lower.torque + (upper.torque - lower.torque) * factor;
    const expectedPowerW = lower.power + (upper.power - lower.power) * factor;

    let risk = 0;
    if (expectedTemp > 115) risk = Math.max(risk, 1.0);
    else if (expectedTemp > 85) risk = Math.max(risk, 0.75);

    if (expectedTorque > SAFETY_THRESHOLDS.max_torque_nm) risk = Math.max(risk, 0.85);

    return {
      expectedRpm: Number(rpm.toFixed(0)),
      expectedTemp,
      expectedVibration,
      expectedTorque,
      expectedPower: expectedPowerW / 1000,
      riskScore: Number(risk.toFixed(2)),
      status: risk > 0.9 ? 'CRITICAL' : 'SAFE'
    };
  }
}
