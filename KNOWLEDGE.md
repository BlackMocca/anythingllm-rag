# Workspaces

## Workspace Format

### Workspace Syntax

Each workspace line follows:

`- <slug> — <text>`

where `<text>` is either a **description** or **comma-separated keywords** for routing:

- **slug**: lowercase identifier (no spaces, use hyphens)
- **description**: a short natural-language summary of the workspace
- **keywords**: comma-separated tags used by the routing engine

---

## Workspace List

- mangareader — please add description about this workspacee or tag for AI Agent
- global — please add description about this workspacee or tag for AI Agent
- test — please add description about this workspacee or tag for AI Agent

---

## When to Use Tool Calls

| Tool / Command | Use Case |
|---|---|
| `knowledge_list_workspaces` | Discover what workspaces exist; lists all with descriptions and tags. Supports optional `filter` to search by keyword. Use **first** when unsure. |
| `knowledge_search` | Knowledge questions — "what is...?", "how does...?", or "find information about X". Auto-routes to the best workspace by tags. Set `workspace` explicitly to override. |
| `knowledge_read` | Read a specific file inside a workspace. Requires `workspace` and `filepath` (relative, no `../` traversal). |
| `knowledge_write` | Create or update a file inside a workspace. Requires `workspace`, `filepath`, and `content`. Uses atomic renames. |
| `knowledge_list` | See directory contents inside a workspace. Requires `workspace`, optional `dirPath` (default `.`). |
| `/anythingllm-rag-init [--write]` | Discover workspaces from RAG backend and display them. Add `--write` to generate KNOWLEDGE.md. |
| `/anythingllm-rag-doctor` | Verify RAG config, API auth, and health status. |
