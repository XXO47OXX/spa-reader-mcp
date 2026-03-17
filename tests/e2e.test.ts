import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerSpaReadTool } from "../src/tools/spa-read.js";
import { registerSpaScreenshotTool } from "../src/tools/spa-screenshot.js";
import { closeBrowser } from "../src/lib/renderer.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

let httpServer: Server;
let baseUrl: string;
let mcpServer: McpServer;
let client: Client;

async function setup(): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer = createServer((req, res) => {
      const file = req.url === "/" ? "article.html" : req.url!.slice(1);
      const filePath = join(FIXTURES, file);

      // Prevent path traversal
      if (!filePath.startsWith(FIXTURES + sep) && filePath !== FIXTURES) {
        res.writeHead(400);
        res.end("Bad Request");
        return;
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });

  mcpServer = new McpServer({ name: "spa-reader-test", version: "1.0.0" });
  registerSpaReadTool(mcpServer);
  registerSpaScreenshotTool(mcpServer);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });

  await Promise.all([
    client.connect(clientTransport),
    mcpServer.connect(serverTransport),
  ]);
}

const setupDone = setup();

afterAll(async () => {
  await closeBrowser();
  await client?.close();
  await mcpServer?.close();
  httpServer?.close();
});

describe("MCP E2E: tool listing", () => {
  it("lists spa_read and spa_screenshot tools", async () => {
    await setupDone;
    const result = await client.listTools();

    const names = result.tools.map((t) => t.name);
    expect(names).toContain("spa_read");
    expect(names).toContain("spa_screenshot");
  });
});

describe("MCP E2E: spa_read", () => {
  it("returns Markdown for a rendered page", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_read",
      arguments: { url: `${baseUrl}/article.html` },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toContain("Understanding JavaScript SPA Rendering");
    expect(text).toContain("Playwright");
  });

  it("returns Markdown for SPA with delayed content", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_read",
      arguments: {
        url: `${baseUrl}/spa-delayed.html`,
        waitForSelector: "[data-loaded='true']",
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toContain("Dynamically Loaded Content");
  });

  it("returns error for empty page", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_read",
      arguments: { url: `${baseUrl}/empty.html` },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toContain("no content found");
  });

  it("returns error for invalid URL", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_read",
      arguments: { url: "not-a-valid-url" },
    });

    expect(result.isError).toBe(true);
  });
});

describe("MCP E2E: spa_screenshot", () => {
  it("returns base64 PNG image", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_screenshot",
      arguments: { url: `${baseUrl}/article.html` },
    });

    expect(result.isError).toBeFalsy();
    const content = (result.content as Array<{ type: string; data?: string; mimeType?: string }>)[0];
    expect(content?.type).toBe("image");
    expect(content?.mimeType).toBe("image/png");
    expect(content?.data).toBeTruthy();

    const buffer = Buffer.from(content!.data!, "base64");
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
  });

  it("returns error for invalid URL", async () => {
    await setupDone;
    const result = await client.callTool({
      name: "spa_screenshot",
      arguments: { url: "invalid-url" },
    });

    expect(result.isError).toBe(true);
  });
});
