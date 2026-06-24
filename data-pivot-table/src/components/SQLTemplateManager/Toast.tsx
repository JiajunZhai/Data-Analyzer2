import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import s from './Toast.module.css';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 2000 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [duration, onClose]);

  return (
    <div className={`${s.toast} ${s[type]} ${visible ? s.visible : ''}`}>
      <div className={s.icon}>
        {type === 'success' && <Check size={16} />}
        {type === 'error' && <X size={16} />}
        {type === 'info' && <Check size={16} />}
      </div>
      <span className={s.message}>{message}</span>
    </div>
  );
}

interface ToastManagerProps {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  onRemove: (id: string) => void;
}

export function ToastManager({ toasts, onRemove }: ToastManagerProps) {
  return (
    <div className={s.container}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}
