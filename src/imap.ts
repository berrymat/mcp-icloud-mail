import { ImapFlow, type ImapFlowOptions } from "imapflow";

let client: ImapFlow | null = null;
let sentMailboxPath: string | null = null;

function getConfig(): ImapFlowOptions {
  const email = process.env.ICLOUD_EMAIL;
  const password = process.env.ICLOUD_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ICLOUD_EMAIL and ICLOUD_PASSWORD environment variables are required. " +
        "Generate an app-specific password at https://appleid.apple.com"
    );
  }

  return {
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    logger: false,
  };
}

export async function getImapClient(): Promise<ImapFlow> {
  if (client && client.usable) {
    return client;
  }

  client = new ImapFlow(getConfig());
  await client.connect();
  return client;
}

/**
 * Resolve the path of the server's \Sent special-use mailbox.
 * iCloud names it "Sent Messages"; we prefer the SPECIAL-USE flag and fall
 * back to that name. Cached after the first lookup.
 */
export async function getSentMailboxPath(imap: ImapFlow): Promise<string> {
  if (sentMailboxPath) return sentMailboxPath;

  const mailboxes = await imap.list();
  const sent =
    mailboxes.find((mb) => mb.specialUse === "\\Sent") ??
    mailboxes.find((mb) => mb.path === "Sent Messages") ??
    mailboxes.find((mb) => mb.name.toLowerCase() === "sent");

  if (!sent) {
    throw new Error("Could not find a Sent mailbox on the server");
  }

  sentMailboxPath = sent.path;
  return sentMailboxPath;
}

export async function disconnectImap(): Promise<void> {
  if (client) {
    await client.logout();
    client = null;
  }
}
