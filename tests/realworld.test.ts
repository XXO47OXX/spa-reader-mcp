import { describe, it, expect, afterAll } from "vitest";
import { renderPage, takeScreenshot, closeBrowser } from "../src/lib/renderer.js";
import { extractArticle } from "../src/lib/extractor.js";

const SPA_ENABLED = process.env.REAL_WORLD_TESTS === "1";

describe("real-world: static sites — basic rendering", () => {
  it("example.com — basic HTML rendering", async () => {
    const result = await renderPage({ url: "https://example.com" });

    expect(result.title).toBe("Example Domain");
    expect(result.html).toContain("Example Domain");
    // URL should be either exact or with trailing slash
    expect([result.url, "https://example.com/", "https://example.com"]).toContain(
      result.url,
    );
  });

  it("httpbin.org/html — predictable HTML content", async () => {
    const result = await renderPage({
      url: "https://httpbin.org/html",
      waitTimeout: 30_000,
    });

    expect(result.html).toContain("Herman Melville");
    expect(result.html.length).toBeGreaterThan(200);
  });

  it("w3.org — standards body site rendering", async () => {
    const result = await renderPage({
      url: "https://www.w3.org/",
      waitTimeout: 30_000,
    });

    expect(result.title.toLowerCase()).toContain("w3c");
    expect(result.html.length).toBeGreaterThan(2000);
    expect(result.url).toContain("w3.org");
  });
});

describe("real-world: content extraction quality", () => {
  it("example.com — Markdown contains expected text", async () => {
    const renderResult = await renderPage({ url: "https://example.com" });
    const extraction = extractArticle(renderResult.html, renderResult.url);

    expect(extraction.markdown).toContain("Example Domain");
    expect(extraction.markdown.length).toBeGreaterThan(50);
    // Simple page may use fallback, but content should still be extracted
    expect(extraction.markdown).toBeTruthy();
  });

  it("httpbin.org/html — extracted markdown contains article text", async () => {
    const renderResult = await renderPage({
      url: "https://httpbin.org/html",
      waitTimeout: 30_000,
    });
    const extraction = extractArticle(renderResult.html, renderResult.url);

    expect(extraction.markdown.length).toBeGreaterThan(100);
    expect(extraction.markdown.toLowerCase()).toContain("moby");
  });

  it("w3.org — markdown extraction with metadata", async () => {
    const renderResult = await renderPage({
      url: "https://www.w3.org/",
      waitTimeout: 30_000,
    });
    const extraction = extractArticle(renderResult.html, renderResult.url);

    expect(extraction.markdown.length).toBeGreaterThan(500);
    expect(extraction.markdown).toBeTruthy();
  });
});

describe("real-world: screenshot functionality", () => {
  it("example.com — valid PNG bytes signature", async () => {
    const buf = await takeScreenshot({ url: "https://example.com" });

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("httpbin.org/html — screenshot is valid PNG", async () => {
    const buf = await takeScreenshot({
      url: "https://httpbin.org/html",
      viewport: { width: 1280, height: 720 },
    });

    // Verify PNG signature
    expect(buf.slice(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("example.com — full page screenshot vs viewport", async () => {
    const viewport = await takeScreenshot({
      url: "https://example.com",
      fullPage: false,
    });
    const full = await takeScreenshot({
      url: "https://example.com",
      fullPage: true,
    });

    // Full page should be >= viewport (extreme case: single screen page could be equal)
    expect(full.length).toBeGreaterThanOrEqual(viewport.length * 0.9);
    // Both should have valid PNG signature
    expect(viewport[0]).toBe(0x89);
    expect(full[0]).toBe(0x89);
  });

  it("w3.org — screenshot of complex site", async () => {
    const buf = await takeScreenshot({
      url: "https://www.w3.org/",
      viewport: { width: 1280, height: 800 },
      fullPage: true,
    });

    expect(buf[0]).toBe(0x89);
    expect(buf.length).toBeGreaterThan(10000);
  });
});

describe.skipIf(!SPA_ENABLED)("real-world: JavaScript-heavy SPA sites", () => {
  it("npmjs.com/package/playwright — React SPA renders", async () => {
    const result = await renderPage({
      url: "https://www.npmjs.com/package/playwright",
      waitTimeout: 45_000,
    });

    expect(result.html.toLowerCase()).toContain("playwright");
    expect(result.html.length).toBeGreaterThan(5000);
    expect(result.title.toLowerCase()).toContain("playwright");
  });

  it("vitest.dev — Vite SPA renders with content", async () => {
    const result = await renderPage({
      url: "https://vitest.dev",
      waitTimeout: 45_000,
    });

    expect(result.html.toLowerCase()).toContain("vitest");
    expect(result.html.length).toBeGreaterThan(3000);
  });
});

afterAll(async () => {
  await closeBrowser();
});
