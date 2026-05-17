
/**
 * Workspace Resolver Module
 *
 * Resolves workspace names to filesystem paths:
 *   1. KNOWLEDGE.md -> registry (name -> metadata)
 *   2. Config directory (basePath -> workspace ID -> root path)
 *
 * Lazy loading: path resolved only on first access.
 * Case-sensitive exact match on workspace names.
 */

import type { WorkspaceRegistry } from '../parser';

export interface WorkspaceInfo {
  name: string;
  description: string;
  tags: string[];
}

export type ResolveResult =
  | { ok: true; path: string; info?: WorkspaceInfo }
  | { ok: false; error: string; details?: string };

export class WorkspaceResolver {
  private _registry: Map<string, WorkspaceInfo> = new Map();
  private _basePath: string;

  constructor(basePath: string, registry: WorkspaceRegistry) {
    this._basePath = basePath;
    for (const [name, def] of Object.entries(registry)) {
      this._registry.set(name, {
        name: def.name,
        description: def.description,
        tags: def.tags,
      });
    }
  }

  static fromSource(basePath: string, source: string): WorkspaceResolver {
    const registry: Record<string, { name: string; description: string; tags: string[] }> = {};

    const SEPARATOR_RE = /^---+$/;
    const FIELD_NAME_RE = /^name:\s*(.+)$/im;
    const FIELD_DESC_RE = /^description:\s*(.+)$/im;
    const FIELD_TAGS_RE = /^tag:\s*(.+)$/im;

    const cleaned = source.replace(/[\ud800-\udfff]/g, '\ufffd');
    const blocks = cleaned.split(SEPARATOR_RE);

    for (const block of blocks) {
      if (!block.trim()) continue;
      const nameM = FIELD_NAME_RE.exec(block);
      if (!nameM || !nameM[1].trim()) continue;
      const name = nameM[1].trim();
      registry[name] = {
        name,
        description: (FIELD_DESC_RE.exec(block)?.[1] || '').trim(),
        tags: (FIELD_TAGS_RE.exec(block)?.[1] || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
    }

    return new WorkspaceResolver(basePath, registry as WorkspaceRegistry);
  }

  exists(name: string): boolean {
    return this._registry.has(name);
  }

  getInfo(name: string): WorkspaceInfo | null {
    return this._registry.get(name) ?? null;
  }

  resolvePath(name: string): ResolveResult {
    if (!this._registry.has(name)) {
      const names = [...this._registry.keys()].join(', ') || '(none)';
      return {
        ok: false,
        error: "Workspace \"" + name + "\" not found in registry",
        details: "Valid names: " + names,
      };
    }
    const info = this._registry.get(name)!;
    const path = this._basePath + '/' + info.name;
    return { ok: true, path, info };
  }

  names(): string[] {
    return [...this._registry.keys()].sort();
  }

  getBasePath(): string {
    return this._basePath;
  }
}
