import { JSDOM } from "jsdom";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
import TurndownService from "turndown";
import type { ExtractionResult, ArticleMetadata } from "../types.js";
import { MAX_CONTENT_LENGTH } from "../types.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

turndown.remove(["script", "style", "nav", "footer", "header", "aside"]);

const EMPTY_METADATA: ArticleMetadata = {
  title: null,
  byline: null,
  excerpt: null,
  siteName: null,
  lang: null,
};

function yamlQuote(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

export function extractArticle(html: string, url: string): ExtractionResult {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  const isReaderable = isProbablyReaderable(document);

  if (isReaderable) {
    const clonedDoc = new JSDOM(html, { url }).window.document;
    const article = new Readability(clonedDoc).parse();

    if (article !== null && article.content) {
      const markdown = turndown.turndown(article.content);
      const metadata: ArticleMetadata = {
        title: article.title ?? null,
        byline: article.byline ?? null,
        excerpt: article.excerpt ?? null,
        siteName: article.siteName ?? null,
        lang: article.lang ?? null,
      };
      return { markdown, metadata, usedFallback: false };
    }
  }

  const bodyHtml = document.body?.innerHTML?.trim() ?? "";

  if (bodyHtml.length === 0) {
    return {
      markdown: "",
      metadata: EMPTY_METADATA,
      usedFallback: true,
    };
  }

  const markdown = turndown.turndown(bodyHtml);
  const titleEl = document.querySelector("title");
  const metadata: ArticleMetadata = {
    title: titleEl?.textContent ?? null,
    byline: null,
    excerpt: null,
    siteName: null,
    lang: document.documentElement?.lang ?? null,
  };

  return { markdown, metadata, usedFallback: true };
}

export function formatAsLlmMarkdown(
  result: ExtractionResult,
  sourceUrl: string,
  includeMetadata: boolean,
): string {
  let output = "";

  if (includeMetadata && result.metadata.title) {
    output += "---\n";
    output += `title: ${yamlQuote(result.metadata.title)}\n`;
    if (result.metadata.byline) {
      output += `author: ${yamlQuote(result.metadata.byline)}\n`;
    }
    if (result.metadata.excerpt) {
      output += `excerpt: ${yamlQuote(result.metadata.excerpt)}\n`;
    }
    if (result.metadata.siteName) {
      output += `site: ${yamlQuote(result.metadata.siteName)}\n`;
    }
    if (result.metadata.lang) {
      output += `lang: ${yamlQuote(result.metadata.lang)}\n`;
    }
    output += `source: ${yamlQuote(sourceUrl)}\n`;
    output += "---\n\n";
  }

  let markdown = result.markdown;

  if (markdown.length > MAX_CONTENT_LENGTH) {
    const cutoff = markdown.lastIndexOf("\n", MAX_CONTENT_LENGTH);
    markdown = markdown.slice(0, cutoff > 0 ? cutoff : MAX_CONTENT_LENGTH);
    markdown += "\n\n---\n_[Content truncated: exceeded 100KB limit]_\n";
  }

  output += markdown;

  output = output.replace(/\n{3,}/g, "\n\n").trim();

  return output;
}
