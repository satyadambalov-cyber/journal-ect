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
- Pour le droit, si les articles juridiques sont rares, prends l'actualité ayant la plus forte dimension juridique (loi, régulation, procès, décision, directive UE).
- Le quiz porte en priorité sur les actualités du jour ET sur des notions de cours (définitions, auteurs, mécanismes). Une seule bonne réponse, 4 choix.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`;

const SCHEMA = `{
 "notion_du_jour": {"titre": str, "definition": str (3-4 phrases niveau ECT1), "exemple": str, "matiere": "Économie"|"Droit"|"Management"},
 "rubriques": {
   "eco":   [ARTICLE x4],
   "droit": [ARTICLE x3],
   "mgmt":  [ARTICLE x3],
   "monde": [ARTICLE x3]
 },
 "langues": {
   "en": {"id": str, "titre": str, "resume": str (80-110 mots en anglais, niveau B2), "phrase": str (phrase clé à retenir, en anglais), "traduction": str},
   "es": {"id": str, "titre": str, "resume": str (80-110 mots en espagnol, niveau B1-B2), "phrase": str, "traduction": str},
   "vocab": [{"mot": str, "langue": "en"|"es", "traduction": str, "exemple": str} x6]
 },
 "quiz": [QUESTION x9 : 3 "eco", 2 "droit", 2 "mgmt", 2 "monde"]
}
ARTICLE = {"id": str (id d'un article fourni), "titre": str (titre clair en français), "resume": str (3-4 phrases), "contexte": str (pourquoi c'est important, 2-3 phrases), "notions": [str x2-4 notions du programme], "copie": str (comment l'utiliser dans une dissertation/étude de cas : idée d'accroche, de partie ou d'exemple, 2-3 phrases), "niveau": 1|2|3 (difficulté)}
QUESTION = {"matiere": "eco"|"droit"|"mgmt"|"monde", "question": str, "choix": [str x4], "bonne": 0-3, "explication": str (2-3 phrases), "id": str|null (article lié éventuel)}`;

const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const userMsg = `Nous sommes le ${today}. Voici les articles récents (JSON). Le champ "hint" est la rubrique suggérée par le flux, tu peux le réaffecter.
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
  return { ...a, source: src.source, lien: src.link, date: src.date, titre_original: src.title };
};
for (const k of Object.keys(json.rubriques || {})) {
  json.rubriques[k] = (json.rubriques[k] || []).map(attach).filter(Boolean);
}
for (const l of ["en", "es"]) if (json.langues?.[l]) {
  const src = byId[json.langues[l].id];
  json.langues[l] = src ? { ...json.langues[l], source: src.source, lien: src.link, date: src.date } : null;
}
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
