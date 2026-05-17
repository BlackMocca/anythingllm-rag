/**
 * PI Agent Extension Bridge
 *
 * Provides five `knowledge_*` tools + one slash command:
 *   /anythingllm-rag-init    Discover workspaces from RAG backend, generate KNOWLEDGE.md
 *   knowledge_search      RAG query against AnythingLLM
 *   knowledge_read        Safe read from workspace dir
 *   knowledge_write       Safe write to workspace dir
 *   knowledge_list        List workspace directory
 *   knowledge_list_workspaces  List known workspaces
 *
 * Usage in PI dev mode:
 *   pi -e ./src/pi-agent/bridge.ts
 *
 * Usage as extension (auto-discovered):
 *   Place in ~/.pi/agent/extensions/anything-llm.ts
 */

import type { WorkspaceResolver } from '../resolver';
import type { RAGConfig } from '../rag';
import * as path from 'path';
import { buildRAGConfig, setDebugLevel, logError, logRequest, logResponse } from '../config-loader';
import { LOG_FILE } from '../file-logger';
import {
  knowledgeSearch, knowledgeRead, knowledgeWrite, knowledgeList,
} from '../tools';
import { loadRegistry, collectAllTags } from './registry-loader';
import { routeQuery, resolveWorkspace } from './routing';

// ── Known workspace definitions (hard-coded for discovery fallback) ──

var knownWorkspaces: { slug: string; description?: string; tags: string }[] = [];


// ── Truncated output helper ──

function truncateText(text: string, limit: number): { content: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf-8') <= limit) {
    return { content: text, truncated: false };
  }
  var c = 0;
  while (c < text.length && Buffer.byteLength(text.substring(0, c + 1), 'utf-8') <= limit) {
    c++;
  }
  return {
    content: text.substring(0, c) + '\n\n[Output truncated...]',
    truncated: true,
  };
}

// ── Lazy TypeBox (PI runtime only) ──

var TB: any = null;
function _TB(): any { return TB || (TB = require('typebox')); }

// ── RAG API fetch helper ──

async function _apiFetch(cfg: RAGConfig, path: string, method: string, body?: any) {
  var base = cfg.baseUrl;
  if (base.endsWith('/')) base = base.substring(0, base.length - 1);
  var headers: any = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  var opts: RequestInit = { method, headers };
  var rawBody = body !== undefined ? JSON.stringify(body) : undefined;

  // ── Log request when debug (check both debugMode and debugLevel) ──
  if (cfg.debugMode && cfg.debugLevel !== 'none') {
    try { logRequest(method, base + path, body); } catch {}
  }

  var url = base + path;
  try {
    var res = await fetch(url, opts);
    var raw = await res.json();

    // ── Log response when debug ──
    if (cfg.debugMode && cfg.debugLevel !== 'none') {
      logResponse(res.status, raw);
    }

    return { ok: res.ok, status: res.status, data: raw };
  } catch (e: any) {
    var msg = e && e.message ? e.message : String(e);
    return { ok: false, status: 0, error: 'Network error: ' + msg };
  }
}

// ── Fetch workspaces from RAG backend ──

type WorkspaceEntry = {
  slug: string;
  description?: string;
  tags?: string[];
};

function cleanTags(tagsRaw: string): string[] {
  return tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(function(x) { return x ? true : false; });
}

