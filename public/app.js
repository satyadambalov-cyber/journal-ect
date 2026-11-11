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
  v.innerHTML = state.tab === "une" ? une() : state.tab === "quiz" ? quiz() : rubrique(state.tab);
}

// ---------- événements ----------
$("#tabs").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.tab = b.dataset.tab; store.set("tab", state.tab); render(); scrollTo(0, 0);
};
$("#view").addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) { e.preventDefault(); state.tab = go.dataset.goto; store.set("tab", state.tab); render(); scrollTo(0, 0); return; }

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
    if (Object.keys(state.answers[ed.date]).length === ed.quiz.length) recordResult();
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

// ---------- démarrage ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
loadArchive();
loadIndicators();
loadEdition();
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#archive").value) loadEdition(); });
