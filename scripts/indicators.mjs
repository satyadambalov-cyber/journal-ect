// =============================================================
//  Indicateurs clés : valeurs officielles récupérées chaque jour
//  (API publiques gratuites, sans clé : Eurostat et BCE).
//  Les explications sont fixes ; seules les valeurs changent.
// =============================================================
import { writeFile, mkdir } from "node:fs/promises";

const EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const ECB = "https://data-api.ecb.europa.eu/service/data/";

const INDICATEURS = [
  {
    id: "pib", nom: "Croissance du PIB", zone: "France", unite: "% (trim.)", decimales: 1,
    api: ["eurostat", "namq_10_gdp?geo=FR&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ"],
    source: "Eurostat", lien: "https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table",
    definition: "Variation du produit intérieur brut (la richesse produite sur le territoire) par rapport au trimestre précédent, en volume (hors effet des prix).",
    pourquoi: "C'est la mesure de base de l'activité économique : elle conditionne l'emploi, les recettes fiscales et le niveau de vie.",
    repere: "Deux trimestres de croissance négative d'affilée sont souvent qualifiés de « récession technique ».",
    notions: ["Croissance", "PIB", "Conjoncture"],
  },
  {
    id: "inflation", nom: "Inflation", zone: "France", unite: "% sur 1 an", decimales: 1,
    api: ["ecb", "ICP/M.FR.N.000000.4.ANR"],
    source: "BCE (IPCH)", lien: "https://data.ecb.europa.eu/data/datasets/ICP",
    definition: "Hausse générale et durable du niveau des prix, mesurée par l'indice des prix à la consommation harmonisé (IPCH) sur 12 mois.",
    pourquoi: "Elle réduit le pouvoir d'achat et guide la politique monétaire de la BCE.",
    repere: "Objectif de la BCE : 2 % à moyen terme.",
    notions: ["Inflation", "Pouvoir d'achat", "Politique monétaire"],
  },
  {
    id: "chomage", nom: "Taux de chômage", zone: "France", unite: "% pop. active", decimales: 1,
    api: ["eurostat", "une_rt_m?geo=FR&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT"],
    source: "Eurostat", lien: "https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table",
    definition: "Part des personnes actives (en emploi ou en recherche) qui sont sans emploi et en cherchent un, au sens du BIT.",
    pourquoi: "Indicateur central de la santé du marché du travail et du coût social d'un ralentissement.",
    repere: "À distinguer du nombre d'inscrits à France Travail, qui mesure autre chose.",
    notions: ["Chômage", "Marché du travail", "BIT"],
  },
  {
    id: "dette", nom: "Dette publique", zone: "France", unite: "% du PIB", decimales: 1,
    api: ["eurostat", "gov_10q_ggdebt?geo=FR&unit=PC_GDP&sector=S13&na_item=GD"],
    source: "Eurostat", lien: "https://ec.europa.eu/eurostat/databrowser/view/gov_10q_ggdebt/default/table",
    definition: "Ensemble des emprunts des administrations publiques (État, collectivités, Sécurité sociale), rapporté au PIB (dette « au sens de Maastricht »).",
    pourquoi: "Plus elle est élevée, plus la charge des intérêts pèse sur le budget et réduit les marges de manœuvre de l'État.",
    repere: "Critère européen (Maastricht) : 60 % du PIB maximum.",
    notions: ["Finances publiques", "Dette", "Pacte de stabilité"],
  },
  {
    id: "deficit", nom: "Solde public", zone: "France", unite: "% du PIB (annuel)", decimales: 1,
    api: ["eurostat", "gov_10dd_edpt1?geo=FR&unit=PC_GDP&sector=S13&na_item=B9"],
    source: "Eurostat", lien: "https://ec.europa.eu/eurostat/databrowser/view/gov_10dd_edpt1/default/table",
    definition: "Différence entre les recettes et les dépenses publiques sur une année. Négatif = déficit, qui doit être financé par de la dette.",
    pourquoi: "C'est le déficit de chaque année qui fait grossir la dette.",
    repere: "Critère européen : déficit de 3 % du PIB maximum.",
    notions: ["Budget de l'État", "Déficit", "Politique budgétaire"],
  },
  {
    id: "taux_bce", nom: "Taux directeur BCE", zone: "Zone euro", unite: "%", decimales: 2,
    api: ["ecb", "FM/B.U2.EUR.4F.KR.DFR.LEV"],
    source: "BCE", lien: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.fr.html",
    definition: "Taux de la facilité de dépôt : taux auquel les banques placent leurs liquidités à la BCE. C'est le taux qui pilote aujourd'hui la politique monétaire.",
    pourquoi: "Il influence tous les taux d'intérêt (crédits immobiliers, prêts aux entreprises) et donc l'investissement, la consommation et l'inflation.",
    repere: "La BCE monte ses taux pour freiner l'inflation, les baisse pour soutenir l'activité.",
    notions: ["Banque centrale", "Taux d'intérêt", "Politique monétaire"],
  },
  {
    id: "oat", nom: "Taux d'emprunt à 10 ans", zone: "France", unite: "%", decimales: 2,
    api: ["ecb", "IRS/M.FR.L.L40.CI.0000.EUR.N.Z"],
    source: "BCE", lien: "https://data.ecb.europa.eu/data/datasets/IRS",
    definition: "Taux d'intérêt auquel l'État français emprunte sur 10 ans sur les marchés financiers (obligations assimilables du Trésor, OAT).",
    pourquoi: "Il mesure la confiance des investisseurs dans les finances publiques et détermine le coût futur de la dette.",
    repere: "On le compare souvent au taux allemand : l'écart s'appelle le « spread ».",
    notions: ["Marchés financiers", "Obligations", "Dette publique"],
  },
  {
    id: "eurusd", nom: "Euro / dollar", zone: "Change", unite: "$ pour 1 €", decimales: 4,
    api: ["ecb", "EXR/D.USD.EUR.SP00.A"],
    source: "BCE", lien: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.fr.html",
    definition: "Nombre de dollars qu'il faut pour acheter un euro (taux de change de référence de la BCE).",
    pourquoi: "Un euro fort rend les importations moins chères mais pénalise la compétitivité-prix des exportations européennes.",
    repere: "Il dépend notamment de l'écart de taux d'intérêt entre la BCE et la Fed.",
    notions: ["Taux de change", "Commerce international", "Compétitivité"],
  },
];

