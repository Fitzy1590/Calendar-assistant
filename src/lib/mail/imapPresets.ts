/** Server settings for common providers, so a non-technical person only types an address and password. */

export interface ImapPreset {
  name: string;
  host: string;
  port: number;
  /** Shown under the password box. */
  note: string;
  /** Outgoing (SMTP) server for sending. Port 465 = secure from the start, 587 = STARTTLS. */
  smtpHost?: string;
  smtpPort?: number;
  /** Prefer the one-click button for this provider instead. */
  useInstead?: "outlook" | "gmail";
}

const ASK_APP_PW = "Create an app password in your account's security settings and use that here, not your normal password.";

const PRESETS: { domains: string[]; preset: ImapPreset }[] = [
  {
    domains: ["bigpond.com", "bigpond.net.au", "telstra.com", "telstra.com.au"],
    preset: {
      name: "Telstra / Bigpond",
      host: "imap.telstra.com",
      smtpHost: "smtp.telstra.com",
      smtpPort: 465,
      port: 993,
      note: "Use your Telstra Mail password (the full address is your username). If sign-in fails, create an app password in your Telstra account and use that.",
    },
  },
  {
    domains: ["yahoo.com", "yahoo.com.au", "ymail.com", "rocketmail.com"],
    preset: { name: "Yahoo", host: "imap.mail.yahoo.com", smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, port: 993, note: ASK_APP_PW },
  },
  {
    domains: ["icloud.com", "me.com", "mac.com"],
    preset: { name: "iCloud", host: "imap.mail.me.com", smtpHost: "smtp.mail.me.com", smtpPort: 587, port: 993, note: ASK_APP_PW },
  },
  {
    domains: ["aol.com"],
    preset: { name: "AOL", host: "imap.aol.com", smtpHost: "smtp.aol.com", smtpPort: 465, port: 993, note: ASK_APP_PW },
  },
  {
    domains: ["fastmail.com", "fastmail.fm"],
    preset: { name: "Fastmail", host: "imap.fastmail.com", smtpHost: "smtp.fastmail.com", smtpPort: 465, port: 993, note: ASK_APP_PW },
  },
  {
    domains: ["zoho.com"],
    preset: { name: "Zoho", host: "imap.zoho.com", smtpHost: "smtp.zoho.com", smtpPort: 465, port: 993, note: ASK_APP_PW },
  },
  {
    domains: ["gmail.com", "googlemail.com"],
    preset: {
      name: "Gmail",
      host: "imap.gmail.com",
      port: 993,
      note: "Gmail works best with the Add Gmail account button.",
      useInstead: "gmail",
    },
  },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.com.au", "hotmail.com.au"],
    preset: {
      name: "Outlook",
      host: "outlook.office365.com",
      port: 993,
      note: "Microsoft no longer allows passwords here. Use the Add Outlook / Hotmail account button.",
      useInstead: "outlook",
    },
  },
];

export const domainOf = (address: string) => address.trim().toLowerCase().split("@")[1] ?? "";

/** Best guess at the settings for this address. Unknown providers get `imap.<domain>`; the person can edit it. */
export function guessImap(address: string): ImapPreset {
  const d = domainOf(address);
  const hit = PRESETS.find((p) => p.domains.includes(d));
  if (hit) return hit.preset;
  return {
    name: d || "Other",
    host: d ? `imap.${d}` : "",
    smtpHost: d ? `smtp.${d}` : undefined,
    smtpPort: 465,
    port: 993,
    note: "If this doesn't connect, your provider's help page lists its IMAP server. Some providers need an app password.",
  };
}
