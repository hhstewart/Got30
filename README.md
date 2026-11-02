# Got 30?

Cold networking emails for college students, plus a tracker for everyone you reach out to.
This one folder is both the website and the Chrome extension. It's free: no AI, no server, no account.

## What's in here

- `index.html`: the page layout and styling
- `app.js`: everything the page does (writing emails, time zones, the tracker)
- `icons/`: the green "30" icon
- `manifest.json` and `background.js`: only used by the Chrome extension. The website ignores them.

## Update the website (GitHub Pages)

1. Open your `got30` repo on GitHub.
2. Click **Add file**, then **Upload files**.
3. Drag in everything from this folder, including the `icons` folder. Same-named files get replaced.
4. Click **Commit changes**. Your site updates at the same link in about a minute.

## Install the Chrome extension (free)

1. Unzip this folder somewhere you'll keep it, like Documents. Chrome loads it from there, so don't delete it.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder.
5. Click the puzzle piece in Chrome's toolbar and pin **Got 30?**.
6. Click the green 30 icon. Got 30? opens as a sidebar next to whatever page you're on, like LinkedIn or Gmail.

After you get a new version, replace the folder's files and click the refresh arrow on Got 30? in `chrome://extensions`.

## Using it

- **Fill in from LinkedIn (extension only):** open someone's LinkedIn profile, open the sidebar, and click "Fill in from this LinkedIn profile." It reads their name, role, firm, location (for the time zone), and whether you went to the same school. Always double-check it before sending. LinkedIn changes its pages often, so if it stops working, tell Claude.
- **Open in Gmail:** opens a Gmail draft with the subject, email, and their address already filled in.
- **Calendar invite:** in the tracker, set the call time and add their email. "Add to Google Calendar" opens the event with them as a guest. Hit Save, then Send.

## Good to know

- The tracker saves in each place separately. Your extension tracker and your website tracker are two different lists.
- Putting it in the Chrome Web Store, so anyone can install it in one click, costs a one-time $5 developer fee. Until then, friends can install it with the steps above.
