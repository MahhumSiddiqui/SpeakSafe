import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './i18n';
import { DisplayProvider } from './display/DisplayProvider';
import { ReporterAuthProvider } from './auth/ReporterAuth';
import { BrowserRouter } from 'react-router';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DisplayProvider>
      <BrowserRouter>
        <ReporterAuthProvider>
          <App />
        </ReporterAuthProvider>
      </BrowserRouter>
    </DisplayProvider>
  </StrictMode>,
);
