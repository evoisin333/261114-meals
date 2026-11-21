# 🍽️ Buon app'

Appli pour encoder ce qu'on mange chaque jour (Emma, Régine, Jérôme).
iPhone uniquement pour l'instant.

## ⚙️ Réglages faits à la main

- **GitHub Pages** : Settings › Pages › Build and deployment › Source « Deploy from a branch » › branche `main`, dossier `/ (root)`.
- **Projet Supabase** `journal-repas`, région Europe. À la création : « Enable Data API » activé, « Automatically expose new tables » désactivé (les accès sont donnés par `grant` dans `sql/02_securite.sql`).
- **Inscriptions fermées** : Authentication › Sign In / Providers › « Allow new users to sign up » désactivé.
- **Comptes créés à la main** : Authentication › Users › Add user › Create new user, avec « Auto Confirm User ». 3 membres + 1 compte de test (pas membre, il ne doit rien voir).

## 🗄️ Base de données

Scripts à coller dans l'ordre dans Supabase › SQL Editor. Chacun peut être rejoué sans erreur.

1. `sql/01_tables.sql` : les tables.
2. `sql/02_securite.sql` : droits d'accès et règles RLS.
3. `sql/03_membres.sql` : les 3 comptes qui ont accès (identifiants Supabase, pas d'e-mails).
4. `sql/04_aliments.sql` : les 364 aliments de départ, repris de l'Excel.
5. `sql/05_test_securite.sql` : vérifie les droits de chaque compte. Toutes les lignes doivent afficher `ok = true`.
6. `sql/06_recettes_v2.sql` : recettes avec photo, étapes, temps, source et notes ; carnets communs (gérés par Emma) et carnets perso ; espace privé `photos-recettes` pour les photos (2 Mo et JPEG au plus).
7. `sql/07_test_recettes.sql` : vérifie les droits sur les carnets et les photos. Toutes les lignes doivent afficher `ok = true`.

⚠️ Si tu relances `02_securite.sql`, relance ensuite `06_recettes_v2.sql` : 02 remet les droits de départ et oublie ce que 06 a ajouté.

## 📱 Appli

- `index.html`, `style.css`, `app.js` : l'appli.
- `config.js` : adresse du projet Supabase et clé **publishable** (publique). Jamais la clé secrète.
- `manifest.json` + `icones/` : appli installable (« Partager › Ajouter à l'écran d'accueil » dans Safari).
- `sw.js` : service worker. Les fichiers de l'appli sont toujours redemandés au serveur (copie seulement sans réseau ou après 4 s) ; les bibliothèques jsDelivr (versions figées) sont gardées. Les données Supabase et Open Food Facts ne passent jamais par lui.
- Sans réseau : lecture seule, avec la copie gardée sur le téléphone (`localStorage`) : aliments, recettes, carnets, objectifs, favoris, 31 derniers jours et 8 dernières semaines consultés. Effacée à la déconnexion.
- Gardés sur le téléphone (par compte) : l'onglet « Communs | Mes carnets » choisi et le tri des recettes.
- Plus besoin de changer le numéro `?v=` à chaque mise à jour (le service worker revérifie les fichiers).
- Si la liste des fichiers de `sw.js` change, changer le nom du cache (`buonapp-1` → `buonapp-2`).

## 📦 Bibliothèques (versions figées)

- **supabase-js 2.119.0** (licence MIT), depuis jsDelivr avec une empreinte (`integrity`).
- **barcode-detector 3.2.3** (licence MIT) : lecture des codes-barres avec ZXing. Chargé depuis jsDelivr avec une empreinte (`integrity`). Il va chercher lui-même le moteur `zxing-wasm 3.1.6` sur jsDelivr.

## 🥫 Données

- Données produits : **Open Food Facts**, licence ODbL. La mention doit rester visible dans l'appli.
- Limite d'Open Food Facts : 15 recherches de produit par minute et par adresse IP.

## 🧪 Tests

- `test/scan.html` : caméra, lecture d'un code-barres et recherche sur Open Food Facts.
