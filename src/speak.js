/** One sentence a voice client can read. No PHI. */
export function speakStatus(row) {
  if (!row) return "Request not found.";
  return `Request ${row.id} is ${row.status}. Owner ${row.owner}. Due ${row.due}.`;
}

export function speakMine(result) {
  if (!result || result.kind === "need_account") {
    return "Sign in, or say the request number.";
  }
  if (result.kind === "none") return "You have no open request.";
  if (result.kind === "many") {
    return `You have ${result.ids.length} open. Say the number. ${result.ids.join(", ")}.`;
  }
  if (result.kind === "one") {
    const row = result.row;
    return `Your open request ${row.id} is ${row.status}. Owner ${row.owner}. Due ${row.due}.`;
  }
  return "Request not found.";
}
