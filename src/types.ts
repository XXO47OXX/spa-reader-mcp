export interface CookieInput {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly expires?: number;
  readonly sameSite?: "Strict" | "Lax" | "None";
}

export type ExtraHeaders = Readonly<Record<string, string>>;

export interface RenderOptions {
  readonly url: string;
  readonly waitForSelector?: string;
  readonly waitTimeout?: number;
  readonly cookies?: readonly CookieInput[];
  readonly headers?: ExtraHeaders;
}

export interface ViewportConfig {
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotOptions extends RenderOptions {
  readonly viewport?: ViewportConfig;
  readonly fullPage?: boolean;
}

export interface RenderResult {
  readonly html: string;
  readonly url: string;
  readonly title: string;
}

export interface ArticleMetadata {
  readonly title: string | null;
  readonly byline: string | null;
  readonly excerpt: string | null;
  readonly siteName: string | null;
  readonly lang: string | null;
}

export interface ExtractionResult {
  readonly markdown: string;
  readonly metadata: ArticleMetadata;
  readonly usedFallback: boolean;
}

export const DEFAULT_WAIT_TIMEOUT = 30_000;
export const NETWORKIDLE_TIMEOUT = 10_000;
export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;
export const MAX_CONTENT_LENGTH = 100_000;
