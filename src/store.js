/** Rows: id, status, owner, requester, due. No patient names.
 * Memory Map by default. DynamoDB when TABLE_NAME is set (Lambda). */
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
const TABLE = process.env.TABLE_NAME || "";

let ddb = null;

async function client() {
  if (!TABLE) return null;
  if (ddb) return ddb;
  try {
    const { DynamoDBClient, GetItemCommand, UpdateItemCommand, QueryCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    ddb = {
      raw: new DynamoDBClient({}),
      GetItemCommand,
      UpdateItemCommand,
      QueryCommand,
    };
    return ddb;
  } catch {
    return null;
  }
}

function publicRow(row) {
  if (!row) return null;
  return { id: row.id, status: row.status, owner: row.owner || "unassigned", due: row.due };
}

function fromItem(item) {
  if (!item || !item.id || !item.id.S) return null;
  return {
    id: item.id.S,
    status: item.status?.S || "open",
    owner: item.owner?.S || "",
    requester: item.requester?.S || "",
    due: item.due?.S || "",
  };
}

function load() {
  if (!persistOn || TABLE) return;
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf8"));
    if (!Array.isArray(raw)) return;
    rows.clear();
    for (const row of raw) {
      if (row && row.id) rows.set(String(row.id), row);
    }
  } catch {
    /* first run */
  }
}

function save() {
  if (!persistOn || TABLE) return;
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify([...rows.values()], null, 2));
  } catch {
    /* read-only host */
  }
}

load();

export async function getStatus(id) {
  const key = String(id);
  const api = await client();
  if (api) {
    const out = await api.raw.send(
      new api.GetItemCommand({ TableName: TABLE, Key: { id: { S: key } } })
    );
    return publicRow(fromItem(out.Item));
  }
  return publicRow(rows.get(key));
}

export async function listOpen() {
  const api = await client();
  if (api) {
    const out = await api.raw.send(
      new api.QueryCommand({
        TableName: TABLE,
        IndexName: "gsi_status",
        KeyConditionExpression: "#s = :open",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":open": { S: "open" } },
      })
    );
    return (out.Items || []).map((item) => publicRow(fromItem(item))).filter(Boolean);
  }
  return [...rows.values()]
    .filter((r) => r.status === "open")
    .map((r) => publicRow(r));
}

export async function setOwner(id, owner, actor) {
  const key = String(id);
  const next = String(owner || "").slice(0, 40);
  const api = await client();
  if (api) {
    try {
      const out = await api.raw.send(
        new api.UpdateItemCommand({
          TableName: TABLE,
          Key: { id: { S: key } },
          UpdateExpression: "SET #o = :o",
          ExpressionAttributeNames: { "#o": "owner" },
          ExpressionAttributeValues: { ":o": { S: next } },
          ConditionExpression: "attribute_exists(id)",
          ReturnValues: "ALL_NEW",
        })
      );
      const row = fromItem(out.Attributes);
      audit({ action: "set_owner", id: key, to: next, actor: actor || "unknown" });
      return publicRow(row);
    } catch (err) {
      if (err && err.name === "ConditionalCheckFailedException") return null;
      throw err;
    }
  }
  const row = rows.get(key);
  if (!row) return null;
  const before = row.owner;
  row.owner = next;
  save();
  audit({ action: "set_owner", id: row.id, from: before, to: row.owner, actor: actor || "unknown" });
  return publicRow(row);
}

export async function setStatus(id, status, actor) {
  const key = String(id);
  const next = String(status || "").toLowerCase();
  if (next !== "open" && next !== "closed") return { error: "bad_status" };
  const api = await client();
  if (api) {
    try {
      const out = await api.raw.send(
        new api.UpdateItemCommand({
          TableName: TABLE,
          Key: { id: { S: key } },
          UpdateExpression: "SET #s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: next } },
          ConditionExpression: "attribute_exists(id)",
          ReturnValues: "ALL_NEW",
        })
      );
      const row = fromItem(out.Attributes);
      audit({ action: "set_status", id: key, to: next, actor: actor || "unknown" });
      return publicRow(row);
    } catch (err) {
      if (err && err.name === "ConditionalCheckFailedException") return null;
      throw err;
    }
  }
  const row = rows.get(key);
  if (!row) return null;
  const before = row.status;
  row.status = next;
  save();
  audit({ action: "set_status", id: row.id, from: before, to: next, actor: actor || "unknown" });
  return publicRow(row);
}

export async function getMine(sub) {
  const who = String(sub || "").replace(/^client:/, "").toLowerCase();
  if (!who || who === "static") return { kind: "need_account" };
  const api = await client();
  let mine = [];
  if (api) {
    const out = await api.raw.send(
      new api.QueryCommand({
        TableName: TABLE,
        IndexName: "gsi_requester",
        KeyConditionExpression: "requester = :who AND #s = :open",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":who": { S: who }, ":open": { S: "open" } },
      })
    );
    mine = (out.Items || []).map(fromItem).filter(Boolean);
  } else {
    mine = [...rows.values()].filter(
      (r) => r.status === "open" && String(r.requester || "").toLowerCase() === who
    );
  }
  if (mine.length === 0) return { kind: "none" };
  if (mine.length > 1) return { kind: "many", ids: mine.map((r) => r.id) };
  return { kind: "one", row: publicRow(mine[0]) };
}

export function dynamoEnabled() {
  return Boolean(TABLE);
}
