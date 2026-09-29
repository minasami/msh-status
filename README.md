# msh-status

Alexa+ track entry for **Build, Ship, Shape: Amazon Developer Hackathon** (submit by 23 Oct 2026 PDT).

One request file: **id, owner, status, due date**. No patient name. No second tracker.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_status` | One row: id, status, owner, due |
| `get_mine` | Latest open row for the signed-in account |
| `list_open` | Open ids only |
| `set_owner` | Sets owner on an existing id |
| `set_status` | `open` or `closed` only |

## Run locally

```bash
npm test
node src/server.js
# GET  http://127.0.0.1:8787/health
# POST http://127.0.0.1:8787/mcp
```

MCP client or Alexa+ simulator: Streamable HTTP at `/mcp`.

Demo row: `4821` — open, owner `mina`, due `2026-09-30`.

```bash
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H "Authorization: Bearer $MSH_MCP_TOKEN" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"get_status","arguments":{"id":"4821"}}}'
```

Spoken payload:
`Request 4821 is open. Owner mina. Due 2026-09-30.`

## Hackathon delta

Pre-existing: Medicine Support Hub web file (owner / status / clock).

Built for this hackathon: MCP server (spec 2025-11-25), Alexa skill package, OAuth demo, spoken-safe payloads, MIT repo.

## Privacy

Payloads never include member name, diagnosis, or medicine. Id + status + due only.

## Auth

Set `MSH_MCP_TOKEN`. `POST /mcp` needs `Authorization: Bearer <token>`.
`GET /health` stays open.

OAuth 2.0: authorization code + PKCE (S256), plus `client_credentials` for curl.
Tokens live in memory; a new deploy wipes them.

## Alexa

Invocation: **medicine status**

- `GetStatusIntent` — a request number
- `GetMineIntent` — “where is my order”
- `ListOpenIntent`

Primary track is **Alexa+ MCP**. ASK is the living-room wrapper.

## License

MIT
