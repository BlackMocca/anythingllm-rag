/**
 * Main entry point — exports all public modules.
 *
 * Modules:
 *   - parser: KNOWLEDGE.md tokenizer & registry builder
 *   - resolver: workspace name → ID + metadata resolver
 *   - security: workspace whitelist + path-sandbox enforcement
 *   - tools: knowledge_search / read / write / list
 *   - rag: AnythingLLM / RAG backend adapter
 *   - pi-agent: PI Coding Agent extension (registerTool bridge)
 */

export * from './parser';
export * from './resolver';
export * from './security';
export * from './tools';
export * from './rag';
export * from './pi-agent';