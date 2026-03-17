import { chromium, type Browser, type BrowserContext, type Page, type Cookie as PlaywrightCookie } from "patchright";
import type { RenderOptions, RenderResult, ScreenshotOptions, CookieInput } from "../types.js";
import {
  DEFAULT_WAIT_TIMEOUT,
  NETWORKIDLE_TIMEOUT,
  DEFAULT_VIEWPORT_WIDTH,
  DEFAULT_VIEWPORT_HEIGHT,
} from "../types.js";

let browserInstance: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
];

const ALLOW_PRIVATE = process.env.SPA_READER_ALLOW_PRIVATE === "1";

const BLOCKED_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-connection",
  "keep-alive",
]);

const PLAYWRIGHT_SELECTOR_BLOCKLIST = />>|nth=|text=|has-text|:has\(/i;

async function getBrowser(): Promise<Browser> {
  if (browserInstance !== null && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (launchPromise !== null) {
    return launchPromise;
  }

  launchPromise = chromium
    .launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    .then((browser) => {
      browserInstance = browser;
      browser.on("disconnected", () => {
        console.error("[spa-reader] Browser disconnected");
        browserInstance = null;
        launchPromise = null;
      });
      console.error("[spa-reader] Chromium launched");
      return browser;
    })
    .catch((err) => {
      launchPromise = null;
      throw err;
    });

  return launchPromise;
}

function validateUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Disallowed URL scheme: ${parsed.protocol} (only http/https allowed)`);
  }

  if (!ALLOW_PRIVATE) {
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new Error(`Blocked URL: access to private/loopback addresses is not allowed`);
      }
    }
  }

  return parsed;
}

function validateSelector(selector: string): void {
  if (PLAYWRIGHT_SELECTOR_BLOCKLIST.test(selector)) {
    throw new Error(
      "Invalid selector: Playwright-specific syntax (>>, nth=, text=, has-text, :has) is not allowed",
    );
  }
}

function validateHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (BLOCKED_HEADERS.has(lower)) {
      throw new Error(
        `Blocked header: "${key}" is a reserved protocol header and cannot be overridden`,
      );
    }
    if (/[\r\n]/.test(value)) {
      throw new Error(
        `Invalid header value for "${key}": newline characters are not allowed`,
      );
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function resolveCookieDomain(cookie: CookieInput, parsedUrl: URL): string {
  return cookie.domain ?? parsedUrl.hostname;
}

function calcSelectorTimeout(totalTimeout: number): number {
  return Math.min(Math.max(totalTimeout - NETWORKIDLE_TIMEOUT, 1000), totalTimeout);
}

async function navigateAndWait(
  page: Page,
  options: RenderOptions,
  parsedUrl: URL,
  timeout: number,
): Promise<void> {
  await page.goto(parsedUrl.href, {
    waitUntil: "domcontentloaded",
    timeout,
  });

  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORKIDLE_TIMEOUT,
    });
  } catch {
    console.error("[spa-reader] networkidle timeout (non-fatal), proceeding...");
  }

  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, {
      timeout: calcSelectorTimeout(timeout),
    });
  }
}

function validateOptions(options: RenderOptions): {
  parsedUrl: URL;
  timeout: number;
  resolvedCookies: PlaywrightCookie[];
  cleanedHeaders: Record<string, string>;
} {
  const parsedUrl = validateUrl(options.url);
  const timeout = options.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;

  if (options.waitForSelector) {
    validateSelector(options.waitForSelector);
  }

  const resolvedCookies: PlaywrightCookie[] = (options.cookies ?? []).map((c) => {
    const cookie: Record<string, unknown> = {
      name: c.name,
      value: c.value,
      domain: resolveCookieDomain(c, parsedUrl),
      path: c.path ?? "/",
      secure: c.secure ?? false,
      httpOnly: c.httpOnly ?? false,
    };
    if (c.expires !== undefined) cookie.expires = c.expires;
    if (c.sameSite !== undefined) cookie.sameSite = c.sameSite;
    return cookie as unknown as PlaywrightCookie;
  });

  const cleanedHeaders = options.headers
    ? validateHeaders(options.headers as Record<string, string>)
    : {};

  return { parsedUrl, timeout, resolvedCookies, cleanedHeaders };
}

export async function renderPage(options: RenderOptions): Promise<RenderResult> {
  const { parsedUrl, timeout, resolvedCookies, cleanedHeaders } = validateOptions(options);

  const browser = await getBrowser();
  const context: BrowserContext = await browser.newContext({
    extraHTTPHeaders: Object.keys(cleanedHeaders).length > 0 ? cleanedHeaders : undefined,
  });

  try {
    if (resolvedCookies.length > 0) {
      await context.addCookies(resolvedCookies);
    }

    const page = await context.newPage();
    await navigateAndWait(page, options, parsedUrl, timeout);

    const html = await page.content();
    const url = page.url();
    const title = await page.title();

    return { html, url, title };
  } finally {
    await context.close();
  }
}

export async function takeScreenshot(options: ScreenshotOptions): Promise<Buffer> {
  const { parsedUrl, timeout, resolvedCookies, cleanedHeaders } = validateOptions(options);
  const width = options.viewport?.width ?? DEFAULT_VIEWPORT_WIDTH;
  const height = options.viewport?.height ?? DEFAULT_VIEWPORT_HEIGHT;

  const browser = await getBrowser();
  const viewportSize = { width, height };
  const context: BrowserContext = await browser.newContext({
    viewport: viewportSize,
    screen: viewportSize,
    extraHTTPHeaders: Object.keys(cleanedHeaders).length > 0 ? cleanedHeaders : undefined,
  });

  try {
    if (resolvedCookies.length > 0) {
      await context.addCookies(resolvedCookies);
    }

    const page = await context.newPage();
    await page.setViewportSize(viewportSize);
    await navigateAndWait(page, options, parsedUrl, timeout);

    const screenshot = await page.screenshot({
      fullPage: options.fullPage ?? false,
      type: "png",
    });

    return Buffer.from(screenshot);
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  const instance = browserInstance;
  browserInstance = null;
  launchPromise = null;

  if (instance !== null) {
    console.error("[spa-reader] Closing browser...");
    await instance.close();
    console.error("[spa-reader] Browser closed");
  }
}

export {
  validateUrl as _validateUrl,
  validateSelector as _validateSelector,
  validateHeaders as _validateHeaders,
  resolveCookieDomain as _resolveCookieDomain,
};
