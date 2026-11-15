// ============ Prépa ECT — application ============
const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RUB = {
  eco: { nom: "Économie & finance", court: "Éco", c: "var(--eco)" },
  droit: { nom: "Droit", court: "Droit", c: "var(--droit)" },
  mgmt: { nom: "Management", court: "Mgmt", c: "var(--mgmt)" },
  monde: { nom: "International", court: "Monde", c: "var(--monde)" },
};
const MAT = { eco: "Éco", droit: "Droit", mgmt: "Mgmt", maths: "Maths" };
const fmtDate = (iso, opts = { day: "numeric", month: "short" }) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", opts) : "";
const fmtHour = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const today = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale
const addDays = (n, from) => { const d = from ? new Date(from + "T12:00") : new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const daysUntil = (iso) => Math.round((new Date(iso + "T12:00") - new Date(today() + "T12:00")) / 864e5);

// ---------- stockage local (progression) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("ect:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ect:" + k, JSON.stringify(v)); } catch {} },
};
const TABS = ["auj", "actu", "reviser", "langues", "moi"];
let state = {
  ed: null, tab: TABS.includes(store.get("tab")) ? store.get("tab") : "auj",
  sub: { actu: "eco", reviser: "fiches", langues: "trous", moi: "agenda", ...store.get("subs", {}) },
  answers: store.get("answers", {}),   // { "2026-11-11": { 0: 2, 1: 0 } }
  read: store.get("read", {}),
  stats: store.get("stats", { streak: 0, best: 0 }),
  lang: store.get("lang", "en"),
  shown: {},                           // corrigés affichés
};
const actif = () => { const a = store.get("actif", {}); a[today()] = true; store.set("actif", a); };

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
  try { state.ed = await loadJSON(date ? `data/archive/${date}.json` : "data/latest.json"); }
  catch { state.ed = null; }
  render();
}
async function loadIndicators() {
  try { state.ind = await loadJSON("data/indicateurs.json"); } catch { state.ind = null; }
  if (state.tab === "auj") render();
}
async function loadArchive() {
  const sel = $("#archive");
  let idx = [];
  try { idx = await loadJSON("data/index.json"); } catch {}
  sel.innerHTML = `<option value="">Aujourd'hui</option>` +
    idx.slice(1).map((d) => `<option value="${d}">${fmtDate(d, { day: "numeric", month: "short" })}</option>`).join("");
  sel.onchange = () => loadEdition(sel.value || null);
}

// Toutes les éditions archivées (banque d'exemples, plans, vocabulaire, erreurs)
async function loadBank() {
  if (state.bank) return;
  state.bank = "loading";
  let idx = [];
  try { idx = await loadJSON("data/index.json"); } catch {}
  const eds = await Promise.all(idx.map((d) => loadJSON(`data/archive/${d}.json`).catch(() => null)));
  state.eds = eds.filter(Boolean);
  const seen = new Set(), items = [];
  state.eds.forEach((ed) => Object.entries(ed.rubriques || {}).forEach(([rub, list]) => list.forEach((a) => {
    if (seen.has(a.lien)) return; seen.add(a.lien);
    items.push({ ...a, rub, theme: a.theme || RUB[rub]?.nom || "Autres" });
  })));
  state.bank = items.sort((a, b) => new Date(b.date) - new Date(a.date));
  render();
}
const bankReady = () => Array.isArray(state.bank) || (loadBank(), false);

// ---------- composants communs ----------
const lvl = (n = 1) => "●".repeat(n) + "○".repeat(3 - n);
const title = (t, right = "", c) => `<div class="section-title"${c ? ` style="border-color:${c}"` : ""}><span>${t}</span><span>${right}</span></div>`;
const subtabs = (tab, list) => `<div class="chips seg">${Object.entries(list).map(([k, v]) =>
  `<button class="chip ${k === state.sub[tab] ? "on" : ""}" data-sub="${tab}:${k}">${v}</button>`).join("")}</div>`;
const bigBtn = (label, attrs) => `<button class="choice" ${attrs} style="text-align:center;font-weight:700">${label}</button>`;
const loading = (t = "Chargement…") => `<div class="empty"><p>${t}</p></div>`;

function qcm({ question, choix, bonne, explication, lien }, a, attrs, c = "var(--accent)", meta = "") {
  const answered = a !== undefined;
  return `<div class="q" style="--c:${c}">${meta}<p class="qt">${esc(question)}</p>
    ${choix.map((x, j) => `<button class="choice ${answered && j === bonne ? "ok" : ""} ${answered && j === a && a !== bonne ? "ko" : ""}" ${attrs} data-c="${j}" ${answered ? "disabled" : ""}>${String.fromCharCode(65 + j)}. ${esc(x)}</button>`).join("")}
    ${answered ? `<div class="expl"><b>${a === bonne ? "✓ Bonne réponse." : "✗ Raté."}</b> ${esc(explication)}${lien ? ` <a href="${esc(lien)}" target="_blank" rel="noopener">Source ↗</a>` : ""}</div>` : ""}</div>`;
}

