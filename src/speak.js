/** One sentence a voice client can read. No PHI. */
export function speakStatus(row) {
  if (!row) return "Request not found.";
  return `Request ${row.id} is ${row.status}. Owner ${row.owner}. Due ${row.due}.`;
}
