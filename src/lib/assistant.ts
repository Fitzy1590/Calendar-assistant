import type Anthropic from "@anthropic-ai/sdk";
import { addDays, format, startOfDay } from "date-fns";
import { live, useStore } from "../store";
import * as A from "./actions";
import { cleanTitle, parseRecurrence, parseWhen } from "./nlp";
import { todayYmd, ymd } from "./util";

export type ChatTurn = { role: "user" | "assistant"; text: string; items?: string[] };

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (h?: number, m?: number) => (h === undefined ? undefined : `${pad(h)}:${pad(m ?? 0)}`);

export const EXAMPLES = [
  "I need to buy paint",
  "Invite Luke to dinner Friday 7pm at Mama's",
  "Take a note: gate code is 4821",
  "Dentist next Tuesday at 3pm",
  "Soccer every Wednesday at 6pm",
  "Remind me to renew rego on Friday",
  "What's on this week?",
  "Weather on Saturday",
  "Call Luke",
  "Text Mum saying running 10 minutes late",
  "Plan my week",
  "Mark buy milk as done",
  "Show the month view",
];

/** Rule-based intent parser: instant, offline, and good for the common commands. */
export async function runLocal(input: string): Promise<A.ActionResult> {
  const text = input.trim().replace(/[?.!]+$/, "");
  const low = text.toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = text.match(/^(?:take|make|add|write|jot down)(?: a| me a)? note(?: that| saying| about|:)?\s+(.+)$/i)) || (m = text.match(/^(?:note|remember that|remember)[:,]?\s+(.+)$/i)))
    return A.takeNote(m[1]);
  if ((m = low.match(/^(?:find|search|show|open)(?: my)? notes?(?: for| about| on| with)? (.+)$/))) return A.findNotes(m[1]);
  if ((m = text.match(/^(?:add|put) (.+?) (?:to|on) (?:my |the )?(?:shopping|grocery) list$/i))) return A.addShopping(m[1]);
  if (/^(?:what'?s|show|read)(?: is)? (?:on )?(?:my |the )?(?:shopping|grocery) list/.test(low)) return A.listShopping();
  if ((m = low.match(/^(?:i need to buy|i need|where can i (?:buy|get)|find|cheapest|compare prices (?:for|on)|shop for|buy) (.+?)(?: near me| nearby| cheap| online)?$/)) && !/\b(note|notes|setting|settings|event|meeting)\b/.test(m[1]))
    return A.shopFor(m[1]);
  if ((m = text.match(/^invite (.+?) to (.+)$/i))) {
    const people = m[1].split(/,|\band\b|&/).map((x) => x.trim()).filter(Boolean);
    const loc = m[2].match(/\s(?:at|@)\s+([A-Z][^]*)$/); // "at Mama's Kitchen, Parramatta" (a capital: a place, not a time)
    const rest = loc ? m[2].slice(0, loc.index) : m[2];
    const w = parseWhen(rest);
    if (w.date) return A.invite(people, { title: cleanTitle(w.rest) || "Catch-up", date: ymd(w.date), time: hm(w.hour, w.minute), durationMins: w.durationMins, location: loc?.[1] });
  }
  if ((m = low.match(/^(?:call|ring|phone|dial) (.+)$/))) return A.call(m[1]);
  if ((m = text.match(/^(?:text|sms|message) (.+?)(?: (?:saying|that|to say|:)\s*(.+))?$/i))) return A.sms(m[1], m[2]);

  if (/\bweather\b|\b(rain|raining|sunny|hot|cold|umbrella)\b/.test(low)) {
    const w = parseWhen(low);
    return A.weatherFor(w.date ? ymd(w.date) : undefined);
  }

  if (/^(plan|organi[sz]e) (my|the) week/.test(low)) return A.planMyWeek(true);

  if ((m = low.match(/^(?:mark|tick off|complete|finish|done with|check off) (.+?)(?: as)?(?: done| complete| completed| finished)?$/)))
    return A.completeTask(m[1]);
  if ((m = low.match(/^(?:move|reschedule|push|postpone) (.+?) (?:to|until|till) (.+)$/))) {
    const w = parseWhen(m[2]);
    if (w.date) return A.moveTask(m[1], ymd(w.date));
  }
  if ((m = low.match(/^(?:delete|cancel|remove) (?:the |my )?(.+?)(?: event| appointment| meeting)?$/))) {
    const w = parseWhen(m[1]);
    return A.deleteEvent(w.rest || m[1], w.date ? ymd(w.date) : undefined);
  }

  if ((m = low.match(/^(?:show|switch to|use|open)? ?(?:the )?(day|week|month|year)(?:ly)? view$/))) return A.setCalendarView(m[1] as "day");
  if ((m = low.match(/\b(dark|light|paper|ink|slate|sand)\b (?:mode|theme)|theme (?:to )?(dark|light|paper|ink|slate|sand)/))) {
    const name = (m[1] || m[2]) as string;
    return A.setTheme(name === "dark" ? "ink" : name === "light" ? "paper" : (name as "ink"));
  }
  if ((m = low.match(/^(?:find|search(?: for)?|look up) (?:setting|settings) (?:for )?(.+)$/))) return A.openSettings(m[1]);
  if ((m = low.match(/^(?:news|headlines)(?: (?:about|on|for) (.+))?$/)) || (m = low.match(/^(?:show|get|what's|whats) (?:the )?(?:news|headlines)(?: (?:about|on) (.+))?$/)))
    return A.openNews(m[1]);
  if ((m = low.match(/^(?:open|go to|show|take me to) (?:the |my )?(\w[\w-]*)(?: page)?$/))) {
    const w = parseWhen(m[1]);
    if (w.date) return A.showDay(ymd(w.date));
    return A.navigate(m[1]);
  }

  if (
    (m = low.match(/^(?:what(?:'s| is)? on|what do i have|do i have anything|am i (?:free|busy)|agenda|schedule|show me|what's happening)(.*)$/))
  ) {
    const w = parseWhen(m[1] || "today");
    if (w.range) return A.agenda(w.range.from, w.range.to);
    const d = w.date ?? startOfDay(new Date());
    return A.agenda(d, addDays(d, 1));
  }
  if ((m = text.match(/^(?:find|search(?: for)?|when is|when's|look for) (?:my |the )?(.+)$/i))) return A.searchEvents(m[1]);

  if ((m = text.match(/^add (?:a )?contact (.+)$/i))) {
    const phone = m[1].match(/(\+?\d[\d\s-]{6,})/)?.[1]?.trim();
    const bdayW = /birthday/i.test(m[1]) ? parseWhen(m[1].split(/birthday/i)[1] ?? "") : undefined;
    const name = m[1].replace(/(\+?\d[\d\s-]{6,})/, "").replace(/(,|with)?\s*(phone|number|mobile|birthday).*/i, "").trim();
    return A.addContact({ name, phone, birthday: bdayW?.date ? ymd(bdayW.date) : undefined });
  }

  const isTask = /^(remind me to|remember to|add (?:a )?(?:task|todo|to-do)|todo|to-do|task|i need to|i have to)\b/i.test(text);
  const { recurrence, rest: r1 } = parseRecurrence(text);
  const w = parseWhen(r1);
  const priority = /\b(urgent|important|asap|high priority)\b/i.test(text) ? "high" : undefined;
  const title = cleanTitle(w.rest.replace(/\b(urgent|important|asap|high priority)\b/gi, "").trim());
  if (!title) return { text: "What should I call it?" };

  if (isTask) return A.addTask({ title, due: w.date ? ymd(w.date) : undefined, time: hm(w.hour, w.minute), priority });
  if (w.date || recurrence || /^(add|schedule|book|create|new)\b/i.test(text)) {
    let date = w.date ? ymd(w.date) : todayYmd();
    if (recurrence?.byWeekday?.length) {
      // "Soccer every Wednesday at 6pm" starts on the first Wednesday on/after the parsed day
      const d = w.date ? new Date(w.date) : new Date();
      while (!recurrence.byWeekday.includes(d.getDay())) d.setDate(d.getDate() + 1);
      date = ymd(d);
    }
    return A.addEvent({ title, date, time: hm(w.hour, w.minute), durationMins: w.durationMins, recurrence });
  }
  return {
    text: "I can add events and tasks, check your schedule or the weather, call or text contacts, and change settings. Try one of these:",
    items: EXAMPLES.slice(0, 5),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Claude mode: the same actions exposed as tools, so free-form requests ("move everything on
 * Thursday afternoon to Friday and tell Luke I'm running late") work too. The user's own API key
 * is used straight from the device; nothing goes through a third-party server.
 * ---------------------------------------------------------------------------------------------- */

const MODEL = "claude-opus-5-5";

const TOOLS: Anthropic.Tool[] = [
  tool("add_event", "Add a calendar event or appointment. Omit time for all-day.", {
    title: { type: "string" }, date: { type: "string", description: "yyyy-mm-dd" }, time: { type: "string", description: "HH:mm 24h" },
    durationMins: { type: "integer" }, location: { type: "string" }, notes: { type: "string" },
    recurrence: { type: "object", properties: { freq: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] }, interval: { type: "integer" }, byWeekday: { type: "array", items: { type: "integer" }, description: "0=Sun..6=Sat" }, until: { type: "string" }, count: { type: "integer" } }, required: ["freq", "interval"] },
  }, ["title", "date"]),
  tool("add_task", "Add a task to the task list, optionally due on a day.", {
    title: { type: "string" }, due: { type: "string", description: "yyyy-mm-dd" }, time: { type: "string" }, priority: { type: "string", enum: ["low", "med", "high"] },
  }, ["title"]),
  tool("complete_task", "Mark the open task whose title best matches as done.", { query: { type: "string" } }, ["query"]),
  tool("move_task", "Reschedule a task to another day.", { query: { type: "string" }, date: { type: "string" } }, ["query", "date"]),
  tool("delete_event", "Delete an event. With date on a recurring event, removes only that occurrence.", { query: { type: "string" }, date: { type: "string" } }, ["query"]),
  tool("get_agenda", "List events and tasks between two dates (to is exclusive).", { from: { type: "string" }, to: { type: "string" }, query: { type: "string" } }, ["from", "to"]),
  tool("get_weather", "Forecast for the saved location on a date (up to 16 days ahead).", { date: { type: "string" } }, []),
  tool("call_contact", "Phone a contact or number through the linked Android phone.", { name: { type: "string" } }, ["name"]),
  tool("text_contact", "Send an SMS to a contact through the linked Android phone.", { name: { type: "string" }, body: { type: "string" } }, ["name"]),
  tool("add_contact", "Add or update a contact.", { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, birthday: { type: "string", description: "yyyy-mm-dd" } }, ["name"]),
  tool("navigate", "Open a page of the app.", { page: { type: "string", enum: ["home", "calendar", "tasks", "notes", "contacts", "reminders", "news", "sports", "settings"] } }, ["page"]),
  tool("find_product", "Find shops near the user that sell something and compare prices online (opens the Shopping page).", { product: { type: "string" } }, ["product"]),
  tool("add_shopping_items", "Add things to the shopping list (comma-separated).", { items: { type: "string" } }, ["items"]),
  tool("list_shopping", "Read the shopping list.", {}, []),
  tool("invite_people", "Create an event and invite people (names from contacts, emails or numbers).", {
    people: { type: "array", items: { type: "string" } }, title: { type: "string" }, date: { type: "string" }, time: { type: "string" }, durationMins: { type: "integer" }, location: { type: "string" },
  }, ["people", "title", "date"]),
  tool("add_note", "Save a sticky note (things to remember, codes, lists; use \"[ ] item\" lines for a checklist).", { text: { type: "string" }, title: { type: "string" } }, ["text"]),
  tool("search_notes", "Find notes mentioning a word or phrase.", { query: { type: "string" } }, ["query"]),
  tool("set_calendar_view", "Switch the calendar view.", { view: { type: "string", enum: ["day", "week", "month", "year"] } }, ["view"]),
  tool("set_theme", "Change the colour theme.", { theme: { type: "string", enum: ["paper", "ink", "slate", "sand", "system"] } }, ["theme"]),
  tool("plan_week", "Spread unscheduled and overdue tasks across the next 7 days.", { apply: { type: "boolean" } }, ["apply"]),
  tool("search_news", "Open the news page, optionally searching a topic.", { query: { type: "string" } }, []),
  tool("search_settings", "Open settings filtered by a keyword.", { query: { type: "string" } }, ["query"]),
];

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]): Anthropic.Tool {
  return { name, description, input_schema: { type: "object", properties, required } };
}

async function runTool(name: string, i: any): Promise<A.ActionResult> {
  switch (name) {
    case "add_event": return A.addEvent(i);
    case "add_task": return A.addTask(i);
    case "complete_task": return A.completeTask(i.query);
    case "move_task": return A.moveTask(i.query, i.date);
    case "delete_event": return A.deleteEvent(i.query, i.date);
    case "get_agenda": return A.agenda(new Date(i.from + "T00:00"), new Date(i.to + "T00:00"), i.query);
    case "get_weather": return A.weatherFor(i.date);
    case "call_contact": return A.call(i.name);
    case "text_contact": return A.sms(i.name, i.body);
    case "add_contact": return A.addContact(i);
    case "navigate": return A.navigate(i.page);
    case "set_calendar_view": return A.setCalendarView(i.view);
    case "set_theme": return A.setTheme(i.theme);
    case "plan_week": return A.planMyWeek(!!i.apply);
    case "search_news": return A.openNews(i.query);
    case "search_settings": return A.openSettings(i.query);
    case "add_note": return A.takeNote(i.text, i.title);
    case "find_product": return A.shopFor(i.product);
    case "add_shopping_items": return A.addShopping(i.items);
    case "list_shopping": return A.listShopping();
    case "invite_people": return A.invite(i.people, i);
    case "search_notes": return A.findNotes(i.query);
    default: return { text: `Unknown tool ${name}` };
  }
}

const SYSTEM = `You are the assistant inside a personal planner app (calendar, tasks, notes, shopping list, invites, contacts, reminders, weather, news, sports).
Act on requests with the tools; ask one short question only when a required detail is genuinely missing.
Reply in one or two plain sentences: the user may be listening via text-to-speech. Use the user's local dates and times.`;

let history: Anthropic.MessageParam[] = [];
export const resetClaude = () => void (history = []);

export async function runClaude(input: string): Promise<A.ActionResult> {
  const s = useStore.getState();
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk"); // loaded only when Claude mode is used
  const client = new AnthropicSDK({ apiKey: s.settings.assistant.apiKey, dangerouslyAllowBrowser: true });
  const contacts = live(s.contacts).map((c) => c.name).slice(0, 200).join(", ");
  // Volatile context goes in the user turn so the system prompt + tools stay cacheable.
  const ctx = `[Now: ${format(new Date(), "EEEE d MMMM yyyy, HH:mm")} (${todayYmd()}). Location: ${s.settings.location?.name ?? "unset"}. Contacts: ${contacts || "none"}]`;
  history.push({ role: "user", content: `${ctx}\n${input}` });
  const collected: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    // Server-side fallback: if a safety classifier declines, the API retries on a fallback model in the same call.
    const res = (await client.beta.messages.create({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: TOOLS,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      messages: history,
    } as never)) as unknown as Anthropic.Message;
    history.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "refusal") return { text: "I can't help with that one." };
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      if (history.length > 30) history = history.slice(-20).filter((_, i, arr) => i > 0 || arr[0].role === "user");
      return { text: text || collected.join(" ") || "Done.", items: collected.length > 1 ? collected : undefined };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        const r = await runTool(u.name, u.input);
        collected.push(r.text);
        results.push({ type: "tool_result", tool_use_id: u.id, content: [r.text, ...(r.items ?? [])].join("\n") });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: String(e), is_error: true });
      }
    }
    history.push({ role: "user", content: results });
  }
  return { text: collected.join(" ") || "Done." };
}

export async function runAssistant(input: string): Promise<A.ActionResult> {
  const s = useStore.getState().settings.assistant;
  if (s.provider === "claude" && s.apiKey) {
    try {
      return await runClaude(input);
    } catch (e) {
      resetClaude();
      const r = await runLocal(input);
      return { ...r, text: `${r.text} (Claude was unavailable: ${(e as Error).message})` };
    }
  }
  return runLocal(input);
}
