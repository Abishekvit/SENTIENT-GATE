
import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldAlert, Activity, Network, Power, RefreshCw, Fan, Lock, 
  Lightbulb, Fingerprint, BrainCircuit, Waypoints, 
  Terminal as TerminalIcon, Cpu, Thermometer, Gauge, TrendingUp, User, Zap, Droplets, UploadCloud,
  Search, AlertTriangle, Code, Download, Settings, Flame
} from 'lucide-react';
import { SecurityLog, ChatMessage } from './types';
import { AdminMiddleware } from './AdminMiddleware';
import { callHardwareReactionAgent, callConversationalAgent } from './services/gemini';
import { LocalIntentParser } from './services/intentParser';
import { TelemetryState } from './constants/telemetryData';
import { logStorage } from './services/logStorage';
import { telemetryStore } from './services/telemetryStore';
import { CSVConnector, CSVExtractionResult } from './services/csvConnector';
import Terminal from './components/Terminal';

const StatCard: React.FC<{ label: string, value: string | number, trend: string, icon: any, color: string }> = ({ label, value, trend, icon: Icon, color }) => (
  <div className="bg-white dark:bg-[#0d0202] border border-slate-200 dark:border-red-900/20 p-4 rounded-3xl group hover:border-red-500/40 transition-all duration-300 shadow-sm relative overflow-hidden">
    <div className="absolute top-0 right-0 p-2 opacity-[0.02] group-hover:opacity-10 transition-opacity">
      <Icon className="w-10 h-10" />
    </div>
    <div className="flex items-center gap-2 mb-2">
      <div className={`p-2 bg-slate-50 dark:bg-red-500/10 rounded-xl ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-[9px] font-black text-slate-400 dark:text-red-500/60 uppercase tracking-widest">{label}</span>
    </div>
    <div className="flex items-end justify-between relative z-10">
      <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{value}</span>
      <div className={`flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-red-500/10 text-slate-500 dark:text-red-400`}>
        {trend}
      </div>
    </div>
  </div>
);

const GaugeRing: React.FC<{ label: string, count: number, color: string }> = ({ label, count, color }) => (
  <div className="flex flex-col items-center group">
    <div className="relative w-16 h-16 mb-2">
      <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-100 dark:stroke-red-950/20" strokeWidth="3" />
        <circle 
          cx="18" cy="18" r="16" fill="none" 
          className={`stroke-current ${color} transition-all duration-1000`} 
          strokeWidth="3" 
          strokeDasharray={`${Math.min(100, count)}, 100`} 
          strokeLinecap="round" 
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black text-slate-900 dark:text-white">{count}</span>
      </div>
    </div>
    <span className="text-[8px] font-black uppercase text-slate-400 dark:text-red-900/50 tracking-widest group-hover:text-red-500 transition-colors">{label}</span>
  </div>
);

const TelemetryGridNode: React.FC<{ label: string, value: string | number, unit: string, icon: any, color: string, isChanging: boolean }> = ({ label, value, unit, icon: Icon, color, isChanging }) => (
  <div className={`p-3.5 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isChanging ? 'bg-red-500/5 dark:bg-red-500/10 border-red-500/50 scale-[1.02] z-10' : 'bg-white dark:bg-[#120404] border-slate-100 dark:border-red-900/10 hover:border-red-500/30'}`}>
    <div className="flex items-center gap-2 mb-2 relative z-10">
      <div className={`p-1.5 bg-slate-50 dark:bg-red-900/40 rounded-lg ${color} ${isChanging ? 'animate-pulse' : ''}`}>
        <Icon className="w-3 h-3" />
      </div>
      <span className="text-[9px] font-black uppercase text-slate-400 dark:text-red-700 tracking-widest truncate">{label}</span>
    </div>
    <div className="flex items-baseline gap-1 relative z-10">
      <span className={`text-lg font-black tracking-tight transition-colors ${isChanging ? 'text-red-600 dark:text-white' : 'text-slate-900 dark:text-red-50'}`}>{typeof value === 'number' ? value.toFixed(1) : value}</span>
      <span className="text-[8px] font-black text-slate-300 dark:text-red-950/40">{unit}</span>
    </div>
    {isChanging && <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />}
  </div>
);

const AdminApp: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<TelemetryState>(telemetryStore.getState());
  const [accumulatedRisk, setAccumulatedRisk] = useState(0);
  const [displayRisk, setDisplayRisk] = useState(0);
  const [changingKey, setChangingKey] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<CSVExtractionResult | null>(null);
  
  const middleware = useRef(new AdminMiddleware());
  const csvConnector = useRef(new CSVConnector());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevStateRef = useRef<TelemetryState>(liveState);

  // Sync Threat Score from global logs
  useEffect(() => {
    const syncRisk = () => {
      const history = logStorage.getTransactions();
      const riskyPrompts = history.filter(t => 
        t.agentic_evaluation.risk_score > 0.4 || t.final_decision === 'DENIED'
      ).length;
      setAccumulatedRisk(Math.min(1.0, riskyPrompts * 0.25)); 
    };
    const interval = setInterval(syncRisk, 1000);
    return () => clearInterval(interval);
  }, []);

  // Smooth Threat Score transition
  useEffect(() => {
    const interval = setInterval(() => {
      const jitter = (Math.random() - 0.5) * 0.005;
      setDisplayRisk(prev => {
        const diff = (accumulatedRisk - prev) * 0.05;
        return Math.max(0, Math.min(1.0, prev + diff + jitter));
      });
    }, 50);
    return () => clearInterval(interval);
  }, [accumulatedRisk]);

  // Unified Telemetry Subscription with Change Detection
  useEffect(() => {
    const unsubscribe = telemetryStore.subscribe((state) => {
      // Find ALL changed keys to trigger visual feedback
      const changedKey = Object.keys(state).find(k => (state as any)[k] !== (prevStateRef.current as any)[k]);
      
      if (changedKey) {
        setChangingKey(changedKey);
        // Reset highlight after 1s
        setTimeout(() => setChangingKey(null), 1000);
      }
      
      prevStateRef.current = state;
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
      setActiveStep('TOKEN_VERIFY');
      const intents = LocalIntentParser.parse(rawInput);
      const normalizedCommand = intents.length > 0
        ? intents.map(i => `${i.operation} ${i.primary_parameter} ${i.value} ${i.modifier_type}`).join('\n')
        : rawInput;
      
      setActiveStep('ROOT_INJECT');
      const middlewareResult = await middleware.current.process(rawInput, normalizedCommand, liveState);
      
      // Merge logs from middleware
      setLogs(prev => [...prev, ...middlewareResult.logs]);
      
      if (middlewareResult.allowed && middlewareResult.predictedState) {
        telemetryStore.updateState(middlewareResult.predictedState);
      }

      setActiveStep('HW_RESONANCE');
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
        transaction_id: `adm_txn_${Date.now()}`,
        timestamp: new Date().toISOString(),
        input_layer: { user_prompt: rawInput, normalized_prompt: normalizedCommand, obfuscation_check: 'PASS', vector_similarity_score: middlewareResult.semanticRisk },
        context_layer: { connector_used: "SENTINEL_ROOT_X", live_state: liveState },
        agentic_evaluation: { agent_role: "Root Sentinel", reasoning: middlewareResult.reason || "Authenticated Root Directive.", verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', risk_score: middlewareResult.riskScore },
        final_decision: middlewareResult.allowed ? 'AUTHORIZED' : 'DENIED'
      });
    } catch (error) {
      setLogs(prev => [...prev, { id: 'err', timestamp: Date.now(), type: 'CRITICAL', message: 'BUS_FAULT: INJECTION_FAILED' }]);
    } finally {
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = csvConnector.current.extract(text);
      setExtractedData(result);
      setLogs(prev => [...prev, { id: 'csv-' + Date.now(), timestamp: Date.now(), type: 'INFO', message: `Shard Ingress: ${file.name}` }]);
    };
    reader.readAsText(file);
  };

  const applyCsvData = () => {
    if (extractedData) {
      telemetryStore.updateState(extractedData.partialState);
      setExtractedData(null);
      setLogs(prev => [...prev, { id: 'csv-f-' + Date.now(), timestamp: Date.now(), type: 'INFO', message: 'Shard Delta Applied' }]);
    }
  };

  const telemetryMetrics = [
    { key: 'axis_1_rpm', label: 'A1 RPM', unit: 'RPM', val: liveState.axis_1_rpm, icon: Gauge, color: 'text-red-500' },
    { key: 'axis_1_temp_c', label: 'A1 Temp', unit: '°C', val: liveState.axis_1_temp_c, icon: Thermometer, color: 'text-red-600' },
    { key: 'axis_1_torque_nm', label: 'A1 Torque', unit: 'Nm', val: liveState.axis_1_torque_nm, icon: TrendingUp, color: 'text-red-400' },
    { key: 'axis_2_rpm', label: 'A2 RPM', unit: 'RPM', val: liveState.axis_2_rpm, icon: RefreshCw, color: 'text-red-500' },
    { key: 'axis_2_temp_c', label: 'A2 Temp', unit: '°C', val: liveState.axis_2_temp_c, icon: Thermometer, color: 'text-red-600' },
    { key: 'axis_2_torque_nm', label: 'A2 Torque', unit: 'Nm', val: liveState.axis_2_torque_nm, icon: TrendingUp, color: 'text-red-400' },
    { key: 'power_draw_kw', label: 'Power', unit: 'kW', val: liveState.power_draw_kw, icon: Zap, color: 'text-red-500' },
    { key: 'voltage_v', label: 'Voltage', unit: 'V', val: liveState.voltage_v, icon: Cpu, color: 'text-red-600' },
    { key: 'main_pressure_psi', label: 'PSI', unit: 'PSI', val: liveState.main_pressure_psi, icon: Droplets, color: 'text-red-400' },
    { key: 'coolant_flow_lpm', label: 'Coolant Flow', unit: 'LPM', val: liveState.coolant_flow_lpm, icon: RefreshCw, color: 'text-red-500' },
    { key: 'network_jitter_ms', label: 'Link Jitter', unit: 'ms', val: liveState.network_jitter_ms, icon: Network, color: 'text-red-300' },
    { key: 'controller_cpu_load', label: 'CPU Load', unit: '%', val: liveState.controller_cpu_load, icon: Settings, color: 'text-red-200' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050000] text-slate-900 dark:text-red-100 font-sans p-4 md:p-6 space-y-6 overflow-x-hidden transition-colors duration-300">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-red-900/30 pb-6">
        <div className="flex items-center gap-4">
          <div className="relative p-3 bg-red-600/10 rounded-2xl border border-red-600/30 shadow-sm">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter uppercase italic flex items-center gap-2 dark:text-white">
              Root Sentinel <span className="px-2 py-0.5 bg-red-600/10 text-red-600 text-[8px] border border-red-600/20 rounded-full tracking-widest font-black ml-1 uppercase animate-pulse">DIRECTIVE_X</span>
            </h1>
            <p className="text-slate-400 dark:text-red-900/50 text-[9px] font-black uppercase tracking-[0.3em] mt-1 italic">
              KERNEL_ACCESS // AUTH:ROOT_SENTINEL_V4
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => logStorage.exportLogs()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-red-600/10 border border-slate-200 dark:border-red-900/40 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-red-600/20 shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Export Audit
          </button>
          
          <div className="flex items-center gap-3 bg-white dark:bg-red-950/20 p-2 rounded-2xl border border-slate-200 dark:border-red-900/40 pr-6 shadow-sm">
            <div className="text-right">
              <p className="text-xs font-black text-slate-900 dark:text-white leading-none">Root Admin</p>
              <p className="text-[8px] text-slate-400 dark:text-red-500/50 font-mono tracking-widest uppercase mt-1">active@kernel</p>
            </div>
            <div className="w-8 h-8 bg-slate-50 dark:bg-red-900/30 rounded-lg border border-slate-100 dark:border-red-900/40 flex items-center justify-center">
              <User className="w-4 h-4 text-red-500" />
            </div>
          </div>
        </div>
      </header>

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Kernels" value="12" trend="+8%" icon={Fingerprint} color="text-red-500" />
        <StatCard label="Shards" value="373" trend="+4%" icon={Waypoints} color="text-red-600" />
        <StatCard label="Nodes" value="369" trend="-2%" icon={Network} color="text-red-700" />
        <StatCard label="Links" value="15" trend="+5%" icon={Power} color="text-red-400" />
        <StatCard label="Logic Ops" value="4,704" trend="+3%" icon={Cpu} color="text-red-300" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT PANEL: RISK AMPLITUDE */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-[#0d0202] border border-slate-200 dark:border-red-900/30 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[300px] shadow-sm relative overflow-hidden group">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-red-900/70 mb-8 self-start italic">Threat Amplitude</h3>
            
            <div className="relative w-48 h-24 overflow-hidden mb-8">
              <div className="absolute top-0 left-0 w-full h-48 border-[12px] border-slate-50 dark:border-red-950/20 rounded-full" />
              <div 
                className="absolute top-0 left-0 w-full h-48 border-[12px] rounded-full transition-all duration-300 shadow-sm"
                style={{ 
                  clipPath: `inset(0px 0px 50% 0px)`,
                  transform: `rotate(${(displayRisk * 180) - 90}deg)`,
                  borderColor: displayRisk > 0.8 ? '#ef4444' : displayRisk > 0.4 ? '#f87171' : '#7f1d1d',
                }}
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center translate-y-2">
                <span className={`text-4xl font-black tracking-tighter transition-colors duration-300 ${displayRisk > 0.8 ? 'text-red-600 animate-pulse' : 'text-slate-800 dark:text-red-500'}`}>
                  {Math.round(displayRisk * 100)}%
                </span>
              </div>
            </div>
            
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-red-900/40">Violation Shard Index</p>
          </div>

          <div className="bg-white dark:bg-[#0d0202] border border-slate-200 dark:border-red-900/30 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-red-900/70 mb-6 italic">Force Overrides</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Sprinkler', active: liveState.fire_sprinkler_active === 1, icon: Droplets, color: 'text-red-500' },
                { label: 'Emergency', active: liveState.emergency_lights_active === 1, icon: Lightbulb, color: 'text-red-600' },
                { label: 'Ventilation', active: liveState.ventilation_active === 1, icon: Fan, color: 'text-red-400' },
                { label: 'MagLock', active: liveState.aux_maglock_active === 1, icon: Lock, color: 'text-red-700' },
              ].map((aux, i) => (
                <div key={i} className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center gap-3 ${aux.active ? 'bg-red-500/10 border-red-500/30 shadow-sm scale-[1.03]' : 'bg-slate-50 dark:bg-black/40 border-slate-100 dark:border-red-950/20 opacity-30 grayscale'}`}>
                  <aux.icon className={`w-5 h-5 ${aux.active ? aux.color : 'text-slate-400'} ${aux.active ? 'animate-pulse' : ''}`} />
                  <p className="text-[9px] font-black uppercase text-slate-700 dark:text-red-100 tracking-[0.2em]">{aux.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: CONSOLE & DIRECTIVE PIPELINE */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-[#0d0202] border border-slate-200 dark:border-red-900/30 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-red-900/70 mb-8 italic">System Diagnostic Shards</h3>
            <div className="grid grid-cols-5 gap-3">
              <GaugeRing label="Violation" count={Math.round(displayRisk * 100)} color="text-red-600" />
              <GaugeRing label="Nodes" count={369} color="text-red-800" />
              <GaugeRing label="Filtered" count={55} color="text-red-500" />
              <GaugeRing label="Logic Load" count={liveState.controller_cpu_load} color="text-red-400" />
              <GaugeRing label="Net Health" count={Math.round(100 - (displayRisk * 100))} color="text-red-900" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0a0101] border border-slate-200 dark:border-red-900/40 rounded-3xl flex flex-col overflow-hidden shadow-sm relative">
            <div className="p-6 border-b border-slate-200 dark:border-red-900/40 flex items-center gap-4 bg-slate-50 dark:bg-red-950/10">
              <div className="p-2.5 bg-red-600/10 rounded-xl border border-red-600/30">
                <BrainCircuit className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Directive Pipeline</span>
              {activeStep && (
                <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-red-600/10 border border-red-600/20 rounded-full">
                  <RefreshCw className="w-3 h-3 text-red-600 animate-spin" />
                  <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">{activeStep}</span>
                </div>
              )}
            </div>
            
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar h-[350px]">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                  <Search className="w-10 h-10 mb-3 text-slate-300 dark:text-red-800" />
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-red-700">Awaiting Signal Injection...</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-6 duration-300`}>
                  <div className="flex flex-col gap-3 w-full max-w-[95%]">
                    {m.role === 'user' ? (
                      <div className="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-red-900/30 border border-slate-200 dark:border-red-500/30 text-slate-900 dark:text-white font-black text-xs self-end shadow-sm">
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-50 dark:bg-[#1a0404] p-4 rounded-2xl border border-slate-200 dark:border-red-900/20 shadow-sm space-y-3">
                          <div className="flex items-center gap-2 text-red-600">
                            <Code className="w-3.5 h-3.5" />
                            <h4 className="text-[8px] font-black uppercase tracking-widest">JSON_INTENT</h4>
                          </div>
                          <div className="bg-white dark:bg-black/50 p-3 rounded-xl border border-slate-100 dark:border-red-900/20 overflow-x-auto custom-scrollbar">
                            <pre className="text-[9px] font-mono text-slate-500 dark:text-red-400/70 leading-relaxed">{JSON.stringify(m.intent, null, 2)}</pre>
                          </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-[#0f0202] p-4 rounded-2xl border border-slate-200 dark:border-red-500/20 shadow-sm space-y-3">
                          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                            <Activity className="w-3.5 h-3.5 text-slate-400 dark:text-red-400" />
                            <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-red-100">HW_ECHO</h4>
                          </div>
                          <p className="text-[10px] font-medium text-slate-700 dark:text-red-100/80 italic leading-relaxed">"{m.reaction}"</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSend} className="p-6 bg-slate-50 dark:bg-red-950/10 border-t border-slate-200 dark:border-red-900/40">
              <div className="relative">
                <div className="relative flex items-center bg-white dark:bg-[#0d0101] border border-slate-300 dark:border-red-900/60 rounded-xl overflow-hidden shadow-sm">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="INJECT ROOT CORE DIRECTIVE..."
                    className="w-full bg-transparent py-4 pl-6 pr-28 text-xs font-black outline-none text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-red-900/30 uppercase tracking-tighter"
                  />
                  <button 
                    disabled={!input.trim() || isProcessing} 
                    className="absolute right-2 top-2 bottom-2 px-6 bg-red-600 hover:bg-red-500 disabled:bg-slate-200 dark:disabled:bg-red-950/80 text-white rounded-lg font-black uppercase text-[9px] tracking-widest transition-all shadow-sm"
                  >
                    INJECT
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* TELEMETRY MATRIX */}
        <div className="col-span-12 bg-white dark:bg-[#0d0202] border border-slate-200 dark:border-red-900/30 rounded-3xl p-8 shadow-sm relative overflow-hidden transition-all">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
               <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-red-900/60 italic">Hardware Resonance Grid</h3>
               <div className="px-3 py-1 bg-red-600/10 text-red-500 rounded-full text-[8px] font-black uppercase tracking-widest border border-red-600/20">
                  SYNC: OK
               </div>
            </div>
            <div className="flex gap-3">
               <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-red-950/30 border border-slate-200 dark:border-red-900/50 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-red-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm">
                 <UploadCloud className="w-3.5 h-3.5" /> Import Shard
               </button>
               {extractedData && (
                 <button onClick={applyCsvData} className="px-6 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md animate-pulse border border-red-400/40">
                   Execute Merge
                 </button>
               )}
               <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && processFile(e.target.files[0])} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {telemetryMetrics.map((tm) => (
              <TelemetryGridNode 
                key={tm.key} 
                label={tm.label} 
                value={tm.val} 
                unit={tm.unit} 
                icon={tm.icon} 
                color={tm.color} 
                isChanging={changingKey === tm.key} 
              />
            ))}
          </div>
        </div>

        {/* AUDIT LOGS */}
        <div className="col-span-12">
           <div className="flex items-center gap-4 mb-6">
             <div className="p-3 bg-slate-100 dark:bg-red-900/15 rounded-xl border border-slate-200 dark:border-red-900/30 shadow-sm">
               <TerminalIcon className="w-5 h-5 text-red-600" />
             </div>
             <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 dark:text-red-900/60 italic">Root System Audit</h3>
           </div>
           <Terminal logs={logs} />
        </div>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.05); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.1); }
      `}</style>
    </div>
  );
};

export default AdminApp;
