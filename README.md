# 🍽️ Journal des repas

Appli pour encoder ce qu'on mange chaque jour (Emma, Régine, Jérôme).
iPhone uniquement pour l'instant.

## ⚙️ Réglages faits à la main

- **GitHub Pages** : Settings › Pages › Build and deployment › Source « Deploy from a branch » › branche `main`, dossier `/ (root)`.

## 📦 Bibliothèques (versions figées)

- **barcode-detector 3.2.3** (licence MIT) : lecture des codes-barres avec ZXing. Chargé depuis jsDelivr avec une empreinte (`integrity`). Il va chercher lui-même le moteur `zxing-wasm 3.1.6` sur jsDelivr.

## 🥫 Données

- Données produits : **Open Food Facts**, licence ODbL. La mention doit rester visible dans l'appli.
- Limite d'Open Food Facts : 15 recherches de produit par minute et par adresse IP.

## 🧪 Tests

- `test/scan.html` : caméra, lecture d'un code-barres et recherche sur Open Food Facts.
