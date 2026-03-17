import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { renderPage, takeScreenshot, closeBrowser } from "../src/lib/renderer.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

let server: Server;
let baseUrl: string;

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
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

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve(baseUrl);
      }
    });
  });
}

const serverReady = startServer();

afterAll(async () => {
  await closeBrowser();
  server?.close();
});

describe("renderPage", () => {
  it("renders a static HTML page", async () => {
    await serverReady;
    const result = await renderPage({ url: `${baseUrl}/article.html` });

    expect(result.html).toContain("Understanding JavaScript SPA Rendering");
    expect(result.title).toContain("Test Article");
    expect(result.url).toContain(baseUrl);
  });

  it("renders SPA content loaded by JavaScript", async () => {
    await serverReady;
    const result = await renderPage({
      url: `${baseUrl}/spa-delayed.html`,
      waitForSelector: "[data-loaded='true']",
      waitTimeout: 15000,
    });

    expect(result.html).toContain("Dynamically Loaded Content");
    expect(result.html).toContain("headless browser successfully waited");
  });

  it("renders empty page without error", async () => {
    await serverReady;
    const result = await renderPage({ url: `${baseUrl}/empty.html` });

    expect(result.html).toBeTruthy();
    expect(result.title).toBe("Empty Page");
  });

  it("throws on invalid URL", async () => {
    await expect(renderPage({ url: "not-a-url" })).rejects.toThrow("Invalid URL");
  });

  it("throws on disallowed URL scheme", async () => {
    await expect(renderPage({ url: "file:///etc/passwd" })).rejects.toThrow("Disallowed URL scheme");
    await expect(renderPage({ url: "ftp://example.com/file" })).rejects.toThrow("Disallowed URL scheme");
  });

  it("rejects Playwright-specific selector syntax", async () => {
    await serverReady;
    await expect(
      renderPage({ url: `${baseUrl}/article.html`, waitForSelector: "div >> span" }),
    ).rejects.toThrow("Invalid selector");
  });

  it("handles 404 without throwing", async () => {
    await serverReady;
    await expect(
      renderPage({ url: `${baseUrl}/nonexistent.html`, waitTimeout: 1000 }),
    ).resolves.toBeTruthy();
  });
});

describe("takeScreenshot", () => {
  it("returns a valid PNG buffer", async () => {
    await serverReady;
    const buffer = await takeScreenshot({ url: `${baseUrl}/article.html` });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  it("supports custom viewport", async () => {
    await serverReady;
    const buffer = await takeScreenshot({
      url: `${baseUrl}/article.html`,
      viewport: { width: 640, height: 480 },
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("supports fullPage screenshot", async () => {
    await serverReady;
    const bufferNormal = await takeScreenshot({ url: `${baseUrl}/article.html` });
    const bufferFull = await takeScreenshot({
      url: `${baseUrl}/article.html`,
      fullPage: true,
    });

    expect(bufferFull.length).toBeGreaterThanOrEqual(bufferNormal.length * 0.5);
  });
});
