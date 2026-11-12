// ============ Journal ECT — application ============
const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RUB = {
  eco: { nom: "Économie & finance", c: "var(--eco)" },
  droit: { nom: "Droit", c: "var(--droit)" },
  mgmt: { nom: "Management", c: "var(--mgmt)" },
  monde: { nom: "International", c: "var(--monde)" },
};
const fmtDate = (iso, opts = { day: "numeric", month: "short" }) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", opts) : "";
const fmtHour = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// ---------- stockage local (progression) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("ect:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ect:" + k, JSON.stringify(v)); } catch {} },
};
let state = {
  ed: null, tab: store.get("tab", "une"),
  answers: store.get("answers", {}),   // { "2026-11-11": { 0: 2, 1: 0 } }
  read: store.get("read", {}),         // { url: true }
  stats: store.get("stats", { streak: 0, best: 0 }), // série de bonnes réponses
};

// ---------- thème ----------
const applyTheme = (t) => t ? document.documentElement.setAttribute("data-theme", t) : document.documentElement.removeAttribute("data-theme");
applyTheme(store.get("theme", null));
$("#theme").onclick = () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = store.get("theme", null) || (dark ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  store.set("theme", next); applyTheme(next);
};

// ---------- données ----------
async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function loadEdition(date) {
  try {
    state.ed = await loadJSON(date ? `data/archive/${date}.json` : "data/latest.json");
  } catch { state.ed = null; }
  render();
}
async function loadIndicators() {
  try { state.ind = await loadJSON("data/indicateurs.json"); } catch { state.ind = null; }
  if (state.tab === "une") render();
}

