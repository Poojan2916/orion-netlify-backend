"use strict";

// Shared Zoho helpers for Netlify Functions.
// Region: India by default (.in). Override the *_BASE env vars only if needed.


// Cache the short-lived access token inside the warm Netlify function runtime.
// This reduces calls to Zoho's /oauth/v2/token endpoint and prevents rate-limit errors.
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
const TOKEN_SAFETY_WINDOW_MS = 60 * 1000;

function cleanRefreshToken(value) {
  return String(value || "")
    .trim()
    .replace(/^ZOHO_REFRESH_TOKEN\s*=\s*/i, "")
    .replace(/^['"]|['"]$/g, "");
}


function normalizeBaseUrl(value, fallback) {
  return String(value || fallback || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

function safeFileName(name, fallback = "Orion_Quotation.pdf", maxBase = 80) {
  let raw = String(name || fallback).trim().replace(/^['"]|['"]$/g, "");
  raw = raw.split(/[\\/]/).pop() || fallback;
  raw = raw.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  if (!raw || raw === ".") raw = fallback;

  const m = raw.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  const ext = m ? m[2] : ".pdf";
  let base = m ? m[1] : raw;
  base = base.replace(/^\.+|\.+$/g, "") || "Orion_Quotation";
  if (base.length > maxBase) base = base.slice(0, maxBase);
  return base + ext.toLowerCase();
}
function cleanWorkDriveFolderId(value) {
  let v = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  // If the user pasted a full WorkDrive folder URL, extract only the folder ID.
  const folderMatch = v.match(/\/folders\/([^/?#]+)/i);
  if (folderMatch) v = folderMatch[1];
  // Some WorkDrive URLs end with the folder/resource ID as the last path segment.
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const parts = u.pathname.split("/").filter(Boolean);
      v = parts[parts.length - 1] || v;
    } catch { /* ignore */ }
  }
  v = v.trim();
  if (v.length > 120) {
    throw new Error("WorkDrive folder ID looks too long. Paste only the folder ID from the WorkDrive URL, not the full URL.");
  }
  return v;
}


const SCOPES = [
  "ZohoMail.messages.CREATE",
  "ZohoMail.accounts.READ",
  "WorkDrive.files.CREATE",
  "WorkDrive.files.READ",
  "WorkDrive.files.UPDATE",
  "ZohoFiles.files.READ",
];

function corsHeaders() {
  const origin = process.env.CORS_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body, null, 2),
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/html; charset=utf-8",
    },
    body,
  };
}

function options() {
  return { statusCode: 204, headers: corsHeaders(), body: "" };
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    const err = new Error(`Missing environment variables: ${missing.join(", ")}`);
    err.statusCode = 500;
    throw err;
  }
}

function accountsUrl() {
  return normalizeBaseUrl(env("ZOHO_ACCOUNTS_URL"), "https://accounts.zoho.in");
}

function apiDomain() {
  return normalizeBaseUrl(env("ZOHO_API_DOMAIN"), "https://www.zohoapis.in");
}

function mailBase() {
  // Accept both "https://mail.zoho.in" and a mistaken "https://mail.zoho.in/api".
  // The helper removes a trailing /api so function code can safely append /api/...
  return normalizeBaseUrl(env("ZOHO_MAIL_API_BASE"), "https://mail.zoho.in");
}

function redirectUri() {
  return env("ZOHO_REDIRECT_URI", "https://orionquotes.netlify.app/.netlify/functions/auth-zoho-callback");
}

function authUrl() {
  requireEnv(["ZOHO_CLIENT_ID", "ZOHO_REDIRECT_URI"]);
  const u = new URL(`${accountsUrl()}/oauth/v2/auth`);
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("redirect_uri", redirectUri());
  return u.toString();
}

async function exchangeCode(code) {
  requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REDIRECT_URI"]);
  const u = new URL(`${accountsUrl()}/oauth/v2/token`);
  u.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID);
  u.searchParams.set("client_secret", process.env.ZOHO_CLIENT_SECRET);
  u.searchParams.set("grant_type", "authorization_code");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("code", code);

  const res = await fetch(u.toString(), { method: "POST" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const err = new Error(`Zoho token exchange failed: ${data.error || res.status} ${data.error_description || text}`);
    err.statusCode = 500;
    err.details = data;
    throw err;
  }
  return data;
}

async function accessToken() {
  requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"]);

  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt - TOKEN_SAFETY_WINDOW_MS > now) {
    return cachedAccessToken;
  }

  const refreshToken = cleanRefreshToken(process.env.ZOHO_REFRESH_TOKEN);
  const u = new URL(`${accountsUrl()}/oauth/v2/token`);
  u.searchParams.set("refresh_token", refreshToken);
  u.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID);
  u.searchParams.set("client_secret", process.env.ZOHO_CLIENT_SECRET);
  u.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(u.toString(), { method: "POST" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const lower = text.toLowerCase();
    const isRateLimit = lower.includes("too many requests") || lower.includes("access denied");
    const message = isRateLimit
      ? "Zoho refresh rate limit reached. Stop testing for 30-60 minutes, then retry. The code now caches access tokens to reduce refresh requests."
      : `Zoho refresh failed: ${data.error || res.status} ${data.error_description || text}`;
    const err = new Error(message);
    err.statusCode = isRateLimit ? 429 : 401;
    err.details = data;
    throw err;
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + ((Number(data.expires_in) || 3600) * 1000);
  return cachedAccessToken;
}

function authHeader(token) {
  // Zoho Mail docs use Zoho-oauthtoken. WorkDrive also accepts Zoho OAuth tokens.
  return { Authorization: `Zoho-oauthtoken ${token}` };
}

async function zohoJsonFetch(url, options = {}) {
  const token = await accessToken();
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...authHeader(token),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Zoho API error ${res.status}: ${text}`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function getMailAccounts() {
  return zohoJsonFetch(`${mailBase()}/api/accounts`, { method: "GET" });
}

function accountArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function getMailAccountId() {
  if (process.env.ZOHO_MAIL_ACCOUNT_ID) return process.env.ZOHO_MAIL_ACCOUNT_ID;
  const accounts = accountArray(await getMailAccounts());
  const sendAs = (process.env.SEND_AS || "").toLowerCase();
  const match = accounts.find((a) => {
    const values = [
      a.emailAddress,
      a.primaryEmailAddress,
      a.mailboxAddress,
      a.accountDisplayName,
      a.accountName,
    ].filter(Boolean).map((x) => String(x).toLowerCase());
    return sendAs && values.includes(sendAs);
  }) || accounts[0];
  const id = match?.accountId || match?.id || match?.accountID;
  if (!id) throw new Error("Could not determine Zoho Mail accountId. Set ZOHO_MAIL_ACCOUNT_ID manually or visit /mail-accounts.");
  return String(id);
}

async function uploadMailAttachment({ accountId, fileName, base64, mimeType = "application/pdf" }) {
  const token = await accessToken();
  const buffer = Buffer.from(base64, "base64");
  const finalName = safeFileName(fileName, "Orion_Quotation.pdf", 80);

  // Zoho Mail reliably accepts attachment uploads as multipart/form-data.
  // Do NOT set Content-Type manually; Node/undici adds the required multipart boundary.
  // Official endpoint: /api/accounts/{accountId}/messages/attachments?uploadType=multipart&isInline=false
  const u = new URL(`${mailBase()}/api/accounts/${accountId}/messages/attachments`);
  u.searchParams.set("uploadType", "multipart");
  u.searchParams.set("isInline", "false");

  const form = new FormData();
  form.append("attach", new Blob([buffer], { type: mimeType }), finalName);

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...authHeader(token),
    },
    body: form,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`Zoho Mail attachment upload failed ${res.status}: ${text}`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }

  const attachment = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
  if (!attachment?.storeName || !attachment?.attachmentName || !attachment?.attachmentPath) {
    const err = new Error("Zoho Mail did not return attachment metadata. Check the response in function logs.");
    err.details = data;
    throw err;
  }
  return attachment;
}

async function sendCustomerEmail({ to, subject, body, fileName, base64 }) {
  const accountId = await getMailAccountId();
  const attachment = await uploadMailAttachment({ accountId, fileName, base64 });
  const payload = {
    fromAddress: process.env.SEND_AS,
    toAddress: to,
    subject,
    content: body || "Please find attached your quotation from Orion.",
    mailFormat: "plaintext",
    attachments: [{
      attachmentName: attachment.attachmentName,
      attachmentPath: attachment.attachmentPath,
      storeName: attachment.storeName,
    }],
  };
  const result = await zohoJsonFetch(`${mailBase()}/api/accounts/${accountId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { accountId, result };
}

function workdriveUploadEndpoint() {
  return `${apiDomain()}/workdrive/api/v1/upload`;
}

function extractWorkDriveFileInfo(data) {
  const item = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
  const attrs = item?.attributes || item || {};
  let info = attrs;
  if (typeof attrs["File INFO"] === "string") {
    try { info = { ...attrs, fileInfo: JSON.parse(attrs["File INFO"]) }; } catch { /* ignore */ }
  }
  const id = item?.id || attrs.resource_id || info?.fileInfo?.RESOURCE_ID || info?.RESOURCE_ID || attrs.id;
  const name = attrs.name || info?.fileInfo?.AUDIT_INFO?.resource?.name || info?.name;
  const link = attrs.Permalink || attrs.permalink || attrs.web_url || attrs.download_url || null;
  return { id, name, link, raw: data };
}

async function uploadWorkDriveBuffer({ folderId, fileName, buffer, mimeType = "application/pdf", override = true }) {
  if (!folderId) throw new Error("Missing WorkDrive folder ID.");
  const token = await accessToken();
  const finalName = safeFileName(fileName, "Orion_Quotation.pdf", 80);
  const cleanFolderId = cleanWorkDriveFolderId(folderId);

  const form = new FormData();
  // Zoho WorkDrive upload expects filename, parent_id, override-name-exist, and content
  // as multipart form fields. Putting long values in the query string can trigger F6005.
  form.append("filename", finalName);
  form.append("parent_id", cleanFolderId);
  form.append("override-name-exist", override ? "true" : "false");
  form.append("content", new Blob([buffer], { type: mimeType }), finalName);

  const res = await fetch(workdriveUploadEndpoint(), {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      ...authHeader(token),
    },
    body: form,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Zoho WorkDrive upload failed ${res.status}: ${text}`);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return extractWorkDriveFileInfo(data);
}

async function uploadWorkDriveBase64({ folderId, fileName, base64, mimeType = "application/pdf", override = true }) {
  return uploadWorkDriveBuffer({
    folderId,
    fileName,
    buffer: Buffer.from(base64, "base64"),
    mimeType,
    override,
  });
}

async function listWorkDriveFolder(folderId) {
  if (!folderId) throw new Error("Missing WorkDrive folder ID.");
  const data = await zohoJsonFetch(`${apiDomain()}/workdrive/api/v1/files/${folderId}/files`, {
    method: "GET",
    headers: { Accept: "application/vnd.api+json" },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

async function findWorkDriveFileByName(folderId, fileName) {
  const items = await listWorkDriveFolder(folderId);
  return items.find((item) => {
    const attrs = item.attributes || {};
    return attrs.name === fileName || attrs.display_name === fileName;
  }) || null;
}

async function downloadWorkDriveFile(fileId) {
  if (!fileId) throw new Error("Missing WorkDrive file ID.");
  const token = await accessToken();
  const res = await fetch(`${apiDomain()}/workdrive/api/v1/download/${fileId}`, {
    method: "GET",
    headers: {
      Accept: "application/octet-stream",
      ...authHeader(token),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Zoho WorkDrive download failed ${res.status}: ${text}`);
    err.statusCode = res.status;
    err.details = text;
    throw err;
  }
  return text;
}

function safeError(e) {
  return {
    error: e.message || String(e),
    details: e.details || undefined,
  };
}

module.exports = {
  SCOPES,
  corsHeaders,
  json,
  html,
  options,
  env,
  requireEnv,
  accountsUrl,
  apiDomain,
  mailBase,
  redirectUri,
  authUrl,
  exchangeCode,
  accessToken,
  authHeader,
  zohoJsonFetch,
  getMailAccounts,
  getMailAccountId,
  uploadMailAttachment,
  sendCustomerEmail,
  uploadWorkDriveBase64,
  uploadWorkDriveBuffer,
  listWorkDriveFolder,
  findWorkDriveFileByName,
  downloadWorkDriveFile,
  safeError,
  safeFileName,
  cleanWorkDriveFolderId,
};
