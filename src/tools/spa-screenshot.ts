import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { takeScreenshot } from "../lib/renderer.js";

const cookieSchema = z.object({
  name: z.string().min(1).describe("Cookie name"),
  value: z.string().describe("Cookie value"),
  domain: z.string().optional().describe("Cookie domain (auto-inferred from URL if omitted)"),
  path: z.string().optional().describe("Cookie path (default: '/')"),
  secure: z.boolean().optional().describe("Secure flag"),
  httpOnly: z.boolean().optional().describe("HttpOnly flag"),
  expires: z.number().optional().describe("Expiration timestamp"),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional().describe("SameSite attribute"),
});

export function registerSpaScreenshotTool(server: McpServer): void {
  server.tool(
    "spa_screenshot",
    "Take a screenshot of a JavaScript SPA page after rendering. " +
      "Uses a headless browser to execute JavaScript and capture the visual output as PNG.",
    {
      url: z.string().url().describe("The URL to screenshot"),
      waitForSelector: z
        .string()
        .optional()
        .describe("CSS selector to wait for before capturing"),
      waitTimeout: z
        .number()
        .min(1000)
        .max(120000)
        .optional()
        .describe("Navigation timeout in ms (default: 30000)"),
      width: z
        .number()
        .min(320)
        .max(3840)
        .optional()
        .describe("Viewport width in pixels (default: 1280)"),
      height: z
        .number()
        .min(240)
        .max(2160)
        .optional()
        .describe("Viewport height in pixels (default: 720)"),
      fullPage: z
        .boolean()
        .optional()
        .describe("Capture full scrollable page (default: false)"),
      cookies: z
        .array(cookieSchema)
        .optional()
        .describe("Cookies to inject before screenshot"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Custom HTTP headers"),
    },
    async ({ url, waitForSelector, waitTimeout, width, height, fullPage, cookies, headers }) => {
      try {
        const viewport =
          width !== undefined || height !== undefined
            ? { width: width ?? 1280, height: height ?? 720 }
            : undefined;

        const buffer = await takeScreenshot({
          url,
          waitForSelector,
          waitTimeout,
          viewport,
          fullPage,
          cookies,
          headers,
        });

        const base64 = buffer.toString("base64");

        return {
          content: [
            {
              type: "image" as const,
              data: base64,
              mimeType: "image/png",
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error capturing screenshot of ${url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
