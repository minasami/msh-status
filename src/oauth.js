/**
 * In-memory OAuth 2.0 authorization-code + PKCE.
 * Cold start wipes tokens — fine for a hackathon demo, not a bank.
 */
import crypto from "node:crypto";

const clients = {
  [process.env.OAUTH_CLIENT_ID || "msh-status-demo"]: {
    secret: process.env.OAUTH_CLIENT_SECRET || "change-me",
    redirects: (process.env.OAUTH_REDIRECT_URI || "http://127.0.0.1:3000/callback").split(","),
  },
};

const codes = new Map();
const tokens = new Map();

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function verifyPkce(verifier, challenge) {
  const digest = b64url(crypto.createHash("sha256").update(verifier).digest());
  return digest === challenge;
}

export function issueCode({ clientId, redirectUri, codeChallenge, sub }) {
  const client = clients[clientId];
  if (!client) return { error: "invalid_client" };
  if (!client.redirects.includes(redirectUri)) return { error: "invalid_redirect" };
  if (!codeChallenge) return { error: "invalid_request" };
  const code = b64url(crypto.randomBytes(24));
  codes.set(code, {
    clientId,
    redirect: redirectUri,
    challenge: codeChallenge,
    sub,
    exp: Date.now() + 5 * 60 * 1000,
  });
  return { code };
}

export function exchangeCode({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  const client = clients[clientId];
  if (!client || client.secret !== clientSecret) return { error: "invalid_client" };
  const row = codes.get(code);
  if (!row || row.exp < Date.now()) return { error: "invalid_grant" };
  if (row.clientId !== clientId || row.redirect !== redirectUri) return { error: "invalid_grant" };
  if (!verifyPkce(codeVerifier, row.challenge)) return { error: "invalid_grant" };
  codes.delete(code);
  const access = b64url(crypto.randomBytes(32));
  tokens.set(access, { sub: row.sub, clientId, exp: Date.now() + 60 * 60 * 1000 });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "msh.status",
  };
}

export function clientCredentials({ clientId, clientSecret }) {
  const client = clients[clientId];
  if (!client || client.secret !== clientSecret) return { error: "invalid_client" };
  const access = b64url(crypto.randomBytes(32));
  tokens.set(access, { sub: "client:" + clientId, clientId, exp: Date.now() + 60 * 60 * 1000 });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "msh.status",
  };
}

export function readAccess(token) {
  const row = tokens.get(token);
  if (!row || row.exp < Date.now()) return null;
  return row;
}

export function isAllowedBearer(header) {
  if (!header || !header.startsWith("Bearer ")) return false;
  const raw = header.slice(7);
  if (process.env.MSH_MCP_TOKEN && raw === process.env.MSH_MCP_TOKEN) return { sub: "static" };
  return readAccess(raw);
}

export { clients };