function indicateurs() {
  const L = state.ind?.indicateurs || [];
  if (!L.length) return "";
  const fr = (v, d) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const per = (p) => p.replace(/^(\d{4})-Q(\d)$/, "T$2 $1").replace(/^(\d{4})-(\d{2})$/, (_, y, m) =>
    new Date(+y, +m - 1).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${d}/${m}/${y}`);
  return `<div class="section-title"><span>Les chiffres à connaître</span><span>sources officielles</span></div>
    <div class="kpis">${L.map((i) => {
      const diff = i.precedent != null ? i.valeur - i.precedent : 0;
      const arrow = Math.abs(diff) < 1e-9 ? "=" : diff > 0 ? "▲" : "▼";
      return `<details class="kpi">
        <summary>
          <div class="kpi-name">${esc(i.nom)}</div>
          <div class="kpi-val">${fr(i.valeur, i.decimales)}<small> ${esc(i.unite)}</small></div>
          <div class="kpi-sub"><span class="arr">${arrow}</span> ${per(i.periode)} · ${esc(i.zone)}</div>
        </summary>
        <div class="kpi-body">
          <p>${esc(i.definition)}</p>
          <p><b>Pourquoi c'est important :</b> ${esc(i.pourquoi)}</p>
          <p><b>Repère :</b> ${esc(i.repere)}</p>
          ${i.precedent != null ? `<p class="trad">Valeur précédente : ${fr(i.precedent, i.decimales)} (${per(i.periode_prec)})</p>` : ""}
          <div class="tags">${i.notions.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>
          <div class="src"><a href="${esc(i.lien)}" target="_blank" rel="noopener">${esc(i.source)} ↗</a></div>
        </div>
      </details>`;
    }).join("")}</div>`;
}

async function loadArchive() {
  const sel = $("#archive");
  let idx = [];
  try { idx = await loadJSON("data/index.json"); } catch {}
  sel.innerHTML = `<option value="">Aujourd'hui</option>` +
    idx.slice(1).map((d) => `<option value="${d}">${fmtDate(d, { day: "numeric", month: "short" })}</option>`).join("");
  sel.onchange = () => loadEdition(sel.value || null);
}

// ---------- composants ----------
const lvl = (n = 1) => "●".repeat(n) + "○".repeat(3 - n);

function articleCard(a, rub) {
  const c = RUB[rub]?.c;
  const isRead = state.read[a.lien];
  return `<details class="card ${isRead ? "read" : ""}" style="--c:${c}">
    <summary>
      <div class="meta"><span class="pill">${esc(a.source)}</span><span>${fmtDate(a.date)}</span><span class="lvl" title="Difficulté">${lvl(a.niveau)}</span></div>
      <h3>${esc(a.titre)}</h3>
      <p class="resume">${esc(a.resume)}</p>
      <div class="more-hint">Comprendre & exploiter ↓</div>
    </summary>
    <div class="body">
      <div class="block"><h4>Pourquoi c'est important</h4><p>${esc(a.contexte)}</p></div>
      <div class="block"><h4>Notions du programme</h4><div class="tags">${(a.notions || []).map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div></div>
      <div class="block"><h4>Dans ta copie</h4><p>${esc(a.copie)}</p></div>
      <div class="src">
        <a href="${esc(a.lien)}" target="_blank" rel="noopener">Lire sur ${esc(a.source)} ↗</a>
        <button class="read-btn" data-read="${esc(a.lien)}">${isRead ? "✓ Lu" : "Marquer lu"}</button>
      </div>
      <div class="trad" style="margin-top:6px">Titre original : « ${esc(a.titre_original)} » — ${fmtHour(a.date)}</div>
    </div>
  </details>`;
}

function rubrique(key) {
  const list = state.ed.rubriques?.[key] || [];
  const intro = {
    eco: "Conjoncture, politique monétaire, marchés, entreprises — et les auteurs à mobiliser.",
    droit: "Lois, réformes, décisions : la règle, sa portée, son intérêt pour l'épreuve.",
    mgmt: "Stratégies, gouvernance, transformations : des exemples prêts pour l'étude de cas.",
    monde: "Les grands équilibres mondiaux, puis ta séance d'anglais et d'espagnol.",
  }[key];
  let html = `<div class="section-title" style="border-color:${RUB[key].c}"><span>${RUB[key].nom}</span><span>${list.length} sujets</span></div>
    <p class="lead">${intro}</p>` + list.map((a) => articleCard(a, key)).join("");
  if (key === "monde") html += langues();
  return html;
}

function langues() {
  const L = state.ed.langues || {};
  const one = (x, flag, label) => x ? `<div class="card lang-card" style="--c:var(--monde)">
      <div class="meta"><span class="pill">${flag} ${label}</span><span>${esc(x.source)} · ${fmtDate(x.date)}</span></div>
      <h3>${esc(x.titre)}</h3>
      <p class="resume">${esc(x.resume)}</p>
      <p class="quote">« ${esc(x.phrase)} »</p>
      <div class="trad">${esc(x.traduction)}</div>
      <div class="src"><a href="${esc(x.lien)}" target="_blank" rel="noopener">Article original ↗</a></div>
    </div>` : "";
  return `<div class="section-title"><span>Langues</span><span>EN · ES</span></div>
    ${one(L.en, "🇬🇧", "English")}${one(L.es, "🇪🇸", "Español")}
    <div class="section-title"><span>Vocabulaire du jour</span></div>
    <div class="vocab">${(L.vocab || []).map((v) => `<div>${v.langue === "es" ? "🇪🇸" : "🇬🇧"} <b>${esc(v.mot)}</b> — ${esc(v.traduction)}<small>${esc(v.exemple)}</small></div>`).join("")}</div>`;
}

function une() {
  const ed = state.ed, n = ed.notion_du_jour;
  const brief = Object.keys(RUB).map((k) => (ed.rubriques?.[k] || []).slice(0, 2).map((a) =>
    `<a href="#" data-goto="${k}"><div class="meta"><span class="pill" style="color:${RUB[k].c}">${RUB[k].nom}</span></div><span>${esc(a.titre)}</span></a>`).join("")).join("");
  const done = Object.keys(state.answers[ed.date] || {}).length, total = (ed.quiz || []).length;
  return `${n ? `<div class="notion">
      <div class="kicker">Notion du jour · ${esc(n.matiere)}</div>
      <h3>${esc(n.titre)}</h3><p>${esc(n.definition)}</p><p class="ex">${esc(n.exemple)}</p></div>` : ""}
    ${indicateurs()}
    <div class="section-title"><span>L'essentiel en 2 minutes</span></div>
    <div class="brief">${brief}</div>
    <div class="section-title"><span>Ton entraînement</span><span>${done}/${total}</span></div>
    <button class="choice" data-goto="quiz" style="text-align:center;font-weight:700">${done === total && total ? "Voir ma correction" : "Commencer le quiz du jour →"}</button>`;
}

// ---------- banque d'exemples (toutes les éditions archivées) ----------
async function loadBank() {
  if (state.bank) return;
  state.bank = "loading";
  let idx = [];
  try { idx = await loadJSON("data/index.json"); } catch {}
  const eds = await Promise.all(idx.map((d) => loadJSON(`data/archive/${d}.json`).catch(() => null)));
  state.eds = eds.filter(Boolean);
  const seen = new Set(), items = [];
  eds.filter(Boolean).forEach((ed) => Object.entries(ed.rubriques || {}).forEach(([rub, list]) => list.forEach((a) => {
    if (seen.has(a.lien)) return; seen.add(a.lien);
    items.push({ ...a, rub, theme: a.theme || RUB[rub]?.nom || "Autres" });
  })));
  state.bank = items.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (state.tab === "exemples" || state.tab === "quiz") render();
}

// ---------- points faibles : refaire les questions ratées de la matière la plus faible ----------
function pointsFaibles(agg) {
  const weak = Object.keys(RUB).filter((m) => agg[m]?.n >= 3)
    .sort((a, b) => agg[a].ok / agg[a].n - agg[b].ok / agg[b].n)[0];
  if (!weak) return `<div class="section-title"><span>Tes points faibles</span></div><p class="lead">Termine quelques quiz : l'appli repérera ta matière la plus fragile et te fera retravailler tes erreurs.</p>`;
  if (!Array.isArray(state.bank)) { loadBank(); return ""; }
  const missed = [];
  state.eds.forEach((ed) => (ed.quiz || []).forEach((q, i) => {
    const a = state.answers[ed.date]?.[i];
    if (q.matiere === weak && a !== undefined && a !== q.bonne) missed.push({ ...q, key: `${ed.date}:${i}` });
  }));
  const retry = (state.retry ||= {});
  const p = Math.round((100 * agg[weak].ok) / agg[weak].n);
  return `<div class="section-title" style="border-color:${RUB[weak].c}"><span>Tes points faibles : ${RUB[weak].nom}</span><span>${p}%</span></div>
    <p class="lead">${missed.length ? "Refais les questions que tu as ratées dans cette matière." : "Aucune erreur à refaire pour l'instant dans cette matière."}</p>
    ${missed.slice(0, 5).map((q) => {
      const a = retry[q.key], answered = a !== undefined;
      return `<div class="q" style="--c:${RUB[weak].c}"><p class="qt">${esc(q.question)}</p>
        ${q.choix.map((c, j) => `<button class="choice ${answered && j === q.bonne ? "ok" : ""} ${answered && j === a && a !== q.bonne ? "ko" : ""}" data-retry="${q.key}" data-c="${j}" ${answered ? "disabled" : ""}>${String.fromCharCode(65 + j)}. ${esc(c)}</button>`).join("")}
        ${answered ? `<div class="expl"><b>${a === q.bonne ? "✓ Cette fois c'est bon !" : "✗ Encore raté."}</b> ${esc(q.explication)}</div>` : ""}</div>`;
    }).join("")}`;
}

function exemples() {
  if (!Array.isArray(state.bank)) { loadBank(); return `<div class="empty"><p>Chargement de tes exemples…</p></div>`; }
  const q = (state.bankQ || "").toLowerCase(), th = state.bankTheme || "";
  const counts = {};
  state.bank.forEach((a) => (counts[a.theme] = (counts[a.theme] || 0) + 1));
  const list = state.bank.filter((a) => (!th || a.theme === th) &&
    (!q || [a.titre, a.resume, a.copie, ...(a.notions || [])].join(" ").toLowerCase().includes(q)));
  return `<div class="section-title"><span>Banque d'exemples</span><span>${state.bank.length} actus</span></div>
    <p class="lead">Toutes les actus depuis le début, classées par thème du programme. Avant une dissert, ouvre le thème et pioche tes exemples datés.</p>
    <input id="bankq" class="search" type="search" placeholder="Rechercher : inflation, Keynes, contrat…" value="${esc(state.bankQ || "")}">
    <div class="chips"><button class="chip ${th ? "" : "on"}" data-theme="">Tous</button>${Object.keys(counts).sort().map((t) =>
      `<button class="chip ${t === th ? "on" : ""}" data-theme="${esc(t)}">${esc(t)} <small>${counts[t]}</small></button>`).join("")}</div>
    ${list.map((a) => `<details class="card" style="--c:${RUB[a.rub]?.c}">
      <summary><div class="meta"><span class="pill">${esc(a.theme)}</span><span>${fmtDate(a.date, { day: "numeric", month: "short", year: "numeric" })}</span></div>
        <h3>${esc(a.titre)}</h3><p class="resume">${esc(a.resume)}</p></summary>
      <div class="body"><div class="block"><h4>Dans ta copie</h4><p>${esc(a.copie)}</p></div>
        <div class="tags">${(a.notions || []).map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>
        <div class="src"><a href="${esc(a.lien)}" target="_blank" rel="noopener">Lire sur ${esc(a.source)} ↗</a></div></div>
    </details>`).join("") || `<div class="empty"><p>Aucun exemple pour cette recherche.</p></div>`}`;
}

// ---------- fiches de cours (révision espacée, méthode Leitner) ----------
const BOXES = [0, 1, 3, 7, 15, 30]; // jours avant de revoir une carte selon sa « boîte »
const NEW_PER_DAY = 12;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const cardId = (c) => { let h = 0; for (const ch of c.q) h = (h * 31 + ch.charCodeAt(0)) | 0; return "c" + (h >>> 0).toString(36); };

async function loadCards() {
  if (state.cards) return;
  state.cards = "loading";
  try { state.cards = (await loadJSON("data/cartes.json")).cartes.map((c) => ({ ...c, id: cardId(c) })); }
  catch { state.cards = []; }
  render();
}

function fichesQueue() {
  const prog = store.get("leitner", {}), t = today(), m = state.ficheMat || "";
  const pool = state.cards.filter((c) => !m || c.m === m);
  const due = pool.filter((c) => prog[c.id] && prog[c.id].due <= t);
  const newToday = store.get("newDay", {});
  const left = Math.max(0, NEW_PER_DAY - (newToday[t] || 0));
  // nouvelles cartes : on alterne éco / droit / mgmt
  const groups = {}; pool.filter((c) => !prog[c.id]).forEach((c) => (groups[c.m] ||= []).push(c));
  const mixed = []; for (let i = 0; mixed.length < left && Object.values(groups).some((g) => g[i]); i++) Object.values(groups).forEach((g) => g[i] && mixed.push(g[i]));
  const fresh = mixed.slice(0, left);
  return [...due, ...fresh];
}

function fiches() {
  if (!Array.isArray(state.cards)) { loadCards(); return `<div class="empty"><p>Chargement des fiches…</p></div>`; }
  const prog = store.get("leitner", {}), m = state.ficheMat || "";
  const queue = fichesQueue(), c = queue[0];
  const known = Object.values(prog).filter((p) => p.box >= 3).length;
  const mats = { "": "Tout", eco: "Éco", droit: "Droit", mgmt: "Mgmt" };
  return `<p class="lead">Les fiches de ton cours. Chaque carte revient au bon moment : le jour même si tu la rates, puis à J+1, J+3, J+7, J+15 et J+30 quand tu la sais.</p>
    <div class="chips">${Object.entries(mats).map(([k, v]) => `<button class="chip ${k === m ? "on" : ""}" data-fmat="${k}">${v}</button>`).join("")}</div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><b>${queue.length}</b><span>à réviser</span></div>
      <div class="stat"><b>${known}</b><span>bien sues</span></div>
      <div class="stat"><b>${state.cards.length}</b><span>fiches</span></div>
    </div>
    ${c ? `<div class="q flash" style="--c:${RUB[c.m]?.c}">
        <div class="meta"><span class="pill">${esc(c.ch)}</span><span class="lvl">${prog[c.id] ? "boîte " + prog[c.id].box : "nouvelle"}</span></div>
        <p class="qt">${esc(c.q)}</p>
        ${state.showBack ? `<div class="expl">${esc(c.r)}</div>
          <div class="flash-btns"><button class="choice ko" data-grade="0">✗ À revoir</button><button class="choice ok" data-grade="1">✓ Je savais</button></div>`
        : `<button class="choice" data-flip style="text-align:center;font-weight:700">Voir la réponse</button>`}
      </div>`
    : `<div class="final"><div class="kicker">Bravo</div><b>✓</b><div class="trad">Plus rien à réviser aujourd'hui${m ? " dans cette matière" : ""}. Reviens demain.</div></div>`}`;
}

function gradeCard(ok) {
  const c = fichesQueue()[0]; if (!c) return;
  const prog = store.get("leitner", {}), t = today();
  if (!prog[c.id]) { const n = store.get("newDay", {}); n[t] = (n[t] || 0) + 1; store.set("newDay", { [t]: n[t] }); }
  const box = ok ? Math.min((prog[c.id]?.box ?? 0) + 1, BOXES.length - 1) : 0;
  prog[c.id] = { box, due: ok ? addDays(BOXES[box]) : t };
  if (!ok) { // une carte ratée repasse en fin de file aujourd'hui
    state.cards.push(state.cards.splice(state.cards.indexOf(c), 1)[0]);
  }
  store.set("leitner", prog);
  state.showBack = false;
}

// ---------- classement entre amis (Supabase) ----------
// Clé « publishable » : faite pour être publique, la sécurité vient des règles de la base.
const SUPA_URL = "", SUPA_KEY = "";
const supa = (path, opts = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, {
  ...opts, headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) },
});

