import React from 'react';

export type ConfirmDialogType = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmDialogType;
  isLoading?: boolean;
}

function ConfirmDialog({
  show,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
  isLoading = false
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    if (!isLoading) {
      await onConfirm();
    }
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: (
            <svg className="w-6 h-6 text-red-status" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          buttonClass: 'bg-red-status hover:bg-red-600 text-white',
          iconBgClass: 'bg-red-status/10'
        };
      case 'warning':
        return {
          icon: (
            <svg className="w-6 h-6 text-yellow-status" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          buttonClass: 'bg-yellow-status hover:bg-yellow-600 text-gray-900',
          iconBgClass: 'bg-yellow-status/10'
        };
      case 'info':
      default:
        return {
          icon: (
            <svg className="w-6 h-6 text-blue-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          buttonClass: 'bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end hover:shadow-lg text-white',
          iconBgClass: 'bg-purple-gradient-start/10'
        };
    }
  };

  if (!show) return null;

  const { icon, buttonClass, iconBgClass } = getTypeStyles();

  return (
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-2000 transition-opacity duration-300 ease-in-out ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className={`bg-gray-medium border border-white/10 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl transition-transform duration-300 ease-in-out ${show ? 'scale-100' : 'scale-95'}`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${iconBgClass} flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-gray-text font-medium cursor-pointer transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`px-6 py-2 rounded-lg font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${buttonClass}`}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Processing...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;