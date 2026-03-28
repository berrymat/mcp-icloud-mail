import { z } from "zod";
import { getSmtpTransporter } from "../smtp.js";

export const sendMessageSchema = {
  to: z.array(z.string()).min(1).describe("Recipient email addresses"),
  cc: z.array(z.string()).optional().describe("CC email addresses"),
  bcc: z.array(z.string()).optional().describe("BCC email addresses"),
  subject: z.string().describe("Email subject"),
  text: z.string().optional().describe("Plain text body"),
  html: z.string().optional().describe("HTML body"),
  inReplyTo: z.string().optional().describe("Message-ID of the email being replied to"),
  references: z.array(z.string()).optional().describe("Message-ID references for threading"),
};

interface SendMessageArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export async function handleSendMessage(args: SendMessageArgs): Promise<string> {
  const transporter = getSmtpTransporter();
  const fromEmail = process.env.ICLOUD_EMAIL;

  const info = await transporter.sendMail({
    from: fromEmail,
    to: args.to.join(", "),
    cc: args.cc?.join(", "),
    bcc: args.bcc?.join(", "),
    subject: args.subject,
    text: args.text,
    html: args.html,
    inReplyTo: args.inReplyTo,
    references: args.references?.join(" "),
  });

  return JSON.stringify({
    success: true,
    messageId: info.messageId,
    to: args.to,
    subject: args.subject,
  });
}
