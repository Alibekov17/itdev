import '@twa-dev/sdk';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// Сообщаем Telegram, что приложение загрузилось и его можно развернуть.
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
