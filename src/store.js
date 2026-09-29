/** Mock file. Optional JSON persist via STORE_PATH. Week 2: Appwrite / Supabase. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { audit } from "./audit.js";

const SEED = [
  ["4821", { id: "4821", status: "open", owner: "mina", requester: "mina", due: "2026-09-30" }],
  ["4822", { id: "4822", status: "closed", owner: "nour", requester: "nour", due: "2026-09-20" }],
  ["4823", { id: "4823", status: "open", owner: null, requester: "guest", due: "2026-10-03" }],
];

const rows = new Map(SEED.map(([k, v]) => [k, { ...v }]));

const persistOn = process.env.MSH_NO_PERSIST !== "1";
const storePath = process.env.STORE_PATH || new URL("../data/store.json", import.meta.url).pathname;

function load() {
  if (!persistOn) return;
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf8"));
    if (!Array.isArray(raw)) return;
    rows.clear();
    for (const row of raw) {
      if (row && row.id) rows.set(String(row.id), row);
    }
  } catch {
    /* first run or read-only host */
  }
}

function save() {
  if (!persistOn) return;
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify([...rows.values()], null, 2));
  } catch {
    /* Vercel /tmp or read-only — memory only */
  }
}

load();

export function getStatus(id) {
  const row = rows.get(String(id));
  if (!row) return null;
  return { id: row.id, status: row.status, owner: row.owner || "unassigned", due: row.due };
}

export function listOpen() {
  return [...rows.values()]
    .filter((r) => r.status === "open")
    .map((r) => ({ id: r.id, owner: r.owner || "unassigned", due: r.due }));
}

export function setOwner(id, owner, actor) {
  const row = rows.get(String(id));
  if (!row) return null;
  const before = row.owner;
  row.owner = String(owner || "").slice(0, 40);
  save();
  audit({ action: "set_owner", id: row.id, from: before, to: row.owner, actor: actor || "unknown" });
  return getStatus(id);
}

export function setStatus(id, status, actor) {
  const row = rows.get(String(id));
  if (!row) return null;
  const next = String(status || "").toLowerCase();
  if (next !== "open" && next !== "closed") return { error: "bad_status" };
  const before = row.status;
  row.status = next;
  save();
  audit({ action: "set_status", id: row.id, from: before, to: next, actor: actor || "unknown" });
  return getStatus(id);
}

export function getMine(sub) {
  const who = String(sub || "").replace(/^client:/, "").toLowerCase();
  if (!who || who === "static") {
    return { kind: "need_account" };
  }
  const mine = [...rows.values()].filter(
    (r) => r.status === "open" && String(r.requester || "").toLowerCase() === who
  );
  if (mine.length === 0) return { kind: "none" };
  if (mine.length > 1) {
    return { kind: "many", ids: mine.map((r) => r.id) };
  }
  return { kind: "one", row: getStatus(mine[0].id) };
}
