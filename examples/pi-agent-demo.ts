#!/usr/bin/env ts-node
/**
 * PI Agent Extension Demo
 *
 * Simulates the PI extension bridge without requiring PI runtime.
 * Tests: routing, workspace list, resolver, metadata extraction.
 *
 * Usage:
 *   npx ts-node examples/pi-agent-demo.ts
 */

import * as fs from "fs";
import * as path from "path";

import { parseKnowledge } from "../src/parser";
import { WorkspaceResolver } from "../src/resolver";
import { isValidWorkspace, createWhitelist } from "../src/security";

// --- Registry Loader ---
import { loadRegistry, getWorkspaceMetadata, listKnownWorkspaces, collectAllTags } from "../src/pi-agent/registry-loader";

// --- Routing ---
import { routeQuery, resolveWorkspace } from "../src/pi-agent/routing";

console.log("=== PI Agent Extension Demo ===\n");

// Load knowledge base
var knowledgeFile = path.join(__dirname, "KNOWLEDGE.md");
var source = fs.readFileSync(knowledgeFile, "utf-8");

// --- 1. Parse & Load ---
console.log("1. Parse KNOWLEDGE.md");
var parseResult = parseKnowledge(source);
if (parseResult.ok) {
  console.log("   Parsed " + Object.keys(parseResult.registry).length + " workspaces");
  console.log("   Registery keys:", Object.keys(parseResult.registry).join(", "));
} else {
  console.error("   Parse failed:", parseResult.error);
  process.exit(1);
}

var workspaceBasePath = path.join(__dirname, "tmp-workspaces");
var resolver = new WorkspaceResolver(workspaceBasePath, parseResult.registry);

// --- 2. List Workspaces ---
console.log("\n2. List workspaces");
var names = listKnownWorkspaces(resolver);
console.log("   Names:", JSON.stringify(names));

// --- 3. Collect Tags ---
console.log("\n3. Extract all tags");
var tags = collectAllTags(resolver);
console.log("   Tags:", JSON.stringify(tags));

// --- 4. Workspace metadata lookup ---
console.log("\n4. Get workspace metadata");
for (var i = 0; i < names.length; i++) {
  var info = getWorkspaceMetadata(resolver, names[i]);
  if (info) {
    console.log("   " + info.name + ": " + info.description + " [tags=" + info.tags.join(",") + "]");
  }
}

// --- 5. Route queries ---
console.log("\n5. Intelligent query routing");
var testQueries = [
  { query: "payment gateway integration", workspace: undefined },
  { query: "JWT token validation", workspace: undefined },
  { query: "inventory stock reports", workspace: undefined },
  { query: "billing invoice generation", workspace: undefined },
  { query: "user dashboard UI", workspace: undefined },
  { query: "analytics metrics", workspace: undefined },
  { query: "how to authenticate", workspace: undefined },
];

for (var i = 0; i < testQueries.length; i++) {
  var q = testQueries[i];
  var route = routeQuery(resolver, q.query);
  if (route.ok) {
    var scoreLabel = "?";
    if (route.matches.length > 0) {
      scoreLabel = String(route.matches[0].score);
    }
    console.log("   '" + q.query + "' → " + route.primary + " (score=" + scoreLabel + ")");
    if (route.matches.length > 0) {
      console.log("    Matches:", route.matches.slice(0, 3).map(function(m) { return m.workspace + "(" + m.score + ")"; }).join(", "));
    } else {
      console.log("    Matches: (no strong match — using default workspace: " + route.primary + ")");
    }
  } else {
    console.log("   '" + q.query + "' → Error: " + route.error);
  }
}

// --- 6. Workspace resolution (auto-route vs explicit) ---
console.log("\n6. Resolve workspace with explicit hint");
var explicit = resolveWorkspace(resolver, "show me billing docs", "billing-service");
console.log("   'billing-service' explicit →", explicit.ok ? explicit.primary : "Error: " + explicit.error);

var implicit = resolveWorkspace(resolver, "billing service invoice", undefined);
console.log("   'billing service invoice' auto →", implicit.ok ? implicit.primary : "Error: " + implicit.error);

var bad = resolveWorkspace(resolver, "something", "nonexistent");
console.log("   'nonexistent' explicit →", bad.ok ? bad.primary : "Error: " + bad.error);

// --- 7. Workspace whitelist validation ---
console.log("\n7. Security: workspace validation");
var wl = createWhitelist(parseResult.registry);
var validNames: Array<[string, boolean]> = [
  ["billing-service", true],
  ["auth-service", true],
  ["nonexistent", false],
  ["Billing-Service", false],  // case-sensitive
];
for (var i = 0; i < validNames.length; i++) {
  var name = validNames[i][0];
  var expected = validNames[i][1];
  var result = isValidWorkspace(name, wl);
  var status = result === expected ? "pass" : "FAIL";
  console.log("   [" + status + "] " + name + " expected=" + expected + " got=" + result);
}

console.log("\nDone.");
