import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer, type Server } from "node:http";
import { renderPage, closeBrowser } from "../src/lib/renderer.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>Concurrent test page</p></body></html>");
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

describe("concurrent renderPage calls", () => {
  it("handles 5 simultaneous requests sharing one browser", async () => {
    const urls = Array.from({ length: 5 }, () => `${baseUrl}/`);
    const results = await Promise.all(urls.map((url) => renderPage({ url })));

    for (const result of results) {
      expect(result.html).toContain("Concurrent test page");
    }
  });

  it("all concurrent calls return independent results", async () => {
    const results = await Promise.all([
      renderPage({ url: `${baseUrl}/` }),
      renderPage({ url: `${baseUrl}/` }),
      renderPage({ url: `${baseUrl}/` }),
    ]);

    // Each result should be a distinct object
    expect(results[0]).not.toBe(results[1]);
    expect(results[1]).not.toBe(results[2]);

    // All should have content
    for (const r of results) {
      expect(r.html).toBeTruthy();
      expect(r.url).toContain(baseUrl);
    }
  });
});
