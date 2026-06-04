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
    const {
      externalFileName,
      internalFileName,
      externalPdfBase64,
      internalPdfBase64,
    } = body;

    if (!externalPdfBase64 || !internalPdfBase64) {
      return g.json(400, { error: "Both PDF payloads are required." });
    }

    const { drive, externalId, internalId } = await g.ensureFolderTree(auth);

    const external = await g.uploadPdf(
      drive,
      externalId,
      externalFileName || "Customer Copy - External.pdf",
      externalPdfBase64
    );

    const internal = await g.uploadPdf(
      drive,
      internalId,
      internalFileName || "Company Copy - Internal.pdf",
      internalPdfBase64
    );

    return g.json(200, {
      externalDriveLink: external.link,
      internalDriveLink: internal.link,
      externalFileId: external.id,
      internalFileId: internal.id,
      savedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e.message === "NOT_CONNECTED") {
      return g.json(401, { error: "Not connected. Visit /.netlify/functions/auth-google first, then add GOOGLE_REFRESH_TOKEN in Netlify." });
    }
    console.error(e);
    return g.json(500, { error: e.message });
  }
};
