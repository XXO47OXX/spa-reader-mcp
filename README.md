# spa-reader-mcp

[![CI](https://github.com/XXO47OXX/spa-reader-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/XXO47OXX/spa-reader-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/spa-reader-mcp.svg)](https://www.npmjs.com/package/spa-reader-mcp)

MCP server that renders JavaScript SPA pages and extracts Markdown via headless Chromium.

Traditional scrapers fail on SPAs because content is rendered client-side. This tool launches Playwright, waits for JS to finish, then extracts clean Markdown using Readability + Turndown.

## Install

```bash
npx playwright install chromium
```

### Claude Desktop

```json
{
  "mcpServers": {
    "spa-reader": {
      "command": "npx",
      "args": ["-y", "spa-reader-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add spa-reader -- npx -y spa-reader-mcp
```

## Tools

### `spa_read`

Render a page and extract content as Markdown.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | — | URL to read (required) |
| `waitForSelector` | string | — | CSS selector to wait for |
| `waitTimeout` | number | 30000 | Timeout in ms |
| `includeMetadata` | boolean | true | Add YAML frontmatter |
| `cookies` | array | — | Cookies for auth |
| `headers` | object | — | Custom HTTP headers |

### `spa_screenshot`

Capture a PNG screenshot after JS rendering.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | — | URL to capture (required) |
| `waitForSelector` | string | — | CSS selector to wait for |
| `waitTimeout` | number | 30000 | Timeout in ms |
| `width` | number | 1280 | Viewport width |
| `height` | number | 720 | Viewport height |
| `fullPage` | boolean | false | Full page capture |
| `cookies` | array | — | Cookies for auth |
| `headers` | object | — | Custom HTTP headers |

## Security

- SSRF protection: blocks private/loopback IPs
- Only `http:` and `https:` schemes allowed
- Selector injection prevention
- Content capped at 100KB

## Dev

```bash
pnpm install && pnpm build
pnpm test
```

## License

MIT
