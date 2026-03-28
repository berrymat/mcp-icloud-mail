import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function getSmtpTransporter(): Transporter {
  if (transporter) return transporter;

  const email = process.env.ICLOUD_EMAIL;
  const password = process.env.ICLOUD_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ICLOUD_EMAIL and ICLOUD_PASSWORD environment variables are required."
    );
  }

  transporter = nodemailer.createTransport({
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    auth: {
      user: email,
      pass: password,
    },
  });

  return transporter;
}
