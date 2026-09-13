// Survivor pool email bulletins — runs in Google Apps Script (script.google.com).
// Sends, from your own Gmail:
//   1. a pick reminder to every player a few hours before each episode's deadline
//   2. the leaderboard every Sunday night while the season is running
// Setup is in README.md ("Email reminders").

var CONFIG = {
  projectId: "YOUR_FIREBASE_PROJECT_ID",   // Firebase console → Project settings → Project ID
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",     // same apiKey as firebase-config.js
  siteUrl: "https://conor-23.github.io/survivor-pool/",
  poolName: "Survivor 51 Pool",
  timezone: "America/New_York",            // deadlines and "Sunday night" are judged in this zone
  reminderHoursBefore: 3,                  // reminder goes out at the first hourly run inside this window
  leaderboardDay: "Sun",
  leaderboardHour: 20,                     // 8pm
};
var POINTS = { tribe: 100, title: 5, rank: [150, 75, 40] };

/* ---------------------------------------------------------------- entry points */

// Attach an hourly time-driven trigger to this function.
function tick() { run_(new Date(), null); }

// Run this by hand once to see both emails in your own inbox (nothing is recorded as sent).
function sendTestEmails() {
  var me = Session.getActiveUser().getEmail();
  var data = loadData_();
  var eps = data.episodes.slice().sort(byNumber_);
  var upcoming = eps.filter(function (e) { return e.deadline > new Date(); })[0] || eps[eps.length - 1];
  var scored = eps.filter(function (e) { return e.results && e.results.finalized; });
  if (upcoming) sendReminder_(data, upcoming, [{ id: "test", name: "Test", email: me }]);
  sendLeaderboard_(data, scored[scored.length - 1] || null, [{ id: "test", name: "Test", email: me }]);
}

// Clears the "already sent" memory (only needed if you want to resend something).
function resetSentFlags() { PropertiesService.getScriptProperties().deleteAllProperties(); }

/* ---------------------------------------------------------------- scheduler */

function run_(now, dataOverride) {
  var data = dataOverride || loadData_();
  var props = PropertiesService.getScriptProperties();
  var recipients = data.users.filter(function (u) { return u.email; });
  if (!recipients.length) return;

  data.episodes.forEach(function (ep) {
    var hours = (ep.deadline - now) / 36e5;
    var key = "reminded:" + ep.id;
    if (hours > 0 && hours <= CONFIG.reminderHoursBefore && !props.getProperty(key)) {
      sendReminder_(data, ep, recipients);
      props.setProperty(key, now.toISOString());
    }
  });

  var day = Utilities.formatDate(now, CONFIG.timezone, "EEE");
  var hour = Number(Utilities.formatDate(now, CONFIG.timezone, "H"));
  var dateKey = "leaderboard:" + Utilities.formatDate(now, CONFIG.timezone, "yyyy-MM-dd");
  if (day === CONFIG.leaderboardDay && hour >= CONFIG.leaderboardHour && !props.getProperty(dateKey)) {
    var recent = data.episodes.filter(function (e) {
      var age = (now - e.deadline) / 864e5; return age > 0 && age < 7;
    }).sort(byNumber_);
    if (recent.length) {
      sendLeaderboard_(data, recent[recent.length - 1], recipients);
      props.setProperty(dateKey, now.toISOString());
    }
  }
}

/* ---------------------------------------------------------------- emails */

function sendReminder_(data, ep, recipients) {
  var when = fmtDate_(ep.deadline);
  var subject = "Picks close at " + fmtTime_(ep.deadline) + " — Episode " + ep.number + (ep.title ? ": " + ep.title : "") + " (" + CONFIG.poolName + ")";
  recipients.forEach(function (u) {
    var has = data.picks.some(function (p) { return p.epId === ep.id && p.userId === u.id; });
    var status = has
      ? "Your picks are in. You can still change them until the deadline."
      : "You haven't submitted picks yet. No picks means no points this week.";
    var html = '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#222">'
      + "<p>Hi " + esc_(u.name) + ",</p>"
      + "<p>Episode " + ep.number + (ep.title ? " <b>“" + esc_(ep.title) + "”</b>" : "") + " airs tonight. <b>Picks lock at " + esc_(when) + ".</b></p>"
      + "<p>" + status + "</p>"
      + "<p>" + button_(has ? "Review my picks" : "Make my picks") + "</p>"
      + tip_(ep) + footer_() + "</div>";
    MailApp.sendEmail({ to: u.email, subject: subject, htmlBody: html, body: stripHtml_(html), name: CONFIG.poolName });
  });
}

