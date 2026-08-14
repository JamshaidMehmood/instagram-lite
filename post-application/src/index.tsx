import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionBootstrap } from './components/SessionBootstrap';
import { ToastProvider } from './components/ToastProvider';
import { store } from './store';
import { ColorModeProvider } from './theme/ColorModeProvider';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

/**
 * Provider order is load-bearing:
 *   store   → everything below dispatches and selects
 *   theme   → supplies the MUI theme, including to the splash screen
 *   router  → SessionBootstrap's splash renders a <Link>
 *   toast   → AppShell calls useToast on sign-out
 *   errors  → catches render crashes in every page beneath it
 *   session → restores auth before the router decides where to send anyone
 */
ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <Provider store={store}>
      <ColorModeProvider>
        <BrowserRouter>
          <ToastProvider>
            <ErrorBoundary>
              <SessionBootstrap>
                <App />
              </SessionBootstrap>
            </ErrorBoundary>
          </ToastProvider>
        </BrowserRouter>
      </ColorModeProvider>
    </Provider>
  </React.StrictMode>,
);
