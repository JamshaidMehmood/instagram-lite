import { Alert, Snackbar, Slide } from '@mui/material';
import type { AlertColor } from '@mui/material';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  key: number;
  message: string;
  severity: AlertColor;
}

interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * A queue rather than a single slot: two toasts fired in the same tick (say a
 * failed upload followed by a retry hint) would otherwise clobber each other.
 * Replaces react-toastify — one fewer dependency, and it inherits the app
 * theme instead of shipping its own stylesheet.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, severity: AlertColor = 'info') => {
    setQueue((current) => [...current, { key: Date.now() + Math.random(), message, severity }]);
  }, []);

  const current = queue[0];

  const handleClose = useCallback((_event: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setQueue((items) => items.slice(1));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={Boolean(current)}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionComponent={Slide}
      >
        <Alert
          onClose={() => handleClose(null)}
          severity={current?.severity ?? 'info'}
          variant="filled"
          sx={{ borderRadius: 2, boxShadow: 6, alignItems: 'center' }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
