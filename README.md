# 🍽️ Journal des repas

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

## 📦 Bibliothèques (versions figées)

- **barcode-detector 3.2.3** (licence MIT) : lecture des codes-barres avec ZXing. Chargé depuis jsDelivr avec une empreinte (`integrity`). Il va chercher lui-même le moteur `zxing-wasm 3.1.6` sur jsDelivr.

## 🥫 Données

- Données produits : **Open Food Facts**, licence ODbL. La mention doit rester visible dans l'appli.
- Limite d'Open Food Facts : 15 recherches de produit par minute et par adresse IP.

## 🧪 Tests

- `test/scan.html` : caméra, lecture d'un code-barres et recherche sur Open Food Facts.
