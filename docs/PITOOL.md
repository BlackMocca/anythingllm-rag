# PI Tool Extension — Reference Guide

Based on [pi.dev/docs/latest/sdk](https://pi.dev/docs/latest/sdk) and
[pi.dev/docs/latest/extensions](https://pi.dev/docs/latest/extensions).

---

## Quick Reference

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function myExtension(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // Intercept / block tool calls
  });

  pi.registerTool({
    name: "my_custom_tool",
    label: "My Custom Tool",
    description: "Use this tool to do X, Y, or Z.",
    parameters: Type.Object({
      argumentName: Type.String({ description: "Description of the argument" }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const result = `Processed: ${params.argumentName}`;
      return {
        content: [{ type: "text", text: result }],
        details: { tool: "my_custom_tool", success: true },
      };
    },
  });

  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (_, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });
}
```

---

## Two Ways to Add Custom Tools

### 1. Extension (LLM-caller tool)

Place the file in `~/.pi/agent/extensions/` or `.pi/extensions/` and
register via `pi.registerTool()`. The LLM can call the tool during turns.

```ts
// ~/.pi/agent/extensions/my-extension.ts
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage a todo list.",
    promptSnippet: "Manage project todos",
    promptGuidelines: [
      "Use todo for task planning, not direct file edits.",
    ],
    parameters: Type.Object({
      action: StringEnum(["list", "add", "toggle", "clear"] as const),
      text: Type.Optional(Type.String()),
      id: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      // ... implementation
      return {
        content: [{ type: "text", text: "Done" }],
        details: { action: params.action, todos: [] },
      };
    },

    // Optional custom rendering
    renderCall(args, theme, _ctx) { ... },
    renderResult(result, { expanded }, theme, _ctx) { ... },
  });
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | ✅ Unique identifier | Must be dasherized |
| `label` | `string` | ✅ Display name | Shown in TUI |
| `description` | `string` | ✅ What the tool does | Sent to LLM |
| `promptSnippet` | `string` | Optional | One-line entry in system prompt |
| `promptGuidelines` | `string[]` | Optional | LLM instruction bullets |
| `parameters` | `Type.Object` | ✅ Schema | Use `StringEnum` for enums |
| `execute` | `async` | ✅ Tool logic | See signature below |
| `prepareArguments` | `fn` | Optional | Pre-validation compat shim |
| `renderCall` | `fn` | Optional | Custom header rendering |
| `renderResult` | `fn` | Optional | Custom result rendering |

**Execute signature:**

```ts
async execute(
  toolCallId: string,
  params: MyToolParams,
  signal: AbortSignal | undefined,
  onUpdate: ((patch: Partial<ToolResult>) => void) | undefined,
  ctx: ExtensionContext
): Promise<ToolResult>
```

---

### 2. SDK (`defineTool`)

Pass directly to `createAgentSession({ customTools })`. Useful for
standalone programs, not extensions.

```ts
import { defineTool, Type } from "@earendil-works/pi-coding-agent";

const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

const { session } = await createAgentSession({
  customTools: [myTool],
  tools: ["read", "bash", "my_tool"], // add to selected tools
});
```

---

## File Locations

| Location | Scope |
|---|---|
| `~/.pi/agent/extensions/*.ts` | Global (all projects) |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) |
| `.pi/extensions/*.ts` | Project-local |
| `.pi/extensions/*/index.ts` | Project-local |

Extensions are auto-discovered. Hot-reload with `/reload`.
Test one-off: `pi -e ./my-extension.ts`.

---

## Key Patterns

### State Management (branching-safe)

Store state in tool result `details` — it survives branching naturally.

```ts
let todos: string[] = [];

pi.on("session_start", async (_event, ctx) => {
  todos = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "todo") {
      todos = (entry.message.details as any)?.todos ?? [];
    }
  }
});

pi.registerTool({
  name: "todo",
  parameters: Type.Object({ action: Type.String() }),
  async execute(_id, params) {
    // mutate todos
    todos.push(...);
    return {
      content: [{ type: "text", text: "Added" }],
      details: { todos: [...todos] }, // ← persist
    };
  },
});
```

### Cancellation-Aware Async Work

Use `ctx.signal` for abort-aware operations:

```ts
async execute(_id, params, signal, _onUpdate, ctx) {
  const res = await fetch("https://api.example.com", {
    signal, // aborts with Esc
  });
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

### Output Truncation

Tools MUST truncate to avoid context overflow. Default limit: 50KB / 2000 lines.

```ts
import { truncateHead, formatSize, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES }
  from "@earendil-works/pi-coding-agent";

async execute(_id, params, _signal, _onUpdate, ctx) {
  const output = await runCommand();
  const truncated = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let text = truncated.content;
  if (truncated.truncated) {
    text += `\n\n[Output truncated: ${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}.]`;
  }

  return { content: [{ type: "text", text }], details: {} };
}
```

### File Mutation Queue (parallel-safe writes)

For tools that mutate files, use `withFileMutationQueue()` to prevent
concurrent writes from clobbering each other.

```ts
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_id, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.old, params.new);
    await writeFile(absolutePath, next, "utf8");
    return { content: [{ type: "text", text: "Updated" }], details: {} };
  });
}
```

### Tool Override

Register a tool with the same name as a built-in to replace it.
pi shows a warning. Omit `renderCall`/`renderResult` to inherit the
built-in renderer.

---

### Error Signaling

Throw to signal an error (`isError: true`):

```ts
async execute(_id, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

### Early Termination

Return `terminate: true` to skip the next LLM call when all tool
results in the batch are terminating.

---

## Event Interception

```ts
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    // event.input is mutable — patch before execution
    event.input.command = `source ~/.profile\n${event.input.command}`;

    // Block execution
    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous" };
    }
  }
});

pi.on("tool_result", async (event, ctx) => {
  // Can modify the result before it reaches the LLM
  if (event.toolName === "grep") {
    return { content: [{ type: "text", text: "[summarized]" }] };
  }
});
```

---

## User Interaction

```ts
if (ctx.hasUI) {
  const choice = await ctx.ui.select("Pick:", ["A", "B"]);
  const ok = await ctx.ui.confirm("Sure?", "", { timeout: 5000 });
  const text = await ctx.ui.input("Name:", "placeholder");
  ctx.ui.notify("Done!", "success");
  ctx.ui.setStatus("my-ext", "Processing...");
}
```

---

## Runtime API

```ts
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_KEY",
  api: "anthropic-messages",
  models: [{ id: "model-1", name: "Model 1", ... }],
});

pi.setActiveTools(["read", "bash", "my_tool"]);
const tools = pi.getAllTools();
```

---

## Quick-Start Checklist

1. Write extension → `~/.pi/agent/extensions/<name>.ts`
2. `export default function (pi: ExtensionAPI) { ... }`
3. `pi.registerTool({ name, label, description, parameters, execute })`
4. Test: `pi -e ./my-extension.ts`
5. Auto-discovered on subsequent runs — reload with `/reload`

