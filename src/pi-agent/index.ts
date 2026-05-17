/**
 * PI Agent Extension Layer
 *
 * Exports:
 *   - bridge:        Main PI extension entry point (default export)
 *   - registry-loader: Knowlege.md loading & caching
 *   - routing:       Metadata-based intelligent workspace routing
 *
 * Usage:
 *   // As PI extension (auto-discovered):
 *   // ~/.pi/agent/extensions/anything-llm.ts → import bridge from './bridge'
 *
 *   // As inline extension (pi -e):
 *   pi -e ./src/pi-agent/bridge.ts
 */

export * from "./registry-loader";
export * from "./routing";
