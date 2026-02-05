
import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, Activity, Terminal as TerminalIcon, Send, 
  Cpu, ShieldCheck, Thermometer, Gauge, Wifi,
  TrendingUp, AlertCircle, User, Zap,
  Droplets, BarChart3, BrainCircuit,
  ArrowRightLeft, Layers, Split, HardDrive, Waypoints, MessageSquare,
  Network, Settings, Lightbulb, Fan, Lock, AlertTriangle, Flame
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

  useEffect(() => {
    const unsubscribe = telemetryStore.subscribe((state) => {
      setLiveState(state);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    const rawInput = input;
    setMessages(prev => [...prev, { role: 'user', text: rawInput, timestamp: Date.now() }]);
    setIsProcessing(true);
    setInput('');

    try {
      setActiveStep('LOCAL_PARSING');
      const intents = LocalIntentParser.parse(rawInput);
      const normalizedCommand = intents.length > 0
        ? intents.map(i => `${i.operation} ${i.primary_parameter} ${i.value} ${i.modifier_type}`).join('\n')
        : rawInput;

      setActiveStep('CONTEXT_SCAN');
      const middlewareResult = await middleware.current.process(rawInput, normalizedCommand, liveState);
      setRiskLevel(middlewareResult.riskScore);

      if (middlewareResult.allowed && middlewareResult.predictedState) {
        telemetryStore.updateState(middlewareResult.predictedState);
        const changedKeys = Object.keys(middlewareResult.predictedState);
        if (changedKeys.length > 0) {
          setLastUpdatedKey(changedKeys[0]);
          setTimeout(() => setLastUpdatedKey(null), 2000);
        }
      }

      setActiveStep('LOGGING_DECISION');
      const [techReaction, chatResponse] = await Promise.all([
        callHardwareReactionAgent(middlewareResult, telemetryStore.getState(), intents),
        callConversationalAgent(rawInput, middlewareResult, intents)
      ]);

      setMessages(prev => [...prev, {
        role: middlewareResult.allowed ? 'model' : 'security',
        text: techReaction,
        timestamp: Date.now(),
        blocked: !middlewareResult.allowed,
        intent: intents,
        reaction: techReaction,
        chatResponse: chatResponse,
        reason: middlewareResult.reason
      } as any]);

      logStorage.addTransaction({
        transaction_id: `usr_txn_${Date.now()}`,
        timestamp: new Date().toISOString(),
        input_layer: { 
          user_prompt: rawInput, 
          normalized_prompt: normalizedCommand,
          obfuscation_check: 'PASS', 
          vector_similarity_score: middlewareResult.semanticRisk 
        },
        context_layer: { connector_used: "LOGIC_CORE_V4", live_state: liveState },
        agentic_evaluation: { 
          agent_role: "Logical Analyst", 
          reasoning: middlewareResult.reason || "Logic validated.", 
          verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', 
          risk_score: middlewareResult.riskScore 
        },
        final_decision: middlewareResult.allowed ? 'AUTHORIZED' : 'DENIED'
      });

    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', text: 'System process error.', timestamp: Date.now() }]);
    } finally {
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const telemetryItems = [
    { key: 'axis_1_rpm', label: 'A1 Speed', val: liveState.axis_1_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-blue-400' },
    { key: 'axis_1_temp_c', label: 'A1 Thermal', val: liveState.axis_1_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-emerald-400' },
    { key: 'axis_1_torque_nm', label: 'A1 Torque', val: liveState.axis_1_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-400' },
    { key: 'axis_2_rpm', label: 'A2 Speed', val: liveState.axis_2_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-blue-500' },
    { key: 'axis_2_temp_c', label: 'A2 Thermal', val: liveState.axis_2_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-emerald-500' },
    { key: 'axis_2_torque_nm', label: 'A2 Torque', val: liveState.axis_2_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-500' },
    { key: 'main_pressure_psi', label: 'Main PSI', val: liveState.main_pressure_psi, max: SAFETY_THRESHOLDS.max_pressure_psi, unit: 'PSI', icon: BarChart3, color: 'text-purple-400' },
    { key: 'coolant_flow_lpm', label: 'Coolant', val: liveState.coolant_flow_lpm, max: 20, unit: 'LPM', icon: Droplets, color: 'text-cyan-400' },
    { key: 'power_draw_kw', label: 'Grid Load', val: liveState.power_draw_kw, max: 5, unit: 'kW', icon: Zap, color: 'text-yellow-400' },
    { key: 'voltage_v', label: 'Bus Volt', val: liveState.voltage_v, max: 240, unit: 'V', icon: Cpu, color: 'text-red-400' },
    { key: 'network_jitter_ms', label: 'Jitter', val: liveState.network_jitter_ms, max: 100, unit: 'ms', icon: Network, color: 'text-pink-400' },
    { key: 'controller_cpu_load', label: 'CPU Load', val: liveState.controller_cpu_load, max: 100, unit: '%', icon: Settings, color: 'text-slate-400' },
  ];

  const auxItems = [
    { label: 'Sprinkler', active: liveState.fire_sprinkler_active === 1, icon: Droplets },
    { label: 'Emergency', active: liveState.emergency_lights_active === 1, icon: Lightbulb },
    { label: 'Ventilation', active: liveState.ventilation_active === 1, icon: Fan },
    { label: 'MagLock', active: liveState.aux_maglock_active === 1, icon: Lock },
  ];

  return (
    <div className="flex h-screen bg-[#05070a] text-slate-100 overflow-hidden font-sans">
      <aside className="w-[450px] bg-[#0a0d12] border-r border-white/5 flex flex-col p-6 overflow-hidden z-40">
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
            <Shield className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">Sentinel IDS</h1>
            <p className="text-[9px] text-slate-500 font-mono font-bold mt-1 tracking-widest uppercase">Contextual Control // V4.0</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
          {liveState.hazard_detected !== 'NONE' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-3 text-red-500 mb-1">
                <Flame className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">HAZARD: {liveState.hazard_detected}</span>
              </div>
              <p className="text-[10px] text-red-400/80 font-mono uppercase tracking-tighter">Logic filters preventing unsafe state overrides.</p>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3">
            {telemetryItems.map((item, idx) => (
              <div key={idx} className={`bg-slate-900/40 p-4 rounded-2xl border transition-all duration-300 ${lastUpdatedKey === item.key ? 'border-emerald-500/40 bg-emerald-500/5 shadow-lg shadow-emerald-500/5' : 'border-white/[0.03]'}`}>
                <div className="flex items-center gap-2 mb-1.5 opacity-50">
                  <item.icon className={`w-3 h-3 ${item.color}`} />
                  <span className="text-[8px] font-black text-slate-300 uppercase truncate">{item.label}</span>
                </div>
                <div className="flex items-baseline gap-1 justify-between">
                  <span className="text-base font-black font-mono text-white">{item.val.toLocaleString()}</span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase">{item.unit}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-2 gap-3">
            {auxItems.map((item, idx) => (
              <div key={idx} className={`p-4 rounded-2xl border transition-all duration-500 flex items-center gap-3 ${item.active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-900/20 border-white/[0.03] opacity-40 grayscale'}`}>
                <item.icon className={`w-4 h-4 ${item.active ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-slate-300">{item.label}</span>
                  <span className={`text-[8px] font-mono font-bold ${item.active ? 'text-emerald-500' : 'text-slate-600'}`}>{item.active ? 'ON' : 'OFF'}</span>
                </div>
              </div>
            ))}
          </section>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#05070a] relative">
        <header className="h-16 flex items-center justify-between px-10 border-b border-white/5 bg-[#0a0d12]/60 backdrop-blur-2xl z-30">
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${riskLevel > 0.6 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] font-mono">GATEWAY_V4 // CONTEXT_AWARE</span>
          </div>
          {activeStep && (
            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
              <Layers className="w-3 h-3 text-emerald-500 animate-spin" />
              <span className="text-[10px] font-black text-emerald-400 font-mono tracking-widest uppercase">{activeStep}</span>
            </div>
          )}
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-16 py-10 space-y-12 no-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col gap-3 w-full max-w-[1050px]">
                <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] opacity-40 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? 'OPERATOR' : 'SENTINEL_IDS'}
                </div>
                
                {m.role === 'user' ? (
                  <div className="px-10 py-7 rounded-[32px] border border-white/10 bg-[#1a2b5a]/80 backdrop-blur-md text-white self-end shadow-2xl">
                    <p className="font-medium text-lg leading-relaxed">{m.text}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-black/60 border border-emerald-500/10 rounded-[32px] p-8 max-h-[400px] flex flex-col gap-4">
                      <div className="flex items-center gap-2 text-emerald-500 mb-2">
                        <Waypoints className="w-4 h-4" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Intent Map</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                        <pre className="text-[10px] font-mono text-emerald-400/80 bg-black/40 p-4 rounded-xl border border-white/5">{JSON.stringify(m.intent, null, 2)}</pre>
                      </div>
                    </div>
                    
                    <div className={`rounded-[32px] p-8 max-h-[400px] border shadow-2xl flex flex-col gap-4 ${m.blocked ? 'bg-red-500/5 border-red-500/20 text-red-400' : 'bg-blue-900/5 border-blue-500/10 text-blue-300'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu className={`w-4 h-4 ${m.blocked ? 'text-red-500' : 'text-blue-400'}`} />
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Logic Verdict</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {m.blocked && (
                           <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                             <p className="text-[9px] font-black uppercase text-red-500 mb-1">Block Reason:</p>
                             <p className="text-[11px] font-bold text-red-400">{(m as any).reason}</p>
                           </div>
                        )}
                        <p className="font-mono text-[11px] leading-relaxed italic opacity-90">{m.reaction}</p>
                      </div>
                    </div>

                    <div className="bg-[#12161e] border border-white/5 rounded-[32px] p-8 max-h-[400px] flex flex-col gap-4 shadow-2xl">
                      <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <MessageSquare className="w-4 h-4" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Contextual AI</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
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
                <AlertTriangle className="w-4 h-4 text-emerald-500 animate-bounce" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest font-mono">Simulating Logical Outcomes...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-16 pt-0">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 'Boost RPM of axis 1 by 500' or 'Turn off sprinkler'"
              className="w-full bg-[#0a0d12] border border-white/10 rounded-[40px] py-9 pl-10 pr-32 text-lg font-mono focus:border-emerald-500/40 transition-all outline-none shadow-3xl text-white placeholder:text-slate-700"
            />
            <button type="submit" disabled={!input.trim() || isProcessing} className="absolute right-6 top-6 bottom-6 w-20 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 rounded-[28px] text-white transition-all disabled:opacity-20 shadow-lg shadow-emerald-900/20">
              <Send className="w-6 h-6" />
            </button>
          </form>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
