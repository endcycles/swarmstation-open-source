import React, { useEffect, useState } from 'react';

export interface NotificationProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: (id: string) => void;
}

export default function Notification({ 
  id, 
  message, 
  type = 'info', 
  duration = 3000, // Reduced from 5000ms
  onClose 
}: NotificationProps) {
  const [isExiting, setIsExiting] = useState(false);
  
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 200); // Wait for animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const typeStyles = {
    success: 'bg-green-status/20 border-green-status/40 text-green-status',
    error: 'bg-red-status/20 border-red-status/40 text-red-status',
    warning: 'bg-yellow-status/20 border-yellow-status/40 text-yellow-status',
    info: 'bg-purple-gradient-start/20 border-purple-gradient-start/40 text-purple-gradient-start'
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 200);
  };

  return (
    <div 
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${typeStyles[type]} 
                  shadow-lg backdrop-blur-sm transition-all duration-300 transform
                  ${isExiting 
                    ? 'translate-x-full opacity-0' 
                    : 'translate-x-0 opacity-100 animate-slide-in-from-right'
                  }`}
      style={{
        animation: !isExiting ? 'slideInFromRight 0.3s ease-out' : undefined
      }}
    >
      <span className="text-lg">{icons[type]}</span>
      <p className="flex-1 text-sm">{message}</p>
      <button 
        onClick={handleClose}
        className="text-white/60 hover:text-white transition-colors"
      >
        ✕
      </button>
    </div>
  );
}