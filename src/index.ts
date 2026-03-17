#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSpaReadTool } from "./tools/spa-read.js";
import { registerSpaScreenshotTool } from "./tools/spa-screenshot.js";
import { closeBrowser } from "./lib/renderer.js";

const server = new McpServer({
  name: "spa-reader",
  version: "1.0.0",
});

registerSpaReadTool(server);
registerSpaScreenshotTool(server);

const cleanup = async (): Promise<void> => {
  console.error("[spa-reader] Shutting down...");
  await closeBrowser();
  await server.close();
};

process.on("SIGINT", () => {
  cleanup().catch(console.error).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  cleanup().catch(console.error).finally(() => process.exit(0));
});
process.on("uncaughtException", (err) => {
  console.error("[spa-reader] Uncaught exception:", err);
  cleanup().catch(console.error).finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("[spa-reader] Unhandled rejection:", reason);
  cleanup().catch(console.error).finally(() => process.exit(1));
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[spa-reader] Server started, listening on stdio");
