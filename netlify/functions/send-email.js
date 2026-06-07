const payload = {
  fromAddress: process.env.SEND_AS,
  toAddress: to,
  subject,
  content: body || "Please find your quotation from Orion.",
  mailFormat: "plaintext",
  encoding: "UTF-8"
};
