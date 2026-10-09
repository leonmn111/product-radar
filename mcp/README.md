# productradar-mcp

ProductRadar as a native tool for Claude Desktop, Cursor, Claude Code and any MCP-capable agent.
Ask your assistant for product opportunities and it gets ranked products with scores calculated from
sourced, timestamped evidence. Each paid call is settled automatically in USDC over
[x402](https://x402.org) from a wallet you control.

Full documentation: https://theproductradar.io/docs#mcp

## Tools

| Tool | Cost | What it returns |
| --- | --- | --- |
| `find_product_opportunities` | 1 micro-payment | Ranked products: opportunity score + confidence, dimension scores, best offer, top evidence |
| `get_product_dossier` | 1 micro-payment | Rule-based verdict, every score and its evidence, profit estimate, supplier search, Shopify draft CSV |
| `get_payment_status` | free | Wallet, caps, and the payments made this session |

## Install

Claude Desktop (`claude_desktop_config.json`) or Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "productradar": {
      "command": "npx",
      "args": ["-y", "https://theproductradar.io/mcp/productradar-mcp-0.1.0.tgz"],
      "env": {
        "PRODUCTRADAR_WALLET_PRIVATE_KEY": "0x…",
        "PRODUCTRADAR_BUDGET_USDC": "1.00"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add productradar --env PRODUCTRADAR_WALLET_PRIVATE_KEY=0x… -- npx -y https://theproductradar.io/mcp/productradar-mcp-0.1.0.tgz
```

Needs Node.js 20 or newer.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PRODUCTRADAR_WALLET_PRIVATE_KEY` | none | Wallet that pays (USDC on Base / Base Sepolia). Without it, paid tools explain how to add one. |
| `PRODUCTRADAR_MAX_PRICE_USDC` | `0.10` | Never pay more than this for one call. |
| `PRODUCTRADAR_BUDGET_USDC` | `1.00` | Never spend more than this per server session (restart to reset). |
| `PRODUCTRADAR_API_URL` | `https://theproductradar.io` | API to call. |

Use a dedicated wallet holding only a few dollars of USDC. The key never leaves your machine: it signs
each payment locally, and only the signed authorization for that exact amount is sent.