function sendLeaderboard_(data, lastEp, recipients) {
  var rows = leaderboard_(data);
  var subject = (lastEp ? "Standings after Episode " + lastEp.number : "Standings") + " (" + CONFIG.poolName + ")";
  var resultLine = "";
  if (lastEp && lastEp.results && lastEp.results.finalized) {
    var r = lastEp.results;
    resultLine = "<p><b>Episode " + lastEp.number + (lastEp.title ? " “" + esc_(lastEp.title) + "”" : "") + ":</b> "
      + (lastEp.type === "finale" ? "Sole Survivor: " + esc_(castName_(data, r.winner))
        : "voted out: " + esc_((r.eliminated || []).map(function (id) { return castName_(data, id); }).join(", ") || "nobody"))
      + (r.titleSayer ? " · title line: " + esc_(castName_(data, r.titleSayer)) : "") + "</p>";
  } else if (lastEp) {
    resultLine = "<p>Episode " + lastEp.number + " hasn't been scored yet — this week's points will show up once results are entered.</p>";
  }
  var table = '<table cellpadding="6" style="border-collapse:collapse;font-size:15px">'
    + '<tr style="text-align:left;color:#666"><th>#</th><th>Player</th>' + (lastEp ? "<th>This week</th>" : "") + "<th>Total</th></tr>"
    + rows.map(function (row) {
      return '<tr style="border-top:1px solid #ddd"><td>' + row.rank + "</td><td>" + esc_(row.name) + "</td>"
        + (lastEp ? "<td>" + (row.perEp[lastEp.id] || 0) + "</td>" : "") + "<td><b>" + row.total + "</b></td></tr>";
    }).join("") + "</table>";
  recipients.forEach(function (u) {
    var mine = rows.filter(function (r) { return r.id === u.id; })[0];
    var html = '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#222">'
      + "<p>Hi " + esc_(u.name) + ",</p>" + resultLine
      + (mine ? "<p>You're in <b>" + ordinal_(mine.rank) + "</b> with <b>" + mine.total + "</b> points.</p>" : "")
      + table + "<p>" + button_("Open the pool") + "</p>" + footer_() + "</div>";
    MailApp.sendEmail({ to: u.email, subject: subject, htmlBody: html, body: stripHtml_(html), name: CONFIG.poolName });
  });
}

function tip_(ep) {
  if (ep.type === "tribes") return "<p style='color:#555'>Pick one castaway from each tribe (100 each), plus who says the title line (+5).</p>";
  if (ep.type === "finale") return "<p style='color:#555'>Rank your top three to win the season: 150 / 75 / 40.</p>";
  return "<p style='color:#555'>Rank your three most likely boots: 150 / 75 / 40, plus the title line (+5).</p>";
}
function button_(label) {
  return '<a href="' + CONFIG.siteUrl + '" style="display:inline-block;background:#f0882a;color:#1a1005;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">' + esc_(label) + "</a>";
}
function footer_() { return '<p style="color:#888;font-size:13px">' + esc_(CONFIG.poolName) + " · " + CONFIG.siteUrl + "</p>"; }

/* ---------------------------------------------------------------- scoring (mirrors app.js) */

function scorePick_(ep, pick) {
  var res = ep.results, pts = 0;
  if (!res || !res.finalized || !pick) return 0;
  var elim = {}; (res.eliminated || []).forEach(function (id) { elim[id] = true; });
  if (ep.type === "tribes") {
    Object.keys(pick.tribePicks || {}).forEach(function (t) { if (elim[pick.tribePicks[t]]) pts += POINTS.tribe; });
  } else if (ep.type === "merge") {
    (pick.rankPicks || []).forEach(function (c, i) { if (c && elim[c]) pts += POINTS.rank[i]; });
  } else if (ep.type === "finale") {
    (pick.rankPicks || []).forEach(function (c, i) { if (c && c === res.winner) pts += POINTS.rank[i]; });
  }
  if (pick.titlePick && res.titleSayer && pick.titlePick === res.titleSayer) pts += POINTS.title;
  return pts;
}
function leaderboard_(data) {
  var rows = data.users.map(function (u) {
    var perEp = {}, total = 0;
    data.episodes.forEach(function (ep) {
      var pick = data.picks.filter(function (p) { return p.epId === ep.id && p.userId === u.id; })[0];
      perEp[ep.id] = scorePick_(ep, pick); total += perEp[ep.id];
    });
    return { id: u.id, name: u.name, perEp: perEp, total: total };
  });
  rows.sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
  var rank = 0, prev = null;
  rows.forEach(function (r, i) { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
  return rows;
}
function castName_(data, id) {
  var c = (data.season && data.season.cast || []).filter(function (c) { return c.id === id; })[0];
  return c ? c.name : (id || "—");
}

/* ---------------------------------------------------------------- Firestore (REST, read-only) */

function loadData_() {
  var seasonDocs = fetchCollection_("season");
  return {
    season: seasonDocs.filter(function (d) { return d.id === "current"; })[0] || null,
    episodes: fetchCollection_("episodes").map(function (e) { e.deadline = new Date(e.deadline); return e; }),
    users: fetchCollection_("users"),
    picks: fetchCollection_("picks"),
  };
}
function fetchCollection_(name) {
  var base = "https://firestore.googleapis.com/v1/projects/" + CONFIG.projectId + "/databases/(default)/documents/" + name;
  var docs = [], pageToken = "";
  do {
    var url = base + "?pageSize=300&key=" + CONFIG.apiKey + (pageToken ? "&pageToken=" + pageToken : "");
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("Firestore " + name + ": HTTP " + res.getResponseCode() + " " + res.getContentText().slice(0, 200));
    var body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) {
      var obj = decodeFields_(d.fields || {}); obj.id = d.name.split("/").pop(); docs.push(obj);
    });
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}
function decodeFields_(fields) { var o = {}; Object.keys(fields).forEach(function (k) { o[k] = decodeValue_(fields[k]); }); return o; }
function decodeValue_(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return decodeFields_(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue_);
  return null;
}

/* ---------------------------------------------------------------- helpers */

function byNumber_(a, b) { return a.number - b.number; }
function fmtDate_(d) { return Utilities.formatDate(d, CONFIG.timezone, "EEEE, MMMM d 'at' h:mm a z"); }
function fmtTime_(d) { return Utilities.formatDate(d, CONFIG.timezone, "h:mm a z"); }
function ordinal_(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function esc_(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function stripHtml_(h) { return h.replace(/<\/p>/g, "\n\n").replace(/<\/tr>/g, "\n").replace(/<\/t[hd]>/g, "  ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim() + "\n"; }
