
import { SecurityLog, MiddlewareResponse } from './types';
import { TelemetryState } from './constants/telemetryData';
import { JAILBREAK_VECTORS, HONEYPOT_KEYS, EXFILTRATION_VECTORS } from './constants/securityData';
import { getKeywordVector, cosineSimilarity } from './services/vectorService';
import { PhysicsEngine } from './services/physicsEngine';

export class AdminMiddleware {
  public logs: SecurityLog[] = [];
  private physics = new PhysicsEngine();

  private addLog(type: SecurityLog['type'], message: string, details?: any) {
    this.logs.push({
      id: `adm_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      message,
      details
    });
  }

  private parseLine(line: string) {
    const text = line.toLowerCase().trim();
    const commandMatch = text.match(/^(set|increase|decrease|multiply|toggle)\s+(\w+)\s+([\d.%]+)\s+(relative|absolute)$/);
    if (commandMatch) {
      const [_, operation, parameter, rawValue, type] = commandMatch;
      return {
        primary: parameter as any,
        operation: operation.toUpperCase() as any,
        operand: parseFloat(rawValue),
        isPercentage: rawValue.endsWith('%'),
        type
      };
    }
    return null;
  }

  async process(rawInput: string, normalizedCommand: string, currentState: TelemetryState): Promise<MiddlewareResponse> {
    this.logs = [];
    
    // 1. ROOT SEMANTIC SCAN
    const securityTarget = (rawInput + " " + normalizedCommand).normalize('NFKC');
    
    const securityVocab = Array.from(new Set([
      ...HONEYPOT_KEYS.flatMap(k => k.split(/_|\W+/)),
      ...EXFILTRATION_VECTORS.flatMap(e => e.split(/\W+/))
    ])).filter(w => w.length > 2);

    const inputVec = getKeywordVector(securityTarget, securityVocab);

    // HONEYPOT VECTOR CHECK (Even for root, secrets are sealed)
    let honeypotRisk = 0;
    for (const key of HONEYPOT_KEYS) {
      if (securityTarget.toUpperCase().includes(key)) {
        honeypotRisk = 1.0;
        break;
      }
      const sim = cosineSimilarity(inputVec, getKeywordVector(key, securityVocab));
      honeypotRisk = Math.max(honeypotRisk, sim);
    }

    if (honeypotRisk > 0.85) {
      this.addLog('BLOCK', 'ADMIN_ROOT_TRIPWIRE: Attempted honeypot extraction detected via vector signature.', { risk: honeypotRisk });
      return { 
        allowed: false, 
        reason: 'KERNEL_PROTECTION: Root access denied for protected memory shards. Secret patterns detected.', 
        riskScore: 1.0, 
        semanticRisk: 1.0, 
        physicalRisk: 0, 
        logs: this.logs 
      };
    }

    this.addLog('INFO', 'ROOT_OVERRIDE_ACTIVE: Physics interlocks disabled for Admin.');
    
    const lines = normalizedCommand.split('\n');
    let runningState = { ...currentState };

    const stateKeyMap: Record<string, keyof TelemetryState> = {
      // Axis 1
      'rpm': 'axis_1_rpm',
      'rpm1': 'axis_1_rpm',
      'temperature': 'axis_1_temp_c',
      'temp': 'axis_1_temp_c',
      'temp1': 'axis_1_temp_c',
      'torque': 'axis_1_torque_nm',
      'torque1': 'axis_1_torque_nm',
      // Axis 2
      'rpm2': 'axis_2_rpm',
      'temp2': 'axis_2_temp_c',
      'torque2': 'axis_2_torque_nm',
      // System wide
      'pressure': 'main_pressure_psi',
      'psi': 'main_pressure_psi',
      'voltage': 'voltage_v',
      'volt': 'voltage_v',
      'power': 'power_draw_kw',
      'kw': 'power_draw_kw',
      'coolant': 'coolant_flow_lpm',
      'flow': 'coolant_flow_lpm',
      'jitter': 'network_jitter_ms',
      'latency': 'network_jitter_ms',
      'load': 'controller_cpu_load',
      'cpu': 'controller_cpu_load',
      // Aux
      'sprinkler': 'fire_sprinkler_active',
      'lights': 'emergency_lights_active',
      'ventilation': 'ventilation_active',
      'maglock': 'aux_maglock_active'
    };

    for (const line of lines) {
      const intent = this.parseLine(line);
      if (!intent) continue;

      const stateKey = stateKeyMap[intent.primary];
      if (!stateKey) {
        this.addLog('WARNING', `MAPPING_FAULT: Parameter '${intent.primary}' has no direct kernel binding.`);
        continue;
      }

      const currentVal = runningState[stateKey] as number;
      let targetValue: number;

      if (intent.operation === 'TOGGLE') {
        targetValue = intent.operand;
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

      this.addLog('WARNING', `ADMIN_FORCE: Kernel key '${stateKey}' updated to ${targetValue}`);

      // Even in Admin mode, we use physics engine to predict secondary effects (temp rising with RPM)
      // but we don't block the command.
      const prediction = this.physics.predictStateFromParameter(intent.primary, targetValue);
      
      const isAxis2 = intent.primary.includes('2');
      runningState = {
        ...runningState,
        [stateKey]: targetValue
      };

      // If we are setting RPM, auto-calculate corresponding Temp/Torque for realism
      if (intent.primary.includes('rpm')) {
        if (isAxis2) {
          runningState.axis_2_temp_c = Number(prediction.expectedTemp.toFixed(2));
          runningState.axis_2_torque_nm = Number(prediction.expectedTorque.toFixed(2));
        } else {
          runningState.axis_1_temp_c = Number(prediction.expectedTemp.toFixed(2));
          runningState.axis_1_torque_nm = Number(prediction.expectedTorque.toFixed(2));
        }
        runningState.power_draw_kw = Number(prediction.expectedPower.toFixed(2));
      }
    }

    return {
      allowed: true,
      normalizedPrompt: normalizedCommand,
      riskScore: 0,
      semanticRisk: 0,
      physicalRisk: 0,
      logs: this.logs,
      predictedState: runningState
    };
  }
}
