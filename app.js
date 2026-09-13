// Survivor pool — single-file app. Data lives in Firestore (or localStorage in demo mode).
import { firebaseConfig } from "./firebase-config.js";

/* ---------------------------------------------------------------- constants */
const POINTS = { tribe: 100, title: 5, rank: [150, 75, 40] };
const PURPLE = "purple", YELLOW = "yellow";
const DEFAULT_SEASON = {
  name: "Survivor 51",
  tribes: [
    { id: PURPLE, name: "Purple Tribe", color: "#8e4fd1" },
    { id: YELLOW, name: "Yellow Tribe", color: "#f2c12e" },
  ],
  cast: [
    ["Alexis Levine", PURPLE], ["Ana Sani", PURPLE], ["Carter Krull", PURPLE],
    ["Cristian Chavez", PURPLE], ["Eric Macksoud", PURPLE], ["Kristin Flickinger", PURPLE],
    ["Linnea Capobianco", PURPLE], ["Ori Jean-Charles", PURPLE], ["Rob Antonson", PURPLE],
    ["Sharonda Cox", PURPLE],
    ["Aaliyah Puglia", YELLOW], ["Thien An Nguyen", YELLOW], ["Angelica \"Jelly\" Loblack", YELLOW],
    ["Brady Booker", YELLOW], ["Danny Kilby", YELLOW], ["Devin Way", YELLOW],
    ["Jenna Doore", YELLOW], ["Lewis Kelly", YELLOW], ["Maggie Nestor", YELLOW],
    ["Mike Pinsky", YELLOW], ["Patt Cannaday", YELLOW],
  ].map(([name, tribe]) => ({ id: slug(name), name, tribe, out: null })),
};
// Premiere: Wed Sep 23 2026, 8pm ET.
const DEFAULT_EPISODE = { id: "ep01", number: 1, title: "Permanent Uncertainty", type: "tribes",
  deadline: new Date("2026-09-24T00:00:00Z"), results: null };
const TYPE_LABEL = { tribes: "Pre-merge (one pick per tribe)", merge: "Post-merge (rank 3 boots)", finale: "Finale (rank 3 winners)" };

