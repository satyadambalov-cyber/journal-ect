// =============================================================
//  Journal ECT — génération quotidienne de l'édition
//  1. Récupère les flux RSS de sources fiables (vraies actualités)
//  2. Demande à Claude de sélectionner, expliquer et créer le quiz
//  3. Écrit public/data/latest.json + archive datée
//  Anti-invention : Claude ne choisit que parmi des articles réellement
//  récupérés (par identifiant) ; titre d'origine, lien, date et source
//  sont recopiés par ce script, jamais écrits par l'IA.
// =============================================================
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { FEEDS } from "./feeds.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_AGE_H = 48;
const DATA_DIR = new URL("../public/data/", import.meta.url);

// ---------- 1. RSS ----------
const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, " ").trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = tag(b, "link");
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const dateStr = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated");
    const date = dateStr ? new Date(dateStr) : null;
    return {
      title: tag(b, "title"),
      desc: (tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400),
      link: link.trim(),
      date: date && !isNaN(date) ? date.toISOString() : null,
      source: feed.source, lang: feed.lang, hint: feed.rubrique,
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (JournalECT RSS reader)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text(), feed);
    console.log(`✓ ${feed.source} (${feed.rubrique}) : ${items.length}`);
    return items;
  } catch (e) {
    console.warn(`✗ ${feed.source} ${feed.url} : ${e.message}`);
    return [];
  }
}

const now = Date.now();
const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();
const seen = new Set();
const fresh = all.filter((i) => {
  if (!i.date || now - new Date(i.date) > MAX_AGE_H * 3600e3) return false;
  if (seen.has(i.link)) return false;
  seen.add(i.link); return true;
});
// limite par source pour équilibrer
const perSource = {};
const candidates = fresh
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .filter((i) => (perSource[i.source] = (perSource[i.source] || 0) + 1) <= 15)
  .map((i, idx) => ({ id: `a${idx}`, ...i }));

console.log(`\n${candidates.length} articles candidats.`);
if (candidates.length < 10) {
  console.error("Trop peu d'articles récupérés : édition non générée (l'ancienne reste en ligne).");
  process.exit(1);
}

// ---------- 2. Claude ----------
const SYSTEM = `Tu es le rédacteur en chef d'un journal quotidien destiné à un étudiant de PREMIÈRE année de CPGE ECT (ECT1), qui prépare BCE et ECRICOME.
Programme ECT1 à mobiliser : Économie (croissance, marché, monnaie, financement, chômage, inflation, rôle de l'État, mondialisation, auteurs classiques : Smith, Ricardo, Keynes, Schumpeter, Say, Marx, Friedman…), Droit (sources du droit, organisation judiciaire, contrat — formation, effets, inexécution —, responsabilité civile, personne, entreprise et sociétés, droit du travail : bases), Management (entreprise et organisations, stratégie de base, diagnostic, parties prenantes, gouvernance, leadership, croissance interne/externe), Langues (anglais, espagnol) et culture internationale.
Règles absolues :
- Ne mentionne jamais les identifiants ("a12") dans les textes rédigés : uniquement dans les champs "id".
- Tu n'utilises QUE les articles fournis, identifiés par leur "id". N'invente aucun fait, chiffre, date ou source. Si un détail n'est pas dans le titre/chapeau, reste général et prudent.
- Les explications de contexte et de notions peuvent venir de tes connaissances générales (cours), mais doivent être exactes et de niveau ECT1 : définis chaque notion technique simplement, ne suppose aucun acquis de 2e année.
- Privilégie les sujets exploitables aux concours. Évite faits divers, sport, people.
- Pas de géopolitique : une seule actu par matière (économie, droit, management), chacune reliée à une notion du cours que l'étudiant peut utiliser en QRA (éco), en veille juridique ou majeure de cas pratique (droit), ou en application de la méthode TAC (management).
- Les textes de langues (anglais, espagnol) peuvent s'inspirer des articles anglophones et hispanophones fournis.
- Pour le droit, si les articles juridiques sont rares, prends l'actualité ayant la plus forte dimension juridique (loi, régulation, procès, décision, directive UE).
- Le quiz porte en priorité sur les actualités du jour ET sur des notions de cours (définitions, auteurs, mécanismes). Une seule bonne réponse, 4 choix.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`;

