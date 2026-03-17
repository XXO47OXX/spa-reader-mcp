import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * SSRF protection tests.
 *
 * The main vitest.config.ts sets SPA_READER_ALLOW_PRIVATE=1, which bypasses
 * private-IP blocking so the other tests can hit 127.0.0.1 test servers.
 *
 * Here we use vi.resetModules() + vi.stubEnv() + dynamic import to load
 * renderer.ts with ALLOW_PRIVATE=false, then call the exported pure
 * validation functions directly (no browser needed).
 */

describe("SSRF protection (ALLOW_PRIVATE disabled)", () => {
  let validateUrl: (url: string) => URL;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv("SPA_READER_ALLOW_PRIVATE", "");
    const mod = await import("../src/lib/renderer.js");
    validateUrl = mod._validateUrl;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // --- Disallowed schemes ---

  it("blocks file:// scheme", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow("Disallowed URL scheme");
  });

  it("blocks ftp:// scheme", () => {
    expect(() => validateUrl("ftp://example.com/file")).toThrow("Disallowed URL scheme");
  });

  it("blocks javascript: scheme", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow("Disallowed URL scheme");
  });

  it("blocks data: URI", () => {
    expect(() => validateUrl("data:text/html,<h1>Hi</h1>")).toThrow("Disallowed URL scheme");
  });

  // --- Private / loopback addresses ---

  it("blocks 127.0.0.1 (loopback)", () => {
    expect(() => validateUrl("http://127.0.0.1:8080/")).toThrow("Blocked URL");
  });

  it("blocks 10.x.x.x (private class A)", () => {
    expect(() => validateUrl("http://10.0.0.1/")).toThrow("Blocked URL");
  });

  it("blocks 192.168.x.x (private class C)", () => {
    expect(() => validateUrl("http://192.168.1.1/")).toThrow("Blocked URL");
  });

  it("blocks 172.16-31.x.x (private class B)", () => {
    expect(() => validateUrl("http://172.16.0.1/")).toThrow("Blocked URL");
    expect(() => validateUrl("http://172.31.255.255/")).toThrow("Blocked URL");
  });

  it("blocks IPv6 loopback [::1]", () => {
    expect(() => validateUrl("http://[::1]/")).toThrow("Blocked URL");
  });

  it("blocks link-local 169.254.169.254 (AWS metadata)", () => {
    expect(() => validateUrl("http://169.254.169.254/latest/meta-data/")).toThrow("Blocked URL");
  });

  it("blocks 0.0.0.0", () => {
    expect(() => validateUrl("http://0.0.0.0/")).toThrow("Blocked URL");
  });

  it("blocks localhost", () => {
    expect(() => validateUrl("http://localhost/")).toThrow("Blocked URL");
    expect(() => validateUrl("http://LOCALHOST/")).toThrow("Blocked URL");
  });

  // --- Allowed public URLs ---

  it("allows https://example.com", () => {
    const parsed = validateUrl("https://example.com/");
    expect(parsed.href).toBe("https://example.com/");
  });

  it("allows http://example.com with path", () => {
    const parsed = validateUrl("http://example.com/path?q=1");
    expect(parsed.hostname).toBe("example.com");
  });

  // --- Invalid input ---

  it("throws on non-URL string", () => {
    expect(() => validateUrl("not-a-url")).toThrow("Invalid URL");
  });

  it("throws on empty string", () => {
    expect(() => validateUrl("")).toThrow("Invalid URL");
  });
});

describe("validateSelector", () => {
  let validateSelector: (selector: string) => void;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv("SPA_READER_ALLOW_PRIVATE", "");
    const mod = await import("../src/lib/renderer.js");
    validateSelector = mod._validateSelector;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("blocks >> Playwright combinator", () => {
    expect(() => validateSelector("div >> span")).toThrow("Invalid selector");
  });

  it("blocks nth= pseudo-selector", () => {
    expect(() => validateSelector("li:nth=2")).toThrow("Invalid selector");
  });

  it("blocks text= selector engine", () => {
    expect(() => validateSelector('text="hello"')).toThrow("Invalid selector");
  });

  it("blocks has-text pseudo", () => {
    expect(() => validateSelector("div:has-text('hello')")).toThrow("Invalid selector");
  });

  it("blocks :has() pseudo", () => {
    expect(() => validateSelector("div:has(.child)")).toThrow("Invalid selector");
  });

  it("allows standard CSS selectors", () => {
    expect(() => validateSelector(".my-class")).not.toThrow();
    expect(() => validateSelector("#my-id")).not.toThrow();
    expect(() => validateSelector("div > span")).not.toThrow();
    expect(() => validateSelector("[data-loaded='true']")).not.toThrow();
    expect(() => validateSelector("article p:first-child")).not.toThrow();
  });
});
