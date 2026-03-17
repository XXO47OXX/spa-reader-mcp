import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renderPage } from "../lib/renderer.js";
import { extractArticle, formatAsLlmMarkdown } from "../lib/extractor.js";
import { cookieSchema } from "../types.js";

export function registerSpaReadTool(server: McpServer): void {
  server.tool(
    "spa_read",
    "Render a JavaScript SPA page and extract its content as LLM-ready Markdown. " +
      "Uses a headless browser to execute JavaScript, then extracts the main article content.",
    {
      url: z.string().url().describe("The URL of the SPA page to read"),
      waitForSelector: z
        .string()
        .optional()
        .describe("CSS selector to wait for before extraction"),
      waitTimeout: z
        .number()
        .min(1000)
        .max(120000)
        .optional()
        .describe("Navigation timeout in ms (default: 30000)"),
      includeMetadata: z
        .boolean()
        .optional()
        .describe("Include title/author/excerpt as YAML frontmatter (default: true)"),
      cookies: z
        .array(cookieSchema)
        .optional()
        .describe("Cookies to inject before page load (e.g., session tokens)"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Custom HTTP headers (e.g., Authorization)"),
    },
    async ({ url, waitForSelector, waitTimeout, includeMetadata, cookies, headers }) => {
      try {
        const renderResult = await renderPage({ url, waitForSelector, waitTimeout, cookies, headers });
        const extraction = extractArticle(renderResult.html, renderResult.url);

        if (extraction.markdown.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Page rendered but no content found at ${url}`,
              },
            ],
            isError: true,
          };
        }

        const markdown = formatAsLlmMarkdown(
          extraction,
          renderResult.url,
          includeMetadata ?? true,
        );

        return {
          content: [{ type: "text" as const, text: markdown }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading ${url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
