# Frontend changes for Zoho backend

## delivery.jsx

Set the backend API constant to:

```js
const ORION_API = "https://orionquotes.netlify.app/.netlify/functions";
```

Use:

```js
fetch(`${ORION_API}/finalize`, ...)
fetch(`${ORION_API}/send-email`, ...)
```

Do not use `/api/finalize` or `/api/send-email`.

## app.jsx cloud save/load idea

Your current app uses localStorage. To make quotes persist across tabs/devices, add cloud load/save calls.

Use this API:

```js
const ORION_API = "https://orionquotes.netlify.app/.netlify/functions";

async function loadQuotesFromCloud() {
  const res = await fetch(`${ORION_API}/load-quotes`);
  const data = await res.json();
  return Array.isArray(data.quotes) ? data.quotes : null;
}

async function saveQuotesToCloud(quotes) {
  await fetch(`${ORION_API}/save-quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quotes }),
  });
}
```

For now, keep localStorage as fallback, but call `saveQuotesToCloud(quotes)` after local save.
