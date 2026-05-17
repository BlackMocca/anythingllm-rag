You are a senior backend engineer and TypeScript architect.

Your task is to implement a tool extension layer for a PI Coding Agent.

All implementation MUST be written in TypeScript (Node.js runtime).

The system provides tools prefixed with `knowledge_*` that operate across multiple workspaces defined in a configuration file.

---

## 1. Technology Requirement (MANDATORY)

- Language: TypeScript only
- Runtime: Node.js
- No other languages are allowed
- Use clean modular architecture
- Must be production-ready code

---

## 2. Workspace Configuration Source

Workspaces MUST be defined in a file named:

KNOWLEDGE.md

This file is the single source of truth for all workspace definitions.

---

## 3. KNOWLEDGE.md Format

Each workspace is defined using this block structure:

----------
name: billing-service
description: Handles billing, payments, invoices, and financial logic
tag: finance, payment, high-priority
----------

----------
name: auth-service
description: Handles authentication, login, JWT, session management
tag: security, identity, critical
----------

----------
name: inventory
description: Manages stock, product quantity, warehouse operations
tag: logistics, low-priority
----------

---

## 4. Parsing Requirements

You MUST implement a TypeScript parser that converts KNOWLEDGE.md into:

type WorkspaceRegistry = {
  [workspaceName: string]: {
    description: string;
    tags: string[];
  }
}

Rules:
- name → workspace key
- description → human-readable explanation
- tag → split by comma into string array
- must ignore empty lines and separators
- must be safe and deterministic

---

## 5. Required Tools Implementation

Implement the following tools:

---

### (1) knowledge_search

knowledge_search(workspace: string, query: string)

Behavior:
- Validate workspace exists in parsed registry
- Resolve workspace to internal workspace ID
- Query AnythingLLM (or equivalent RAG backend)
- Return top relevant results
- Return structured error if workspace is invalid

---

### (2) knowledge_read

knowledge_read(workspace: string, filepath: string)

Behavior:
- Read file from sandboxed workspace directory
- Must enforce strict path sanitization
- Prevent path traversal attacks (../, absolute paths forbidden)
- Workspace must be validated from registry

---

### (3) knowledge_write

knowledge_write(workspace: string, filepath: string, content: string)

Behavior:
- Write file only inside workspace root directory
- Must enforce sandbox boundary
- Must not allow writing outside workspace root
- Must be safe for concurrent execution

---

### (4) knowledge_list

knowledge_list(workspace: string, dir: string)

Behavior:
- List files inside workspace directory only
- Must respect workspace isolation
- Must validate workspace existence

---

## 6. Workspace Resolver Rules

- Workspace names MUST come from KNOWLEDGE.md only
- No hardcoded enums allowed
- Case-sensitive matching required
- Invalid workspace must return structured error object

---

## 7. Security Requirements (CRITICAL)

You MUST implement:

- Workspace whitelist strictly from KNOWLEDGE.md
- Path traversal protection (no ../ or absolute paths)
- Workspace isolation (no cross-workspace access)
- Safe base directory per workspace
- Fail-safe error handling (never crash runtime)

---

## 8. System Architecture

The system must follow this flow:

PI Coding Agent
  ↓
knowledge_* tools (TypeScript layer)
  ↓
Workspace Resolver (KNOWLEDGE.md parser in TypeScript)
  ↓
├── AnythingLLM RAG API (knowledge_search)
├── Sandboxed File System (knowledge_read/write/list)

---

## 9. Design Constraints

- Fully modular TypeScript architecture
- No hardcoded workspace values
- Must support adding workspace without code change
- Must support metadata (description + tags) for future AI routing
- Must be scalable for multi-workspace agent systems
- Must be production-safe

---

## 10. Output Requirements

Provide:

1. Full TypeScript implementation
2. KNOWLEDGE.md parser module
3. Workspace registry builder
4. Tool implementations (knowledge_search/read/write/list)
5. Security layer (path + workspace validation)
6. Example usage
7. Suggested folder structure

---

## 11. Goal

This system will allow a PI Coding Agent to:

- Search internal knowledge per workspace
- Read and write project files safely
- Operate across multiple isolated workspaces
- Use metadata (tags + description) for future intelligent routing

---

## END OF SPEC
