
import { SecurityLog, MiddlewareResponse } from '../types';
import { JAILBREAK_VECTORS, HONEYPOT_KEYS, SAFETY_THRESHOLDS } from '../constants/securityData';
import { TelemetryState } from '../constants/telemetryData';
import { getKeywordVector, cosineSimilarity } from './vectorService';
import { PhysicsEngine } from './physicsEngine';
import { callSecurityGuardAgent, callLogicalAnalystAgent } from './gemini';

const PARAMETER_REGISTRY: Record<string, { aliases: string[], unit: string, stateKey: keyof TelemetryState }> = {
  rpm: { aliases: ['rpm', 'speed', 'rotation'], unit: 'RPM', stateKey: 'axis_1_rpm' },
  rpm2: { aliases: ['rpm2', 'axis2 rpm', 'axis 2 speed'], unit: 'RPM', stateKey: 'axis_2_rpm' },
  temperature: { aliases: ['temp', 'heat', 'thermal'], unit: '°C', stateKey: 'axis_1_temp_c' },
  temp2: { aliases: ['temp2', 'axis 2 temp'], unit: '°C', stateKey: 'axis_2_temp_c' },
  torque: { aliases: ['torque', 'nm'], unit: 'Nm', stateKey: 'axis_1_torque_nm' },
  torque2: { aliases: ['torque2', 'axis 2 torque'], unit: 'Nm', stateKey: 'axis_2_torque_nm' },
  power: { aliases: ['power', 'watt', 'kw'], unit: 'kW', stateKey: 'power_draw_kw' },
  pressure: { aliases: ['pressure', 'psi', 'pneumatic'], unit: 'psi', stateKey: 'main_pressure_psi' },
  voltage: { aliases: ['voltage', 'volt', 'bus'], unit: 'V', stateKey: 'voltage_v' },
  coolant: { aliases: ['coolant', 'flow', 'lpm'], unit: 'LPM', stateKey: 'coolant_flow_lpm' },
  jitter: { aliases: ['jitter', 'latency', 'delay'], unit: 'ms', stateKey: 'network_jitter_ms' },
  load: { aliases: ['load', 'cpu', 'usage'], unit: '%', stateKey: 'controller_cpu_load' },
  sprinkler: { aliases: ['sprinkler', 'fire suppression'], unit: 'BOOL', stateKey: 'fire_sprinkler_active' },
  lights: { aliases: ['lights', 'emergency lighting'], unit: 'BOOL', stateKey: 'emergency_lights_active' },
  ventilation: { aliases: ['ventilation', 'fan', 'hvac'], unit: 'BOOL', stateKey: 'ventilation_active' },
  maglock: { aliases: ['maglock', 'door lock'], unit: 'BOOL', stateKey: 'aux_maglock_active' }
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
    this.addLog('INFO', 'GATEWAY_SCAN_INIT: Evaluating security and intent.');

    // 1. SECURITY AGENT (Jailbreak / Honeypot)
    const agenticGuard = await callSecurityGuardAgent(rawInput, HONEYPOT_KEYS);
    if (!agenticGuard.allowed) {
      this.addLog('BLOCK', 'SECURITY_POLICY_VIOLATION', { reason: agenticGuard.reason });
      return { allowed: false, reason: `Adversarial content detected: ${agenticGuard.reason}`, riskScore: agenticGuard.riskScore, semanticRisk: agenticGuard.riskScore, physicalRisk: 0, logs: this.logs };
    }

    // 2. DETERMINISTIC VALIDATION (Physics & Limits)
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

      // Physics check for motor/electrical parameters
      const physicsTriggers = ['rpm', 'voltage', 'pressure', 'torque', 'temperature', 'power'];
      if (physicsTriggers.some(p => intent.primary.includes(p))) {
        const prediction = this.physics.predictStateFromParameter(intent.primary, targetValue);
        totalPhysicalRisk = Math.max(totalPhysicalRisk, prediction.riskScore);

        if (prediction.status === 'CRITICAL' || totalPhysicalRisk > 0.9) {
          this.addLog('BLOCK', 'PHYSICAL_ENVELOPE_BREACH', { score: totalPhysicalRisk });
          return { allowed: false, reason: `Physical risk threshold exceeded. Operation would cause ${prediction.expectedTemp.toFixed(1)}°C thermal event.`, riskScore: totalPhysicalRisk, semanticRisk: 0, physicalRisk: totalPhysicalRisk, logs: this.logs };
        }

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

    // 3. CONTEXTUAL LOGIC AGENT (Is it fruitful?)
    this.addLog('INFO', 'LOGIC_ANALYST_ENGAGED: Performing contextual verification.');
    const logicVerdict = await callLogicalAnalystAgent(rawInput, proposedChanges, currentState);
    
    if (!logicVerdict.fruitful) {
      this.addLog('BLOCK', 'LOGICAL_CONTEXT_REJECTION', { reasoning: logicVerdict.reasoning });
      return {
        allowed: false,
        reason: `Logic Filter Rejection: ${logicVerdict.reasoning}`,
        riskScore: 0.85,
        semanticRisk: 0,
        physicalRisk: 0,
        logs: this.logs
      };
    }

    this.addLog('INFO', 'SENTINEL_CLEARANCE: Commands authorized for hardware execution.');

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
