
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import AuthPage from './components/AuthPage';
import { Sun, Moon } from 'lucide-react';

type UserRole = 'USER' | 'ADMIN' | null;
type Theme = 'light' | 'dark';

const RootSelector = () => {
  const [role, setRole] = useState<UserRole>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('sentinel_theme') as Theme) || 'dark';
  });

  useEffect(() => {
    const savedRole = sessionStorage.getItem('sentinel_role');
    if (savedRole === 'USER' || savedRole === 'ADMIN') {
      setRole(savedRole as UserRole);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('sentinel_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLogin = (selectedRole: UserRole) => {
    if (selectedRole) {
      sessionStorage.setItem('sentinel_role', selectedRole);
      setRole(selectedRole);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('sentinel_role');
    setRole(null);
    window.location.hash = '';
  };

  if (!role) {
    return <AuthPage onLogin={handleLogin} theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <div className="relative w-full h-full">
      {/* Global Utility Controls */}
      <div className="fixed bottom-6 right-6 z-[100] flex gap-3">
        <button 
          onClick={toggleTheme}
          className="p-3 bg-white/80 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full transition-all backdrop-blur-md shadow-xl dark:shadow-none text-slate-600 dark:text-slate-400"
          title="Toggle System Luminescence"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button 
          onClick={handleLogout}
          className="px-6 py-2 bg-white/80 dark:bg-white/5 hover:bg-red-500/10 dark:hover:bg-red-500/20 border border-slate-200 dark:border-white/10 hover:border-red-500/40 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 rounded-full transition-all backdrop-blur-md shadow-xl dark:shadow-none"
        >
          Terminate Session
        </button>
      </div>

      {role === 'ADMIN' ? <AdminApp /> : <App />}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootSelector />
  </React.StrictMode>
);
