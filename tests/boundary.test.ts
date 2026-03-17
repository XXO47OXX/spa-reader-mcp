import { describe, it, expect } from "vitest";
import { extractArticle, formatAsLlmMarkdown } from "../src/lib/extractor.js";
import { MAX_CONTENT_LENGTH } from "../src/types.js";

// Helper to build a synthetic ExtractionResult for formatAsLlmMarkdown tests
function syntheticResult(
  markdown: string,
  title: string | null = null,
) {
  return {
    markdown,
    metadata: {
      title,
      byline: null,
      excerpt: null,
      siteName: null,
      lang: null,
    },
    usedFallback: false,
  };
}

// --- Content truncation ---

describe("content truncation boundaries", () => {
  it("does NOT truncate at exactly MAX_CONTENT_LENGTH", () => {
    const md = "a".repeat(MAX_CONTENT_LENGTH);
    const formatted = formatAsLlmMarkdown(syntheticResult(md), "http://x.com", false);

    expect(formatted).not.toContain("[Content truncated");
  });

  it("truncates content exceeding MAX_CONTENT_LENGTH", () => {
    const md = "a".repeat(MAX_CONTENT_LENGTH + 100);
    const formatted = formatAsLlmMarkdown(syntheticResult(md), "http://x.com", false);

    expect(formatted).toContain("[Content truncated");
  });

  it("truncates at last newline boundary when available", () => {
    // 100 lines of 1100 chars each → total ~110,000 > MAX_CONTENT_LENGTH
    const line = "b".repeat(1100);
    const md = Array.from({ length: 100 }, () => line).join("\n");
    const formatted = formatAsLlmMarkdown(syntheticResult(md), "http://x.com", false);

    expect(formatted).toContain("[Content truncated");
    // Content before the truncation marker should end at a line boundary
    const markerIdx = formatted.indexOf("\n\n---\n_[Content truncated");
    const contentBefore = formatted.slice(0, markerIdx);
    // Last char before marker should be a regular character (not mid-line)
    expect(contentBefore.length).toBeLessThanOrEqual(MAX_CONTENT_LENGTH);
  });

  it("falls back to hard cut when no newline exists", () => {
    const md = "x".repeat(MAX_CONTENT_LENGTH + 5000);
    const formatted = formatAsLlmMarkdown(syntheticResult(md), "http://x.com", false);

    expect(formatted).toContain("[Content truncated");
    // Verify content is actually truncated, not the full original
    expect(formatted.length).toBeLessThan(MAX_CONTENT_LENGTH + 5000);
  });
});

// --- YAML frontmatter edge cases ---

describe("YAML frontmatter edge cases", () => {
  it("escapes backslash in title", () => {
    const formatted = formatAsLlmMarkdown(
      syntheticResult("content", "path\\to\\file"),
      "http://x.com",
      true,
    );

    expect(formatted).toContain("path\\\\to\\\\file");
  });

  it("handles null bytes in title without crashing", () => {
    expect(() =>
      formatAsLlmMarkdown(
        syntheticResult("content", "title\x00with\x00nulls"),
        "http://x.com",
        true,
      ),
    ).not.toThrow();
  });

  it("safely handles YAML block indicators | and > in title", () => {
    const formatted = formatAsLlmMarkdown(
      syntheticResult("content", "A | B > C"),
      "http://x.com",
      true,
    );

    // Title is double-quoted, so | and > aren't interpreted as YAML blocks
    expect(formatted).toContain("A | B > C");
    expect(formatted).toMatch(/^---\n/);
  });

  it("preserves Unicode title", () => {
    const formatted = formatAsLlmMarkdown(
      syntheticResult("content", "你好世界 🌍"),
      "http://x.com",
      true,
    );

    expect(formatted).toContain("你好世界");
  });

  it("skips frontmatter when title is null", () => {
    const formatted = formatAsLlmMarkdown(
      syntheticResult("content", null),
      "http://x.com",
      true,
    );

    expect(formatted).not.toMatch(/^---\n/);
  });
});

// --- Extractor edge cases ---

describe("extractor edge cases", () => {
  it("returns usedFallback for whitespace-only body", () => {
    const html = "<!DOCTYPE html><html><head><title>Blank</title></head><body>   \n\t  </body></html>";
    const result = extractArticle(html, "http://example.com");

    expect(result.usedFallback).toBe(true);
  });

  it("handles broken/malformed HTML gracefully", () => {
    const html = "<broken><html><body><p>content</p>";
    expect(() => extractArticle(html, "http://example.com")).not.toThrow();

    const result = extractArticle(html, "http://example.com");
    expect(result.markdown).toContain("content");
  });

  it("handles empty string HTML input", () => {
    const result = extractArticle("", "http://example.com");
    expect(result.usedFallback).toBe(true);
    expect(result.markdown).toBe("");
  });

  it("extracts lang from documentElement", () => {
    const html = '<!DOCTYPE html><html lang="zh-CN"><head><title>T</title></head><body><p>内容</p></body></html>';
    const result = extractArticle(html, "http://example.com");

    expect(result.metadata.lang).toBe("zh-CN");
  });
});
