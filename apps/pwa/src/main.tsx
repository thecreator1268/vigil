import './demo/install'; // must stay first: see demo/install.ts
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { registerServiceWorker } from './sw-register';
import { startSync } from './sync/engine';

startSync();
registerServiceWorker();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
