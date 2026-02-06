
import React, { useState } from 'react';
import { Shield, Lock, User, ShieldAlert, Cpu, ArrowRight, Sun, Moon } from 'lucide-react';

interface AuthPageProps {
  onLogin: (role: 'USER' | 'ADMIN') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin, theme, toggleTheme }) => {
  const [adminPass, setAdminPass] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [error, setError] = useState('');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPass === '7777') { // Simple mock passcode
      onLogin('ADMIN');
    } else {
      setError('Invalid Authorization Token');
      setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-[#05070a] flex items-center justify-center p-6 overflow-hidden relative transition-colors duration-500">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden opacity-30 dark:opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 dark:bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 dark:bg-blue-500/20 blur-[120px] rounded-full" />
      </div>

      {/* Theme Toggle in Auth */}
      <button 
        onClick={toggleTheme}
        className="absolute top-8 right-8 p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all z-50 shadow-sm"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 z-10">
        
        {/* User Role Card */}
        <div 
          onClick={() => onLogin('USER')}
          className="group relative bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 hover:border-emerald-500/40 p-10 rounded-[40px] cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/10 shadow-sm"
        >
          <div className="mb-8 p-4 bg-emerald-500/10 rounded-2xl w-fit border border-emerald-500/20">
            <User className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Restricted Operator</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Standard hardware interface access. Monitor live telemetry and issue authorized commands within safety envelopes.
          </p>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-500">
            Initialize Connection <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Admin Role Card */}
        <div 
          className={`relative bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 p-10 rounded-[40px] transition-all overflow-hidden shadow-sm ${
            showAdminLogin ? 'ring-2 ring-red-500/50' : 'hover:border-red-500/40 cursor-pointer hover:scale-[1.02]'
          }`}
          onClick={() => !showAdminLogin && setShowAdminLogin(true)}
        >
          {!showAdminLogin ? (
            <>
              <div className="mb-8 p-4 bg-red-500/10 rounded-2xl w-fit border border-red-500/20">
                <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">System Administrator</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Deep-level root access. Override safety interlocks, export audit logs, and manage system thresholds.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-600 dark:text-red-500">
                Elevate Privileges <ArrowRight className="w-4 h-4" />
              </div>
            </>
          ) : (
            <form onSubmit={handleAdminLogin} className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between mb-8">
                <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-500" />
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setShowAdminLogin(false); }}
                  className="text-[10px] font-black text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase mb-6">Enter Admin Passcode</h2>
              <input 
                autoFocus
                type="password"
                placeholder="****"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-6 text-2xl tracking-[1em] text-center font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500/50 transition-all mb-4"
              />
              {error && <p className="text-red-600 dark:text-red-500 text-[10px] font-black uppercase text-center mb-4">{error}</p>}
              <button 
                type="submit"
                className="mt-auto w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-red-500/20"
              >
                Authorize Root
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 opacity-40 dark:opacity-30">
          <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
          <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.5em]">Sentient IDS</span>
        </div>
        <div className="text-[9px] font-mono text-slate-400 dark:text-slate-700 tracking-widest uppercase">
          Autonomous Hardware Mesh &bull; Unified Security V2
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
