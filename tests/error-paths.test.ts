import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer, type Server } from "node:http";
import { renderPage, closeBrowser } from "../src/lib/renderer.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      if (req.url === "/500") {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Internal Server Error</h1></body></html>");
        return;
      }

      if (req.url === "/slow") {
        // Respond after 10 seconds — longer than any test timeout we'll use
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><p>Slow</p></body></html>");
        }, 10_000);
        return;
      }

      if (req.url === "/missing-selector") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>No special element here</p></body></html>");
        return;
      }

      if (req.url === "/large") {
        res.writeHead(200, { "Content-Type": "text/html" });
        const bigContent = "x".repeat(500_000);
        res.end(`<html><body><p>${bigContent}</p></body></html>`);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>OK</p></body></html>");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await closeBrowser();
  server?.close();
});

describe("HTTP error responses", () => {
  it("handles server 500 without throwing", async () => {
    const result = await renderPage({ url: `${baseUrl}/500` });

    expect(result.html).toBeTruthy();
    expect(result.title).toBeDefined();
  });

  it("handles large HTML response (500KB) without OOM", async () => {
    const result = await renderPage({ url: `${baseUrl}/large` });

    expect(result.html).toBeTruthy();
    expect(result.html.length).toBeGreaterThan(100_000);
  });
});

describe("timeout and selector errors", () => {
  it("throws when waitForSelector target is missing (short timeout)", async () => {
    await expect(
      renderPage({
        url: `${baseUrl}/missing-selector`,
        waitForSelector: "#nonexistent-element",
        waitTimeout: 3000,
      }),
    ).rejects.toThrow();
  });

  it("throws when server is too slow and waitTimeout is short", async () => {
    await expect(
      renderPage({
        url: `${baseUrl}/slow`,
        waitTimeout: 1500,
      }),
    ).rejects.toThrow();
  });
});
