import { domainOf, guessImap } from "./imapPresets";

/**
 * Turns a failed "Add other email" attempt into what to do about it. Runs on this device (nothing is sent anywhere).
 * `tryServers` are other settings worth trying automatically when the server itself couldn't be reached.
 */

export interface ImapFix {
  kind: "password" | "server" | "disabled" | "secure" | "unknown";
  title: string;
  steps: string[];
  links: { label: string; url: string }[];
  tryServers: { host: string; port: number }[];
}

/** Other servers worth trying for a provider, besides the first guess. */
export function alternativeServers(address: string): { host: string; port: number }[] {
  const d = domainOf(address);
  const first = guessImap(address);
  const alts: string[] = [];
  if (["bigpond.com", "bigpond.net.au", "telstra.com", "telstra.com.au"].includes(d)) alts.push("mail.bigpond.com", "imap.bigpond.com");
  else if (d) alts.push(`mail.${d}`, d);
  return alts.filter((h) => h !== first.host).map((host) => ({ host, port: 993 }));
}

const PASSWORD_PAGES: Record<string, { label: string; url: string }> = {
  yahoo: { label: "Yahoo: create an app password", url: "https://login.yahoo.com/account/security" },
  icloud: { label: "Apple: create an app-specific password", url: "https://account.apple.com/account/manage" },
  aol: { label: "AOL: create an app password", url: "https://login.aol.com/account/security" },
  fastmail: { label: "Fastmail: create an app password", url: "https://app.fastmail.com/settings/security/devicekeys" },
};

const passwordLink = (address: string) => {
  const name = guessImap(address).name.toLowerCase();
  const hit = Object.keys(PASSWORD_PAGES).find((k) => name.includes(k));
  return hit ? [PASSWORD_PAGES[hit]] : [];
};

export function explainImapError(msg: string, address: string): ImapFix {
  const preset = guessImap(address);
  const telstra = /telstra/i.test(preset.name);
  const base = { links: passwordLink(address), tryServers: [] as ImapFix["tryServers"] };
  const alts = alternativeServers(address);

  if (/application.specific|app.?password|web ?alert/i.test(msg))
    return {
      ...base,
      kind: "password",
      title: "This account needs an app password",
      steps: [
        `${preset.name} won't accept your normal password here. Create an “app password” in your account's security settings.`,
        "Paste that app password into the Password box (not your normal one) and press Connect again.",
      ],
    };
  if (/login failed|authenticationfailed|invalid credentials|authentication failed|\bno \[auth|bad credentials/i.test(msg))
    return {
      ...base,
      kind: "password",
      title: "The address or password was refused",
      steps: [
        "Check the address is complete (for example name@bigpond.com) and the password is typed exactly: it is case sensitive.",
        telstra
          ? "Telstra: try signing in to Telstra Mail on the web with the same details. If that works but this doesn't, create an app password in your Telstra account and use that here."
          : `If you use two-step sign-in, ${preset.name} needs an “app password” instead of your normal one.`,
        "Make sure IMAP access is switched on in the account's mail settings.",
      ],
    };
  if (/imap.*(disabled|not enabled|turned off)|access.*disabled|\[unavailable\]|not allowed/i.test(msg))
    return {
      ...base,
      kind: "disabled",
      title: "IMAP access is switched off for this account",
      steps: [
        `Open ${preset.name}'s mail settings on their website and turn on IMAP (sometimes called “other apps” or “external access”).`,
        "Then press Connect again.",
      ],
    };
  if (/certificate|tls|ssl|handshake|secure connection/i.test(msg))
    return {
      ...base,
      kind: "secure",
      title: "The secure connection couldn't be set up",
      steps: [
        "Check your PC's date and time are correct.",
        "If you use antivirus or a VPN that inspects secure traffic, try again with it paused.",
        "Check the server name in Server settings is right: a wrong name can give this error.",
      ],
    };
  if (/couldn't connect|dns|resolve|refused|timed? ?out|no such host|unreachable|os error|10060|10061|11001/i.test(msg))
    return {
      ...base,
      kind: "server",
      title: "Couldn't reach the mail server",
      steps: [
        "Check you're online.",
        alts.length
          ? `The app also tried ${alts.map((s) => s.host).join(" and ")}, without luck.`
          : "The server name or port may be different for your account.",
        "Look up “IMAP server” on your provider's help page and type it under Server settings (port is usually 993).",
      ],
      tryServers: alts,
    };
  return {
    ...base,
    kind: "unknown",
    title: "Couldn't connect",
    steps: ["Check the address, password and server in Server settings, then try again.", `The mail server said: ${msg.slice(0, 200)}`],
  };
}
