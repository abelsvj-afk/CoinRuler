"use client";
import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

let toastId = 0;
const toastListeners: Array<(toast: ToastMessage) => void> = [];

export function showToast(type: ToastMessage['type'], title: string, message: string) {
  const toast: ToastMessage = {
    id: `toast-${toastId++}`,
    type,
    title,
    message,
  };
  toastListeners.forEach(listener => listener(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 5000); // Auto-dismiss after 5s
    };

    toastListeners.push(listener);
    return () => {
      const idx = toastListeners.indexOf(listener);
      if (idx > -1) toastListeners.splice(idx, 1);
    };
  }, []);

  if (toasts.length === 0) return null;

  const typeColors = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`${typeColors[toast.type]} text-white p-4 rounded shadow-lg min-w-[300px] max-w-[400px] animate-slide-in`}
        >
          <div className="font-bold">{toast.title}</div>
          <div className="text-sm mt-1">{toast.message}</div>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="absolute top-2 right-2 text-white hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
