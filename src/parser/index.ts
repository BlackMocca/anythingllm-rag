/**
 * KNOWLEDGE.md Parser Module
 *
 * Parses KNOWLEDGE.md blocks into WorkspaceRegistry.
 *
 * Supports two formats:
 *   1. Legacy YAML-block format (delimited by `---`)
 *   2. New simple markdown format (`# Workspaces` then `- name — desc/tags`)
 *
 * Block rules:
 *   - Each workspace block is delimited by `---` (separator line)
 *   - Fields: `name:`, `description:`, `tag:`
 *   - `tag:` values are comma-delimited → trimmed → deduplicated → filtered
 *   - New format: `- slug — tags` (description is inferred from slug)
 *
 * Error handling:
 *   - Missing `name` → skip block, log warning
 *   - Duplicate `name` → skip duplicate, log warning
 *   - Malformed tags → still parse (each value trimmed)
 *   - UTF-8 errors → replace-invalid-char, continue
 */

// ── Type Definitions ────────────────────────────────────────────────────────

export type TagEntry = string;

export type WorkspaceDefinition = {
  name: string;
  description: string;
  tags: TagEntry[];
};

export type WorkspaceRegistry = {
  [name: string]: WorkspaceDefinition;
};

export type ParseResult =
  | { ok: true; registry: WorkspaceRegistry; warnings: string[] }
  | { ok: false; error: string };

// ── Constants ────────────────────────────────────────────────────────────────

const SEPARATOR_RE = /^---+$/;
const FIELD_NAME_RE = /^name:\s*(.+)$/im;
const FIELD_DESC_RE = /^description:\s*(.+)$/im;
const FIELD_TAGS_RE = /^tag:\s*(.+)$/im;

// New format: `- name — description/tags`
const NEW_FORMAT_TITLE_RE = /^#\s*workspaces\s*$/im;
const NEW_FORMAT_LINE_RE = /^[-*]\s+(\S+?)\s*[—\-–]\s+(.+)$/;

// ── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Split source into blocks, separated by `---` lines.
 */
function splitBlocks(source: string): string[] {
  const lines = source.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (SEPARATOR_RE.test(line.trim())) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

/**
 * Strip all content outside the first pair of triple-backticks
 * code fences to prevent accidental parsing of doc comments.
 */
function stripCodeFences(text: string): string {
  const backticksCount = (text.match(/```/g) || []).length;
  if (backticksCount % 2 !== 0) return text; // odd = unclosed, skip
  const parts = text.split('```');
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      cleaned.push(parts[i]); // before opening fence
    } else {
      cleaned.push(parts[i]); // trailing text after last closing fence
    }
  }
  return cleaned.join('');
}

/**
 * Parse a single YAML-block into WorkspaceDefinition.
 */
function parseBlock(block: string): WorkspaceDefinition | null {
  const nameMatch = FIELD_NAME_RE.exec(block);
  const descMatch = FIELD_DESC_RE.exec(block);
  const tagsMatch = FIELD_TAGS_RE.exec(block);

  if (!nameMatch || !nameMatch[1].trim()) {
    return null;
  }

  const name = nameMatch[1].trim();
  const description = descMatch ? descMatch[1].trim() : '';
  const tagRaw = tagsMatch ? tagsMatch[1] : '';
  const tags = tagRaw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);

  return { name, description, tags };
}

/**
 * Parse a single line from new markdown format.
 */
function parseNewFormatLine(line: string): WorkspaceDefinition | null {
  const m = line.match(NEW_FORMAT_LINE_RE);
  if (!m) return null;
  const name = m[1].trim();
  const desc = m[2].trim();
  const tags = desc.split(',').map(t => t.trim()).filter(Boolean);
  return { name, description: '', tags };
}

/**
 * Detect if source uses the new simple markdown format.
 */
function isNewFormat(source: string): boolean {
  const lines = source.split('\n').map(l => l.trim());
  let titleFound = false;
  for (const line of lines) {
    if (!titleFound && NEW_FORMAT_TITLE_RE.test(line)) {
      titleFound = true;
    } else if (titleFound && line.match(/^[-*]\s+/)) {
      return true;
    }
  }
  return false;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse KNOWLEDGE.md source string into WorkspaceRegistry.
 */
export function parseKnowledge(source: string): ParseResult {
  if (!source || typeof source !== 'string') {
    return { ok: false, error: 'Empty or invalid source string' };
  }

  let sanitized: string;
  try {
    sanitized = source.replace(/[\uD800-\uDFFF]/g, (char) => `\uFFFD`);
  } catch {
    return { ok: false, error: 'Failed to parse source: UTF-8 error' };
  }

  const stripped = stripCodeFences(sanitized);
  const registry: WorkspaceRegistry = {};
  const warnings: string[] = [];

  if (isNewFormat(stripped)) {
    // Parse new format: `# Workspaces\n\n- name — desc/tags`
    const lines = stripped.split('\n');
    for (const line of lines) {
      const def = parseNewFormatLine(line);
      if (def) {
        if (registry[def.name]) {
          warnings.push(`Duplicate workspace name "${def.name}" — skipping`);
        } else {
          registry[def.name] = def;
        }
      }
    }
  } else {
    // Legacy format: blocks delimited by `---`
    const blocks = splitBlocks(stripped);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block.trim()) continue;
      const def = parseBlock(block);
      if (!def) {
        warnings.push(`Block ${i + 1}: skipped (missing or empty name)`);
        continue;
      }
      if (registry[def.name]) {
        warnings.push(`Duplicate workspace name "${def.name}" — skipping block ${i + 1}`);
        continue;
      }
      registry[def.name] = def;
    }
  }

  if (Object.keys(registry).length === 0 && stripped.trim().length > 0) {
    warnings.push('No workspace blocks found in source');
  }

  return { ok: true, registry, warnings };
}

/**
 * Build a clean registry object (non-mutable view).
 */
export function buildRegistry(source: string): WorkspaceRegistry {
  const result = parseKnowledge(source);
  if (result.ok) {
    return result.registry;
  } else {
    console.warn(`[parser] ${(result as { error: string }).error}`);
    return {};
  }
}
