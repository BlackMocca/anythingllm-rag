
/**
 * RAG Backend Adapter Module
 *
 * Official AnythingLLM REST API adapter.
 *
 * API base path: <baseUrl>/api/v1/  (e.g. http://host:8081/api/v1/)
 * Auth header:   Authorization: Bearer <api-key>
 *
 * Endpoints:
 *   POST /workspace/{slug}/vector-search   - Knowledge search
 *   POST /workspace/{slug}/chat               - Query chat (LLM + embeddings)
 *   GET  /documents                           - List documents
 *   GET  /workspace/{slug}/chats               - List chats
 */

import type { SafeResult, Logger } from '../security';

export type RAGConfig = {
  baseUrl: string;
  apiKey?: string;
  /** Timeout in ms per request (default: 30000) */
  timeout?: number;
  logger?: Logger;
  /** Debug mode flags */
  debugMode?: boolean;
  debugLevel?: 'none' | 'summary' | 'full';
  /** Optional fetch hooks for logging, accepts body/response body */
  _fetchHooks?: {
    onRequest?: (method: string, url: string, body?: Record<string, unknown>) => void;
    onResponse?: (status: number, url: string, body?: unknown) => void;
  };
};

export type KnowledgeSearchResult = {
  id: string;
  text: string;
  score: number;
  /** metadata as returned by AnythingLLM (may contain doc source, URL, etc.) */
  metadata?: Record<string, unknown>;
};

export type ChatChunk = {
  title: string;
  chunk: string;
};

export type ChatResponse = {
  textResponse: string;
  sources: ChatChunk[];
  id: string;
  /** Whether response is complete */
  close: boolean;
  error?: string | undefined;
};

export type DocumentItem = {
  name: string;
  type: string;
  id: string;
  url: string;
  title: string;
};

export type DocumentList = {
  name: string;
  type: string;
  items: DocumentItem[];
};

/** Make an authenticated fetch call. */
async function fetchJson(
  config: RAGConfig,
  path: string,
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  var baseUrl = config.baseUrl;
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.substr(0, baseUrl.length - 1);
  }

  var url = baseUrl + path;
  var headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = 'Bearer ' + config.apiKey;
  }

  // Capture body for logging
  var jsonBody = body !== undefined ? JSON.stringify(body, null, 2) : undefined;

  // ── Log request when debug ──
  if (config.debugLevel && config.debugLevel !== 'none' && config._fetchHooks?.onRequest) {
    config._fetchHooks.onRequest(method, url, body);
  }

  try {
    var _init: RequestInit = { method: method, headers: headers };
    if (body !== undefined) {
      _init.body = JSON.stringify(body);
    }
    var _response: Response;
    if (config.timeout && config.timeout > 0) {
      var _abort = new AbortController();
      var _t = setTimeout(function() { _abort.abort(); }, config.timeout);
      try { _response = await fetch(url, _init); } finally { clearTimeout(_t); }
    } else {
      _response = await fetch(url, _init);
    }

    // Capture response body before reading
    var _resClone = _response.clone();
    var _resBody: unknown;
    try { _resBody = await _resClone.json(); } catch { _resBody = undefined; }

    // ── Log response when debug ──
    if (config.debugLevel && config.debugLevel !== 'none' && config._fetchHooks?.onResponse) {
      config._fetchHooks.onResponse(_response.status, url, _resBody);
    }

    if (_response.ok === false || _response.status >= 400) {
      var errBody = await _response.text();
      var err = 'RAG API ' + method + ' ' + path + ' returned ' + _response.status + ': ' + errBody;
      if (config.logger) { config.logger.error(err); }
      return { ok: false, error: err };
    }

    var raw = await _response.json();
    return { ok: true, data: raw as unknown };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    if (config.logger) { config.logger.error('Network error: ' + msg); }
    return { ok: false, error: msg };
  }
}

