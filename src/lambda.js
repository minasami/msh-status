/**
 * AWS Lambda + Function URL.
 * GET  /health  — open
 * POST /mcp     — Bearer token
 */
import { isAllowedBearer } from "./oauth.js";
import { callTool, handleRpc, isRpc, TOOLS } from "./mcp-rpc.js";
import { speakWithBedrock, awsEnabled } from "./bedrock.js";
import { dynamoEnabled } from "./store.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function methodOf(event) {
  return (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    event.requestContext?.httpMethod ||
    "GET"
  ).toUpperCase();
}

function pathOf(event) {
  const raw = event.rawPath || event.path || "/";
  return String(raw).replace(/\/$/, "") || "/";
}

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return Array.isArray(v) ? v[0] : v;
  }
  return "";
}

function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { __parseError: true };
  }
}

async function attachBedrockSpeech(rpc) {
  const result = rpc && rpc.result;
  if (!result || !result.structuredContent) return;
  const row = result.structuredContent.row;
  if (!row) return;
  const fallback = result.structuredContent.speech || result.content?.[0]?.text;
  const next = await speakWithBedrock(row, fallback);
  result.structuredContent.speech = next;
  result.structuredContent.aws = {
    bedrock: awsEnabled(),
    dynamodb: dynamoEnabled(),
    runtime: "lambda",
  };
  if (result.content && result.content[0]) result.content[0].text = next;
}

export async function handler(event = {}) {
  const method = methodOf(event);
  const path = pathOf(event);

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const health =
    method === "GET" && (path === "/health" || path === "/" || path.endsWith("/health"));
  if (health) {
    return reply(200, {
      ok: true,
      service: "msh-status",
      runtime: "lambda",
      tools: TOOLS.map((t) => t.name),
      aws: { bedrock: awsEnabled(), dynamodb: dynamoEnabled() },
    });
  }

  const mcp = method === "POST" && (path === "/mcp" || path.endsWith("/mcp") || path === "/");
  if (!mcp) return reply(404, { error: "not_found" });

  const auth = isAllowedBearer(header(event, "authorization"));
  if (!auth) return reply(401, { error: "unauthorized" });
  const ctx = { sub: auth.sub || "mina" };

  const payload = readBody(event);
  if (payload.__parseError) return reply(400, { error: "bad_json" });

  if (isRpc(payload)) {
    const out = await handleRpc(payload, ctx);
    if (out == null) return { statusCode: 202, headers: CORS, body: "" };
    await attachBedrockSpeech(out);
    return reply(200, out);
  }

  const name = payload.name || payload.tool;
  const args = payload.arguments || payload.args || {};
  if (!name) return reply(400, { error: "missing_tool" });
  const simple = await callTool(name, args, ctx);
  await attachBedrockSpeech({ result: simple });
  return reply(200, simple.structuredContent || simple);
}
