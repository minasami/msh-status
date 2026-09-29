import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const persistOn = process.env.MSH_NO_PERSIST !== "1";
const auditPath = process.env.AUDIT_PATH || new URL("../data/audit.jsonl", import.meta.url).pathname;

export function audit(event) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...event,
  });
  if (!persistOn) return;
  try {
    mkdirSync(dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, line + "\n");
  } catch {
    /* read-only host */
  }
}
