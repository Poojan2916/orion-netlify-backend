"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  try {
    const accounts = await z.getMailAccounts();
    return z.json(200, accounts);
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