/** Get string property from a plain object (returns undefined). */
function objGetStr(obj: { [key: string]: unknown } | undefined, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  var val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

/** Get number property from a plain object. */
function objGetNum(obj: { [key: string]: unknown } | undefined, key: string): number {
  if (!obj || typeof obj !== 'object') return 0;
  var val = obj[key];
  return typeof val === 'number' ? val : 0;
}

/** Get boolean property. */
function objGetBool(obj: { [key: string]: unknown } | undefined, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  var val = obj[key];
  return val === true;
}

/**
 * Vector similarity search.
 * Endpoint: POST /api/v1/workspace/{slug}/vector-search
 * Body:    { query, topN, scoreThreshold }
 * Returns: { results: [{ id, text, metadata, distance, score }] }
 */
export async function searchRAG(
  config: RAGConfig,
  workspace: string,
  query: string,
  topN: number = 5
): Promise<SafeResult<KnowledgeSearchResult[]>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path = '/api/v1/workspace/' + encodeURIComponent(workspace) + '/vector-search';
    var res = await fetchJson(config, path, 'POST', { query: query, topN: Number(topN) });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    var raw = res.data as { results?: unknown[] };
    var results: unknown[] | undefined = raw && typeof raw === 'object' && 'results' in raw
      ? raw['results'] as unknown[]
      : undefined;

    var documents: KnowledgeSearchResult[] = [];
    if (Array.isArray(results)) {
      for (var i = 0; i < results.length; i++) {
        var item: unknown = results[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          var o = item as { [key: string]: unknown };
          var id = objGetStr(o, 'id');
          if (typeof id === 'string') {
            documents.push({
              id: id,
              text: objGetStr(o, 'text') ?? '',
              score: objGetNum(o, 'score'),
              metadata: typeof o['metadata'] === 'object' && !Array.isArray(o['metadata'])
                ? o['metadata'] as Record<string, unknown>
                : undefined,
            });
          }
        }
      }
    }

    return { ok: true, data: documents };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Query chat with LLM + embeddings.
 * Endpoint: POST /api/v1/workspace/{slug}/chat
 * Body:    { message, mode ('query'|'automatic'|'chat'), sessionId }
 * Returns: { textResponse, sources:[{title,chunk}], id, close, error }
 */
export async function chatRAG(
  config: RAGConfig,
  workspace: string,
  query: string,
  opts?: { mode?: string; sessionId?: string }
): Promise<SafeResult<ChatResponse>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path = '/api/v1/workspace/' + encodeURIComponent(workspace) + '/chat';
    var res = await fetchJson(config, path, 'POST', {
      message: query,
      mode: opts && opts.mode ? opts.mode : 'query',
      sessionId: opts && opts.sessionId ? opts.sessionId : undefined,
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    var o = res.data as { [key: string]: unknown } | undefined;
    var text = objGetStr(o, 'textResponse') ?? '';
    var rawSources = o && 'sources' in o ? o['sources'] : undefined;
    var sources: ChatChunk[] = [];

    if (Array.isArray(rawSources)) {
      for (var i = 0; i < rawSources.length; i++) {
        var src = rawSources[i];
        if (src && typeof src === 'object' && !Array.isArray(src)) {
          var so = src as { [key: string]: unknown };
          var title = objGetStr(so, 'title') ?? '';
          var chunk = objGetStr(so, 'chunk') ?? '';
          if (title || chunk) {
            sources.push({ title: title, chunk: chunk });
          }
        }
      }
    }

    return {
      ok: true,
      data: {
        textResponse: text,
        sources: sources,
        id: objGetStr(o, 'id') ?? '',
        close: objGetBool(o, 'close'),
        error: objGetStr(o, 'error'),
      },
    };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * List local documents.
 * GET /api/v1/documents
 */
export async function listDocuments(config: RAGConfig): Promise<SafeResult<DocumentList>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path = '/api/v1/documents';
    var res = await fetchJson(config, path, 'GET');

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    var lf = res.data as { [key: string]: unknown } | undefined;
    if (!lf || !('localFiles' in lf)) {
      return { ok: false, error: 'Unexpected response shape: no localFiles' };
    }

    var o = lf['localFiles'] as { [key: string]: unknown };
    var items: DocumentItem[] = [];
    var rawItems = o && 'items' in o ? o['items'] : undefined;

    if (Array.isArray(rawItems)) {
      for (var i = 0; i < rawItems.length; i++) {
        var it = rawItems[i];
        if (it && typeof it === 'object' && !Array.isArray(it)) {
          var io = it as { [key: string]: unknown };
          items.push({
            name: objGetStr(io, 'name') ?? '',
            type: objGetStr(io, 'type') ?? '',
            id: objGetStr(io, 'id') ?? '',
            url: objGetStr(io, 'url') ?? '',
            title: objGetStr(io, 'title') ?? '',
          });
        }
      }
    }

    return {
      ok: true,
      data: {
        name: objGetStr(o, 'name') ?? '',
        type: objGetStr(o, 'type') ?? '',
        items: items,
      },
    };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * List chats for a workspace.
 * GET /api/v1/workspace/{slug}/chats
 */
export async function listChats(config: RAGConfig, workspace: string): Promise<SafeResult<ChatResponse[]>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path = '/api/v1/workspace/' + encodeURIComponent(workspace) + '/chats';
    var res = await fetchJson(config, path, 'GET');

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    var raw = res.data as unknown[] | undefined;
    var chats: ChatResponse[] = [];

    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var item = raw[i] as { [key: string]: unknown };
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          chats.push({
            textResponse: objGetStr(item, 'textResponse') ?? '',
            sources: [],
            id: objGetStr(item, 'id') ?? '',
            close: objGetBool(item, 'close'),
            error: objGetStr(item, 'error'),
          });
        }
      }
    }

    return { ok: true, data: chats };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * List workspaces.
 * GET /api/v1/workspaces
 * Returns: [{ slug, description?, tags? }]
 */