async function _fetchRagWorkspaceList(cfg: RAGConfig, limit: number): Promise<{
  workspaces: WorkspaceEntry[];
  errors: string[];
}> {
  var workspaces: WorkspaceEntry[] = [];
  var errors: string[] = [];

  // Try API to get workspace names
  var listRes = await _apiFetch(cfg, '/api/v1/workspaces', 'GET');
  var slugs: string[] = [];

  if (typeof listRes.data === 'string') {
    // String response — parse JSON
    try { slugs = JSON.parse(listRes.data) as string[]; } catch { slugs = []; }
  } else if (Array.isArray((listRes as any).data)) {
    // Array of strings
    slugs = (listRes.data as string[]) || [];
  } else if (listRes.data && typeof listRes.data === 'object') {
    // Object mapping { slug: { info } }
    var raw = listRes.data as Record<string, unknown>;
    if ('slugs' in raw) {
      slugs = (raw['slugs'] as string[]) || [];
    } else if ('slugs' in raw) {
      slugs = Object.keys(raw as Record<string, unknown>);
    } else {
      // Fallback: flatten nested objects
      var _raw2 = raw as any;
      for (var _k in _raw2) {
        if (_raw2[_k] && typeof _raw2[_k] === 'object' && !Array.isArray(_raw2[_k])) {
          var _sub = _raw2[_k] as Record<string, unknown>;
          if ('slug' in _sub) {
            slugs.push(_sub['slug'] as string);
          } else if ('name' in _sub) {
            slugs.push(_sub['name'] as string);
          } else {
            throw new Error('API returned unexpected shape: ' + JSON.stringify(_raw2));
          }
        }
      }
    }
  }

  if (slugs.length > 0) {
    for (var i = 0; i < slugs.length && i < limit; i++) {
      var slug = slugs[i];
      var detailsRes = await _apiFetch(cfg, '/api/v1/workspaces/' + encodeURIComponent(slug), 'GET');
      if (detailsRes.ok && detailsRes.data && typeof detailsRes.data === 'object') {
        var d = detailsRes.data as Record<string, unknown>;
        var desc: string | undefined;
        var tags: string[] = [];
        var wsSlug = d['workspaceSlug'];
        desc = wsSlug && typeof wsSlug === 'string' ? wsSlug : (d['description'] && typeof d['description'] === 'string' ? d['description'] : undefined);
        var t = d['tags'];
        if (t && typeof t === 'string') tags = t.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
        else if (Array.isArray(t)) tags = t as string[];
        workspaces.push({ slug: slug, description: desc, tags: tags });
      } else {
        errors.push('Failed to get details: ' + slug);
      }
    }
  } else if (slugs.length === 0) {
    // No API access — return empty
    workspaces = [];
  }

  return { workspaces, errors };
}

// ── Main extension ──

var ctx: {
  workspaceResolver: WorkspaceResolver;
  ragConfig: RAGConfig;
} = {
  workspaceResolver: null as any,
  ragConfig: {} as any,
};

function buildCtxResolvers() {
  try {
    ctx.workspaceResolver = loadRegistry();
  } catch (_) {
    ctx.workspaceResolver = loadRegistry({
      knowledgePath: path.join(process.cwd(), 'examples', 'KNOWLEDGE.md'),
      workspaceBasePath: process.cwd(),
    });
  }
  ctx.ragConfig = buildRAGConfig();
}

