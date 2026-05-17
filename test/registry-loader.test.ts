/**
 * Unit tests for registry-loader module.
 * Tests: loadRegistry, listKnownWorkspaces, collectAllTags, getWorkspaceMetadata.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadRegistry,
  listKnownWorkspaces,
  collectAllTags,
  getWorkspaceMetadata,
  parseKnowledge,
} from '../src';
import type { WorkspaceRegistry } from '../src/parser';
import { WorkspaceResolver } from '../src/resolver';

// ── Fixture data (mirrors examples/KNOWLEDGE.md) ──

const KNOWLEDGE_RAW = fs.readFileSync(
  path.join(__dirname, '..', 'examples', 'KNOWLEDGE.md'),
  'utf-8'
);

// ── parseKnowledge tests ──

describe('parseKnowledge', function () {
  it('parses standard KNOWLEDGE.md blocks', function () {
    const result = parseKnowledge(KNOWLEDGE_RAW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = Object.keys(result.registry);
      expect(names).toContain('billing-service');
      expect(names).toContain('auth-service');
      expect(names).toContain('inventory');
    }
  });

  it('rejects empty input', function () {
    const result = parseKnowledge('');
    expect(result.ok).toBe(false);
  });

  it('rejects non-string input', function () {
    const result = parseKnowledge(null as unknown as string);
    expect(result.ok).toBe(false);
  });

  it('skips blocks without name field', function () {
    const snippet = '\n---\ndescription: no name here\n-';
    const result = parseKnowledge(snippet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.registry).length).toBe(0);
    }
  });

  it('handles duplicate names by keeping first', function () {
    const snippet =
      '\n---\nname: dup\ndescription: first\ntag: a\n---\n---\nname: dup\ndescription: second\ntag: b\n-';
    const result = parseKnowledge(snippet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const entry = result.registry['dup'];
      expect(entry.description).toBe('first');
      expect(result.warnings).toBeDefined();
    }
  });
});

// ── WorkspaceResolver tests ──

describe('WorkspaceResolver', function () {
  var resolver = new WorkspaceResolver(
    '/tmp/ws',
    parseKnowledge(KNOWLEDGE_RAW).registry
  );

  it('exists returns true for known workspace', function () {
    expect(resolver.exists('billing-service')).toBe(true);
  });

  it('exists returns false for unknown workspace', function () {
    expect(resolver.exists('nonexistent')).toBe(false);
  });

  it('getInfo returns data for known workspace', function () {
    var info = resolver.getInfo('billing-service');
    expect(info).not.toBeNull();
    if (info) {
      expect(info.name).toBe('billing-service');
      expect(info.description).toBe('');
      expect(info.tags).toContain('billing');
      expect(info.tags).toContain('invoices');
    }
  });

  it('getInfo returns null for unknown workspace', function () {
    expect(resolver.getInfo('nonexistent')).toBeNull();
  });

  it('resolvePath returns path for known workspace', function () {
    var res = resolver.resolvePath('billing-service');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.path).toContain('billing-service');
    }
  });

  it('resolvePath returns error for unknown workspace', function () {
    var res = resolver.resolvePath('nonexistent');
    expect(res.ok).toBe(false);
  });

  it('names returns sorted list', function () {
    var names = resolver.names();
    expect(names).toEqual(names.sort());
  });
});

// ── loadRegistry tests ──

describe('loadRegistry', function () {
  it('loads from default KNOWLEDGE.md path', function () {
    expect(() => loadRegistry()).not.toThrow();
  });

  it('loads from custom path', function () {
    var result = loadRegistry({
      knowledgePath: path.join(
        __dirname,
        '..',
        'examples',
        'KNOWLEDGE.md'
      ),
      workspaceBasePath: '/tmp/ws',
    });
    expect(result.names().length).toBeGreaterThan(0);
  });
});

// ── listKnownWorkspaces tests ──

describe('listKnownWorkspaces', function () {
  var resolver = new WorkspaceResolver(
    '/tmp/ws',
    parseKnowledge(KNOWLEDGE_RAW).registry
  );

  it('returns all workspace names sorted', function () {
    var names = listKnownWorkspaces(resolver);
    expect(Array.isArray(names)).toBe(true);
    expect(names).toEqual(names.sort());
    expect(names).toContain('billing-service');
  });
});

// ── collectAllTags tests ──

describe('collectAllTags', function () {
  var resolver = new WorkspaceResolver(
    '/tmp/ws',
    parseKnowledge(KNOWLEDGE_RAW).registry
  );

  it('collects unique tags across all workspaces', function () {
    var tags = collectAllTags(resolver);
    expect(tags).toContain('billing');
    expect(tags).toContain('stock');
    expect(tags).toContain('frontend portal');
    expect(tags).toContain('ETL');
  });

  it('deduplicates tags (no duplicates in result)', function () {
    var tags = collectAllTags(resolver);
    var unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});

// ── getWorkspaceMetadata tests ──

describe('getWorkspaceMetadata', function () {
  var resolver = new WorkspaceResolver(
    '/tmp/ws',
    parseKnowledge(KNOWLEDGE_RAW).registry
  );

  it('returns metadata for known workspace', function () {
    var meta = getWorkspaceMetadata(resolver, 'billing-service');
    expect(meta).not.toBeNull();
    if (meta) {
      expect(meta.name).toBe('billing-service');
      expect(meta.tags).toContain('billing');
      expect(meta.tags).toContain('payments');
    }
  });

  it('returns null for unknown workspace', function () {
    expect(getWorkspaceMetadata(resolver, 'nonexistent')).toBeNull();
  });
});
