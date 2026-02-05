
import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldAlert, Activity, Terminal as TerminalIcon, Send, 
  Cpu, ShieldCheck, Thermometer, Gauge, Wifi,
  TrendingUp, AlertTriangle, User, Zap,
  Droplets, BarChart3, HardDrive, Braces, BrainCircuit,
  Waypoints, ArrowRightLeft, Download, History, LockOpen, Settings2, UploadCloud, MessageSquare,
  Network, Settings, ShieldQuestion
} from 'lucide-react';
import { SecurityLog, ChatMessage, MiddlewareResponse, SecurityTransaction } from './types';
import { AdminMiddleware } from './AdminMiddleware';
import { callHardwareReactionAgent, callConversationalAgent, Intent } from './services/gemini';
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
  const [liveState, setLiveState] = useState<TelemetryState>(telemetryStore.getState());
  const [showHistory, setShowHistory] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<CSVExtractionResult | null>(null);
  
  const middleware = useRef(new AdminMiddleware());
  const csvConnector = useRef(new CSVConnector());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      
      setActiveStep('AGENTIC_SCRAPE');
      const middlewareResult = await middleware.current.process(rawInput, normalizedCommand, liveState);
      setLogs(prev => [...prev, ...middlewareResult.logs]);

      if (middlewareResult.allowed && middlewareResult.predictedState) {
        telemetryStore.updateState(middlewareResult.predictedState);
      }

      setActiveStep('REACTION_GEN');
      const [techReaction, chatResponse] = await Promise.all([
        callHardwareReactionAgent(middlewareResult, { ...liveState, ...middlewareResult.predictedState }, intents),
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
        input_layer: { 
          user_prompt: rawInput, 
          normalized_prompt: normalizedCommand,
          obfuscation_check: 'PASS', 
          vector_similarity_score: middlewareResult.semanticRisk 
        },
        context_layer: { connector_used: "ADMIN_ROOT_V3", live_state: liveState },
        agentic_evaluation: { 
          agent_role: "Root Admin Analyst", 
          reasoning: middlewareResult.reason || "Root check passed.", 
          verdict: middlewareResult.allowed ? 'ALLOW' : 'BLOCK', 
          risk_score: middlewareResult.riskScore 
        },
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

  const telemetryItems = [
    { key: 'axis_1_rpm', label: 'A1 RPM', val: liveState.axis_1_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-amber-400' },
    { key: 'axis_1_temp_c', label: 'A1 Temp', val: liveState.axis_1_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-red-400' },
    { key: 'axis_1_torque_nm', label: 'A1 Torque', val: liveState.axis_1_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-400' },
    { key: 'axis_2_rpm', label: 'A2 RPM', val: liveState.axis_2_rpm, max: SAFETY_THRESHOLDS.max_rpm, unit: 'RPM', icon: Gauge, color: 'text-amber-500' },
    { key: 'axis_2_temp_c', label: 'A2 Temp', val: liveState.axis_2_temp_c, max: SAFETY_THRESHOLDS.max_temp, unit: '°C', icon: Thermometer, color: 'text-red-500' },
    { key: 'axis_2_torque_nm', label: 'A2 Torque', val: liveState.axis_2_torque_nm, max: SAFETY_THRESHOLDS.max_torque_nm, unit: 'Nm', icon: TrendingUp, color: 'text-orange-500' },
    { key: 'main_pressure_psi', label: 'Pressure', val: liveState.main_pressure_psi, max: SAFETY_THRESHOLDS.max_pressure_psi, unit: 'PSI', icon: BarChart3, color: 'text-orange-400' },
    { key: 'coolant_flow_lpm', label: 'Coolant', val: liveState.coolant_flow_lpm || 0, max: 20, unit: 'LPM', icon: Droplets, color: 'text-red-400' },
    { key: 'power_draw_kw', label: 'Power', val: liveState.power_draw_kw, max: SAFETY_THRESHOLDS.max_power_watts / 1000, unit: 'kW', icon: Zap, color: 'text-yellow-400' },
    { key: 'voltage_v', label: 'Bus Volt', val: liveState.voltage_v, max: 250, unit: 'V', icon: Cpu, color: 'text-red-400' },
    { key: 'network_jitter_ms', label: 'Jitter', val: liveState.network_jitter_ms, max: 100, unit: 'ms', icon: Network, color: 'text-pink-400' },
    { key: 'controller_cpu_load', label: 'CPU Load', val: liveState.controller_cpu_load, max: 100, unit: '%', icon: Settings, color: 'text-slate-400' },
  ];

  return (
    <div className="flex h-screen bg-[#0d0505] text-slate-100 overflow-hidden font-sans">
      <aside className="w-[420px] bg-[#1a0a0a] border-r border-red-500/20 flex flex-col p-6 overflow-hidden z-40">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/30">
              <ShieldAlert className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white uppercase leading-tight">Root Access</h1>
              <p className="text-[9px] text-red-500 font-mono font-bold tracking-widest uppercase">Overrides: UNRESTRICTED</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => logStorage.exportLogs()}
              className="p-2.5 rounded-xl border bg-white/5 border-white/10 text-slate-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-500 transition-all"
              title="Export Audit JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowHistory(!showHistory)} 
              className={`p-2.5 rounded-xl border transition-all ${showHistory ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-slate-400'}`}
              title="Toggle History"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
          {!showHistory ? (
            <>
              <section className="grid grid-cols-2 gap-2.5">
                {telemetryItems.map((item, idx) => (
                  <div key={idx} className="bg-red-950/20 p-3 rounded-2xl border border-red-500/10">
                    <div className="flex items-center gap-2 mb-1.5 opacity-60">
                      <item.icon className={`w-3 h-3 ${item.color}`} />
                      <span className="text-[8px] font-bold text-slate-300 uppercase">{item.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1 justify-between">
                      <span className="text-sm font-black font-mono text-white">{item.val.toLocaleString()}</span>
                      <span className="text-[8px] text-red-500/50 uppercase">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </section>
              <section className="space-y-3">
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-red-500/10 bg-black/40 rounded-[24px] p-6 text-center cursor-pointer hover:border-red-500/30 transition-all">
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && processFile(e.target.files[0])} />
                  <UploadCloud className="w-8 h-8 text-red-900/40 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{fileName || 'Batch CSV Override'}</p>
                </div>
                {extractedData && <button onClick={applyCsvData} className="w-full py-3.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-red-900/30">Synchronize States</button>}
              </section>
              <Terminal logs={logs} />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction History</span>
                <button onClick={() => logStorage.clear()} className="text-[8px] font-bold text-red-500/60 hover:text-red-500 uppercase">Clear All</button>
              </div>
              {logStorage.getTransactions().length === 0 ? (
                <div className="p-10 text-center opacity-20 italic text-sm">No transactions logged.</div>
              ) : (
                logStorage.getTransactions().map((tx) => (
                  <div key={tx.transaction_id} className="bg-black/40 border border-red-500/10 rounded-2xl p-4 space-y-2 group hover:border-red-500/30 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono text-red-500/50">{tx.transaction_id}</span>
                      <span className="text-[8px] font-mono text-slate-600">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[10px] text-slate-300 italic">"{tx.input_layer.user_prompt}"</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative bg-[#0a0505]">
        <header className="h-16 flex items-center justify-between px-10 border-b border-red-500/20 bg-red-950/10 backdrop-blur-2xl z-30">
          <div className="flex items-center gap-4">
            <LockOpen className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] font-mono animate-pulse">ADMIN_KERNEL_UNLOCKED</span>
          </div>
          {activeStep && (
            <div className="px-4 py-1.5 bg-red-500/20 border border-red-500/30 rounded-full flex items-center gap-2">
              <ShieldQuestion className="w-3 h-3 text-red-500 animate-spin" />
              <span className="text-[10px] font-black text-red-400 font-mono tracking-widest uppercase">{activeStep}</span>
            </div>
          )}
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-16 py-10 space-y-12 no-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col gap-3 w-full max-w-[1100px]">
                <div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.3em] opacity-40 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? 'ROOT_CMD' : 'HARDWARE_LINK'}
                </div>
                
                {m.role === 'user' ? (
                  <div className="px-10 py-7 rounded-[32px] bg-red-950/40 border border-red-500/20 text-white shadow-2xl self-end">
                    <p className="font-medium whitespace-pre-wrap text-lg">{m.text}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div className="bg-black/60 border border-red-500/10 rounded-[32px] p-8 flex flex-col gap-4 max-h-[400px]">
                      <div className="flex items-center gap-3">
                        <Waypoints className="w-4 h-4 text-amber-500" />
                        <h3 className="text-amber-500 font-black uppercase text-[10px] tracking-widest">CONTEXT</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar">
                        <pre className="text-[10px] font-mono text-amber-400/80 bg-black/40 p-4 rounded-xl border border-white/5 overflow-x-auto">{JSON.stringify(m.intent, null, 2)}</pre>
                      </div>
                    </div>
                    <div className={`rounded-[32px] p-8 flex flex-col gap-4 max-h-[400px] border ${m.blocked ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-950/10 border-red-500/20 text-red-300'}`}>
                      <div className="flex items-center gap-3">
                        <Cpu className={`w-4 h-4 ${m.blocked ? 'text-red-600' : 'text-red-500'}`} />
                        <h3 className={`font-black uppercase text-[10px] tracking-widest ${m.blocked ? 'text-red-600' : 'text-red-500'}`}>AGENT A</h3>
                      </div>
                      <div className="overflow-y-auto pr-2 custom-scrollbar">
                         {m.blocked && (
                           <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                             <p className="text-[10px] font-black uppercase text-red-500 mb-1 tracking-widest">Security Reason:</p>
                             <p className="text-[11px] font-bold text-red-400">{(m as any).reason}</p>
                           </div>
                         )}
                        <p className="font-mono text-[11px] leading-relaxed italic">{m.reaction}</p>
                      </div>
                    </div>
                    <div className="bg-[#1a0a0a] border border-white/5 rounded-[32px] p-8 flex flex-col gap-4 shadow-2xl max-h-[400px]">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-amber-400" />
                        <h3 className="text-amber-400 font-black uppercase text-[10px] tracking-widest">AGENT B</h3>
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
            <div className="justify-start flex">
              <div className="bg-[#1a0a0a] rounded-full px-8 py-4 border border-red-500/20 animate-pulse flex items-center gap-3 shadow-xl">
                <ShieldQuestion className="w-4 h-4 text-red-500 animate-spin" />
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Running Agentic Introspection...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-16 pt-0">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Root directive..." className="w-full bg-black/60 border border-red-500/20 rounded-[40px] py-9 pl-10 pr-32 text-lg font-mono outline-none shadow-3xl focus:border-red-500/50 text-white" />
            <button type="submit" className="absolute right-6 top-6 bottom-6 w-20 flex items-center justify-center bg-red-600 hover:bg-red-500 rounded-[28px] text-white shadow-lg shadow-red-900/40">
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

export default AdminApp;
