import { getStatus, listOpen, setOwner } from "./store.js";
import { speakStatus } from "./speak.js";

export const PROTOCOL = "2025-11-25";

export const TOOLS = [
  {
    name: "get_status",
    description: "Owner, status and due date for a request id. No patient name.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Request id" } },
      required: ["id"],
    },
  },
  {
    name: "list_open",
    description: "Open request ids with owner and due date.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_owner",
    description: "Assign an owner code to a request id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        owner: { type: "string" },
      },
      required: ["id", "owner"],
    },
  },
];

function text(obj) {
  const speech = obj.speech || JSON.stringify(obj);
  return { content: [{ type: "text", text: speech }], structuredContent: obj };
}

export function callTool(name, args = {}) {
  if (name === "get_status") {
    const row = getStatus(args.id);
    return text({ row, speech: speakStatus(row) });
  }
  if (name === "list_open") {
    const rows = listOpen();
    return text({ rows, speech: `${rows.length} open requests.` });
  }
  if (name === "set_owner") {
    const row = setOwner(args.id, args.owner);
    return text({ row, speech: speakStatus(row) });
  }
  return { isError: true, content: [{ type: "text", text: "unknown_tool" }] };
}

export function handleRpc(payload) {
  if (!payload || typeof payload !== "object") {
    return { jsonrpc: "2.0", error: { code: -32700, message: "parse error" } };
  }
  const { id, method, params } = payload;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "msh-status", version: "0.1.0" },
      },
    };
  }
  if (method === "notifications/initialized") {
    return null;
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    return { jsonrpc: "2.0", id, result: callTool(name, args) };
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "method not found" },
  };
}

export function isRpc(payload) {
  return payload && payload.jsonrpc === "2.0" && payload.method;
}
