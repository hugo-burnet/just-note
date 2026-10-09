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

import { Capacitor } from '@capacitor/core';
import { NativePlatform } from './platform/native/NativePlatform.ts';
import { registerServiceWorker } from './platform/web/registerServiceWorker.ts';
import { WebPlatform } from './platform/web/WebPlatform.ts';
import { App } from './ui/App.ts';

// One build, two ways to run it. Installed (Capacitor) the app reads the sites itself and
// keeps what it read on its own: no proxy, no service worker. In a browser the platform is
// the web's, and the proxy is wherever the build says.
const native = Capacitor.isNativePlatform();
const outlet = document.getElementById('app');
const toasts = document.getElementById('toasts');
const platform = native ? new NativePlatform() : new WebPlatform(import.meta.env.VITE_PROXY_URL);
if (outlet && toasts) new App(platform, { outlet, toasts }).start();
if (!native) registerServiceWorker();
