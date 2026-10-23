# productradar-mcp

ProductRadar as a native tool for Claude Desktop, Cursor, Claude Code and any MCP-capable agent.
Ask your assistant to research a product and it gets ProductRadar's 8-part Dossier: verdict,
resellability, UK/EU landed margin, momentum, saturation, supplier matches, evidence and exports. The
landed margin is calculated after VAT, import duty, marketplace fees and advertising, from sourced
supplier and retail prices; every number cites its source, and anything that can't be sourced is left
out and named, never guessed. Parts below their confidence gate (0.5 for the verdict, 0.7 for every
number) are withheld. Each paid call is settled automatically in USDC over [x402](https://x402.org)
from a wallet you control.

Full documentation: https://theproductradar.io/docs#mcp

## Tools

| Tool | Cost | What it returns |
| --- | --- | --- |
| `search_products` | 0.01 USDC | Search Amazon UK in plain words ("ceramic coffee mug"): the 8-part Dossier for the product most listings agree on. Calls `GET /api/agent/v2/search` |
| `get_product_dossier` | 2.00 USDC | The Standard 8-part Dossier for one Amazon UK product, by ASIN (`B0CH33F5P2`): its product page, other listings of it and supplier matches. Calls `GET /api/agent/v2/dossier/{asin}` |
| `get_payment_status` | free | Wallet, caps, and the payments made this session |

Nothing is charged when a search finds no listing or a data source fails. Scores, verdicts and margins
are calculated estimates, not guarantees.

## Install

Claude Desktop (`claude_desktop_config.json`) or Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "productradar": {
      "command": "npx",
      "args": ["-y", "https://theproductradar.io/mcp/productradar-mcp-0.2.0.tgz"],
      "env": {
        "PRODUCTRADAR_WALLET_PRIVATE_KEY": "0x…",
        "PRODUCTRADAR_BUDGET_USDC": "5.00"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add productradar --env PRODUCTRADAR_WALLET_PRIVATE_KEY=0x… -- npx -y https://theproductradar.io/mcp/productradar-mcp-0.2.0.tgz
```

Needs Node.js 20 or newer.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PRODUCTRADAR_WALLET_PRIVATE_KEY` | none | Wallet that pays (USDC on Base / Base Sepolia). Without it, paid tools explain how to add one. |
| `PRODUCTRADAR_MAX_PRICE_USDC` | `2.00` | Never pay more than this for one call. Set `0.01` to allow searches only. |
| `PRODUCTRADAR_BUDGET_USDC` | `5.00` | Never spend more than this per server session (restart to reset). |
| `PRODUCTRADAR_API_URL` | `https://theproductradar.io` | API to call. |

Use a dedicated wallet holding only a few dollars of USDC. The key never leaves your machine: it signs
each payment locally, and only the signed authorization for that exact amount is sent.

Version 0.1.x called the retired v1 catalog API (`/api/agent/v1`); its packages stay published so
existing installs keep working.
