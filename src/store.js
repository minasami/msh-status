/** Mock file. Replace get/set with Appwrite or Supabase in week 2. */
const rows = new Map([
  ["4821", { id: "4821", status: "open", owner: "mina", due: "2026-09-30" }],
  ["4822", { id: "4822", status: "closed", owner: "nour", due: "2026-09-20" }],
  ["4823", { id: "4823", status: "open", owner: null, due: "2026-10-03" }],
]);

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

export function setOwner(id, owner) {
  const row = rows.get(String(id));
  if (!row) return null;
  row.owner = String(owner || "").slice(0, 40);
  return getStatus(id);
}
