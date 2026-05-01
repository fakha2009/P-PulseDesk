const fs = require('fs');
const path = require('path');

const apiBaseUrl = process.env.API_BASE_URL || '';
const target = path.join(__dirname, '..', 'config.js');

fs.writeFileSync(
  target,
  `window.PULSEDESK_CONFIG = window.PULSEDESK_CONFIG || ${JSON.stringify({ API_BASE_URL: apiBaseUrl }, null, 4)};\n`,
  'utf8'
);
