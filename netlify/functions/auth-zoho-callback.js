"use strict";
const z = require("./_zoho");

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return z.options();
  try {
    const code = event.queryStringParameters?.code;
    if (!code) return z.html(400, "<h2>Missing Zoho OAuth code.</h2><p>Open <code>/.netlify/functions/auth-zoho</code>, not this callback URL directly.</p>");
    const tokens = await z.exchangeCode(code);
    const refresh = tokens.refresh_token || "";
    return z.html(200, `
      <html><body style="font-family:system-ui;padding:24px;max-width:900px">
        <h2>Zoho connected successfully.</h2>
        ${refresh ? `<p>Copy this value into Netlify environment variables:</p>
        <textarea style="width:100%;height:120px;font-family:monospace">ZOHO_REFRESH_TOKEN=${esc(refresh)}</textarea>` : `<p><b>No refresh_token returned.</b> Re-open auth with prompt=consent, or revoke the app in Zoho and try again.</p>`}
        <p>API domain returned by Zoho: <code>${esc(tokens.api_domain)}</code></p>
        <p>After saving <code>ZOHO_REFRESH_TOKEN</code> in Netlify, redeploy and open <code>/.netlify/functions/status</code>.</p>
      </body></html>
    `);
  } catch (e) {
    return z.html(e.statusCode || 500, `<h2>Zoho OAuth error</h2><pre>${esc(JSON.stringify(z.safeError(e), null, 2))}</pre>`);
  }
};
