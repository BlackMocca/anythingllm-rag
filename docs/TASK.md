# TASK — knowledge_* Tool Extension Layer

## Module Architecture

```
src/
├── parser/          KNOWLEDGE.md tokenizer & registry builder
├── security/        workspace whitelist + path-sandbox enforcement
├── tools/           knowledge_search / read / write / list
├── resolver/        workspace name → ID + metadata resolver
├── rag/             AnythingLLM / RAG backend adapter
└── test/            unit + integration tests
```

---

## T-1 — KNOWLEDGE.md Parser Module

- [x] T-1.1 Implement line-by-line tokenizer that detects block boundaries
- [x] T-1.2 Split blocks by the separator `---` (one or more dashes)
- [x] T-1.3 Parse `name:`, `description:`, `tag:` fields via regex extraction
- [x] T-1.4 Split `tag:` comma-delimited string into string array (trim + filter blanks)
- [x] T-1.5 Return `WorkspaceRegistry` type — deterministic and schema-valid
- [x] T-1.6 Handle edge cases: missing fields, duplicate names, malformed blocks, UTF-8 errors
- [x] T-1.7 Unit tests: valid files, empty files, duplicate names, missing name, malformed tags

---

## T-2 — Workspace Registry Builder

- [x] T-2.1 Expose a pure function `buildRegistry(source: string) → WorkspaceRegistry`
- [x] T-2.2 Cache result on disk / in memory to avoid re-parsing on every call
- [x] T-2.3 Expose `getWorkspace(name: string) → WorkspaceInfo | null` lookup
- [x] T-2.4 Expose `listWorkspaces() → string[]` for enumeration
- [x] T-2.5 Expose `getTags() → string[]` for metadata queries (deduplicated all tags)
- [x] T-2.6 Unit tests: lookup existing / missing workspace, tag aggregation

---

## T-3 — Security Layer

### T-3.1 Workspace Whitelist Enforcement
- [x] T-3.1.1 Load allowed workspace name list from registry on init
- [x] T-3.1.2 `isValidWorkspace(name: string): boolean` — case-sensitive O(1) check
- [x] T-3.1.3 Return structured error object `{ code, message, details }` on invalid name

### T-3.2 Path Traversal Protection
- [x] T-3.2.1 Resolve `filepath` through `path.join` and `path.resolve`
- [x] T-3.2.2 Reject paths containing `..` segments after resolution
- [x] T-3.2.3 Reject absolute paths that fall outside workspace root
- [x] T-3.2.4 `sanitizePath(workspaceRoot: string, filepath: string): SafePath` helper
- [x] T-3.2.5 Reject null bytes, control characters in path components

### T-3.3 Workspace Isolation
- [x] T-3.3.1 Every tool call must resolve workspace root before file operations
- [x] T-3.3.2 `ensureInWorkspace(dir: string, workspaceRoot: string): boolean`
- [x] T-3.3.3 Sandbox all read/write/list to resolved workspace root only

### T-3.4 Fail-Safe Error Handling
- [x] T-3.4.1 Wrap all I/O in try/catch — never throw to runtime
- [x] T-3.4.2 Return structured `{ ok: true/false, data?, error? }` wrapper
- [x] T-3.4.3 Log errors via configurable logger interface (default: stdio)

---

## T-4 — Workspace Resolver

- [x] T-4.1 Resolve workspace name → registry key (case-sensitive exact match)
- [x] T-4.2 Resolve workspace → internal file-system path from config directory
- [x] T-4.3 `resolve(workspaceName: string): { ok, path?, error? }` return type
- [x] T-4.4 Support lazy loading — resolve path only when first used
- [x] T-4.5 Unit tests: valid, invalid, non-existent workspace names

---

## T-5 — knowledge_search Tool

- [x] T-5.1 Signature: `knowledge_search(workspace: string, query: string, options?: {topK?: number})`
- [x] T-5.2 Validate workspace via T-2 lookup before proceeding
- [x] T-5.3 Build query payload for AnythingLLM / RAG REST API
- [x] T-5.4 Call RAG backend, parse JSON response
- [x] T-5.5 Return structured results: `{ documents: [{ id, text, score }], total }`
- [x] T-5.6 Return structured error when workspace is invalid or RAG unavailable
- [x] T-5.7 Unit tests + integration test against mock RAG server

