"use strict";
const z = require("./_zoho");

const DATA_FILE = "orion-quotations-data.json";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  if (event.httpMethod !== "POST") return z.json(405, { error: "Method not allowed" });
  try {
    z.requireEnv(["ZOHO_WORKDRIVE_DATA_FOLDER_ID"]);
    const body = JSON.parse(event.body || "{}");
    const payload = {
      savedAt: new Date().toISOString(),
      quotes: Array.isArray(body.quotes) ? body.quotes : [],
    };
    const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const uploaded = await z.uploadWorkDriveBuffer({
      folderId: process.env.ZOHO_WORKDRIVE_DATA_FOLDER_ID,
      fileName: DATA_FILE,
      buffer,
      mimeType: "application/json",
      override: true,
    });
    return z.json(200, {
      saved: true,
      fileName: DATA_FILE,
      fileId: uploaded.id,
      link: uploaded.link,
      savedAt: payload.savedAt,
      raw: uploaded.raw,
    });
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