async function sendScore() {
  const me = store.get("me", null), ed = state.ed;
  if (!SUPA_URL || !me || !ed) return;
  const h = store.get("history", {})[ed.date]; if (!h) return;
  try {
    await supa("scores?on_conflict=pseudo,groupe,jour", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ pseudo: me.pseudo, groupe: me.groupe, jour: ed.date, score: h.ok, total: h.n }),
    });
  } catch {}
}

async function loadBoard() {
  const me = store.get("me", null);
  if (!SUPA_URL || !me) return;
  state.board = "loading";
  const since = addDays(-6);
  try {
    const r = await supa(`scores?select=pseudo,jour,score,total&groupe=eq.${encodeURIComponent(me.groupe)}&jour=gte.${since}`);
    const rows = await r.json();
    const by = {};
    rows.forEach((x) => { const p = (by[x.pseudo] ||= { pseudo: x.pseudo, pts: 0, n: 0, jours: 0 }); p.pts += x.score; p.n += x.total; p.jours++; });
    state.board = Object.values(by).sort((a, b) => b.pts - a.pts || b.jours - a.jours);
  } catch { state.board = "error"; }
  render();
}

function classement() {
  if (!SUPA_URL) return `<div class="empty"><p>Le classement arrive bientôt.</p></div>`;
  const me = store.get("me", null);
  if (!me) return `<p class="lead">Choisis un pseudo et le code de ton groupe d'amis. Seuls ceux qui ont le même code apparaissent dans votre classement.</p>
    <input id="pseudo" class="search" maxlength="20" placeholder="Ton pseudo">
    <input id="groupe" class="search" maxlength="30" placeholder="Code du groupe (ex : ect1-condorcet)">
    <button class="choice" id="join" style="text-align:center;font-weight:700">Rejoindre le classement</button>`;
  if (state.board === undefined) { loadBoard(); return `<div class="empty"><p>Chargement…</p></div>`; }
  if (state.board === "loading") return `<div class="empty"><p>Chargement…</p></div>`;
  if (state.board === "error") return `<div class="empty"><p>Classement indisponible pour l'instant (connexion ?).</p></div>`;
  return `<p class="lead">Groupe <b>${esc(me.groupe)}</b> · points des 7 derniers jours (1 bonne réponse = 1 point).</p>
    <table class="hist board">${state.board.map((p, i) => `<tr class="${p.pseudo === me.pseudo ? "me" : ""}"><td>${["🥇", "🥈", "🥉"][i] || i + 1} ${esc(p.pseudo)}</td><td>${p.jours} j · ${p.n ? Math.round((100 * p.pts) / p.n) : 0}%</td><td><b>${p.pts}</b></td></tr>`).join("") || "<tr><td>Personne n'a encore joué cette semaine.</td></tr>"}</table>
    <p class="trad" style="margin-top:14px">Ton score est envoyé automatiquement quand tu termines le quiz du jour. <button class="read-btn" id="leave">Changer de pseudo</button></p>`;
}

