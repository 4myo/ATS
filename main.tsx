import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/root';
import './app/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
