"use strict";

// Shared Zoho helpers for Netlify Functions.
// Region: India by default (.in). Override the *_BASE env vars only if needed.

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
  return env("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in").replace(/\/$/, "");
}

function apiDomain() {
  return env("ZOHO_API_DOMAIN", "https://www.zohoapis.in").replace(/\/$/, "");
}

function mailBase() {
  return env("ZOHO_MAIL_API_BASE", "https://mail.zoho.in").replace(/\/$/, "");
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
  const u = new URL(`${accountsUrl()}/oauth/v2/token`);
  u.searchParams.set("refresh_token", process.env.ZOHO_REFRESH_TOKEN);
  u.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID);
  u.searchParams.set("client_secret", process.env.ZOHO_CLIENT_SECRET);
  u.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(u.toString(), { method: "POST" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const err = new Error(`Zoho refresh failed: ${data.error || res.status} ${data.error_description || text}`);
    err.statusCode = 401;
    err.details = data;
    throw err;
  }
  return data.access_token;
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
  const u = new URL(`${mailBase()}/api/accounts/${accountId}/messages/attachments`);
  u.searchParams.set("fileName", fileName);
  u.searchParams.set("isInline", "false");

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": mimeType,
      ...authHeader(token),
    },
    body: buffer,
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

function workdriveUploadUrl({ fileName, folderId, mimeType, override = true }) {
  const u = new URL(`${apiDomain()}/workdrive/api/v1/upload`);
  u.searchParams.set("filename", fileName);
  u.searchParams.set("parent_id", folderId);
  u.searchParams.set("override-name-exist", override ? "true" : "false");
  u.searchParams.set("type", mimeType);
  return u.toString();
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
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append("content", blob, fileName);

  const res = await fetch(workdriveUploadUrl({ fileName, folderId, mimeType, override }), {
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
};
