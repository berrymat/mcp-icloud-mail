import { z } from "zod";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { getSmtpTransporter } from "../smtp.js";
import { getImapClient, getSentMailboxPath } from "../imap.js";

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
  if (!fromEmail) {
    throw new Error("ICLOUD_EMAIL environment variable is required.");
  }

  // Build the MIME message once so the copy saved to Sent is byte-for-byte
  // the message that went over the wire (same Message-ID, Date, boundaries).
  const node = new MailComposer({
    from: fromEmail,
    to: args.to.join(", "),
    cc: args.cc?.join(", "),
    bcc: args.bcc?.join(", "),
    subject: args.subject,
    text: args.text,
    html: args.html,
    inReplyTo: args.inReplyTo,
    references: args.references?.join(" "),
  }).compile();

  const messageId = node.messageId();
  const wireMessage = await node.build(); // Bcc header stripped (keepBcc=false)

  // Note: for raw sends nodemailer generates an unrelated info.messageId,
  // so we report the ID from the built message instead.
  await transporter.sendMail({
    envelope: {
      from: fromEmail,
      to: [...args.to, ...(args.cc ?? []), ...(args.bcc ?? [])],
    },
    raw: wireMessage,
  });

  // Save a copy to the Sent mailbox. Keep the Bcc header in this copy, as
  // mail clients do, so the sender can see who was blind-copied.
  let sentCopy: { mailbox: string; uid?: number } | { error: string };
  try {
    node.keepBcc = true;
    const sentMessage = await node.build();
    const client = await getImapClient();
    const mailbox = await getSentMailboxPath(client);
    const appended = await client.append(mailbox, sentMessage, ["\\Seen"], new Date());
    sentCopy = { mailbox, uid: appended ? appended.uid : undefined };
  } catch (err) {
    // The message was already sent; don't fail the call over the Sent copy.
    sentCopy = { error: err instanceof Error ? err.message : String(err) };
  }

  return JSON.stringify({
    success: true,
    messageId,
    to: args.to,
    subject: args.subject,
    sentCopy,
  });
}