export default function myExtension(pi: any) {
  buildCtxResolvers();

  // ── Session events ──
  if (pi && typeof pi.on === 'function') {
    pi.on('session_start', function() { buildCtxResolvers(); });
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  Slash command: /anythingllm-rag-init                    ║
  // ║  Discovers workspaces from RAG backend and shows      ║
  // ║  their descriptions + tags.  Use `--write` to         ║
  // ║  generate KNOWLEDGE.md (./KNOWLEDGE.md).              ║
  // ╚══════════════════════════════════════════════════════════╝

  // ── Log file path helper ──
  function _logFilePath(): string {
    return LOG_FILE;
  }

  // ── Slash command handler ──
  async function _handleRagInit(rawArgs: string, ctx2: any): Promise<string> {
    try {
      var cfg = ctx.ragConfig || buildRAGConfig();

      // — Ensure file logger is always synced (PI may pass ragConfig directly) —
      if (cfg.debugMode) {
        setDebugLevel(cfg.debugLevel || 'full');
      }
      var doWrite = false;
      var apiLimit = 10;
      var args = (rawArgs || '').trim().split(/\s+/);
      doWrite = args.indexOf('--write') >= 0;
      
      var parts: string[] = [];
      parts.push('');
      parts.push('**ANYTHING-RAG INIT**');
      parts.push('');

      var url = cfg.baseUrl;
      var hasApiKey = !!cfg.apiKey;
      parts.push('RAG backend: ' + url + (hasApiKey ? ' (api key set)' : ' (no api key)'));
      parts.push('');

      var entries: WorkspaceEntry[] = [];
      var apiErrors: string[] = [];
      try {
        var apiRes = await _fetchRagWorkspaceList(cfg, apiLimit);
        entries = apiRes.workspaces;
        apiErrors = apiRes.errors || [];
      } catch (e: any) {
        var em = e && e.message ? e.message : String(e);
        logError('INIT-RAG', 'Fetch failed', em);
        parts.push('⚠ Could not reach RAG (' + url + '): ' + em);
        entries = [];
      }
      if (entries.length === 0) {
        parts.push('⚠ No workspaces found from RAG API.');
      }

      if (apiErrors.length > 0) {
        parts.push('');
        parts.push('⚠ Workspace fetch errors:');
        for (var _j = 0; _j < apiErrors.length; _j++) {
          parts.push('  - ' + apiErrors[_j]);
        }
      }

      // Always ensure log file exists
      var logPath = _logFilePath();
      logError('INIT', 'check API settings', { entries: entries.length, errors: apiErrors, logFile: logPath });
      try { require('fs').writeFileSync(logPath, '', 'utf-8'); } catch {}

      parts.push('');
      parts.push('⚠ If there are errors, please see the log file:');
      parts.push('📄 ' + logPath);
      parts.push('');

      parts.push('');
      parts.push('Discovered workspaces (' + entries.length + '):');
      for (var _n = 0; _n < entries.length; _n++) {
        var e = entries[_n];
        parts.push('  * `' + e.slug + '`');
        if (e.description) parts.push('    desc: ' + e.description);
        if (e.tags && e.tags.length > 0) parts.push('    tags: ' + e.tags.join(', '));
      }
      parts.push('');

      if (!doWrite) {
        parts.push('To generate KNOWLEDGE.md, run /anythingllm-rag-init --write');
        parts.push('');
      } else {
        var lines = ['# Workspaces', ''];
        for (var _i2 = 0; _i2 < entries.length; _i2++) {
          var w2 = entries[_i2];
          var tagStr = (w2.tags && w2.tags.length > 0) ? w2.tags.join(', ') : '';
          lines.push('- ' + w2.slug + ' — ' + tagStr);
        }
        lines.push('');
        var md = lines.join('\n');

        var outputPath = './KNOWLEDGE.md';
        try {
          require('fs').writeFileSync(outputPath, md, 'utf-8');
          parts.push('✅ KNOWLEDGE.md written to: ' + outputPath);
          parts.push('');
          parts.push('Preview:');
          parts.push('```');
          parts.push(md.split('\n').slice(0, 15).join('\n'));
          parts.push('```');
        } catch (ew: any) {
          var ewm = ew && ew.message ? ew.message : String(ew);
          parts.push('❌ Failed to write KNOWLEDGE.md: ' + ewm);
          parts.push('📄 Log file: ' + _logFilePath());
        }
      }

      var output = parts.join('\n');
      if (ctx2 && ctx2.ui) ctx2.ui.notify(output, 'info');
      return output;
    } catch (err: any) {
      var msg = err && err.message ? err.message : String(err);
      var logPath = _logFilePath();
      logError('INIT-CMD', 'command error', { command: 'anythingllm-rag-init', error: msg, logFile: logPath });
      return '❌ /anythingllm-rag-init failed: ' + msg;
    }
  }

  if (pi && typeof pi.registerCommand === 'function') {
    pi.registerCommand('anythingllm-rag-init', {
      description: 'Discover workspaces from RAG backend and generate KNOWLEDGE.md',

      handler: async function(rawArgs: string, ctx2: any) {
        return await _handleRagInit(rawArgs, ctx2);
      },
    });
  }

  // ╔══════════════════════════════════════════════════════╗
  // ║  Knowledge tools (called by PI agent LLM)          ║
  // ╚══════════════════════════════════════════════════════╝
  if (pi && typeof pi.registerTool === 'function') {

    // ── knowledge_search ──
    pi.registerTool({
      name: 'knowledge_search',
      label: 'Knowledge Search',
      description: 'Search workspace knowledge base via RAG (AnythingLLM). Queries are routed automatically by tags.',
      promptSnippet: 'Search workspace knowledge via RAG',
      parameters: _TB().Type.Object({
        workspace: _TB().Type.Optional(_TB().Type.String({ description: 'Workspace name (auto-routed if omitted)' })),
        query: _TB().Type.String({ description: 'Search query — what to find in the knowledge base' }),
        topK: _TB().Type.Optional(_TB().Type.Number({ description: 'Number of results (default 3)' })),
      }),
      async execute(_toolId: string, params: any) {
        try {
          if (!ctx.workspaceResolver) buildCtxResolvers();
          var resolver = ctx.workspaceResolver!;
          var route = resolveWorkspace(resolver, params.query, params.workspace);
          if (!route.ok) {
            return { content: [{ type: 'text', text: 'Error: ' + route.error }] };
          }
          var wsName = route.primary;
          var cfg = ctx.ragConfig || buildRAGConfig();
          if (!cfg) {
            return { content: [{ type: 'text', text: 'No RAG backend configured.' }] };
          }

          var res = await knowledgeSearch(wsName, params.query, { topK: params.topK || 3 }, cfg, resolver);
          if (!res.ok) {
            return { content: [{ type: 'text', text: 'Search error: ' + res.error }] };
          }

          var txt = 'Workspace: ' + wsName + '\nResults (' + res.total + '):\n';
          for (var i = 0; i < res.documents.length; i++) {
            var d = res.documents[i];
            txt += '[' + i + '] score=' + d.score + ': ' + d.text.substring(0, 200) + '\n';
          }
          var t = truncateText(txt, 72000);
          return { content: [{ type: 'text', text: t.content + (t.truncated ? '\n[Truncated]' : '') }] };
        } catch (e: any) {
          var m = e && e.message ? e.message : String(e);
          return { content: [{ type: 'text', text: 'Exception: ' + m }] };
        }
      },
    });

    // ── knowledge_read ──
    pi.registerTool({
      name: 'knowledge_read',
      label: 'Knowledge Read',
      description: 'Read a file from a sandboxed workspace directory. Path traversal is blocked.',
      promptSnippet: 'Read files from inside a workspace',
      parameters: _TB().Type.Object({
        workspace: _TB().Type.String({ description: 'Workspace name' }),
        filepath: _TB().Type.String({ description: 'Relative path inside workspace (no ../)' }),
      }),
      async execute(_toolId: string, params: any) {
        try {
          if (!ctx.workspaceResolver) buildCtxResolvers();
          var resolver = ctx.workspaceResolver!;
          if (!resolver.exists(params.workspace)) {
            return { content: [{ type: 'text', text: 'Unknown workspace: ' + params.workspace }] };
          }
          var res = await knowledgeRead(params.workspace, params.filepath, resolver);
          if (!res.ok) return { content: [{ type: 'text', text: 'Read error: ' + res.error }] };
          var t = truncateText(res.content, 72000);
          return { content: [{ type: 'text', text: 'File: ' + params.filepath + '\n' + t.content + (t.truncated ? '\n[Truncated]' : '') }] };
        } catch (e: any) {
          var m = e && e.message ? e.message : String(e);
          return { content: [{ type: 'text', text: 'Exception: ' + m }] };
        }
      },
    });

    // ── knowledge_write ──
    pi.registerTool({
      name: 'knowledge_write',
      label: 'Knowledge Write',
      description: 'Write content safely inside a workspace directory. Atomic renames.',
      promptSnippet: 'Write files safely to workspaces',
      parameters: _TB().Type.Object({
        workspace: _TB().Type.String({ description: 'Workspace name' }),
        filepath: _TB().Type.String({ description: 'Relative path inside workspace (no ../)' }),
        content: _TB().Type.String({ description: 'File content to write' }),
      }),
      async execute(_toolId: string, params: any) {
        try {
          if (!ctx.workspaceResolver) buildCtxResolvers();
          var resolver = ctx.workspaceResolver!;
          if (!resolver.exists(params.workspace)) {
            return { content: [{ type: 'text', text: 'Unknown workspace: ' + params.workspace }] };
          }
          var res = await knowledgeWrite(params.workspace, params.filepath, params.content, resolver);
          if (!res.ok) return { content: [{ type: 'text', text: 'Write error: ' + res.error }] };
          return { content: [{ type: 'text', text: 'Wrote ' + res.bytesWritten + ' bytes to ' + params.filepath }] };
        } catch (e: any) {
          var m = e && e.message ? e.message : String(e);
          return { content: [{ type: 'text', text: 'Exception: ' + m }] };
        }
      },
    });

    // ── knowledge_list ──
    pi.registerTool({
      name: 'knowledge_list',
      label: 'Knowledge List',
      description: 'List files and directories inside a workspace directory.',
      promptSnippet: 'List workspace directory contents',
      parameters: _TB().Type.Object({
        workspace: _TB().Type.String({ description: 'Workspace name' }),
        dirPath: _TB().Type.Optional(_TB().Type.String({ description: 'Directory path (default: .)' })),
      }),
      async execute(_toolId: string, params: any) {
        try {
          if (!ctx.workspaceResolver) buildCtxResolvers();
          var resolver = ctx.workspaceResolver!;
          if (!resolver.exists(params.workspace)) {
            return { content: [{ type: 'text', text: 'Unknown workspace: ' + params.workspace }] };
          }
          var res = await knowledgeList(params.workspace, params.dirPath || '.', resolver);
          if (!res.ok) return { content: [{ type: 'text', text: 'List error: ' + res.error }] };
          var out = '';
          for (var i = 0; i < res.entries.length; i++) {
            out += (res.entries[i].type === 'directory' ? '[D] ' : '[F] ') + res.entries[i].name + '\n';
          }
          return { content: [{ type: 'text', text: 'Directory: ' + out + 'Total: ' + res.entries.length }] };
        } catch (e: any) {
          var m = e && e.message ? e.message : String(e);
          return { content: [{ type: 'text', text: 'Exception: ' + m }] };
        }
      },
    });

    // ── knowledge_list_workspaces ──
    pi.registerTool({
      name: 'knowledge_list_workspaces',
      label: 'Knowledge Workspaces',
      description: 'List all known workspaces with their descriptions and tags for discovery.',
      promptSnippet: 'List all available knowledge workspaces',
      parameters: _TB().Type.Object({
        filter: _TB().Type.Optional(_TB().Type.String({ description: 'Optional tag or keyword to filter by' })),
      }),
      async execute(_toolId: string, params: any) {
        try {
          if (!ctx.workspaceResolver) buildCtxResolvers();
          var resolver = ctx.workspaceResolver!;
          var names = resolver.names();
          if (names.length === 0) {
            return { content: [{ type: 'text', text: 'No workspaces found.' }] };
          }
          var allTags = collectAllTags(resolver);
          var out = 'Workspaces (' + names.length + ', tags: ' + allTags.join(',') + '):\n\n';
          for (var i = 0; i < names.length; i++) {
            var info = resolver.getInfo(names[i]);
            if (!info) continue;
            if (params.filter && params.filter.trim()) {
              var f = params.filter.toLowerCase();
              if (info.tags.join(' ').toLowerCase().indexOf(f) < 0 && info.description.toLowerCase().indexOf(f) < 0) continue;
            }
            out += '  * ' + info.name + ': ' + info.description + '\n' + '    tags: ' + info.tags.join(', ') + '\n\n';
          }
          return { content: [{ type: 'text', text: out }] };
        } catch (e: any) {
          var m = e && e.message ? e.message : String(e);
          return { content: [{ type: 'text', text: 'Exception: ' + m }] };
        }
      },
    });
  }
}
