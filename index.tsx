
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import AuthPage from './components/AuthPage';

type UserRole = 'USER' | 'ADMIN' | null;

const RootSelector = () => {
  const [role, setRole] = useState<UserRole>(null);

  // Check session storage for persistence within the session
  useEffect(() => {
    const savedRole = sessionStorage.getItem('sentinel_role');
    if (savedRole === 'USER' || savedRole === 'ADMIN') {
      setRole(savedRole as UserRole);
    }
  }, []);

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
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="relative w-full h-full">
      {/* Global Logout Button */}
      <button 
        onClick={handleLogout}
        className="fixed bottom-6 right-6 z-[100] px-4 py-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 rounded-full transition-all backdrop-blur-md"
      >
        Terminate Session
      </button>

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