// =====================================================================
//  AUJOURD'HUI
// =====================================================================
function indicateurs() {
  const L = state.ind?.indicateurs || [];
  if (!L.length) return "";
  const fr = (v, d) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const per = (p) => p.replace(/^(\d{4})-Q(\d)$/, "T$2 $1").replace(/^(\d{4})-(\d{2})$/, (_, y, m) =>
    new Date(+y, +m - 1).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${d}/${m}/${y}`);
  return title("Les chiffres à connaître", "sources officielles") + `<div class="kpis">${L.map((i) => {
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

function serieJours() {
  const a = store.get("actif", {}); let n = 0;
  for (let k = today(); ; k = addDays(-1, k)) {
    if (a[k]) n++; else if (k === today()) continue; else break;
    if (n > 999) break;
  }
  return n;
}

function aujourdhui() {
  const ed = state.ed, n = ed?.notion_du_jour;
  const concours = store.get("concours", "2028-04-12");
  const next = store.get("agenda", []).filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const cards = Array.isArray(state.cards);
  const nCours = cards ? fichesQueue("cours").length : "…", nVocab = cards ? fichesQueue("vocab").length : "…";
  const qDone = ed ? Object.keys(state.answers[ed.date] || {}).length : 0, qTot = ed?.quiz?.length || 0;
  const tr = ed?.langues?.trous || {};
  const trDone = ["en", "es"].filter((l) => tr[l] && Object.keys(store.get(`trous:${ed.date}:${l}`, {})).length === tr[l].blancs.length).length;
  const trTot = ["en", "es"].filter((l) => tr[l]).length;
  const items = [
    ["Fiches de cours", nCours === 0 ? "rien à revoir" : `${nCours} à réviser`, nCours === 0, "reviser:fiches"],
    ["Quiz du jour", `${qDone}/${qTot}`, qTot && qDone === qTot, "reviser:quiz"],
    ["Vocabulaire EN/ES", nVocab === 0 ? "rien à revoir" : `${nVocab} mots`, nVocab === 0, "langues:vocab"],
    ...(trTot ? [["Textes à trous", `${trDone}/${trTot}`, trDone === trTot, "langues:trous"]] : []),
    ...(ed?.maths?.length ? [["Exercices de maths", `${ed.maths.length} exos`, ed.maths.every((m, i) => store.get("vus", {})[`maths:${ed.date}:${i}`]), "reviser:entrainement"]] : []),
    ...(ed?.cas_pratique ? [["Cas pratique de droit", "syllogisme", store.get("vus", {})[`cas:${ed.date}`], "reviser:entrainement"]] : []),
  ];
  const done = items.filter((i) => i[2]).length;
  const brief = ed ? Object.keys(RUB).map((k) => (ed.rubriques?.[k] || []).slice(0, 1).map((a) =>
    `<a href="#" data-goto="actu:${k}"><div class="meta"><span class="pill" style="color:${RUB[k].c}">${RUB[k].nom}</span></div><span>${esc(a.titre)}</span></a>`).join("")).join("") : "";
  const pct = items.length ? Math.round((100 * done) / items.length) : 0;
  return `<div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat"><b>${daysUntil(concours)}</b><span>jours avant les écrits</span></div>
      <div class="stat"><b>${serieJours()}</b><span>jour${serieJours() > 1 ? "s" : ""} d'affilée 🔥</span></div>
    </div>
    ${next ? `<a href="#" class="next-ev" data-goto="moi:agenda"><b>${esc(next.type)} ${esc(MAT[next.matiere] || next.matiere || "")}</b> ${esc(next.titre || "")} <span>${daysUntil(next.date) === 0 ? "aujourd'hui" : daysUntil(next.date) === 1 ? "demain" : "dans " + daysUntil(next.date) + " j"}</span></a>` : ""}
    ${title("Ta séance du jour")}
    <div class="progress"><div class="row"><span>${done === items.length && done ? "Séance terminée, bravo !" : "Progression"}</span><span>${done}/${items.length}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>
    <div class="todo">${items.map(([t, s, ok, go]) => `<a href="#" data-goto="${go}" class="${ok ? "ok" : ""}"><span class="tick"></span><span>${t}</span><small>${s}</small></a>`).join("")}</div>
    ${n ? `<div class="notion" style="margin-top:22px">
      <div class="kicker">Notion du jour · ${esc(n.matiere)}</div>
      <h3>${esc(n.titre)}</h3><p>${esc(n.definition)}</p><p class="ex">${esc(n.exemple)}</p></div>` : ""}
    ${brief ? title("L'essentiel de l'actu") + `<div class="brief">${brief}</div>` : ""}
    ${indicateurs()}`;
}

// =====================================================================
//  ACTU
// =====================================================================
function articleCard(a, rub) {
  const c = RUB[rub]?.c, isRead = state.read[a.lien];
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
    monde: "Le monde anglophone et hispanophone : utile en économie et en langues.",
  }[key];
  return title(RUB[key].nom, `${list.length} sujets`, RUB[key].c) + `<p class="lead">${intro}</p>` + list.map((a) => articleCard(a, key)).join("");
}

function exemples() {
  if (!bankReady()) return loading("Chargement de tes exemples…");
  const q = (state.bankQ || "").toLowerCase(), th = state.bankTheme || "";
  const counts = {};
  state.bank.forEach((a) => (counts[a.theme] = (counts[a.theme] || 0) + 1));
  const list = state.bank.filter((a) => (!th || a.theme === th) &&
    (!q || [a.titre, a.resume, a.copie, ...(a.notions || [])].join(" ").toLowerCase().includes(q)));
  return title("Banque d'exemples", `${state.bank.length} actus`) + `
    <p class="lead">Toutes les actus depuis le début, classées par thème du programme. Avant un DS ou une khôlle, ouvre le thème et pioche tes exemples datés.</p>
    <input id="bankq" class="search" type="search" placeholder="Rechercher : inflation, Keynes, contrat…" value="${esc(state.bankQ || "")}">
    <div class="chips"><button class="chip ${th ? "" : "on"}" data-btheme="">Tous</button>${Object.keys(counts).sort().map((t) =>
      `<button class="chip ${t === th ? "on" : ""}" data-btheme="${esc(t)}">${esc(t)} <small>${counts[t]}</small></button>`).join("")}</div>
    ${list.map((a) => `<details class="card" style="--c:${RUB[a.rub]?.c}">
      <summary><div class="meta"><span class="pill">${esc(a.theme)}</span><span>${fmtDate(a.date, { day: "numeric", month: "short", year: "numeric" })}</span></div>
        <h3>${esc(a.titre)}</h3><p class="resume">${esc(a.resume)}</p></summary>
      <div class="body"><div class="block"><h4>Dans ta copie</h4><p>${esc(a.copie)}</p></div>
        <div class="tags">${(a.notions || []).map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>
        <div class="src"><a href="${esc(a.lien)}" target="_blank" rel="noopener">Lire sur ${esc(a.source)} ↗</a></div></div>
    </details>`).join("") || `<div class="empty"><p>Aucun exemple pour cette recherche.</p></div>`}`;
}

function actu() {
  const s = state.sub.actu;
  return subtabs("actu", { eco: "Éco", droit: "Droit", mgmt: "Mgmt", monde: "Monde", exemples: "Banque d'exemples" })
    + (s === "exemples" ? exemples() : rubrique(RUB[s] ? s : "eco"));
}

// =====================================================================
//  FICHES (révision espacée, méthode Leitner) — cours et vocabulaire
// =====================================================================
const BOXES = [0, 1, 3, 7, 15, 30];
const NEW_PER_DAY = { cours: 12, vocab: 8 };
const cardId = (c) => { let h = 0; for (const ch of c.m + c.q) h = (h * 31 + ch.charCodeAt(0)) | 0; return "c" + (h >>> 0).toString(36); };

async function loadCards() {
  if (state.cards) return;
  state.cards = "loading";
  try { state.cards = (await loadJSON("data/cartes.json")).cartes.map((c) => ({ ...c, id: cardId(c) })); }
  catch { state.cards = []; }
  render();
}

// vocabulaire du jour de toutes les éditions -> fiches
function vocabEditions() {
  const eds = Array.isArray(state.bank) ? state.eds : state.ed ? [state.ed] : [];
  const seen = new Set(), out = [];
  eds.forEach((ed) => (ed.langues?.vocab || []).forEach((v) => {
    const m = v.langue === "es" ? "es" : "en", k = m + v.mot;
    if (!v.mot || seen.has(k)) return; seen.add(k);
    const c = { m, ch: "Vocabulaire de l'actu", q: v.mot, r: `${v.traduction}${v.exemple ? " — « " + v.exemple + " »" : ""}` };
    out.push({ ...c, id: cardId(c) });
  }));
  return out;
}

function deckPool(deck) {
  if (!Array.isArray(state.cards)) return [];
  if (deck === "vocab") {
    const l = state.vocabLang || "";
    return [...state.cards.filter((c) => c.m === "en" || c.m === "es"), ...vocabEditions()].filter((c) => !l || c.m === l);
  }
  const m = state.ficheMat || "";
  return state.cards.filter((c) => MAT[c.m] && (!m || c.m === m));
}

function fichesQueue(deck) {
  const prog = store.get("leitner", {}), t = today(), pool = deckPool(deck);
  const due = pool.filter((c) => prog[c.id] && prog[c.id].due <= t);
  const nd = store.get("newDay", {}), left = Math.max(0, NEW_PER_DAY[deck] - (nd.d === t ? nd[deck] || 0 : 0));
  const groups = {}; pool.filter((c) => !prog[c.id]).forEach((c) => (groups[c.m] ||= []).push(c));
  const mixed = []; for (let i = 0; mixed.length < left && Object.values(groups).some((g) => g[i]); i++) Object.values(groups).forEach((g) => g[i] && mixed.push(g[i]));
  return [...due, ...mixed.slice(0, left)];
}

function flashUI(deck, chips) {
  if (!Array.isArray(state.cards)) { loadCards(); return loading("Chargement des fiches…"); }
  const prog = store.get("leitner", {}), pool = deckPool(deck), queue = fichesQueue(deck), c = queue[0];
  const known = pool.filter((x) => prog[x.id]?.box >= 3).length;
  const col = { en: "var(--monde)", es: "var(--eco)", maths: "var(--accent)" };
  return `${chips}
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><b>${queue.length}</b><span>à réviser</span></div>
      <div class="stat"><b>${known}</b><span>bien sues</span></div>
      <div class="stat"><b>${pool.length}</b><span>fiches</span></div>
    </div>
    ${c ? `<div class="q flash" style="--c:${RUB[c.m]?.c || col[c.m]}">
        <div class="meta"><span class="pill">${c.m === "en" ? "🇬🇧 " : c.m === "es" ? "🇪🇸 " : ""}${esc(c.ch)}</span><span class="lvl">${prog[c.id] ? "boîte " + prog[c.id].box : "nouvelle"}</span></div>
        <p class="qt">${esc(c.q)}</p>
        ${state.showBack ? `<div class="expl">${esc(c.r)}</div>
          <div class="flash-btns"><button class="choice ko" data-grade="0" data-deck="${deck}">✗ À revoir</button><button class="choice ok" data-grade="1" data-deck="${deck}">✓ Je savais</button></div>`
        : bigBtn("Voir la réponse", "data-flip")}
      </div>`
    : `<div class="final"><div class="kicker">Bravo</div><b>✓</b><div class="trad">Plus rien à réviser aujourd'hui ici. Reviens demain.</div></div>`}`;
}

function gradeCard(deck, ok) {
  const c = fichesQueue(deck)[0]; if (!c) return;
  const prog = store.get("leitner", {}), t = today();
  if (!prog[c.id]) { const nd = store.get("newDay", {}); const n = nd.d === t ? nd : { d: t }; n[deck] = (n[deck] || 0) + 1; store.set("newDay", n); }
  const box = ok ? Math.min((prog[c.id]?.box ?? 0) + 1, BOXES.length - 1) : 0;
  prog[c.id] = { box, due: ok ? addDays(BOXES[box]) : t };
  if (!ok) { const i = state.cards.indexOf(c); if (i >= 0) state.cards.push(state.cards.splice(i, 1)[0]); }
  store.set("leitner", prog); actif();
  state.showBack = false;
}

function fiches() {
  const m = state.ficheMat || "";
  return flashUI("cours", `<p class="lead">Ton cours, les auteurs, les grands arrêts et les formules de maths. Une carte ratée revient le jour même, une carte sue revient à J+1, J+3, J+7, J+15 puis J+30.</p>
    <div class="chips">${Object.entries({ "": "Tout", ...MAT }).map(([k, v]) => `<button class="chip ${k === m ? "on" : ""}" data-fmat="${k}">${v}</button>`).join("")}</div>`);
}

// =====================================================================
//  RÉVISER : quiz, plans, méthodes, classement
// =====================================================================
function recordResult() {
  const ed = state.ed, ans = state.answers[ed.date] || {};
  const hist = store.get("history", {}), bySub = {};
  ed.quiz.forEach((q, i) => {
    if (ans[i] === undefined) return;
    const s = (bySub[q.matiere] ||= { ok: 0, n: 0 }); s.n++; if (ans[i] === q.bonne) s.ok++;
  });
  hist[ed.date] = { ok: Object.values(bySub).reduce((a, s) => a + s.ok, 0), n: ed.quiz.length, bySub };
  store.set("history", hist);
}
function aggregat() {
  const hist = store.get("history", {}), agg = {};
  Object.values(hist).forEach((h) => Object.entries(h.bySub || {}).forEach(([m, s]) => {
    const a = (agg[m] ||= { ok: 0, n: 0 }); a.ok += s.ok; a.n += s.n;
  }));
  return agg;
}

function pointsFaibles(agg) {
  const weak = Object.keys(RUB).filter((m) => agg[m]?.n >= 3).sort((a, b) => agg[a].ok / agg[a].n - agg[b].ok / agg[b].n)[0];
  if (!weak) return title("Tes points faibles") + `<p class="lead">Termine quelques quiz : l'appli repérera ta matière la plus fragile et te fera retravailler tes erreurs.</p>`;
  if (!bankReady()) return "";
  const missed = [];
  state.eds.forEach((ed) => (ed.quiz || []).forEach((q, i) => {
    const a = state.answers[ed.date]?.[i];
    if (q.matiere === weak && a !== undefined && a !== q.bonne) missed.push({ ...q, key: `${ed.date}:${i}` });
  }));
  const retry = (state.retry ||= {});
  const p = Math.round((100 * agg[weak].ok) / agg[weak].n);
  return title(`Tes points faibles : ${RUB[weak].nom}`, `${p}%`, RUB[weak].c) +
    `<p class="lead">${missed.length ? "Refais les questions que tu as ratées dans cette matière." : "Aucune erreur à refaire pour l'instant dans cette matière."}</p>` +
    missed.slice(0, 5).map((q) => qcm(q, retry[q.key], `data-retry="${q.key}"`, RUB[weak].c)).join("");
}

function quiz() {
  const ed = state.ed, ans = state.answers[ed.date] || {};
  const finished = ed.quiz.length && Object.keys(ans).length === ed.quiz.length;
  const score = ed.quiz.filter((q, i) => ans[i] === q.bonne).length;
  return `${finished ? `<div class="final"><div class="kicker">Score du jour</div><b>${score}/${ed.quiz.length}</b><div class="trad">${score >= 7 ? "Excellent, tu tiens la cadence concours." : score >= 5 ? "Solide. Relis les explications ratées." : "Relis les corrections : c'est comme ça qu'on progresse."}</div></div>` : ""}
    ${title(`Quiz du ${fmtDate(ed.date, { day: "numeric", month: "long" })}`, `${Object.keys(ans).length}/${ed.quiz.length}`)}
    ${ed.quiz.map((q, i) => { const rub = RUB[q.matiere] || RUB.eco;
      return qcm(q, ans[i], `data-q="${i}"`, rub.c, `<div class="meta"><span class="pill">${rub.nom}</span><span>Q${i + 1}</span></div>`); }).join("")}
    ${pointsFaibles(aggregat())}`;
}

// ---------- entraînement : maths, cas pratique, sujet (format ECT) ----------
const reveal = (k, label) => state.shown[k] || store.get("vus", {})[k] ? null : bigBtn(label, `data-vu="${k}"`);

function planCard(p, date, open) {
  const k = `plan:${date}`, btn = open ? null : reveal(k, "Voir le plan type");
  return `<div class="q" style="--c:var(--accent)">
    <div class="meta"><span class="pill">${esc(p.matiere)}</span><span>${fmtDate(date)}</span></div>
    <p class="qt">${esc(p.sujet)}</p>
    ${btn ? `<p class="lead" style="margin:0 0 6px">Prends 15 minutes au brouillon : définis chaque terme, trouve la tension, écris ta problématique et un plan en 2 parties et 2 sous-parties. Ensuite, compare.</p>${btn}`
    : `<div class="block"><h4>Analyse des termes</h4><p>${esc(p.analyse)}</p></div>
      <div class="block"><h4>Problématique</h4><p>${esc(p.problematique)}</p></div>
      ${p.parties.map((x, i) => `<div class="block"><h4>${["I", "II", "III"][i]}. ${esc(x.titre)}</h4>${(x.sous || []).map((s, j) => `<p>${"AB"[j] || "•"}. ${esc(s)}</p>`).join("")}</div>`).join("")}
      ${p.exemples?.length ? `<div class="block"><h4>À mobiliser</h4>${p.exemples.map((e) => `<p>• ${esc(e)}</p>`).join("")}</div>` : ""}`}
  </div>`;
}

function casCard(c, date) {
  const btn = reveal(`cas:${date}`, "Voir le corrigé en syllogisme");
  return `<div class="q" style="--c:var(--droit)">
    <div class="meta"><span class="pill">Cas pratique</span><span>${fmtDate(date)}</span></div>
    <p>${esc(c.faits)}</p><p class="qt">${esc(c.question)}</p>
    ${btn ? `<p class="lead" style="margin:0 0 6px">Rédige les 4 étapes : qualification des faits, problème juridique, majeure, conclusion.</p>${btn}`
    : [["1. Qualification des faits", c.qualification], ["2. Problème juridique", c.probleme], ["3. Majeure", c.majeure], ["4. Conclusion", c.conclusion]]
      .map(([h, t]) => `<div class="block"><h4>${h}</h4><p>${esc(t)}</p></div>`).join("")}
  </div>`;
}

function mathsCard(m, k) {
  const btn = reveal(k, "Voir la correction");
  return `<div class="q" style="--c:var(--accent)">
    <div class="meta"><span class="pill">Maths</span><span class="lvl">${lvl(m.niveau)}</span></div>
    <h3 style="margin:4px 0">${esc(m.titre)}</h3><p class="math">${esc(m.enonce)}</p>
    ${btn || `<div class="block"><h4>Correction</h4>${m.etapes.map((s) => `<p class="math">${esc(s)}</p>`).join("")}</div>
      <div class="expl"><b>Résultat :</b> <span class="math">${esc(m.resultat)}</span>${m.piege ? `<br><b>Piège :</b> ${esc(m.piege)}` : ""}</div>`}
  </div>`;
}

function entrainement() {
  const ed = state.ed, s = state.trainSub || "maths";
  const chips = `<div class="chips">${Object.entries({ qcm: "QCM droit", maths: "Maths", cas: "Cas pratique", sujet: "QRA / veille" }).map(([k, v]) =>
    `<button class="chip ${k === s ? "on" : ""}" data-train="${k}">${v}</button>`).join("")}</div>`;
  const vide = `<p class="lead">Rien aujourd'hui : ça arrive avec la prochaine édition du matin.</p>`;
  let html = "", older = "";
  const eds = bankReady() ? state.eds.filter((e) => e.date !== ed?.date) : [];
  if (s === "qcm") return chips + qcmCours("droit-c2");
  if (s === "maths") {
    html = `<p class="lead">Deux exercices par jour sur le chapitre en cours, corrigés pas à pas. Fais-les sur papier avant de regarder.</p>` +
      ((ed?.maths || []).map((m, i) => mathsCard(m, `maths:${ed.date}:${i}`)).join("") || vide);
    older = eds.filter((e) => e.maths?.length).slice(0, 20).map((e) => e.maths.map((m, i) =>
      `<details class="card"><summary><div class="meta"><span class="pill">Maths</span><span>${fmtDate(e.date)}</span></div><h3>${esc(m.titre)}</h3></summary><div class="body">${mathsCard(m, `maths:${e.date}:${i}`)}</div></details>`).join("")).join("");
  } else if (s === "cas") {
    html = ed?.cas_pratique ? casCard(ed.cas_pratique, ed.date) : vide;
    older = eds.filter((e) => e.cas_pratique).slice(0, 20).map((e) =>
      `<details class="card"><summary><div class="meta"><span class="pill">Cas pratique</span><span>${fmtDate(e.date)}</span></div><h3>${esc(e.cas_pratique.question)}</h3></summary><div class="body">${casCard(e.cas_pratique, e.date)}</div></details>`).join("");
  } else {
    html = ed?.plan ? planCard(ed.plan, ed.date) : vide;
    older = eds.filter((e) => e.plan).slice(0, 20).map((e) =>
      `<details class="card"><summary><div class="meta"><span class="pill">${esc(e.plan.matiere)}</span><span>${fmtDate(e.date)}</span></div><h3>${esc(e.plan.sujet)}</h3></summary><div class="body">${planCard(e.plan, e.date, true)}</div></details>`).join("");
  }
  return chips + html + (older ? title("Jours précédents") + older : "");
}

// ---------- QCM de cours (droit T1 C2 : les majeures) ----------
const QCMS = { "droit-c2": { url: "data/qcm-droit-c2.json", nom: "Droit · T1 C2 – Sources du droit" } };
const melange = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function qcmNouvelle(id, ids) {
  const s = { ids: melange(ids), perm: {}, ans: {}, saved: false };
  ids.forEach((q) => (s.perm[q] = melange([0, 1, 2, 3])));
  store.set(`qcm:${id}`, s); return s;
}
function qcmCours(id = "droit-c2") {
  const d = (state.qcmData ||= {})[id];
  if (!d) { fetch(QCMS[id].url).then((r) => r.json()).then((x) => { state.qcmData[id] = x; render(); }).catch(() => {}); return loading("Chargement du QCM…"); }
  const byId = Object.fromEntries(d.questions.map((q) => [q.id, q]));
  let s = store.get(`qcm:${id}`, null);
  if (!s || !s.ids.every((k) => byId[k])) s = qcmNouvelle(id, d.questions.map((q) => q.id));
  const n = s.ids.length, faites = s.ids.filter((k) => s.ans[k] !== undefined);
  const rates = faites.filter((k) => s.ans[k] !== byId[k].bonne_reponse), fini = faites.length === n;
  if (fini && !s.saved) {
    const h = store.get("qcmHist", {}); (h[id] ||= []).unshift({ date: new Date().toISOString(), ok: n - rates.length, n, rates });
    store.set("qcmHist", h); s.saved = true; store.set(`qcm:${id}`, s);
  }
  const note = Math.round(((n - rates.length) / n) * 200) / 10;
  const bilan = fini ? `<div class="final"><div class="kicker">${n < d.questions.length ? "Tes erreurs refaites" : "Ta note"}</div><b>${String(note).replace(".", ",")}/20</b>
      <div class="trad">${n - rates.length}/${n} bonnes réponses.</div></div>
    ${rates.length ? `${title("Majeures à revoir", rates.length)}${rates.map((k) => `<div class="block"><h4>${esc(byId[k].majeure)}</h4><p>${esc(byId[k].majeure_a_ecrire)}</p></div>`).join("")}
      ${bigBtn(`Refaire mes ${rates.length} erreur${rates.length > 1 ? "s" : ""}`, `data-qcmretry="${id}"`)}` : `<p class="lead">Aucune erreur : toutes les majeures sont acquises.</p>`}
    ${bigBtn("Recommencer les 18 questions", `data-qcmnew="${id}"`)}` : "";
  const hist = (store.get("qcmHist", {})[id] || []).slice(0, 8);
  return `<p class="lead">Pour chaque situation, trouve la bonne règle. Après ta réponse, recopie la majeure toute prête dans ton syllogisme.</p>
    ${bilan}
    ${title(QCMS[id].nom, `${faites.length}/${n}`)}
    ${s.ids.map((k, i) => { const q = byId[k], p = s.perm[k], a = s.ans[k];
      const vue = { question: q.question, choix: p.map((o) => q.choix[o]), bonne: p.indexOf(q.bonne_reponse), explication: q.explication };
      return qcm(vue, a === undefined ? undefined : p.indexOf(a), `data-qcm="${id}" data-qk="${k}"`, "var(--droit)",
        `<div class="meta"><span class="pill">Droit · C2</span><span>Q${i + 1}</span></div>`)
        + (a !== undefined ? `<div class="block" style="border-left:3px solid var(--droit);padding-left:10px;margin:-6px 0 14px"><h4>Majeure à écrire · ${esc(q.majeure)}</h4><p>${esc(q.majeure_a_ecrire)}</p></div>` : ""); }).join("")}
    ${hist.length ? title("Tes résultats") + `<table class="hist">${hist.map((x) => `<tr><td>${fmtDate(x.date.slice(0, 10), { day: "numeric", month: "short" })}</td><td>${String(Math.round((x.ok / x.n) * 200) / 10).replace(".", ",")}/20 (${x.ok}/${x.n})</td></tr>`).join("")}</table>` : ""}`;
}

// Méthodes : reprises de la méthodologie de ton prof (ECT 2026/2027)
const METHODES = [
  { t: "Structure de l'épreuve de droit et d'économie", m: "eco", e: [
    "Deux parties de poids égal : Économie et Droit, chacune en 2 ou 3 exercices.",
    "Économie : analyse d'un dossier documentaire (questions avec calculs, sans plan) + question à réponse argumentée (QRA). Note de synthèse à l'ESSEC.",
    "Droit : cas pratique (syllogisme) + analyse d'une décision de justice, et/ou réflexion de veille juridique.",
    "Exemple en 2 h : dossier 25 min, QRA 35 min, cas pratique 35 min, décision de justice 25 min."] },
  { t: "Économie : analyse d'un dossier", m: "eco", e: [
    "Réponds de façon structurée sans plan : définition, mécanisme, appui sur le document.",
    "Pose tous les calculs (VA = CA − CI, productivité, taux de variation, IHH…) puis interprète-les.",
    "Discute les affirmations du document : un chiffre ne prouve pas tout (ex : productivité en hausse ≠ salariés plus efficaces, effet des machines ou de l'externalisation)."] },
  { t: "Économie : question à réponse argumentée (QRA)", m: "eco", e: [
    "Brouillon : interroge chaque terme du sujet (double sens, liens entre eux) pour faire apparaître des tensions.",
    "Mobilise les connaissances théoriques précises (auteurs, théories) liées au sujet, et vérifie que chacune y répond.",
    "Construis un plan en 2 parties et 2 sous-parties qui répond à ta problématique.",
    "Introduction : accroche, définitions et liens entre les termes, problématique personnelle, annonce des 2 parties.",
    "Développement : dans chaque sous-partie, un ou plusieurs auteurs et théories expliqués et illustrés par des données récentes.",
    "Plus développée à Ecricome qu'à l'ESSEC. À l'ESSEC, ne réutilise pas le dossier de la note de synthèse."] },
  { t: "Économie : note de synthèse", m: "eco", e: [
    "500 mots (± 10 %), compte-les régulièrement.",
    "Brouillon en tableau : une colonne par document, idées principales reformulées.",
    "Regroupe les idées en grandes catégories : plan souvent binaire (constats / solutions, causes / conséquences).",
    "Intro de 10 lignes max (accroche, problématique, annonce), puis 2 parties et 2 sous-parties avec plan apparent.",
    "Tous les documents mobilisés, aucune connaissance extérieure, pas de paraphrase, titre imposé respecté."] },
  { t: "Droit : cas pratique (syllogisme)", m: "droit", e: [
    "Qualification des faits (la mineure) : traduis la situation en termes juridiques (chaque partie, le lien qui les unit), sans encore parler de droit.",
    "Problème juridique : une question abstraite, valable pour tous les cas similaires (jamais « Madame X peut-elle… ? »).",
    "Majeure : les règles de droit applicables (loi, jurisprudence).",
    "Conclusion : applique les règles aux faits, réponds à la question et précise les conséquences juridiques."] },
  { t: "Droit : analyse d'une décision de justice", m: "droit", e: [
    "Identification : juridiction, date, lieu (une décision de 1re instance n'a pas la portée d'un arrêt de la Cour de cassation).",
    "Parties et qualité procédurale : demandeur / défendeur, appelant / intimé, demandeur / défendeur au pourvoi (pas les noms propres).",
    "Qualification juridique des faits, chronologique, sans paraphrase ni détail inutile.",
    "Problème de droit, sous forme de question abstraite.",
    "Procédure : tableau degré / juridiction / parties / sens de la décision.",
    "Moyens (arguments juridiques) et prétentions (ce qui est réclamé) : ne pas les confondre.",
    "Solution : explique le raisonnement du juge (le motif), sans recopier."] },
  { t: "Droit : veille juridique", m: "droit", e: [
    "Thème imposé : « Libertés individuelles et activité économique des entreprises ». Ne traite que le champ précis du sujet.",
    "Introduction : accroche tirée de l'actualité, définition précise des termes, problématique, annonce des 2 parties.",
    "Développement : 2 parties et 2 sous-parties ; chacune = une idée, son fondement juridique, une brève explication, un exemple réel et récent.",
    "Conclusion très brève : une ou deux phrases qui répondent à la problématique."] },
  { t: "Management : étude de cas", m: "mgmt", e: [
    "Lis d'abord les questions, puis les annexes en notant les informations utiles pour chacune.",
    "Pour chaque réponse : notion du cours définie → application au cas avec des éléments chiffrés ou cités des annexes → conclusion.",
    "Mobilise les outils : PESTEL, forces de Porter, diagnostic interne, modèle LCAG.",
    "Pas de récitation de cours sans lien avec le cas."] },
  { t: "Langues : essay et traduction", m: "monde", e: [
    "Essay : intro (accroche, problématique, annonce), 2 ou 3 paragraphes argumentés avec exemples d'actu, conclusion. Respecte le nombre de mots.",
    "Varie les connecteurs (however, whereas, moreover / sin embargo, mientras que, además).",
    "Version : comprends tout le texte avant de traduire ; thème : méfie-toi des faux-amis et des calques."] },
  { t: "Maths : le premier geste", m: "mgmt", e: [
    "Calculer → je souligne l'opération prioritaire. Simplifier une fraction → je décompose haut et bas.",
    "Développer → les flèches, puis tous les produits avec leur signe. Factoriser → facteur commun, sinon identité.",
    "Résoudre → je reconnais la forme (produit nul, quotient nul, x² = a…). Inéquation → je retourne le signe si je divise par un négatif.",
    "Étudier un signe → je factorise puis tableau de signe."] },
];
function methodes() {
  return `<p class="lead">Les méthodes de ton prof, à relire avant chaque DS.</p>` + METHODES.map((x) =>
    `<details class="card" style="--c:${RUB[x.m].c}"><summary><h3>${esc(x.t)}</h3><div class="more-hint">Ouvrir la méthode ↓</div></summary>
      <div class="body">${x.e.map((s, i) => `<div class="block"><h4>Étape ${i + 1}</h4><p>${esc(s)}</p></div>`).join("")}</div></details>`).join("");
}

// ---------- classement entre amis (Supabase) ----------
// Clé « publishable » : faite pour être publique, la sécurité vient des règles de la base.
const SUPA_URL = "https://jeqkvsmemcheoxkufili.supabase.co", SUPA_KEY = "sb_publishable_IEAwkHUKKvU-_kPstfMB2Q_ZJAlY2w0";
const supa = (path, opts = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, {
  ...opts, headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) },
});
async function sendScore() {
  const me = store.get("me", null), ed = state.ed;
  if (!me || !ed) return;
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
  if (!me) return;
  state.board = "loading";
  try {
    const r = await supa(`scores?select=pseudo,jour,score,total&groupe=eq.${encodeURIComponent(me.groupe)}&jour=gte.${addDays(-6)}`);
    const rows = await r.json(), by = {};
    rows.forEach((x) => { const p = (by[x.pseudo] ||= { pseudo: x.pseudo, pts: 0, n: 0, jours: 0 }); p.pts += x.score; p.n += x.total; p.jours++; });
    state.board = Object.values(by).sort((a, b) => b.pts - a.pts || b.jours - a.jours);
  } catch { state.board = "error"; }
  render();
}
function classement() {
  const me = store.get("me", null);
  if (!me) return `<p class="lead">Choisis un pseudo et le code de ton groupe d'amis. Seuls ceux qui ont le même code apparaissent dans votre classement.</p>
    <input id="pseudo" class="search" maxlength="20" placeholder="Ton pseudo">
    <input id="groupe" class="search" maxlength="30" placeholder="Code du groupe (ex : ect1-condorcet)">
    ${bigBtn("Rejoindre le classement", 'id="join"')}`;
  if (state.board === undefined) { loadBoard(); return loading(); }
  if (state.board === "loading") return loading();
  if (state.board === "error") return loading("Classement indisponible pour l'instant (connexion ?).");
  return `<p class="lead">Groupe <b>${esc(me.groupe)}</b> · points des 7 derniers jours (1 bonne réponse au quiz = 1 point).</p>
    <table class="hist board">${state.board.map((p, i) => `<tr class="${p.pseudo === me.pseudo ? "me" : ""}"><td>${["🥇", "🥈", "🥉"][i] || i + 1} ${esc(p.pseudo)}</td><td>${p.jours} j · ${p.n ? Math.round((100 * p.pts) / p.n) : 0}%</td><td><b>${p.pts}</b></td></tr>`).join("") || "<tr><td>Personne n'a encore joué cette semaine.</td></tr>"}</table>
    <p class="trad" style="margin-top:14px">Ton score est envoyé automatiquement quand tu termines le quiz du jour. <button class="read-btn" id="leave">Changer de pseudo</button></p>`;
}

function reviser() {
  const s = state.sub.reviser;
  const body = s === "quiz" ? (state.ed ? quiz() : loading("Pas de quiz aujourd'hui.")) : s === "entrainement" ? entrainement()
    : s === "jeux" ? jeux() : s === "methodes" ? methodes() : s === "classement" ? classement() : fiches();
  return subtabs("reviser", { fiches: "Fiches", quiz: "Quiz", entrainement: "Entraînement", jeux: "Jeux", methodes: "Méthodes", classement: "Classement" }) + body;
}

// =====================================================================
//  MINI-JEUX : auteurs, dates, arrêts
// =====================================================================
const JEUX = {
  chrono: { t: "Chrono 60 s", i: "⏱️", d: "Un max de bonnes réponses en 60 secondes. Enchaîne pour gagner des bonus." },
  survie: { t: "Vrai ou faux", i: "❤️", d: "Associations vraies ou fausses. 3 vies : jusqu'où iras-tu ?" },
  frise: { t: "Frise", i: "📅", d: "Remets 4 événements dans l'ordre chronologique. 5 manches." },
  paires: { t: "Paires", i: "🧩", d: "Relie 5 auteurs à leur idée, le plus vite possible." },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const jeuPool = () => { const d = state.jeuData; return [...d.auteur.map((x) => ({ ...x, type: "auteur" })), ...d.date.map((x) => ({ ...x, type: "date" }))]; };
function jeuQ() {
  const pool = jeuPool(), it = pick(pool);
  const autres = [...new Set(pool.filter((x) => x.type === it.type && x.r !== it.r).map((x) => x.r))];
  return { it, choix: melange([it.r, ...melange(autres).slice(0, 3)]) };
}
function jeuVF() {
  const pool = jeuPool(), it = pick(pool), vrai = Math.random() < .5;
  const r = vrai ? it.r : pick(pool.filter((x) => x.type === it.type && x.r !== it.r)).r;
  return { it, r, vrai };
}
function jeuFrise() {
  const L = melange(state.jeuData.date), out = [];
  for (const x of L) { if (!out.some((y) => y.r === x.r)) out.push(x); if (out.length === 4) break; }
  return { items: out, tap: [] };
}
function jeuPaires() {
  const out = [];
  for (const x of melange(state.jeuData.auteur)) { if (!out.some((y) => y.r === x.r)) out.push(x); if (out.length === 5) break; }
  return { items: out, gauche: melange(out.map((_, i) => i)), droite: melange(out.map((_, i) => i)), ok: [], sel: null, err: 0, debut: Date.now() };
}
function jeuStart(mode) {
  const j = { mode, score: 0, combo: 0, flash: null };
  if (mode === "chrono") { j.end = Date.now() + 60000; j.q = jeuQ(); }
  if (mode === "survie") { j.vies = 3; j.q = jeuVF(); }
  if (mode === "frise") { j.manche = 1; j.f = jeuFrise(); }
  if (mode === "paires") j.p = jeuPaires();
  state.jeu = j; jeuTick();
}
function jeuFin(score) {
  const j = state.jeu, rec = store.get("jeuRec", {}), m = j.mode;
  const mieux = m === "paires" ? rec[m] === undefined || score < rec[m] : score > (rec[m] || 0);
  if (mieux) { rec[m] = score; store.set("jeuRec", rec); }
  j.fini = { score, record: mieux }; actif(); clearInterval(state.jeuTimer);
}
function jeuTick() {
  clearInterval(state.jeuTimer);
  state.jeuTimer = setInterval(() => {
    const j = state.jeu;
    if (!j || j.fini || !["chrono", "paires"].includes(j.mode)) return clearInterval(state.jeuTimer);
    const el = document.getElementById("jeu-t");
    if (j.mode === "paires") { if (el) el.textContent = `${Math.floor((Date.now() - j.p.debut) / 1000)} s`; return; }
    const left = Math.max(0, j.end - Date.now());
    if (el) el.textContent = `${Math.ceil(left / 1000)} s`;
    const bar = document.getElementById("jeu-bar"); if (bar) bar.style.width = `${left / 600}%`;
    if (!left) { jeuFin(j.score); if (state.tab === "reviser") render(); }
  }, 200);
}
const fmtRec = (m, v) => v === undefined ? "—" : m === "paires" ? `${v} s` : m === "frise" ? `${v}/5` : `${v} pts`;
const lblQ = (it) => it.type === "auteur" ? "Qui est derrière cette idée ?" : "En quelle année ?";

function jeux() {
  if (!state.jeuData) {
    fetch("data/jeu.json").then((r) => r.json()).then((d) => { state.jeuData = d; render(); }).catch(() => {});
    return loading("Chargement des jeux…");
  }
  const j = state.jeu, rec = store.get("jeuRec", {});
  if (!j) return `<p class="lead">Des parties de 1 à 2 minutes pour réviser auteurs, dates et arrêts sans t'en rendre compte.</p>
    <div class="jeux">${Object.entries(JEUX).map(([k, x]) => `<button class="jeu-card" data-jeu-go="${k}"><span class="ico">${x.i}</span>
      <span class="txt"><b>${x.t}</b><small>${x.d}</small></span><span class="rec">Record<br><b>${fmtRec(k, rec[k])}</b></span></button>`).join("")}</div>`;
  const info = JEUX[j.mode];
  const head = (droite) => `<div class="jeu-top"><button class="read-btn" data-jeu-quit>✕ Quitter</button><b>${info.i} ${info.t}</b><span id="jeu-t">${droite}</span></div>`;
  if (j.fini) return head("") + `<div class="final"><div class="kicker">${j.fini.record ? "🏆 Nouveau record !" : "Partie terminée"}</div>
      <b>${fmtRec(j.mode, j.fini.score)}</b><div class="trad">Record : ${fmtRec(j.mode, rec[j.mode])}</div></div>
      ${j.revoir?.length ? title("À retenir") + j.revoir.slice(-6).map((x) => `<div class="block"><p><b>${esc(x.r)}</b> · ${esc(x.q)}</p></div>`).join("") : ""}
      <div class="flash-btns">${bigBtn("Rejouer", `data-jeu-go="${j.mode}"`)}${bigBtn("Autres jeux", "data-jeu-quit")}</div>`;
  const flash = j.flash ? `<div class="jeu-flash ${j.flash.ok ? "ok" : "ko"}">${esc(j.flash.t)}</div>` : `<div class="jeu-flash"></div>`;

  if (j.mode === "chrono") {
    const left = Math.max(0, j.end - Date.now());
    return head(`${Math.ceil(left / 1000)} s`) + `<div class="progress" style="padding:10px 14px"><div class="row"><span>${j.score} pts</span><span>${j.combo >= 2 ? `🔥 série de ${j.combo}` : ""}</span></div>
      <div class="track"><div class="fill" id="jeu-bar" style="width:${left / 600}%"></div></div></div>${flash}
      <div class="q"><div class="meta"><span class="pill" style="--c:${RUB[j.q.it.m]?.c || "var(--accent)"}">${lblQ(j.q.it)}</span></div>
      <p class="qt">${esc(j.q.it.q)}</p>${j.q.choix.map((c, i) => `<button class="choice" data-jeu-c="${i}">${esc(c)}</button>`).join("")}</div>`;
  }
  if (j.mode === "survie") {
    return head(`${"❤️".repeat(j.vies)}${"🤍".repeat(3 - j.vies)}`) + `<div class="progress" style="padding:10px 14px"><div class="row"><span>${j.score} bonne${j.score > 1 ? "s" : ""} réponse${j.score > 1 ? "s" : ""}</span><span>${j.combo >= 3 ? `🔥 ${j.combo}` : ""}</span></div></div>${flash}
      <div class="q" style="text-align:center"><div class="meta" style="justify-content:center"><span class="pill">${j.q.it.type === "auteur" ? "Auteur" : "Date"}</span></div>
      <p class="qt">${esc(j.q.it.q)}</p><div class="vf-r">${esc(j.q.r)}</div>
      <div class="flash-btns">${bigBtn("✗ Faux", 'data-jeu-vf="0"')}${bigBtn("✓ Vrai", 'data-jeu-vf="1"')}</div></div>`;
  }
  if (j.mode === "frise") {
    const f = j.f, done = f.tap.length === 4, bon = [...f.items].sort((a, b) => a.r - b.r);
    return head(`Manche ${j.manche}/5`) + `<p class="lead">Touche les événements du <b>plus ancien</b> au <b>plus récent</b>.</p>
      <div class="q">${(done ? f.tap.map((i) => f.items[i]) : f.items).map((x, k) => {
        const i = f.items.indexOf(x), pos = f.tap.indexOf(i);
        const cls = done ? (bon[k] === x ? "ok" : "ko") : "";
        return `<button class="choice frise ${cls}" data-jeu-f="${i}" ${pos >= 0 ? "disabled" : ""}><span class="num">${pos >= 0 ? pos + 1 : ""}</span>${esc(x.q)}${done ? ` <b>· ${x.r}</b>` : ""}</button>`; }).join("")}
      ${done ? `<div class="expl"><b>${f.tap.every((i, k) => f.items[i] === bon[k]) ? "✓ Parfait !" : "✗ Bon ordre :"}</b> ${bon.map((x) => x.r).join(" → ")}</div>${bigBtn(j.manche < 5 ? "Manche suivante" : "Voir mon score", "data-jeu-next")}` : ""}</div>`;
  }
  const p = j.p;
  return head(`${Math.floor((Date.now() - p.debut) / 1000)} s`) + `<p class="lead">Touche un auteur, puis son idée. Chaque erreur coûte 5 s.${p.err ? ` Erreurs : <b>${p.err}</b>` : ""}</p>${flash}
    <div class="paires"><div>${p.gauche.map((i) => `<button class="choice ${p.ok.includes(i) ? "ok" : ""} ${p.sel === i ? "sel" : ""}" data-jeu-pl="${i}" ${p.ok.includes(i) ? "disabled" : ""}>${esc(p.items[i].r)}</button>`).join("")}</div>
    <div>${p.droite.map((i) => `<button class="choice small ${p.ok.includes(i) ? "ok" : ""}" data-jeu-pr="${i}" ${p.ok.includes(i) ? "disabled" : ""}>${esc(p.items[i].q)}</button>`).join("")}</div></div>`;
}

function jeuClick(el) {
  const j = state.jeu, d = el.dataset;
  if (d.jeuGo !== undefined) { jeuStart(d.jeuGo); scrollTo(0, 0); return render(); }
  if (d.jeuQuit !== undefined) { state.jeu = null; clearInterval(state.jeuTimer); return render(); }
  if (!j || j.fini) return;
  const revoir = (it) => (j.revoir ||= []).push(it);
  if (d.jeuC !== undefined && j.mode === "chrono") {
    const c = j.q.choix[+d.jeuC], it = j.q.it;
    if (c === it.r) { j.combo++; const gain = 1 + Math.floor(j.combo / 3); j.score += gain; j.flash = { ok: true, t: `✓ +${gain}${gain > 1 ? " (bonus série)" : ""}` }; }
    else { j.combo = 0; j.flash = { ok: false, t: `✗ C'était ${it.r}` }; revoir(it); }
    j.q = jeuQ(); return keep();
  }
  if (d.jeuVf !== undefined && j.mode === "survie") {
    const juste = (d.jeuVf === "1") === j.q.vrai, it = j.q.it;
    if (juste) { j.score++; j.combo++; j.flash = { ok: true, t: "✓ Bien vu" }; }
    else { j.vies--; j.combo = 0; j.flash = { ok: false, t: `✗ ${it.q} → ${it.r}` }; revoir(it); }
    if (j.vies <= 0) jeuFin(j.score); else j.q = jeuVF();
    return keep();
  }
  if (d.jeuF !== undefined && j.mode === "frise") {
    const f = j.f; if (f.tap.length < 4 && !f.tap.includes(+d.jeuF)) f.tap.push(+d.jeuF);
    if (f.tap.length === 4) {
      const bon = [...f.items].sort((a, b) => a.r - b.r);
      if (f.tap.every((i, k) => f.items[i] === bon[k])) j.score++; else bon.forEach(revoir);
    }
    return keep();
  }
  if (d.jeuNext !== undefined && j.mode === "frise") { if (j.manche >= 5) jeuFin(j.score); else { j.manche++; j.f = jeuFrise(); } return keep(); }
  if (j.mode === "paires") {
    const p = j.p;
    if (d.jeuPl !== undefined) { p.sel = +d.jeuPl; j.flash = null; return keep(); }
    if (d.jeuPr !== undefined) {
      if (p.sel === null) { j.flash = { ok: false, t: "Choisis d'abord un auteur à gauche" }; return keep(); }
      if (p.sel === +d.jeuPr) { p.ok.push(p.sel); j.flash = { ok: true, t: `✓ ${p.items[p.sel].r}` }; }
      else { p.err++; j.flash = { ok: false, t: "✗ Raté, +5 s" }; revoir(p.items[p.sel]); }
      p.sel = null;
      if (p.ok.length === p.items.length) jeuFin(Math.round((Date.now() - p.debut) / 1000) + 5 * p.err);
      return keep();
    }
  }
}

// =====================================================================
//  LANGUES
// =====================================================================
const FLAG = { en: "🇬🇧 English", es: "🇪🇸 Español" };
const langChips = () => `<div class="chips">${["en", "es"].map((l) => `<button class="chip ${state.lang === l ? "on" : ""}" data-lang="${l}">${FLAG[l]}</button>`).join("")}</div>`;

function trous() {
  const ed = state.ed, l = state.lang, t0 = ed?.langues?.trous?.[l];
  // l'IA écrit parfois "texto" (espagnol) au lieu de "texte"
  const t = t0 && { ...t0, texte: t0.texte || t0.texto || t0.text || "" };
  if (!t || !t.texte || !Array.isArray(t.blancs)) return langChips() + loading("Les textes à trous arrivent avec la prochaine édition du matin.");
  const key = `trous:${ed.date}:${l}`, rep = store.get(key, {});
  const texte = esc(t.texte).replace(/\{(\d+)\}/g, (_, n) => {
    const i = +n - 1, b = t.blancs[i]; if (!b) return "___";
    const a = rep[i];
    return a === undefined ? `<span class="blank">(${n}) ____</span>` : `<span class="blank ${a === b.bonne ? "ok" : "ko"}">${esc(b.choix[b.bonne])}</span>`;
  });
  // la phrase qui contient le blanc n, affichée juste au-dessus de ses choix
  const phrases = t.texte.match(/[^.!?]+[.!?]*["»”]?\s*/g) || [t.texte];
  const phrase = (n) => esc((phrases.find((p) => p.includes(`{${n}}`)) || "").trim()).replace(/\{(\d+)\}/g, (_, m) => {
    const b = t.blancs[+m - 1]; if (+m === n) return `<span class="blank">(${n}) ____</span>`;
    return b && rep[+m - 1] !== undefined ? esc(b.choix[b.bonne]) : `(${m}) ___`;
  });
  const score = t.blancs.filter((b, i) => rep[i] === b.bonne).length, fini = Object.keys(rep).length === t.blancs.length;
  return langChips() + `<p class="lead">Choisis le bon mot pour chaque blanc. Le texte s'inspire d'un vrai article du jour.</p>
    <div class="q lang-text">${texte}</div>
    ${fini ? `<div class="final"><div class="kicker">Score</div><b>${score}/${t.blancs.length}</b></div>` : ""}
    ${t.blancs.map((b, i) => { const a = rep[i], done = a !== undefined;
      return `<div class="trou"><span class="n">${i + 1}</span>${done ? "" : `<p class="lang-text" style="margin:2px 0 8px">${phrase(i + 1)}</p>`}<div class="chips wrap">${b.choix.map((c, j) =>
        `<button class="chip ${done && j === b.bonne ? "good" : ""} ${done && j === a && a !== b.bonne ? "bad" : ""}" data-trou="${i}" data-c="${j}" ${done ? "disabled" : ""}>${esc(c)}</button>`).join("")}</div>
        ${done ? `<div class="trad">${esc(b.explication)}</div>` : ""}</div>`; }).join("")}`;
}

function traduction() {
  const ed = state.ed, list = ed?.langues?.traduction || [];
  if (!list.length) return loading("Les phrases de thème et version arrivent avec la prochaine édition.");
  const lab = { "fr>en": "Thème 🇫🇷→🇬🇧", "en>fr": "Version 🇬🇧→🇫🇷", "fr>es": "Thème 🇫🇷→🇪🇸", "es>fr": "Version 🇪🇸→🇫🇷" };
  return `<p class="lead">Traduis chaque phrase sur une feuille ou dans ta tête, puis compare avec le corrigé.</p>` + list.map((t, i) => {
    const k = `tr:${ed.date}:${i}`;
    return `<div class="q" style="--c:var(--monde)"><div class="meta"><span class="pill">${lab[t.sens] || t.sens}</span></div>
      <p class="qt">${esc(t.phrase)}</p>
      ${state.shown[k] ? `<div class="expl"><b>Corrigé :</b> ${esc(t.corrige)}${t.astuce ? `<br><b>Astuce :</b> ${esc(t.astuce)}` : ""}</div>` : bigBtn("Voir le corrigé", `data-show="${k}"`)}</div>`;
  }).join("");
}

function pieges() {
  const ed = state.ed, list = (ed?.langues?.pieges || []).map((q, i) => ({ ...q, i })).filter((q) => q.langue === state.lang);
  if (!list.length) return langChips() + loading("Les questions de grammaire arrivent avec la prochaine édition.");
  const rep = store.get("pieges", {})[ed.date] || {};
  return langChips() + `<p class="lead">Grammaire, faux-amis, prépositions : les erreurs qui coûtent des points.</p>` +
    list.map((q) => qcm(q, rep[q.i], `data-piege="${q.i}"`, "var(--monde)")).join("");
}

function lecture() {
  const L = state.ed?.langues || {};
  const one = (x, l) => x ? `<div class="card lang-card" style="--c:var(--monde)">
      <div class="meta"><span class="pill">${FLAG[l]}</span><span>${esc(x.source)} · ${fmtDate(x.date)}</span></div>
      <h3>${esc(x.titre)}</h3><p class="resume">${esc(x.resume)}</p>
      <p class="quote">« ${esc(x.phrase)} »</p><div class="trad">${esc(x.traduction)}</div>
      <div class="src"><a href="${esc(x.lien)}" target="_blank" rel="noopener">Article original ↗</a></div></div>` : "";
  return `<p class="lead">Un résumé d'article par langue chaque jour. Lis-le à voix haute, puis ouvre l'article original.</p>${one(L.en, "en")}${one(L.es, "es")}` || loading();
}

function vocab() {
  const l = state.vocabLang || "";
  return flashUI("vocab", `<p class="lead">Le vocabulaire thématique des concours, plus les mots de l'actu de chaque jour, en révision espacée.</p>
    <div class="chips">${Object.entries({ "": "Tout", en: "🇬🇧 Anglais", es: "🇪🇸 Espagnol" }).map(([k, v]) => `<button class="chip ${k === l ? "on" : ""}" data-vlang="${k}">${v}</button>`).join("")}</div>`);
}

function langues() {
  const s = state.sub.langues;
  if (s === "vocab" && !Array.isArray(state.bank)) loadBank();
  const body = s === "vocab" ? vocab() : !state.ed ? loading("Pas d'édition disponible.") : s === "traduction" ? traduction() : s === "pieges" ? pieges() : s === "lecture" ? lecture() : trous();
  return subtabs("langues", { trous: "Textes à trous", vocab: "Vocabulaire", traduction: "Thème / version", pieges: "Grammaire", lecture: "Lecture" }) + body;
}

// =====================================================================
//  MOI : agenda, notes, stats, sauvegarde
// =====================================================================
const TYPES = ["DS", "Khôlle", "Concours blanc", "Devoir maison", "Autre"];
const MATS_AG = { eco: "Économie", droit: "Droit", mgmt: "Management", maths: "Maths", en: "Anglais", es: "Espagnol", cg: "Culture générale" };

function agenda() {
  const ev = store.get("agenda", []).sort((a, b) => a.date.localeCompare(b.date));
  const fut = ev.filter((e) => e.date >= today()), past = ev.filter((e) => e.date < today()).reverse();
  const line = (e, p) => `<div class="ev"><div><b>${esc(e.type)} · ${esc(MATS_AG[e.matiere] || "")}</b>${e.titre ? ` — ${esc(e.titre)}` : ""}
      <div class="trad">${fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}${p ? "" : ` · ${daysUntil(e.date) === 0 ? "aujourd'hui" : "J-" + daysUntil(e.date)}`}</div></div>
      ${p ? `<input class="note" type="number" inputmode="decimal" min="0" max="20" step="0.25" placeholder="/20" value="${e.note ?? ""}" data-note="${e.id}">` : ""}
      <button class="read-btn" data-del="${e.id}">✕</button></div>`;
  return title("Ajouter un DS ou une khôlle") + `
    <div class="form">
      <input id="ev-date" type="date" class="search" value="${addDays(7)}">
      <select id="ev-type" class="search">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
      <select id="ev-mat" class="search">${Object.entries(MATS_AG).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <input id="ev-titre" class="search" maxlength="60" placeholder="Chapitre (facultatif)">
    </div>
    ${bigBtn("Ajouter", 'id="ev-add"')}
    ${title("À venir", `${fut.length}`)}${fut.map((e) => line(e)).join("") || `<p class="lead">Rien de prévu. Ajoute tes DS et khôlles pour voir le compte à rebours sur l'accueil.</p>`}
    ${past.length ? title("Passés : entre ta note") + past.slice(0, 20).map((e) => line(e, true)).join("") : ""}`;
}

function stats() {
  const agg = aggregat(), hist = store.get("history", {}), days = Object.keys(hist).sort().reverse();
  const tot = days.reduce((a, k) => [a[0] + hist[k].ok, a[1] + hist[k].n], [0, 0]);
  const prog = store.get("leitner", {}), cards = Array.isArray(state.cards) ? state.cards : [];
  const notes = {}; store.get("agenda", []).forEach((e) => { if (e.note !== undefined && e.note !== "") (notes[e.matiere] ||= []).push(+e.note); });
  const deckStat = Object.entries({ ...MAT, en: "Anglais", es: "Espagnol" }).map(([m, v]) => {
    const pool = cards.filter((c) => c.m === m), vu = pool.filter((c) => prog[c.id]).length, su = pool.filter((c) => prog[c.id]?.box >= 3).length;
    const p = pool.length ? Math.round((100 * su) / pool.length) : 0;
    return `<div class="bar" style="--c:${RUB[m]?.c || "var(--monde)"}">${v} — ${su} sues / ${vu} vues / ${pool.length}<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
  }).join("");
  return `<div class="stats">
      <div class="stat"><b>${serieJours()}</b><span>jours d'affilée</span></div>
      <div class="stat"><b>${state.stats.best}</b><span>meilleure série quiz</span></div>
      <div class="stat"><b>${tot[1] ? Math.round((100 * tot[0]) / tot[1]) : 0}%</b><span>réussite quiz</span></div>
      <div class="stat"><b>${Object.values(prog).filter((p) => p.box >= 3).length}</b><span>fiches sues</span></div>
    </div>
    ${Object.keys(notes).length ? title("Moyennes (notes de l'agenda)") + `<table class="hist">${Object.entries(notes).map(([m, l]) =>
      `<tr><td>${MATS_AG[m] || m} · ${l.length} note${l.length > 1 ? "s" : ""}</td><td><b>${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2).replace(".", ",")}</b>/20</td></tr>`).join("")}</table>` : ""}
    ${title("Maîtrise des fiches")}<div class="bars">${deckStat}</div>
    ${title("Quiz : réussite par matière")}<div class="bars">${Object.keys(RUB).map((m) => {
      const s = agg[m] || { ok: 0, n: 0 }, p = s.n ? Math.round((100 * s.ok) / s.n) : 0;
      return `<div class="bar" style="--c:${RUB[m].c}">${RUB[m].nom} — ${s.ok}/${s.n} (${p}%)<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
    }).join("")}</div>
    ${title("Historique des quiz", `${days.length} jours`)}
    <table class="hist">${days.slice(0, 30).map((k) => `<tr><td>${fmtDate(k, { weekday: "short", day: "numeric", month: "short" })}</td><td>${hist[k].ok}/${hist[k].n}</td></tr>`).join("") || "<tr><td>Aucun quiz terminé pour l'instant.</td></tr>"}</table>`;
}

function reglages() {
  return title("Date des écrits") + `<p class="lead">Sert au compte à rebours de l'accueil.</p>
    <input id="concours" type="date" class="search" value="${store.get("concours", "2028-04-12")}">
    ${title("Sauvegarde")}<p class="lead">Ta progression est enregistrée sur ce téléphone. Exporte-la de temps en temps et garde-la dans une note.</p>
    <p><button class="read-btn" id="export">Exporter</button> <button class="read-btn" id="import">Importer</button></p>`;
}

function moi() {
  const s = state.sub.moi;
  if (!Array.isArray(state.cards)) loadCards();
  return subtabs("moi", { agenda: "Agenda et notes", stats: "Statistiques", reglages: "Réglages" }) +
    (s === "stats" ? stats() : s === "reglages" ? reglages() : agenda());
}

// =====================================================================
//  RENDU
// =====================================================================
function render() {
  const v = $("#view"), ed = state.ed;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  if (document.body.dataset.tab !== state.tab) { document.body.dataset.tab = state.tab; v.animate?.([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" }); }
  $("#dateline").textContent = ed ? fmtDate(ed.date + "T12:00", { weekday: "long", day: "numeric", month: "long" }) : "Édition à venir";
  $("#ticker").innerHTML = ed ? [...Object.keys(RUB).map((k) => `${RUB[k].court} <b>${(ed.rubriques?.[k] || []).length}</b>`),
    `Quiz <b>${(ed.quiz || []).length}</b>`, `MàJ <b>${fmtHour(ed.genere_le)}</b>`].map((s) => `<span>${s}</span>`).join("") : "";
  const needsEd = state.tab === "actu";
  if (needsEd && !ed) { v.innerHTML = `<div class="empty"><h2>Pas encore d'édition</h2><p>La prochaine édition sera publiée vers 6 h.</p></div>`; return; }
  v.innerHTML = { auj: aujourdhui, actu, reviser, langues, moi }[state.tab]();
}
const goTo = (tab, sub) => {
  state.tab = tab; store.set("tab", tab);
  if (sub) { state.sub[tab] = sub; store.set("subs", state.sub); }
  state.showBack = false; render(); scrollTo(0, 0);
};
const keep = () => { const y = scrollY; render(); scrollTo(0, y); };

// =====================================================================
//  ÉVÉNEMENTS
// =====================================================================
$("#tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) goTo(b.dataset.tab); };

$("#view").addEventListener("click", (e) => {
  const t = e.target, at = (a) => t.closest(`[${a}]`);
  let el;
  if ((el = at("data-goto"))) { e.preventDefault(); const [tab, sub] = el.dataset.goto.split(":"); return goTo(tab, sub); }
  if ((el = at("data-sub"))) { const [tab, sub] = el.dataset.sub.split(":"); state.sub[tab] = sub; store.set("subs", state.sub); if (sub === "classement") state.board = undefined; state.showBack = false; return render(); }
  if ((el = at("data-fmat"))) { state.ficheMat = el.dataset.fmat; state.showBack = false; return render(); }
  if ((el = at("data-vlang"))) { state.vocabLang = el.dataset.vlang; state.showBack = false; return render(); }
  if ((el = at("data-lang"))) { state.lang = el.dataset.lang; store.set("lang", state.lang); return render(); }
  if (at("data-flip")) { state.showBack = true; return render(); }
  if ((el = at("data-grade"))) { gradeCard(el.dataset.deck, el.dataset.grade === "1"); return render(); }
  if ((el = at("data-show"))) { state.shown[el.dataset.show] = true; actif(); return keep(); }
  if ((el = at("data-vu"))) { const v = store.get("vus", {}); v[el.dataset.vu] = true; store.set("vus", v); actif(); return keep(); }
  if ((el = t.closest("[data-jeu-go],[data-jeu-quit],[data-jeu-c],[data-jeu-vf],[data-jeu-f],[data-jeu-next],[data-jeu-pl],[data-jeu-pr]")) && !el.disabled) return jeuClick(el);
  if ((el = at("data-train"))) { state.trainSub = el.dataset.train; return render(); }
  if ((el = at("data-qcm")) && !el.disabled) {
    const id = el.dataset.qcm, s = store.get(`qcm:${id}`, null); if (!s) return;
    const k = el.dataset.qk; s.ans[k] = s.perm[k][+el.dataset.c]; store.set(`qcm:${id}`, s); actif(); return keep();
  }
  if ((el = at("data-qcmretry"))) {
    const id = el.dataset.qcmretry, s = store.get(`qcm:${id}`, null), d = state.qcmData[id];
    const rates = s.ids.filter((k) => s.ans[k] !== d.questions.find((q) => q.id === k).bonne_reponse);
    qcmNouvelle(id, rates); scrollTo(0, 0); return render();
  }
  if ((el = at("data-qcmnew"))) { const id = el.dataset.qcmnew; qcmNouvelle(id, state.qcmData[id].questions.map((q) => q.id)); scrollTo(0, 0); return render(); }

  if ((el = at("data-trou")) && !el.disabled) {
    const key = `trous:${state.ed.date}:${state.lang}`, r = store.get(key, {});
    r[el.dataset.trou] = +el.dataset.c; store.set(key, r); actif(); return keep();
  }
  if ((el = at("data-piege")) && !el.disabled) {
    const all = store.get("pieges", {}), d = (all[state.ed.date] ||= {});
    d[el.dataset.piege] = +el.dataset.c; store.set("pieges", all); actif(); return keep();
  }
  if ((el = at("data-retry")) && !el.disabled) { (state.retry ||= {})[el.dataset.retry] = +el.dataset.c; return keep(); }
  if ((el = at("data-btheme"))) { state.bankTheme = el.dataset.btheme; return render(); }
  if ((el = at("data-read"))) { const u = el.dataset.read; state.read[u] = !state.read[u]; store.set("read", state.read); return render(); }

  if ((el = at("data-q")) && !el.disabled) {
    const ed = state.ed, i = +el.dataset.q, j = +el.dataset.c;
    (state.answers[ed.date] ||= {})[i] = j; store.set("answers", state.answers);
    if (j === ed.quiz[i].bonne) { state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); }
    else state.stats.streak = 0;
    store.set("stats", state.stats); actif();
    if (Object.keys(state.answers[ed.date]).length === ed.quiz.length) { recordResult(); sendScore(); }
    return keep();
  }

  if (t.id === "join") {
    const pseudo = $("#pseudo").value.trim(), groupe = $("#groupe").value.trim().toLowerCase();
    if (!pseudo || !groupe) return alert("Remplis ton pseudo et le code du groupe.");
    store.set("me", { pseudo, groupe }); state.board = undefined; sendScore().then(() => { state.board = undefined; render(); }); return;
  }
  if (t.id === "leave") { store.set("me", null); state.board = undefined; return render(); }

  if (t.id === "ev-add") {
    const date = $("#ev-date").value; if (!date) return alert("Choisis une date.");
    const ev = store.get("agenda", []);
    ev.push({ id: Date.now().toString(36), date, type: $("#ev-type").value, matiere: $("#ev-mat").value, titre: $("#ev-titre").value.trim() });
    store.set("agenda", ev); return keep();
  }
  if ((el = at("data-del"))) { store.set("agenda", store.get("agenda", []).filter((x) => x.id !== el.dataset.del)); return keep(); }

  if (t.id === "export") {
    const data = {};
    for (const k of ["answers", "stats", "history", "read", "leitner", "newDay", "agenda", "actif", "vus", "pieges", "concours", "me", "qcmHist", "qcm:droit-c2"]) data[k] = store.get(k, null);
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("ect:trous:")) data[k.slice(4)] = store.get(k.slice(4)); }
    const txt = JSON.stringify(data);
    navigator.clipboard?.writeText(txt).then(() => alert("Progression copiée. Colle-la dans une note pour la sauvegarder."), () => prompt("Copie ce texte :", txt));
  }
  if (t.id === "import") {
    const txt = prompt("Colle ici ta sauvegarde :"); if (!txt) return;
    try { const d = JSON.parse(txt); for (const k in d) if (d[k] != null) store.set(k, d[k]); location.reload(); }
    catch { alert("Sauvegarde invalide."); }
  }
});

$("#view").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.note) {
    const ev = store.get("agenda", []), x = ev.find((y) => y.id === t.dataset.note);
    if (x) { const v = t.value === "" ? undefined : Math.max(0, Math.min(20, +t.value)); if (v === undefined) delete x.note; else x.note = v; store.set("agenda", ev); }
  }
  if (t.id === "concours" && t.value) store.set("concours", t.value);
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
loadCards();
loadEdition();
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#archive").value) loadEdition(); });
