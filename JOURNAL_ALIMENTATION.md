# 📝 Journal des décisions — appli alimentation

Pour chaque choix : la raison, l'alternative écartée et la limite que ça induit.

## Cadrage (14/11/2026) ✅

- **Appli à part, même recette que « Nous deux »** : PWA, Supabase, GitHub Pages, pas d'outil de compilation, bibliothèques aux versions figées avec empreinte. Raison : c'est une recette qui marche déjà. Limite : les mêmes limites (dépôt public, pause de Supabase).
- **Nouveau projet Supabase, séparé du calendrier.** Raison : les comptes de Régine et Jérôme ne sont pas à côté de nos données de couple, donc une erreur de règle d'accès ne peut rien exposer. Alternative écartée : ajouter des tables dans le projet du calendrier. Limite : c'est le 2e et dernier projet actif gratuit, et il se met en pause après 1 semaine d'inactivité (doc Supabase).
- **3 utilisateurs : Emma, Régine, Jérôme. Chacun ne voit que son propre journal.** Comptes créés à la main, inscriptions fermées. Limite : pour ajouter quelqu'un, il faut modifier un script SQL.
- **iPhone uniquement pour l'instant** (Safari et appli installée). Raison : nous n'avons que des iPhone. Alternative écartée : tester aussi sur Android. Limite : Android n'est pas testé, mais le code reste standard pour pouvoir l'ajouter plus tard. Il faut installer l'appli sur l'écran d'accueil, car Safari efface les données d'un site après 7 jours sans visite.
- **Base d'aliments commune aux 3**, avec au départ les 349 « Aliments » et les 15 « Mes aliments » de l'Excel. Le kcal du fromage râpé Vache bleue est corrigé (1529, c'étaient des kJ). Tout le monde peut ajouter ; on ne modifie ou supprime que ce qu'on a créé soi-même.
- **Valeurs pour 100 g ou pour 100 ml selon l'aliment**, et la quantité s'encode dans cette unité. Limite : pas de conversion g ↔ ml.
- **Valeurs nutritionnelles copiées dans chaque ligne au moment de l'encodage.** Raison : l'historique ne bouge pas si quelqu'un corrige un aliment. Alternative écartée : tout recalculer à partir de la base. Limite : une correction ne s'applique pas au passé.
- **Scan de code-barres dès la v1, avec Open Food Facts.** Bibliothèque ZXing (WebAssembly), parce que la détection intégrée est désactivée par défaut dans Safari. Si le produit est introuvable ou incomplet : formulaire prérempli à compléter, puis ajout à la base commune. Limites : données collaboratives parfois incomplètes (souvent les fibres), licence ODbL qui impose la mention « Données Open Food Facts », limites de débit de l'API.
- **Recettes communes** : ingrédients + nombre de portions **ou** poids total du plat cuit, au choix.
- **8 moments dans la journée, dans l'ordre** : Déjeuner, grignotage matin, Dîner, grignotage après-midi, 4h, grignotage après goûter, Souper, grignotage soir (la nuit et avant le déjeuner vont dans « soir »). En base : un seul champ « moment » à 8 valeurs fixes. Raison : voir à quel moment on grignote, et les totaux par moment se calculent directement. Alternative écartée : un grignotage « libre » sans moment.
- **Les grignotages ne s'affichent que s'ils sont remplis.** Un seul bouton « + Grignotage » sous les repas ; le moment est proposé selon l'heure, et on peut le changer. Raison : écran du jour plus léger. Limite : un grignotage oublié s'ajoute après coup en changeant le moment à la main.
- **Impact des grignotages** : sur le jour, « dont grignotages : 58 kcal (4 %) » ; sur la semaine, une 5e couleur dans les barres et le total par moment (matin, après-midi, après goûter, soir).
- **Raccourcis** : « copier le repas d'hier » (repas principaux seulement, pas les grignotages) et favoris.
- **Totaux** : protéines, glucides, lipides, fibres et kcal, par moment, par jour et en moyenne sur la semaine. Pas de glucides nets.
- **Objectifs propres à chaque personne, différents pour les jours « entraînement » et « repos »** (kcal, protéines, glucides, lipides). Un interrupteur sur chaque jour, « repos » par défaut. Affichage : consommé / objectif.
- **Cheat meal 🍕 : un repas principal marqué « cheat meal », sans rien à encoder** (pas possible sur un grignotage). Le jour s'affiche « partiel » (anneaux grisés) et il ne compte pas dans la moyenne de la semaine. Pour les 3 personnes. Un compteur « 1 cheat meal cette semaine » sur la vue semaine, sans bloquer un 2e. Raison : pas de jour faussement « bas », et pas de chiffre inventé. Alternative écartée : une estimation forfaitaire (ex. 1 000 kcal), qui fausserait la moyenne sans qu'on le voie et ne dirait rien des macros. Limite : la moyenne de la semaine se calcule sur moins de jours.
- **Apparence : arrangement « B » choisi sur maquettes** : anneaux pour les kcal et les macros, repas repliés qu'on ouvre d'un appui (un seul ouvert à la fois). Clair ou sombre selon le réglage du téléphone, comme « Nous deux ». Alternative écartée : le style A (cartes de repas toutes dépliées).
- **Vues : jour (pour encoder) et semaine (façon Excel).** Les graphiques d'évolution viendront en v2.
- **Hors connexion en lecture seule.** Limite : on ne peut pas encoder sans réseau.
- **On part de zéro** : l'historique de l'Excel n'est pas importé.

## Étape 1 : tests préalables (14/11/2026) ✅

- **Scan validé sur iPhone (iOS 27.2)**, dans le navigateur (Chrome) et dans l'appli installée (Safari) : caméra OK, code EAN-13 lu, et Open Food Facts répond directement depuis le navigateur (HTTP 200, valeurs complètes sur 2 produits).
- **Lecteur : barcode-detector 3.2.3 (licence MIT)**, qui fait tourner ZXing (moteur `zxing-wasm 3.1.6`), version figée + empreinte. Moteur prêt en ~0,2 s. Raison : même façon de coder que la détection intégrée du navigateur, qui manque sur iPhone. Alternative écartée : attendre que Safari active sa propre détection. Limite : le moteur `.wasm` est téléchargé sur jsDelivr par la bibliothèque, sans empreinte vérifiée par le navigateur (à revoir à l'étape PWA, quand il faudra le garder pour le hors connexion).
- **Dans l'appli installée, l'iPhone redemande l'autorisation de la caméra après chaque fermeture complète.** Limite : un appui de plus sur « Autoriser » au premier scan. Pas de solution côté appli web.
- **Caméra en basse résolution par défaut (480 × 640)**, et 15 à 34 s entre l'ouverture de la caméra et la lecture (temps de visée compris). Dans l'appli : demander une meilleure résolution et mesurer à nouveau.
- **Version d'iOS : ne jamais la lire dans l'identifiant du navigateur (`userAgent`).** Il affiche « iPhone OS 18_7 », une valeur figée ; la vraie version se trouve dans « Version/27.2 ».
- **Open Food Facts appelé directement depuis le téléphone**, sans identifiant d'appli personnalisé (`User-Agent`), parce qu'un navigateur ne permet pas de le changer. Limite : 15 recherches de produit par minute et par adresse IP.
- **Création du projet Supabase décalée à l'étape base de données** : il n'y avait rien à tester dessus ici.
- **Page de test gardée** (`test/scan.html`) pour refaire des essais plus tard.

## Étape 2 : base de données (14/11/2026) ✅

- **Projet Supabase `journal-repas`, en Europe.** « Automatically expose new tables » désactivé : chaque accès est donné par `grant` dans `02_securite.sql`. Inscriptions fermées, 4 comptes créés à la main (Emma, Régine, Jérôme + un compte de test).
- **Accès réservé à la liste `membres`**, vérifiée par la fonction `prive.est_membre()` dans chaque règle RLS. Elle est rangée dans un schéma privé, invisible pour l'API. Raison : un compte qui existe mais n'est pas membre ne voit rien. Limite : un nouveau compte doit être ajouté dans `03_membres.sql`.
- **Membres identifiés par leur identifiant Supabase, jamais par leur e-mail** (le dépôt est public).
- **Commun aux 3 : `aliments`, `recettes`, `recette_ingredients`.** Tout le monde lit ; seul l'auteur modifie ou supprime. Les ingrédients d'une recette ne sont modifiables que par l'auteur de la recette.
- **Perso à chacun : `entrees` (le journal), `jours`, `cheat_meals`, `objectifs`, `favoris`.** Chacun ne voit et n'écrit que ses propres lignes.
- **Droits colonne par colonne** : `personne`, `cree_par` et les dates sont remplis par la base, jamais par l'appli. Raison : impossible d'écrire au nom de quelqu'un d'autre.
- **Totaux de chaque ligne calculés par la base** (colonnes « générées ») à partir de la quantité et des valeurs copiées (pour 100 g / 100 ml, ou pour 1 portion de recette). Raison : pas d'erreur de calcul possible côté téléphone. Alternative écartée : totaux calculés et envoyés par l'appli.
- **Le jour du journal est une date simple (`date`), sans heure.** Raison : la date locale de Bruxelles est enregistrée telle quelle, donc pas de décalage d'un jour à cause du fuseau. Les dates de création et de modification sont en UTC (`timestamptz`).
- **Supprimer un aliment** : les lignes du journal restent (avec leurs valeurs copiées). Un aliment utilisé dans une recette ne peut pas être supprimé.
- **Cheat meal et aliments dans le même repas** : la base ne l'empêche pas, c'est l'appli qui s'en charge. Limite : en cas de bug, les deux pourraient coexister (le cheat meal l'emporte dans les totaux).
- **Pas de temps réel** (contrairement au calendrier). Raison : chacun ne voit que ses propres données, sur un seul téléphone. Limite : si on encode sur deux appareils en même temps, il faut recharger.
- **Import des 364 aliments de l'Excel**, avec Emma comme auteur. Corrections : kcal du fromage râpé Vache bleue (1529 → 365, c'étaient des kJ) et glucides du ketchup (« 23;2 » tapé en texte, compté 0 par l'Excel → 23,2). Boissons et laits en ml, tout le reste en g.
- **Test de sécurité `05_test_securite.sql` : 28/28 ✅** dans Supabase, et testé aussi avant en local. Les 3 membres voient les 364 aliments mais pas le journal des autres ; le compte de test et un visiteur non connecté ne voient rien et ne peuvent rien écrire. Le compte de test est gardé pour les tests finaux.
