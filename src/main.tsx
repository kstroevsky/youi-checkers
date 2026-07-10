import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { registerPwa } from '@/app/pwa/registerPwa';
import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import { startTelemetry, telemetry } from '@/shared/telemetry/bootstrap';
import '@/styles/base.scss';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container was not found.');
}

registerPwa();
startTelemetry();

createRoot(container).render(
  <StrictMode>
    <GameStoreProvider storeOptions={{ telemetry }}>
      <App />
    </GameStoreProvider>
  </StrictMode>,
);
