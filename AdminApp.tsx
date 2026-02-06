
import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldAlert, Activity, Send, Cpu, Thermometer, Gauge, TrendingUp, AlertTriangle, User, Zap,
  Droplets, BarChart3, BrainCircuit, Waypoints, ArrowRightLeft, Download, History, LockOpen, 
  UploadCloud, MessageSquare, Network, Settings, ShieldQuestion, Power, RefreshCw, Flame,
  ShieldCheck, ZapOff, Fan, Lock, Lightbulb
} from 'lucide-react';
import { SecurityLog, ChatMessage, MiddlewareResponse } from './types';
import { AdminMiddleware } from './AdminMiddleware';
import { callHardwareReactionAgent, callConversationalAgent } from './services/gemini';
import { LocalIntentParser } from './services/intentParser';
import { TelemetryState } from './constants/telemetryData';
import { SAFETY_THRESHOLDS } from './constants/securityData';
import { logStorage } from './services/logStorage';
import { telemetryStore } from './services/telemetryStore';
import { CSVConnector, CSVExtractionResult } from './services/csvConnector';
import Terminal from './components/Terminal';

const AdminApp: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [lastUpdatedKey, setLastUpdatedKey] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<TelemetryState>(telemetryStore.getState());
  const [showHistory, setShowHistory] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<CSVExtractionResult | null>(null);
  
  const middleware = useRef(new AdminMiddleware());
  const csvConnector = useRef(new CSVConnector());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setActiveStep('ROOT_BYPASS');
      const intents = LocalIntentParser.parse(rawInput);
      const normalizedCommand = intents.length > 0
        ? intents.map(i => `${i.operation} ${i.primary_parameter} ${i.value} ${i.modifier_type}`).join('\n')
        : rawInput;
      
      setActiveStep('ADMIN_KERNEL_SCAN');
      const middlewareResult = await middleware.current.process(rawInput, normalizedCommand, liveState);
      setLogs(prev => [...prev, ...middlewareResult.logs]);

      if (middlewareResult.allowed && middlewareResult.predictedState) {
        telemetryStore.updateState(middlewareResult.predictedState);
        const changedKeys = Object.keys(middlewareResult.predictedState);
        if (changedKeys.length > 0) {
          setLastUpdatedKey(changedKeys[0]);
          setTimeout(() => setLastUpdatedKey(null), 3000);
        }
      }

      setActiveStep('REACTION_LOGGING');
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
        context_layer: { connector_used: "ADMIN_ROOT_V3", live_state: liveState },
        agentic_evaluation: { agent_role: "Root Analyst", reasoning: middlewareResult.reason || "Root check passed.", verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', risk_score: middlewareResult.riskScore },
        final_decision: middlewareResult.allowed ? 'AUTHORIZED' : 'DENIED'
      });
    } catch (error) {
      setLogs(prev => [...prev, { id: 'err', timestamp: Date.now(), type: 'CRITICAL', message: 'ADMIN_CORE_FAULT' }]);
    } finally {
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setLogs(prev => [...prev, { id: 'err', timestamp: Date.now(), type: 'BLOCK', message: 'CSV required.' }]);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = csvConnector.current.extract(text);
      setExtractedData(result);
    };
    reader.readAsText(file);
  };

  const applyCsvData = () => {
    if (extractedData) {
      telemetryStore.updateState(extractedData.partialState);
      setExtractedData(null);
      setFileName(null);
      setLogs(prev => [...prev, { id: 'csv-' + Date.now(), timestamp: Date.now(), type: 'INFO', message: 'Batch Uploaded' }]);
    }
  };

  const getPercentage = (val: number, max: number) => Math.min(100, Math.abs((val / max) * 100));

  const telemetryItems = [
    { key: 'axis_1_rpm', label: 'Axis 1 Speed', val: liveState.axis_1_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
    { key: 'axis_1_temp_c', label: 'Axis 1 Thermal', val: liveState.axis_1_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
    { key: 'axis_1_torque_nm', label: 'Axis 1 Torque', val: liveState.axis_1_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
    { key: 'axis_2_rpm', label: 'Axis 2 Speed', val: liveState.axis_2_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-amber-700 dark:text-amber-600', bar: 'bg-amber-700' },
    { key: 'axis_2_temp_c', label: 'Axis 2 Thermal', val: liveState.axis_2_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-red-700 dark:text-red-600', bar: 'bg-red-700' },
    { key: 'axis_2_torque_nm', label: 'Axis 2 Torque', val: liveState.axis_2_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-700 dark:text-orange-600', bar: 'bg-orange-700' },
    { key: 'main_pressure_psi', label: 'Pneumatics', val: liveState.main_pressure_psi, max: SAFETY_THRESHOLDS.max_pressure_psi, unit: 'PSI', icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
    { key: 'coolant_flow_lpm', label: 'Coolant Flow', val: liveState.coolant_flow_lpm, max: 20, unit: 'LPM', icon: Droplets, color: 'text-cyan-600 dark:text-cyan-400', bar: 'bg-cyan-500' },
    { key: 'power_draw_kw', label: 'Grid Power', val: liveState.power_draw_kw, max: 5, unit: 'kW', icon: Zap, color: 'text-yellow-600 dark:text-yellow-400', bar: 'bg-yellow-500' },
    { key: 'voltage_v', label: 'Main Bus', val: liveState.voltage_v, max: 240, unit: 'V', icon: Cpu, color: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
    { key: 'network_jitter_ms', label: 'Link Jitter', val: liveState.network_jitter_ms, max: 50, unit: 'ms', icon: Network, color: 'text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' },
    { key: 'controller_cpu_load', label: 'CPU Load', val: liveState.controller_cpu_load, max: 100, unit: '%', icon: Settings, color: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-500' },
  ];

  return (
    <div className="flex h-screen bg-red-50 dark:bg-[#0a0505] text-slate-900 dark:text-slate-100 overflow-hidden font-sans selection:bg-red-500/30 transition-colors duration-500">
      {/* Sidebar - Root Control Panel */}
      <aside className="w-[480px] bg-white dark:bg-[#150808] border-r border-red-200 dark:border-red-500/20 flex flex-col overflow-hidden z-40 relative shadow-2xl dark:shadow-none transition-colors duration-500">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0" />
        
        <div className="p-8 flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500 blur-lg opacity-20 animate-pulse" />
              <div className="relative p-3 bg-red-500/10 rounded-2xl border border-red-500/30">
                <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-500" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase leading-none">Root Access</h1>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <p className="text-[10px] text-red-600 dark:text-red-500/70 font-mono font-bold tracking-[0.2em] uppercase">Unrestricted // V4.0.2</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => logStorage.exportLogs()} className="p-2.5 rounded-xl border bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-600 transition-all" title="Export Audit JSON">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => setShowHistory(!showHistory)} className={`p-2.5 rounded-xl border transition-all ${showHistory ? 'bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400'}`} title="Toggle History">
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-10 space-y-10">
          {!showHistory ? (
            <>
              {liveState.hazard_detected !== 'NONE' && (
                <div className="bg-red-50 border border-red-200 dark:bg-red-500/10 dark:border-red-500/30 rounded-[28px] p-5 relative overflow-hidden group shadow-sm transition-colors duration-500">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500 animate-pulse" />
                  <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-2">
                    <Flame className="w-5 h-5 animate-bounce" />
                    <span className="text-xs font-black uppercase tracking-widest italic text-nowrap">ROOT_OVERRIDE_ENABLED: {liveState.hazard_detected}</span>
                  </div>
                </div>
              )}

              <section>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-600 dark:text-red-500" /> Data Matrix
                  </span>
                  <div className="flex items-center gap-2 text-[8px] font-mono text-red-600 dark:text-red-900">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> KERNEL_SYNC
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {telemetryItems.map((item, idx) => (
                    <div key={idx} className={`bg-slate-50 dark:bg-[#0d0707] p-4 rounded-[24px] border transition-all duration-500 relative group overflow-hidden ${lastUpdatedKey === item.key ? 'border-red-500/40 ring-1 ring-red-500/20 shadow-lg shadow-red-500/5' : 'border-slate-100 dark:border-white/[0.03] hover:border-red-500/20 dark:hover:border-white/10'}`}>
                      {lastUpdatedKey === item.key && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full m-3 animate-ping" />}
                      <div className="flex items-center gap-2 mb-3 opacity-60 group-hover:opacity-100 transition-opacity">
                        <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                        <span className="text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest truncate">{item.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1 justify-between mb-3">
                        <span className="text-lg font-black font-mono text-slate-900 dark:text-white tracking-tighter">{item.val.toLocaleString()}</span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-600 font-bold uppercase">{item.unit}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${item.bar}`} style={{ width: `${getPercentage(item.val, item.max)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                    <Power className="w-4 h-4 text-red-600 dark:text-red-500" /> Root Overrides
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Sprinkler', active: liveState.fire_sprinkler_active === 1, icon: Droplets },
                    { label: 'Emergency', active: liveState.emergency_lights_active === 1, icon: Lightbulb },
                    { label: 'Ventilation', active: liveState.ventilation_active === 1, icon: Fan },
                    { label: 'MagLock', active: liveState.aux_maglock_active === 1, icon: Lock },
                  ].map((item, idx) => (
                    <div key={idx} className={`p-4 rounded-[24px] border transition-all duration-700 flex items-center gap-4 ${item.active ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30 shadow-sm' : 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-white/[0.03] opacity-30 grayscale'}`}>
                      <div className={`p-2.5 rounded-xl ${item.active ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 shadow-inner' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">{item.label}</span>
                        <span className={`text-[8px] font-mono font-bold ${item.active ? 'text-red-600 dark:text-red-500 animate-pulse' : 'text-slate-500 dark:text-slate-600'}`}>{item.active ? 'ON' : 'OFF'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-red-200 dark:border-red-500/10 bg-white dark:bg-black/40 rounded-[32px] p-8 text-center cursor-pointer hover:border-red-300 dark:hover:border-red-500/30 transition-all group shadow-sm transition-colors duration-500">
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && processFile(e.target.files[0])} />
                  <UploadCloud className="w-10 h-10 text-red-400 dark:text-red-900/40 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{fileName || 'Batch State Override (CSV)'}</p>
                </div>
                {extractedData && <button onClick={applyCsvData} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-red-900/20 transition-all">Synchronize Telemetry</button>}
              </section>

              <Terminal logs={logs} />
            </>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Audit History</span>
                <button onClick={() => logStorage.clear()} className="text-[9px] font-bold text-red-600/60 dark:text-red-500/60 hover:text-red-600 dark:hover:text-red-500 uppercase transition-colors">Wipe Records</button>
              </div>
              {logStorage.getTransactions().length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border border-slate-200 dark:border-white/5 rounded-3xl opacity-20 italic text-sm">No recorded transactions.</div>
              ) : (
                logStorage.getTransactions().map((tx) => (
                  <div key={tx.transaction_id} className="bg-white dark:bg-[#0d0707] border border-red-100 dark:border-red-500/10 rounded-2xl p-5 space-y-3 group hover:border-red-200 dark:hover:border-red-500/30 transition-all shadow-sm transition-colors duration-500">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-red-500/70 dark:text-red-500/50">{tx.transaction_id}</span>
                      <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium italic">"{tx.input_layer.user_prompt}"</p>
                    <div className={`text-[8px] font-black uppercase tracking-widest ${tx.final_decision === 'DENIED' ? 'text-red-600' : 'text-emerald-600'}`}>{tx.final_decision}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Command Workspace */}
      <main className="flex-1 flex flex-col relative bg-red-50/20 dark:bg-[#050202] transition-colors duration-500">
        <header className="h-20 flex items-center justify-between px-12 border-b border-red-100 dark:border-red-500/20 bg-white/80 dark:bg-[#0d0707]/80 backdrop-blur-3xl z-30 shadow-sm transition-colors duration-500">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-5 py-2.5 rounded-full border bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-500 transition-colors duration-500">
              <LockOpen className="w-4 h-4 text-amber-600 dark:text-amber-500" />
              <span className="text-[11px] font-black uppercase tracking-[0.3em] font-mono animate-pulse">ADMIN_KERNEL_UNLOCKED</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {activeStep && (
              <div className="px-5 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-[18px] flex items-center gap-3 shadow-lg shadow-red-500/5 transition-colors duration-500">
                <ShieldQuestion className="w-4 h-4 text-red-600 dark:text-red-500 animate-spin" />
                <span className="text-[10px] font-black text-red-600 dark:text-red-400 font-mono tracking-widest uppercase">{activeStep}</span>
              </div>
            )}
          </div>
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-16 py-12 space-y-16 no-scrollbar scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
              <ShieldCheck className="w-24 h-24 mb-6 text-red-600 dark:text-red-500" />
              <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-white">Root Socket Active</p>
              <p className="text-xs font-mono mt-2 tracking-widest uppercase text-slate-500 dark:text-slate-400">Direct Logic Access Authorized</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-8 duration-500`}>
              <div className="flex flex-col gap-4 w-full max-w-[1150px]">
                <div className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] opacity-40 dark:opacity-30 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {m.role === 'user' ? <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-500" /> : <Cpu className="w-4 h-4 text-red-600 dark:text-red-500" />}
                  {m.role === 'user' ? 'Root Administrator' : 'Sentinel Logic Core'}
                </div>

                {m.role === 'user' ? (
                  <div className="px-10 py-8 rounded-[40px] bg-red-950 dark:bg-gradient-to-br dark:from-[#3d0f0f] dark:to-[#1a0808] border border-red-500/20 text-white self-end shadow-2xl relative group transition-colors duration-500">
                    <div className="absolute top-4 left-4 opacity-10 group-hover:opacity-30 transition-opacity"><Zap className="w-8 h-8" /></div>
                    <p className="font-medium text-xl leading-relaxed relative z-10">{m.text}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-[#0d0707] border border-red-100 dark:border-red-500/10 rounded-[36px] p-8 flex flex-col gap-6 shadow-sm dark:shadow-xl transition-colors duration-500">
                      <div className="flex items-center gap-3">
                        <Waypoints className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500">Root Context</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 bg-slate-50 dark:bg-black/40 rounded-2xl border border-slate-100 dark:border-white/5 p-5 transition-colors duration-500">
                        <pre className="text-[10px] font-mono text-amber-600 dark:text-amber-400/70 leading-relaxed whitespace-pre-wrap">{JSON.stringify(m.intent, null, 2)}</pre>
                      </div>
                    </div>

                    <div className={`rounded-[36px] p-8 border shadow-sm dark:shadow-2xl flex flex-col gap-6 transition-all duration-700 ${m.blocked ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30' : 'bg-white dark:bg-[#150a0a] border-red-100 dark:border-red-500/20'}`}>
                      <div className="flex items-center gap-3">
                        {m.blocked ? <ZapOff className="w-5 h-5 text-red-600 dark:text-red-500" /> : <ShieldCheck className="w-5 h-5 text-red-600 dark:text-red-400" />}
                        <h3 className={`text-[11px] font-black uppercase tracking-widest ${m.blocked ? 'text-red-600 dark:text-red-500' : 'text-red-600 dark:text-red-400'}`}>Guard Verdict</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {m.blocked && (
                           <div className="mb-5 p-5 bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl relative overflow-hidden transition-colors duration-500">
                             <p className="text-[10px] font-black uppercase text-red-600 dark:text-red-500 mb-2 tracking-widest">Reasoning Logic:</p>
                             <p className="text-sm font-bold text-red-700 dark:text-red-400 italic">{(m as any).reason}</p>
                           </div>
                        )}
                        <p className="font-mono text-[11px] leading-relaxed italic opacity-80 whitespace-pre-wrap text-slate-700 dark:text-slate-400">{m.reaction}</p>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#120808] border border-slate-200 dark:border-white/5 rounded-[36px] p-8 flex flex-col gap-6 shadow-sm dark:shadow-xl transition-colors duration-500">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-5 h-5 text-red-600 dark:text-red-400" />
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">Response Link</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 bg-slate-50 dark:bg-black/20 p-5 rounded-2xl transition-colors duration-500">
                        <p className="text-base leading-relaxed text-slate-800 dark:text-slate-300 font-medium italic">"{(m as any).chatResponse}"</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#150a0a] rounded-[32px] px-10 py-6 border border-red-100 dark:border-red-500/20 animate-pulse flex items-center gap-5 shadow-sm dark:shadow-2xl transition-colors duration-500">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 blur-md opacity-20 animate-ping" />
                  <Activity className="w-5 h-5 text-red-600 dark:text-red-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-red-600 dark:text-red-500 uppercase tracking-widest">Root Process: {activeStep}</span>
                  <span className="text-[9px] font-mono text-slate-500 dark:text-slate-500 uppercase tracking-tighter">Running root logic introspection...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Root Input Area */}
        <div className="p-16 pt-4 pb-12 bg-gradient-to-t from-red-100 dark:from-[#0a0505] to-transparent transition-colors duration-500">
          <form onSubmit={handleSend} className="max-w-5xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-500/20 to-amber-500/20 rounded-[44px] blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter direct hardware directive..."
              className="w-full bg-white dark:bg-[#100808] border border-red-200 dark:border-red-500/10 rounded-[44px] py-10 pl-12 pr-40 text-xl font-mono focus:border-red-500/50 transition-all outline-none shadow-2xl dark:shadow-3xl text-slate-900 dark:text-white placeholder:text-red-200 dark:placeholder:text-red-950 relative z-10"
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isProcessing} 
              className="absolute right-6 top-6 bottom-6 px-10 flex items-center justify-center bg-red-600 hover:bg-red-500 disabled:bg-slate-300 dark:disabled:bg-slate-900 disabled:text-slate-500 dark:disabled:text-slate-800 rounded-[32px] text-white transition-all shadow-xl shadow-red-900/20 z-20 group"
            >
              <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </form>
          <div className="flex justify-center gap-10 mt-6 opacity-40 dark:opacity-20 pointer-events-none">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-700 dark:text-red-500">Root Session: ACTIVE</span>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-700 dark:text-red-500">Security Gate: BYPASSED</span>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-700 dark:text-red-500">Kernel: READ_WRITE</span>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 0, 0, 0.1); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 0, 0, 0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 0, 0, 0.2); }
      `}</style>
    </div>
  );
};

export default AdminApp;
