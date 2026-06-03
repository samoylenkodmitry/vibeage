import React from 'react';
import { createRoot } from 'react-dom/client';
import { Showroom } from './Showroom';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Showroom />
  </React.StrictMode>,
);
