"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  const required = [
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    "ZOHO_REDIRECT_URI",
    "ZOHO_REFRESH_TOKEN",
    "SEND_AS",
    "CORS_ORIGIN",
  ];
  const optional = [
    "ZOHO_MAIL_ACCOUNT_ID",
    "ZOHO_WORKDRIVE_EXTERNAL_FOLDER_ID",
    "ZOHO_WORKDRIVE_INTERNAL_FOLDER_ID",
    "ZOHO_WORKDRIVE_DATA_FOLDER_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return z.json(200, {
    connected: missing.length === 0,
    missing,
    optionalMissing: optional.filter((k) => !process.env[k]),
    accountsUrl: z.accountsUrl(),
    apiDomain: z.apiDomain(),
    mailBase: z.mailBase(),
    redirectUri: z.redirectUri(),
    scopes: z.SCOPES,
  });
};
