
import { SecurityLog, MiddlewareResponse } from '../types';
import { JAILBREAK_VECTORS, HONEYPOT_KEYS, SAFETY_THRESHOLDS } from '../constants/securityData';
import { TelemetryState } from '../constants/telemetryData';
import { getKeywordVector, cosineSimilarity } from './vectorService';
import { PhysicsEngine } from './physicsEngine';

type PrimaryParameter =
  | 'rpm'
  | 'temperature'
  | 'power'
  | 'torque'
  | 'vibration'
  | 'pressure'
  | 'voltage'
  | 'coolant'
  | 'latency'
  | 'sprinkler'
  | 'lights'
  | 'ventilation'
  | 'maglock';

const PARAMETER_REGISTRY: Record<string, { aliases: string[], unit: string, stateKey: keyof TelemetryState }> = {
  rpm: { aliases: ['rpm', 'speed', 'velocity', 'rotation'], unit: 'RPM', stateKey: 'axis_1_rpm' },
  temperature: { aliases: ['temperature', 'temp', 'heat', 'thermal'], unit: '°C', stateKey: 'axis_1_temp_c' },
  power: { aliases: ['power', 'watt', 'kw', 'energy'], unit: 'kW', stateKey: 'power_draw_kw' },
  torque: { aliases: ['torque', 'nm', 'force'], unit: 'Nm', stateKey: 'axis_1_torque_nm' },
  vibration: { aliases: ['vibration', 'shake', 'vibe'], unit: 'g', stateKey: 'network_jitter_ms' },
  pressure: { aliases: ['pressure', 'psi', 'bar'], unit: 'psi', stateKey: 'main_pressure_psi' },
  voltage: { aliases: ['voltage', 'volt', 'v'], unit: 'V', stateKey: 'voltage_v' },
  coolant: { aliases: ['coolant', 'flow', 'lpm'], unit: 'LPM', stateKey: 'coolant_flow_lpm' },
  latency: { aliases: ['latency', 'delay', 'jitter'], unit: 'ms', stateKey: 'network_jitter_ms' },
  sprinkler: { aliases: ['sprinkler', 'fire'], unit: 'BOOL', stateKey: 'fire_sprinkler_active' },
  lights: { aliases: ['lights', 'emergency'], unit: 'BOOL', stateKey: 'emergency_lights_active' },
  ventilation: { aliases: ['ventilation', 'fan'], unit: 'BOOL', stateKey: 'ventilation_active' },
  maglock: { aliases: ['maglock', 'lock'], unit: 'BOOL', stateKey: 'aux_maglock_active' }
};

export class SentinelMiddleware {
  public logs: SecurityLog[] = [];
  private physics = new PhysicsEngine();

  private addLog(type: SecurityLog['type'], message: string, details?: any) {
    this.logs.push({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      message,
      details
    });
  }

  private parseLine(line: string) {
    const text = line.toLowerCase().trim();
    // Support toggle syntax or standard operational syntax
    const commandMatch = text.match(/^(set|increase|decrease|multiply|toggle)\s+(\w+)\s+([\d.%]+)\s+(relative|absolute)$/);
    if (commandMatch) {
      const [_, operation, parameter, rawValue, type] = commandMatch;
      return {
        primary: parameter,
        operation: operation.toUpperCase() as any,
        operand: parseFloat(rawValue),
        isPercentage: rawValue.endsWith('%'),
        type
      };
    }
    return null;
  }

