
import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, Activity, Terminal as TerminalIcon, Send, 
  Cpu, ShieldCheck, Thermometer, Gauge, Wifi,
  TrendingUp, AlertCircle, User, Zap,
  Droplets, BarChart3, BrainCircuit,
  ArrowRightLeft, Layers, Split, HardDrive, Waypoints, MessageSquare,
  Network, Settings, Lightbulb, Fan, Lock
} from 'lucide-react';
import { ChatMessage, MiddlewareResponse } from './types';
import { SentinelMiddleware } from './services/middleware';
import { callHardwareReactionAgent, callConversationalAgent, Intent } from './services/gemini';
import { LocalIntentParser } from './services/intentParser';
import { TelemetryState } from './constants/telemetryData';
import { SAFETY_THRESHOLDS } from './constants/securityData';
import { logStorage } from './services/logStorage';
import { telemetryStore } from './services/telemetryStore';

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [riskLevel, setRiskLevel] = useState(0);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [lastUpdatedKey, setLastUpdatedKey] = useState<string | null>(null);
  
  const [liveState, setLiveState] = useState<TelemetryState>(telemetryStore.getState());
  
  const middleware = useRef(new SentinelMiddleware());
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // REAL-TIME DATA SIMULATION (SENSOR NOISE)
  useEffect(() => {
    const jitterInterval = setInterval(() => {
      const state = telemetryStore.getState();
      const jitter = (val: number, range: number = 0.002) => {
        if (val === 0) return 0;
        const delta = val * (Math.random() * range * 2 - range);
        return Number((val + delta).toFixed(2));
      };

      telemetryStore.updateState({
        axis_1_temp_c: jitter(state.axis_1_temp_c, 0.005),
        axis_1_torque_nm: jitter(state.axis_1_torque_nm, 0.004),
        axis_2_temp_c: jitter(state.axis_2_temp_c, 0.005),
        axis_2_torque_nm: jitter(state.axis_2_torque_nm, 0.004),
        power_draw_kw: jitter(state.power_draw_kw, 0.01),
        voltage_v: jitter(state.voltage_v, 0.001),
        network_jitter_ms: jitter(state.network_jitter_ms, 0.05),
        controller_cpu_load: Math.min(100, Math.max(0, jitter(state.controller_cpu_load, 0.02))),
        main_pressure_psi: jitter(state.main_pressure_psi, 0.003),
        coolant_flow_lpm: jitter(state.coolant_flow_lpm, 0.008)
      });
    }, 1200);

    return () => clearInterval(jitterInterval);
  }, []);

  useEffect(() => {
    const unsubscribe = telemetryStore.subscribe((state) => {
      setLiveState(state);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setInput('');

    try {
      setActiveStep('LOCAL_REASONING');
      const intents = LocalIntentParser.parse(input);
      
      const normalizedCommand = intents.length > 0
        ? intents.map(i => `${i.operation} ${i.primary_parameter} ${i.value} ${i.modifier_type}`).join('\n')
        : input;

      setActiveStep('VALIDATING');
      const middlewareResult: MiddlewareResponse = await middleware.current.process(normalizedCommand, liveState);
      setRiskLevel(middlewareResult.riskScore);

      let finalTelemetry = { ...liveState };

      logStorage.addTransaction({
        transaction_id: `usr_txn_${Date.now()}`,
        timestamp: new Date().toISOString(),
        input_layer: { 
          user_prompt: input, 
          normalized_prompt: normalizedCommand,
          obfuscation_check: 'PASS', 
          vector_similarity_score: middlewareResult.semanticRisk 
        },
        context_layer: { connector_used: "LOCAL_PARSER_V1", live_state: liveState },
        agentic_evaluation: { 
          agent_role: "Local Regex Parser", 
          reasoning: "Intent extracted via local pattern matching.", 
          verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', 
          risk_score: middlewareResult.riskScore 
        },
        final_decision: middlewareResult.allowed ? 'AUTHORIZED' : 'DENIED'
      });

      setActiveStep('GEN_REPORTS');
      
      if (middlewareResult.allowed && middlewareResult.predictedState) {
        finalTelemetry = { ...liveState, ...middlewareResult.predictedState };
        telemetryStore.updateState(middlewareResult.predictedState);
        const changedKeys = Object.keys(middlewareResult.predictedState!);
        if (changedKeys.length > 0) {
          setLastUpdatedKey(changedKeys[0]);
          setTimeout(() => setLastUpdatedKey(null), 2000);
        }
      }

      const [techReaction, chatResponse] = await Promise.all([
        callHardwareReactionAgent(middlewareResult, finalTelemetry, intents),
        callConversationalAgent(input, middlewareResult, intents)
      ]);

      setMessages(prev => [...prev, {
        role: middlewareResult.allowed ? 'model' : 'security',
        text: techReaction,
        timestamp: Date.now(),
        blocked: !middlewareResult.allowed,
        intent: intents,
        reaction: techReaction,
        chatResponse: chatResponse
      } as any]);

    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'system', text: 'Communication fault in hardware link.', timestamp: Date.now() }]);
    } finally {
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const getPercentage = (val: number, max: number) => Math.min(100, Math.abs((val / max) * 100));

  const telemetryItems = [
    { key: 'axis_1_rpm', label: 'A1 RPM', val: liveState.axis_1_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-blue-400' },
    { key: 'axis_1_temp_c', label: 'A1 Temp', val: liveState.axis_1_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: liveState.axis_1_temp_c > 85 ? 'text-red-500' : 'text-emerald-400' },
    { key: 'axis_1_torque_nm', label: 'A1 Torque', val: liveState.axis_1_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-400' },
    
    { key: 'axis_2_rpm', label: 'A2 RPM', val: liveState.axis_2_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-blue-500' },
    { key: 'axis_2_temp_c', label: 'A2 Temp', val: liveState.axis_2_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: liveState.axis_2_temp_c > 85 ? 'text-red-500' : 'text-emerald-500' },
    { key: 'axis_2_torque_nm', label: 'A2 Torque', val: liveState.axis_2_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-500' },
    
    { key: 'main_pressure_psi', label: 'Pressure', val: liveState.main_pressure_psi, max: SAFETY_THRESHOLDS.max_pressure_psi, unit: 'PSI', icon: BarChart3, color: 'text-purple-400' },
    { key: 'coolant_flow_lpm', label: 'Coolant', val: liveState.coolant_flow_lpm, max: 20, unit: 'LPM', icon: Droplets, color: 'text-cyan-400' },
    { key: 'power_draw_kw', label: 'Power', val: liveState.power_draw_kw, max: SAFETY_THRESHOLDS.max_power_watts / 1000, unit: 'kW', icon: Zap, color: 'text-yellow-400' },
    
    { key: 'voltage_v', label: 'Voltage', val: liveState.voltage_v, max: 250, unit: 'V', icon: Cpu, color: 'text-indigo-400' },
    { key: 'network_jitter_ms', label: 'Jitter', val: liveState.network_jitter_ms, max: 100, unit: 'ms', icon: Network, color: 'text-pink-400' },
    { key: 'controller_cpu_load', label: 'CPU Load', val: liveState.controller_cpu_load, max: 100, unit: '%', icon: Settings, color: 'text-slate-400' },
  ];

  const auxItems = [
    { key: 'fire_sprinkler_active', label: 'Sprinkler', icon: Droplets, active: liveState.fire_sprinkler_active === 1 },
    { key: 'emergency_lights_active', label: 'Emerg Lights', icon: Lightbulb, active: liveState.emergency_lights_active === 1 },
    { key: 'ventilation_active', label: 'Ventilation', icon: Fan, active: liveState.ventilation_active === 1 },
    { key: 'aux_maglock_active', label: 'MagLock', icon: Lock, active: liveState.aux_maglock_active === 1 },
  ];

  return (
    <div className="flex h-screen bg-[#05070a] text-slate-100 overflow-hidden font-sans select-none">
      <aside className="w-[450px] bg-[#0a0d12] border-r border-white/5 flex flex-col p-6 overflow-hidden shadow-2xl z-40">
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <Shield className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">Sentinel IDS</h1>
            <p className="text-[9px] text-slate-500 font-mono font-bold mt-1 tracking-widest uppercase opacity-70">Operator Mode // V3.2-LIVE</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
          <section>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Activity className="w-3 h-3 text-emerald-500 animate-pulse" /> Live Telemetry Matrix
              </span>
              <span className="text-[8px] font-mono text-emerald-500/50 uppercase tracking-tighter">Sync: 1.2ms</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {telemetryItems.map((item, idx) => (
                <div key={idx} className={`bg-slate-900/40 p-3.5 rounded-2xl border transition-all duration-300 ${lastUpdatedKey === item.key ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/[0.03]'}`}>
                  <div className="flex items-center gap-2 mb-1.5 opacity-50">
                    <item.icon className={`w-3 h-3 ${item.color}`} />
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-wider truncate">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1 justify-between mb-2">
                    <span className="text-base font-black font-mono text-white tracking-tighter">{item.val.toLocaleString()}</span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase">{item.unit}</span>
                  </div>
                  <div className="w-full h-1 bg-slate-800/50 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-700 ${item.val > item.max * 0.85 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${getPercentage(item.val, item.max)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Settings className="w-3 h-3 text-blue-500" /> Auxiliary Systems
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {auxItems.map((item, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border transition-all duration-500 flex items-center gap-4 ${item.active ? 'bg-emerald-500/10 border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'bg-slate-900/20 border-white/[0.03] grayscale opacity-40'}`}>
                  <div className={`p-2 rounded-lg ${item.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest block mb-0.5 text-slate-300">{item.label}</span>
                    <span className={`text-[8px] font-mono font-bold uppercase ${item.active ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
                      {item.active ? 'ACTIVE' : 'STANDBY'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#05070a] relative">
        <header className="h-16 flex items-center justify-between px-10 border-b border-white/5 bg-[#0a0d12]/60 backdrop-blur-2xl z-30">
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full animate-pulse ${riskLevel > 0.6 ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] font-mono">CHANNEL_ACTIVE // {liveState.cycle_id}</span>
          </div>
          {activeStep && (
            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
              <Layers className="w-3 h-3 text-emerald-500 animate-spin" />
              <span className="text-[10px] font-black text-emerald-400 font-mono tracking-widest uppercase">{activeStep}</span>
            </div>
          )}
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-16 py-10 space-y-12 no-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-10 opacity-50">
               <div className="relative">
                 <Cpu className="w-20 h-20 text-emerald-500 opacity-20" />
                 <div className="absolute inset-0 border border-emerald-500/20 rounded-full animate-ping scale-150 opacity-10" />
               </div>
               <div className="space-y-4">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Unified Control Hub</h2>
                <p className="text-slate-500 text-base font-medium">Local Physics Reasoning + Dual-Path AI Verification.</p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-6`}>
              <div className="flex flex-col gap-3 w-full max-w-[1050px]">
                <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] opacity-40 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? <User className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3 text-emerald-500" />}
                  {m.role === 'user' ? 'OPERATOR_DIRECTIVE' : 'SENTINEL_VALIDATION'}
                </div>

                {m.role === 'user' ? (
                   <div className="px-10 py-7 rounded-[32px] border border-white/10 bg-[#1a2b5a]/80 backdrop-blur-md text-white self-end shadow-2xl">
                    <p className="font-medium whitespace-pre-wrap text-lg leading-relaxed">{m.text}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div className="bg-black/60 border border-emerald-500/10 rounded-[32px] p-8 flex flex-col gap-4 max-h-[400px]">
                      <div className="flex items-center gap-3">
                        <Waypoints className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-emerald-500 font-black uppercase text-[10px] tracking-widest">CONTEXT</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar">
                        <pre className="text-[10px] font-mono text-emerald-400/80 leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5">
                          {JSON.stringify(m.intent, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className={`rounded-[32px] p-8 flex flex-col gap-4 border shadow-2xl transition-all max-h-[400px] ${m.blocked ? 'bg-red-500/5 border-red-500/20 text-red-400' : 'bg-blue-900/5 border-blue-500/10 text-blue-300'}`}>
                      <div className="flex items-center gap-3">
                        <Cpu className={`w-4 h-4 ${m.blocked ? 'text-red-500' : 'text-blue-400'}`} />
                        <h3 className={`font-black uppercase text-[10px] tracking-widest ${m.blocked ? 'text-red-500' : 'text-blue-400'}`}>AGENT A</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar">
                        <p className="font-mono text-[11px] leading-relaxed italic opacity-90">{m.reaction}</p>
                      </div>
                    </div>

                    <div className="bg-[#12161e] border border-white/5 rounded-[32px] p-8 flex flex-col gap-4 shadow-2xl max-h-[400px]">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-purple-400" />
                        <h3 className="text-purple-400 font-black uppercase text-[10px] tracking-widest">AGENT B</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar">
                        <p className="text-sm leading-relaxed text-slate-300 font-medium italic">"{(m as any).chatResponse}"</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-[#0e1218] rounded-full px-8 py-4 border border-white/10 animate-pulse flex items-center gap-3 shadow-xl">
                <Split className="w-4 h-4 text-emerald-500 animate-spin" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Verifying Mesh Credentials...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-16 pt-0 bg-gradient-to-t from-[#05070a] via-[#05070a] to-transparent">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
            <div className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-600">
              <TerminalIcon className="w-6 h-6" />
            </div>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Command (e.g. 'Turn on sprinkler', 'Raise RPM to 2000')..."
              className="w-full bg-[#0a0d12] border border-white/10 rounded-[40px] py-9 pl-20 pr-32 text-lg font-mono focus:border-emerald-500/40 transition-all outline-none shadow-3xl text-white placeholder:text-slate-700"
            />
            <button type="submit" disabled={!input.trim() || isProcessing} className="absolute right-6 top-6 bottom-6 w-20 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 rounded-[28px] text-white transition-all disabled:opacity-20 shadow-lg shadow-emerald-900/20">
              <Send className="w-6 h-6" />
            </button>
          </form>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
};

export default App;
