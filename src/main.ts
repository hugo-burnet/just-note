import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/layout.css';
import './ui/styles/controls.css';
import './ui/styles/dock.css';
import './ui/styles/cards.css';
import './ui/styles/series.css';
import './ui/styles/sheet.css';
import './ui/styles/reader.css';
import './ui/styles/reader-chrome.css';
import './ui/styles/reader-states.css';
import './ui/styles/states.css';

import { WebPlatform } from './platform/web/WebPlatform.ts';
import { App } from './ui/App.ts';

// The browser build: the platform is the web's, and the proxy is wherever the build says.
const outlet = document.getElementById('app');
const toasts = document.getElementById('toasts');
if (outlet && toasts) new App(new WebPlatform(import.meta.env.VITE_PROXY_URL), { outlet, toasts }).start();
