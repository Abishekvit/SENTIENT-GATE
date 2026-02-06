
import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, Activity, Send, Cpu, Thermometer, Gauge, TrendingUp, AlertCircle, User, Zap,
  Droplets, BarChart3, BrainCircuit, ArrowRightLeft, Layers, Waypoints, MessageSquare,
  Network, Settings, Lightbulb, Fan, Lock, Flame, ChevronRight, ZapOff, ShieldCheck,
  Power, RefreshCw
} from 'lucide-react';
import { ChatMessage, MiddlewareResponse } from './types';
import { SentinelMiddleware } from './services/middleware';
import { callHardwareReactionAgent, callConversationalAgent } from './services/gemini';
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
    const jitterInterval = setInterval(() => {
      const state = telemetryStore.getState();
      const jitter = (val: number, range: number = 0.005) => {
        if (val === 0) return 0;
        const delta = val * (Math.random() * range * 2 - range);
        return Number((val + delta).toFixed(2));
      };

      telemetryStore.updateState({
        axis_1_temp_c: jitter(state.axis_1_temp_c, 0.003),
        axis_1_torque_nm: jitter(state.axis_1_torque_nm, 0.002),
        axis_2_temp_c: jitter(state.axis_2_temp_c, 0.003),
        axis_2_torque_nm: jitter(state.axis_2_torque_nm, 0.002),
        power_draw_kw: jitter(state.power_draw_kw, 0.008),
        voltage_v: jitter(state.voltage_v, 0.001),
        network_jitter_ms: jitter(state.network_jitter_ms, 0.1),
        controller_cpu_load: Math.min(100, Math.max(0, jitter(state.controller_cpu_load, 0.05))),
        main_pressure_psi: jitter(state.main_pressure_psi, 0.002),
        coolant_flow_lpm: jitter(state.coolant_flow_lpm, 0.005)
      });
    }, 1200);
    return () => clearInterval(jitterInterval);
  }, []);

  useEffect(() => {
    const unsubscribe = telemetryStore.subscribe((state) => setLiveState(state));
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
      setActiveStep('VECTOR_SCAN');
      const intents = LocalIntentParser.parse(rawInput);
      const normalizedCommand = intents.length > 0
        ? intents.map(i => `${i.operation} ${i.primary_parameter} ${i.value} ${i.modifier_type}`).join('\n')
        : rawInput;

      setActiveStep('LOGIC_VERDICT');
      const middlewareResult = await middleware.current.process(rawInput, normalizedCommand, liveState);
      setRiskLevel(middlewareResult.riskScore);

      if (middlewareResult.allowed && middlewareResult.predictedState) {
        telemetryStore.updateState(middlewareResult.predictedState);
        const changedKeys = Object.keys(middlewareResult.predictedState);
        if (changedKeys.length > 0) {
          setLastUpdatedKey(changedKeys[0]);
          setTimeout(() => setLastUpdatedKey(null), 3000);
        }
      }

      setActiveStep('GENERATING_RESPONSE');
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
        input_layer: { user_prompt: rawInput, normalized_prompt: normalizedCommand, obfuscation_check: 'PASS', vector_similarity_score: middlewareResult.semanticRisk },
        context_layer: { connector_used: "SENTINEL_CORE_V4", live_state: liveState },
        agentic_evaluation: { agent_role: "Logical Evaluator", reasoning: middlewareResult.reason || "Logic validated.", verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', risk_score: middlewareResult.riskScore },
        final_decision: middlewareResult.allowed ? 'AUTHORIZED' : 'DENIED'
      });
    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', text: 'Hardware interface communication timeout.', timestamp: Date.now() }]);
    } finally {
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const getPercentage = (val: number, max: number) => Math.min(100, Math.abs((val / max) * 100));

  const telemetryItems = [
    { key: 'axis_1_rpm', label: 'Axis 1 Speed', val: liveState.axis_1_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-blue-500 dark:text-blue-400', bar: 'bg-blue-500' },
    { key: 'axis_1_temp_c', label: 'Axis 1 Temp', val: liveState.axis_1_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
    { key: 'axis_1_torque_nm', label: 'Axis 1 Torque', val: liveState.axis_1_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-500 dark:text-orange-400', bar: 'bg-orange-500' },
    { key: 'axis_2_rpm', label: 'Axis 2 Speed', val: liveState.axis_2_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500' },
    { key: 'axis_2_temp_c', label: 'Axis 2 Temp', val: liveState.axis_2_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-teal-600 dark:text-teal-400', bar: 'bg-teal-500' },
    { key: 'axis_2_torque_nm', label: 'Axis 2 Torque', val: liveState.axis_2_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-yellow-600 dark:text-yellow-500', bar: 'bg-yellow-500' },
    { key: 'main_pressure_psi', label: 'Pneumatics', val: liveState.main_pressure_psi, max: SAFETY_THRESHOLDS.max_pressure_psi, unit: 'PSI', icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
    { key: 'coolant_flow_lpm', label: 'Coolant Flow', val: liveState.coolant_flow_lpm, max: 20, unit: 'LPM', icon: Droplets, color: 'text-cyan-600 dark:text-cyan-400', bar: 'bg-cyan-500' },
    { key: 'power_draw_kw', label: 'Grid Power', val: liveState.power_draw_kw, max: 5, unit: 'kW', icon: Zap, color: 'text-amber-500 dark:text-amber-400', bar: 'bg-amber-500' },
    { key: 'voltage_v', label: 'Main Bus', val: liveState.voltage_v, max: 240, unit: 'V', icon: Cpu, color: 'text-red-500 dark:text-red-400', bar: 'bg-red-500' },
    { key: 'network_jitter_ms', label: 'Link Jitter', val: liveState.network_jitter_ms, max: 50, unit: 'ms', icon: Network, color: 'text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' },
    { key: 'controller_cpu_load', label: 'CPU Load', val: liveState.controller_cpu_load, max: 100, unit: '%', icon: Settings, color: 'text-slate-600 dark:text-slate-400', bar: 'bg-slate-500' },
  ];

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#020408] text-slate-900 dark:text-slate-100 overflow-hidden font-sans selection:bg-emerald-500/30 transition-colors duration-500">
      {/* Sidebar - Telemetry Matrix */}
      <aside className="w-[480px] bg-white dark:bg-[#080a0f] border-r border-slate-200 dark:border-white/5 flex flex-col overflow-hidden z-40 relative shadow-2xl dark:shadow-none transition-colors duration-500">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" />
        
        <div className="p-8 flex items-center gap-4 mb-2">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 blur-lg opacity-20 animate-pulse" />
            <div className="relative p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/30">
              <Shield className="w-7 h-7 text-emerald-600 dark:text-emerald-500" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase leading-none">Sentinel IDS</h1>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] text-slate-500 dark:text-slate-500 font-mono font-bold tracking-[0.2em] uppercase text-nowrap">Control Layer // V4.0.2</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-10 space-y-10">
          {liveState.hazard_detected !== 'NONE' && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-[28px] p-5 relative overflow-hidden group shadow-sm transition-colors duration-500">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
              <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-2">
                <Flame className="w-5 h-5 animate-bounce" />
                <span className="text-xs font-black uppercase tracking-widest italic">HAZARD: {liveState.hazard_detected}</span>
              </div>
              <p className="text-[10px] text-red-700 dark:text-red-400/70 font-mono leading-relaxed">Logic filters active. Dangerous overrides will be auto-discarded to prevent catastrophic system failure.</p>
            </div>
          )}

          <section>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-500" /> System Matrix
              </span>
              <div className="flex items-center gap-2 text-[8px] font-mono text-slate-400 dark:text-slate-700">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> LIVE_SYNC
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {telemetryItems.map((item, idx) => (
                <div key={idx} className={`bg-slate-50 dark:bg-[#0d1117] p-4 rounded-[24px] border transition-all duration-500 relative group overflow-hidden ${lastUpdatedKey === item.key ? 'border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'border-slate-200 dark:border-white/[0.03] hover:border-emerald-500/20 dark:hover:border-white/10'}`}>
                  {lastUpdatedKey === item.key && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full m-3 animate-ping" />}
                  <div className="flex items-center gap-2 mb-3 opacity-60 group-hover:opacity-100 transition-opacity">
                    <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                    <span className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest truncate">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1 justify-between mb-3">
                    <span className="text-lg font-black font-mono text-slate-900 dark:text-white tracking-tighter">{item.val.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">{item.unit}</span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${item.bar}`} 
                      style={{ width: `${getPercentage(item.val, item.max)}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                <Power className="w-4 h-4 text-blue-600 dark:text-blue-500" /> Aux Interlocks
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Sprinkler', active: liveState.fire_sprinkler_active === 1, icon: Droplets },
                { label: 'Emergency', active: liveState.emergency_lights_active === 1, icon: Lightbulb },
                { label: 'Ventilation', active: liveState.ventilation_active === 1, icon: Fan },
                { label: 'MagLock', active: liveState.aux_maglock_active === 1, icon: Lock },
              ].map((item, idx) => (
                <div key={idx} className={`p-4 rounded-[24px] border transition-all duration-700 flex items-center gap-4 ${item.active ? 'bg-emerald-500/10 border-emerald-500/30 shadow-sm' : 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-white/[0.03] opacity-30 grayscale'}`}>
                  <div className={`p-2.5 rounded-xl ${item.active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-inner' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">{item.label}</span>
                    <span className={`text-[8px] font-mono font-bold ${item.active ? 'text-emerald-600 dark:text-emerald-500 animate-pulse' : 'text-slate-500 dark:text-slate-600'}`}>{item.active ? 'ONLINE' : 'STANDBY'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#05070a] relative transition-colors duration-500">
        <header className="h-20 flex items-center justify-between px-12 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#080a0f]/80 backdrop-blur-3xl z-30 shadow-sm transition-colors duration-500">
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-3 px-4 py-2 rounded-full border ${riskLevel > 0.6 ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-500'}`}>
              <div className={`w-2 h-2 rounded-full ${riskLevel > 0.6 ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] font-mono">Kernel Security: {riskLevel > 0.6 ? 'Shielding' : 'Nominal'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {activeStep && (
              <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-[18px] flex items-center gap-3 shadow-lg shadow-emerald-500/5 transition-colors duration-500">
                <BrainCircuit className="w-4 h-4 text-emerald-600 dark:text-emerald-500 animate-spin" />
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-widest uppercase">{activeStep}</span>
              </div>
            )}
          </div>
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-16 py-12 space-y-16 no-scrollbar scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
              <ShieldCheck className="w-24 h-24 mb-6 text-emerald-600 dark:text-emerald-500" />
              <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-white">System Ready</p>
              <p className="text-xs font-mono mt-2 tracking-widest uppercase text-slate-500 dark:text-slate-400">Awaiting Operator Directive</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-8 duration-500`}>
              <div className="flex flex-col gap-4 w-full max-w-[1100px]">
                <div className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] opacity-40 dark:opacity-30 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {m.role === 'user' ? <User className="w-4 h-4" /> : <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />}
                  {m.role === 'user' ? 'Operator' : 'Sentinel Node V4'}
                </div>

                {m.role === 'user' ? (
                  <div className="px-10 py-8 rounded-[40px] bg-slate-800 dark:bg-gradient-to-br dark:from-[#1a2b5a] dark:to-[#0a153a] border border-white/10 text-white self-end shadow-2xl relative group transition-colors duration-500">
                    <div className="absolute top-4 left-4 opacity-10 group-hover:opacity-30 transition-opacity">
                      <Zap className="w-8 h-8" />
                    </div>
                    <p className="font-medium text-xl leading-relaxed relative z-10">{m.text}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                    {/* Process Step 1: Semantic Mapping */}
                    <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/5 rounded-[36px] p-8 flex flex-col gap-6 shadow-sm dark:shadow-xl hover:border-emerald-500/20 transition-all duration-500">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Waypoints className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                          <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500">Extracted Intents</h3>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400 dark:text-slate-700">OK</span>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 bg-slate-50 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-white/5 p-5 transition-colors duration-500">
                        <pre className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400/70 leading-relaxed whitespace-pre-wrap">{JSON.stringify(m.intent, null, 2)}</pre>
                      </div>
                    </div>

                    {/* Process Step 2: Safety Analysis */}
                    <div className={`rounded-[36px] p-8 border shadow-sm dark:shadow-2xl flex flex-col gap-6 transition-all duration-700 ${m.blocked ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/5 dark:border-red-500/20 dark:text-red-400' : 'bg-white dark:bg-[#12161e] border-blue-100 dark:border-blue-500/10 text-blue-800 dark:text-blue-300'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {m.blocked ? <ZapOff className="w-5 h-5 text-red-600 dark:text-red-500" /> : <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                          <h3 className={`text-[11px] font-black uppercase tracking-widest ${m.blocked ? 'text-red-600 dark:text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>Guard Verdict</h3>
                        </div>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {m.blocked && (
                           <div className="mb-5 p-5 bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl relative overflow-hidden transition-colors duration-500">
                             <div className="absolute top-0 right-0 p-3 opacity-10"><AlertCircle className="w-12 h-12" /></div>
                             <p className="text-[10px] font-black uppercase text-red-600 dark:text-red-500 mb-2 tracking-widest">Logic Refusal:</p>
                             <p className="text-sm font-bold text-red-700 dark:text-red-400 leading-relaxed italic">{(m as any).reason}</p>
                           </div>
                        )}
                        <p className="font-mono text-[11px] leading-relaxed italic opacity-80 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{m.reaction}</p>
                      </div>
                    </div>

                    {/* Process Step 3: Conversational Bridge */}
                    <div className="bg-white dark:bg-[#12161e] border border-slate-200 dark:border-white/5 rounded-[36px] p-8 flex flex-col gap-6 shadow-sm dark:shadow-xl transition-colors duration-500">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Response Link</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 bg-slate-50 dark:bg-black/20 p-5 rounded-2xl transition-colors duration-500">
                        <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300 font-medium italic">"{(m as any).chatResponse}"</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#0e1218] rounded-[32px] px-10 py-6 border border-slate-200 dark:border-white/10 animate-pulse flex items-center gap-5 shadow-sm dark:shadow-2xl transition-colors duration-500">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500 blur-md opacity-20 animate-ping" />
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Processing Node: {activeStep}</span>
                  <span className="text-[9px] font-mono text-slate-500 dark:text-slate-500 uppercase tracking-tighter">Evaluating safety envelopes...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Command Input Area */}
        <div className="p-16 pt-4 pb-12 bg-gradient-to-t from-slate-200 dark:from-[#020408] to-transparent transition-colors duration-500">
          <form onSubmit={handleSend} className="max-w-5xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-[44px] blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter directive... (e.g. 'Axis 1 RPM to 2000')"
              className="w-full bg-white dark:bg-[#0a0d12] border border-slate-300 dark:border-white/10 rounded-[44px] py-10 pl-12 pr-40 text-xl font-mono focus:border-emerald-500/50 transition-all outline-none shadow-2xl dark:shadow-3xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 relative z-10"
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isProcessing} 
              className="absolute right-6 top-6 bottom-6 px-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-600 rounded-[32px] text-white transition-all shadow-xl shadow-emerald-900/20 z-20 group"
            >
              <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </form>
          <div className="flex justify-center gap-10 mt-6 opacity-40 dark:opacity-20 pointer-events-none">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 dark:text-slate-100">Hardware Link: ACTIVE</span>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 dark:text-slate-100">Logic Filter: ENGAGED</span>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 dark:text-slate-100">Encryption: AES-256</span>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
};

export default App;
