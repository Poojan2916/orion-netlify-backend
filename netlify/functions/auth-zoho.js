"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  try {
    return {
      statusCode: 302,
      headers: { ...z.corsHeaders(), Location: z.authUrl() },
      body: "Redirecting to Zoho...",
    };
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
