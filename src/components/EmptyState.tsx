import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {/* Circular gradient border container */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end rounded-full blur-lg opacity-20"></div>
        <div className="relative w-20 h-20 bg-gradient-to-br from-purple-gradient-start/10 to-purple-gradient-end/10 rounded-full flex items-center justify-center border-2 border-transparent bg-clip-padding" 
             style={{
               backgroundImage: `linear-gradient(#0a0a0a, #0a0a0a), linear-gradient(135deg, #667eea, #764ba2)`,
               backgroundOrigin: 'border-box',
               backgroundClip: 'padding-box, border-box'
             }}>
          {icon || (
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 max-w-sm mb-6 leading-relaxed">{description}</p>
      
      {action && (
        <button
          onClick={action.onClick}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all transform hover:scale-105 ${
            action.variant === 'secondary'
              ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
              : 'bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white hover:shadow-lg'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;