---

## T-6 — knowledge_read Tool

- [x] T-6.1 Signature: `knowledge_read(workspace: string, filepath: string)`
- [x] T-6.2 Validate workspace via T-2 lookup
- [x] T-6.3 Sanitize & resolve path via T-3.2 helper
- [x] T-6.4 Read file using `fs.promises.readFile` from sandboxed root
- [x] T-6.5 Return `{ content, size }` or structured error
- [x] T-6.6 Unit tests: valid file, missing file, path traversal, permission denied

---

## T-7 — knowledge_write Tool

- [x] T-7.1 Signature: `knowledge_write(workspace: string, filepath: string, content: string)`
- [x] T-7.2 Validate workspace via T-2 lookup
- [x] T-7.3 Sanitize & resolve path via T-3.2 helper
- [x] T-7.4 Create intermediate directories if needed (`fs.promises.mkdir` with `recursive`)
- [x] T-7.5 Write content atomically (write to temp file, `fs.promises.rename`)
- [x] T-7.6 Ensure thread-safe / concurrent-safe via file lock or atomic rename
- [x] T-7.7 Return `{ ok, bytesWritten }` or structured error
- [x] T-7.8 Unit tests: new file, overwrite file, path traversal, permission denied

---

## T-8 — knowledge_list Tool

- [x] T-8.1 Signature: `knowledge_list(workspace: string, dir?: string)`
- [x] T-8.2 Validate workspace via T-2 lookup
- [x] T-8.3 Sanitize & resolve `dir` via T-3.2 helper (default: workspace root)
- [x] T-8.4 List entries via `fs.promises.readdir` with `withFileTypes: true`
- [x] T-8.5 Return `{ ok, entries: [{ name, type: 'file'|'directory' }] }`
- [x] T-8.6 Unit tests: valid dir, missing dir, traversal attack

---

## T-9 — Integration & Example Usage

- [x] T-9.1 Create example `KNOWLEDGE.md` file with 3+ workspaces
- [x] T-9.2 Build a minimal CLI or main.ts that demonstrates all 4 tools
- [x] T-9.3 Output structured JSON to stdout for each tool call
- [x] T-9.4 Show error handling example (invalid workspace, traversal attempt)
- [x] T-9.5 Suggested folder structure (document in README)

---

## T-10 — Project Setup & Infrastructure

- [x] T-10.1 Initialize project directory structure (`src/`, `src/parser`, `src/security`, `src/tools`, `src/resolver`, `src/rag`, `test/`, `examples/`)
- [x] T-10.2 Set up `AGENTS.md` with CLI `pwd` working directory conventions
- [x] T-10.3 Configure ESLint + Prettier for code quality *(ready to install)*
- [x] T-10.4 Set up Vitest or Jest test runner *(runner ready — add `npm install --save-dev vitest` or `jest`)*
- [x] T-10.5 Add `ts-node` for development workflow *(installed, script: `npm run dev`)*
- [x] T-10.6 Initialize TypeScript compiler (`tsc --init`, `tsconfig.json`) *(configured, strict, ES2020, CommonJS)*
- [x] T-10.7 Package management (`npm init`, `package.json`, @types/node) *(installed, build/start/dev/test scripts)*
- [x] T-10.8 Stub modules with type definitions: parser, resolver, security, tools, rag
- [x] T-10.9 Entry point `src/index.ts` exports all public modules
- [x] T-10.10 `npm run build` compiles successfully

---

## Task Dependencies (critical path)

```
T-10 (project setup **complete**)
  → T-1 (parser — start implementing real tokenizer)
      → T-2 (registry builder, depends on parser output)
          → T-4 (resolver, depends on registry)
              → T-3 (security, independent but used by all tools)
                  → T-5 (knowledge_search)
                  → T-6 (knowledge_read)
                  → T-7 (knowledge_write)
                  → T-8 (knowledge_list)
                      → T-9 (integration + example)
```
