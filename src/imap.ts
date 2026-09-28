import { ImapFlow, type ImapFlowOptions } from "imapflow";

let client: ImapFlow | null = null;

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

export async function disconnectImap(): Promise<void> {
  if (client) {
    await client.logout();
    client = null;
  }
}
