// Flux RSS utilisés. Un flux en panne est simplement ignoré (voir le journal
// de l'action GitHub : ✓ = OK, ✗ = en panne). Tu peux en ajouter/retirer.
// rubrique : eco | droit | mgmt | monde | en | es
export const FEEDS = [
  // Économie / finance
  { source: "Le Monde", rubrique: "eco", lang: "fr", url: "https://www.lemonde.fr/economie/rss_full.xml" },
  { source: "Les Échos", rubrique: "eco", lang: "fr", url: "https://syndication.lesechos.fr/rss/rss_une.xml" },
  { source: "Les Échos", rubrique: "eco", lang: "fr", url: "https://syndication.lesechos.fr/rss/rss_finance-marches.xml" },
  { source: "franceinfo", rubrique: "eco", lang: "fr", url: "https://www.francetvinfo.fr/economie.rss" },
  { source: "BCE", rubrique: "eco", lang: "en", url: "https://www.ecb.europa.eu/rss/press.html" },
  { source: "Federal Reserve", rubrique: "eco", lang: "en", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { source: "INSEE", rubrique: "eco", lang: "fr", url: "https://www.insee.fr/fr/statistiques/serie/rss" },
  { source: "Financial Times", rubrique: "eco", lang: "en", url: "https://www.ft.com/rss/home" },
  // Droit
  { source: "vie-publique.fr", rubrique: "droit", lang: "fr", url: "https://www.vie-publique.fr/rss.xml" },
  { source: "Le Monde", rubrique: "droit", lang: "fr", url: "https://www.lemonde.fr/justice/rss_full.xml" },
  { source: "Conseil constitutionnel", rubrique: "droit", lang: "fr", url: "https://www.conseil-constitutionnel.fr/rss.xml" },
  // Management / entreprises
  { source: "Le Monde", rubrique: "mgmt", lang: "fr", url: "https://www.lemonde.fr/entreprises/rss_full.xml" },
  { source: "The Guardian", rubrique: "mgmt", lang: "en", url: "https://www.theguardian.com/business/rss" },
  { source: "BBC", rubrique: "mgmt", lang: "en", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  // International
  { source: "Le Monde", rubrique: "monde", lang: "fr", url: "https://www.lemonde.fr/international/rss_full.xml" },
  { source: "BBC", rubrique: "en", lang: "en", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "The Guardian", rubrique: "en", lang: "en", url: "https://www.theguardian.com/world/rss" },
  { source: "El País", rubrique: "es", lang: "es", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada" },
  { source: "BBC Mundo", rubrique: "es", lang: "es", url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
];
