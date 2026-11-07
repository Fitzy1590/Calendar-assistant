import { findContact, useStore } from "../store";
import { isAndroid, openUrl } from "./platform";
import { hasPhonePeer, onDeviceCommand, sendCommand, sendCommandResult, type DeviceCommand } from "./sync";
import { uid } from "./util";

/**
 * Calls and texts.
 *  - On Android: open the dialer / messaging app directly.
 *  - On Windows, route "companion": send the command over sync; the Android app picks it up and dials.
 *  - On Windows, route "phonelink": hand tel:/sms: to Windows, which Microsoft Phone Link answers
 *    by placing the call through the paired Android phone.
 */
export async function placeCall(target: string): Promise<string> {
  const { number, name } = resolve(target);
  if (!number) return `I couldn't find a phone number for ${target}.`;
  if (isAndroid()) {
    await openUrl(`tel:${number}`);
    return `Calling ${name ?? number}.`;
  }
  if (useStore.getState().settings.phone.route === "companion" && hasPhonePeer()) {
    sendCommand({ id: uid(), action: "call", number, name });
    return `Calling ${name ?? number} on your phone.`;
  }
  await openUrl(`tel:${number}`);
  return `Calling ${name ?? number} via Phone Link.`;
}

export async function sendSms(target: string, body = ""): Promise<string> {
  const { number, name } = resolve(target);
  if (!number) return `I couldn't find a phone number for ${target}.`;
  const uri = `sms:${number}${body ? `?body=${encodeURIComponent(body)}` : ""}`;
  if (isAndroid()) {
    await openUrl(uri);
    return `Opening a message to ${name ?? number}.`;
  }
  if (useStore.getState().settings.phone.route === "companion" && hasPhonePeer()) {
    sendCommand({ id: uid(), action: "sms", number, body, name });
    return `Message to ${name ?? number} is ready on your phone.`;
  }
  await openUrl(uri);
  return `Opening a message to ${name ?? number}.`;
}

function resolve(target: string): { number?: string; name?: string } {
  if (/^[+\d][\d\s()-]{5,}$/.test(target.trim())) return { number: target.replace(/[^\d+]/g, "") };
  const c = findContact(target);
  return { number: c?.phone?.replace(/[^\d+]/g, ""), name: c?.name };
}

/** Android side: execute call/SMS requests that arrive from the Windows app. */
export function startPhoneBridge() {
  if (!isAndroid()) return;
  onDeviceCommand(async (cmd: DeviceCommand) => {
    try {
      if (cmd.action === "call") await openUrl(`tel:${cmd.number}`);
      else await openUrl(`sms:${cmd.number}${cmd.body ? `?body=${encodeURIComponent(cmd.body)}` : ""}`);
      sendCommandResult({ id: cmd.id, ok: true });
    } catch (e) {
      sendCommandResult({ id: cmd.id, ok: false, message: String(e) });
    }
  });
}
