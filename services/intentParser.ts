
import { Intent } from './gemini';

export class LocalIntentParser {
  private static PARAMETERS = [
    'rpm', 'voltage', 'pressure', 'torque', 'temperature', 'power', 'coolant', 'latency', 'vibration',
    'sprinkler', 'lights', 'ventilation', 'maglock'
  ];
  
  public static parse(input: string): Intent[] {
    const lines = input.toLowerCase().split(/[.!?]|\band\b/).map(s => s.trim()).filter(s => s.length > 0);
    const intents: Intent[] = [];

    for (const line of lines) {
      let operation = 'set';
      let value: string | number | null = null;

      // Detect Toggle Operations
      if (line.includes('turn on') || line.includes('activate') || line.includes('enable') || line.includes('start')) {
        operation = 'toggle';
        value = 1;
      } else if (line.includes('turn off') || line.includes('deactivate') || line.includes('disable') || line.includes('stop')) {
        operation = 'toggle';
        value = 0;
      } else if (line.includes('increase') || line.includes('raise') || line.includes('up')) {
        operation = 'increase';
      } else if (line.includes('decrease') || line.includes('drop') || line.includes('down') || line.includes('lower')) {
        operation = 'decrease';
      } else if (line.includes('multiply') || line.includes('times')) {
        operation = 'multiply';
      }

      const foundParam = this.PARAMETERS.find(p => line.includes(p));
      const valueMatch = line.match(/(\d+(\.\d+)?%?)/);

      if (foundParam) {
        const finalValue = value !== null ? value : (valueMatch ? valueMatch[0] : null);
        
        if (finalValue !== null) {
          intents.push({
            primary_parameter: foundParam,
            operation: operation,
            value: finalValue,
            modifier_type: String(finalValue).endsWith('%') ? 'relative' : 'absolute',
            modifier_source: 'local_nlp_engine',
            raw_phrase: line
          });
        }
      }
    }

    return intents;
  }
}
