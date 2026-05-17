
/**
 * Security Layer Module
 *
 * Responsibilities:
 *   1. Workspace whitelist enforcement (case-sensitive O(1) lookup)
 *   2. Path traversal protection (reject `..`, absolute paths, control chars)
 *   3. Workspace isolation (every file op scoped to resolved root)
 *   4. Fail-safe error handling (never throw to runtime)
 */

import * as path from 'path';

// ── Type Definitions ──

export type SafePath = string & { _brand: 'SafePath' };

export type SanitizeResult =
  | { ok: true; path: SafePath; resolved: string }
  | { ok: false; error: string };

export type WorkspaceError = string;

/**
 * Structured error wrapper (fail-safe).
 * All I/O-returning helpers return `{ ok, data?, error? }`.
 */
export type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: WorkspaceError };

// ── Logger Interface ──

export type Logger = {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
};

export const DEFAULT_LOGGER: Logger = {
  info: (...args: unknown[]) => console.log('[security]', ...args),
  warn: (...args: unknown[]) => console.warn('[security]', ...args),
  error: (...args: unknown[]) => console.error('[security]', ...args),
};

// ── Constants ──

const RESERVED_NAMES = new Set([
  'node_modules',
  '.git',
  '.env',
  'package.json',
  'package-lock.json',
  '.DS_Store',
]);

/**
 * Check for control characters (except normal whitespace).
 * Rejects null byte, tab, and other control codes in path components.
 */
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

// ── Workspace Whitelist ──

/**
 * Create a fast-lookup whitelist from a registry.
 * O(1) lookup via a Set.
 */
export function createWhitelist(registry: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(registry));
}

/**
 * Check if workspace name is in the allowed list.
 * Case-sensitive, O(1).
 */
export function isValidWorkspace(
  name: string,
  whitelist: Set<string>
): boolean {
  return whitelist.has(name);
}

// ── Path Validation ──

/**
 * Sanitize & resolve a filepath within a workspace root.
 *
 * Validates:
 *   - No null bytes or control characters in any path component
 *   - No `..` segments after resolution (or at input)
 *   - Resolved path stays inside workspace root
 *   - No absolute paths passed as input
 *
 * Returns `{ ok: true, path, resolved }` or `{ ok: false, error }`.
 */
export function sanitizePath(
  workspaceRoot: string,
  filepath: string
): SanitizeResult {
  if (!filepath || typeof filepath !== 'string') {
    return {
      ok: false,
      error: 'Empty or invalid filepath provided',
    };
  }

  if (path.isAbsolute(filepath)) {
    return {
      ok: false,
      error: 'Absolute paths are forbidden',
    };
  }

  const parts = filepath.split(path.sep);
  for (const part of parts) {
    if (CONTROL_CHAR_RE.test(part)) {
      return {
        ok: false,
        error: `Path contains invalid characters in segment: ${part}`,
      };
    }
    if (!part) continue;
  }

  if (filepath.includes('..')) {
    return {
      ok: false,
      error: 'Path traversal detected',
    };
  }

  const resolved = path.resolve(workspaceRoot, filepath);

  if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
    return {
      ok: false,
      error: `Resolved path escapes workspace root: ${resolved}`,
    };
  }

  return { ok: true, path: resolved as SafePath, resolved };
}

/**
 * Ensure a directory is inside the workspace root.
 * Returns true if safe, false if boundary violation.
 */
export function ensureInWorkspace(
  dir: string,
  workspaceRoot: string
): boolean {
  const resolved = path.resolve(workspaceRoot, dir);
  try {
    const normalizedResolved = path.normalize(resolved);
    const normalizedRoot = path.normalize(workspaceRoot);
    return (
      normalizedResolved.startsWith(normalizedRoot + path.sep) ||
      normalizedResolved === normalizedRoot
    );
  } catch {
    return false;
  }
}

/**
 * Validate a filepath component against reserved names.
 * Returns a WorkspaceError string if the component is forbidden.
 */
export function validatePathComponent(component: string): WorkspaceError | null {
  if (RESERVED_NAMES.has(component)) {
    return `Path component "${component}" is a reserved name and cannot be used`;
  }
  return null;
}