// Thèmes fixes du programme : servent à la « banque d'exemples » de l'appli
const THEMES = ["Croissance et conjoncture", "Inflation et monnaie", "Emploi et chômage", "Finances publiques et rôle de l'État",
  "Banques et marchés financiers", "Mondialisation et commerce international", "Concurrence et marchés",
  "Sources et institutions du droit", "Contrat", "Responsabilité", "Droit du travail", "Droit des entreprises et des sociétés",
  "Stratégie d'entreprise", "Gouvernance et parties prenantes", "Organisation et ressources humaines",
  "Innovation et numérique", "Transition écologique"];

const SCHEMA = `{
 "notion_du_jour": {"titre": str, "definition": str (3-4 phrases niveau ECT1), "exemple": str, "matiere": "Économie"|"Droit"|"Management"},
 "rubriques": {
   "eco":   [ARTICLE x1],
   "droit": [ARTICLE x1],
   "mgmt":  [ARTICLE x1]
 },
 "langues": {
   "vocab": [{"mot": str, "langue": "en"|"es", "traduction": str, "exemple": str} x8 (4 en, 4 es, vocabulaire éco/politique/société utile aux concours)],
   "trous": {"en": TROUS, "es": TROUS},
   "pieges": [{"langue": "en"|"es", "question": str (en français : choisir la bonne forme, faux-ami, temps, préposition…), "choix": [str x4], "bonne": 0-3, "explication": str} x6 : 3 en, 3 es]
 },
 "plan": {"matiere": "Économie (QRA)"|"Droit (veille juridique)" (alterne d'un jour à l'autre), "sujet": str (format concours ECT : soit une question à réponse argumentée d'économie, soit un sujet de veille juridique sur un champ précis du thème « Libertés individuelles et activité économique des entreprises » ; inspiré de l'actu ; JAMAIS de dissertation d'ESH), "analyse": str (définition précise des termes et tension, 2-3 phrases), "problematique": str, "parties": [{"titre": str, "sous": [str x2]} x2 EXACTEMENT (plan en 2 parties et 2 sous-parties)], "exemples": [str x2-3 auteurs/théories (QRA) ou fondements juridiques et exemples réels récents (veille)]},
 "cas_pratique": {"faits": str (situation fictive de 80-120 mots, niveau ECT1 : contrat, responsabilité, sources du droit, organisation judiciaire, entreprise et sociétés), "question": str, "qualification": str (faits traduits en termes juridiques, sans règle de droit), "probleme": str (question juridique abstraite, jamais « M. X peut-il… »), "majeure": str (règles de droit exactes ; ne cite un article ou un arrêt que si tu es certain de son numéro et de son contenu), "conclusion": str (application aux faits et conséquences juridiques)},
 "maths": [{"titre": str, "niveau": 1|2|3, "enonce": str (exercice type DS sur le chapitre indiqué, notations texte simples : x², √, a/b, ≤), "etapes": [str x3-6 correction pas à pas, chaque calcul justifié], "resultat": str, "piege": str (l'erreur classique à éviter)} x2 (un niveau 1 ou 2, un niveau 2 ou 3)],
 "quiz": [QUESTION x9 : 3 "eco", 3 "droit", 3 "mgmt" ; au moins 6 portent sur des notions de cours (définitions, auteurs, articles, théorisations), les autres sur les actus du jour]
}
ARTICLE = {"id": str (id d'un article fourni), "theme": UN SEUL parmi ${JSON.stringify(THEMES)}, "titre": str (titre clair en français), "resume": str (3-4 phrases), "contexte": str (pourquoi c'est important, 2-3 phrases), "notions": [str x2-4 notions du programme], "copie": str (comment l'utiliser dans une copie d'économie, de droit ou une étude de cas de management : idée d'accroche, de partie ou d'exemple, 2-3 phrases), "niveau": 1|2|3 (difficulté)}
TROUS = {"texte": str (60-90 mots inspirés d'un article du jour, avec exactement 6 blancs notés {1} à {6}), "blancs": [{"choix": [str x3], "bonne": 0-2, "explication": str (courte, en français)} x6] : on teste vocabulaire, prépositions, temps et connecteurs}
QUESTION = {"matiere": "eco"|"droit"|"mgmt", "question": str, "choix": [str x4], "bonne": 0-3, "explication": str (2-3 phrases), "id": str|null (article lié éventuel)}`;

