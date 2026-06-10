"use strict";

const z = require("./_zoho");

function cleanEmail(value) {
  return String(value || "").trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = String(value || "").trim();
    if (s) return s;
  }
  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  if (event.httpMethod !== "POST") return z.json(405, { error: "Method not allowed" });

  try {
    z.requireEnv(["SEND_AS", "ZOHO_MAIL_API_BASE", "ZOHO_MAIL_ACCOUNT_ID"]);

    const body = JSON.parse(event.body || "{}");
    const to = cleanEmail(body.to);
    const subject = firstNonEmpty(body.subject, "Quotation from Orion");
    const messageBody = firstNonEmpty(body.body, "Please find attached your quotation from Orion.");
    const fileName = firstNonEmpty(body.fileName, "Orion_Quotation.pdf");
    const base64 = firstNonEmpty(body.externalPdfBase64, body.pdfBase64, body.base64);

    if (!to) {
      return z.json(400, { error: "Recipient email is required." });
    }

    if (!base64) {
      return z.json(400, {
        error: "Customer PDF is required. The frontend must send externalPdfBase64 to /send-email.",
      });
    }

    const result = await z.sendCustomerEmail({
      to,
      subject,
      body: messageBody,
      fileName,
      base64,
    });

    return z.json(200, {
      sent: true,
      from: process.env.SEND_AS,
      to,
      accountId: result.accountId,
      mode: "attachment",
      fileName,
      sentAt: new Date().toISOString(),
      zoho: result.result,
    });
  } catch (err) {
    return z.json(err.statusCode || 500, {
      error: err.message || "Send email failed",
      details: err.details || null,
    });
  }
};
