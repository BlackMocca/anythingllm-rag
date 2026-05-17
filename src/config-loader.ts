/**
 * Configuration Loader
 *
 * Reads anythingllm-rag settings from JSON files:
 *   Global →  ~/.pi/agent/anythingllm_rag.json
 *   Project →  PROJECT_DIR/.pi/agent/anythingllm_rag.json
 *
 * Merge resolution order (later sources overwrite earlier):
 *   1. Global config   →  ~/.pi/agent/anythingllm_rag.json
 *   2. Project config  →  <PROJECT_DIR>/.pi/agent/anythingllm_rag.json
 *   3. Shell-env vars  →  RAG_URL, RAG_API_KEY, RAG_TIMEOUT, …
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Constants ──────────────────────────────────────────────────────

const GLOBAL_PATH   = path.join(os.homedir(), '.pi', 'agent', 'anythingllm_rag.json');
const PROJECT_PATH  = path.join(process.cwd(), '.pi', 'agent', 'anythingllm_rag.json');

// ── Types ──────────────────────────────────────────────────────────

export type RAGConfig = {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  debugMode: boolean;
  debugLevel: 'none' | 'summary' | 'full';
  knowledgeBasePath?: string;
  workspaceBasePath?: string;
  _fetchHooks?: {
    onRequest?: (method: string, url: string, body?: Record<string, unknown>) => void;
    onResponse?: (status: number, url: string, body?: unknown) => void;
    onFetch?: (method: string, url: string) => void;
  };
};

// ── Helpers ───────────────────────────────────────────────────────

function num(val?: string): number | undefined {
  if (!val) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function str(val?: string): string | undefined {
  if (!val) return undefined;
  return String(val).trim() || undefined;
}

function level(val?: string): 'none' | 'summary' | 'full' {
  if (!val) return 'summary';
  if (val === 'full' || val === 'verbose') return 'full';
  if (val === 'none') return 'none';
  return 'summary';
}

/**
 * Resolve which config sources actually exist.
 * Returns `null` for files that do not exist.
 */
function readIfExists(filePath?: string): Record<string, unknown> | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    //console.warn(`[config] parse ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Mutate `target` in-place with values from `src`.
 * Supports flat keys AND nested `rag` block.
 */
function apply(src?: Record<string, unknown>, target?: RAGConfig): void {
  if (!src || !target) return;

  const s = (src as any).rag ?? src;

  // URL
  if (s.baseUrl  !== undefined) target.baseUrl  = String(s.baseUrl);
  if (s.url      !== undefined) target.baseUrl  = String(s.url);

  // API key
  if (s.apiKey   !== undefined) target.apiKey    = String(s.apiKey);

  // Timeout
  if (s.timeout  !== undefined) target.timeout   = Number(s.timeout);

  // Knowledge / workspace paths
  if (s.workspaceBasePath !== undefined)
    target.workspaceBasePath = String(s.workspaceBasePath);
  if (s.knowledgeBasePath !== undefined)
    target.knowledgeBasePath = String(s.knowledgeBasePath);

  // Debug mode
  const debugRaw = s.debugMode !== undefined
    ? s.debugMode
    : (s.debug !== undefined ? s.debug : (src as any).debug);

  if (typeof debugRaw === 'boolean') {
    target.debugMode = debugRaw;
    target.debugLevel = debugRaw ? (target.debugLevel || 'full') : 'none';
  } else if (typeof debugRaw === 'string') {
    const lvl = str(debugRaw);
    if (lvl) {
      target.debugMode = lvl !== 'none';
      target.debugLevel = level(lvl);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────

export function buildRAGConfig(): RAGConfig {
  const cfg: RAGConfig = {
    baseUrl:    'http://localhost:3011',
    apiKey:     undefined,
    timeout:    30000,
    debugMode:  false,
    debugLevel: 'none',
    workspaceBasePath: process.cwd(),
  };

  const globalRaw = readIfExists(GLOBAL_PATH);
  if (globalRaw) apply(globalRaw, cfg);

  const projectRaw = readIfExists(PROJECT_PATH);
  if (projectRaw) apply(projectRaw, cfg);

  if (process.env.RAG_URL)            cfg.baseUrl    = process.env.RAG_URL;
  if (process.env.RAG_API_KEY)        cfg.apiKey     = process.env.RAG_API_KEY;
  const t = num(process.env.RAG_TIMEOUT);
  if (t !== undefined)                   cfg.timeout    = t;
  if (process.env.KNOWLEDGE_BASE_PATH)
    cfg.workspaceBasePath = process.env.KNOWLEDGE_BASE_PATH;
  if (process.env.WORKSPACE_BASE_PATH)
    cfg.workspaceBasePath = process.env.WORKSPACE_BASE_PATH;

  if (process.env.RAG_DEBUG === 'true' || process.env.RAG_DEBUG === '1') {
    cfg.debugMode = true;
    cfg.debugLevel = process.env.RAG_DEBUG_LEVEL ? level(process.env.RAG_DEBUG_LEVEL) : 'summary';
  }
  if (process.env.RAG_DEBUG) {
    cfg.debugMode = true;
    cfg.debugLevel = process.env.RAG_DEBUG === 'full' || process.env.RAG_DEBUG === 'verbose'
      ? 'full'
      : (process.env.RAG_DEBUG === 'none' ? 'none' : (cfg.debugLevel || 'summary'));
  }
  if (process.env.RAG_DEBUG_LEVEL) {
    cfg.debugLevel = level(process.env.RAG_DEBUG_LEVEL);
  }

  // Sync file logger's internal state with config
  if (cfg.debugMode) {
    fl.setDebugLevel(cfg.debugLevel || 'full');
  }

  // Hook into file logger if debug is active
  if (cfg.debugMode && cfg.debugLevel !== 'none') {
    cfg._fetchHooks = {
      onRequest(method, url, body) {
        fl.debugWrite('DEBUG-REQ', method, url);
        fl.logRequest(method, url, body);
      },
      onResponse(status, url, body) {
        fl.debugWrite('DEBUG-RES', status, url);
        fl.logResponse(status, body);
      },
    };
  }

  return cfg;
}

// ── Re-export file logger (file-based, not console) ───────────

import * as fl from './file-logger';

export {
  setDebugLevel,
  logError,
  logInfo,
} from './file-logger';

export {
  debugWrite,
  logRequest,
  logResponse,
} from './file-logger';