/* ------------------------------------------------------------------ helpers */
function slug(s) { return s.toLowerCase().replace(/["'.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toDate(v) { if (!v) return null; if (v.toDate) return v.toDate(); if (v.seconds) return new Date(v.seconds * 1000); return new Date(v); }
function fmtDate(d) { d = toDate(d); return d ? d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; }
function toLocalInput(d) { d = toDate(d); if (!d) return ""; const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function countdown(d) { const ms = toDate(d) - Date.now(); if (ms <= 0) return "closed"; const m = Math.floor(ms / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (days > 0) return `${days}d ${h % 24}h`; if (h > 0) return `${h}h ${m % 60}m`; return `${m}m`; }
async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const byNumber = (a, b) => a.number - b.number;
function epId(n) { return "ep" + String(n).padStart(2, "0"); }

/* -------------------------------------------------------------------- store */
// Two backends with one tiny interface: watch(col, cb), set(col, id, data, merge), del(col, id).
const configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "PASTE_ME";
let store;
async function makeStore() {
  if (configured) {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js");
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const db = fs.getFirestore(initializeApp(firebaseConfig));
    return {
      kind: "firestore",
      watch(col, cb) { return fs.onSnapshot(fs.collection(db, col), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => showError(err.message)); },
      set(col, id, data, merge = false) { return fs.setDoc(fs.doc(db, col, id), data, { merge }); },
      del(col, id) { return fs.deleteDoc(fs.doc(db, col, id)); },
    };
  }
  // Demo / local backend: persists in this browser only.
  const KEY = "survivor-pool-demo";
  const data = JSON.parse(localStorage.getItem(KEY) || "{}");
  const listeners = {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const emit = col => (listeners[col] || []).forEach(cb => cb(Object.entries(data[col] || {}).map(([id, d]) => ({ id, ...d }))));
  return {
    kind: "demo",
    watch(col, cb) { (listeners[col] ||= []).push(cb); setTimeout(() => emit(col), 0); return () => {}; },
    async set(col, id, d, merge = false) { data[col] ||= {}; data[col][id] = merge ? { ...(data[col][id] || {}), ...d } : d; save(); emit(col); },
    async del(col, id) { if (data[col]) delete data[col][id]; save(); emit(col); },
  };
}

/* -------------------------------------------------------------------- state */
const S = {
  season: undefined, episodes: [], users: [], picks: [],
  me: JSON.parse(localStorage.getItem("sp-me") || "null"),
  admin: sessionStorage.getItem("sp-admin") === "1",
  tab: location.hash.replace("#", "") || "picks",
  selectedEp: null, loaded: { season: false, episodes: false, users: false, picks: false },
};
const $ = sel => document.querySelector(sel);
const view = $("#view");

function showError(msg) { const b = $("#banner"); b.hidden = false; b.innerHTML = `<b>Error:</b> ${esc(msg)}`; }

/* ------------------------------------------------------------------ scoring */
// Points a single pick earned for an episode. Scored only once results are finalized.
function scorePick(ep, pick) {
  const res = ep.results; const out = { pts: 0, hits: new Set(), titleHit: false };
  if (!res || !res.finalized || !pick) return out;
  const elim = new Set(res.eliminated || []);
  if (ep.type === "tribes") {
    for (const c of Object.values(pick.tribePicks || {})) if (elim.has(c)) { out.pts += POINTS.tribe; out.hits.add(c); }
  } else if (ep.type === "merge") {
    (pick.rankPicks || []).forEach((c, i) => { if (c && elim.has(c)) { out.pts += POINTS.rank[i]; out.hits.add(c); } });
  } else if (ep.type === "finale") {
    (pick.rankPicks || []).forEach((c, i) => { if (c && c === res.winner) { out.pts += POINTS.rank[i]; out.hits.add(c); } });
  }
  if (pick.titlePick && res.titleSayer && pick.titlePick === res.titleSayer) { out.pts += POINTS.title; out.titleHit = true; }
  return out;
}
function pickFor(ep, userId) { return S.picks.find(p => p.epId === ep.id && p.userId === userId); }
function totals() {
  const t = {}; for (const u of S.users) t[u.id] = { total: 0, perEp: {} };
  for (const ep of S.episodes) for (const u of S.users) {
    const sc = scorePick(ep, pickFor(ep, u.id)); t[u.id].perEp[ep.id] = sc.pts; t[u.id].total += sc.pts;
  }
  return t;
}

/* -------------------------------------------------------------- cast helpers */
const cast = () => S.season?.cast || [];
const castName = id => cast().find(c => c.id === id)?.name || (id ? "?" : "—");
const tribeOf = id => S.season?.tribes.find(t => t.id === id);
// Alive for a given episode: not out, or out in that same episode (so results forms can list them).
const aliveFor = ep => cast().filter(c => !c.out || c.out === ep?.id);
const isLocked = ep => toDate(ep.deadline) <= new Date();
function currentEpisode() {
  const eps = [...S.episodes].sort(byNumber);
  return eps.find(e => !isLocked(e)) || eps[eps.length - 1] || null;
}

/* ------------------------------------------------------------------- render */
function preserveForms(fn) {
  const saved = {}; view.querySelectorAll("[name]").forEach(el => { saved[el.name] = el.type === "checkbox" ? el.checked : el.value; });
  const active = document.activeElement?.name;
  const open = [...view.querySelectorAll("details[data-ep-details][open]")].map(d => d.dataset.epDetails);
  fn();
  open.forEach(id => { const d = view.querySelector(`details[data-ep-details="${id}"]`); if (d) d.open = true; });
  view.querySelectorAll("[name]").forEach(el => { if (el.name in saved && !el.dataset.noPreserve) { if (el.type === "checkbox") el.checked = saved[el.name]; else el.value = saved[el.name]; } });
  if (active) view.querySelector(`[name="${active}"]`)?.focus();
}
function render() {
  $("#season-name").textContent = S.season?.name || "Survivor Pool";
  $("#who").innerHTML = S.me ? `Playing as <b>${esc(S.me.name)}</b> <button class="btn secondary sm" id="logout">Switch</button>` : "";
  $("#logout")?.addEventListener("click", () => { S.me = null; localStorage.removeItem("sp-me"); render(); });
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === S.tab));
  const ready = Object.values(S.loaded).every(Boolean);
  preserveForms(() => {
    if (!ready) { view.innerHTML = `<p class="muted">Loading…</p>`; return; }
    if (!S.season && S.tab !== "admin") { view.innerHTML = `<div class="card"><h2>Not set up yet</h2><p>The commissioner needs to initialize the season in the <a href="#admin" data-go="admin">Admin</a> tab.</p></div>`; return; }
    ({ picks: renderPicks, board: renderBoard, episodes: renderEpisodes, admin: renderAdmin })[S.tab]();
  });
  view.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.go); }));
}
function go(tab) { S.tab = tab; location.hash = tab; render(); }

