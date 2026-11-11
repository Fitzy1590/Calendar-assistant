# Connect your email (Outlook, Gmail, Bigpond and others)

Calendar Assistant reads your mail with a small free "app registration" that you create once in your own Microsoft account.
Nothing is shared with anyone else, and the app only asks to **read** your mail (it can't send, move or delete anything yet).
Sign-in works in the **installed Windows app**.

## 1. Register the app (about 5 minutes)

Prefer to be walked through it? In the app press **Step-by-step Outlook setup guide** (Settings → Email): the same steps, with a
button that opens Microsoft Entra.

1. Open <https://entra.microsoft.com> and sign in with the Microsoft account you use for Outlook/Hotmail.
   (If it asks you to set up a free directory, accept: it costs nothing.)
2. **Applications → App registrations → New registration**.
3. Name: `Calendar Assistant`.
4. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. This is the one that
   lets Outlook.com and Hotmail addresses sign in.
5. Redirect URI: choose **Mobile and desktop applications** and enter `http://localhost`. Click **Register**.
6. On the app's **Authentication** page, turn on **Allow public client flows** and save.
7. On the **Overview** page, copy the **Application (client) ID**.

You do not need a client secret, and you don't need to add permissions by hand: Microsoft asks you to approve
*Read your mail* and *Sign you in* the first time you connect.

## 2. Connect in the app

1. Settings → **Email** → paste the client ID into **Microsoft app (client) ID**.
2. Press **Add Outlook / Hotmail account**. Your browser opens Microsoft's sign-in; approve it, then come back to the app.
3. The first sync pulls your last 30 days. After that it checks every few minutes (Settings → Email → *Check for new mail*).

## Hotmail / Outlook on Android

Use the same Microsoft app and client ID as on Windows (Entra → Authentication → turn on **Allow public client flows**; the Android sign-in needs no extra redirect).
In the Android app: Settings → Email → paste the client ID → **Add Outlook / Hotmail account**. The app shows a short code; open the page it names
(microsoft.com/devicelogin) on any device, enter the code, sign in and accept. The window closes by itself and mail syncs. Gmail and other
(IMAP) accounts are still Windows only. The sign-in token is kept in the app's private storage on the phone and is never synced or backed up.

## Gmail

1. Do the Google setup first (Settings → Email, Google & Outlook: the in-app guide shows how).
2. In Google Cloud (same project) enable the **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com → Enable.
3. In the app: Settings → Email → **Add Gmail account**. Google asks to let the app **read** your Gmail. Gmail uses the same Google sign-in as
   Calendar and Drive, so it is the Google account you signed in with there.

While your Google app is in "Testing" mode, Google asks you to sign in again about every 7 days (Publish app in the consent screen avoids that).

## Bigpond, Yahoo, iCloud and other email (IMAP)

Settings → Email → **Add other email**. Type the address and password: the server is filled in for Telstra / Bigpond
(`imap.telstra.com`, port 993), Yahoo, iCloud, AOL, Fastmail and Zoho, and guessed (`imap.<domain>`) for others, where you can edit it under
"Server settings".

* **Telstra / Bigpond:** your Telstra Mail password. If it is refused, create an app password in your Telstra account and use that.
* **Yahoo, iCloud, AOL, Fastmail, Zoho:** these need an **app password** from the account's security page, not your normal password.
* Outlook/Hotmail and Gmail don't accept passwords this way: use their own buttons.
* Read-only. Only the Inbox of the last 30 days is read. The password is stored in Windows Credential Manager, never in settings, backups or sync.
* Mail you read or delete in another app shows up here at the next sync.

## What shows up where

- **Home → Important mail**: unread email that asks you something or is time-sensitive, mail from people in your Contacts, and
  bills or bank alerts that need attention. Change this under *What counts as important*.
- **Desktop notification** for new important mail while the app is open, an unread count next to **Email** in the menu, and a
  **daily summary** each morning.
- **Junk and subscriptions** (newsletters, mailing lists) never appear on Home or in alerts. They stay in their own folders in the
  Email page. Nothing is deleted, and nothing in Outlook is changed.

## Writing and sending

Right-click an email, or use the buttons under it: **Reply**, **Reply all**, **Forward**, **Draft with Claude** or **Draft with Gemini**. **New email** is at the top of the Email page.

* **Allow sending (once per account):** Outlook asks for the "send mail" permission, Gmail asks to allow sending (enable the Gmail API first), and a Bigpond/Yahoo/iCloud account sends through its outgoing server (SMTP) with the same password. Settings → Email shows **Allow sending** for any account that hasn't been allowed yet.
* **Send** puts the message in an outbox for 10 seconds (change it in Settings) so you can **Undo**. **Send later** schedules it; it goes out when the app is running at that time (it can stay in the tray) or the next time you open it. A message that fails to send is kept so you can retry.
* **Before you send** you get a short check: no recipient, a bad address, an empty message, a forgotten attachment, no subject.
* **Claude and Gemini** write a draft into the box; nothing is sent until you press Send. Add your keys in Settings → Assistant. The first time, you are shown exactly what will be sent: only the newest few messages, with quoted replies and signatures removed and card numbers, long numbers and link tokens hidden. Anything the AI isn't sure of is marked `[CHECK: …]` and Send stays off until you resolve it.
* **Extras:** quick replies, thread summary and deadlines, dates in an email as calendar events or tasks (with clash warnings), snooze, "remind me if no reply in N days", templates with fill-ins, a signature per account, attachments up to 10 MB (3 MB for Outlook).
* **Right-click menu:** Settings → Email → Right-click menu lets you drag items, use the arrows, or hide the ones you don't use.
* Messages sent through Bigpond/IMAP are not saved to a Sent folder in your mailbox (Outlook and Gmail save theirs).

## Folders

Right-click an email (or open it and press **Create rule + folder…**) to make a folder and a rule in one step: choose a new or existing folder
and whether it applies to this sender or everyone at their domain. Mail already in the app is filed straight away, and new mail follows the rule.
You can also **Move to folder** by hand. Folders appear beside Inbox in Email and are managed under Settings → Email → Folders; a rule can
also pick a folder in its editor. Folders live in this app only: your real mailbox is never changed. Deleting a folder sends its mail back to the Inbox views.

## If "Add other email" doesn't connect

The form explains what went wrong in plain words (password refused, needs an app password, IMAP switched off, can't reach the server, secure
connection problem), with steps and, for Yahoo, iCloud, AOL and Fastmail, a button to the page where you create an app password. If the server can't be
reached the app first tries the other likely server names for your provider by itself. "Technical detail" shows the raw message.

## Your rules

Settings → Email → **Your rules**, or the buttons under any email, let you change how mail is handled:

- **Treat as important**, **Always notify**, **Mute** (never important, no alerts) or **Send to Bills**.
- Match on a **sender** (an address like `boss@work.com`, or a whole domain like `@energyco.com`) and/or **words in the subject**
  (any word or all words). If you give both, an email must match both; for "either", make two rules.
- **Just this email**: in the reader, set one email to Important or Not important, or to a bill, without making a rule.
- After you change the same sender by hand three times, the reader offers to make it a rule.
- Your rules win over the automatic sorting, and "just this email" wins over rules. Mute wins over Important.

## Bills

The **Bills** tab lists emails that ask you to pay (bills and invoices, not receipts), with the amount and due date read from the email
when it can. For each bill: **Mark as paid** (it leaves Home and alerts; **Undo paid** brings it back), **Add to Calendar**
(an all-day event on the due date), **Add as task**, **View email**, and **Not a bill**. Settings → Email → *Bills* sets a reminder
a few days before a bill is due. "Paid" is tracked in this app only: it doesn't pay anything or change your Outlook inbox.

## Privacy

Mail is stored on this PC only (not synced to your phone, not in backups). Message text can be switched off
(*Keep message text on this device*), leaving only sender, subject and a short preview. Your sign-in is kept in the Windows
Credential Manager, not in a file. *Disconnect* removes the sign-in and clears that account's mail from this device.

## If something goes wrong

- **"redirect URI doesn't match" (AADSTS50011)**: the redirect must be registered under *Mobile and desktop applications* as `http://localhost`.
- **"invalid_client" or "public client"**: turn on *Allow public client flows* (step 6).
- **"Sign in again"** next to your account: the sign-in expired or was revoked. Press **Sign in again**.
- **Nothing appears**: press **Sync now**. Only the last 30 days are read.
