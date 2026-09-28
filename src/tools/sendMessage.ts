import { z } from "zod";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { getSmtpTransporter } from "../smtp.js";
import { getImapClient } from "../imap.js";
import type { ImapFlow } from "imapflow";

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

let sentMailboxPath: string | null = null;

/**
 * Resolve the mailbox that mail clients treat as Sent.
 *
 * Order matters: iCloud's real Sent folder is "Sent Messages", which the
 * server advertises with the \Sent SPECIAL-USE attribute (in `flags`).
 * imapflow's `specialUse` property, by contrast, can come from a name-based
 * guess and may land on a stale folder literally named "Sent", so it is
 * only a fallback here.
 */
async function getSentMailboxPath(imap: ImapFlow): Promise<string> {
  if (sentMailboxPath) return sentMailboxPath;

  const mailboxes = await imap.list();
  const sent =
    mailboxes.find((mb) => mb.flags.has("\\Sent")) ??
    mailboxes.find((mb) => mb.path === "Sent Messages") ??
    mailboxes.find((mb) => mb.specialUse === "\\Sent") ??
    mailboxes.find((mb) => mb.name.toLowerCase() === "sent");

  if (!sent) {
    throw new Error("Could not find a Sent mailbox on the server");
  }

  sentMailboxPath = sent.path;
  return sentMailboxPath;
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
