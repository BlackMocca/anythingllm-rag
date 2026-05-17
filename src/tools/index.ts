/**
 * knowledge_* Tool Modules
 *
 * Exports: knowledge_search, knowledge_read, knowledge_write, knowledge_list
 *
 * Dependencies:
 *   - parser -> WorkspaceRegistry
 *   - resolver -> WorkspaceResolver + resolvePath
 *   - security -> sanitizePath, ensureInWorkspace, SafeResult
 *   - rag -> RAG adapter (for knowledge_search)
 *
 * All tools validate workspace existence before operation.
 * All tools wrap I/O in try/catch, never throw to runtime.
 */

import { readFile, writeFile, mkdir, rename, unlink, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';

import type { WorkspaceRegistry } from '../parser';
import type { WorkspaceResolver, WorkspaceInfo } from '../resolver';
import type {
  SafeResult,
  Logger,
  WorkspaceError,
} from '../security';
import {
  isValidWorkspace,
  sanitizePath,
  createWhitelist,
  DEFAULT_LOGGER,
} from '../security';

import { searchRAG as ragSearch, checkHealth } from '../rag';
import type { RAGConfig, KnowledgeSearchResult } from '../rag';

// --- Type Definitions ---

export type SearchOptions = {
  topK?: number;
};

export type SearchResult =
  | { ok: true; documents: KnowledgeSearchResult[]; total: number }
  | { ok: false; error: string };

export type ReadResult =
  | { ok: true; content: string; size: number }
  | { ok: false; error: string };

export type WriteResult =
  | { ok: true; bytesWritten: number }
  | { ok: false; error: string };

export type ListItem = {
  name: string;
  type: 'file' | 'directory';
};

export type ListResult =
  | { ok: true; entries: ListItem[] }
  | { ok: false; error: string };

// --- Internal Helpers ---

function makeError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

// --- knowledge_search ---

/**
 * Search a workspace via the RAG backend.
 */
export async function knowledgeSearch(
  workspace: string,
  query: string,
  options: SearchOptions = { topK: 5 },
  config?: RAGConfig,
  resolver?: WorkspaceResolver
): Promise<SearchResult> {
  try {
    if (!resolver) {
      return { ok: false, error: 'WorkspaceResolver not provided' };
    }
    if (!resolver.exists(workspace)) {
      return { ok: false, error: 'Workspace "' + workspace + '" not found' };
    }
    if (!config) {
      return { ok: false, error: 'RAGConfig not provided' };
    }

    const res = resolver.resolvePath(workspace);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const whitelist = new Set(resolver.names());
    if (!isValidWorkspace(workspace, whitelist)) {
      return { ok: false, error: 'Workspace "' + workspace + '" is not authorized' };
    }

    const topK = options.topK ?? 5;
    const ragResult = await ragSearch(config, workspace, query, topK);

    if (!ragResult.ok) {
      return { ok: false, error: ragResult.error };
    }

    return { ok: true, documents: ragResult.data, total: ragResult.data.length };
  } catch (err) {
    return { ok: false, error: makeError(err) };
  }
}

// --- knowledge_read ---

/**
 * Read a file from a sandboxed workspace directory.
 */
export async function knowledgeRead(
  workspace: string,
  filepath: string,
  resolver?: WorkspaceResolver,
  wsRoot?: string
): Promise<ReadResult> {
  try {
    if (!workspace || !filepath) {
      return { ok: false, error: 'Workspace and filepath are required' };
    }

    if (!resolver) {
      return { ok: false, error: 'WorkspaceResolver not provided' };
    }

    if (!resolver.exists(workspace)) {
      return { ok: false, error: 'Workspace "' + workspace + '" not found' };
    }

    const res = resolver.resolvePath(workspace);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const root = wsRoot || res.path;
    const safe = sanitizePath(root, filepath);
    if (!safe.ok) {
      return { ok: false, error: safe.error };
    }

    const content = await readFile(safe.resolved, { encoding: 'utf-8' });
    const size = Buffer.byteLength(content as string, 'utf-8');

    return { ok: true, content: content as string, size };
  } catch (err) {
    const msg = makeError(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      return { ok: false, error: 'FILE_NOT_FOUND: ' + msg };
    }
    return { ok: false, error: 'READ_ERROR: ' + msg };
  }
}

// --- knowledge_write ---

/**
 * Write content to a file inside a sandboxed workspace.
 */
export async function knowledgeWrite(
  workspace: string,
  filepath: string,
  content: string,
  resolver?: WorkspaceResolver,
  wsRoot?: string
): Promise<WriteResult> {
  try {
    if (!workspace || !filepath) {
      return { ok: false, error: 'Workspace and filepath are required' };
    }

    if (typeof content !== 'string') {
      return { ok: false, error: 'Content must be a string' };
    }

    if (!resolver) {
      return { ok: false, error: 'WorkspaceResolver not provided' };
    }

    if (!resolver.exists(workspace)) {
      return { ok: false, error: 'Workspace "' + workspace + '" not found' };
    }

    const res = resolver.resolvePath(workspace);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const root = wsRoot || res.path;
    const safe = sanitizePath(root, filepath);
    if (!safe.ok) {
      return { ok: false, error: safe.error };
    }

    if (!path.isAbsolute(safe.resolved)) {
      return { ok: false, error: 'Resolved path is not absolute' };
    }

    const dir = path.dirname(safe.resolved);
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      return { ok: false, error: 'Failed to create directory: ' + makeError(err) };
    }

    const tmpPath = safe.resolved + '.tmp.' + Date.now();
    try {
      await writeFile(tmpPath, content as string, { encoding: 'utf-8' });
      await rename(tmpPath, safe.resolved);
    } catch (err) {
      try {
        await unlink(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      return { ok: false, error: 'Write failed: ' + makeError(err) };
    }

    const bytesWritten = Buffer.byteLength(content as string, 'utf-8');
    return { ok: true, bytesWritten };
  } catch (err) {
    return { ok: false, error: makeError(err) };
  }
}

// --- knowledge_list ---

/**
 * List entries inside a sandboxed workspace directory.
 */
export async function knowledgeList(
  workspace: string,
  dirPath: string = '.',
  resolver?: WorkspaceResolver
): Promise<ListResult> {
  try {
    if (!workspace) {
      return { ok: false, error: 'Workspace is required' };
    }

    if (!resolver) {
      return { ok: false, error: 'WorkspaceResolver not provided' };
    }

    if (!resolver.exists(workspace)) {
      return { ok: false, error: 'Workspace "' + workspace + '" not found' };
    }

    const res = resolver.resolvePath(workspace);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const root = res.path;
    const safe = sanitizePath(root, dirPath);
    if (!safe.ok) {
      return { ok: false, error: safe.error };
    }

    try {
      const info = await stat(safe.resolved);
      if (!info.isDirectory()) {
        return { ok: false, error: 'Path is not a directory' };
      }
    } catch (err) {
      return { ok: false, error: 'Cannot access directory: ' + makeError(err) };
    }

    const entries = await readdir(safe.resolved, { withFileTypes: true });
    const items: ListItem[] = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    }));

    return { ok: true, entries: items };
  } catch (err) {
    return { ok: false, error: makeError(err) };
  }
}
