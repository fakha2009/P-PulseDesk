const fs = require('fs');
const path = require('path');

const apiBaseUrl = process.env.API_BASE_URL || '';
const target = path.join(__dirname, '..', 'config.js');
const webRoot = path.join(__dirname, '..');
const appHtml = path.join(webRoot, 'app.html');
const appRoutes = ['dashboard', 'tasks', 'calendar', 'habits', 'sleep', 'profile', 'library', 'proofs', 'admin'];

fs.writeFileSync(
  target,
  `window.PULSEDESK_CONFIG = window.PULSEDESK_CONFIG || ${JSON.stringify({ API_BASE_URL: apiBaseUrl }, null, 4)};\n`,
  'utf8'
);

const appHtmlContent = fs.readFileSync(appHtml, 'utf8');
for (const route of appRoutes) {
  fs.writeFileSync(path.join(webRoot, `${route}.html`), appHtmlContent, 'utf8');
}
