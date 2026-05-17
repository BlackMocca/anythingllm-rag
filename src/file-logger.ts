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
 * Write multi-line content only in 'full' mode.
 */
function writeFull(tag: string, message: string, detail?: string): void {
  if (_debugLevel !== 'full') return;
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

/**
 * Log an HTTP request (before sending).
 */
export function logRequest(method: string, url: string, options?: {
  headers?: Record<string, string>;
  body?: any;
  level?: 'summary' | 'full';
}): void {
  const lvl = options?.level || _debugLevel;
  const msg = `${method} ${url}`;

  if (lvl === 'full') {
    const parts: string[] = [];
    if (options?.headers) {
      const copy = { ...options.headers };
      if (copy['Authorization']) copy['Authorization'] = '***';
      parts.push(`headers: ${JSON.stringify(copy)}`);
    }
    if (options?.body) {
      parts.push(`body: ${JSON.stringify(options.body, null, 2)}`);
    }
    if (parts.length > 0) {
      writeFull('REQ', msg, parts.join('\n'));
    } else {
      writeLine('REQ', msg);
    }
  } else {
    writeLine('REQ', msg);
  }
}

/**
 * Log an HTTP response (after receiving).
 */
export function logResponse(status: number, headers?: Record<string, string>, body?: any, level?: 'summary' | 'full'): void {
  const lvl = level || _debugLevel;
  const ok = status >= 200 && status < 300;
  const msg = ok ? `[${status} OK]` : `[${status} FAIL]`;

  if (lvl === 'full') {
    const parts: string[] = [];
    if (headers && Object.keys(headers).length > 0) {
      parts.push(`headers: ${JSON.stringify(headers, null, 2)}`);
    }
    if (body !== undefined) {
      const dump = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      parts.push(`body: ${dump.substring(0, 4096)}`);
    }
    if (parts.length > 0) {
      writeFull('RES', msg, parts.join('\n'));
    } else {
      writeLine('RES', msg);
    }
  } else {
    writeLine('RES', msg);
  }
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