/* ------------------------------------------------------------- picks tab */
function renderPicks() {
  if (S.me && !S.users.some(u => u.id === S.me.id)) { S.me = null; localStorage.removeItem("sp-me"); }
  if (!S.me) return renderLogin();
  const ep = currentEpisode();
  if (!ep) { view.innerHTML = `<div class="card"><p class="muted">No episodes yet. Check back soon.</p></div>`; return; }
  const locked = isLocked(ep);
  const mine = pickFor(ep, S.me.id);
  if (locked) {
    view.innerHTML = `<p class="countdown">Picks <b>closed</b> ${fmtDate(ep.deadline)}. ${mine ? "Your picks are in." : "You didn't submit picks for this episode."} The next episode will appear here once the commissioner adds it.</p>` + episodeTable(ep);
    return;
  }
  let html = `<div class="card">
    <div class="ep-head"><h2>Episode ${ep.number}: ${esc(ep.title || "TBA")}</h2><span class="pill">${esc(TYPE_LABEL[ep.type])}</span></div>
    <p class="countdown">Picks close <b>${fmtDate(ep.deadline)}</b> (in ${countdown(ep.deadline)})</p>`;
  html += `<form id="pick-form">`;
  if (ep.type === "tribes") {
    for (const t of S.season.tribes) {
      const members = aliveFor(ep).filter(c => c.tribe === t.id);
      if (!members.length) continue;
      html += `<div class="card" style="margin:.75rem 0"><h3><span class="tribe-dot" style="background:${esc(t.color)}"></span>${esc(t.name)} — who goes home?</h3>
        ${selectHtml(`tribe_${t.id}`, members, mine?.tribePicks?.[t.id], "Nobody from this tribe")}</div>`;
    }
  } else {
    const alive = aliveFor(ep);
    const q = ep.type === "finale" ? "Who wins the season?" : "Who goes home?";
    html += `<div class="card" style="margin:.75rem 0"><h3>${q} Rank your top 3.</h3><div class="grid">`;
    POINTS.rank.forEach((pts, i) => { html += `<div><label>#${i + 1} (${pts} pts)</label>${selectHtml(`rank_${i}`, alive, mine?.rankPicks?.[i], "Choose…")}</div>`; });
    html += `</div></div>`;
  }
  html += `<div class="card" style="margin:.75rem 0"><h3>Title bonus (+${POINTS.title}): who says the line that becomes the episode title?</h3>
    ${ep.title ? `<p class="muted">This episode is called <b>“${esc(ep.title)}”</b>.</p>` : `<p class="muted">Title not announced yet.</p>`}
    ${selectHtml("title", aliveFor(ep), mine?.titlePick, "Skip this bonus")}</div>
    <div class="actions"><button class="btn" type="submit">${mine ? "Update picks" : "Submit picks"}</button>
    ${mine ? `<span class="pill good">Submitted ${fmtDate(mine.submittedAt)}</span>` : ""}</div>
    <div class="status-msg" id="pick-status"></div></form></div>`;
  view.innerHTML = html;
  $("#pick-form").addEventListener("submit", e => { e.preventDefault(); submitPicks(ep); });
}
function selectHtml(name, options, value, blank) {
  return `<select name="${name}"><option value="">${esc(blank)}</option>${options.map(c => `<option value="${c.id}" ${c.id === value ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
}
async function submitPicks(ep) {
  const f = new FormData($("#pick-form")); const status = $("#pick-status"); status.className = "status-msg";
  const pick = { epId: ep.id, userId: S.me.id, userName: S.me.name, titlePick: f.get("title") || null, submittedAt: new Date() };
  if (ep.type === "tribes") {
    pick.tribePicks = {}; for (const t of S.season.tribes) { const v = f.get(`tribe_${t.id}`); if (v) pick.tribePicks[t.id] = v; }
    if (!Object.keys(pick.tribePicks).length) return fail("Pick at least one castaway.");
  } else {
    pick.rankPicks = POINTS.rank.map((_, i) => f.get(`rank_${i}`) || null);
    const chosen = pick.rankPicks.filter(Boolean);
    if (chosen.length !== 3) return fail("Pick three castaways.");
    if (new Set(chosen).size !== 3) return fail("Your three picks must be different people.");
  }
  if (isLocked(ep)) return fail("Too late, picks are closed.");
  try { await store.set("picks", `${ep.id}__${S.me.id}`, pick); status.textContent = "Saved. Good luck!"; status.classList.add("ok"); }
  catch (e) { fail(e.code === "permission-denied" ? "Picks are closed for this episode." : e.message); }
  function fail(m) { status.textContent = m; status.classList.add("err"); }
}

/* ---------------------------------------------------------------- login */
function renderLogin() {
  const users = [...S.users].sort((a, b) => a.name.localeCompare(b.name));
  view.innerHTML = `<div class="card"><h2>Who are you?</h2>
    <form id="login-form"><div class="row">
      <div><label>Player</label><select name="user"><option value="">New player…</option>${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>
      <div id="newname"><label>Your name</label><input type="text" name="name" placeholder="e.g. Conor" maxlength="30"></div>
      <div id="emailbox"><label>Email (for pick reminders)</label><input type="email" name="email" placeholder="you@example.com" autocomplete="email"></div>
      <div><label>PIN (4+ digits)</label><input type="password" name="pin" inputmode="numeric" autocomplete="off" placeholder="••••"></div>
      <div><button class="btn" type="submit">Continue</button></div>
    </div><p class="small muted">First time? Leave “New player” selected, enter your name and email, and choose a PIN. You'll use the PIN to get back to your picks. Forgot it? Ask the commissioner to reset it. Your email is only used for the reminder before each episode and the Sunday leaderboard.</p>
    <div class="status-msg" id="login-status"></div></form></div>`;
  const sel = view.querySelector("[name=user]"), nn = $("#newname"), eb = $("#emailbox");
  const sync = () => { const u = users.find(u => u.id === sel.value); nn.classList.toggle("hidden", !!sel.value); eb.classList.toggle("hidden", !!(u && u.email)); };
  sel.addEventListener("change", sync); sync();
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.target); const st = $("#login-status"); st.className = "status-msg err";
    const pin = String(f.get("pin") || "").trim(); if (pin.length < 4) return st.textContent = "PIN must be at least 4 characters.";
    let id = f.get("user"), name;
    const email = String(f.get("email") || "").trim().toLowerCase();
    const emailOk = /^\S+@\S+\.\S+$/.test(email);
    if (id) { const u = users.find(u => u.id === id); name = u.name; if (u.pinHash && u.pinHash !== await sha256(`${id}:${pin}`)) return st.textContent = "Wrong PIN.";
      const upd = {}; if (!u.pinHash) upd.pinHash = await sha256(`${id}:${pin}`);
      if (!u.email) { if (!emailOk) return st.textContent = "Enter a valid email so you get the reminders."; upd.email = email; }
      if (Object.keys(upd).length) await store.set("users", id, upd, true); }
    else { name = String(f.get("name") || "").trim(); if (!name) return st.textContent = "Enter your name."; id = slug(name);
      if (!id) return st.textContent = "Pick a name with some letters in it.";
      if (users.some(u => u.id === id)) return st.textContent = "That name is taken. Select it from the list instead.";
      if (!emailOk) return st.textContent = "Enter a valid email so you get the reminders.";
      await store.set("users", id, { name, email, pinHash: await sha256(`${id}:${pin}`), createdAt: new Date() }); }
    S.me = { id, name }; localStorage.setItem("sp-me", JSON.stringify(S.me)); render();
  });
}

