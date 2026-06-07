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
    const messageBody = firstNonEmpty(body.body, "Please find your quotation from Orion.");
    const workDriveLink = firstNonEmpty(
      body.externalWorkDriveLink,
      body.externalDriveLink,
      body.workDriveLink,
      body.pdfLink,
      body.link
    );

    if (!to) {
      return z.json(400, { error: "Recipient email is required." });
    }

    // Stable production behavior:
    // - If WorkDrive link is present, email the link.
    // - Attachment sending is disabled by default because Zoho Mail attachment API was returning 500/415.
    // - To explicitly retry attachment sending later, set ZOHO_EMAIL_USE_ATTACHMENT=true.
    const result = await z.sendCustomerEmail({
      to,
      subject,
      body: messageBody,
      fileName: firstNonEmpty(body.fileName, "Orion_Quotation.pdf"),
      base64: body.externalPdfBase64 || body.pdfBase64 || "",
      workDriveLink,
    });

    return z.json(200, {
      sent: true,
      from: process.env.SEND_AS,
      to,
      accountId: result.accountId,
      mode: result.mode,
      workDriveLink: workDriveLink || null,
      attachmentError: result.attachmentError || undefined,
      zohoResponse: result.result,
      sentAt: new Date().toISOString(),
    });
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
