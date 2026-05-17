# AnythingLLM RAG — knowledge\_* Tool Extension Layer

A modular TypeScript extension layer that enables a PI Coding Agent to:
- Search internal knowledge per workspace
- Read and write project files safely
- Operate across multiple isolated workspaces
- Use metadata (tags + description) for intelligent routing

---

## Project Structure

```
anythingllm-rag/
├── src/
│   ├── parser/      KNOWLEDGE.md tokenizer & registry builder
│   ├── security/    workspace whitelist + path-traversal protection
│   ├── tools/       knowledge_search / read / write / list
│   ├── resolver/    workspace name → ID + metadata resolver
│   ├── rag/         AnythingLLM / RAG backend adapter
│   ├── pi-agent/    PI Coding Agent extension (registerTool bridge)
│   └── index.ts     Public API entry point
├── examples/
│   ├── KNOWLEDGE.md Example workspace definitions
│   └── demo.ts      Integration demonstration
├── docs/
│   ├── REQUIREMENT.md   Full specification
│   ├── TASK.md          Task checklist
│   └── PITOOL.md        PI Coding Agent SDK reference
├── dist/              Compiled output
├── node_modules/
├── tsconfig.json
└── package.json
```

---

## Quick Start

### Build

```sh
npm run build       # compile TypeScript
npm start           # run entry point via ts-node
npm run dev         # watch mode
```

### Demo

```sh
npx ts-node examples/demo.ts
```

See T-9.4 output showing safe read/write/list operations, traversal attack rejection, and invalid workspace handling.

---

## Usage

### 1. Parse KNOWLEDGE.md

```ts
import { parseKnowledge, buildRegistry } from '@parser';

var source = fs.readFileSync('KNOWLEDGE.md', 'utf-8');
var result = parseKnowledge(source);
if (result.ok) {
    var registry = result.registry;
    // registry is a deterministic: [name: string]: { description, tags }
}
```

### 2. Create Resolver

```ts
import { WorkspaceResolver } from '@resolver';

var basePath = path.join(process.cwd(), 'workspaces');
var resolver = new WorkspaceResolver(basePath, buildRegistry(source));
```

### 3. Use Tools

```ts
import {
  knowledgeSearch,
  knowledgeRead,
  knowledgeWrite,
  knowledgeList,
} from '@tools';

// Validate workspace
resolver.exists('billing-service'); // true

// Read file safely
var read = await knowledgeRead('billing-service', 'README.md', resolver);

// Write safely
var write = await knowledgeWrite('billing-service', 'docs/api.md', content, resolver);

// List directory
var list = await knowledgeList('billing-service', '.', resolver);

// Search via RAG backend
var search = await knowledgeSearch('billing-service', 'payment', { topK: 5 }, ragConfig, resolver);
```

---

## KNOWLEDGE.md Format

Each workspace is a YAML-like block separated by `---`:

```markdown
---
name: billing-service
description: Handles billing, payments, invoices, and financial logic
tag: finance, payment, invoice
---

---
name: auth-service
description: Handles authentication, login, JWT, session management
tag: security, identity, login
---
```

---

## Security

The security module enforces:

- **Workspace whitelist**: Only workspaces from KNOWLEDGE.md are allowed (O(1) Set lookup)
- **Path traversal protection**: Rejects `..` segments, absolute paths, and control characters
- **Workspace isolation**: Every file operation is scoped to the resolved workspace root
- **Fail-safe error handling**: All I/O wrapped in try/catch, never throws to runtime

---

## RAG Integration

The RAG adapter (`src/rag/index.ts`) connects to:
- **AnythingLLM** at `http://<host>:3011` (default port)

Configure with:

```ts
var ragConfig = {
    baseUrl: 'http://localhost:3011',
    apiKey: 'your-api-key', // optional
};
```

---

## PI Coding Agent Extension

The `pi-agent` module wraps all `knowledge_*` tools as PI Coding Agent extensions.

### Auto-discovered Extension

Place `./src/pi-agent/bridge.ts` in PI's extensions directory:

```
~/.pi/agent/extensions/anything-llm.ts → import bridge from './bridge'
```

Or test directly with:

```sh
pi -e ./src/pi-agent/bridge.ts
```

### Registered Tools

| Tool | Description |
|---|---|
| `knowledge_search` | RAG query against AnythingLLM (auto-routes workspace by tags) |
| `knowledge_read` | Safe file read from workspace directory |
| `knowledge_write` | Safe file write with atomic rename |
| `knowledge_list` | List workspace directory entries |
| `knowledge_list_workspaces` | Discover available workspaces with descriptions & tags |

### Environment Variables

```sh
export RAG_URL="http://127.0.0.1:8081"
export RAG_API_KEY="your-api-key"
export RAG_TIMEOUT="30000"
export KNOWLEDGE_BASE_PATH="./KNOWLEDGE.md"
```

---

## Testing

Vitest test suite covering routing, registry loading, resolver, and parser:

```sh
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report (html report in dist/coverage)
```

### Metadata-Based Routing

`knowledge_search` automatically routes queries to the matching workspace based on:
- **Tag matching**: Tags like `finance→billing-service`, `security→auth-service`
- **Description matching**: Keyword overlap in workspace descriptions

Use `knowledge_list_workspaces` to discover all available workspaces and their tags.

---

## License

ISC