function reviser() {
  const sub = state.sub || "quiz";
  const tabs = { quiz: "Quiz du jour", fiches: "Fiches de cours", classement: "Classement" };
  return `<div class="chips seg">${Object.entries(tabs).map(([k, v]) => `<button class="chip ${k === sub ? "on" : ""}" data-sub="${k}">${v}</button>`).join("")}</div>`
    + (sub === "fiches" ? fiches() : sub === "classement" ? classement() : quiz());
}

// ---------- quiz & progression ----------
function recordResult() {
  const ed = state.ed, ans = state.answers[ed.date] || {};
  const hist = store.get("history", {});
  const bySub = {};
  ed.quiz.forEach((q, i) => {
    if (ans[i] === undefined) return;
    const s = (bySub[q.matiere] ||= { ok: 0, n: 0 });
    s.n++; if (ans[i] === q.bonne) s.ok++;
  });
  hist[ed.date] = { ok: Object.values(bySub).reduce((a, s) => a + s.ok, 0), n: ed.quiz.length, bySub };
  store.set("history", hist);
}

function quiz() {
  const ed = state.ed, ans = state.answers[ed.date] || {};
  const hist = store.get("history", {});
  const days = Object.keys(hist).sort().reverse();
  // jours consécutifs avec quiz terminé
  let dayStreak = 0; const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (hist[k]) { dayStreak++; d.setDate(d.getDate() - 1); }
    else if (dayStreak === 0 && k === new Date().toISOString().slice(0, 10)) d.setDate(d.getDate() - 1);
    else break;
  }
  const tot = days.reduce((a, k) => [a[0] + hist[k].ok, a[1] + hist[k].n], [0, 0]);
  const pct = tot[1] ? Math.round((100 * tot[0]) / tot[1]) : 0;
  const finished = ed.quiz.length && Object.keys(ans).length === ed.quiz.length;
  const score = ed.quiz.filter((q, i) => ans[i] === q.bonne).length;

  // agrégat par matière
  const agg = {};
  days.forEach((k) => Object.entries(hist[k].bySub || {}).forEach(([m, s]) => {
    const a = (agg[m] ||= { ok: 0, n: 0 }); a.ok += s.ok; a.n += s.n;
  }));

  return `<div class="stats">
      <div class="stat"><b>${dayStreak}</b><span>jours d'affilée</span></div>
      <div class="stat"><b>${state.stats.streak}</b><span>série actuelle</span></div>
      <div class="stat"><b>${state.stats.best}</b><span>meilleure série</span></div>
      <div class="stat"><b>${pct}%</b><span>réussite</span></div>
    </div>
    ${finished ? `<div class="final"><div class="kicker">Score du jour</div><b>${score}/${ed.quiz.length}</b><div class="trad">${score >= 7 ? "Excellent, tu tiens la cadence concours." : score >= 5 ? "Solide. Relis les explications ratées." : "Relis les corrections : c'est comme ça qu'on progresse."}</div></div>` : ""}
    <div class="section-title"><span>Quiz du ${fmtDate(ed.date, { day: "numeric", month: "long" })}</span><span>${Object.keys(ans).length}/${ed.quiz.length}</span></div>
    ${ed.quiz.map((q, i) => {
      const a = ans[i], answered = a !== undefined, rub = RUB[q.matiere] || RUB.eco;
      return `<div class="q" style="--c:${rub.c}">
        <div class="meta"><span class="pill">${rub.nom}</span><span>Q${i + 1}</span></div>
        <p class="qt">${esc(q.question)}</p>
        ${q.choix.map((c, j) => `<button class="choice ${answered && j === q.bonne ? "ok" : ""} ${answered && j === a && a !== q.bonne ? "ko" : ""}" data-q="${i}" data-c="${j}" ${answered ? "disabled" : ""}>${String.fromCharCode(65 + j)}. ${esc(c)}</button>`).join("")}
        ${answered ? `<div class="expl"><b>${a === q.bonne ? "✓ Bonne réponse." : "✗ Raté."}</b> ${esc(q.explication)}${q.lien ? ` <a href="${esc(q.lien)}" target="_blank" rel="noopener">Source ↗</a>` : ""}</div>` : ""}
      </div>`;
    }).join("")}
    <div class="section-title"><span>Progression par matière</span></div>
    <div class="bars">${Object.keys(RUB).map((m) => {
      const s = agg[m] || { ok: 0, n: 0 }, p = s.n ? Math.round((100 * s.ok) / s.n) : 0;
      return `<div class="bar" style="--c:${RUB[m].c}">${RUB[m].nom} — ${s.ok}/${s.n} (${p}%)<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
    }).join("")}</div>
    ${pointsFaibles(agg)}
    <div class="section-title"><span>Historique</span><span>${days.length} jours</span></div>
    <table class="hist">${days.slice(0, 30).map((k) => `<tr><td>${fmtDate(k, { weekday: "short", day: "numeric", month: "short" })}</td><td>${hist[k].ok}/${hist[k].n}</td></tr>`).join("") || "<tr><td>Aucun quiz terminé pour l'instant.</td></tr>"}</table>
    <p class="trad" style="margin-top:18px">Ta progression est enregistrée sur ce téléphone.
      <button class="read-btn" id="export">Exporter</button> <button class="read-btn" id="import">Importer</button></p>`;
}

// ---------- rendu ----------
function render() {
  const v = $("#view");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  if (!state.ed) {
    v.innerHTML = `<div class="empty"><h2>Pas encore d'édition</h2><p>La première édition sera publiée au prochain passage automatique (chaque matin vers 6 h). Si tu viens d'installer le projet, lance l'action « Édition quotidienne » sur GitHub.</p></div>` + indicateurs();
    $("#dateline").textContent = "Édition à venir"; return;
  }
  const ed = state.ed;
  $("#dateline").textContent = fmtDate(ed.date + "T12:00", { weekday: "long", day: "numeric", month: "long" });
  const counts = Object.keys(RUB).map((k) => `${RUB[k].nom.split(" ")[0]} <b>${(ed.rubriques?.[k] || []).length}</b>`);
  $("#ticker").innerHTML = [...counts, `Quiz <b>${(ed.quiz || []).length}</b>`, `MàJ <b>${fmtHour(ed.genere_le)}</b>`].map((s) => `<span>${s}</span>`).join("");
  v.innerHTML = state.tab === "une" ? une() : state.tab === "quiz" ? reviser() : state.tab === "exemples" ? exemples() : rubrique(state.tab);
}

