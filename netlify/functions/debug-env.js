"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  return z.json(200, {
    ZOHO_CLIENT_ID_START: process.env.ZOHO_CLIENT_ID ? process.env.ZOHO_CLIENT_ID.slice(0, 18) : null,
    ZOHO_REDIRECT_URI: process.env.ZOHO_REDIRECT_URI || null,
    ZOHO_ACCOUNTS_URL: process.env.ZOHO_ACCOUNTS_URL || null,
    ZOHO_API_DOMAIN: process.env.ZOHO_API_DOMAIN || null,
    ZOHO_MAIL_API_BASE: process.env.ZOHO_MAIL_API_BASE || "https://mail.zoho.in",
    SEND_AS: process.env.SEND_AS || null,
    CORS_ORIGIN: process.env.CORS_ORIGIN || null,
    HAS_ZOHO_REFRESH_TOKEN: Boolean(process.env.ZOHO_REFRESH_TOKEN),
    HAS_ZOHO_CLIENT_SECRET: Boolean(process.env.ZOHO_CLIENT_SECRET),
  });
};
