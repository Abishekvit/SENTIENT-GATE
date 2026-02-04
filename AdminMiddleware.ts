
import { SecurityLog, MiddlewareResponse } from './types';
import { TelemetryState } from './constants/telemetryData';
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
    const commandMatch = text.match(/^(set|increase|decrease|multiply)\s+(\w+)\s+([\d.%]+)\s+(relative|absolute)$/);
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

  async process(input: string, currentState: TelemetryState): Promise<MiddlewareResponse> {
    this.logs = [];
    this.addLog('INFO', 'ADMIN_PRIVILEGE_ACTIVE: Safety Interlocks Bypassed');
    
    const normalized = input.normalize('NFKC');
    const lines = normalized.split('\n');
    let runningState = { ...currentState };

    for (const line of lines) {
      const intent = this.parseLine(line);
      if (!intent) continue;

      const stateKeyMap: Record<string, keyof TelemetryState> = {
        'rpm': 'axis_1_rpm',
        'temperature': 'axis_1_temp_c',
        'pressure': 'main_pressure_psi',
        'voltage': 'voltage_v',
        'power': 'power_draw_kw'
      };

      const stateKey = stateKeyMap[intent.primary];
      if (!stateKey) continue;

      const currentVal = runningState[stateKey] as number;
      let targetValue: number;

      if (intent.isPercentage) {
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

      const prediction = this.physics.predictStateFromParameter(intent.primary, targetValue);
      
      this.addLog('WARNING', `ADMIN_OVERRIDE: Forcing ${intent.primary} to ${targetValue.toFixed(2)}`, {
        predicted_rpm: prediction.expectedRpm,
        predicted_temp: prediction.expectedTemp
      });

      runningState = {
        ...runningState,
        [stateKey]: targetValue,
        axis_1_rpm: Math.round(prediction.expectedRpm),
        axis_1_temp_c: Number(prediction.expectedTemp.toFixed(2)),
        axis_1_torque_nm: Number(prediction.expectedTorque.toFixed(2)),
        power_draw_kw: Number(prediction.expectedPower.toFixed(2)),
      };
    }

    return {
      allowed: true,
      normalizedPrompt: normalized,
      riskScore: 0, // In admin mode, risk is accepted
      semanticRisk: 0,
      physicalRisk: 0,
      logs: this.logs,
      predictedState: runningState
    };
  }
}
