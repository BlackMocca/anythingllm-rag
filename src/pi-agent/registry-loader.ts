/**
 * Registry Loader Module
 *
 * Loads KNOWLEDGE.md from disk, builds WorkspaceRegistry,
 * and exposes it to the PI agent extension.
 *
 * Caches parsing to avoid re-reading on every tool call.
 */

import * as fs from "fs";
import * as path from "path";

import { parseKnowledge, type WorkspaceRegistry } from "../parser";
import { buildRAGConfig } from "../config-loader";
import { WorkspaceResolver, type WorkspaceInfo } from "../resolver";

/**
 * Configuration for registry loading.
 */
export type RegistryLoadConfig = {
  /** Path to KNOWLEDGE.md (or directory containing it) */
  knowledgePath?: string;
  /** Base directory for workspace file storage */
  workspaceBasePath?: string;
};

type ResolvedConfig = {
  knowledgePath: string;
  workspaceBasePath: string;
};

/**
 * Default paths.
 */
function resolveConfig(config: RegistryLoadConfig = {}): ResolvedConfig {
  const cfg = buildRAGConfig();
  var defaultKnowledgePath = cfg.knowledgeBasePath
    ? path.join(cfg.workspaceBasePath || process.cwd(), cfg.knowledgeBasePath)
    : path.join(process.cwd(), "examples", "KNOWLEDGE.md");
  var defaultWorkspaceDir = cfg.workspaceBasePath || process.cwd();
  return {
    knowledgePath: config.knowledgePath || defaultKnowledgePath,
    workspaceBasePath: config.workspaceBasePath || defaultWorkspaceDir,
  };
}

/**
 * Load KNOWLEDGE.md and return parsed registry.
 * Caches in memory for subsequent calls.
 */
function loadFromDisk(source: string): WorkspaceRegistry {
  var result = parseKnowledge(source);
  if (!result.ok) {
    console.warn("[pi-agent/registry] Parse warning:", (result as any).error);
    return {};
  }
  return result.registry;
}

/**
 * Read KNOWLEDGE.md source string from disk.
 */
function readKnowledgeFile(knowledgePath: string): string {
  try {
    return fs.readFileSync(knowledgePath, "utf-8");
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    throw new Error("Failed to read KNOWLEDGE.md at " + knowledgePath + ": " + msg);
  }
}

/**
 * Load and build a WorkspaceResolver from KNOWLEDGE.md.
 *
 * @param config - Configuration override
 * @returns WorkspaceResolver ready for PI agent use
 */
export function loadRegistry(config?: RegistryLoadConfig): WorkspaceResolver {
  var resolved = resolveConfig(config);
  var source = readKnowledgeFile(resolved.knowledgePath);
  var registry = loadFromDisk(source);
  return new WorkspaceResolver(resolved.workspaceBasePath, registry);
}

/**
 * Get workspace metadata for display (description + tags).
 * Returns null if workspace not found.
 */
export function getWorkspaceMetadata(
  resolver: WorkspaceResolver,
  name: string
): { name: string; description: string; tags: string[] } | null {
  var info = resolver.getInfo(name);
  if (!info) return null;
  return { name: info.name, description: info.description, tags: info.tags };
}

/**
 * List all known workspace names for auto-discovery.
 */
export function listKnownWorkspaces(resolver: WorkspaceResolver): string[] {
  return resolver.names();
}

/**
 * Collect all unique tags across workspaces for routing hints.
 */
export function collectAllTags(resolver: WorkspaceResolver): string[] {
  var tagSet: { [k: string]: boolean } = {};
  var names = resolver.names();
  for (var i = 0; i < names.length; i++) {
    var info = resolver.getInfo(names[i]);
    if (info && info.tags) {
      for (var j = 0; j < info.tags.length; j++) {
        tagSet[info.tags[j]] = true;
      }
    }
  }
  return Object.keys(tagSet);
}
