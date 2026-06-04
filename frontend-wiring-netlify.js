/* ============================================================
   frontend-wiring-netlify.js
   ------------------------------------------------------------
   Use these replacements inside delivery.jsx when frontend and
   backend are both deployed on the same Netlify site.
   ============================================================ */

const ORION_API = "/.netlify/functions";

// Optional status check
const checkGoogleStatus = async () => {
  const res = await fetch(`${ORION_API}/status`);
  const data = await res.json();
  return data.connected;
};

// ---- Step 2: Save both PDFs to Google Drive (REAL) ----
const saveToDrive = async () => {
  setBusy("drive");
  try {
    const res = await fetch(`${ORION_API}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        externalFileName: extName,
        internalFileName: intName,
        externalPdfBase64: docToBase64(buildCustomerPDF(quote)),
        internalPdfBase64: docToBase64(buildInternalPDF(quote)),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Drive upload failed");

    onUpdate({
      delivery: {
        ...d,
        externalPdfName: extName,
        internalPdfName: intName,
        externalDriveLink: data.externalDriveLink,
        internalDriveLink: data.internalDriveLink,
        driveSavedAt: data.savedAt,
      },
    });
    flash("Saved to Google Drive — both copies filed into their folders");
  } catch (e) {
    flash(e.message, "warn");
  } finally {
    setBusy("");
  }
};

// ---- Step 3: Send customer copy by email (REAL) ----
const sendEmail = async () => {
  if (!email.to.trim()) {
    flash("Enter a customer email address first", "warn");
    return;
  }

  setBusy("email");
  try {
    const res = await fetch(`${ORION_API}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email.to,
        subject: email.subject,
        body: email.body,
        fileName: extName,
        externalPdfBase64: docToBase64(buildCustomerPDF(quote)), // customer copy only
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed");

    onUpdate({
      status: "sent",
      delivery: { ...d, emailTo: email.to, emailSent: true, sentAt: data.sentAt },
    });
    flash("Customer copy emailed — status set to Sent");
  } catch (e) {
    flash(e.message, "warn");
  } finally {
    setBusy("");
  }
};
