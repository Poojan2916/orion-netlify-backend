"use strict";
const z = require("./_zoho");

const DATA_FILE = "orion-quotations-data.json";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  try {
    z.requireEnv(["ZOHO_WORKDRIVE_DATA_FOLDER_ID"]);
    const item = await z.findWorkDriveFileByName(process.env.ZOHO_WORKDRIVE_DATA_FOLDER_ID, DATA_FILE);
    if (!item) return z.json(200, { found: false, quotes: null, savedAt: null });
    const fileId = item.id || item.attributes?.resource_id || item.attributes?.id;
    const text = await z.downloadWorkDriveFile(fileId);
    const data = JSON.parse(text || "{}");
    return z.json(200, {
      found: true,
      savedAt: data.savedAt || null,
      quotes: Array.isArray(data.quotes) ? data.quotes : [],
      fileId,
    });
  } catch (e) {
    return z.json(e.statusCode || 500, z.safeError(e));
  }
};
