# Connect your Outlook / Hotmail email

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

## What shows up where

- **Home → Important mail**: unread email that asks you something or is time-sensitive, mail from people in your Contacts, and
  bills or bank alerts that need attention. Change this under *What counts as important*.
- **Desktop notification** for new important mail while the app is open, an unread count next to **Email** in the menu, and a
  **daily summary** each morning.
- **Junk and subscriptions** (newsletters, mailing lists) never appear on Home or in alerts. They stay in their own folders in the
  Email page. Nothing is deleted, and nothing in Outlook is changed.

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
