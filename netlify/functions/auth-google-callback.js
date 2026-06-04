"use strict";

const g = require("./_google");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

exports.handler = async (event) => {
  const options = g.handleOptions(event);
  if (options) return options;

  try {
    const code = event.queryStringParameters && event.queryStringParameters.code;
    if (!code) return g.html(400, "<h2>Missing Google OAuth code.</h2>");

    const tokens = await g.exchangeCode(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return g.html(
        200,
        `<h2>Google connected, but no refresh token was returned.</h2>
         <p>This usually happens if the app was already approved earlier. Re-open the auth URL, or remove this app's access from your Google Account and approve again.</p>
         <p>Auth URL: <code>/.netlify/functions/auth-google</code></p>`
      );
    }

    return g.html(
      200,
      `<h2>Connected to Google Workspace.</h2>
       <p>Copy this refresh token into Netlify environment variables as <strong>GOOGLE_REFRESH_TOKEN</strong>, then redeploy.</p>
       <textarea readonly style="width:100%;min-height:140px;font-family:monospace;">${escapeHtml(refreshToken)}</textarea>
       <p><strong>Important:</strong> treat this like a password. Do not commit it to GitHub and do not paste it into frontend code.</p>`
    );
  } catch (e) {
    console.error(e);
    return g.html(500, `<h2>OAuth error</h2><pre>${escapeHtml(e.message)}</pre>`);
  }
};
