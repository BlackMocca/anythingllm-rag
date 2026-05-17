# AGENTS.md

## CLI Working Directory

Use the `pwd` command to get the current working directory before any file path operation. Always resolve paths relative to the project root.

### Example

```sh
# Get project root
cd /projects/anythingllm-rag

# Verify
pwd

# Create files relative to root
mkdir -p src/parser
```

### Notes

- All relative paths in this project should be resolved from the directory returned by `pwd`
- When the agent runs, it executes commands in `/<project-root>` — use `pwd` to confirm
- Avoid absolute paths in code; prefer `path.join(process.cwd(), 'src')` style

---

## Project Init

After cloning or creating a new project:

```sh
npm init -y
npm install --save-dev typescript @types/node ts-node
npm run build
```

- TypeScript is configured in `tsconfig.json` (strict mode, ES2020, CommonJS)
- Source: `src/` — Output: `dist/` — Run: `npm start` or `npm run dev`

---

## Testing

Test suite uses **Vitest** with Node.js environment:

| Script | Description |
|---|---|
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Run with coverage (HTML report in `coverage/`) |
| `npx ts-node examples/pi-agent-demo.ts` | Interactive PI agent demo |

Test files live in `test/`:
- `test/routing.test.ts` — routeQuery, resolveWorkspace
- `test/registry-loader.test.ts` — parseKnowledge, WorkspaceResolver, loadRegistry, collectAllTags, getWorkspaceMetadata

---

## PI Agent Extension

The **PI agent module** (`src/pi-agent/`) provides the bridge between this RAG system and the PI Coding Agent:

| File | Purpose |
|---|--|
| `bridge.ts` | PI `registerTool` bridge — exports default function for auto-discovery |
| `registry-loader.ts` | KNOWLEDGE.md loading, caching, tag collection |
| `routing.ts` | Metadata-based intelligent workspace routing |
| `index.ts` | Public exports |

**PI dev mode**: `pi -e ./src/pi-agent/bridge.ts`
**Production extension**: place in `~/.pi/agent/extensions/anything-llm.ts`