async function eurostat(q) {
  const r = await fetch(EUROSTAT + q + "&lastTimePeriod=2", { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const idx = j.dimension.time.category.index; // { "2025-Q2": 0, ... }
  return Object.entries(idx).sort((a, b) => a[1] - b[1])
    .map(([periode, i]) => ({ periode, valeur: j.value[i] })).filter((p) => p.valeur != null);
}

async function ecb(key) {
  const r = await fetch(`${ECB}${key}?lastNObservations=2&format=jsondata`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const obs = Object.values(j.dataSets[0].series)[0].observations;
  const periods = j.structure.dimensions.observation[0].values;
  return Object.entries(obs).sort((a, b) => a[0] - b[0])
    .map(([i, v]) => ({ periode: periods[i].id, valeur: v[0] })).filter((p) => p.valeur != null);
}

const out = [];
for (const ind of INDICATEURS) {
  const { api, ...info } = ind;
  try {
    const pts = await (api[0] === "eurostat" ? eurostat(api[1]) : ecb(api[1]));
    const last = pts.at(-1), prev = pts.length > 1 ? pts.at(-2) : null;
    if (!last) throw new Error("aucune valeur");
    out.push({ ...info, valeur: last.valeur, periode: last.periode, precedent: prev?.valeur ?? null, periode_prec: prev?.periode ?? null });
    console.log(`✓ ${ind.nom} : ${last.valeur} (${last.periode})`);
  } catch (e) {
    console.warn(`✗ ${ind.nom} : ${e.message}`);
  }
}

if (out.length) {
  const dir = new URL("../public/data/", import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("indicateurs.json", dir), JSON.stringify({ maj: new Date().toISOString(), indicateurs: out }, null, 1));
}
