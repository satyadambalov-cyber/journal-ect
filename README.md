# Journal ECT — mon journal quotidien de prépa

Application web installable sur iPhone (PWA) qui publie **chaque matin, automatiquement**, une édition :
Économie & finance · Droit · Management · International + anglais/espagnol · Notion du jour · Quiz de 9 questions avec progression.

## Comment ça marche (architecture)

```
 Chaque matin 4h30 UTC (GitHub Actions, gratuit)
   1. lit les flux RSS : Le Monde, Les Échos, FT, BCE, Fed, INSEE, vie-publique,
      Conseil constitutionnel, BBC, Guardian, El País, BBC Mundo…
   2. envoie les vrais articles des dernières 48 h à Claude (API Anthropic),
      qui choisit les sujets, explique, relie au programme ECT1, écrit le quiz
   3. vérifie : chaque sujet doit correspondre à un article réellement récupéré ;
      titre d'origine, lien, date et source sont recopiés du flux (jamais écrits par l'IA)
   4. publie le site sur GitHub Pages (gratuit, HTTPS)
 Ton iPhone ouvre le site → icône sur l'écran d'accueil, fonctionne hors ligne.
 Ta progression (scores, séries, historique) reste sur ton téléphone.
```

**Coût** : hébergement et automatisation gratuits. Seul l'appel à Claude est payant : environ **0,25 à 0,40 $ par jour** avec le modèle par défaut (Claude Opus 5.5), soit ~10 $/mois. Pour ~1 $/mois, voir « Réduire le coût » plus bas.

---

## Mise en ligne, étape par étape (≈ 20 minutes, aucune installation sur ton ordinateur)

### Étape 1 — Créer un compte GitHub
1. Va sur https://github.com et crée un compte gratuit.

### Étape 2 — Créer le dépôt et y mettre les fichiers
1. En haut à droite : **+** → **New repository**.
2. Nom : `journal-ect`. Choisis **Public** (obligatoire pour GitHub Pages gratuit ; ta clé API restera secrète, voir étape 4). Clique **Create repository**.
3. Sur la page du dépôt vide, clique **uploading an existing file**.
4. Glisse **tout le contenu** du dossier du projet (les dossiers `public`, `scripts`, `.github` et les fichiers `package.json`, `README.md`, `.gitignore`).
   ⚠️ Le dossier `.github` est caché sur certains ordinateurs : sous Windows, Explorateur → Affichage → cocher « Éléments masqués ». Vérifie après l'envoi que `.github/workflows/daily.yml` apparaît bien dans le dépôt.
5. Clique **Commit changes**.

### Étape 3 — Obtenir une clé API Anthropic
1. Va sur https://console.anthropic.com et crée un compte.
2. **Billing** : ajoute un moyen de paiement et un petit crédit (5 $ suffisent pour ~2-3 semaines ; ~50 jours en mode économique).
   Conseil : dans **Limits**, fixe une limite de dépense mensuelle (ex. 15 $) pour être tranquille.
3. **API Keys** → **Create Key** → copie la clé (elle commence par `sk-ant-`). Ne la partage jamais.

### Étape 4 — Donner la clé à GitHub (en secret)
1. Dans ton dépôt : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name : `ANTHROPIC_API_KEY` — Secret : colle ta clé → **Add secret**.
   La clé est chiffrée : personne ne peut la voir, même si le dépôt est public.

### Étape 5 — Activer GitHub Pages
1. **Settings** → **Pages** → section *Build and deployment* → Source : **GitHub Actions**.

### Étape 6 — Lancer la première édition
1. Onglet **Actions** → (si demandé, clique « I understand… enable ») → **Édition quotidienne** à gauche → **Run workflow** → **Run workflow**.
2. Attends 2-4 minutes : la pastille devient verte ✓.
3. Ton site est en ligne à l'adresse : `https://TON-PSEUDO.github.io/journal-ect/`
   (elle est aussi affichée dans **Settings → Pages**).

Ensuite, **tout est automatique** : une nouvelle édition chaque matin, même si tu n'ouvres pas l'application.

### Étape 7 — Installer sur l'iPhone
1. Ouvre l'adresse dans **Safari** (pas Chrome).
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. L'icône « Journal ECT » apparaît : l'app s'ouvre en plein écran, comme une vraie application.

---

## Utilisation au quotidien (10-15 min)
1. **La Une** : la notion du jour + l'essentiel en 2 minutes.
2. **Éco / Droit / Mgmt / Monde** : touche une carte pour déplier *Pourquoi c'est important*, *Notions du programme*, *Dans ta copie*, et le lien vers l'article. « Marquer lu » pour suivre où tu en es. Les points ●●○ indiquent la difficulté.
3. **Monde** contient aussi la séance d'anglais et d'espagnol + vocabulaire.
4. **Quiz** : 9 questions, correction et explication immédiates ; séries, réussite par matière, historique.
5. Le sélecteur en haut permet de relire les **éditions précédentes**. ◐ change le thème clair/sombre.

**Sauvegarde** : la progression est stockée sur l'iPhone. Dans Quiz → *Exporter* copie une sauvegarde (à coller dans Notes) ; *Importer* la restaure (changement de téléphone, etc.).

---

## Réglages utiles

**Réduire le coût** : Settings → Secrets and variables → Actions → onglet **Variables** → New variable :
`CLAUDE_MODEL` = `claude-sonnet-5-5` (≈ 0,10 $/jour, très bon) ou `claude-haiku-5-5` (≈ 0,01 $/jour, plus simple).

**Changer l'heure** : dans `.github/workflows/daily.yml`, ligne `cron: "30 4 * * *"` (heure UTC). GitHub peut avoir quelques minutes de retard.

**Sources** : la liste est dans `scripts/feeds.mjs`. Dans Actions → un passage → *Générer l'édition du jour*, le journal affiche ✓ (flux OK) ou ✗ (flux en panne, simplement ignoré). Tu peux retirer ou ajouter des flux RSS.

**Si une édition échoue** (pastille rouge dans Actions) : l'édition précédente reste en ligne. Causes fréquentes : clé absente/invalide, crédit épuisé, ou trop peu d'articles récupérés. Clique sur le passage rouge pour lire le message.

**Note** : GitHub désactive les tâches planifiées d'un dépôt sans activité pendant 60 jours. Les publications quotidiennes du robot comptent normalement comme activité ; si un jour l'automatisation s'arrête, Actions → *Enable workflow*.

## Garanties sur l'information
- Seuls des articles réellement présents dans les flux des dernières 48 h peuvent être retenus ; tout sujet qui ne correspond pas à un article récupéré est supprimé automatiquement.
- Le lien, la date, la source et le titre original affichés proviennent du flux, pas de l'IA.
- Les résumés et analyses sont rédigés par l'IA à partir du titre et du chapeau : **ouvre la source** pour les détails et chiffres précis avant de les citer en copie.
- Reuters, Légifrance et la Banque de France ne proposent pas de flux RSS publics fiables ; l'actualité juridique passe par vie-publique.fr, le Conseil constitutionnel et Le Monde Justice.
