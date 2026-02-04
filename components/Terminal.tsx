
import React, { useEffect, useRef } from 'react';
import { SecurityLog } from '../types';

interface TerminalProps {
  logs: SecurityLog[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (type: SecurityLog['type']) => {
    switch (type) {
      case 'BLOCK': return 'text-red-500';
      case 'CRITICAL': return 'text-orange-500';
      case 'WARNING': return 'text-yellow-400';
      case 'NORMALIZATION': return 'text-blue-400';
      default: return 'text-emerald-500';
    }
  };

  return (
    <div className="bg-slate-950/80 border border-white/5 rounded-2xl p-4 h-64 overflow-y-auto font-mono text-[10px] leading-relaxed shadow-inner">
      {logs.length === 0 && (
        <div className="flex items-center justify-center h-full text-slate-700 italic font-mono uppercase tracking-widest">
          Listening for events...
        </div>
      )}
      {logs.map((log) => (
        <div key={log.id} className="mb-2 border-l-2 border-white/5 pl-3 transition-all hover:bg-white/[0.02]">
          <div className="flex justify-between text-[8px] text-slate-600 mb-0.5 font-bold uppercase tracking-tighter">
            <span>{log.type}</span>
            <span>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <div className="flex gap-2">
            <span className={`font-black ${getLogColor(log.type)}`}>&gt;</span>
            <span className="text-slate-400">{log.message}</span>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

export default Terminal;