export async function listWorkspaces(
  config: RAGConfig,
  limit?: number
): Promise<SafeResult<{
  slug: string;
  description?: string;
  tags?: string[];
}[]>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path = '/api/v1/workspaces';
    var res = await fetchJson(config, path, 'GET');
    if (!res.ok) return { ok: false, error: res.error };

    var raw = res.data;
    var items: { slug: string; description?: string; tags?: string[] }[] = [];

    if (Array.isArray(raw)) {
      // [ 'ws1', 'ws2', ... ]
      for (var i = 0; i < raw.length && (!limit || i < limit); i++) {
        var slug = typeof raw[i] === 'string' ? raw[i] : (raw[i] as { slug: string }).slug;
        if (typeof slug === 'string') {
          items.push({ slug: slug });
        }
      }
    } else if (raw && typeof raw === 'object') {
      // { slugs: [...], workspaces: { slug: { ... } } }
      var keys: string[] = [];
      if (Array.isArray((raw as any).slugs)) {
        keys = (raw as any).slugs;
      } else {
        // enumerate known properties
        var ws = (raw as any).workspaces;
        if (ws && Array.isArray(ws)) {
          // [ { slug, description?, tags? }, ... ]
          for (var k = 0; k < ws.length && (!limit || k < limit); k++) {
            var w0 = ws[k];
            if (w0 && typeof w0 === 'object') {
              var o0 = w0 as { [key: string]: unknown };
              var s0 = (o0['slug'] && typeof o0['slug'] === 'string')
                ? o0['slug']
                : (o0['name'] && typeof o0['name'] === 'string' ? o0['name'] : undefined);
              if (typeof s0 === 'string') {
                var tags: string[] | undefined = undefined;
                var t0 = o0['tags'];
                if (typeof t0 === 'string') tags = t0.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
                else if (Array.isArray(t0)) tags = t0 as string[];
                items.push({
                  slug: s0,
                  description: (o0['description'] && typeof o0['description'] === 'string') ? o0['description'] : undefined,
                  tags: tags,
                });
              }
            }
          }
        } else if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
          var obj2 = ws as { [key: string]: { slug?: string; workspaceSlug?: string; description?: string; tags?: string | string[] } };
          for (var key2 in obj2) {
            var entry2 = obj2[key2];
            if (!entry2) continue;
            var s2 = entry2.slug || entry2.workspaceSlug || key2;
            if (typeof s2 === 'string') {
              var tags2: string[] | undefined = undefined;
              var t2 = entry2.tags;
              if (typeof t2 === 'string') tags2 = t2.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
              else if (Array.isArray(t2)) tags2 = t2 as string[];
              items.push({
                slug: s2,
                description: typeof entry2.description === 'string' ? entry2.description : undefined,
                tags: tags2,
              });
            }
          }
        }
      }
      var slugs = Array.isArray(keys) ? keys : [];
      for (var j = 0; j < slugs.length && (!limit || j < limit); j++) {
        var wS0 = slugs[j];
        if (typeof wS0 === 'string') items.push({ slug: wS0 });
      }
    }

    return { ok: true, data: items };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Get details for a single workspace.
 * GET /api/v1/workspace/{slug}
 */
