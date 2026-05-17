
/**
 * Integration Demo — T-9 (AnyThingLLM API integration)
 *
 * Usage:
 *   export RAG_URL="http://127.0.0.1:8081"
 *   export RAG_API_KEY="your-api-key"
 *   npx ts-node examples/demo.ts
 */

import * as fs from "fs";
import * as path from "path";

import { parseKnowledge } from "../src/parser";
import { WorkspaceResolver } from "../src/resolver";
import { isValidWorkspace, createWhitelist } from "../src/security";
import {
  knowledgeSearch,
  knowledgeRead,
  knowledgeWrite,
  knowledgeList,
} from "../src/tools";
import {
  searchRAG,
  chatRAG,
  listDocuments,
  listChats,
  checkHealth,
} from "../src/rag";

var knowledgeBaseWorkspace = process.env.KNOWLEDGE_BASE_WORKSPACE || "billing-service";
var ragUrl = process.env.RAG_URL || "http://127.0.0.1:8081";
var ragApiKey = process.env.RAG_API_KEY || "";
var knowledgeBaseDir = process.env.KNOWLEDGE_BASE_DIR || path.join(__dirname, "..", "examples", "KNOWLEDGE.md");
var tmpBasePath = path.join(__dirname, "..", "tmp-workspaces");

function makeRagConfig(): { baseUrl: string; apiKey?: string } | undefined {
  if (!ragUrl) return undefined;
  return { baseUrl: ragUrl, apiKey: ragApiKey || undefined };
}

console.log("");
console.log("AnyThingLLM Integration Demo");

var content = fs.readFileSync(knowledgeBaseDir, { encoding: "utf-8" });
var parseResult = parseKnowledge(content);
var registry = parseResult.registry;
var resolver = new WorkspaceResolver(tmpBasePath, registry);

console.log("Step 2: Workspace resolver");
var names = resolver.names();
console.log("  names: " + JSON.stringify(names));

console.log("Step 3: Validate workspace");
var wl = createWhitelist(registry);
var isValid = isValidWorkspace(knowledgeBaseWorkspace, wl);
console.log("  is valid: " + isValid);

var ragConfig = makeRagConfig();

console.log("Step 4: RAG health check");
if (ragConfig) {
  var health = await checkHealth(ragConfig);
  var status = health.status || 0;
  console.log("  healthy: " + health.ok);
  console.log("  status: " + status);
  console.log("  api key configured: " + health.apiKeyConfigured);
} else {
  console.log("  skipped");
}

console.log("Step 5: List documents");
if (ragConfig) {
  var docs = await listDocuments(ragConfig);
  if (docs.ok) {
    var items = docs.data.items;
    console.log("  total files: " + (items ? items.length : 0));
  } else {
    console.log("  error: " + docs.error);
  }
} else {
  console.log("  skipped");
}

console.log("Step 6: Query chat (chatRAG)");
if (ragConfig) {
  var chat = await chatRAG(ragConfig, knowledgeBaseWorkspace, "what is billing service about", { mode: "query" });
  if (chat.ok) {
    var txt = chat.data.textResponse;
    var trunc = txt.length > 80 ? txt.substring(0, 80) + ".." : txt;
    console.log("  response: " + trunc);
    console.log("  sources: " + chat.data.sources.length);
    console.log("  completed: " + chat.data.close);
  } else {
    console.log("  error: " + chat.error);
  }
} else {
  console.log("  skipped");
}

console.log("Step 7: knowledgeSearch");
if (resolver) {
  var res = await knowledgeSearch(knowledgeBaseWorkspace, "what is billing service", { topK: 3 }, ragConfig, resolver);
  if (res.ok) {
    console.log("  found: " + res.total);
    for (var i = 0; i < res.documents.length; i++) {
      var r = res.documents[i];
      var t = r.text.substring(0, 60);
      console.log("    [" + r.id + "]: score=" + r.score + " text=" + t);
    }
  } else {
    console.log("  error: " + res.error);
  }
}

console.log("");
console.log("Done.");
