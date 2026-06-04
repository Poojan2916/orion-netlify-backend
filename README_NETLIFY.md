# Orion Google Workspace Backend on Netlify Functions

This replaces the old Express `server.js` backend with Netlify Functions.

## Production URLs

Frontend:

```txt
https://orion-quotation.netlify.app
```

Backend functions:

```txt
https://orion-quotation.netlify.app/.netlify/functions/auth-google
https://orion-quotation.netlify.app/.netlify/functions/auth-google-callback
https://orion-quotation.netlify.app/.netlify/functions/status
https://orion-quotation.netlify.app/.netlify/functions/finalize
https://orion-quotation.netlify.app/.netlify/functions/send-email
```

## Google Cloud Console

Authorized JavaScript origin:

```txt
https://orion-quotation.netlify.app
```

Authorized redirect URI:

```txt
https://orion-quotation.netlify.app/.netlify/functions/auth-google-callback
```

## Netlify Environment Variables

Add these in Netlify → Site configuration → Environment variables:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://orion-quotation.netlify.app/.netlify/functions/auth-google-callback
SEND_AS=psp@orionflexipack.com
CORS_ORIGIN=https://orion-quotation.netlify.app
```

Deploy once, then open:

```txt
https://orion-quotation.netlify.app/.netlify/functions/auth-google
```

Approve with the Orion Google Workspace email. The callback page will show a refresh token.
Copy it into Netlify as:

```env
GOOGLE_REFRESH_TOKEN=the-refresh-token-from-callback
```

Redeploy again.

## Check connection

Open:

```txt
https://orion-quotation.netlify.app/.netlify/functions/status
```

Expected:

```json
{
  "connected": true,
  "missing": []
}
```

## Frontend wiring

Change your frontend API value from:

```js
const ORION_API = "http://localhost:4000";
```

to:

```js
const ORION_API = "/.netlify/functions";
```

Then call:

```js
fetch(`${ORION_API}/finalize`, ...)
fetch(`${ORION_API}/send-email`, ...)
```

The send-email function rejects `internalPdfBase64`, so the company/internal copy cannot be emailed from that endpoint.
