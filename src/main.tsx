import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ignore third-party browser extension errors/rejections (e.g. MetaMask / request blockers)
window.addEventListener(
  'error',
  (event) => {
    const stack = typeof event.error?.stack === 'string' ? event.error.stack : '';
    const msg = typeof event.message === 'string' ? event.message : '';
    if (
      (typeof event.filename === 'string' && event.filename.startsWith('chrome-extension://')) ||
      stack.includes('chrome-extension://') ||
      msg.includes('Cannot set property fetch of #<Window>')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

window.addEventListener(
  'unhandledrejection',
  (event) => {
    const stack = typeof event.reason?.stack === 'string' ? event.reason.stack : '';
    const msg = typeof event.reason?.message === 'string' ? event.reason.message : '';
    if (stack.includes('chrome-extension://') || msg.includes('MetaMask')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

createRoot(document.getElementById('root')!).render(<App />);
