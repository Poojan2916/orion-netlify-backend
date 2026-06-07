# Orion Zoho Backend for Netlify

This replaces the Google backend with Zoho OAuth, Zoho Mail, and Zoho WorkDrive.

## Functions included

- `auth-zoho` — starts Zoho OAuth login.
- `auth-zoho-callback` — exchanges Zoho code and shows `ZOHO_REFRESH_TOKEN`.
- `status` — checks required env variables.
- `mail-accounts` — fetches Zoho Mail account IDs after auth.
- `finalize` — uploads customer/internal PDFs to Zoho WorkDrive folders.
- `send-email` — sends the customer PDF only through Zoho Mail.
- `save-quotes` — saves editable quotation data to WorkDrive as JSON.
- `load-quotes` — loads editable quotation data from WorkDrive JSON.
- `debug-env` — shows non-secret config values for troubleshooting.

## 1. Zoho API Console

Use India console:

```txt
https://api-console.zoho.in
```

Create a **Server-based Application**.

Homepage URL:

```txt
https://orionquotes.netlify.app
```

Authorized Redirect URI:

```txt
https://orionquotes.netlify.app/.netlify/functions/auth-zoho-callback
```

Copy Client ID and Client Secret.

Scopes are not added in the Zoho console. The `auth-zoho` function sends the scopes in the OAuth URL.

## 2. Netlify environment variables

Add these to your backend site `orionquotes`:

```env
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REDIRECT_URI=https://orionquotes.netlify.app/.netlify/functions/auth-zoho-callback
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_API_DOMAIN=https://www.zohoapis.in
ZOHO_MAIL_API_BASE=https://mail.zoho.in
SEND_AS=psp@orionflexipack.com
CORS_ORIGIN=https://orion-quotation.netlify.app
```

Do not add `ZOHO_REFRESH_TOKEN` yet.

Deploy.

## 3. Connect Zoho

Open:

```txt
https://orionquotes.netlify.app/.netlify/functions/auth-zoho
```

Approve access. The callback page will show:

```env
ZOHO_REFRESH_TOKEN=...
```

Add it to Netlify and redeploy.

## 4. Get Zoho Mail account ID

Open:

```txt
https://orionquotes.netlify.app/.netlify/functions/mail-accounts
```

Find your account ID and add it to Netlify:

```env
ZOHO_MAIL_ACCOUNT_ID=123456789
```

This is optional if the backend can auto-detect it from `SEND_AS`, but setting it manually is safer.

## 5. Create WorkDrive folders manually

In Zoho WorkDrive, create:

```txt
Orion Quotations Invoices
  Customer Copy - External
  Company Copy - Internal
  Quotation Data
```

Open each folder in WorkDrive and copy the folder ID from the URL.

Example URL pattern:

```txt
https://workdrive.zoho.com/home/.../privatespace/folders/FOLDER_ID_HERE
```

Add these to Netlify:

```env
ZOHO_WORKDRIVE_EXTERNAL_FOLDER_ID=folder_id_for_external
ZOHO_WORKDRIVE_INTERNAL_FOLDER_ID=folder_id_for_internal
ZOHO_WORKDRIVE_DATA_FOLDER_ID=folder_id_for_data
```

Redeploy.

## 6. Frontend API URL

In the quotation generator frontend, use:

```js
const ORION_API = "https://orionquotes.netlify.app/.netlify/functions";
```

Then call:

```js
fetch(`${ORION_API}/finalize`, ...)
fetch(`${ORION_API}/send-email`, ...)
fetch(`${ORION_API}/save-quotes`, ...)
fetch(`${ORION_API}/load-quotes`, ...)
```

## Notes

- `send-email` accepts only `externalPdfBase64`. The internal PDF is not emailed.
- `finalize` stores external and internal PDFs in separate WorkDrive folders.
- `save-quotes` and `load-quotes` store editable quote data in `orion-quotations-data.json` inside the WorkDrive data folder.
- If WorkDrive list/download returns an OAuth scope error, regenerate Zoho auth using the latest scopes in `_zoho.js`.
