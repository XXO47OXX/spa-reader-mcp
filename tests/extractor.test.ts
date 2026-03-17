import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractArticle, formatAsLlmMarkdown } from "../src/lib/extractor.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("extractArticle", () => {
  it("extracts content from a well-structured article", () => {
    const html = readFixture("article.html");
    const result = extractArticle(html, "https://example.com/article");

    expect(result.usedFallback).toBe(false);
    expect(result.markdown).toContain("Understanding JavaScript SPA Rendering");
    expect(result.markdown).toContain("Playwright");
    expect(result.markdown).toContain("Readability.js");
  });

  it("extracts metadata from article", () => {
    const html = readFixture("article.html");
    const result = extractArticle(html, "https://example.com/article");

    expect(result.metadata.title).toBeTruthy();
  });

  it("returns empty markdown for empty page", () => {
    const html = readFixture("empty.html");
    const result = extractArticle(html, "https://example.com/empty");

    expect(result.markdown).toBe("");
    expect(result.usedFallback).toBe(true);
  });

  it("uses fallback for non-article HTML", () => {
    const html = `<!DOCTYPE html>
<html><head><title>Simple</title></head>
<body><div><p>Just a paragraph without article structure.</p><p>Another paragraph with some text content here for testing purposes.</p></div></body>
</html>`;
    const result = extractArticle(html, "https://example.com/simple");

    expect(result.markdown).toContain("paragraph");
    expect(result.metadata.title).toBe("Simple");
  });

  it("strips script and style tags in fallback", () => {
    const html = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body>
  <script>alert('xss')</script>
  <style>.hidden { display: none; }</style>
  <p>Visible content only</p>
</body>
</html>`;
    const result = extractArticle(html, "https://example.com/test");

    expect(result.markdown).not.toContain("alert");
    expect(result.markdown).not.toContain("display: none");
    expect(result.markdown).toContain("Visible content");
  });
});

describe("formatAsLlmMarkdown", () => {
  it("includes YAML frontmatter when metadata present", () => {
    const html = readFixture("article.html");
    const result = extractArticle(html, "https://example.com/article");
    const formatted = formatAsLlmMarkdown(result, "https://example.com/article", true);

    expect(formatted).toMatch(/^---\n/);
    expect(formatted).toContain('source: "https://example.com/article"');
  });

  it("omits frontmatter when includeMetadata is false", () => {
    const html = readFixture("article.html");
    const result = extractArticle(html, "https://example.com/article");
    const formatted = formatAsLlmMarkdown(result, "https://example.com/article", false);

    expect(formatted).not.toMatch(/^---\n/);
  });

  it("truncates content exceeding MAX_CONTENT_LENGTH", () => {
    const longContent = "x".repeat(150_000);
    const html = `<!DOCTYPE html>
<html><head><title>Long</title></head>
<body><article><h1>Long Article</h1><p>${longContent}</p></article></body>
</html>`;
    const result = extractArticle(html, "https://example.com/long");
    const formatted = formatAsLlmMarkdown(result, "https://example.com/long", false);

    expect(formatted).toContain("[Content truncated");
    expect(formatted.length).toBeLessThan(150_000);
  });

  it("escapes YAML special characters in metadata", () => {
    const result = {
      markdown: "Some content",
      metadata: {
        title: 'Evil" \nmalicious_key: "injected',
        byline: 'Author with "quotes"',
        excerpt: null,
        siteName: null,
        lang: null,
      },
      usedFallback: false,
    };
    const formatted = formatAsLlmMarkdown(result, "https://example.com", true);

    // malicious_key should NOT appear as a standalone YAML key (start of line)
    expect(formatted).not.toMatch(/^malicious_key:/m);
    // Quotes should be escaped
    expect(formatted).toContain('\\"');
  });

  it("collapses excessive newlines", () => {
    const result = {
      markdown: "Line 1\n\n\n\n\nLine 2",
      metadata: { title: null, byline: null, excerpt: null, siteName: null, lang: null },
      usedFallback: false,
    };
    const formatted = formatAsLlmMarkdown(result, "https://example.com", false);

    expect(formatted).not.toContain("\n\n\n");
  });
});
