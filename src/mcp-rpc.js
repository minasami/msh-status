import { getStatus, listOpen, setOwner, setStatus, getMine } from "./store.js";
import { speakStatus, speakMine } from "./speak.js";
import { CODE, fail, cleanId, cleanOwner } from "./errors.js";

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
    name: "get_mine",
    description: "Latest open request for the signed-in account. Say the number if more than one. No patient name.",
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
  {
    name: "set_status",
    description: "Set request status to open or closed.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["open", "closed"] },
      },
      required: ["id", "status"],
    },
  },
];

function text(obj) {
  const speech = obj.speech || JSON.stringify(obj);
  return { content: [{ type: "text", text: speech }], structuredContent: obj };
}

export async function callTool(name, args = {}, ctx = {}) {
  try {
    if (name === "get_status") {
      const parsed = cleanId(args.id);
      if (parsed.error === "need_id") return fail(CODE.NEED_ID, "Which request number?");
      if (parsed.error) return fail(CODE.INVALID, "That is not a request number.");
      const row = await getStatus(parsed.id);
      if (!row) return fail(CODE.NOT_FOUND, "Request not found.");
      return text({ row, speech: speakStatus(row) });
    }
    if (name === "get_mine") {
      const result = await getMine(args.sub || ctx.sub);
      if (result.kind === "need_account") {
        return fail(CODE.NEED_ACCOUNT, speakMine(result), { result });
      }
      return text({ result, speech: speakMine(result) });
    }
    if (name === "list_open") {
      const rows = await listOpen();
      return text({ rows, speech: `${rows.length} open requests.` });
    }
    if (name === "set_owner") {
      const parsed = cleanId(args.id);
      if (parsed.error === "need_id") return fail(CODE.NEED_ID, "Which request number?");
      if (parsed.error) return fail(CODE.INVALID, "That is not a request number.");
      const who = cleanOwner(args.owner);
      if (who.error) return fail(CODE.INVALID, "Which owner?");
      const row = await setOwner(parsed.id, who.owner, ctx.sub);
      if (!row) return fail(CODE.NOT_FOUND, "Request not found.");
      return text({ row, speech: speakStatus(row) });
    }
    if (name === "set_status") {
      const parsed = cleanId(args.id);
      if (parsed.error === "need_id") return fail(CODE.NEED_ID, "Which request number?");
      if (parsed.error) return fail(CODE.INVALID, "That is not a request number.");
      const next = String(args.status || "").toLowerCase();
      if (next !== "open" && next !== "closed") {
        return fail(CODE.INVALID, "Status must be open or closed.");
      }
      const row = await setStatus(parsed.id, next, ctx.sub);
      if (!row) return fail(CODE.NOT_FOUND, "Request not found.");
      if (row.error) return fail(CODE.INVALID, "Status must be open or closed.");
      return text({ row, speech: speakStatus(row) });
    }
    return fail(CODE.UNKNOWN_TOOL, "I can only read request status.");
  } catch (err) {
    return fail(CODE.INTERNAL, "Something went wrong. Try the number again.", {
      name: "internal",
    });
  }
}

export async function handleRpc(payload, ctx = {}) {
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
    if (!name) {
      return { jsonrpc: "2.0", id, error: { code: CODE.INVALID, message: "missing tool name" } };
    }
    const args = (params && params.arguments) || {};
    const result = await callTool(name, args, ctx);
    if (result && result.isError && result.code <= -32600 && result.code >= -32768 && !result.structuredContent) {
      return { jsonrpc: "2.0", id, error: { code: result.code, message: result.speech } };
    }
    return { jsonrpc: "2.0", id, result };
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
