/**
 * File logger test — writes sample logs then reads them back.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR  = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'anythingllm-rag-debug.log');

// Ensure log dir exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear existing log
fs.writeFileSync(LOG_FILE, '', 'utf-8');

console.log('Testing file-logger...\n');

// ── Build config to enable full debug ──
import { buildRAGConfig, setDebugLevel, logRequest, logResponse, logInfo, logError } from './src/config-loader';
const cfg = buildRAGConfig();
setDebugLevel(cfg.debugLevel);

console.log('Config debug: mode=' + cfg.debugMode + ', level=' + cfg.debugLevel);

// ── Simulate HTTP request/response ──
logRequest('GET', 'http://127.0.0.1:8081/api/v1/workspaces', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer xxx'
  },
  body: undefined
});

logResponse(200, { 'content-type': 'application/json' }, ['ws1', 'ws2'], 'summary');

logInfo('INIT', 'Debug mode ON, level=' + cfg.debugLevel);

const dummy = null as any;
logError('TEST', 'dummy error', dummy);

// ── Read log file back ──
setTimeout(() => {
  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  console.log('\nLog file contents:\n');
  lines.forEach((line) => console.log(line));
  console.log('\n' + '='.repeat(40));
  console.log('✓ File logger works —', lines.length, 'lines written to', LOG_FILE);
}, 100);
