"use strict";
const z = require("./_zoho");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  if (event.httpMethod !== "POST") return z.json(405, { error: "Method not allowed" });
  try {
    z.requireEnv(["ZOHO_WORKDRIVE_EXTERNAL_FOLDER_ID", "ZOHO_WORKDRIVE_INTERNAL_FOLDER_ID"]);
    const body = JSON.parse(event.body || "{}");
    const { externalFileName, internalFileName, externalPdfBase64, internalPdfBase64 } = body;
    if (!externalPdfBase64 || !internalPdfBase64) {
      return z.json(400, { error: "Both PDF payloads are required." });
    }

    const external = await z.uploadWorkDriveBase64({
      folderId: process.env.ZOHO_WORKDRIVE_EXTERNAL_FOLDER_ID,
      fileName: externalFileName || "Customer_Copy_External.pdf",
      base64: externalPdfBase64,
      mimeType: "application/pdf",
      override: false,
    });
    const internal = await z.uploadWorkDriveBase64({
      folderId: process.env.ZOHO_WORKDRIVE_INTERNAL_FOLDER_ID,
      fileName: internalFileName || "Company_Copy_Internal.pdf",
      base64: internalPdfBase64,
      mimeType: "application/pdf",
      override: false,
    });

    return z.json(200, {
      externalDriveLink: external.link,
      internalDriveLink: internal.link,
      externalFileId: external.id,
      internalFileId: internal.id,
      externalRaw: external.raw,
      internalRaw: internal.raw,
      savedAt: new Date().toISOString(),
    });
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
