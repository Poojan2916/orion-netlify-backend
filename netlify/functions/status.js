"use strict";

const g = require("./_google");

exports.handler = async (event) => {
  const options = g.handleOptions(event);
  if (options) return options;

  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "SEND_AS",
    "GOOGLE_REFRESH_TOKEN",
  ];
  const missing = required.filter((key) => !process.env[key]);

  return g.json(200, {
    connected: missing.length === 0,
    missing,
  });
};
