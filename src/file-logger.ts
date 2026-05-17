/**
 * File-based Debug Logger
 *
 * Replaces console.log with file logging to:
 *   <project>/logs/anythingllm-rag-debug.log
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Constants ──

const LOG_DIR  = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'anythingllm-rag-debug.log');

// ── State ──

let _debugLevel: 'none' | 'summary' | 'full' = 'none';
let _maxLines: number = 5000;

// ── Helpers ──

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // swallow
  }
}

/**
 * Write a single line to the debug log file.
 */
function writeLine(tag: string, message: string): void {
  if (_debugLevel === 'none') return;

  ensureLogDir();

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [RAG:${tag}] ${message}`;

  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // swallow
  }
}

/**
 * Write multi-line content when debug is any non-'none' level.
 * Writes body and status for HTTP logging.
 */
function writeFull(tag: string, message: string, detail?: string): void {
  if (_debugLevel === 'none') return;
  if (!detail) return;

  ensureLogDir();

  const lines = [
    `[${new Date().toISOString()}] [RAG:${tag}] ${message}`,
    detail,
    '---',
  ].join('\n');

  try {
    fs.appendFileSync(LOG_FILE, lines + '\n');
  } catch {
    // swallow
  }
}

/**
 * Safely serialize a value for logging — avoids [object Object].
 */
function safeDump(value: unknown): string {
  if (value == null) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Trim the log file to keep only the last N lines.
 */
function trimLog(): void {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n');

    if (lines.length > _maxLines) {
      const trimmed = lines.slice(-_maxLines).join('\n');
      fs.writeFileSync(LOG_FILE, trimmed, 'utf-8');
    }
  } catch {
    // swallow
  }
}

/**
 * Update the active debug level (called after buildRAGConfig).
 */
export function setDebugLevel(lvl: 'none' | 'summary' | 'full'): void {
  _debugLevel = lvl;
}

/**
 * Debug output helper — writes to file.
 */
export function debugWrite(tag: string, ...args: any[]): void {
  if (_debugLevel === 'none') return;

  const msg = args.length === 1 ? safeDump(args[0]) : args.map(safeDump).join(' ');
  writeLine(tag, msg);

  // Trim periodically (~1% chance per call)
  if (Math.random() < 0.01) trimLog();
}

export function logRequest(method: string, url: string, body?: any): void {
  const parts: string[] = [method + ' ' + url];

  if (body !== undefined) {
    parts.push('  body: ' + safeDump(body));
  }

  writeFull('REQ', method + ' ' + url, parts.join('\n'));
}

/**
 * Log an HTTP response (after receiving).
 */
export function logResponse(status: number, body?: any): void {
  const ok = status >= 200 && status < 300;
  const statusTag = ok ? 'OK' : 'FAIL ' + status;
  const parts: string[] = [statusTag];

  if (body !== undefined) {
    parts.push('  body: ' + (typeof body === 'string' ? body : safeDump(body)));
  }

  writeFull('RES', statusTag, parts.join('\n'));
}

/**
 * Log a general error or warning.
 */
export function logError(tag: string, message: string, detail?: any): void {
  writeLine('ERR', `${tag} ${message}`);
  if (_debugLevel === 'full' && detail) {
    writeFull('ERR', message, safeDump(detail));
  }
}

/**
 * Log a successful operation.
 */
export function logInfo(tag: string, message: string, detail?: any): void {
  writeLine('OK', `${tag} ${message}`);
  if (_debugLevel === 'full' && detail) {
    writeFull('OK', message, safeDump(detail));
  }
}
