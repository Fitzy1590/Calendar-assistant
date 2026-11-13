import { REPO } from "./updates";

/**
 * Plain-language setup guides shown inside the app (Settings and the setup wizard), with buttons that open the exact
 * Google / Microsoft pages. Data only, so tests can check every link and that the buttons they mention really exist.
 */

export interface GuideLink {
  label: string;
  url: string;
}
export interface GuideStep {
  title: string;
  body: string;
  links?: GuideLink[];
  /** Button or field names this step tells the person to press, so a test can catch them drifting from the real screens. */
  ui?: string[];
}

const CLOUD = "https://console.cloud.google.com";
export const GUIDE_HOSTS = ["console.cloud.google.com", "www.google.com", "entra.microsoft.com", "github.com"];
export const docsUrl = (file: string) => `https://github.com/${REPO}/blob/main/docs/${file}`;

const projectSteps: GuideStep[] = [
  {
    title: "Make a free Google Cloud project",
    body: "This is just a place on Google's website that holds your app's keys. It costs nothing. Sign in with your Google account, name the project “Calendar Assistant” and press Create. Use this same project for both your PC and your phone.",
    links: [{ label: "Open Google Cloud", url: `${CLOUD}/projectcreate` }],
  },
  {
    title: "Turn on Google Drive",
    body: "On the page that opens, check “Calendar Assistant” is chosen at the top, then press Enable. If you also want your Google Calendar brought in, turn on the Calendar API too.",
    links: [
      { label: "Turn on Google Drive", url: `${CLOUD}/apis/library/drive.googleapis.com` },
      { label: "Turn on Google Calendar (optional)", url: `${CLOUD}/apis/library/calendar-json.googleapis.com` },
    ],
  },
  {
    title: "Set up the sign-in screen",
    body: "Press Get started (or Configure consent screen). Step 1: App name “Calendar Assistant”, and pick your email as the support email, then Next. Step 2: Audience “External”, then Next. Step 3: type your email, then Next. Step 4: tick the agreement, press Continue, then Create. Then add yourself so Google lets you in: left menu → Audience → Test users → Add users → type your Google email → Save. Later, press Publish app so your sign-in doesn't stop working after about a week.",
    links: [{ label: "Open the sign-in screen settings", url: `${CLOUD}/apis/credentials/consent` }],
  },
];

const windowsSteps: GuideStep[] = [
  {
    title: "Create the key for this PC",
    body: "In the left menu open “Clients” and press “+ Create client” (on older screens: Credentials → “+ Create credentials” → “OAuth client ID”). Never choose “Help me choose”, which asks “Which API are you using?”: press Cancel if you land there. Application type: Desktop app. Name: Calendar Assistant PC. Press Create, then copy the Client ID and the Client secret.",
    links: [{ label: "Open Credentials", url: `${CLOUD}/apis/credentials` }],
  },
  {
    title: "Paste them into the app and sign in",
    body: "In Settings → Email, Google & Outlook, paste the Client ID and Client secret. Then go to Settings → Phone & sync and press “Connect Google and turn on Drive sync”. Choose your account in the browser. If Google says the app isn't verified, press Advanced, then Continue: it's your own app.",
    ui: ["Connect Google and turn on Drive sync", "Google client ID (Desktop app)", "Google client secret (Desktop app)"],
  },
  {
    title: "Optional: bring in your Google Calendar",
    body: "Press “Sync with Google Calendar” in Settings → Email, Google & Outlook. The PC adds your Google events, and your phone gets them through Drive.",
    ui: ["Sync with Google Calendar"],
  },
];

const androidSteps: GuideStep[] = [
  {
    title: "Create the key for this phone",
    body: "In the left menu open “Clients” and press “+ Create client” (on older screens: Credentials → “+ Create credentials” → “OAuth client ID”). Never choose “Help me choose”, which asks “Which API are you using?”: press Cancel if you land there. Application type: TVs and Limited Input devices. Name: Calendar Assistant phone. Press Create, then copy the Client ID and the Client secret.",
    links: [{ label: "Open Credentials", url: `${CLOUD}/apis/credentials` }],
  },
  {
    title: "Paste them into the app and ask for a code",
    body: "In Settings → Phone & sync → Sync through Google Drive, paste the Client ID and Client secret, then press “Get a sign-in code”.",
    ui: ["Get a sign-in code", "Client ID (TVs and Limited Input devices)", "Client secret"],
  },
  {
    title: "Type the code on Google's page",
    body: "Open the page below on this phone or any other device, type the code the app shows, choose your account and press Allow. If Google says the app isn't verified, press Advanced, then Continue: it's your own app. The app finishes by itself.",
    links: [{ label: "Open google.com/device", url: "https://www.google.com/device" }],
  },
  {
    title: "Then do the same on your PC",
    body: "Your Google Calendar reaches the phone through your PC, so set up the PC too (use the “On my PC” tab), in the same project.",
  },
];

export const googleSteps = (target: "windows" | "android"): GuideStep[] => [
  ...projectSteps,
  ...(target === "windows" ? windowsSteps : androidSteps),
];

export const microsoftSteps = (): GuideStep[] => [
  {
    title: "Register a free app with Microsoft",
    body: "Sign in with the Microsoft account you use for Outlook or Hotmail (it may ask you to set up a free directory: accept). Go to Applications → App registrations → New registration.",
    links: [{ label: "Open Microsoft Entra", url: "https://entra.microsoft.com" }],
  },
  {
    title: "Fill in the form",
    body: "Name: Calendar Assistant. Supported account types: choose the one that includes personal Microsoft accounts (so Outlook.com and Hotmail work). Redirect URI: choose Mobile and desktop applications and type http://localhost. Press Register.",
  },
  {
    title: "Allow desktop sign-in",
    body: "Open Authentication in the app's menu, turn on “Allow public client flows” and save.",
  },
  {
    title: "Copy the ID into the app",
    body: "On the Overview page copy the Application (client) ID. In Settings → Email paste it into “Microsoft app (client) ID”, then press “Add Outlook / Hotmail account” and sign in. The app can only read your mail.",
    ui: ["Add Outlook / Hotmail account", "Microsoft app (client) ID"],
  },
];

/** Gmail reuses the Google project, sign-in screen and PC key, but turns on the Gmail API instead of Drive. */
export const gmailSteps = (): GuideStep[] => [
  projectSteps[0],
  {
    title: "Turn on the Gmail API",
    body: "On the page that opens, check “Calendar Assistant” is chosen at the top, then press Enable. Without this, Google refuses to let the app read your mail.",
    links: [{ label: "Turn on Gmail", url: `${CLOUD}/apis/library/gmail.googleapis.com` }],
  },
  projectSteps[2],
  windowsSteps[0],
  {
    title: "Paste them into the app and add Gmail",
    body: "In Settings → Email, paste the Client ID and Client secret into the Google boxes, then press “Add Gmail account”. Choose your account in the browser, and allow reading (and sending, if you want to write mail here). If Google says the app isn't verified, press Advanced, then Continue: it's your own app. Mail stays on this PC.",
    ui: ["Add Gmail account", "Google client ID (Desktop app)", "Google client secret (Desktop app)"],
  },
];

export const guideDoc = (kind: "google" | "microsoft" | "gmail") =>
  docsUrl(kind === "google" ? "DRIVE_SYNC.md" : "EMAIL_SETUP.md") + (kind === "gmail" ? "#gmail" : "");
