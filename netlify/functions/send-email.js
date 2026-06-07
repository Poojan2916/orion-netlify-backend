"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  if (event.httpMethod !== "POST") return z.json(405, { error: "Method not allowed" });
  try {
    z.requireEnv(["SEND_AS"]);
    const body = JSON.parse(event.body || "{}");
    const { to, subject, fileName, externalPdfBase64 } = body;
    if (!to) return z.json(400, { error: "Recipient email is required." });
    if (!externalPdfBase64) return z.json(400, { error: "Customer PDF is required." });

    const result = await z.sendCustomerEmail({
      to,
      subject: subject || "Quotation from Orion Flexipack",
      body: body.body || "Please find attached your quotation from Orion Flexipack.",
      fileName: fileName || "Orion_Quotation.pdf",
      base64: externalPdfBase64,
    });

    return z.json(200, {
      sent: true,
      accountId: result.accountId,
      zohoResponse: result.result,
      sentAt: new Date().toISOString(),
    });
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