  async process(input: string, currentState: TelemetryState): Promise<MiddlewareResponse> {
    this.logs = [];
    const normalized = input.normalize('NFKC');

    for (const key of HONEYPOT_KEYS) {
      if (normalized.toUpperCase().includes(key)) {
        this.addLog('CRITICAL', 'Credential Access Intercepted', { key });
        return { allowed: false, reason: 'ACCESS_DENIED: Unauthorized credential access.', riskScore: 1.0, semanticRisk: 1.0, physicalRisk: 0, logs: this.logs };
      }
    }

    const vocab = Array.from(new Set(JAILBREAK_VECTORS.flatMap(v => v.split(/\W+/))));
    const inputVec = getKeywordVector(normalized, vocab);
    let semanticRisk = 0;
    for (const v of JAILBREAK_VECTORS) {
      const sim = cosineSimilarity(inputVec, getKeywordVector(v, vocab));
      semanticRisk = Math.max(semanticRisk, sim);
    }

    if (semanticRisk > 0.8) {
      this.addLog('BLOCK', 'ADVERSARIAL_PROMPT_DETECTED');
      return { allowed: false, reason: 'SECURITY_BLOCK: Intent violation detected.', riskScore: semanticRisk, semanticRisk: semanticRisk, physicalRisk: 0, logs: this.logs };
    }

    const lines = normalized.split('\n');
    let runningState = { ...currentState };
    let totalPhysicalRisk = 0;

    for (const line of lines) {
      const intent = this.parseLine(line);
      if (!intent) continue;

      const paramDef = PARAMETER_REGISTRY[intent.primary];
      if (!paramDef) continue;

      const currentVal = runningState[paramDef.stateKey] as number;
      let targetValue: number;

      if (intent.operation === 'TOGGLE') {
        targetValue = intent.operand; // 0 or 1
      } else if (intent.isPercentage) {
        const factor = intent.operand / 100;
        if (intent.operation === 'INCREASE') targetValue = currentVal * (1 + factor);
        else if (intent.operation === 'DECREASE') targetValue = currentVal * (1 - factor);
        else targetValue = currentVal * factor;
      } else {
        switch (intent.operation) {
          case 'MULTIPLY': targetValue = currentVal * intent.operand; break;
          case 'INCREASE': targetValue = currentVal + intent.operand; break;
          case 'DECREASE': targetValue = Math.max(0, currentVal - intent.operand); break;
          case 'SET': targetValue = intent.operand; break;
          default: targetValue = currentVal;
        }
      }

      // Physics logic (only for dependent parameters)
      const dependentParams = ['rpm', 'voltage', 'pressure', 'torque', 'temperature', 'power'];
      if (dependentParams.includes(intent.primary)) {
        const prediction = this.physics.predictStateFromParameter(intent.primary, targetValue);
        totalPhysicalRisk = Math.max(totalPhysicalRisk, prediction.riskScore);

        const safetyChecks = [
          { key: 'RPM', val: prediction.expectedRpm, max: SAFETY_THRESHOLDS.max_rpm },
          { key: 'TEMP', val: prediction.expectedTemp, max: SAFETY_THRESHOLDS.max_temp },
          { key: 'POWER', val: prediction.expectedPower, max: SAFETY_THRESHOLDS.max_power_watts / 1000 }
        ];

        for (const check of safetyChecks) {
          if (check.val > check.max) {
            this.addLog('BLOCK', `PHYSICAL_OVERFLOW:${check.key}`);
            return {
              allowed: false,
              reason: `SAFETY_VIOLATION: Combined command forces ${check.key} to ${check.val.toFixed(2)} (Max: ${check.max}).`,
              riskScore: 0.9,
              semanticRisk,
              physicalRisk: totalPhysicalRisk,
              logs: this.logs
            };
          }
        }

        runningState = {
          ...runningState,
          [paramDef.stateKey]: targetValue,
          axis_1_rpm: Math.round(prediction.expectedRpm),
          axis_1_temp_c: Number(prediction.expectedTemp.toFixed(2)),
          axis_1_torque_nm: Number(prediction.expectedTorque.toFixed(2)),
          power_draw_kw: Number(prediction.expectedPower.toFixed(2)),
        };
      } else {
        // Non-dependent parameter
        runningState = { ...runningState, [paramDef.stateKey]: targetValue };
      }
      
      this.addLog('INFO', `STEP_AUTHORIZED: ${intent.primary.toUpperCase()} validated.`);
    }

    return {
      allowed: true,
      normalizedPrompt: normalized,
      riskScore: Math.max(semanticRisk, totalPhysicalRisk),
      semanticRisk,
      physicalRisk: totalPhysicalRisk,
      logs: this.logs,
      predictedState: runningState
    };
  }

  async scanOutput(output: string) {
    return { safe: true, filteredOutput: output };
  }
}