// ---------- événements ----------
$("#tabs").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.tab = b.dataset.tab; store.set("tab", state.tab); render(); scrollTo(0, 0);
};
$("#view").addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) { e.preventDefault(); state.tab = go.dataset.goto; store.set("tab", state.tab); render(); scrollTo(0, 0); return; }

  const sb = e.target.closest("[data-sub]");
  if (sb) { state.sub = sb.dataset.sub; if (state.sub === "classement") state.board = undefined; render(); return; }
  const fm = e.target.closest("[data-fmat]");
  if (fm) { state.ficheMat = fm.dataset.fmat; state.showBack = false; render(); return; }
  if (e.target.closest("[data-flip]")) { state.showBack = true; render(); return; }
  const gr = e.target.closest("[data-grade]");
  if (gr) { gradeCard(gr.dataset.grade === "1"); render(); return; }
  if (e.target.id === "join") {
    const pseudo = $("#pseudo").value.trim(), groupe = $("#groupe").value.trim().toLowerCase();
    if (!pseudo || !groupe) return alert("Remplis ton pseudo et le code du groupe.");
    store.set("me", { pseudo, groupe }); state.board = undefined; sendScore().then(() => { state.board = undefined; render(); }); return;
  }
  if (e.target.id === "leave") { store.set("me", null); state.board = undefined; render(); return; }

  const rt = e.target.closest("[data-retry]");
  if (rt && !rt.disabled) { (state.retry ||= {})[rt.dataset.retry] = +rt.dataset.c; const y = scrollY; render(); scrollTo(0, y); return; }

  const chip = e.target.closest("[data-theme]");
  if (chip) { state.bankTheme = chip.dataset.theme; render(); return; }

  const r = e.target.closest("[data-read]");
  if (r) { const u = r.dataset.read; state.read[u] = !state.read[u]; store.set("read", state.read); render(); return; }

  const c = e.target.closest("[data-q]");
  if (c && !c.disabled) {
    const ed = state.ed, i = +c.dataset.q, j = +c.dataset.c;
    (state.answers[ed.date] ||= {})[i] = j;
    store.set("answers", state.answers);
    if (j === ed.quiz[i].bonne) { state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); }
    else state.stats.streak = 0;
    store.set("stats", state.stats);
    if (Object.keys(state.answers[ed.date]).length === ed.quiz.length) { recordResult(); sendScore(); }
    const y = scrollY; render(); scrollTo(0, y); return;
  }

  if (e.target.id === "export") {
    const data = {}; for (const k of ["answers", "stats", "history", "read"]) data[k] = store.get(k, null);
    const txt = JSON.stringify(data);
    navigator.clipboard?.writeText(txt).then(() => alert("Progression copiée. Colle-la dans une note pour la sauvegarder."), () => prompt("Copie ce texte :", txt));
  }
  if (e.target.id === "import") {
    const txt = prompt("Colle ici ta sauvegarde :");
    if (!txt) return;
    try { const d = JSON.parse(txt); for (const k in d) if (d[k] != null) store.set(k, d[k]); location.reload(); }
    catch { alert("Sauvegarde invalide."); }
  }
});

$("#view").addEventListener("input", (e) => {
  if (e.target.id !== "bankq") return;
  state.bankQ = e.target.value; render();
  const i = $("#bankq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
});

// ---------- démarrage ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
loadArchive();
loadIndicators();
loadEdition();
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#archive").value) loadEdition(); });