export async function getWorkspaceDetail(
  config: RAGConfig,
  slug: string
): Promise<SafeResult<{ slug: string; description?: string; tags?: string[] }>> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, error: 'RAGConfig missing baseUrl' };
    }

    var path2 = '/api/v1/workspace/' + encodeURIComponent(slug);
    var res = await fetchJson(config, path2, 'GET');
    if (!res.ok) return { ok: false, error: res.error };

    var d = res.data as { [key: string]: unknown } | undefined;
    if (!d || typeof d !== 'object') return { ok: false, error: 'Unexpected response shape' };

    var wsSlug = d['workspaceSlug'] ?? d['slug'];
    var desc = typeof d['description'] === 'string' ? d['description'] : (typeof wsSlug === 'string' ? wsSlug : undefined);
    var t = d['tags'];
    var tags: string[] = [];
    if (typeof t === 'string') tags = t.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
    else if (Array.isArray(t)) tags = t as string[];

    return { ok: true, data: { slug: slug, description: desc, tags: tags } };
  } catch (err: unknown) {
    var errmsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errmsg };
  }
}

/**
 * Health check — uses raw fetch so we can log response bodies.
 */
export async function checkHealth(config: RAGConfig): Promise<{ ok: boolean; apiKeyConfigured: boolean; status?: number; error?: string }> {
  try {
    if (!config || !config.baseUrl) {
      return { ok: false, apiKeyConfigured: !!config.apiKey };
    }

    var baseUrl = config.baseUrl;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.substr(0, baseUrl.length - 1);
    }

    var _response: Response;
    try {
        var url = baseUrl + '/api/v1/auth';
        
        // ── Log request when debug ──
        if (config.debugLevel && config.debugLevel !== 'none' && config._fetchHooks?.onRequest) {
          config._fetchHooks.onRequest('GET', url, undefined);
        }
        
        _response = await fetch(url, {
          method: 'GET',
          headers: config.apiKey ? { 'Authorization': 'Bearer ' + config.apiKey } : {},
        });
    } catch (err) {
      return { ok: false, apiKeyConfigured: !!config.apiKey, status: 0, error: err instanceof Error ? err.message : String(err) };
    }

    // ── Log response when debug ──
    if (config.debugLevel && config.debugLevel !== 'none' && config._fetchHooks?.onResponse) {
      config._fetchHooks.onResponse(_response.status, baseUrl + '/api/v1/auth', undefined);
    }    var status2 = _response.status;
    return {
      ok: status2 >= 200 && status2 < 400,
      apiKeyConfigured: !!config.apiKey,
      status: status2,
    };
  } catch (err) {
    return { ok: false, apiKeyConfigured: false, error: err instanceof Error ? err.message : String(err) };
  }
}
