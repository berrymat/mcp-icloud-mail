import { z } from "zod";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const ruleSchema = z.object({
  description: z.string().optional(),
  senders: z.array(z.string()).default([]),
  markAsRead: z.boolean().default(false),
});

const archiveSenderRuleSchema = z.object({
  senders: z.array(z.string()),
  mailbox: z.string(),
});

const archiveReadRuleSchema = z.object({
  description: z.string().optional(),
  daysOld: z.number().default(60),
  defaultMailbox: z.string().default("Archive"),
  senderRules: z.array(archiveSenderRuleSchema).default([]),
});

const configSchema = z.object({
  rules: z.object({
    delete: ruleSchema.default({ senders: [] }),
    junk: ruleSchema.default({ senders: [] }),
    keepLatest: ruleSchema.default({ senders: [] }),
    archiveRead: archiveReadRuleSchema.optional(),
  }).default({}),
});

export type RuleConfig = z.infer<typeof ruleSchema>;
export type ArchiveSenderRule = z.infer<typeof archiveSenderRuleSchema>;
export type ArchiveReadRule = z.infer<typeof archiveReadRuleSchema>;
export type Config = z.infer<typeof configSchema>;

export async function loadConfig(): Promise<Config> {
  const configPath = process.env.MCP_MAIL_CONFIG
    ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return configSchema.parse({});
    }
    throw err;
  }

  return configSchema.parse(JSON.parse(raw));
}