const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
// Chapitre de maths en cours (à mettre à jour au fil de l'année, ou via la variable GitHub MATHS_CHAPITRE)
const MATHS = process.env.MATHS_CHAPITRE || "Chapitre 4 — Suites et sommes usuelles : suites arithmétiques (u_n = u_p + (n−p)r), géométriques (u_n = u_p q^(n−p)), arithmético-géométriques (point fixe ℓ = b/(1−a), u_n = ℓ + (u_0−ℓ)a^n), raisonnement par récurrence, sommes avec Σ (somme de constantes (n−p+1)a, somme des entiers n(n+1)/2, somme arithmétique (n−p+1)(u_p+u_n)/2, somme géométrique u_p(1−q^(n−p+1))/(1−q), linéarité). Dans chaque correction, écris d'abord la formule utilisée, puis son application avec les valeurs de l'exercice";
const userMsg = `Nous sommes le ${today}. Chapitre de maths en cours (exercices "maths") : ${MATHS}. Voici les articles récents (JSON). Le champ "hint" est la rubrique suggérée par le flux, tu peux le réaffecter.
Produis l'édition du jour selon ce schéma :
${SCHEMA}

ARTICLES :
${JSON.stringify(candidates.map(({ id, title, desc, source, date, lang, hint }) => ({ id, title, desc, source, date, lang, hint })))}`;

const client = new Anthropic();
const stream = client.beta.messages.stream({
  model: MODEL,
  max_tokens: 32000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: { effort: "medium" },
  system: SYSTEM,
  messages: [{ role: "user", content: userMsg }],
});
const msg = await stream.finalMessage();
if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") {
  console.error("Réponse inutilisable :", msg.stop_reason); process.exit(1);
}
const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
// retire les identifiants internes (a12) que l'IA glisserait dans le texte
const clean = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1).replace(/\s*\((?:id\s*)?a\d+(?:\s*,\s*a\d+)*\)/g, "");
const json = JSON.parse(clean);

// ---------- 3. Vérification + rattachement aux vraies sources ----------
const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
const attach = (a) => {
  const src = byId[a?.id];
  if (!src) return null; // article inventé -> supprimé
  if (!THEMES.includes(a.theme)) delete a.theme;
  return { ...a, source: src.source, lien: src.link, date: src.date, titre_original: src.title };
};
for (const k of Object.keys(json.rubriques || {})) {
  json.rubriques[k] = (json.rubriques[k] || []).map(attach).filter(Boolean);
}
for (const l of ["en", "es"]) if (json.langues?.[l]) {
  const src = byId[json.langues[l].id];
  json.langues[l] = src ? { ...json.langues[l], source: src.source, lien: src.link, date: src.date } : null;
}
const okQ = (q, n) => Array.isArray(q?.choix) && q.choix.length === n && q.bonne >= 0 && q.bonne < n;
if (json.langues) {
  for (const l of ["en", "es"]) {
    const t = json.langues.trous?.[l];
    if (t && !t.texte) { t.texte = t.texto || t.text; delete t.texto; delete t.text; }
    if (t && !(typeof t.texte === "string" && t.texte.includes("{1}") &&Array.isArray(t.blancs) && t.blancs.length && t.blancs.every((b) => okQ(b, 3)))) delete json.langues.trous[l];
  }
  json.langues.pieges = (json.langues.pieges || []).filter((q) => okQ(q, 4));
  json.langues.traduction = (json.langues.traduction || []).filter((t) => t.phrase && t.corrige);
}
if (!json.plan?.sujet || !Array.isArray(json.plan.parties)) delete json.plan;
if (!json.cas_pratique?.faits || !json.cas_pratique?.conclusion) delete json.cas_pratique;
json.maths = (json.maths || []).filter((m) => m.enonce && Array.isArray(m.etapes) && m.etapes.length);
json.quiz = (json.quiz || []).filter((q) => Array.isArray(q.choix) && q.choix.length === 4 && q.bonne >= 0 && q.bonne < 4)
  .map((q) => ({ ...q, lien: byId[q.id]?.link || null }));

const edition = {
  date: new Date().toISOString().slice(0, 10),
  genere_le: new Date().toISOString(),
  modele: MODEL,
  ...json,
};

await mkdir(new URL("archive/", DATA_DIR), { recursive: true });
await writeFile(new URL("latest.json", DATA_DIR), JSON.stringify(edition, null, 1));
await writeFile(new URL(`archive/${edition.date}.json`, DATA_DIR), JSON.stringify(edition));
let index = [];
try { index = JSON.parse(await readFile(new URL("index.json", DATA_DIR), "utf8")); } catch {}
index = [edition.date, ...index.filter((d) => d !== edition.date)].slice(0, 120);
await writeFile(new URL("index.json", DATA_DIR), JSON.stringify(index));
console.log(`Édition ${edition.date} écrite. Tokens : ${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out.`);
