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
const ACTU = ["eco", "droit", "mgmt"];            // la géopolitique (« monde ») n'est plus affichée
const strip = (s = "") => String(s).replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
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
  sub: { actu: "jour", reviser: "cours", langues: "vocab", moi: "agenda", ...store.get("subs", {}) },
  answers: store.get("answers", {}),   // { "2026-11-11": { 0: 2, 1: 0 } }
  read: store.get("read", {}),
  stats: store.get("stats", { streak: 0, best: 0 }),
  lang: store.get("lang", "en"),
  shown: {},                           // corrigés affichés
};
// anciennes rubriques retirées -> on retombe sur une rubrique existante
if (!["jour", "exemples"].includes(state.sub.actu)) state.sub.actu = "jour";
if (["classement", "methodes"].includes(state.sub.reviser)) state.sub.reviser = "cours";
if (!["vocab", "trous", "pieges"].includes(state.sub.langues)) state.sub.langues = "vocab";
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
  if (state.ed) { const p = await quizPool(); quizJour(state.ed, p); }
  render();
}

// ---------- quiz du jour : uniquement tes cours (flashcards + QCM tirés de tes polys) ----------
// 3 questions par matière : la question d'actu du jour si elle existe, le reste tiré de tes chapitres
// (au moins une sur les deux derniers chapitres). Tirage fixe pour une date donnée.
let POOL = null;
async function quizPool() {
  if (POOL) return POOL;
  return (POOL = (async () => {
    let cartes = [], qcms = [];
    try { cartes = (await loadJSON("data/cartes.json")).cartes; } catch {}
    await Promise.all(Object.entries(QCMS).map(async ([id, v]) => {
      try { const d = await loadJSON(v.url); (state.qcmData ||= {})[id] = d; d.questions.forEach((q) => qcms.push({ ...q, m: v.m, tag: v.court })); } catch {}
    }));
    const pool = [];
    qcms.forEach((q) => pool.push({ matiere: q.m, tag: q.tag, ch: chapKey(q.tag), question: q.question, choix: q.choix, bonne: q.bonne_reponse,
      explication: `${q.explication} ${QCM_MAT[q.m].maj} : ${q.majeure_a_ecrire}` }));
    const cours = cartes.filter((c) => ACTU.includes(c.m) && !/méthode/i.test(c.ch));
    cours.forEach((c) => {
      const voisins = cours.filter((x) => x.m === c.m && x.ch === c.ch && x.r !== c.r);
      const autres = voisins.length >= 3 ? voisins : cours.filter((x) => x.m === c.m && x.r !== c.r);
      pool.push({ matiere: c.m, tag: c.ch.replace(/ – .*/, ""), ch: chapKey(c.ch), question: c.q, bonne: c.r, faux: autres.map((x) => x.r), explication: c.r });
    });
    return pool;
  })());
}
const graine = (str) => { let h = 1779033703; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
function quizJour(ed, pool) {
  if (ed.quizCours) return ed.quiz;
  const rnd = graine(ed.date || "x"), pick = (a) => a.splice(Math.floor(rnd() * a.length), 1)[0];
  const actu = {}; (ed.quiz_version >= 2 ? ed.quiz || [] : []).forEach((q) => { if (ACTU.includes(q.matiere) && q.id && !actu[q.matiere]) actu[q.matiere] = { ...q, tag: "Actu" }; });
  const out = [];
  ACTU.forEach((m) => {
    const tous = pool.filter((q) => q.matiere === m), chs = [...new Set(tous.map((q) => q.ch))].filter((k) => /^C\d/.test(k)).sort((a, b) => a.localeCompare(b, "fr", { numeric: true })).slice(-2);
    const recents = tous.filter((q) => chs.includes(q.ch)), pris = [];
    if (actu[m]) out.push(actu[m]);
    const n = 3 - (actu[m] ? 1 : 0);
    if (recents.length) pris.push(pick(recents));
    while (pris.length < n && tous.length) { const q = pick(tous); if (!pris.includes(q) && !pris.some((x) => x.question === q.question)) pris.push(q); }
    pris.forEach((q) => {
      if (typeof q.bonne === "number") return out.push(q);
      const faux = [...new Set(q.faux)], fx = []; while (fx.length < 3 && faux.length) fx.push(pick(faux));
      const choix = [...fx], b = Math.floor(rnd() * (fx.length + 1)); choix.splice(b, 0, q.bonne);
      out.push({ ...q, choix, bonne: b, explication: "" });
    });
  });
  ed.quiz = out; ed.quizCours = true;
  return out;
}
const qKey = (ed) => `${ed.date}#cours`;
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
  const pool = await quizPool(); state.eds.forEach((ed) => quizJour(ed, pool));
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

// ---------- planning : semaine type, khôlles, DS ----------
async function loadPlan() {
  try { state.plan = await loadJSON("data/planning.json"); } catch { state.plan = null; }
  render();
}
const wdIdx = (iso) => (new Date(iso + "T12:00").getDay() + 6) % 7; // 0 = lundi
const KH_MAT = { "Économie": "eco", "Management": "mgmt", "Droit": "droit", "Maths": "maths", "Anglais": "en", "Espagnol": "es" };
const MATIN = { maths: "maths", de: "droit", mgmt: "mgmt" };
const COUL = { maths: "var(--maths)", de: "var(--droit)", mgmt: "var(--mgmt)", lang: "var(--monde)", ds: "var(--bad)", free: "var(--muted)", kh: "var(--accent)" };
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const enVacances = (iso) => (state.plan?.vacances || []).some(([a, b]) => iso >= a && iso <= b);
function dsWeekend(iso) { // [matière du samedi, matière du dimanche] pour la semaine de iso
  const P = state.plan, sat = addDays(5 - wdIdx(iso), iso);
  const k = Math.round((new Date(sat + "T12:00") - new Date(P.ds_rotation_depart + "T12:00")) / (7 * 864e5));
  const L = P.ds_rotation; return L[((k % L.length) + L.length) % L.length];
}
function evenements(iso) { // khôlles et DS de la journée
  const P = state.plan; if (!P || enVacances(iso)) return [];
  const out = (P.kholles[iso] || []).map(([h, m, salle]) => ({ type: "kholle", h, m, salle, key: KH_MAT[m] }));
  const wd = wdIdx(iso);
  if (wd === 2) out.push({ type: "ds", h: "14h-18h", m: "DS officiel" });
  if (wd === 5) out.push({ type: "ds", h: "15h-17h40", m: dsWeekend(iso)[0], we: 1 });
  if (wd === 6) out.push({ type: "ds", h: "9h30-12h10", m: dsWeekend(iso)[1], we: 2 });
  return out;
}
function prochains(n = 14, filtre = () => true) {
  const out = [];
  for (let i = 0; i <= n; i++) { const d = addDays(i); evenements(d).filter(filtre).forEach((e) => out.push({ ...e, date: d })); }
  return out;
}
const quand = (iso) => { const n = daysUntil(iso); return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `${JOURS[wdIdx(iso)]} ${fmtDate(iso + "T12:00", { day: "numeric", month: "numeric" })}`; };

function planningJour(iso) {
  const P = state.plan, wd = wdIdx(iso), J = P.semaine[wd], tot = iso <= P.mise_en_route_jusqu_au;
  if (enVacances(iso)) return `<div class="slot" style="--c:var(--good)"><div class="h"><span>${fmtDate(iso + "T12:00", { day: "numeric", month: "short" })}</span><b>Vacances</b></div><p>Pas de semaine type pendant les vacances : on fera un plan à part.</p></div>`;
  const ds = dsWeekend(iso);
  const slot = (h, t, d, c, how) => `<div class="slot" style="--c:${COUL[c] || c}"><div class="h"><span>${esc(h)}</span><b>${esc(t)}</b></div>${d ? `<p>${esc(d)}</p>` : ""}
    ${how && P.comment[how] ? `<details><summary>Comment faire</summary><ol>${P.comment[how].map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}</div>`;
  const kh = (P.kholles[iso] || []).map(([h, m, salle]) => slot(h, `Khôlle ${m}`, `Salle ${salle}.${KH_MAT[m] ? " Fais une série en mode khôlle le matin ou dans le trajet." : ""}`, "kh")).join("");
  let html = wd < 5 ? slot(tot ? "6h10" : "5h40", "Lever", "Eau, visage, habillé. Téléphone pas ouvert.", "free") : "";
  J.creneaux.forEach(([h, t, d, c], j) => {
    if (wd < 5 && j === 0) h = tot ? "6h20-7h05" : "5h55-7h05";
    d = d.replace("%DS1%", `Matière : ${ds[0]}. Demande le sujet dans le projet.`).replace("%DS2%", `Matière : ${ds[1]}. Demande le sujet dans le projet.`);
    html += slot(h, t, d, c, wd < 5 && j === 0 ? J.matin : c === "ds" && wd >= 5 && j === (wd === 5 ? 1 : 0) ? "ds" : null);
    if (wd < 5 && j === 0) html += slot("7h23", "Départ", "Trajet de 35 min.", "free") + kh;
  });
  if (wd === 4 || wd === 6) html += slot("21h55", "Lumière éteinte", wd === 6 ? "Téléphone posé à 21h30." : "", "free");
  return html;
}

// séance du jour, remplie selon la semaine type
function seance(iso) {
  const P = state.plan, ed = state.ed, wd = wdIdx(iso), J = P.semaine[wd], items = [];
  const tk = store.get("todo", {})[iso] || {}, cards = Array.isArray(state.cards), vus = store.get("vus", {});
  const man = (id, t, s, go) => items.push({ id, t, s, ok: !!tk[id], go });
  const auto = (t, s, ok, go) => items.push({ t, s, ok, go });
  const flash = (m, label) => { const n = cards ? fichesQueue("cours", m).length : "…"; auto(`Flashcards ${label}`, n === 0 ? "à jour" : `${n} à revoir`, n === 0, `reviser:fiches:${m}`); };
  const qcmJour = (id, t) => { const h = (store.get("qcmHist", {})[id] || [])[0], fait = !!h && h.date.slice(0, 10) === iso;
    auto(t, fait ? `${String(Math.round((h.ok / h.n) * 200) / 10).replace(".", ",")}/20` : `${QCMS[id].n} questions`, fait, `reviser:entrainement:qcm=${id}`); };
  const vac = enVacances(iso);
  // matin
  if (!vac && J.matin === "maths") {
    man("cours", "Réciter le cours de maths", "formules", "reviser:cours:maths");
    if (ed?.maths?.length) auto("Exercices de maths du jour", `${ed.maths.length} exos`, ed.maths.every((m, i) => vus[`maths:${ed.date}:${i}`]), "reviser:entrainement:maths");
    flash("maths", "maths");
  } else if (!vac && J.matin === "de") {
    man("cours", "Fiches droit et éco du cours de la veille", "articles, notions", "reviser:cours:droit");
    qcmJour("droit-c3", "QCM droit : justice et preuve");
    flash("droit", "droit"); flash("eco", "éco");
  } else if (!vac && J.matin === "mgmt") {
    man("cours", "Fiche de management du cours de la veille", "théorisations", "reviser:cours:mgmt");
    qcmJour("mgmt-c34", "QCM management : les diagnostics");
    flash("mgmt", "management");
  }
  // khôlles et DS du jour
  evenements(iso).forEach((e) => {
    if (e.type === "kholle" && e.key) {
      const fait = (store.get("kholleHist", []) || []).some((x) => x.d === iso && x.m === e.key);
      auto(`Mode khôlle : ${e.m}`, e.h, fait, `reviser:kholle:${e.key}`);
    }
    if (e.type === "ds" && e.we) man(`ds${e.we}`, `DS n°${e.we} : ${e.m} (2h)`, e.h, null);
  });
  if (!vac && wd === 6) man("corr", "Corriger les 2 DS", "erreurs → carnet", "reviser:erreurs");
  // la veille d'un DS : relire le carnet d'erreurs
  const dsDemain = evenements(addDays(1, iso)).find((e) => e.type === "ds");
  if (dsDemain) auto("Relire ton carnet d'erreurs", `${dsDemain.we ? "DS " + dsDemain.m : "DS officiel"} demain`, store.get("relu", "") === iso, "reviser:erreurs:relecture");
  // soir
  if (!vac && (J.soir === "en" || J.soir === "es")) {
    const n = cards ? fichesQueue("vocab", J.soir).length : "…";
    auto(J.soir === "en" ? "Anglais · 25 min" : "Espagnol · 20 min", n === 0 ? "vocabulaire à jour" : `${n} mots puis texte à trous`, n === 0, `langues:vocab:${J.soir}`);
  }
  if (!vac && J.soir === "flash") { const n = cards ? fichesQueue("cours", "").length : "…"; auto("Flashcards · 25 min", n === 0 ? "à jour" : `${n} à revoir`, n === 0, "reviser:fiches:"); }
  if (ed?.quiz?.length && ed.date === iso) {
    const qDone = Object.keys(state.answers[qKey(ed)] || {}).length;
    auto("Quiz du jour", `${qDone}/${ed.quiz.length}`, qDone === ed.quiz.length, "reviser:quiz");
  }
  return items;
}

function aujourdhui() {
  const ed = state.ed, n = ed?.notion_du_jour;
  const concours = store.get("concours", "2028-04-12");
  if (!state.plan) return loading(state.plan === null ? "Planning indisponible (connexion ?)." : "Chargement…");
  const t = today(), wk = state.planWeek || 0, monday = addDays(7 * wk - wdIdx(t), t), jour = state.planDay ?? wdIdx(t), iso = addDays(jour, monday);
  const perso = store.get("agenda", []).filter((e) => e.date >= t).map((e) => ({ ...e, perso: true }));
  const next = [...prochains(14, (e) => e.type === "kholle" || e.we), ...perso].sort((a, b) => a.date.localeCompare(b.date))[0];
  const items = seance(t), done = items.filter((i) => i.ok).length, pct = items.length ? Math.round((100 * done) / items.length) : 0;
  const nextTxt = next ? next.perso ? `${esc(next.type)} ${esc(MAT[next.matiere] || next.matiere || "")} ${esc(next.titre || "")}`
    : next.type === "kholle" ? `Khôlle ${esc(next.m)} · ${esc(next.h)}` : `DS ${esc(next.m)} · ${esc(next.h)}` : "";
  return `<div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat"><b>${daysUntil(concours)}</b><span>jours avant les écrits</span></div>
      <div class="stat"><b>${serieJours()}</b><span>jour${serieJours() > 1 ? "s" : ""} d'affilée 🔥</span></div>
    </div>
    ${next ? `<a href="#" class="next-ev" data-goto="${next.type === "kholle" && next.key ? `reviser:kholle:${next.key}` : next.perso ? "moi:agenda" : "reviser:erreurs:relecture"}"><b>${nextTxt}</b> <span>${quand(next.date)}</span></a>` : ""}
    ${title("Ta séance du jour")}
    <div class="progress"><div class="row"><span>${done === items.length && done ? "Séance terminée, bravo !" : "Progression"}</span><span>${done}/${items.length}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>
    <div class="todo">${items.map((x) => `<a href="#" ${x.go ? `data-goto="${x.go}"` : `data-tick="${x.id}"`} class="${x.ok ? "ok" : ""}"><span class="tick" ${x.id ? `data-tick="${x.id}"` : ""}></span><span>${esc(x.t)}</span><small>${esc(x.s)}</small></a>`).join("") || `<a href="#" data-goto="reviser:fiches"><span class="tick"></span><span>Rien d'imposé aujourd'hui</span><small>flashcards</small></a>`}</div>
    ${title("Ton planning")}
    <div class="week-nav"><button class="read-btn" data-pweek="-1" aria-label="Semaine précédente">‹</button>
      <span>${wk === 0 ? "Cette semaine" : wk === 1 ? "Semaine prochaine" : wk === -1 ? "Semaine dernière" : "Semaine"} · du ${fmtDate(monday + "T12:00", { day: "numeric", month: "numeric" })} au ${fmtDate(addDays(6, monday) + "T12:00", { day: "numeric", month: "numeric" })}</span>
      <button class="read-btn" data-pweek="1" aria-label="Semaine suivante">›</button></div>
    <div class="days">${["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"].map((l, j) => `<button class="${wk === 0 && j === wdIdx(t) ? "today" : ""} ${j === jour ? "on" : ""}" data-pday="${j}">${l}</button>`).join("")}</div>
    <p class="lead" style="margin-top:10px"><b style="color:var(--ink)">${esc(state.plan.semaine[jour].nom)} ${fmtDate(iso + "T12:00", { day: "numeric", month: "numeric" })}</b> · ${esc(state.plan.semaine[jour].sous)}</p>
    <div class="slots">${planningJour(iso)}</div>
    ${n ? `<div class="notion" style="margin-top:22px">
      <div class="kicker">Notion du jour · ${esc(n.matiere)}</div>
      <h3>${esc(n.titre)}</h3><p>${esc(n.definition)}</p><p class="ex">${esc(n.exemple)}</p></div>` : ""}`;
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

function actusDuJour() {
  const ed = state.ed;
  const list = ACTU.map((k) => [k, (ed.rubriques?.[k] || [])[0]]).filter(([, a]) => a);
  return title("Les actus du jour", `${list.length} sujets`) +
    `<p class="lead">Une actu par matière, chacune reliée à une notion du cours : à placer en QRA, en veille juridique ou en application dans une étude de cas.</p>` +
    list.map(([k, a]) => `<div class="kicker" style="margin:14px 4px 6px;color:${RUB[k].c}">${RUB[k].nom}</div>` + articleCard(a, k)).join("") + indicateurs();
}

function exemples() {
  if (!bankReady()) return loading("Chargement de tes exemples…");
  const q = (state.bankQ || "").toLowerCase(), th = state.bankTheme || "";
  const counts = {};
  state.bank.forEach((a) => ACTU.includes(a.rub) && (counts[a.theme] = (counts[a.theme] || 0) + 1));
  const list = state.bank.filter((a) => ACTU.includes(a.rub) && (!th || a.theme === th) &&
    (!q || [a.titre, a.resume, a.copie, ...(a.notions || [])].join(" ").toLowerCase().includes(q)));
  return title("Banque d'exemples", `${list.length} actus`) + `
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
  return subtabs("actu", { jour: "Les actus du jour", exemples: "Banque d'exemples" })
    + (s === "exemples" ? exemples() : actusDuJour());
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

function deckPool(deck, filtre) {
  if (!Array.isArray(state.cards)) return [];
  if (deck === "vocab") {
    const l = filtre ?? state.lang ?? "";
    return [...state.cards.filter((c) => c.m === "en" || c.m === "es"), ...vocabEditions()].filter((c) => !l || c.m === l);
  }
  const m = filtre ?? state.ficheMat ?? "";
  return state.cards.filter((c) => MAT[c.m] && (!m || c.m === m));
}

function fichesQueue(deck, filtre) {
  const prog = store.get("leitner", {}), t = today(), pool = deckPool(deck, filtre);
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
  return flashUI("cours", `<p class="lead">Les flashcards de ton cours, les auteurs, les grands arrêts et les formules de maths. Une carte ratée revient le jour même, une carte sue revient à J+1, J+3, J+7, J+15 puis J+30.</p>
    <div class="chips">${Object.entries({ "": "Tout", ...MAT }).map(([k, v]) => `<button class="chip ${k === m ? "on" : ""}" data-fmat="${k}">${v}</button>`).join("")}</div>`);
}

// =====================================================================
//  RÉVISER : quiz, plans, méthodes, classement
// =====================================================================
function recordResult() {
  const ed = state.ed, ans = state.answers[qKey(ed)] || {};
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
  const weak = ACTU.filter((m) => agg[m]?.n >= 3).sort((a, b) => agg[a].ok / agg[a].n - agg[b].ok / agg[b].n)[0];
  if (!weak) return title("Tes points faibles") + `<p class="lead">Termine quelques quiz : l'appli repérera ta matière la plus fragile et te fera retravailler tes erreurs.</p>`;
  if (!bankReady()) return "";
  const missed = [];
  state.eds.forEach((ed) => (ed.quiz || []).forEach((q, i) => {
    const a = state.answers[qKey(ed)]?.[i];
    if (q.matiere === weak && a !== undefined && a !== q.bonne) missed.push({ ...q, key: `${ed.date}:${i}` });
  }));
  const retry = (state.retry ||= {});
  const p = Math.round((100 * agg[weak].ok) / agg[weak].n);
  return title(`Tes points faibles : ${RUB[weak].nom}`, `${p}%`, RUB[weak].c) +
    `<p class="lead">${missed.length ? "Refais les questions que tu as ratées dans cette matière." : "Aucune erreur à refaire pour l'instant dans cette matière."}</p>` +
    missed.slice(0, 5).map((q) => qcm(q, retry[q.key], `data-retry="${q.key}"`, RUB[weak].c)).join("");
}

function quiz() {
  const ed = state.ed, ans = state.answers[qKey(ed)] || {};
  const finished = ed.quiz.length && Object.keys(ans).length === ed.quiz.length;
  const score = ed.quiz.filter((q, i) => ans[i] === q.bonne).length;
  return `${finished ? `<div class="final"><div class="kicker">Score du jour</div><b>${score}/${ed.quiz.length}</b><div class="trad">${score >= 7 ? "Excellent, tu tiens la cadence concours." : score >= 5 ? "Solide. Relis les explications ratées." : "Relis les corrections : c'est comme ça qu'on progresse."}</div></div>` : ""}
    ${title(`Quiz du ${fmtDate(ed.date, { day: "numeric", month: "long" })}`, `${Object.keys(ans).length}/${ed.quiz.length}`)}
    <p class="lead">Uniquement tes cours : 3 questions par matière tirées de tes polys (dont une sur tes derniers chapitres), plus la question d'actu du jour quand il y en a une.</p>
    ${ed.quiz.map((q, i) => { const rub = RUB[q.matiere] || RUB.eco;
      return qcm(q, ans[i], `data-q="${i}"`, rub.c, `<div class="meta"><span class="pill">${rub.nom}${q.tag ? ` · ${esc(q.tag)}` : ""}</span><span>Q${i + 1}</span></div>`); }).join("")}
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
  const chips = `<div class="chips">${Object.entries({ qcm: "QCM", maths: "Maths", cas: "Cas pratique", sujet: "QRA / veille" }).map(([k, v]) =>
    `<button class="chip ${k === s ? "on" : ""}" data-train="${k}">${v}</button>`).join("")}</div>`;
  const vide = `<p class="lead">Rien aujourd'hui : ça arrive avec la prochaine édition du matin.</p>`;
  let html = "", older = "";
  const eds = bankReady() ? state.eds.filter((e) => e.date !== ed?.date) : [];
  if (s === "qcm") return chips + qcmCours(state.qcmId);
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
const QCMS = {
  "droit-c3": { url: "data/qcm-droit-c3.json", m: "droit", nom: "Droit · T1 C3 – Justice et preuve", court: "Droit C3", n: 20 },
  "droit-c2": { url: "data/qcm-droit-c2.json", m: "droit", nom: "Droit · T1 C2 – Sources du droit", court: "Droit C2", n: 18 },
  "mgmt-c34": { url: "data/qcm-mgmt-c34.json", m: "mgmt", nom: "Management · C3-C4 – Les diagnostics", court: "Mgmt C3-C4", n: 12 },
  "eco-c3": { url: "data/qcm-eco-c3.json", m: "eco", nom: "Économie · T1 C3 – Relations entre agents", court: "Éco C3", n: 10 },
};
const QCM_MAT = { droit: { c: "var(--droit)", maj: "Majeure à écrire", rev: "Majeures à revoir", lead: "Pour chaque situation, trouve la bonne règle. Après ta réponse, recopie la majeure toute prête dans ton syllogisme." },
  mgmt: { c: "var(--mgmt)", maj: "Théorisation à dire", rev: "Théorisations à revoir", lead: "Choisis la bonne notion, puis retiens la théorisation (définition + auteur) à placer en khôlle ou en DS." },
  eco: { c: "var(--eco)", maj: "À placer en QRA", rev: "Notions à revoir", lead: "Choisis la bonne réponse, puis retiens la phrase à placer dans ta QRA." } };
const qcmNom = (id) => QCMS[id].nom.replace(/^[^·]+· /, "");
const melange = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function qcmNouvelle(id, ids) {
  const s = { ids: melange(ids), perm: {}, ans: {}, saved: false };
  ids.forEach((q) => (s.perm[q] = melange([0, 1, 2, 3])));
  store.set(`qcm:${id}`, s); return s;
}
function qcmCours(id = "droit-c3") {
  if (!QCMS[id]) id = "droit-c3";
  const M = QCM_MAT[QCMS[id].m];
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
    ${rates.length ? `${title(M.rev, rates.length)}${rates.map((k) => `<div class="block"><h4>${esc(byId[k].majeure)}</h4><p>${esc(byId[k].majeure_a_ecrire)}</p></div>`).join("")}
      ${bigBtn(`Refaire mes ${rates.length} erreur${rates.length > 1 ? "s" : ""}`, `data-qcmretry="${id}"`)}` : `<p class="lead">Aucune erreur, tout est acquis.</p>`}
    ${bigBtn(`Recommencer les ${d.questions.length} questions`, `data-qcmnew="${id}"`)}` : "";
  const hist = (store.get("qcmHist", {})[id] || []).slice(0, 8);
  const choix = `<div class="chips">${Object.entries(QCMS).map(([k, v]) => `<button class="chip ${k === id ? "on" : ""}" data-qcmsel="${k}">${v.court}</button>`).join("")}</div>`;
  return `${choix}<p class="lead">${M.lead}</p>
    ${bilan}
    ${title(QCMS[id].nom, `${faites.length}/${n}`)}
    ${s.ids.map((k, i) => { const q = byId[k], p = s.perm[k], a = s.ans[k];
      const vue = { question: q.question, choix: p.map((o) => q.choix[o]), bonne: p.indexOf(q.bonne_reponse), explication: q.explication };
      return qcm(vue, a === undefined ? undefined : p.indexOf(a), `data-qcm="${id}" data-qk="${k}"`, M.c,
        `<div class="meta"><span class="pill">${QCMS[id].court}</span><span>Q${i + 1}</span></div>`)
        + (a !== undefined ? `<div class="block" style="border-left:3px solid ${M.c};padding-left:10px;margin:-6px 0 14px"><h4>${M.maj} · ${esc(q.majeure)}</h4><p>${esc(q.majeure_a_ecrire)}</p></div>` : ""); }).join("")}
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

// ---------- fiches de cours (Droit / Éco / Management / Maths) ----------
const COURS = { droit: "Droit", eco: "Éco", mgmt: "Mgmt", maths: "Maths", methodes: "Méthodes" };
const norm = (s) => strip(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
async function loadFiches() {
  if (state.fiches) return;
  state.fiches = "loading";
  try { state.fiches = await loadJSON("data/fiches.json"); } catch { state.fiches = null; }
  render();
}
const fichesReady = () => (state.fiches && state.fiches !== "loading") || (!state.fiches && loadFiches(), false);
function ficheItem(it, uLabel, m) {
  const tex = m === "maths";
  return `<div class="it" data-it><div class="k"><span class="ref">${it.k}</span>${it.s ? `<span class="src2">${it.s}</span>` : ""}${it.a ? `<span class="chip2">${it.a}</span>` : ""}${it.bonus ? `<span class="chip2 bonus">hors poly</span>` : ""}</div>
    ${tex ? `<div class="t tex">${it.f}</div><p class="u tex"><b>${uLabel} :</b> ${it.c}</p>
      <div class="exo tex"><b>Mini-exo :</b> ${it.ex}</div>
      <details class="corr"><summary>Voir la correction</summary><div class="tex"><p><b>Formule :</b> ${it.formule}</p><p><b>Application :</b> ${it.app}</p></div></details>`
    : `<p class="t">${it.t}</p>${it.u ? `<p class="u"><b>${uLabel} :</b> ${it.u}</p>` : ""}${it.n ? `<p class="u"><b>Chiffre / exemple :</b> ${it.n}</p>` : ""}${it.w ? `<p class="w">⚠ ${it.w}</p>` : ""}`}</div>`;
}
const tableHTML = (rows) => `<div class="tbl"><table class="hist">${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table></div>`;
function cours() {
  const m = COURS[state.coursMat] ? state.coursMat : store.get("coursMat", "droit");
  const chips = `<div class="chips">${Object.entries(COURS).map(([k, v]) => `<button class="chip ${k === m ? "on" : ""}" data-cmat="${k}">${v}</button>`).join("")}</div>`;
  if (m === "methodes") return chips + methodes();
  if (!fichesReady()) return chips + loading("Chargement des fiches…");
  const d = state.fiches[m], q = norm(state.coursQ || ""), rev = store.get("coursRev", false), open = store.get("coursOpen", {});
  let html = "", hits = 0;
  d.chapters.forEach((ch, ci) => {
    let inner = "";
    ch.groups.forEach((g) => {
      const items = g.items.filter((it) => !q || norm([it.k, it.s, it.a, it.t, it.u, it.n, it.f, it.c, it.ex].join(" ")).includes(q));
      if (items.length) { hits += items.length; inner += `<h4 class="gh">${g.h}</h4>` + items.map((it) => ficheItem(it, d.uLabel, m)).join(""); }
    });
    if (q && !inner) return;
    if (!q && ch.box) inner += `<div class="box"><div class="bt">${ch.box.title}</div>${ch.box.lines ? `<ol>${ch.box.lines.map((l) => `<li>${l}</li>`).join("")}</ol>` : ""}${ch.box.table ? tableHTML(ch.box.table) : ""}</div>`;
    if (!q && ch.qra) inner += `<div class="box"><div class="bt">Sujet de QRA type</div><p><b>${ch.qra.sujet}</b></p><ol>${ch.qra.plan.map((p) => `<li>${p}</li>`).join("")}</ol></div>`;
    const id = `${m}-${ci}`;
    html += `<details class="card fch" data-fch="${id}" ${q || (open[id] ?? ci === 0) ? "open" : ""} style="--c:${RUB[m]?.c || "var(--maths)"}"><summary><span class="chk">${ch.k}</span><h3>${ch.title}</h3><p class="resume trad">${ch.sub}</p></summary><div class="body">${inner}</div></details>`;
  });
  if (!q && d.extra) html += `<details class="card fch" data-fch="${m}-x" ${open[m + "-x"] ? "open" : ""}><summary><span class="chk">Mémo</span><h3>${d.extra.title}</h3></summary><div class="body">${tableHTML(d.extra.table)}</div></details>`;
  if (q && !hits) html += `<div class="empty"><p>Rien pour « ${esc(state.coursQ)} » ici. Essaie une autre matière.</p></div>`;
  return chips + `<p class="lead">${d.lead}</p>
    <input id="coursq" class="search" type="search" placeholder="Chercher (ex. 55, QPC, Porter, PIB, somme)" value="${esc(state.coursQ || "")}">
    <div class="chips"><button class="chip ${rev ? "on" : ""}" data-crev>${rev ? "✓ " : ""}Mode révision : touche pour révéler</button></div>
    <div class="fiches ${rev ? "rev" : ""}">${html}</div>`;
}

// ---------- carnet d'erreurs ----------
const MAT_ERR = { maths: "Maths", droit: "Droit", eco: "Éco", mgmt: "Management", en: "Anglais", es: "Espagnol" };
const COUL_M = (m) => RUB[m]?.c || (m === "maths" ? "var(--maths)" : "var(--monde)");
function addErreur(e) {
  const L = store.get("erreurs", []), deja = e.src && L.find((x) => x.src === e.src);
  if (deja) { deja.n = (deja.n || 1) + 1; deja.ok = false; deja.date = today(); }
  else L.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: today(), pourquoi: "", n: 1, ...e });
  store.set("erreurs", L);
}
function relecture(L) {
  const f = state.errMat || "", list = L.filter((e) => !e.ok && (!f || e.m === f)), i = state.relIdx || 0, e = list[i];
  const head = `<div class="jeu-top"><button class="read-btn" data-er-mode="">✕ Quitter</button><b>📖 Relecture avant DS</b><span>${Math.min(i + 1, list.length)}/${list.length}</span></div>`;
  if (!e) { if (store.get("relu", "") !== today()) store.set("relu", today()); actif();
    return head + `<div class="final"><div class="kicker">Carnet relu</div><b>✓</b><div class="trad">${list.length ? "Tu as tout relu. Bon DS !" : "Aucune erreur à revoir ici."}</div></div>${bigBtn("Recommencer", 'data-er-restart')}`; }
  return head + `<div class="q" style="--c:${COUL_M(e.m)}"><div class="meta"><span class="pill">${esc(MAT_ERR[e.m] || e.m)}${e.chap ? " · " + esc(e.chap) : ""}</span>${e.n > 1 ? `<span>raté ${e.n} fois</span>` : ""}</div>
    <p class="qt">✗ ${esc(e.erreur)}</p>
    ${state.relShow ? `<div class="expl"><b>Correction :</b> ${esc(e.correction)}${e.pourquoi ? `<br><b>Pourquoi je me suis trompé :</b> ${esc(e.pourquoi)}` : ""}</div>
      <div class="flash-btns"><button class="choice ko" data-rel="0">À revoir encore</button><button class="choice ok" data-rel="1">✓ Je maîtrise</button></div>`
    : bigBtn("Voir la correction", "data-rel-show")}</div>`;
}
function erreurs() {
  const L = store.get("erreurs", []), f = state.errMat || "";
  if (state.errMode === "relecture") return relecture(L);
  const ed = state.errEdit ? L.find((x) => x.id === state.errEdit) : null, v = ed || {};
  const counts = {}; L.filter((e) => !e.ok).forEach((e) => (counts[e.m] = (counts[e.m] || 0) + 1));
  const aRevoir = L.filter((e) => !e.ok && (!f || e.m === f)).length;
  const list = L.filter((e) => (!f || e.m === f) && (state.errAll || !e.ok));
  const groupes = Object.keys(MAT_ERR).filter((m) => list.some((e) => e.m === m));
  const card = (e) => `<div class="q err ${e.ok ? "done" : ""}" style="--c:${COUL_M(e.m)}">
      <div class="meta"><span class="pill">${esc(e.chap || "Sans chapitre")}</span><span>${fmtDate(e.date + "T12:00")}${e.n > 1 ? ` · ×${e.n}` : ""}${e.src ? " · auto" : ""}</span></div>
      <p><b class="x-ko">✗</b> ${esc(e.erreur)}</p><p><b class="x-ok">✓</b> ${esc(e.correction)}</p>
      <p class="trad">Pourquoi : ${e.pourquoi ? esc(e.pourquoi) : `<i>à compléter (touche Modifier)</i>`}</p>
      <div class="src"><button class="read-btn" data-er-edit="${e.id}">Modifier</button><button class="read-btn" data-er-ok="${e.id}">${e.ok ? "↺ À revoir" : "✓ Maîtrisée"}</button><button class="read-btn" data-er-del="${e.id}">✕</button></div></div>`;
  return `<p class="lead">Une ligne par erreur : l'erreur, la correction, et surtout <b>pourquoi</b> tu t'es trompé. Les erreurs des QCM, du quiz et du mode khôlle arrivent ici toutes seules. Relis-le la veille de chaque DS.</p>
    ${bigBtn(`📖 Relecture avant DS · ${aRevoir} erreur${aRevoir > 1 ? "s" : ""}`, 'data-er-mode="relecture"')}
    <details class="card" ${ed || !L.length ? "open" : ""} style="margin-top:12px"><summary><h3>${ed ? "Modifier l'erreur" : "＋ Ajouter une erreur"}</h3></summary><div class="body">
      <div class="form">
        <select id="er-m" class="search">${Object.entries(MAT_ERR).map(([k, x]) => `<option value="${k}" ${k === (v.m || f || "maths") ? "selected" : ""}>${x}</option>`).join("")}</select>
        <input id="er-chap" class="search" maxlength="60" placeholder="Chapitre" value="${esc(v.chap || "")}">
      </div>
      <textarea id="er-err" class="search" rows="2" placeholder="L'erreur (ce que j'ai écrit ou cru)">${esc(v.erreur || "")}</textarea>
      <textarea id="er-cor" class="search" rows="2" placeholder="La correction">${esc(v.correction || "")}</textarea>
      <textarea id="er-pq" class="search" rows="2" placeholder="Pourquoi je me suis trompé">${esc(v.pourquoi || "")}</textarea>
      <div class="flash-btns">${ed ? bigBtn("Annuler", 'id="er-cancel"') : ""}${bigBtn(ed ? "Enregistrer" : "Ajouter au carnet", 'id="er-save"')}</div>
    </div></details>
    <div class="chips"><button class="chip ${f ? "" : "on"}" data-er-mat="">Toutes</button>${Object.entries(MAT_ERR).map(([k, x]) => `<button class="chip ${k === f ? "on" : ""}" data-er-mat="${k}">${x}${counts[k] ? ` <small>${counts[k]}</small>` : ""}</button>`).join("")}</div>
    ${groupes.map((m) => title(MAT_ERR[m], `${list.filter((e) => e.m === m).length}`, COUL_M(m)) + list.filter((e) => e.m === m).map(card).join("")).join("")
      || `<div class="empty"><p>${L.length ? "Rien à revoir ici." : "Ton carnet est vide pour l'instant."}</p></div>`}
    ${L.some((e) => e.ok) ? `<p style="text-align:center"><button class="read-btn" data-er-all>${state.errAll ? "Masquer" : "Afficher"} les erreurs maîtrisées</button></p>` : ""}`;
}

// ---------- mode khôlle ----------
const KH_NOM = { maths: "Maths", droit: "Droit", eco: "Économie", mgmt: "Management", en: "Anglais", es: "Espagnol" };
const chapKey = (s = "") => { const x = /C(?:h)?\.?\s*(\d+)/.exec(s); return x ? "C" + x[1] : /intro/i.test(s) ? "Intro" : /méthode/i.test(s) ? "Méthode" : "Autres"; };
function khPool(m) {
  const out = [], F = state.fiches?.[m];
  if (F?.chapters) F.chapters.forEach((ch) => ch.groups.forEach((g) => g.items.forEach((it) => out.push({
    id: `f:${m}:${it.k}`, ch: chapKey(ch.k), chNom: `${ch.k} – ${ch.title}`, html: true, tex: m === "maths",
    q: m === "maths" ? `${it.k} : formule et conditions ?` : m === "droit" ? `Que dit ${it.k}${it.s ? ` (${it.s})` : ""} ? Quand l'utiliser ?` : `${it.k}${it.a ? ` (${it.a})` : ""} : définis et explique.`,
    r: m === "maths" ? `${it.f}<p>${it.c}</p>` : `${it.t}${it.u ? `<br><b>${F.uLabel} :</b> ${it.u}` : ""}${it.n ? `<br><b>Exemple :</b> ${it.n}` : ""}`,
  }))));
  (Array.isArray(state.cards) ? state.cards : []).filter((c) => c.m === m).forEach((c) => out.push({ id: c.id, ch: chapKey(c.ch), chNom: c.ch, q: c.q, r: c.r }));
  return out;
}
function kholle() {
  if (!fichesReady() || !Array.isArray(state.cards)) { loadCards(); return loading("Chargement…"); }
  const prochaines = prochains(14, (e) => e.type === "kholle");
  const nk = prochaines.find((e) => e.key);
  const m = KH_NOM[state.khMat] ? state.khMat : nk?.key || "eco";
  const pool = khPool(m), keys = [...new Set(pool.map((x) => x.ch))].sort((a, b) => (b[0] === "C") - (a[0] === "C") || a.localeCompare(b, "fr", { numeric: true }));
  const nums = keys.filter((k) => /^C\d/.test(k));
  state.khMat = m;
  const sel = (state.khCh ||= {})[m] ||= nums.length ? nums.slice(-2) : keys;
  const chips = `<div class="chips">${Object.entries(KH_NOM).map(([k, v]) => `<button class="chip ${k === m ? "on" : ""}" data-khm="${k}">${v}</button>`).join("")}</div>`;
  const pause = prochaines.filter((e) => !e.key).map((e) => `${e.m} ${quand(e.date)}`);
  const info = prochaines.length ? `<div class="next-ev" style="margin-bottom:14px">${prochaines.slice(0, 3).map((e) => `<div><b>${esc(e.m)}</b> · ${quand(e.date)} · ${esc(e.h)} · salle ${esc(e.salle)}</div>`).join("")}</div>` : "";
  const j = state.kh;
  if (j && j.m === m) {
    const it = j.list[j.i];
    const head = `<div class="jeu-top"><button class="read-btn" data-kh-quit>✕ Arrêter</button><b>🎤 Khôlle ${KH_NOM[m]}</b><span>${Math.min(j.i + 1, j.list.length)}/${j.list.length}</span></div>`;
    if (!it) return head + `<div class="final"><div class="kicker">Série terminée</div><b>${j.ok}/${j.list.length}</b><div class="trad">${j.rates.length ? `${j.rates.length} question${j.rates.length > 1 ? "s" : ""} ratée${j.rates.length > 1 ? "s" : ""} : elles sont dans ton carnet d'erreurs.` : "Rien de raté, tu es prêt."}</div></div>
      <div class="flash-btns">${bigBtn("Nouvelle série", "data-kh-start")}${bigBtn("Carnet d'erreurs", 'data-goto="reviser:erreurs"')}</div>`;
    return head + `<div class="q" style="--c:${COUL_M(m)}"><div class="meta"><span class="pill">${esc(it.chNom)}</span></div>
      <p class="qt ${it.tex ? "tex" : ""}">${it.html ? it.q : esc(it.q)}</p>
      <p class="trad">Réponds à voix haute, comme devant le colleur, puis vérifie.</p>
      ${j.show ? `<div class="expl ${it.tex ? "tex" : ""}">${it.html ? it.r : esc(it.r)}</div>
        <div class="flash-btns"><button class="choice ko" data-kh-grade="0">✗ Raté</button><button class="choice ok" data-kh-grade="1">✓ Je savais</button></div>`
      : bigBtn("Voir la réponse", "data-kh-flip")}</div>`;
  }
  const dispo = pool.filter((x) => sel.includes(x.ch)).length;
  return chips + info + `<p class="lead">Une série de questions sur les derniers chapitres vus, à faire le matin d'une khôlle ou dans le trajet. Ce que tu rates part dans le carnet d'erreurs.${pause.length ? ` Philo et lettres sont en pause : pas de questions.` : ""}</p>
    ${title("Chapitres", `${dispo} questions`)}
    <div class="chips wrap">${keys.map((k) => `<button class="chip ${sel.includes(k) ? "on" : ""}" data-khc="${k}">${k}</button>`).join("")}</div>
    <div style="margin-top:14px">${dispo ? bigBtn(`Lancer une série de ${Math.min(10, dispo)} questions`, "data-kh-start") : `<p class="lead">Choisis au moins un chapitre.</p>`}</div>
    ${(store.get("kholleHist", []) || []).filter((x) => x.m === m).length ? title("Tes séries") + `<table class="hist">${store.get("kholleHist", []).filter((x) => x.m === m).slice(0, 6).map((x) => `<tr><td>${fmtDate(x.d + "T12:00", { day: "numeric", month: "short" })}</td><td>${x.ok}/${x.n}</td></tr>`).join("")}</table>` : ""}`;
}
function khStart() {
  const m = KH_NOM[state.khMat] ? state.khMat : prochains(14, (e) => e.type === "kholle").find((e) => e.key)?.key || "eco";
  const sel = state.khCh?.[m] || [];
  state.khMat = m; state.kh = { m, list: melange(khPool(m).filter((x) => sel.includes(x.ch))).slice(0, 10), i: 0, ok: 0, rates: [], show: false };
}
function khGrade(ok) {
  const j = state.kh, it = j.list[j.i]; if (!it) return;
  if (ok) j.ok++; else { j.rates.push(it); addErreur({ m: j.m, chap: it.chNom, erreur: strip(it.q), correction: strip(it.r), src: `kh:${it.id}` }); }
  j.i++; j.show = false; actif();
  if (j.i >= j.list.length) { const h = store.get("kholleHist", []); h.unshift({ d: today(), m: j.m, ok: j.ok, n: j.list.length }); store.set("kholleHist", h.slice(0, 60)); }
}

function reviser() {
  const s = state.sub.reviser;
  const body = s === "quiz" ? (state.ed ? quiz() : loading("Pas de quiz aujourd'hui.")) : s === "entrainement" ? entrainement()
    : s === "jeux" ? jeux() : s === "kholle" ? kholle() : s === "erreurs" ? erreurs() : s === "fiches" ? fiches() : cours();
  return subtabs("reviser", { cours: "Fiches", fiches: "Flashcards", kholle: "Khôlle", erreurs: "Erreurs", entrainement: "Exos", quiz: "Quiz", jeux: "Jeux" }) + body;
}

// =====================================================================
//  MINI-JEUX : auteurs, dates, arrêts
// =====================================================================
const JEUX = {
  chrono: { t: "Chrono 60 s", i: "⏱️", d: "Un max de bonnes réponses en 60 secondes. Enchaîne pour gagner des bonus." },
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
  if (mode === "frise") { j.manche = 1; j.f = jeuFrise(); }
  if (mode === "paires") j.p = jeuPaires();
  state.jeu = j; jeuTick();
}
function jeuFin(score) {
  const j = state.jeu, rec = store.get("jeuRec", {}), m = j.mode;
  const mieux = m === "paires" ? rec[m] === undefined || score < rec[m] : score > (rec[m] || 0);
  if (mieux) { rec[m] = score; store.set("jeuRec", rec); setTimeout(confettis, 150); }
  j.fini = { score, record: mieux }; actif(); clearInterval(state.jeuTimer);
}
const buzz = () => navigator.vibrate?.(90);
function confettis() {
  const c = document.createElement("div"); c.className = "confetti";
  c.innerHTML = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .5}s;animation-duration:${1.6 + Math.random()}s;background:hsl(${Math.random() * 360} 90% 60%);transform:rotate(${Math.random() * 360}deg)"></i>`).join("");
  document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
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
  if (!j) return `<p class="lead">Des parties de 1 à 2 minutes sur les auteurs, les dates et les arrêts de ton cours.</p>
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
    else { j.combo = 0; j.flash = { ok: false, t: `✗ C'était ${it.r}` }; revoir(it); buzz(); }
    j.q = jeuQ(); return keep();
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
      else { p.err++; buzz(); j.flash = { ok: false, t: "✗ Raté, +5 s" }; revoir(p.items[p.sel]); }
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

function pieges() {
  const ed = state.ed, list = (ed?.langues?.pieges || []).map((q, i) => ({ ...q, i })).filter((q) => q.langue === state.lang);
  if (!list.length) return langChips() + loading("Les questions de grammaire arrivent avec la prochaine édition.");
  const rep = store.get("pieges", {})[ed.date] || {};
  return langChips() + `<p class="lead">Grammaire, faux-amis, prépositions : les erreurs qui coûtent des points.</p>` +
    list.map((q) => qcm(q, rep[q.i], `data-piege="${q.i}"`, "var(--monde)")).join("");
}

function vocab() {
  return flashUI("vocab", langChips() + `<p class="lead">Le vocabulaire des concours et les mots de l'actu, en révision espacée. 8 mots nouveaux par jour maximum.</p>`);
}

function langues() {
  const s = state.sub.langues, wd = wdIdx(today());
  if (s === "vocab" && !Array.isArray(state.bank)) loadBank();
  const body = s === "vocab" ? vocab() : !state.ed ? loading("Pas d'édition disponible.") : s === "pieges" ? pieges() : trous();
  const seanceTxt = wd === 0 ? "Lundi soir : anglais, 25 min." : wd === 3 ? "Jeudi soir : espagnol, 20 min." : "Séances : anglais le lundi soir (25 min), espagnol le jeudi soir (20 min).";
  return subtabs("langues", { vocab: "1. Vocabulaire", trous: "2. Texte à trous", pieges: "3. Grammaire" }) +
    `<p class="lead"><b style="color:var(--ink)">${seanceTxt}</b> Dans l'ordre : vocabulaire d'abord, puis le texte à trous, puis la grammaire s'il te reste du temps.</p>` + body;
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
      <div class="stat"><b>${Object.values(prog).filter((p) => p.box >= 3).length}</b><span>flashcards sues</span></div>
    </div>
    ${Object.keys(notes).length ? title("Moyennes (notes de l'agenda)") + `<table class="hist">${Object.entries(notes).map(([m, l]) =>
      `<tr><td>${MATS_AG[m] || m} · ${l.length} note${l.length > 1 ? "s" : ""}</td><td><b>${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2).replace(".", ",")}</b>/20</td></tr>`).join("")}</table>` : ""}
    ${(() => { const E = store.get("erreurs", []); return E.length ? title("Carnet d'erreurs") + `<table class="hist">${Object.entries(MAT_ERR).filter(([k]) => E.some((e) => e.m === k)).map(([k, v]) => `<tr><td>${v}</td><td>${E.filter((e) => e.m === k && !e.ok).length} à revoir · ${E.filter((e) => e.m === k && e.ok).length} maîtrisées</td></tr>`).join("")}</table>` : ""; })()}
    ${title("Maîtrise des flashcards")}<div class="bars">${deckStat}</div>
    ${title("Quiz : réussite par matière")}<div class="bars">${ACTU.map((m) => {
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
  $("#ticker").innerHTML = ed ? [...ACTU.map((k) => `${RUB[k].court} <b>${Math.min(1, (ed.rubriques?.[k] || []).length)}</b>`),
    `Quiz <b>${(ed.quiz || []).length}</b>`, `MàJ <b>${fmtHour(ed.genere_le)}</b>`].map((s) => `<span>${s}</span>`).join("") : "";
  const needsEd = state.tab === "actu";
  if (needsEd && !ed) { v.innerHTML = `<div class="empty"><h2>Pas encore d'édition</h2><p>La prochaine édition sera publiée vers 6 h.</p></div>`; return; }
  v.innerHTML = { auj: aujourdhui, actu, reviser, langues, moi }[state.tab]();
  renderTex();
}
// Formules de maths « comme sur un poly » (KaTeX, chargé seulement quand il y a des formules)
let katexP = null;
const TEX_OPTS = { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false };
const loadScript = (src) => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
function renderTex() {
  const els = document.querySelectorAll("#view .tex");
  if (!els.length) return;
  if (window.renderMathInElement) return els.forEach((el) => window.renderMathInElement(el, TEX_OPTS));
  if (katexP) return;
  const K = "vendor/katex/"; // KaTeX 0.16.11 (licence MIT), copié dans le dépôt pour marcher hors connexion
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = K + "katex.min.css"; document.head.appendChild(l);
  katexP = loadScript(K + "katex.min.js").then(() => loadScript(K + "auto-render.min.js")).then(renderTex).catch(() => { katexP = null; });
}
const goTo = (tab, sub, x) => {
  if (x !== undefined) {
    if (sub === "cours") { state.coursMat = x; store.set("coursMat", x); state.coursQ = ""; }
    if (sub === "fiches") state.ficheMat = x;
    if (sub === "entrainement") { const [t, q] = x.split("="); state.trainSub = t; if (q) state.qcmId = q; }
    if (sub === "kholle") { state.khMat = x; if (state.kh?.m !== x) state.kh = null; }
    if (sub === "erreurs") { state.errMode = x; state.relIdx = 0; state.relShow = false; }
    if (tab === "langues") { state.lang = x; store.set("lang", x); }
  }
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
  if ((el = at("data-tick"))) {
    e.preventDefault(); const all = store.get("todo", {}), d = (all[today()] ||= {}), k = el.dataset.tick;
    d[k] = !d[k]; Object.keys(all).sort().slice(0, -30).forEach((x) => delete all[x]); store.set("todo", all); actif(); return keep();
  }
  if ((el = at("data-goto"))) { e.preventDefault(); const [tab, sub, x] = el.dataset.goto.split(":"); return goTo(tab, sub, x); }
  if ((el = at("data-sub"))) { const [tab, sub] = el.dataset.sub.split(":"); state.sub[tab] = sub; store.set("subs", state.sub); if (sub === "erreurs") state.errMode = ""; state.showBack = false; return render(); }
  if ((el = at("data-pday"))) { state.planDay = +el.dataset.pday; return keep(); }
  if ((el = at("data-pweek"))) { // le dimanche, « › » ouvre directement le lundi suivant
    const wk = (state.planWeek || 0) + +el.dataset.pweek; state.planWeek = wk;
    state.planDay = wk === 0 ? wdIdx(today()) : +el.dataset.pweek > 0 ? 0 : 6; return keep();
  }
  // fiches de cours
  if ((el = at("data-cmat"))) { state.coursMat = el.dataset.cmat; store.set("coursMat", state.coursMat); state.coursQ = ""; return render(); }
  if (at("data-crev")) { store.set("coursRev", !store.get("coursRev", false)); return keep(); }
  if ((el = at("data-it")) && el.closest(".fiches.rev") && !t.closest("summary")) { el.classList.toggle("shown"); return; }
  // carnet d'erreurs
  if ((el = at("data-er-mode"))) { state.errMode = el.dataset.erMode; state.relIdx = 0; state.relShow = false; scrollTo(0, 0); return render(); }
  if (at("data-er-restart")) { state.relIdx = 0; state.relShow = false; return render(); }
  if (at("data-rel-show")) { state.relShow = true; return keep(); }
  if ((el = at("data-rel"))) {
    if (el.dataset.rel === "1") { const L = store.get("erreurs", []), f = state.errMat || "", e2 = L.filter((x) => !x.ok && (!f || x.m === f))[state.relIdx || 0]; if (e2) { e2.ok = true; store.set("erreurs", L); } }
    else state.relIdx = (state.relIdx || 0) + 1;
    state.relShow = false; actif(); return render();
  }
  if ((el = at("data-er-mat"))) { state.errMat = el.dataset.erMat; return keep(); }
  if (at("data-er-all")) { state.errAll = !state.errAll; return keep(); }
  if ((el = at("data-er-edit"))) { state.errEdit = el.dataset.erEdit; scrollTo(0, 0); return render(); }
  if ((el = at("data-er-ok"))) { const L = store.get("erreurs", []), x = L.find((y) => y.id === el.dataset.erOk); if (x) { x.ok = !x.ok; store.set("erreurs", L); } return keep(); }
  if ((el = at("data-er-del"))) { if (!confirm("Supprimer cette erreur du carnet ?")) return; store.set("erreurs", store.get("erreurs", []).filter((y) => y.id !== el.dataset.erDel)); return keep(); }
  if (t.id === "er-cancel") { state.errEdit = null; return render(); }
  if (t.id === "er-save") {
    const v = { m: $("#er-m").value, chap: $("#er-chap").value.trim(), erreur: $("#er-err").value.trim(), correction: $("#er-cor").value.trim(), pourquoi: $("#er-pq").value.trim() };
    if (!v.erreur || !v.correction) return alert("Écris au moins l'erreur et la correction.");
    const L = store.get("erreurs", []), x = state.errEdit && L.find((y) => y.id === state.errEdit);
    if (x) Object.assign(x, v); else L.unshift({ id: Date.now().toString(36), date: today(), n: 1, ...v });
    store.set("erreurs", L); state.errEdit = null; actif(); return render();
  }
  // mode khôlle
  if ((el = at("data-khm"))) { state.khMat = el.dataset.khm; state.kh = null; return render(); }
  if ((el = at("data-khc"))) { const m = state.khMat || state.kh?.m, L = state.khCh?.[m]; if (L) { const k = el.dataset.khc, i = L.indexOf(k); i >= 0 ? L.splice(i, 1) : L.push(k); } return keep(); }
  if (at("data-kh-start")) { khStart(); scrollTo(0, 0); return render(); }
  if (at("data-kh-quit")) { state.kh = null; return render(); }
  if (at("data-kh-flip")) { state.kh.show = true; return keep(); }
  if ((el = at("data-kh-grade"))) { khGrade(el.dataset.khGrade === "1"); return render(); }
  if ((el = at("data-fmat"))) { state.ficheMat = el.dataset.fmat; state.showBack = false; return render(); }
  if ((el = at("data-vlang"))) { state.vocabLang = el.dataset.vlang; state.showBack = false; return render(); }
  if ((el = at("data-lang"))) { state.lang = el.dataset.lang; store.set("lang", state.lang); return render(); }
  if (at("data-flip")) { state.showBack = true; return render(); }
  if ((el = at("data-grade"))) { gradeCard(el.dataset.deck, el.dataset.grade === "1"); return render(); }
  if ((el = at("data-show"))) { state.shown[el.dataset.show] = true; actif(); return keep(); }
  if ((el = at("data-vu"))) { const v = store.get("vus", {}); v[el.dataset.vu] = true; store.set("vus", v); actif(); return keep(); }
  if ((el = t.closest("[data-jeu-go],[data-jeu-quit],[data-jeu-c],[data-jeu-f],[data-jeu-next],[data-jeu-pl],[data-jeu-pr]")) && !el.disabled) return jeuClick(el);
  if ((el = at("data-train"))) { state.trainSub = el.dataset.train; return render(); }
  if ((el = at("data-qcm")) && !el.disabled) {
    const id = el.dataset.qcm, s = store.get(`qcm:${id}`, null); if (!s) return;
    const k = el.dataset.qk; s.ans[k] = s.perm[k][+el.dataset.c]; store.set(`qcm:${id}`, s); actif();
    const q = state.qcmData[id]?.questions.find((x) => String(x.id) === String(k));
    if (q && s.ans[k] !== q.bonne_reponse) addErreur({ m: QCMS[id].m, chap: qcmNom(id), erreur: `${q.question} → j'ai répondu : ${q.choix[s.ans[k]]}`, correction: `${q.choix[q.bonne_reponse]} ${q.explication} ${QCM_MAT[QCMS[id].m].maj} : ${q.majeure_a_ecrire}`, src: `qcm:${id}:${k}` });
    return keep();
  }
  if ((el = at("data-qcmsel"))) { state.qcmId = el.dataset.qcmsel; return render(); }
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
    (state.answers[qKey(ed)] ||= {})[i] = j; store.set("answers", state.answers);
    const q = ed.quiz[i];
    if (j === q.bonne) { state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); }
    else { state.stats.streak = 0; if (ACTU.includes(q.matiere)) addErreur({ m: q.matiere, chap: q.tag === "Actu" ? "Quiz du jour · actu" : `Quiz du jour · ${q.tag}`, erreur: `${q.question} → j'ai répondu : ${q.choix[j]}`, correction: `${q.choix[q.bonne]}${q.explication && q.explication !== q.choix[q.bonne] ? `. ${q.explication}` : ""}`, src: `quiz:${qKey(ed)}:${i}` }); }
    store.set("stats", state.stats); actif();
    if (Object.keys(state.answers[qKey(ed)]).length === ed.quiz.length) recordResult();
    return keep();
  }

  if (t.id === "ev-add") {
    const date = $("#ev-date").value; if (!date) return alert("Choisis une date.");
    const ev = store.get("agenda", []);
    ev.push({ id: Date.now().toString(36), date, type: $("#ev-type").value, matiere: $("#ev-mat").value, titre: $("#ev-titre").value.trim() });
    store.set("agenda", ev); return keep();
  }
  if ((el = at("data-del"))) { store.set("agenda", store.get("agenda", []).filter((x) => x.id !== el.dataset.del)); return keep(); }

  if (t.id === "export") {
    const data = {};
    for (const k of ["answers", "stats", "history", "read", "leitner", "newDay", "agenda", "actif", "vus", "pieges", "concours", "qcmHist", ...Object.keys(QCMS).map((k) => `qcm:${k}`), "erreurs", "todo", "kholleHist", "relu", "jeuRec", "coursMat", "coursRev", "lang"]) data[k] = store.get(k, null);
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
  const id = e.target.id;
  if (id !== "bankq" && id !== "coursq") return;
  state[id === "bankq" ? "bankQ" : "coursQ"] = e.target.value; render();
  const i = $("#" + id); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
});
// fiches de cours : on retient les chapitres ouverts
$("#view").addEventListener("toggle", (e) => {
  const d = e.target; if (!d.dataset?.fch || state.coursQ) return;
  const o = store.get("coursOpen", {}); o[d.dataset.fch] = d.open; store.set("coursOpen", o);
}, true);

// ---------- démarrage ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
loadArchive();
loadIndicators();
loadCards();
loadPlan();
loadEdition();
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#archive").value) loadEdition(); });
