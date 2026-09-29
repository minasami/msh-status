export const CODE = {
  PARSE: -32700,
  INVALID: -32602,
  NOT_FOUND: -32001,
  NEED_ACCOUNT: -32002,
  NEED_ID: -32003,
  UNKNOWN_TOOL: -32601,
  INTERNAL: -32603,
};

export function fail(code, message, extra = {}) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: extra.name || "error", message, ...extra },
    speech: message,
    code,
  };
}

export function cleanId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { error: "need_id" };
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(s)) return { error: "bad_id" };
  return { id: s };
}

export function cleanOwner(raw) {
  const s = String(raw ?? "").trim().slice(0, 40);
  if (!s) return { error: "need_owner" };
  return { owner: s };
}
