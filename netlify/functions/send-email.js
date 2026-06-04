"use strict";

const g = require("./_google");

exports.handler = async (event) => {
  const options = g.handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== "POST") {
    return g.json(405, { error: "Method not allowed. Use POST." });
  }

  try {
    const auth = g.authorized();
    const body = g.parseJsonBody(event);
    const { to, subject, fileName, externalPdfBase64 } = body;
    const emailBody = body.body || "";

    // Security guard: the internal copy must never be sent by this endpoint.
    if (Object.prototype.hasOwnProperty.call(body, "internalPdfBase64")) {
      return g.json(400, { error: "Internal PDF is not accepted by this endpoint." });
    }

    if (!to) return g.json(400, { error: "Recipient email is required." });
    if (!externalPdfBase64) return g.json(400, { error: "Customer PDF is required." });

    const result = await g.sendCustomerEmail(auth, {
      to,
      subject: subject || "Orion Quotation",
      body: emailBody,
      fileName: fileName || "Orion Quotation.pdf",
      base64: externalPdfBase64,
    });

    return g.json(200, {
      sent: true,
      messageId: result.id,
      sentAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e.message === "NOT_CONNECTED") {
      return g.json(401, { error: "Not connected. Visit /.netlify/functions/auth-google first, then add GOOGLE_REFRESH_TOKEN in Netlify." });
    }
    console.error(e);
    return g.json(500, { error: e.message });
  }
};
