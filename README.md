# Survivor 51 Pool

A tiny, free website for a friends' Survivor pool. Everyone submits picks before each
episode airs, the commissioner enters the results afterwards, and the leaderboard updates.

- **Pre-merge:** pick one castaway from each tribe. Each correct pick = **100**.
- **Post-merge:** rank three likely boots. **150 / 75 / 40** for #1 / #2 / #3.
- **Finale:** rank three castaways to win. Same 150 / 75 / 40.
- **Title bonus:** every episode, guess who says the line that becomes the title. **+5**.
- Picks lock automatically at each episode's deadline and are hidden from other players until then.

It is plain HTML/CSS/JS, hosted on GitHub Pages, with data stored in Firebase Firestore
(free Spark plan). No build step, no server.

## One-time setup (about 10 minutes)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com>, **Add project**, name it anything (e.g. `survivor-pool`). Google Analytics can be off.
2. In the left menu open **Build → Firestore Database → Create database**. Pick a location, choose **Start in production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and **Publish**.
4. Go to **Project settings** (gear icon) → **Your apps** → click the web icon **`</>`** → register the app (no hosting needed) → copy the `firebaseConfig` object.

### 2. Put the config in the site
Paste the copied object into [`firebase-config.js`](firebase-config.js), replacing the placeholder. Commit and push:

```bash
git add firebase-config.js && git commit -m "Add Firebase config" && git push
```

The `apiKey` is not a secret; it only identifies the project. Access is governed by the Firestore rules.

### 3. Initialize the season
Open the site, go to the **Admin** tab, choose an admin PIN and click **Initialize**.
That loads the Survivor 51 cast, the two starting tribes and episode 1 (deadline: premiere night, 8pm ET).

Share the site link with your friends. Each of them picks **New player**, types their name and chooses a PIN.

## Weekly routine (commissioner)
1. **Before the episode:** in Admin, make sure the upcoming episode exists with the right title and format. **Add episode** defaults to one week after the previous deadline.
2. **After the episode:** open that episode in Admin, tick who was voted out (or the winner for the finale), select who said the title line, tick **Finalized**, **Save episode**. Scores update instantly for everyone.
3. **Tribe swap:** change tribe assignments in **Cast & tribes**. Add or rename tribes there too.
4. **Merge:** create the next episode with the **Post-merge** format. Tribes are ignored from then on.
5. **Finale:** create it with the **Finale** format and set the winner in its results.

Forgot a PIN? Admin → Players → **Reset PIN**. The player sets a new one next time they log in.

## Running locally
Any static server works, for example:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. With the placeholder config the site runs in **demo mode** and stores everything in your browser's localStorage, which is handy for trying it out.

## Notes
- The admin PIN is checked in the browser, so a determined friend with the console open could edit results. The deadline on picks, however, is enforced server-side by the Firestore rules, so nobody can change picks after an episode airs.
- Free tier limits (50k reads/day) are far beyond what a friends pool uses.
