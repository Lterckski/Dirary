import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { colors, fonts, radius } from '@dirary/ui';
import { App } from './App';
import './styles.css';

// The shared tokens become CSS variables, so the web app and the phone app can't drift apart.
const style = document.documentElement.style;
for (const [name, value] of Object.entries(colors)) style.setProperty(`--${name}`, value);
for (const [name, value] of Object.entries(radius)) style.setProperty(`--r-${name}`, `${value}px`);
style.setProperty('--font-display', fonts.webDisplay);
style.setProperty('--font-body', fonts.webBody);

// A data router (rather than <BrowserRouter>) so links can use the browser's view transitions between pages.
// App still declares its own <Routes> under this one catch-all route.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
