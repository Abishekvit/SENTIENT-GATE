
import { SecurityLog, MiddlewareResponse } from '../types';
import { JAILBREAK_VECTORS, HONEYPOT_KEYS, SAFETY_THRESHOLDS, EXFILTRATION_VECTORS } from '../constants/securityData';
import { TelemetryState } from '../constants/telemetryData';
import { getKeywordVector, cosineSimilarity } from './vectorService';
import { PhysicsEngine } from './physicsEngine';
import { callSecurityGuardAgent, callLogicalAnalystAgent } from './gemini';

const PARAMETER_REGISTRY: Record<string, { aliases: string[], unit: string, stateKey: keyof TelemetryState }> = {
  rpm: { aliases: ['rpm', 'speed', 'rotation'], unit: 'RPM', stateKey: 'axis_1_rpm' },
  rpm2: { aliases: ['rpm2', 'axis2 rpm'], unit: 'RPM', stateKey: 'axis_2_rpm' },
  temperature: { aliases: ['temp', 'heat'], unit: '°C', stateKey: 'axis_1_temp_c' },
  temp2: { aliases: ['temp2'], unit: '°C', stateKey: 'axis_2_temp_c' },
  torque: { aliases: ['torque', 'nm'], unit: 'Nm', stateKey: 'axis_1_torque_nm' },
  torque2: { aliases: ['torque2'], unit: 'Nm', stateKey: 'axis_2_torque_nm' },
  power: { aliases: ['power', 'watt', 'kw'], unit: 'kW', stateKey: 'power_draw_kw' },
  pressure: { aliases: ['pressure', 'psi'], unit: 'psi', stateKey: 'main_pressure_psi' },
  voltage: { aliases: ['voltage', 'volt'], unit: 'V', stateKey: 'voltage_v' },
  coolant: { aliases: ['coolant', 'flow'], unit: 'LPM', stateKey: 'coolant_flow_lpm' },
  jitter: { aliases: ['jitter', 'latency'], unit: 'ms', stateKey: 'network_jitter_ms' },
  load: { aliases: ['load', 'cpu'], unit: '%', stateKey: 'controller_cpu_load' },
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

  async process(rawInput: string, normalizedCommand: string, currentState: TelemetryState): Promise<MiddlewareResponse> {
    this.logs = [];
    this.addLog('INFO', 'INIT_SCAN: Evaluating security, physics, and contextual logic.');

    // 1. SECURITY GUARD SCAN
    const agenticGuard = await callSecurityGuardAgent(rawInput, HONEYPOT_KEYS);
    if (!agenticGuard.allowed) {
      this.addLog('BLOCK', 'AGENTIC_REFUSAL', { reason: agenticGuard.reason });
      return { allowed: false, reason: `SECURITY_ALERT: ${agenticGuard.reason}`, riskScore: agenticGuard.riskScore, semanticRisk: agenticGuard.riskScore, physicalRisk: 0, logs: this.logs };
    }

    // 2. PHYSICS & DETERMINISTIC VALIDATION
    const lines = normalizedCommand.split('\n');
    let runningState = { ...currentState };
    let totalPhysicalRisk = 0;
    let proposedChanges: any[] = [];

    for (const line of lines) {
      const intent = this.parseLine(line);
      if (!intent) continue;

      const paramDef = PARAMETER_REGISTRY[intent.primary];
      if (!paramDef) continue;

      const currentVal = runningState[paramDef.stateKey] as number;
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

      proposedChanges.push({ parameter: intent.primary, from: currentVal, to: targetValue });

      const physicsTriggerParams = ['rpm', 'voltage', 'pressure', 'torque', 'temperature', 'power'];
      if (physicsTriggerParams.some(p => intent.primary.includes(p))) {
        const prediction = this.physics.predictStateFromParameter(intent.primary, targetValue);
        totalPhysicalRisk = Math.max(totalPhysicalRisk, prediction.riskScore);

        const safetyChecks = [
          { key: 'RPM', val: prediction.expectedRpm, max: SAFETY_THRESHOLDS.max_rpm },
          { key: 'TEMP', val: prediction.expectedTemp, max: SAFETY_THRESHOLDS.max_temp },
          { key: 'POWER', val: prediction.expectedPower, max: SAFETY_THRESHOLDS.max_power_watts / 1000 }
        ];

        for (const check of safetyChecks) {
          if (check.val > check.max) {
            this.addLog('BLOCK', `PHYSICAL_VIOLATION: ${check.key} breach`);
            return { allowed: false, reason: `SAFETY_BREACH: ${check.key} forced to ${check.val.toFixed(1)} exceeds limit.`, riskScore: 0.9, semanticRisk: 0, physicalRisk: totalPhysicalRisk, logs: this.logs };
          }
        }

        // Apply axis-specific updates
        const isAxis2 = intent.primary.includes('2');
        runningState = { 
          ...runningState, 
          [paramDef.stateKey]: targetValue,
          [isAxis2 ? 'axis_2_rpm' : 'axis_1_rpm']: Math.round(prediction.expectedRpm),
          [isAxis2 ? 'axis_2_temp_c' : 'axis_1_temp_c']: Number(prediction.expectedTemp.toFixed(2)),
          [isAxis2 ? 'axis_2_torque_nm' : 'axis_1_torque_nm']: Number(prediction.expectedTorque.toFixed(2)),
          power_draw_kw: Number(prediction.expectedPower.toFixed(2)) 
        };
      } else {
        runningState = { ...runningState, [paramDef.stateKey]: targetValue };
      }
    }

    // 3. LOGICAL FRUITFULNESS ANALYSIS
    this.addLog('INFO', 'LOGICAL_ANALYSIS: Analyzing contextual validity.');
    const logicVerdict = await callLogicalAnalystAgent(rawInput, proposedChanges, currentState);
    
    if (!logicVerdict.fruitful) {
      this.addLog('BLOCK', 'LOGIC_FAILURE', { reasoning: logicVerdict.reasoning });
      return {
        allowed: false,
        reason: `LOGIC_OVERRIDE: ${logicVerdict.reasoning}`,
        riskScore: 0.8,
        semanticRisk: 0,
        physicalRisk: 0,
        logs: this.logs
      };
    }

    this.addLog('INFO', 'VALIDATION_PASSED: Changes staged for deployment.');

    return {
      allowed: true,
      normalizedPrompt: normalizedCommand,
      riskScore: Math.max(agenticGuard.riskScore, totalPhysicalRisk),
      semanticRisk: agenticGuard.riskScore,
      physicalRisk: totalPhysicalRisk,
      logs: this.logs,
      predictedState: runningState
    };
  }
}
