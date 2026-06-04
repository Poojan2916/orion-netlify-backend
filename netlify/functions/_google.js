"use strict";

const { google } = require("googleapis");

// Least-privilege scopes:
// drive.file  -> create/manage only files this app creates
// gmail.send  -> send mail only; cannot read inbox
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
];

const ROOT = "Orion Quotations Invoices";
const FOLDER_EXTERNAL = "Customer Copy - External";
const FOLDER_INTERNAL = "Company Copy - Internal";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function oauthClient() {
  return new google.auth.OAuth2(
    requiredEnv("GOOGLE_CLIENT_ID"),
    requiredEnv("GOOGLE_CLIENT_SECRET"),
    requiredEnv("GOOGLE_REDIRECT_URI")
  );
}

function authUrl() {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function exchangeCode(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function isConnected() {
  return Boolean(process.env.GOOGLE_REFRESH_TOKEN);
}

function authorized() {
  if (!isConnected()) throw new Error("NOT_CONNECTED");
  const client = oauthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function escapeDriveQueryName(name) {
  return String(name).replace(/'/g, "\\'");
}

async function findOrCreateFolder(drive, name, parentId) {
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${escapeDriveQueryName(name)}'`,
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (existing.data.files && existing.data.files.length) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  return created.data.id;
}

async function ensureFolderTree(auth) {
  const drive = google.drive({ version: "v3", auth });
  const rootId = await findOrCreateFolder(drive, ROOT, null);
  const externalId = await findOrCreateFolder(drive, FOLDER_EXTERNAL, rootId);
  const internalId = await findOrCreateFolder(drive, FOLDER_INTERNAL, rootId);
  return { drive, rootId, externalId, internalId };
}

async function uploadPdf(drive, folderId, fileName, base64) {
  const { Readable } = require("stream");
  if (!fileName) throw new Error("PDF file name is required.");
  if (!base64) throw new Error("PDF base64 payload is required.");

  const cleanedBase64 = String(base64).replace(/^data:application\/pdf;base64,/, "");
  const buffer = Buffer.from(cleanedBase64, "base64");

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });

  return { id: created.data.id, link: created.data.webViewLink };
}

function encodeHeader(value) {
  const text = String(value || "");
  // RFC 2047 UTF-8 subject support
  return /[^\x00-\x7F]/.test(text)
    ? `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`
    : text;
}

function buildRawEmail({ from, to, subject, body, attachment }) {
  const boundary = "orion_" + Date.now();
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body || "",
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachment.fileName}"`,
    "",
    attachment.base64,
    "",
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendCustomerEmail(auth, { to, subject, body, fileName, base64 }) {
  const gmail = google.gmail({ version: "v1", auth });
  const cleanedBase64 = String(base64 || "").replace(/^data:application\/pdf;base64,/, "");
  const raw = buildRawEmail({
    from: requiredEnv("SEND_AS"),
    to,
    subject,
    body,
    attachment: { fileName, base64: cleanedBase64 },
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return res.data;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
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

function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
}

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }
  return null;
}

module.exports = {
  SCOPES,
  ROOT,
  FOLDER_EXTERNAL,
  FOLDER_INTERNAL,
  authUrl,
  exchangeCode,
  isConnected,
  authorized,
  ensureFolderTree,
  uploadPdf,
  sendCustomerEmail,
  json,
  html,
  parseJsonBody,
  handleOptions,
  corsHeaders,
};