/* ------------------------------------------------------------ leaderboard */
function renderBoard() {
  const t = totals(); const scored = [...S.episodes].sort(byNumber).filter(e => e.results?.finalized);
  const users = [...S.users].sort((a, b) => t[b.id].total - t[a.id].total || a.name.localeCompare(b.name));
  if (!users.length) { view.innerHTML = `<div class="card"><p class="muted">No players yet.</p></div>`; return; }
  let rank = 0, prev = null;
  const rows = users.map((u, i) => { if (t[u.id].total !== prev) { rank = i + 1; prev = t[u.id].total; }
    return `<tr class="${S.me?.id === u.id ? "me" : ""}"><td class="num">${rank}</td><td>${esc(u.name)}</td>
      ${scored.map(e => `<td class="num muted">${t[u.id].perEp[e.id] || 0}</td>`).join("")}<td class="num"><b>${t[u.id].total}</b></td></tr>`; }).join("");
  view.innerHTML = `<div class="card"><h2>Leaderboard</h2>${scored.length ? "" : `<p class="muted">No episodes scored yet.</p>`}
    <div class="table-wrap"><table><thead><tr><th class="num">#</th><th>Player</th>${scored.map(e => `<th class="num" title="${esc(e.title)}">E${e.number}</th>`).join("")}<th class="num">Total</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

/* --------------------------------------------------------------- episodes */
function renderEpisodes() {
  const eps = [...S.episodes].sort(byNumber);
  if (!eps.length) { view.innerHTML = `<div class="card"><p class="muted">No episodes yet.</p></div>`; return; }
  const sel = eps.find(e => e.id === S.selectedEp) || [...eps].reverse().find(isLocked) || eps[0];
  view.innerHTML = `<div class="card"><div class="row"><div><label>Episode</label><select name="ep-select" data-no-preserve="1">${eps.map(e => `<option value="${e.id}" ${e.id === sel.id ? "selected" : ""}>E${e.number}: ${esc(e.title || "TBA")}${e.results?.finalized ? " ✓" : isLocked(e) ? " (awaiting results)" : " (open)"}</option>`).join("")}</select></div></div></div>` + episodeTable(sel) + castCard();
  view.querySelector("[name=ep-select]").addEventListener("change", e => { S.selectedEp = e.target.value; render(); });
}
function episodeTable(ep) {
  if (!isLocked(ep)) return `<div class="card"><p class="muted">Everyone's picks are hidden until the deadline (${fmtDate(ep.deadline)}).</p></div>`;
  const res = ep.results; const t = totals();
  const users = [...S.users].sort((a, b) => (scorePick(ep, pickFor(ep, b.id)).pts - scorePick(ep, pickFor(ep, a.id)).pts) || a.name.localeCompare(b.name));
  let summary = res?.finalized
    ? `<p>${ep.type === "finale" ? `<b>Sole Survivor:</b> ${esc(castName(res.winner))}` : `<b>Voted out:</b> ${(res.eliminated || []).map(castName).map(esc).join(", ") || "nobody"}`}
       &nbsp;·&nbsp; <b>Title line:</b> ${res.titleSayer ? esc(castName(res.titleSayer)) : "—"}</p>`
    : `<p class="muted">Results not entered yet.</p>`;
  const rows = users.map(u => { const p = pickFor(ep, u.id); const sc = scorePick(ep, p);
    const mark = id => `<span class="${!res?.finalized ? "" : sc.hits.has(id) ? "hit" : "miss"}">${esc(castName(id))}</span>`;
    let picks = `<span class="muted">no picks</span>`;
    if (p && ep.type === "tribes") picks = `<ul class="pick-list">${S.season.tribes.filter(tr => p.tribePicks?.[tr.id]).map(tr => `<li><span class="tribe-dot" style="background:${esc(tr.color)}"></span>${mark(p.tribePicks[tr.id])}</li>`).join("")}</ul>`;
    else if (p) picks = `<ul class="pick-list">${(p.rankPicks || []).map((c, i) => `<li><span class="rank-badge">${i + 1}</span>${mark(c)}</li>`).join("")}</ul>`;
    const title = p?.titlePick ? `<span class="${!res?.finalized ? "" : sc.titleHit ? "hit" : "miss"}">${esc(castName(p.titlePick))}</span>` : `<span class="muted">—</span>`;
    return `<tr class="${S.me?.id === u.id ? "me" : ""}"><td>${esc(u.name)}</td><td>${picks}</td><td>${title}</td><td class="num"><b>${res?.finalized ? sc.pts : "—"}</b></td><td class="num muted">${t[u.id].total}</td></tr>`; }).join("");
  return `<div class="card"><div class="ep-head"><h2>Episode ${ep.number}: ${esc(ep.title || "TBA")}</h2><span class="pill">${esc(TYPE_LABEL[ep.type])}</span></div>${summary}
    <div class="table-wrap"><table><thead><tr><th>Player</th><th>Picks</th><th>Title line</th><th class="num">Pts</th><th class="num">Season</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="muted">No players yet.</td></tr>`}</tbody></table></div></div>`;
}
function castCard() {
  const eps = Object.fromEntries(S.episodes.map(e => [e.id, e]));
  const groups = S.season.tribes.map(t => ({ t, m: cast().filter(c => c.tribe === t.id) })).filter(g => g.m.length);
  const loose = cast().filter(c => !tribeOf(c.tribe));
  if (loose.length) groups.push({ t: { name: "No tribe", color: "#777" }, m: loose });
  return `<div class="card"><h2>Cast</h2><div class="grid">${groups.map(g => `<div><h3><span class="tribe-dot" style="background:${esc(g.t.color)}"></span>${esc(g.t.name)}</h3>
    ${g.m.map(c => `<div class="${c.out ? "cast-out" : ""}">${esc(c.name)} ${c.out ? `<span class="pill bad">out E${eps[c.out]?.number ?? "?"}</span>` : ""}</div>`).join("")}</div>`).join("")}</div></div>`;
}

/* ------------------------------------------------------------------ admin */
function renderAdmin() {
  if (!S.season) {
    view.innerHTML = `<div class="card"><h2>Set up the season</h2><p>This loads the ${DEFAULT_SEASON.name} cast and tribes (you can edit them afterwards) and creates episode 1.</p>
      <form id="init-form"><div class="row"><div><label>Choose an admin PIN</label><input type="password" name="apin" autocomplete="off"></div><div><button class="btn" type="submit">Initialize</button></div></div>
      <div class="status-msg err" id="init-status"></div></form></div>`;
    $("#init-form").addEventListener("submit", async e => { e.preventDefault(); const pin = new FormData(e.target).get("apin").trim();
      if (pin.length < 4) return $("#init-status").textContent = "PIN must be at least 4 characters.";
      await store.set("season", "current", { ...DEFAULT_SEASON, adminHash: await sha256("admin:" + pin) });
      await store.set("episodes", DEFAULT_EPISODE.id, DEFAULT_EPISODE);
      S.admin = true; sessionStorage.setItem("sp-admin", "1"); render(); });
    return;
  }
  if (!S.admin) {
    view.innerHTML = `<div class="card"><h2>Admin</h2><form id="admin-login"><div class="row"><div><label>Admin PIN</label><input type="password" name="apin" autocomplete="off"></div><div><button class="btn" type="submit">Unlock</button></div></div><div class="status-msg err" id="al-status"></div></form></div>`;
    $("#admin-login").addEventListener("submit", async e => { e.preventDefault(); const pin = new FormData(e.target).get("apin").trim();
      if (await sha256("admin:" + pin) !== S.season.adminHash) return $("#al-status").textContent = "Wrong PIN.";
      S.admin = true; sessionStorage.setItem("sp-admin", "1"); render(); });
    return;
  }
  const eps = [...S.episodes].sort(byNumber); const last = eps[eps.length - 1];
  const nextNum = (last?.number || 0) + 1; const nextDeadline = last ? new Date(toDate(last.deadline).getTime() + 7 * 864e5) : new Date();
  view.innerHTML = `
  <div class="card"><div class="ep-head"><h2>Episodes</h2><button class="btn secondary sm" id="admin-lock">Lock admin</button></div>
    ${eps.map(e => adminEpisodeHtml(e)).join("")}
    <h3 style="margin-top:1rem">Add episode ${nextNum}</h3>
    <form id="add-ep"><div class="row">
      <div><label>Title (leave blank if unknown)</label><input type="text" name="new-title"></div>
      <div><label>Format</label><select name="new-type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === (last?.type || "tribes") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label>Picks lock at</label><input type="datetime-local" name="new-deadline" value="${toLocalInput(nextDeadline)}"></div>
      <div><button class="btn" type="submit">Add</button></div></div></form>
  </div>
  <div class="card"><h2>Cast &amp; tribes</h2>
    <p class="small muted">Change tribe assignments here after a swap. After the merge, tribes no longer matter; just set new episodes to the post-merge format.</p>
    <div class="table-wrap"><table><thead><tr><th>Castaway</th><th>Tribe</th><th>Status</th><th></th></tr></thead><tbody>
    ${cast().map(c => `<tr class="${c.out ? "cast-out" : ""}"><td>${esc(c.name)}</td>
      <td><select data-cast-tribe="${c.id}">${S.season.tribes.map(t => `<option value="${t.id}" ${t.id === c.tribe ? "selected" : ""}>${esc(t.name)}</option>`).join("")}<option value="" ${!tribeOf(c.tribe) ? "selected" : ""}>No tribe</option></select></td>
      <td>${c.out ? `<span class="pill bad">Out (${esc(eps.find(e => e.id === c.out)?.title ? "E" + eps.find(e => e.id === c.out).number : c.out)})</span>` : `<span class="pill good">In</span>`}</td>
      <td><button class="btn danger sm" data-cast-remove="${c.id}">Remove</button></td></tr>`).join("")}
    </tbody></table></div>
    <form id="add-cast" class="row" style="margin-top:.75rem"><div><label>Add castaway</label><input type="text" name="cast-name" placeholder="Name"></div>
      <div><label>Tribe</label><select name="cast-tribe">${S.season.tribes.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div><div><button class="btn secondary" type="submit">Add</button></div></form>
    <h3 style="margin-top:1rem">Tribes</h3>
    ${S.season.tribes.map(t => `<div class="row" style="margin-bottom:.5rem"><div><input type="text" data-tribe-name="${t.id}" value="${esc(t.name)}"></div><div style="flex:0 0 70px"><input type="color" data-tribe-color="${t.id}" value="${esc(t.color)}"></div><div style="flex:0 0 auto"><button class="btn danger sm" data-tribe-remove="${t.id}">Remove</button></div></div>`).join("")}
    <form id="add-tribe" class="row"><div><label>New tribe name</label><input type="text" name="tribe-name" placeholder="e.g. Merged tribe"></div><div style="flex:0 0 70px"><label>Color</label><input type="color" name="tribe-color" value="#2e8b57"></div><div style="flex:0 0 auto"><button class="btn secondary" type="submit">Add</button></div></form>
    <div class="actions"><button class="btn" id="save-tribes">Save tribe names &amp; colors</button></div>
  </div>
  <div class="card"><h2>Players</h2>
    ${S.users.length ? `<div class="table-wrap"><table><tbody>${S.users.map(u => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email || "no email")}</div></td><td><button class="btn secondary sm" data-reset-pin="${u.id}">Reset PIN</button> <button class="btn danger sm" data-remove-user="${u.id}">Remove</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nobody has joined yet.</p>`}
  </div>
  <div class="card"><h2>Settings</h2>
    <form id="settings" class="row"><div><label>Pool name</label><input type="text" name="season-name" value="${esc(S.season.name)}"></div>
      <div><label>New admin PIN (optional)</label><input type="password" name="new-apin" autocomplete="off"></div><div><button class="btn" type="submit">Save</button></div></form>
    <div class="status-msg" id="settings-status"></div>
    <p class="small muted">Data backend: <b>${store.kind === "demo" ? "local demo (this browser only)" : "Firebase"}</b>.</p>
  </div>`;
  wireAdmin(eps, nextNum);
}
function adminEpisodeHtml(e) {
  const candidates = aliveFor(e); const res = e.results || {}; const elim = new Set(res.eliminated || []);
  const locked = isLocked(e);
  return `<details class="admin-ep" data-ep-details="${e.id}"><summary>E${e.number}: ${esc(e.title || "TBA")} <span class="pill ${res.finalized ? "good" : locked ? "warn" : ""}">${res.finalized ? "scored" : locked ? "locked, needs results" : "open until " + fmtDate(e.deadline)}</span></summary>
    <form data-ep-form="${e.id}">
      <div class="row" style="margin-top:.5rem"><div><label>Title</label><input type="text" name="title-${e.id}" value="${esc(e.title || "")}"></div>
        <div><label>Format</label><select name="type-${e.id}">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div><label>Picks lock at</label><input type="datetime-local" name="deadline-${e.id}" value="${toLocalInput(e.deadline)}"></div></div>
      <h3 style="margin-top:.75rem">Results</h3>
      ${e.type === "finale"
        ? `<label>Sole Survivor</label>${selectHtml(`winner-${e.id}`, candidates, res.winner, "Not decided yet")}`
        : `<label>Voted out / left the game this episode (check all that apply)</label><div class="checks">${candidates.map(c => `<label><input type="checkbox" name="elim-${e.id}-${c.id}" ${elim.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}</div>`}
      <div class="row"><div><label>Who said the title line?</label>${selectHtml(`title-sayer-${e.id}`, candidates, res.titleSayer, "Unknown / nobody")}</div>
        <div style="flex:0 0 auto"><label>&nbsp;</label><label style="color:var(--text)"><input type="checkbox" name="final-${e.id}" ${res.finalized ? "checked" : ""}> Finalized (counts toward scores)</label></div></div>
      <div class="actions"><button class="btn" type="submit">Save episode</button><button class="btn danger sm" type="button" data-ep-delete="${e.id}">Delete episode</button><span class="status-msg" data-ep-status="${e.id}"></span></div>
    </form></details>`;
}
function wireAdmin(eps, nextNum) {
  $("#admin-lock").addEventListener("click", () => { S.admin = false; sessionStorage.removeItem("sp-admin"); render(); });
  $("#add-ep").addEventListener("submit", async e => { e.preventDefault(); const f = new FormData(e.target);
    const deadline = new Date(f.get("new-deadline")); if (isNaN(deadline)) return alert("Enter a deadline.");
    await store.set("episodes", epId(nextNum), { number: nextNum, title: String(f.get("new-title") || "").trim(), type: f.get("new-type"), deadline, results: null });
    e.target.reset(); });
  view.querySelectorAll("[data-ep-form]").forEach(form => form.addEventListener("submit", async ev => { ev.preventDefault(); await saveEpisode(form.dataset.epForm, new FormData(form)); }));
  view.querySelectorAll("[data-ep-delete]").forEach(b => b.addEventListener("click", async () => { const id = b.dataset.epDelete;
    if (!confirm("Delete this episode? Picks for it will no longer count.")) return;
    const c = cast().map(x => x.out === id ? { ...x, out: null } : x); await store.set("season", "current", { cast: c }, true); await store.del("episodes", id); }));
  view.querySelectorAll("[data-cast-tribe]").forEach(s => s.addEventListener("change", async () => { const c = cast().map(x => x.id === s.dataset.castTribe ? { ...x, tribe: s.value } : x); await store.set("season", "current", { cast: c }, true); }));
  view.querySelectorAll("[data-cast-remove]").forEach(b => b.addEventListener("click", async () => { if (!confirm(`Remove ${castName(b.dataset.castRemove)} from the cast?`)) return;
    await store.set("season", "current", { cast: cast().filter(x => x.id !== b.dataset.castRemove) }, true); }));
  $("#add-cast").addEventListener("submit", async e => { e.preventDefault(); const f = new FormData(e.target); const name = String(f.get("cast-name") || "").trim(); if (!name) return;
    const id = slug(name); if (cast().some(c => c.id === id)) return alert("Already in the cast.");
    await store.set("season", "current", { cast: [...cast(), { id, name, tribe: f.get("cast-tribe"), out: null }] }, true); e.target.reset(); });
  view.querySelectorAll("[data-tribe-remove]").forEach(b => b.addEventListener("click", async () => { if (!confirm("Remove this tribe? Its members will have no tribe until reassigned.")) return;
    await store.set("season", "current", { tribes: S.season.tribes.filter(t => t.id !== b.dataset.tribeRemove) }, true); }));
  $("#add-tribe").addEventListener("submit", async e => { e.preventDefault(); const f = new FormData(e.target); const name = String(f.get("tribe-name") || "").trim(); if (!name) return;
    let id = slug(name); if (S.season.tribes.some(t => t.id === id)) id += "-" + Date.now().toString(36);
    await store.set("season", "current", { tribes: [...S.season.tribes, { id, name, color: f.get("tribe-color") }] }, true); e.target.reset(); });
  $("#save-tribes").addEventListener("click", async () => { const tribes = S.season.tribes.map(t => ({ ...t, name: view.querySelector(`[data-tribe-name="${t.id}"]`).value.trim() || t.name, color: view.querySelector(`[data-tribe-color="${t.id}"]`).value }));
    await store.set("season", "current", { tribes }, true); });
  view.querySelectorAll("[data-reset-pin]").forEach(b => b.addEventListener("click", async () => { if (!confirm("Reset this player's PIN? They'll set a new one next time they log in.")) return; await store.set("users", b.dataset.resetPin, { pinHash: null }, true); }));
  view.querySelectorAll("[data-remove-user]").forEach(b => b.addEventListener("click", async () => { if (!confirm("Remove this player? Their picks stay in the database but won't be shown.")) return; await store.del("users", b.dataset.removeUser); }));
  $("#settings").addEventListener("submit", async e => { e.preventDefault(); const f = new FormData(e.target); const upd = { name: String(f.get("season-name") || "").trim() || S.season.name };
    const pin = String(f.get("new-apin") || "").trim(); if (pin) { if (pin.length < 4) return $("#settings-status").textContent = "PIN must be at least 4 characters."; upd.adminHash = await sha256("admin:" + pin); }
    await store.set("season", "current", upd, true); $("#settings-status").textContent = "Saved."; e.target.reset(); });
}
async function saveEpisode(id, f) {
  const e = S.episodes.find(x => x.id === id); const st = view.querySelector(`[data-ep-status="${id}"]`); st.className = "status-msg";
  const deadline = new Date(f.get(`deadline-${id}`)); if (isNaN(deadline)) { st.textContent = "Bad deadline."; st.classList.add("err"); return; }
  const type = f.get(`type-${id}`);
  const results = { finalized: !!f.get(`final-${id}`), titleSayer: f.get(`title-sayer-${id}`) || null, eliminated: [], winner: null };
  if (type === "finale") results.winner = f.get(`winner-${id}`) || null;
  else results.eliminated = aliveFor(e).filter(c => f.get(`elim-${id}-${c.id}`)).map(c => c.id);
  // Keep cast "out" flags in sync with this episode's eliminations.
  const newCast = cast().map(c => {
    if (results.eliminated.includes(c.id)) return { ...c, out: id };
    if (c.out === id) return { ...c, out: null };
    return c;
  });
  try {
    await store.set("season", "current", { cast: newCast }, true);
    await store.set("episodes", id, { title: String(f.get(`title-${id}`) || "").trim(), type, deadline, results }, true);
    st.textContent = "Saved."; st.classList.add("ok");
  } catch (err) { st.textContent = err.message; st.classList.add("err"); }
}

/* ------------------------------------------------------------------- boot */
(async function main() {
  if (!configured) { const b = $("#banner"); b.hidden = false; b.innerHTML = `<b>Demo mode.</b> Firebase isn't configured, so data is saved only in this browser. See <code>README.md</code> to connect Firebase.`; }
  try { store = await makeStore(); } catch (e) { showError("Could not connect to Firebase: " + e.message); return; }
  document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
  window.addEventListener("hashchange", () => { const t = location.hash.replace("#", ""); if (t && t !== S.tab) { S.tab = t; render(); } });
  store.watch("season", docs => { S.season = docs.find(d => d.id === "current") || null; S.loaded.season = true; render(); });
  store.watch("episodes", docs => { S.episodes = docs; S.loaded.episodes = true; render(); });
  store.watch("users", docs => { S.users = docs; S.loaded.users = true; render(); });
  store.watch("picks", docs => { S.picks = docs; S.loaded.picks = true; render(); });
  setInterval(() => { if (S.tab === "picks") render(); }, 60000);
})();
