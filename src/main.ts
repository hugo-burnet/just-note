import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/layout.css';
import './ui/styles/controls.css';
import './ui/styles/diagnostic.css';
import './ui/styles/dock.css';
import './ui/styles/cards.css';
import './ui/styles/series.css';
import './ui/styles/sheet.css';
import './ui/styles/reader.css';
import './ui/styles/reader-chrome.css';
import './ui/styles/reader-states.css';
import './ui/styles/states.css';
import './ui/styles/experience.css';
import './ui/styles/settings.css';

import { NativePlatform } from './platform/native/NativePlatform.ts';
import { App } from './ui/App.ts';

// The installed app (Capacitor): it reads the sites itself, from the phone, and keeps what it read on its own.
const outlet = document.getElementById('app');
const toasts = document.getElementById('toasts');
if (outlet && toasts) new App(new NativePlatform(), { outlet, toasts }).start();
