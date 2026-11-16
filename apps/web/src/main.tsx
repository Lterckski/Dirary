import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { colors, fonts, radius } from '@dirary/ui';
import { App } from './App';
import './styles.css';

// The shared tokens become CSS variables, so the web app and the phone app can't drift apart.
const style = document.documentElement.style;
for (const [name, value] of Object.entries(colors)) style.setProperty(`--${name}`, value);
for (const [name, value] of Object.entries(radius)) style.setProperty(`--r-${name}`, `${value}px`);
style.setProperty('--font-display', fonts.webDisplay);
style.setProperty('--font-body', fonts.webBody);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
