import React, { useEffect, useRef } from 'react';

interface TerminalViewProps {
  logs: string[];
  title?: string;
}

function TerminalView({ logs, title = "Terminal Output" }: TerminalViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);
  
  return (
    <div className="bg-black/90 rounded-lg border border-white/10 overflow-hidden flex flex-col h-64">
      <div className="bg-white/5 px-4 py-2 border-b border-white/10">
        <h3 className="text-sm font-medium text-white/80">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-500">No output yet...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="text-green-400 whitespace-pre-wrap">
              {log}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export default TerminalView;