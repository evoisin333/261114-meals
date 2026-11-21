// Journal des repas – étapes 3a à 3c : connexion, écran du jour, ajout / modification / suppression,
// grignotages, cheat meal, « Copier d'hier », favoris, objectifs, semaine, scan et fiches d'aliments, recettes,
// appli installable et lecture sans réseau ; recettes v2 : carnets, fiche, portions, encoder une portion
'use strict';

const client = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseCle);

// Les 8 moments de la journée, dans l'ordre (repas principaux et grignotages)
const MOMENTS = [
  { id: 'dejeuner', nom: 'Déjeuner', repas: true, couleur: 'var(--dejeuner)' },
  { id: 'grignotage_matin', nom: 'Grignotage · matin', repas: false, couleur: 'var(--grignotage)' },
  { id: 'diner', nom: 'Dîner', repas: true, couleur: 'var(--diner)' },
  { id: 'grignotage_apres_midi', nom: 'Grignotage · après-midi', repas: false, couleur: 'var(--grignotage)' },
  { id: 'quatre_heures', nom: '4h', repas: true, couleur: 'var(--quatre-heures)' },
  { id: 'grignotage_apres_gouter', nom: 'Grignotage · après goûter', repas: false, couleur: 'var(--grignotage)' },
  { id: 'souper', nom: 'Souper', repas: true, couleur: 'var(--souper)' },
  { id: 'grignotage_soir', nom: 'Grignotage · soir', repas: false, couleur: 'var(--grignotage)' }
];
const momentParId = (id) => MOMENTS.find((m) => m.id === id);
const TOUR_KCAL = 2 * Math.PI * 70;   // circonférence du grand anneau
const TOUR_MACRO = 2 * Math.PI * 26;  // circonférence des petits anneaux

const etat = {
  jour: aujourdhui(),   // date affichée, 'AAAA-MM-JJ' (heure de Bruxelles)
  lignes: [],           // lignes du journal de ce jour
  cheats: new Set(),    // repas marqués « cheat meal » ce jour
  typeJour: 'repos',
  objectifs: {},        // { repos: {...}, entrainement: {...} }
  aliments: [],         // base d'aliments (chargée une fois)
  recettes: [],         // recettes communes, avec leurs ingrédients et leurs totaux
  uniteRecette: 'portion', // unité choisie pour encoder une recette
  recetteOuverte: null, // recette affichée dans la feuille (null = nouvelle)
  ingredients: [],      // ingrédients en cours d'édition : { aliment, quantite (texte) }
  destination: 'journal', // où va l'aliment scanné ou créé : 'journal' ou 'recette'
  horsLigne: false,     // pas de réseau : lecture seule, avec la copie gardée sur le téléphone
  favoris: new Set(),   // identifiants des aliments favoris
  favorisRecettes: new Set(), // identifiants des recettes favorites
  carnets: [],          // carnets visibles : les communs et les miens
  carnetRecettes: [],   // qui est dans quel carnet : { carnet_id, recette_id }
  gereCommuns: false,   // le compte connecté gère-t-il les carnets communs ?
  vueCarnets: null,     // 'communs' ou 'mes'
  niveau: 'carnets',    // écran Recettes : 'carnets', 'carnet' ou 'fiche'
  carnetOuvert: null,   // carnet affiché (ou 'toutes' / 'favoris')
  recetteFiche: null,   // recette affichée dans la fiche
  portionsFiche: null,  // nombre de portions choisi dans la fiche (affichage seulement)
  encodageDirect: false, // feuille d'ajout ouverte depuis une fiche : aujourd'hui, moment au choix
  photoNouvelle: null,  // photo choisie dans le formulaire (déjà réduite), pas encore envoyée
  photoRetiree: false,  // « Retirer » touché dans le formulaire
  etapesEdition: [],    // étapes en cours d'écriture (textes)
  carnetsEdition: new Set(), // carnets cochés dans le formulaire
  ouvert: null,         // moment déplié
  momentAjout: null,    // moment où on ajoute
  alimentChoisi: null,
  ligneChoisie: null,
  ecran: 'jour',        // 'jour', 'semaine' ou 'recettes'
  moi: null,            // identifiant Supabase du compte connecté
  ficheAliment: null,   // aliment modifié dans la fiche (null = nouvel aliment)
  ficheUnite: 'g',
  ficheSource: 'manuel'
};

// ---------- Outils ----------

const $ = (id) => document.getElementById(id);

// Date du jour à Bruxelles, au format AAAA-MM-JJ
function aujourdhui() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}

// Heure actuelle à Bruxelles (0 à 23)
function heureBruxelles() {
  const parties = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Brussels' }).formatToParts(new Date());
  return Number(parties.find((p) => p.type === 'hour').value);
}

// Ajoute n jours à une date AAAA-MM-JJ (calcul à midi UTC : pas de souci de changement d'heure)
function decaler(jour, n) {
  const d = new Date(jour + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateLisible(jour) {
  const d = new Date(jour + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

function arrondi(x) {
  return Math.round(Number(x) * 100) / 100;
}

function nombre(x, decimales = 0) {
  return Number(x).toLocaleString('fr-BE', { maximumFractionDigits: decimales });
}

// Lit une quantité tapée (virgule acceptée). Renvoie null si invalide.
function lireQuantite(texte) {
  const q = parseFloat(String(texte).replace(',', '.'));
  return Number.isFinite(q) && q > 0 && q <= 5000 ? Math.round(q * 10) / 10 : null;
}

// Nombre positif tapé (virgule acceptée), jusqu'à max. Renvoie null si invalide.
function lirePositif(texte, max) {
  const x = parseFloat(String(texte).replace(',', '.'));
  return Number.isFinite(x) && x > 0 && x <= max ? Math.round(x * 10) / 10 : null;
}

// Minuscules, sans accents : pour la recherche
function normaliser(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Crée un élément HTML (le texte passe par textContent : pas d'injection possible)
function el(balise, attributs = {}, enfants = []) {
  const e = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined) continue;   // attribut absent
    if (cle === 'texte') e.textContent = valeur;
    else if (cle === 'classe') e.className = valeur;
    else if (cle.startsWith('on')) e.addEventListener(cle.slice(2), valeur);
    else e.setAttribute(cle, valeur);
  }
  for (const enfant of enfants) if (enfant) e.append(enfant);
  return e;
}

function iconePlus() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const chemin = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chemin.setAttribute('d', 'M12 5v14M5 12h14');
  svg.append(chemin);
  return svg;
}

let minuteurBandeau = null;
function afficherBandeau(texte) {
  const b = $('bandeau');
  b.textContent = texte;
  b.hidden = false;
  clearTimeout(minuteurBandeau);
  minuteurBandeau = setTimeout(() => { b.hidden = true; }, 4000);
}

function erreur(e) {
  console.error(e);
  afficherBandeau('Erreur : ' + (e.message || e));
}

// ---------- Copie sur le téléphone (pour la lecture sans réseau) ----------

// Rangée par compte, effacée à la déconnexion
const copie = {
  cle: (nom) => 'buonapp:' + etat.moi + ':' + nom,
  lire(nom) {
    try { return JSON.parse(localStorage.getItem(copie.cle(nom))); } catch (e) { return null; }
  },
  ecrire(nom, valeur) {
    try { localStorage.setItem(copie.cle(nom), JSON.stringify(valeur)); } catch (e) { console.warn('Copie impossible', e); }
  },
  // Garde seulement les n dernières clés d'une famille (jours, semaines)
  garder(famille, nom, n) {
    const liste = (copie.lire(famille) || []).filter((x) => x !== nom);
    liste.unshift(nom);
    for (const ancien of liste.slice(n)) localStorage.removeItem(copie.cle(ancien));
    copie.ecrire(famille, liste.slice(0, n));
  },
  vider() {
    for (const cle of Object.keys(localStorage)) if (cle.startsWith('buonapp:')) localStorage.removeItem(cle);
  }
};

function avecDelai(promesse, ms) {
  return Promise.race([promesse, new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('délai dépassé')), ms))]);
}

// Erreur due au réseau (pas de connexion, wifi sans internet…) ?
function estErreurReseau(e) {
  return !navigator.onLine || /fetch|network|load failed|délai/i.test(String(e && e.message));
}

// Bloque une écriture sans réseau
function lectureSeule() {
  if (!etat.horsLigne) return false;
  afficherBandeau('Hors connexion : lecture seule');
  return true;
}

function passerHorsLigne() {
  etat.horsLigne = true;
  document.body.classList.add('hors-ligne');
  $('bandeauHorsLigne').hidden = false;
  etat.aliments = (copie.lire('aliments') || []).map(preparerAliment);
  etat.objectifs = copie.lire('objectifs') || {};
  etat.favoris = new Set(copie.lire('favoris') || []);
  etat.favorisRecettes = new Set(copie.lire('favorisRecettes') || []);
  etat.carnets = copie.lire('carnets') || [];
  etat.carnetRecettes = copie.lire('carnetRecettes') || [];
  etat.gereCommuns = copie.lire('gereCommuns') === true;
  $('titreProfil').textContent = copie.lire('prenom') || 'Profil';
  preparerRecettes(copie.lire('recettes') || [], copie.lire('ingredients') || []);
  rechargerEcran();
}

function passerEnLigne() {
  etat.horsLigne = false;
  document.body.classList.remove('hors-ligne');
  $('bandeauHorsLigne').hidden = true;
  ouvrirAppli();
}

window.addEventListener('offline', () => { if (!$('barreBas').hidden && !etat.horsLigne) passerHorsLigne(); });
window.addEventListener('online', () => { if (!$('barreBas').hidden && etat.horsLigne) passerEnLigne(); });

function rechargerEcran() {
  const p = etat.ecran === 'semaine' ? chargerSemaine()
    : etat.ecran === 'recettes' ? Promise.resolve(afficherRecettes())
    : chargerJour();
  return p.catch(erreur);
}

// ---------- Connexion ----------

async function demarrer() {
  const moiEnCopie = localStorage.getItem('buonapp:moi');
  // Sans réseau : on ouvre tout de suite avec la copie (sans attendre Supabase)
  if (!navigator.onLine && moiEnCopie) {
    etat.moi = moiEnCopie;
    return ouvrirAppli(true);
  }
  let session = null;
  try {
    const { data } = await avecDelai(client.auth.getSession(), 3000);
    session = data.session;
  } catch (e) {
    if (moiEnCopie) { etat.moi = moiEnCopie; return ouvrirAppli(true); }
  }
  if (!session) return montrerConnexion();
  etat.moi = session.user.id;
  localStorage.setItem('buonapp:moi', etat.moi);
  ouvrirAppli();
}

function montrerConnexion() {
  $('ecranJour').hidden = true;
  $('ecranSemaine').hidden = true;
  $('ecranRecettes').hidden = true;
  $('barreBas').hidden = true;
  $('ecranConnexion').hidden = false;
}

$('formConnexion').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('messageConnexion').textContent = '';
  const { error } = await client.auth.signInWithPassword({
    email: $('champEmail').value.trim(),
    password: $('champMotDePasse').value
  });
  if (error) {
    $('messageConnexion').textContent = 'E-mail ou mot de passe incorrect.';
    return;
  }
  $('champMotDePasse').value = '';
  const { data } = await client.auth.getSession();
  etat.moi = data.session.user.id;
  localStorage.setItem('buonapp:moi', etat.moi);
  ouvrirAppli();
});

$('boutonDeconnexion').addEventListener('click', async () => {
  if (lectureSeule()) return;
  await client.auth.signOut({ scope: 'local' });   // ce téléphone seulement
  copie.vider();                                    // la copie des données part avec
  viderPhotos();
  $('feuilleProfil').close();
  montrerConnexion();
});

async function ouvrirAppli(sansReseau = false) {
  $('ecranConnexion').hidden = true;
  $('barreBas').hidden = false;
  montrerEcran(etat.ecran);
  if (sansReseau) return passerHorsLigne();
  try {
    await avecDelai(Promise.all([chargerAliments(), chargerObjectifs(), chargerPrenom(), chargerFavoris(), chargerRecettes(), chargerCarnets()]), 8000);
    calculerRecettes();   // les recettes ont besoin des aliments, chargés en même temps
    await rechargerEcran();
  } catch (e) {
    if (estErreurReseau(e)) passerHorsLigne();
    else erreur(e);
  }
}

async function chargerPrenom() {
  const { data, error } = await client.from('membres').select('prenom, gere_carnets_communs').maybeSingle();
  if (error) throw error;
  $('titreProfil').textContent = data ? data.prenom : 'Profil';
  etat.gereCommuns = !!(data && data.gere_carnets_communs);
  copie.ecrire('prenom', data ? data.prenom : null);
  copie.ecrire('gereCommuns', etat.gereCommuns);
}

// ---------- Chargement des données ----------

// Base d'aliments, par paquets de 1 000 (limite de l'API)
async function chargerAliments() {
  const tous = [];
  const taille = 1000;
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await client.from('aliments')
      .select('id, nom, unite, proteines, glucides, lipides, fibres, kcal, portion_nom, portion_qte, code_barres, cree_par')
      .order('nom')
      .range(debut, debut + taille - 1);
    if (error) throw error;
    tous.push(...data);
    if (data.length < taille) break;
  }
  etat.aliments = tous.map(preparerAliment);
  copie.ecrire('aliments', tous);
}

function preparerAliment(a) {
  return { ...a, recherche: normaliser(a.nom) };
}

async function chargerObjectifs() {
  const { data, error } = await client.from('objectifs').select('type_jour, kcal, proteines, glucides, lipides');
  if (error) throw error;
  etat.objectifs = {};
  for (const o of data) etat.objectifs[o.type_jour] = o;
  copie.ecrire('objectifs', etat.objectifs);
}

async function chargerFavoris() {
  const { data, error } = await client.from('favoris').select('aliment_id, recette_id');
  if (error) throw error;
  etat.favoris = new Set(data.filter((f) => f.aliment_id).map((f) => f.aliment_id));
  etat.favorisRecettes = new Set(data.filter((f) => f.recette_id).map((f) => f.recette_id));
  copie.ecrire('favoris', [...etat.favoris]);
  copie.ecrire('favorisRecettes', [...etat.favorisRecettes]);
}

async function chargerJour() {
  const jour = etat.jour;
  if (etat.horsLigne) {
    const c = copie.lire('jour:' + jour);
    etat.lignes = c ? c.lignes : [];
    etat.typeJour = c ? c.typeJour : 'repos';
    etat.cheats = new Set(c ? c.cheats : []);
    afficherJour();
    if (!c) afficherBandeau('Pas de copie de ce jour sur ce téléphone');
    return;
  }
  const [lignes, type, cheats] = await Promise.all([
    client.from('entrees')
      .select('id, moment, nom, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref, proteines, glucides, lipides, fibres, kcal')
      .eq('jour', jour)
      .order('cree_le'),
    client.from('jours').select('type_jour').eq('jour', jour).maybeSingle(),
    client.from('cheat_meals').select('moment').eq('jour', jour)
  ]);
  for (const r of [lignes, type, cheats]) if (r.error) throw r.error;
  if (jour !== etat.jour) return;   // on a changé de jour entre-temps
  etat.lignes = lignes.data;
  etat.typeJour = type.data ? type.data.type_jour : 'repos';
  etat.cheats = new Set(cheats.data.map((c) => c.moment));
  afficherJour();
  copie.ecrire('jour:' + jour, { lignes: etat.lignes, typeJour: etat.typeJour, cheats: [...etat.cheats] });
  copie.garder('jours', 'jour:' + jour, 31);   // les 31 derniers jours consultés
}

// ---------- Affichage du jour ----------

function afficherJour() {
  const auj = aujourdhui();
  const ecart = Math.round((new Date(etat.jour) - new Date(auj)) / 86400000);
  $('texteSurtitre').textContent = { 0: "Aujourd'hui", '-1': 'Hier', 1: 'Demain' }[ecart] || '';
  const date = dateLisible(etat.jour);
  $('texteDate').textContent = date.charAt(0).toUpperCase() + date.slice(1);

  $('boutonRepos').classList.toggle('actif', etat.typeJour === 'repos');
  $('boutonEntrainement').classList.toggle('actif', etat.typeJour === 'entrainement');
  $('boutonRepos').setAttribute('aria-pressed', etat.typeJour === 'repos');
  $('boutonEntrainement').setAttribute('aria-pressed', etat.typeJour === 'entrainement');

  // Totaux du jour (un repas en cheat meal ne compte jamais)
  const total = { proteines: 0, glucides: 0, lipides: 0, fibres: 0, kcal: 0 };
  let kcalGrignotages = 0;
  for (const l of etat.lignes) {
    if (etat.cheats.has(l.moment)) continue;
    for (const cle in total) total[cle] += Number(l[cle]);
    if (!momentParId(l.moment).repas) kcalGrignotages += Number(l.kcal);
  }
  const partiel = etat.cheats.size > 0;

  const obj = etat.objectifs[etat.typeJour];
  $('texteKcal').textContent = nombre(total.kcal);
  $('texteObjectifKcal').textContent = partiel ? 'kcal · partiel' : obj ? '/ ' + nombre(obj.kcal) + ' kcal' : 'kcal';
  remplirArc('arcKcal', total.kcal, obj && obj.kcal, TOUR_KCAL);

  const macros = [
    ['Proteines', 'proteines', 'Prot.'],
    ['Glucides', 'glucides', 'Gluc.'],
    ['Lipides', 'lipides', 'Lip.']
  ];
  for (const [suffixe, cle, legende] of macros) {
    $('texte' + suffixe).textContent = nombre(total[cle]) + ' g';
    $('legende' + suffixe).textContent = obj ? legende + ' / ' + nombre(obj[cle]) : legende;
    remplirArc('arc' + suffixe, total[cle], obj && obj[cle], TOUR_MACRO);
  }
  $('texteFibres').textContent = nombre(total.fibres) + ' g';
  remplirArc('arcFibres', total.fibres > 0 ? 1 : 0, 1, TOUR_MACRO);

  document.querySelector('.resume').classList.toggle('partiel', partiel);
  $('lignePartiel').hidden = !partiel;
  $('ligneGrignotage').hidden = kcalGrignotages === 0;
  $('ligneGrignotage').textContent = 'dont grignotages : ' + nombre(kcalGrignotages) + ' kcal (' +
    (total.kcal > 0 ? Math.round(kcalGrignotages / total.kcal * 100) : 0) + ' %)';

  // Liste des moments : les 4 repas toujours, les grignotages seulement s'ils sont remplis
  const liste = $('listeMoments');
  liste.replaceChildren();
  for (const moment of MOMENTS) {
    const lignes = etat.lignes.filter((l) => l.moment === moment.id);
    if (!moment.repas && lignes.length === 0) continue;
    liste.append(carteMoment(moment, lignes));
  }
}

function carteMoment(moment, lignes) {
  const n = lignes.length;
  const estCheat = etat.cheats.has(moment.id);
  const ouvert = etat.ouvert === moment.id;
  const kcal = lignes.reduce((s, l) => s + Number(l.kcal), 0);

  let sousTitre = n === 0 ? 'Vide' : n + (n > 1 ? ' aliments' : ' aliment');
  if (estCheat) sousTitre = 'Cheat meal';

  const entete = el('div', { classe: 'moment-entete' }, [
    el('button', {
      classe: 'moment-bouton',
      'aria-expanded': ouvert,
      onclick: () => { etat.ouvert = ouvert ? null : moment.id; afficherJour(); }
    }, [
      el('span', { classe: 'point', style: 'background:' + moment.couleur }),
      el('span', { classe: 'moment-noms' }, [
        el('strong', { texte: moment.nom }),
        el('span', { classe: 'discret', texte: sousTitre })
      ]),
      el('span', { classe: 'moment-kcal', texte: estCheat ? '–' : n === 0 ? '' : nombre(kcal) })
    ]),
    estCheat ? null : el('button', { classe: 'bouton-plus ecrit', 'aria-label': 'Ajouter : ' + moment.nom, onclick: () => ouvrirAjout(moment) }, [iconePlus()])
  ]);

  const detail = [];
  if (ouvert && estCheat) {
    detail.push(el('p', { classe: 'texte-cheat', texte: "Rien à encoder : ce repas ne compte pas dans les totaux, et le jour ne compte pas dans la moyenne de la semaine." }));
    detail.push(el('div', { classe: 'actions-moment' }, [
      el('button', { texte: 'Annuler le cheat meal', onclick: (ev) => basculerCheat(moment, false, ev.currentTarget) })
    ]));
  } else if (ouvert) {
    if (n > 0) {
      detail.push(el('ul', { classe: 'lignes' }, lignes.map((l) =>
        el('li', {}, [
          el('button', { onclick: () => ouvrirLigne(l) }, [
            el('span', { classe: 'nom', texte: l.nom + ' · ' + nombre(l.quantite, 1) + ' ' + l.unite }),
            el('span', { classe: 'valeur', texte: nombre(l.kcal) })
          ])
        ])
      )));
    }
    if (moment.repas) {
      detail.push(el('div', { classe: 'actions-moment' }, [
        el('button', { texte: "Copier d'hier", onclick: (ev) => copierHier(moment, ev.currentTarget) }),
        // Cheat meal : seulement sur un repas vide (soit encodé, soit cheat meal)
        n === 0 ? el('button', { texte: 'Cheat meal', onclick: (ev) => basculerCheat(moment, true, ev.currentTarget) }) : null
      ]));
    }
  }

  return el('section', { classe: 'moment' + (estCheat ? ' cheat' : '') + (moment.repas ? '' : ' grignotage') }, [entete, ...detail]);
}

// Remplit un anneau : valeur / objectif (anneau vide s'il n'y a pas d'objectif)
function remplirArc(id, valeur, objectif, tour) {
  const part = objectif ? Math.min(1, valeur / objectif) : 0;
  $(id).style.strokeDasharray = (part * tour).toFixed(1) + ' ' + tour.toFixed(1);
  $(id).style.opacity = part > 0 ? 1 : 0;   // sinon le bout arrondi laisse un point quand l'anneau est vide
}

// ---------- Navigation entre les jours ----------

function allerAu(jour) {
  etat.jour = jour;
  etat.ouvert = null;
  etat.lignes = [];
  etat.cheats = new Set();
  afficherJour();
  chargerJour().catch(erreur);
}

$('boutonVeille').addEventListener('click', () => allerAu(decaler(etat.jour, -1)));
$('boutonLendemain').addEventListener('click', () => allerAu(decaler(etat.jour, 1)));
$('boutonDate').addEventListener('click', () => allerAu(aujourdhui()));

// En revenant sur l'appli : on recharge (et on passe au nouveau jour après minuit)
let jourAuDepart = aujourdhui();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || $('barreBas').hidden) return;
  const auj = aujourdhui();
  if (auj !== jourAuDepart && etat.jour === jourAuDepart) etat.jour = auj;
  jourAuDepart = auj;
  if (etat.horsLigne && navigator.onLine) return passerEnLigne();
  rechargerEcran();
});

// ---------- Type de jour (repos par défaut = pas de ligne en base) ----------

async function choisirType(type) {
  if (lectureSeule() || type === etat.typeJour) return;
  const requete = type === 'entrainement'
    ? client.from('jours').insert({ jour: etat.jour, type_jour: 'entrainement' })
    : client.from('jours').delete().eq('jour', etat.jour);
  const { error } = await requete;
  if (error) return erreur(error);
  etat.typeJour = type;
  afficherJour();
}

$('boutonRepos').addEventListener('click', () => choisirType('repos'));
$('boutonEntrainement').addEventListener('click', () => choisirType('entrainement'));

// ---------- Cheat meal et « Copier d'hier » ----------

async function basculerCheat(moment, activer, bouton) {
  if (lectureSeule()) return;
  bouton.disabled = true;
  const { error } = activer
    ? await client.from('cheat_meals').insert({ jour: etat.jour, moment: moment.id })
    : await client.from('cheat_meals').delete().eq('jour', etat.jour).eq('moment', moment.id);
  if (error) { bouton.disabled = false; return erreur(error); }
  chargerJour().catch(erreur);
}

// Copie les aliments du même repas, la veille du jour affiché
async function copierHier(moment, bouton) {
  if (lectureSeule()) return;
  bouton.disabled = true;
  const veille = decaler(etat.jour, -1);
  const { data, error } = await client.from('entrees')
    .select('nom, aliment_id, recette_id, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref')
    .eq('jour', veille)
    .eq('moment', moment.id)
    .order('cree_le');
  if (error) { bouton.disabled = false; return erreur(error); }
  if (data.length === 0) {
    bouton.disabled = false;
    return afficherBandeau('Rien à copier : la veille, ce repas est vide.');
  }
  const copies = data.map((l) => ({
    jour: etat.jour, moment: moment.id, nom: l.nom, aliment_id: l.aliment_id, recette_id: l.recette_id,
    quantite: l.quantite, unite: l.unite, proteines_ref: l.proteines_ref, glucides_ref: l.glucides_ref,
    lipides_ref: l.lipides_ref, fibres_ref: l.fibres_ref, kcal_ref: l.kcal_ref
  }));
  const resultat = await client.from('entrees').insert(copies);
  if (resultat.error) { bouton.disabled = false; return erreur(resultat.error); }
  afficherBandeau(data.length + (data.length > 1 ? ' aliments copiés' : ' aliment copié'));
  chargerJour().catch(erreur);
}

// ---------- Ajouter un aliment ----------

// Grignotage proposé selon l'heure (modifiable)
function grignotageSelonHeure() {
  const h = heureBruxelles();
  if (h >= 5 && h < 12) return 'grignotage_matin';
  if (h >= 12 && h < 16) return 'grignotage_apres_midi';
  if (h >= 16 && h < 19) return 'grignotage_apres_gouter';
  return 'grignotage_soir';   // le soir, la nuit et très tôt le matin
}

function ouvrirAjout(moment) {
  if (lectureSeule()) return;
  etat.encodageDirect = false;
  $('zoneMomentTous').hidden = true;
  $('boutonRetour').hidden = false;
  etat.momentAjout = moment;
  etat.alimentChoisi = null;
  $('titreAjout').textContent = moment.repas ? 'Ajouter au ' + moment.nom : 'Ajouter un grignotage';
  $('choixMoment').hidden = moment.repas;
  majChoixMoment();
  $('champRecherche').value = '';
  afficherResultats();
  $('etapeRecherche').hidden = false;
  $('etapeQuantite').hidden = true;
  $('feuilleAjout').showModal();
  $('champRecherche').focus();   // dans le geste de l'utilisateur : le clavier s'ouvre sur iPhone
}

$('boutonGrignotage').addEventListener('click', () => ouvrirAjout(momentParId(grignotageSelonHeure())));

function majChoixMoment() {
  for (const b of $('choixMoment').querySelectorAll('[data-moment]')) {
    const actif = b.dataset.moment === etat.momentAjout.id;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-pressed', actif);
  }
}
for (const b of $('choixMoment').querySelectorAll('[data-moment]')) {
  b.addEventListener('click', () => { etat.momentAjout = momentParId(b.dataset.moment); majChoixMoment(); });
}

// Sans recherche : les favoris. Avec recherche : les résultats, favoris en premier.
function afficherResultats() {
  const mots = normaliser($('champRecherche').value).split(/\s+/).filter(Boolean);
  const liste = $('listeResultats');
  liste.replaceChildren();
  let trouves;
  const tout = etat.aliments.concat(etat.recettes);
  if (mots.length === 0) {
    trouves = etat.aliments.filter((a) => etat.favoris.has(a.id));
    $('titreResultats').hidden = trouves.length === 0;
  } else {
    $('titreResultats').hidden = true;
    const rang = (a) => (a.type !== 'recette' && etat.favoris.has(a.id) ? 0 : 2) + (a.recherche.startsWith(mots[0]) ? 0 : 1);
    trouves = tout
      .filter((a) => mots.every((m) => a.recherche.includes(m)))
      .sort((a, b) => (rang(a) - rang(b)) || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, 40);
    if (trouves.length === 0) {
      liste.append(el('li', {}, [el('button', { disabled: '' }, [el('span', { classe: 'nom discret', texte: 'Aucun aliment trouvé' })])]));
      return;
    }
  }
  for (const a of trouves) {
    const recette = a.type === 'recette';
    liste.append(el('li', {}, [
      el('button', { onclick: () => choisirAliment(a) }, [
        el('span', { classe: 'nom', texte: (recette ? 'Recette · ' : etat.favoris.has(a.id) ? '★ ' : '') + a.nom }),
        el('span', { classe: 'valeur', texte: recette ? resumeRecette(a) : nombre(a.kcal) + ' kcal / 100 ' + a.unite })
      ])
    ]));
  }
}
$('champRecherche').addEventListener('input', afficherResultats);

function choisirAliment(a) {
  etat.alimentChoisi = a;
  $('nomChoisi').textContent = a.nom;
  const recette = a.type === 'recette';
  $('boutonFavori').hidden = recette;
  $('choixUniteRecette').hidden = !(recette && a.parPortion && a.par100g);
  if (recette) {
    choisirUniteRecette(a.parPortion ? 'portion' : 'g');
  } else {
    $('uniteChoisie').textContent = a.unite;
    $('champQuantite').value = a.portion_qte ? String(a.portion_qte).replace('.', ',') : '100';
    majBoutonFavori();
  }
  $('boutonModifierAliment').hidden = recette || a.cree_par !== etat.moi;
  $('etapeRecherche').hidden = true;
  $('etapeQuantite').hidden = false;
  majApercu();
  $('champQuantite').focus();
  $('champQuantite').select();
}

function majBoutonFavori() {
  const favori = etat.favoris.has(etat.alimentChoisi.id);
  $('boutonFavori').setAttribute('aria-pressed', favori);
  $('boutonFavori').textContent = (favori ? '★' : '☆') + ' Favori';
}

$('boutonFavori').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const a = etat.alimentChoisi;
  const favori = etat.favoris.has(a.id);
  $('boutonFavori').disabled = true;
  const { error } = favori
    ? await client.from('favoris').delete().eq('aliment_id', a.id)
    : await client.from('favoris').insert({ aliment_id: a.id });
  $('boutonFavori').disabled = false;
  if (error) return erreur(error);
  if (favori) etat.favoris.delete(a.id);
  else etat.favoris.add(a.id);
  majBoutonFavori();
});

// Valeurs pour une quantité : valeurs pour 100 × quantité / 100
function apercu(ref, quantite, parPortion) {
  const f = parPortion ? quantite : quantite / 100;
  return nombre(ref.kcal * f) + ' kcal · P ' + nombre(ref.proteines * f, 1) + ' · G ' + nombre(ref.glucides * f, 1) +
    ' · L ' + nombre(ref.lipides * f, 1) + ' · F ' + nombre(ref.fibres * f, 1);
}

// Valeurs de référence du choix : pour 100 g/ml (aliment, recette en grammes) ou pour 1 portion
function refChoisie() {
  const a = etat.alimentChoisi;
  if (a.type !== 'recette') return { ref: a, unite: a.unite, parPortion: false };
  return etat.uniteRecette === 'portion'
    ? { ref: a.parPortion, unite: 'portion', parPortion: true }
    : { ref: a.par100g, unite: 'g', parPortion: false };
}

function choisirUniteRecette(unite) {
  etat.uniteRecette = unite;
  for (const b of $('choixUniteRecette').querySelectorAll('[data-unite-recette]')) {
    b.classList.toggle('actif', b.dataset.uniteRecette === unite);
    b.setAttribute('aria-pressed', b.dataset.uniteRecette === unite);
  }
  $('uniteChoisie').textContent = unite === 'portion' ? 'portion(s)' : 'g';
  $('champQuantite').value = unite === 'portion' ? '1' : '100';
  majApercu();
}
for (const b of $('choixUniteRecette').querySelectorAll('[data-unite-recette]')) {
  b.addEventListener('click', () => choisirUniteRecette(b.dataset.uniteRecette));
}

function majApercu() {
  const q = lireQuantite($('champQuantite').value);
  const { ref, parPortion } = refChoisie();
  $('boutonAjouter').disabled = q === null;
  $('apercuAjout').textContent = q === null ? 'Quantité entre 0 et 5 000' : apercu(ref, q, parPortion);
}
$('champQuantite').addEventListener('input', majApercu);

$('boutonRetour').addEventListener('click', () => {
  $('etapeQuantite').hidden = true;
  $('etapeRecherche').hidden = false;
  afficherResultats();
  $('champRecherche').focus();
});

$('boutonAjouter').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const a = etat.alimentChoisi;
  const q = lireQuantite($('champQuantite').value);
  if (!a || q === null) return;
  const { ref, unite } = refChoisie();
  const recette = a.type === 'recette';
  const jour = etat.encodageDirect ? aujourdhui() : etat.jour;
  $('boutonAjouter').disabled = true;
  // Depuis une fiche : pas d'encodage sur un repas marqué « cheat meal »
  if (etat.encodageDirect && etat.momentAjout.repas) {
    const { data: cheat, error: e } = await client.from('cheat_meals').select('moment').eq('jour', jour).eq('moment', etat.momentAjout.id);
    if (e) { $('boutonAjouter').disabled = false; return erreur(e); }
    if (cheat.length) {
      $('boutonAjouter').disabled = false;
      return afficherBandeau(etat.momentAjout.nom + ' est en cheat meal aujourd\'hui : choisis un autre moment');
    }
  }
  const { error } = await client.from('entrees').insert({
    jour,
    moment: etat.momentAjout.id,
    nom: a.nom,
    aliment_id: recette ? null : a.id,
    recette_id: recette ? a.id : null,
    quantite: q,
    unite,
    proteines_ref: arrondi(ref.proteines),
    glucides_ref: arrondi(ref.glucides),
    lipides_ref: arrondi(ref.lipides),
    fibres_ref: arrondi(ref.fibres),
    kcal_ref: Math.round(ref.kcal * 10) / 10
  });
  $('boutonAjouter').disabled = false;
  if (error) return erreur(error);
  $('feuilleAjout').close();
  etat.ouvert = etat.momentAjout.id;
  if (etat.encodageDirect) return afficherBandeau('Ajouté à aujourd\'hui · ' + etat.momentAjout.nom);
  chargerJour().catch(erreur);
});

// ---------- Scanner un code-barres ----------

const lecteurCodes = window.BarcodeDetectionAPI
  ? new window.BarcodeDetectionAPI.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
  : null;
let fluxCamera = null;
let scanEnCours = false;

async function ouvrirScan() {
  if (lectureSeule()) return;
  $('champCode').value = '';
  $('etatScan').textContent = 'Vise le code-barres du paquet';
  $('feuilleScan').showModal();
  if (!lecteurCodes) {
    $('etatScan').textContent = 'Le lecteur de codes-barres ne s\'est pas chargé : tape le code à la main.';
    return;
  }
  try {
    // Meilleure résolution que celle par défaut (480 × 640) : lecture plus rapide
    fluxCamera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    $('etatScan').textContent = 'Caméra indisponible (' + e.name + ') : tape le code à la main.';
    return;
  }
  if (!$('feuilleScan').open) return arreterCamera();   // fermé pendant l'autorisation
  $('videoScan').srcObject = fluxCamera;
  await $('videoScan').play();
  scanEnCours = true;
  lireCode();
}

// Cherche un code dans l'image toutes les 150 ms
async function lireCode() {
  if (!scanEnCours) return;
  try {
    const codes = await lecteurCodes.detect($('videoScan'));
    if (codes.length > 0) {
      fermerScan();
      return traiterCode(codes[0].rawValue);
    }
  } catch (e) {
    fermerScan();
    return erreur(e);
  }
  setTimeout(lireCode, 150);
}

function arreterCamera() {
  scanEnCours = false;
  if (fluxCamera) fluxCamera.getTracks().forEach((piste) => piste.stop());
  fluxCamera = null;
  $('videoScan').srcObject = null;
}

function fermerScan() {
  arreterCamera();
  if ($('feuilleScan').open) $('feuilleScan').close();
}

$('boutonScanner').addEventListener('click', () => { etat.destination = 'journal'; ouvrirScan(); });
$('boutonScannerIngredient').addEventListener('click', () => { etat.destination = 'recette'; ouvrirScan(); });
$('boutonFermerScan').addEventListener('click', fermerScan);
$('feuilleScan').addEventListener('cancel', arreterCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden && scanEnCours) fermerScan(); });

$('boutonChercherCode').addEventListener('click', () => {
  const code = $('champCode').value.trim();
  if (!/^[0-9]{8,14}$/.test(code)) {
    $('etatScan').textContent = 'Un code-barres, c\'est 8 à 14 chiffres.';
    return;
  }
  fermerScan();
  traiterCode(code);
});

// Aliment scanné ou créé : dans le journal (quantité) ou dans la recette en cours (ingrédient)
function utiliserAliment(a) {
  if (etat.destination === 'recette') ajouterIngredient(a);
  else choisirAliment(a);
}

// Code lu : aliment déjà dans la base, sinon Open Food Facts, sinon fiche vide
async function traiterCode(code) {
  const connu = etat.aliments.find((a) => a.code_barres === code);
  if (connu) return utiliserAliment(connu);

  afficherBandeau('Recherche du produit ' + code + '…');
  let produit = null;
  try {
    const reponse = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code +
      '.json?fields=product_name,product_name_fr,brands,nutriments,product_quantity_unit');
    if (reponse.status === 429) {
      afficherBandeau('Open Food Facts : trop de recherches d\'un coup, réessaie dans une minute.');
    } else {
      const donnees = await reponse.json();
      if (donnees.status === 1) produit = donnees.product;
    }
  } catch (e) {
    console.error(e);
  }
  ouvrirFiche(null, code, produit);
}

// ---------- Fiche d'un aliment (nouveau ou modifié) ----------

const CHAMPS_FICHE = [
  ['ficheProteines', 'proteines', 'proteins_100g'],
  ['ficheGlucides', 'glucides', 'carbohydrates_100g'],
  ['ficheLipides', 'lipides', 'fat_100g'],
  ['ficheFibres', 'fibres', 'fiber_100g']
];

function enTexte(x) {
  return x === null || x === undefined || x === '' ? '' : String(Math.round(Number(x) * 10) / 10).replace('.', ',');
}

// aliment = aliment à modifier (ou null) ; code et produit = résultat d'un scan
function ouvrirFiche(aliment, code, produit) {
  if (lectureSeule()) return;
  etat.ficheAliment = aliment;
  etat.ficheSource = produit ? 'openfoodfacts' : 'manuel';
  for (const champ of $('formAliment').querySelectorAll('input')) {
    champ.value = '';
    champ.classList.remove('manquant');
  }
  $('messageFiche').textContent = '';
  $('infoFiche').hidden = true;
  $('sourceFiche').hidden = !produit;
  $('boutonSupprimerAliment').hidden = !aliment;
  $('boutonSupprimerAliment').classList.remove('confirmer');
  $('boutonSupprimerAliment').textContent = 'Supprimer l\'aliment';
  $('titreFiche').textContent = aliment ? 'Modifier l\'aliment' : 'Nouvel aliment';

  if (aliment) {
    $('ficheNom').value = aliment.nom;
    for (const [id, cle] of CHAMPS_FICHE) $(id).value = enTexte(aliment[cle]);
    $('ficheKcal').value = enTexte(aliment.kcal);
    $('fichePortionNom').value = aliment.portion_nom || '';
    $('fichePortionQte').value = enTexte(aliment.portion_qte);
    $('ficheCode').value = aliment.code_barres || '';
    choisirUniteFiche(aliment.unite);
  } else if (produit) {
    const n = produit.nutriments || {};
    const nom = (produit.product_name_fr || produit.product_name || '').trim();
    const marque = (produit.brands || '').split(',')[0].trim();
    $('ficheNom').value = (marque && nom ? nom + ' (' + marque + ')' : nom || marque).slice(0, 120);
    const manquants = [];
    for (const [id, , cleOff] of CHAMPS_FICHE) {
      const v = n[cleOff];
      if (v === undefined || v === '' || Number(v) < 0 || Number(v) > 100) {
        $(id).classList.add('manquant');
        manquants.push($(id).parentElement.firstChild.textContent.trim());
      } else {
        $(id).value = enTexte(v);
      }
    }
    let kcal = n['energy-kcal_100g'];
    if (kcal === undefined && n['energy-kj_100g'] !== undefined) kcal = Number(n['energy-kj_100g']) / 4.184;
    $('ficheKcal').value = enTexte(kcal);
    $('ficheCode').value = code;
    choisirUniteFiche(produit.product_quantity_unit === 'ml' ? 'ml' : 'g');
    $('infoFiche').hidden = false;
    $('infoFiche').textContent = manquants.length
      ? 'Produit trouvé sur Open Food Facts. À compléter avec l\'étiquette : ' + manquants.join(', ') + '.'
      : 'Produit trouvé sur Open Food Facts. Vérifie les valeurs avec l\'étiquette avant d\'enregistrer.';
  } else {
    $('ficheCode').value = code || '';
    choisirUniteFiche('g');
    if (code) {
      $('infoFiche').hidden = false;
      $('infoFiche').textContent = 'Produit introuvable sur Open Food Facts : remplis la fiche avec l\'étiquette.';
    }
  }
  $('feuilleAliment').showModal();
  if (!aliment && !produit) $('ficheNom').focus();
}

function choisirUniteFiche(unite) {
  etat.ficheUnite = unite;
  for (const b of $('formAliment').querySelectorAll('[data-unite]')) {
    b.classList.toggle('actif', b.dataset.unite === unite);
    b.setAttribute('aria-pressed', b.dataset.unite === unite);
  }
}
for (const b of $('formAliment').querySelectorAll('[data-unite]')) {
  b.addEventListener('click', () => choisirUniteFiche(b.dataset.unite));
}
for (const champ of $('formAliment').querySelectorAll('input')) {
  champ.addEventListener('input', () => champ.classList.remove('manquant'));
}

$('boutonNouvelAliment').addEventListener('click', () => { etat.destination = 'journal'; ouvrirFiche(null, '', null); });
$('boutonNouvelIngredient').addEventListener('click', () => { etat.destination = 'recette'; ouvrirFiche(null, '', null); });
$('boutonModifierAliment').addEventListener('click', () => { etat.destination = 'journal'; ouvrirFiche(etat.alimentChoisi, '', null); });

// Lit un nombre de la fiche : null si vide, NaN si invalide
function lireNombre(id, max) {
  const texte = $(id).value.trim().replace(',', '.');
  if (texte === '') return null;
  const x = Number(texte);
  return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : NaN;
}

$('formAliment').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (lectureSeule()) return;
  const message = (texte) => { $('messageFiche').textContent = texte; };
  message('');

  const nom = $('ficheNom').value.trim().replace(/\s+/g, ' ');
  if (!nom) return message('Il faut un nom.');
  const existant = etat.aliments.find((a) => a.nom.toLowerCase() === nom.toLowerCase() && a !== etat.ficheAliment);
  if (existant) return message('Un aliment porte déjà ce nom : « ' + existant.nom + ' ».');

  const valeurs = {};
  for (const [id, cle] of CHAMPS_FICHE) {
    const x = lireNombre(id, 100);
    if (x === null || Number.isNaN(x)) {
      $(id).classList.add('manquant');
      return message('Protéines, glucides, lipides et fibres : un nombre entre 0 et 100 (0 si l\'étiquette n\'indique rien).');
    }
    valeurs[cle] = x;
  }
  let kcal = lireNombre('ficheKcal', 900);
  if (Number.isNaN(kcal)) return message('Kcal : un nombre entre 0 et 900.');
  // Kcal vides : calculées comme dans l'Excel
  if (kcal === null) kcal = Math.round(4 * valeurs.proteines + 4 * valeurs.glucides + 9 * valeurs.lipides + 2 * valeurs.fibres);

  const portionNom = $('fichePortionNom').value.trim();
  const portionQte = lireNombre('fichePortionQte', 5000);
  if (Number.isNaN(portionQte) || (portionNom === '') !== (portionQte === null) || portionQte === 0) {
    return message('Portion : remplis le nom et la quantité, ou aucun des deux.');
  }

  const code = $('ficheCode').value.trim();
  if (code && !/^[0-9]{8,14}$/.test(code)) return message('Code-barres : 8 à 14 chiffres.');
  const memeCode = code && etat.aliments.find((a) => a.code_barres === code && a !== etat.ficheAliment);
  if (memeCode) return message('Ce code-barres est déjà celui de « ' + memeCode.nom + ' ».');

  const ligne = {
    nom, unite: etat.ficheUnite, ...valeurs, kcal,
    portion_nom: portionNom || null, portion_qte: portionQte,
    code_barres: code || null
  };

  $('boutonEnregistrerAliment').disabled = true;
  const colonnes = 'id, nom, unite, proteines, glucides, lipides, fibres, kcal, portion_nom, portion_qte, code_barres, cree_par';
  const reponse = etat.ficheAliment
    ? await client.from('aliments').update(ligne).eq('id', etat.ficheAliment.id).select(colonnes).single()
    : await client.from('aliments').insert({ ...ligne, source: etat.ficheSource }).select(colonnes).single();
  $('boutonEnregistrerAliment').disabled = false;
  if (reponse.error) {
    if (reponse.error.code === '23505') return message('Ce nom ou ce code-barres existe déjà dans la base.');
    return erreur(reponse.error);
  }

  // Mise à jour de la liste locale, puis on passe à la quantité
  const aliment = preparerAliment(reponse.data);
  etat.aliments = etat.aliments.filter((a) => a.id !== aliment.id).concat(aliment)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  calculerRecettes();
  $('feuilleAliment').close();
  utiliserAliment(aliment);
  afficherBandeau(etat.ficheAliment ? 'Aliment modifié (le journal passé ne change pas)' : 'Aliment ajouté à la base commune');
});

// Suppression d'un aliment en deux appuis
$('boutonSupprimerAliment').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const bouton = $('boutonSupprimerAliment');
  if (!bouton.classList.contains('confirmer')) {
    bouton.classList.add('confirmer');
    bouton.textContent = 'Confirmer la suppression';
    return;
  }
  const a = etat.ficheAliment;
  const { error } = await client.from('aliments').delete().eq('id', a.id);
  if (error) {
    if (error.code === '23503') return $('messageFiche').textContent = 'Impossible : cet aliment est utilisé dans une recette.';
    return erreur(error);
  }
  etat.aliments = etat.aliments.filter((x) => x.id !== a.id);
  etat.favoris.delete(a.id);
  $('feuilleAliment').close();
  $('etapeQuantite').hidden = true;
  $('etapeRecherche').hidden = false;
  afficherResultats();
  afficherBandeau('Aliment supprimé (les lignes déjà encodées restent)');
});

// ---------- Recettes ----------

const NUTRIMENTS = ['proteines', 'glucides', 'lipides', 'fibres', 'kcal'];

async function chargerRecettes() {
  if (etat.horsLigne) return;
  const [recettes, ingredients] = await Promise.all([
    client.from('recettes').select('id, nom, nb_portions, poids_cuit, cree_par, cree_le, photo, etapes, prep_min, cuisson_min, source_url, notes').order('nom'),
    client.from('recette_ingredients').select('id, recette_id, aliment_id, quantite').limit(10000)
  ]);
  for (const r of [recettes, ingredients]) if (r.error) throw r.error;
  preparerRecettes(recettes.data, ingredients.data);
  copie.ecrire('recettes', recettes.data);
  copie.ecrire('ingredients', ingredients.data);
}

function preparerRecettes(recettes, ingredients) {
  etat.recettes = recettes.map((r) => ({
    ...r, type: 'recette', recherche: normaliser(r.nom),
    lignes: ingredients.filter((i) => i.recette_id === r.id)
  }));
  calculerRecettes();
}

// Totaux d'une recette avec les valeurs actuelles des aliments
function totauxIngredients(lignes) {
  const total = { proteines: 0, glucides: 0, lipides: 0, fibres: 0, kcal: 0 };
  for (const l of lignes) {
    const a = etat.aliments.find((x) => x.id === l.aliment_id);
    if (!a) continue;
    for (const c of NUTRIMENTS) total[c] += a[c] * Number(l.quantite) / 100;
  }
  return total;
}

function diviser(total, diviseur) {
  return Object.fromEntries(NUTRIMENTS.map((c) => [c, total[c] / diviseur]));
}

function calculerRecettes() {
  for (const r of etat.recettes) {
    r.total = totauxIngredients(r.lignes);
    r.parPortion = r.nb_portions ? diviser(r.total, Number(r.nb_portions)) : null;
    r.par100g = r.poids_cuit ? diviser(r.total, Number(r.poids_cuit) / 100) : null;
  }
}

function resumeRecette(r) {
  if (r.parPortion) return nombre(r.parPortion.kcal) + ' kcal / portion';
  return nombre(r.par100g.kcal) + ' kcal / 100 g';
}

// L'affichage de l'écran Recettes (carnets, carnet, fiche) est plus bas, partie « Recettes v2 »

function ouvrirRecette(r) {
  etat.recetteOuverte = r;
  const lecture = r !== null && r.cree_par !== etat.moi;
  $('titreRecette').textContent = r ? (lecture ? 'Recette' : 'Modifier la recette') : 'Nouvelle recette';
  $('infoRecette').hidden = !lecture;
  $('recetteNom').value = r ? r.nom : '';
  $('recettePortions').value = r ? enTexte(r.nb_portions) : '';
  $('recettePoids').value = r ? enTexte(r.poids_cuit) : '';
  $('recettePrep').value = r && r.prep_min != null ? String(r.prep_min) : '';
  $('recetteCuisson').value = r && r.cuisson_min != null ? String(r.cuisson_min) : '';
  $('recetteSource').value = r && r.source_url ? r.source_url : '';
  $('recetteNotes').value = r && r.notes ? r.notes : '';
  etat.etapesEdition = r && r.etapes ? r.etapes.slice() : [];
  etat.photoNouvelle = null;
  etat.photoRetiree = false;
  const dejaRangee = r ? etat.carnetRecettes.filter((l) => l.recette_id === r.id).map((l) => l.carnet_id) : [];
  etat.carnetsEdition = new Set(dejaRangee);
  // Nouvelle recette depuis un carnet que je peux modifier : déjà cochée dans ce carnet
  if (!r && peutModifierCarnet(etat.carnetOuvert)) etat.carnetsEdition.add(etat.carnetOuvert.id);
  afficherPhotoFormulaire();
  afficherEtapes();
  afficherCarnetsFormulaire();
  etat.ingredients = r
    ? r.lignes.map((l) => ({ aliment: etat.aliments.find((a) => a.id === l.aliment_id), quantite: enTexte(l.quantite) }))
        .filter((i) => i.aliment)
    : [];
  for (const champ of $('formRecette').querySelectorAll('input, textarea')) champ.disabled = lecture;
  for (const id of ['zonePhotoRecette', 'zoneCarnetsRecette', 'boutonAjouterEtape']) if (lecture) $(id).hidden = true;
  $('zoneAjoutIngredient').hidden = lecture;
  $('boutonsIngredient').hidden = lecture;
  $('boutonEnregistrerRecette').hidden = lecture;
  $('boutonSupprimerRecette').hidden = !r || lecture;
  $('boutonSupprimerRecette').classList.remove('confirmer');
  $('boutonSupprimerRecette').textContent = 'Supprimer la recette';
  $('rechercheIngredient').value = '';
  $('resultatsIngredient').replaceChildren();
  $('messageRecette').textContent = '';
  afficherIngredients(lecture);
  $('feuilleRecette').showModal();
  if (!r) $('recetteNom').focus();
}

$('boutonNouvelleRecette').addEventListener('click', () => { if (!lectureSeule()) ouvrirRecette(null); });

function afficherIngredients(lecture) {
  $('listeIngredients').replaceChildren(...etat.ingredients.map((ing, i) => {
    const champ = el('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Quantité de ' + ing.aliment.nom });
    champ.value = ing.quantite;
    champ.disabled = lecture;
    champ.addEventListener('input', () => { ing.quantite = champ.value; majTotauxRecette(); });
    return el('li', {}, [
      el('span', { classe: 'nom', texte: ing.aliment.nom }),
      champ,
      el('span', { classe: 'unite', texte: ing.aliment.unite }),
      lecture ? null : el('button', {
        type: 'button', 'aria-label': 'Retirer ' + ing.aliment.nom, texte: '×',
        onclick: () => { etat.ingredients.splice(i, 1); afficherIngredients(false); }
      })
    ]);
  }));
  majTotauxRecette();
}

function majTotauxRecette() {
  const lignes = etat.ingredients.map((i) => ({ aliment_id: i.aliment.id, quantite: lirePositif(i.quantite, 50000) || 0 }));
  const total = totauxIngredients(lignes);
  const portions = lirePositif($('recettePortions').value, 1000);
  const poids = lirePositif($('recettePoids').value, 50000);
  let texte = 'Total : ' + nombre(total.kcal) + ' kcal';
  if (portions) texte += ' · par portion : ' + nombre(total.kcal / portions) + ' kcal';
  if (poids) texte += ' · pour 100 g : ' + nombre(total.kcal / poids * 100) + ' kcal';
  $('totauxRecette').textContent = etat.ingredients.length ? texte : 'Pas encore d\'ingrédient';
}
$('recettePortions').addEventListener('input', majTotauxRecette);
$('recettePoids').addEventListener('input', majTotauxRecette);

// Recherche d'un ingrédient (aliments seulement)
$('rechercheIngredient').addEventListener('input', () => {
  const mots = normaliser($('rechercheIngredient').value).split(/\s+/).filter(Boolean);
  const liste = $('resultatsIngredient');
  liste.replaceChildren();
  if (mots.length === 0) return;
  const trouves = etat.aliments
    .filter((a) => mots.every((m) => a.recherche.includes(m)))
    .sort((a, b) => (b.recherche.startsWith(mots[0]) - a.recherche.startsWith(mots[0])) || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, 20);
  for (const a of trouves) {
    liste.append(el('li', {}, [
      el('button', { type: 'button', onclick: () => ajouterIngredient(a) }, [
        el('span', { classe: 'nom', texte: a.nom }),
        el('span', { classe: 'valeur', texte: nombre(a.kcal) + ' kcal / 100 ' + a.unite })
      ])
    ]));
  }
});

function ajouterIngredient(a) {
  $('rechercheIngredient').value = '';
  $('resultatsIngredient').replaceChildren();
  const deja = etat.ingredients.find((i) => i.aliment.id === a.id);
  if (!deja) etat.ingredients.push({ aliment: a, quantite: a.portion_qte ? enTexte(a.portion_qte) : '100' });
  afficherIngredients(false);
  // On place le curseur sur la quantité de cet ingrédient
  const index = etat.ingredients.findIndex((i) => i.aliment.id === a.id);
  const champ = $('listeIngredients').querySelectorAll('input')[index];
  champ.focus();
  champ.select();
}

$('formRecette').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (lectureSeule()) return;
  const message = (texte) => { $('messageRecette').textContent = texte; };
  message('');
  const r = etat.recetteOuverte;

  const nom = $('recetteNom').value.trim().replace(/\s+/g, ' ');
  if (!nom) return message('Il faut un nom.');
  const existante = etat.recettes.find((x) => x.nom.toLowerCase() === nom.toLowerCase() && x !== r);
  if (existante) return message('Une recette porte déjà ce nom.');
  const portionsTexte = $('recettePortions').value.trim();
  const poidsTexte = $('recettePoids').value.trim();
  const nb_portions = portionsTexte ? lirePositif(portionsTexte, 1000) : null;
  const poids_cuit = poidsTexte ? lirePositif(poidsTexte, 50000) : null;
  if (!portionsTexte) return message('Il faut un nombre de portions.');
  if (nb_portions === null || (poidsTexte && poids_cuit === null)) {
    return message('Portions et poids : des nombres plus grands que 0.');
  }
  if (etat.ingredients.length === 0) return message('Ajoute au moins un ingrédient.');
  const minutes = (texte, nomChamp) => {
    const t = texte.trim();
    if (!t) return { ok: true, valeur: null };
    if (!/^\d{1,4}$/.test(t) || Number(t) > 1440) return { ok: false, texte: nomChamp + ' : un nombre de minutes entre 0 et 1 440.' };
    return { ok: true, valeur: Number(t) };
  };
  const prep = minutes($('recettePrep').value, 'Préparation');
  if (!prep.ok) return message(prep.texte);
  const cuisson = minutes($('recetteCuisson').value, 'Cuisson');
  if (!cuisson.ok) return message(cuisson.texte);
  let source_url = $('recetteSource').value.trim();
  if (source_url && !/^[a-z][a-z0-9+.-]*:/i.test(source_url)) source_url = 'https://' + source_url;   // « www.… » tapé sans https://
  if (source_url && (!/^https:\/\/\S+$/i.test(source_url) || source_url.length > 500)) {
    return message('Le lien de la source doit commencer par https:// (500 caractères au plus).');
  }
  const etapes = etat.etapesEdition.map((e) => e.trim()).filter(Boolean);
  if (etapes.length > 40) return message('40 étapes au plus.');
  if (etapes.join('').length > 20000) return message('Étapes trop longues (20 000 caractères au plus en tout).');
  const notes = $('recetteNotes').value.trim();
  if (notes.length > 2000) return message('Notes : 2 000 caractères au plus.');
  const champsRecette = {
    nom, nb_portions, poids_cuit, prep_min: prep.valeur, cuisson_min: cuisson.valeur,
    source_url: source_url || null, etapes, notes: notes || null
  };
  const lignes = [];
  for (const i of etat.ingredients) {
    const q = lirePositif(i.quantite, 50000);
    if (q === null) return message('Quantité invalide pour « ' + i.aliment.nom + ' ».');
    lignes.push({ aliment_id: i.aliment.id, quantite: q });
  }

  $('boutonEnregistrerRecette').disabled = true;
  try {
    // 1) La recette
    let id;
    if (r) {
      const { error } = await client.from('recettes').update(champsRecette).eq('id', r.id);
      if (error) throw error;
      id = r.id;
    } else {
      const { data, error } = await client.from('recettes').insert(champsRecette).select('id').single();
      if (error) throw error;
      id = data.id;
    }
    // 2) Les ingrédients : on retire, on modifie et on ajoute seulement ce qui a changé
    const avant = r ? r.lignes : [];
    const aRetirer = avant.filter((l) => !lignes.some((n) => n.aliment_id === l.aliment_id));
    if (aRetirer.length) {
      const { error } = await client.from('recette_ingredients').delete().in('id', aRetirer.map((l) => l.id));
      if (error) throw error;
    }
    for (const n of lignes) {
      const ancien = avant.find((l) => l.aliment_id === n.aliment_id);
      if (ancien && Number(ancien.quantite) === n.quantite) continue;
      const { error } = ancien
        ? await client.from('recette_ingredients').update({ quantite: n.quantite }).eq('id', ancien.id)
        : await client.from('recette_ingredients').insert({ recette_id: id, ...n });
      if (error) throw error;
    }
    // 3) Les carnets cochés (seulement ceux que je peux modifier)
    await enregistrerCarnetsRecette(id);
    // 4) La photo : en dernier, la recette est déjà enregistrée si l'envoi échoue
    let photoRatee = false;
    try {
      await enregistrerPhoto(id, r ? r.photo : null);
    } catch (e) {
      console.error(e);
      photoRatee = true;
    }
    await Promise.all([chargerRecettes(), chargerCarnets()]);
    $('feuilleRecette').close();
    if (photoRatee) afficherBandeau('Recette enregistrée, mais la photo n\'est pas passée : réessaie dans « Modifier »');
    else afficherBandeau(r ? 'Recette modifiée (le journal passé ne change pas)' : 'Recette ajoutée');
    // On montre la recette enregistrée
    const enregistree = etat.recettes.find((x) => x.id === id);
    if (enregistree) ouvrirFicheRecette(enregistree);
    else afficherRecettes();
  } catch (e) {
    if (e.code === '23505') message('Une recette porte déjà ce nom.');
    else erreur(e);
  } finally {
    $('boutonEnregistrerRecette').disabled = false;
  }
});

// Suppression d'une recette en deux appuis (les lignes déjà encodées restent)
$('boutonSupprimerRecette').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const bouton = $('boutonSupprimerRecette');
  if (!bouton.classList.contains('confirmer')) {
    bouton.classList.add('confirmer');
    bouton.textContent = 'Confirmer la suppression';
    return;
  }
  const aSupprimer = etat.recetteOuverte;
  if (aSupprimer.photo) {
    const { error: e } = await client.storage.from(BUCKET_PHOTOS).remove([aSupprimer.photo]);
    if (e) return erreur(e);
  }
  const { error } = await client.from('recettes').delete().eq('id', aSupprimer.id);
  if (error) return erreur(error);
  await Promise.all([chargerRecettes(), chargerCarnets()]).catch(erreur);
  etat.recetteFiche = null;
  etat.niveau = etat.carnetOuvert ? 'carnet' : 'carnets';
  afficherRecettes();
  $('feuilleRecette').close();
  afficherBandeau('Recette supprimée (les lignes déjà encodées restent)');
});

// ---------- Recettes v2 : carnets, recettes d'un carnet, fiche ----------

async function chargerCarnets() {
  if (etat.horsLigne) return;
  const [carnets, liens] = await Promise.all([
    client.from('carnets').select('id, nom, commun, proprietaire').order('nom'),
    client.from('carnet_recettes').select('carnet_id, recette_id, ajoute_le').limit(10000)
  ]);
  for (const r of [carnets, liens]) if (r.error) throw r.error;
  etat.carnets = carnets.data;
  etat.carnetRecettes = liens.data;
  copie.ecrire('carnets', etat.carnets);
  copie.ecrire('carnetRecettes', etat.carnetRecettes);
}

// Puis-je modifier ce carnet ? (mêmes règles que la base)
function peutModifierCarnet(c) {
  return typeof c === 'object' && c !== null && c.proprietaire === etat.moi && (!c.commun || etat.gereCommuns);
}

// Recettes d'un carnet (y compris les deux carnets « automatiques »)
function recettesDuCarnet(c) {
  if (c === 'toutes') return etat.recettes;
  if (c === 'favoris') return etat.recettes.filter((r) => etat.favorisRecettes.has(r.id));
  const ids = new Set(etat.carnetRecettes.filter((l) => l.carnet_id === c.id).map((l) => l.recette_id));
  return etat.recettes.filter((r) => ids.has(r.id));
}

const nomCarnet = (c) => c === 'toutes' ? 'Toutes les recettes' : c === 'favoris' ? '★ Favoris' : c.nom;
const texteNb = (n) => n + (n > 1 ? ' recettes' : ' recette');

// Teinte de remplacement tant qu'il n'y a pas de photo (toujours la même pour une recette)
const teinte = (r) => 'teinte-' + (Number(r.id) % 6);

function vignette(r, classe) {
  const image = el('img', { alt: '', hidden: '' });
  if (r.photo) montrerPhoto(image, r.photo);
  return el('span', { classe: classe + ' ' + teinte(r), 'aria-hidden': 'true' }, [
    el('span', { classe: 'lettre', texte: r.nom.charAt(0).toUpperCase() }),
    image
  ]);
}

function infoCarte(r) {
  if (r.parPortion) return nombre(r.parPortion.kcal) + ' kcal / portion';
  if (r.par100g) return nombre(r.par100g.kcal) + ' kcal / 100 g';
  return '';
}

function carteRecette(r) {
  const favori = etat.favorisRecettes.has(r.id);
  return el('button', { classe: 'carte-recette', onclick: () => ouvrirFicheRecette(r) }, [
    el('span', { classe: 'photo-carte' }, [
      vignette(r, 'fond-photo'),
      favori ? el('span', { classe: 'badge-favori', 'aria-label': 'Favori', texte: '★' }) : null
    ]),
    el('span', { classe: 'texte-carte' }, [
      el('strong', { texte: r.nom }),
      el('span', { classe: 'discret', texte: infoCarte(r) })
    ])
  ]);
}

function carteCarnet(c) {
  const liste = recettesDuCarnet(c);
  // Couverture : jusqu'à 4 recettes du carnet
  const tuiles = [0, 1, 2, 3].map((i) => liste[i] ? vignette(liste[i], 'tuile') : el('span', { classe: 'tuile vide' }));
  return el('button', { classe: 'carte-recette', onclick: () => ouvrirCarnet(c) }, [
    el('span', { classe: 'mosaique' + (c === 'favoris' ? ' favoris' : '') }, c === 'favoris'
      ? [el('span', { classe: 'etoile-grande', 'aria-hidden': 'true', texte: '★' })]
      : tuiles),
    el('span', { classe: 'texte-carte' }, [
      el('strong', { texte: nomCarnet(c) }),
      el('span', { classe: 'discret', texte: texteNb(liste.length) })
    ])
  ]);
}

// Onglet à l'ouverture : « Mes carnets » s'il n'est pas vide, puis le dernier choix (gardé sur le téléphone)
function vueParDefaut() {
  const gardee = copie.lire('vueCarnets');
  if (gardee === 'communs' || gardee === 'mes') return gardee;
  const mesNonVide = etat.carnets.some((c) => !c.commun) || etat.favorisRecettes.size > 0;
  return mesNonVide ? 'mes' : 'communs';
}

function afficherRecettes() {
  $('vueCarnets').hidden = etat.niveau !== 'carnets';
  $('vueCarnet').hidden = etat.niveau !== 'carnet';
  $('vueFiche').hidden = etat.niveau !== 'fiche';
  if (etat.niveau === 'carnet') return afficherCarnet();
  if (etat.niveau === 'fiche') return afficherFiche();
  afficherCarnets();
}

function afficherCarnets() {
  if (!etat.vueCarnets) etat.vueCarnets = vueParDefaut();
  const communs = etat.vueCarnets === 'communs';
  for (const b of [$('ongletCommuns'), $('ongletMesCarnets')]) {
    const actif = b.dataset.vue === etat.vueCarnets;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-selected', actif);
  }
  $('sousTitreCarnets').textContent = communs ? 'Vus par tout le monde' : 'Visibles par toi seulement';
  $('boutonNouveauCarnet').hidden = communs && !etat.gereCommuns;
  const liste = communs
    ? ['toutes', ...etat.carnets.filter((c) => c.commun)]
    : ['favoris', ...etat.carnets.filter((c) => !c.commun && c.proprietaire === etat.moi)];
  $('grilleCarnets').replaceChildren(...liste.map(carteCarnet));
  afficherRechercheRecettes();
}

for (const b of [$('ongletCommuns'), $('ongletMesCarnets')]) {
  b.addEventListener('click', () => {
    etat.vueCarnets = b.dataset.vue;
    copie.ecrire('vueCarnets', etat.vueCarnets);
    afficherCarnets();
  });
}

// Filtre de recherche : sans accents ni majuscules, tous les mots tapés
function filtrer(liste, texte) {
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  return liste.filter((r) => mots.every((m) => r.recherche.includes(m)));
}

function afficherRechercheRecettes() {
  const texte = $('rechercheRecettes').value;
  const enRecherche = texte.trim() !== '';
  $('zoneCarnets').hidden = enRecherche;
  $('grilleRecherche').hidden = !enRecherche;
  if (!enRecherche) { $('aucunResultat').hidden = true; return; }
  const trouves = filtrer(etat.recettes, texte);
  $('grilleRecherche').replaceChildren(...trouves.map(carteRecette));
  $('aucunResultat').hidden = trouves.length > 0;
}
$('rechercheRecettes').addEventListener('input', afficherRechercheRecettes);

// ----- Un carnet -----

function ouvrirCarnet(c) {
  etat.carnetOuvert = c;
  etat.niveau = 'carnet';
  $('rechercheCarnet').value = '';
  afficherRecettes();
  $('defilement').scrollTop = 0;
}

$('boutonRetourCarnets').addEventListener('click', () => {
  etat.niveau = 'carnets';
  etat.carnetOuvert = null;
  afficherRecettes();
  $('defilement').scrollTop = 0;
});

function trier(liste, tri) {
  const copieListe = liste.slice();
  if (tri === 'az') return copieListe.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (tri === 'kcal') {
    const kcal = (r) => r.parPortion ? r.parPortion.kcal : Infinity;   // sans portions : à la fin
    return copieListe.sort((a, b) => (kcal(a) - kcal(b)) || a.nom.localeCompare(b.nom, 'fr'));
  }
  return copieListe.sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

function afficherCarnet() {
  const c = etat.carnetOuvert;
  const tout = recettesDuCarnet(c);
  $('titreCarnet').textContent = nomCarnet(c);
  $('nbCarnet').textContent = texteNb(tout.length) + (typeof c === 'object' && !c.commun ? ' · perso' : '');
  const modifiable = peutModifierCarnet(c);
  $('boutonRenommerCarnet').hidden = !modifiable;
  $('boutonRangerIci').hidden = !modifiable;
  const tri = copie.lire('triRecettes') || 'recentes';
  $('triRecettes').value = tri;
  const liste = trier(filtrer(tout, $('rechercheCarnet').value), tri);
  $('grilleRecettes').replaceChildren(...liste.map(carteRecette));
  $('carnetVide').hidden = liste.length > 0;
  $('carnetVide').textContent = tout.length > 0 ? 'Aucune recette trouvée.'
    : c === 'favoris' ? 'Touche ★ sur une recette pour la retrouver ici.'
    : c === 'toutes' ? 'Pas encore de recette.'
    : modifiable ? 'Carnet vide : touche « + Recette ici ».' : 'Carnet vide pour l\'instant.';
}
$('rechercheCarnet').addEventListener('input', afficherCarnet);
$('triRecettes').addEventListener('change', () => {
  copie.ecrire('triRecettes', $('triRecettes').value);
  afficherCarnet();
});

// ----- Créer, renommer, supprimer un carnet -----

let carnetEnEdition = null;   // null = nouveau carnet

function ouvrirFeuilleCarnet(c) {
  if (lectureSeule()) return;
  carnetEnEdition = c;
  const commun = c ? c.commun : etat.vueCarnets === 'communs';
  $('titreFeuilleCarnet').textContent = c ? 'Renommer le carnet' : 'Nouveau carnet';
  $('nomCarnet').value = c ? c.nom : '';
  $('infoCarnet').textContent = commun ? 'Carnet commun : vu par tout le monde.' : 'Carnet perso : visible par toi seulement.';
  $('messageCarnet').textContent = '';
  $('boutonSupprimerCarnet').hidden = !c;
  $('boutonSupprimerCarnet').classList.remove('confirmer');
  $('boutonSupprimerCarnet').textContent = 'Supprimer le carnet';
  $('feuilleCarnet').showModal();
  $('nomCarnet').focus();
}
$('boutonNouveauCarnet').addEventListener('click', () => ouvrirFeuilleCarnet(null));
$('boutonRenommerCarnet').addEventListener('click', () => ouvrirFeuilleCarnet(etat.carnetOuvert));

$('formCarnet').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (lectureSeule()) return;
  const message = (texte) => { $('messageCarnet').textContent = texte; };
  const nom = $('nomCarnet').value.trim().replace(/\s+/g, ' ');
  if (!nom) return message('Il faut un nom.');
  if (nom.length > 60) return message('60 caractères au plus.');
  const c = carnetEnEdition;
  const commun = c ? c.commun : etat.vueCarnets === 'communs';
  const memeNom = etat.carnets.some((x) => x !== c && x.commun === commun &&
    (commun || x.proprietaire === etat.moi) && x.nom.toLowerCase() === nom.toLowerCase());
  if (memeNom) return message('Un carnet porte déjà ce nom.');
  $('boutonEnregistrerCarnet').disabled = true;
  try {
    const { data, error } = c
      ? await client.from('carnets').update({ nom }).eq('id', c.id).select('id').single()
      : await client.from('carnets').insert({ nom, commun }).select('id').single();
    if (error) throw error;
    await chargerCarnets();
    $('feuilleCarnet').close();
    const nouveau = etat.carnets.find((x) => x.id === data.id);
    if (nouveau) ouvrirCarnet(nouveau);
  } catch (e) {
    if (e.code === '23505') message('Un carnet porte déjà ce nom.');
    else erreur(e);
  } finally {
    $('boutonEnregistrerCarnet').disabled = false;
  }
});

// Suppression en deux appuis : les recettes restent, seul le carnet disparaît
$('boutonSupprimerCarnet').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const bouton = $('boutonSupprimerCarnet');
  if (!bouton.classList.contains('confirmer')) {
    bouton.classList.add('confirmer');
    bouton.textContent = 'Confirmer (les recettes restent)';
    return;
  }
  const { error } = await client.from('carnets').delete().eq('id', carnetEnEdition.id);
  if (error) return erreur(error);
  await chargerCarnets().catch(erreur);
  $('feuilleCarnet').close();
  etat.niveau = 'carnets';
  etat.carnetOuvert = null;
  afficherRecettes();
  afficherBandeau('Carnet supprimé (les recettes restent)');
});

// ----- Ranger : cases à cocher -----
// mode 'carnets' : dans quels carnets est la recette de la fiche ?
// mode 'recettes' : quelles recettes sont dans le carnet ouvert ?
let modeRanger = 'carnets';

function estDans(carnetId, recetteId) {
  return etat.carnetRecettes.some((l) => l.carnet_id === carnetId && l.recette_id === recetteId);
}

function ouvrirRanger(mode) {
  if (lectureSeule()) return;
  modeRanger = mode;
  $('rechercheRanger').value = '';
  $('zoneRechercheRanger').hidden = mode !== 'recettes';
  $('titreRanger').textContent = mode === 'recettes' ? 'Recettes du carnet' : 'Ranger dans…';
  afficherRanger();
  $('feuilleRanger').showModal();
}
$('boutonRangerIci').addEventListener('click', () => ouvrirRanger('recettes'));
$('boutonRanger').addEventListener('click', () => ouvrirRanger('carnets'));

function afficherRanger() {
  const lignes = [];
  if (modeRanger === 'carnets') {
    const r = etat.recetteFiche;
    const mes = etat.carnets.filter((c) => !c.commun && c.proprietaire === etat.moi);
    const communs = etat.gereCommuns ? etat.carnets.filter((c) => c.commun) : [];
    for (const c of [...communs, ...mes]) {
      lignes.push({ texte: c.nom, detail: c.commun ? 'Commun' : 'Perso', coche: estDans(c.id, r.id), carnet: c, recette: r });
    }
    $('infoRanger').textContent = lignes.length ? 'Touche un carnet pour y mettre ou retirer « ' + r.nom + ' ».'
      : 'Pas encore de carnet : crées-en un dans « Mes carnets ».';
  } else {
    const c = etat.carnetOuvert;
    for (const r of filtrer(trier(etat.recettes, 'az'), $('rechercheRanger').value)) {
      lignes.push({ texte: r.nom, detail: infoCarte(r), coche: estDans(c.id, r.id), carnet: c, recette: r });
    }
    $('infoRanger').textContent = 'Touche une recette pour la mettre dans « ' + c.nom + ' » ou l\'en retirer.';
  }
  $('listeRanger').replaceChildren(...lignes.map((l) => el('li', {}, [
    el('button', { 'aria-pressed': l.coche, onclick: (ev) => basculerRangement(l, ev.currentTarget) }, [
      el('span', { classe: 'case', 'aria-hidden': 'true', texte: l.coche ? '✓' : '' }),
      el('span', { classe: 'nom', texte: l.texte }),
      el('span', { classe: 'valeur', texte: l.detail })
    ])
  ])));
}
$('rechercheRanger').addEventListener('input', afficherRanger);

async function basculerRangement(l, bouton) {
  if (lectureSeule()) return;
  bouton.disabled = true;
  const dedans = estDans(l.carnet.id, l.recette.id);
  const { error } = dedans
    ? await client.from('carnet_recettes').delete().eq('carnet_id', l.carnet.id).eq('recette_id', l.recette.id)
    : await client.from('carnet_recettes').insert({ carnet_id: l.carnet.id, recette_id: l.recette.id });
  bouton.disabled = false;
  if (error && error.code !== '23505') return erreur(error);   // 23505 : déjà dedans (autre téléphone)
  if (dedans) etat.carnetRecettes = etat.carnetRecettes.filter((x) => !(x.carnet_id === l.carnet.id && x.recette_id === l.recette.id));
  else etat.carnetRecettes.push({ carnet_id: l.carnet.id, recette_id: l.recette.id, ajoute_le: new Date().toISOString() });
  copie.ecrire('carnetRecettes', etat.carnetRecettes);
  afficherRanger();
}

$('feuilleRanger').addEventListener('close', () => { if (etat.ecran === 'recettes') afficherRecettes(); });

// ----- Fiche d'une recette -----

function ouvrirFicheRecette(r) {
  etat.recetteFiche = r;
  etat.portionsFiche = r.nb_portions ? Number(r.nb_portions) : null;
  etat.niveau = 'fiche';
  montrerEcran('recettes');
  afficherRecettes();
  $('defilement').scrollTop = 0;
}

$('boutonRetourFiche').addEventListener('click', () => {
  etat.niveau = etat.carnetOuvert ? 'carnet' : 'carnets';
  afficherRecettes();
  $('defilement').scrollTop = 0;
});

// Quantité lisible : une décimale sous 10, entier au-dessus
const qteLisible = (q) => nombre(q, q < 10 ? 1 : 0);

function afficherFiche() {
  // La recette a pu changer (rechargement) : on reprend la version à jour
  const r = etat.recettes.find((x) => x.id === etat.recetteFiche.id);
  if (!r) { etat.niveau = etat.carnetOuvert ? 'carnet' : 'carnets'; return afficherRecettes(); }
  etat.recetteFiche = r;

  $('photoFiche').className = 'photo-fiche ' + teinte(r);
  $('lettreFiche').textContent = r.nom.charAt(0).toUpperCase();
  $('imageFiche').hidden = true;
  $('imageFiche').removeAttribute('src');
  if (r.photo) montrerPhoto($('imageFiche'), r.photo);
  $('nomFiche').textContent = r.nom;
  $('auteurFiche').hidden = r.cree_par !== etat.moi;
  $('boutonModifierRecette').hidden = r.cree_par !== etat.moi;

  const favori = etat.favorisRecettes.has(r.id);
  $('boutonFavoriRecette').setAttribute('aria-pressed', favori);
  $('boutonFavoriRecette').setAttribute('aria-label', favori ? 'Retirer des favoris' : 'Ajouter aux favoris');

  // Carnets où elle est rangée (les communs et les miens)
  const ids = new Set(etat.carnetRecettes.filter((l) => l.recette_id === r.id).map((l) => l.carnet_id));
  const carnets = etat.carnets.filter((c) => ids.has(c.id) && (c.commun || c.proprietaire === etat.moi));
  $('pucesCarnets').replaceChildren(...carnets.map((c) =>
    el('span', { classe: 'puce' + (c.commun ? '' : ' perso'), texte: c.nom + (c.commun ? '' : ' · perso') })));

  // Temps et source
  const infos = [];
  if (r.prep_min != null) infos.push(el('div', {}, [el('span', { classe: 'discret', texte: 'Préparation' }), el('strong', { texte: r.prep_min + ' min' })]));
  if (r.cuisson_min != null) infos.push(el('div', {}, [el('span', { classe: 'discret', texte: 'Cuisson' }), el('strong', { texte: r.cuisson_min + ' min' })]));
  if (r.source_url && r.source_url.startsWith('https://')) {
    infos.push(el('div', {}, [el('span', { classe: 'discret', texte: 'Source' }),
      el('a', { href: r.source_url, target: '_blank', rel: 'noopener noreferrer', texte: 'Lien ↗' })]));
  }
  $('infosFiche').replaceChildren(...infos);
  $('infosFiche').hidden = infos.length === 0;

  // Valeurs : par portion, sinon pour 100 g
  const ref = r.parPortion || r.par100g;
  $('refFiche').textContent = r.parPortion ? 'Par portion' : 'Pour 100 g';
  $('kcalFiche').textContent = ref ? nombre(ref.kcal) + ' kcal' : '–';
  $('pFiche').textContent = ref ? nombre(ref.proteines, 1) + ' g' : '–';
  $('gFiche').textContent = ref ? nombre(ref.glucides, 1) + ' g' : '–';
  $('lFiche').textContent = ref ? nombre(ref.lipides, 1) + ' g' : '–';
  $('fFiche').textContent = ref ? nombre(ref.fibres, 1) + ' g' : '–';
  const base = [];
  if (r.nb_portions) base.push('Recette : ' + nombre(r.nb_portions, 1) + ' portion' + (Number(r.nb_portions) > 1 ? 's' : ''));
  if (r.poids_cuit) base.push('poids cuit ' + nombre(r.poids_cuit) + ' g');
  $('baseFiche').textContent = base.join(' · ');
  $('boutonEncoderRecette').textContent = r.parPortion ? 'Encoder une portion' : 'Encoder en grammes';

  afficherIngredientsFiche();

  const etapes = (r.etapes || []).filter((e) => e.trim());
  $('etapesFiche').replaceChildren(...etapes.map((e) => el('li', { texte: e })));
  $('carteEtapes').hidden = etapes.length === 0;
  $('boutonModeCuisine').hidden = etapes.length === 0;
  // À côté de « Mode cuisine », la place manque : libellé court
  if (etapes.length) $('boutonEncoderRecette').textContent = 'Encoder';
  $('notesFiche').textContent = r.notes || '';
  $('carteNotes').hidden = !r.notes;
}

function afficherIngredientsFiche() {
  const r = etat.recetteFiche;
  const base = r.nb_portions ? Number(r.nb_portions) : null;
  const p = etat.portionsFiche;
  const facteur = base ? p / base : 1;
  $('reglagePortions').hidden = !base;
  $('notePortions').hidden = !!base;
  if (base) {
    $('textePortions').textContent = nombre(p, 1) + (p > 1 ? ' portions' : ' portion');
    $('boutonMoinsPortion').disabled = p <= 1;
    $('boutonPlusPortion').disabled = p >= 99;
  }
  $('noteEchelle').hidden = !base || p === base;
  const lignes = r.lignes
    .map((l) => ({ l, a: etat.aliments.find((x) => x.id === l.aliment_id) }))
    .filter((x) => x.a);
  $('ingredientsFiche').replaceChildren(...lignes.map(({ l, a }) => el('li', {}, [
    el('span', { classe: 'nom', texte: a.nom }),
    el('strong', { texte: qteLisible(Number(l.quantite) * facteur) + ' ' + a.unite })
  ])));
}

$('boutonMoinsPortion').addEventListener('click', () => {
  if (etat.portionsFiche > 1) etat.portionsFiche = Math.max(1, etat.portionsFiche - 1);
  afficherIngredientsFiche();
});
$('boutonPlusPortion').addEventListener('click', () => {
  if (etat.portionsFiche < 99) etat.portionsFiche = Math.min(99, etat.portionsFiche + 1);
  afficherIngredientsFiche();
});

$('boutonFavoriRecette').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const r = etat.recetteFiche;
  const favori = etat.favorisRecettes.has(r.id);
  $('boutonFavoriRecette').disabled = true;
  const { error } = favori
    ? await client.from('favoris').delete().eq('recette_id', r.id)
    : await client.from('favoris').insert({ recette_id: r.id });
  $('boutonFavoriRecette').disabled = false;
  if (error && error.code !== '23505') return erreur(error);
  if (favori) etat.favorisRecettes.delete(r.id);
  else etat.favorisRecettes.add(r.id);
  copie.ecrire('favorisRecettes', [...etat.favorisRecettes]);
  afficherFiche();
});

$('boutonModifierRecette').addEventListener('click', () => { if (!lectureSeule()) ouvrirRecette(etat.recetteFiche); });

// ----- Encoder une portion (aujourd'hui, moment au choix) -----

// Moment proposé selon l'heure de Bruxelles
function momentSelonHeure() {
  const h = heureBruxelles();
  if (h >= 5 && h < 10) return 'dejeuner';
  if (h >= 10 && h < 14) return 'diner';
  if (h >= 14 && h < 17) return 'quatre_heures';
  if (h >= 17 && h < 22) return 'souper';
  return 'grignotage_soir';
}

$('choixMomentTous').replaceChildren(...MOMENTS.map((m) => el('option', { value: m.id, texte: m.nom })));
$('choixMomentTous').addEventListener('change', () => { etat.momentAjout = momentParId($('choixMomentTous').value); });

$('boutonEncoderRecette').addEventListener('click', () => {
  if (lectureSeule()) return;
  const r = etat.recetteFiche;
  if (!r.parPortion && !r.par100g) return afficherBandeau('Cette recette n\'a pas encore de valeurs');
  ouvrirAjout(momentParId(momentSelonHeure()));
  etat.encodageDirect = true;
  $('titreAjout').textContent = 'Encoder aujourd\'hui';
  $('choixMoment').hidden = true;
  $('zoneMomentTous').hidden = false;
  $('choixMomentTous').value = etat.momentAjout.id;
  $('boutonRetour').hidden = true;
  choisirAliment(r);
});

// ---------- Recettes v2 : photos ----------

const BUCKET_PHOTOS = 'photos-recettes';
const CACHE_PHOTOS = 'buonapp-photos';   // gardé par sw.js lors des mises à jour
const urlsPhotos = new Map();            // chemin → promesse d'adresse locale (blob:)

// Une photo n'est téléchargée qu'une fois par téléphone : son chemin change à chaque nouvelle photo,
// donc la copie gardée ne devient jamais fausse.
function urlPhoto(chemin) {
  if (urlsPhotos.has(chemin)) return urlsPhotos.get(chemin);
  const promesse = (async () => {
    const cle = new URL('photo-cache/' + chemin, location.href).href;
    let cache = null;
    try { cache = await caches.open(CACHE_PHOTOS); } catch (e) { cache = null; }
    if (cache) {
      const gardee = await cache.match(cle);
      if (gardee) return URL.createObjectURL(await gardee.blob());
    }
    const { data, error } = await client.storage.from(BUCKET_PHOTOS).download(chemin);
    if (error) throw error;
    if (cache) cache.put(cle, new Response(data, { headers: { 'Content-Type': 'image/jpeg' } })).catch(() => {});
    return URL.createObjectURL(data);
  })();
  urlsPhotos.set(chemin, promesse);
  promesse.catch(() => urlsPhotos.delete(chemin));   // on réessaiera la prochaine fois
  return promesse;
}

// Affiche la photo dans <img> quand elle est prête (la couleur et l'initiale restent en attendant)
function montrerPhoto(image, chemin) {
  image.dataset.chemin = chemin;
  urlPhoto(chemin).then((url) => {
    if (image.dataset.chemin !== chemin) return;   // entre-temps, l'image affiche autre chose
    image.src = url;
    image.hidden = false;
  }).catch((e) => console.warn('Photo indisponible', e));
}

function viderPhotos() {
  urlsPhotos.clear();
  if ('caches' in window) caches.delete(CACHE_PHOTOS).catch(() => {});
}

// Réduit la photo sur le téléphone : 1 200 px au plus, JPEG (moins de 2 Mo)
async function reduirePhoto(fichier) {
  const adresse = URL.createObjectURL(fichier);
  try {
    const image = new Image();
    image.src = adresse;
    await image.decode();
    const echelle = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const largeur = Math.max(1, Math.round(image.naturalWidth * echelle));
    const hauteur = Math.max(1, Math.round(image.naturalHeight * echelle));
    const toile = document.createElement('canvas');
    toile.width = largeur;
    toile.height = hauteur;
    toile.getContext('2d').drawImage(image, 0, 0, largeur, hauteur);
    for (const qualite of [0.8, 0.6, 0.4]) {
      const blob = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', qualite));
      if (blob && blob.size <= 2 * 1024 * 1024) return blob;
    }
    throw new Error('photo trop lourde');
  } finally {
    URL.revokeObjectURL(adresse);
  }
}

function afficherPhotoFormulaire() {
  const r = etat.recetteOuverte;
  const image = $('imagePhotoRecette');
  $('zonePhotoRecette').className = 'large zone-photo ' + (r ? teinte(r) : 'teinte-5');
  $('lettrePhotoRecette').textContent = r ? r.nom.charAt(0).toUpperCase() : '';
  image.hidden = true;
  image.removeAttribute('src');
  delete image.dataset.chemin;
  if (etat.photoNouvelle) {
    image.dataset.chemin = 'nouvelle';
    image.src = URL.createObjectURL(etat.photoNouvelle);
    image.hidden = false;
  } else if (r && r.photo && !etat.photoRetiree) {
    montrerPhoto(image, r.photo);
  }
  const aUnePhoto = !!etat.photoNouvelle || !!(r && r.photo && !etat.photoRetiree);
  $('boutonRetirerPhoto').hidden = !aUnePhoto;
  $('iconePhotoRecette').hidden = !!r;   // nouvelle recette : un appareil photo à la place de l'initiale
}

async function photoChoisie(champ) {
  const fichier = champ.files && champ.files[0];
  champ.value = '';   // pour pouvoir rechoisir la même photo
  if (!fichier) return;
  try {
    etat.photoNouvelle = await reduirePhoto(fichier);
    etat.photoRetiree = false;
    afficherPhotoFormulaire();
  } catch (e) {
    console.error(e);
    $('messageRecette').textContent = 'Cette photo n\'a pas pu être lue. Essaie une autre photo.';
  }
}
$('photoPrendre').addEventListener('change', () => photoChoisie($('photoPrendre')));
$('photoChoisir').addEventListener('change', () => photoChoisie($('photoChoisir')));
$('boutonRetirerPhoto').addEventListener('click', () => {
  etat.photoNouvelle = null;
  etat.photoRetiree = true;
  afficherPhotoFormulaire();
});

// Envoie la nouvelle photo (ou retire l'ancienne) une fois la recette enregistrée
async function enregistrerPhoto(id, ancienne) {
  if (etat.photoNouvelle) {
    const chemin = id + '/' + crypto.randomUUID() + '.jpg';   // nouveau nom à chaque photo
    const { error } = await client.storage.from(BUCKET_PHOTOS)
      .upload(chemin, etat.photoNouvelle, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { error: e2 } = await client.from('recettes').update({ photo: chemin }).eq('id', id);
    if (e2) {
      await client.storage.from(BUCKET_PHOTOS).remove([chemin]);
      throw e2;
    }
  } else if (etat.photoRetiree && ancienne) {
    const { error } = await client.from('recettes').update({ photo: null }).eq('id', id);
    if (error) throw error;
  } else {
    return;
  }
  // L'ancienne photo ne sert plus : on l'efface (sans bloquer si ça rate)
  if (ancienne) {
    const { error } = await client.storage.from(BUCKET_PHOTOS).remove([ancienne]);
    if (error) console.warn('Ancienne photo non effacée', error);
  }
}

// ---------- Recettes v2 : étapes et carnets dans le formulaire ----------

// Hauteur d'une zone de texte selon son contenu
function ajusterHauteur(zone) {
  zone.style.height = 'auto';
  zone.style.height = zone.scrollHeight + 'px';
}

function afficherEtapes(focusIndex) {
  const liste = etat.etapesEdition;
  $('listeEtapes').replaceChildren(...liste.map((texte, i) => {
    const zone = el('textarea', { rows: '2', maxlength: '1000', 'aria-label': 'Étape ' + (i + 1) });
    zone.value = texte;
    zone.addEventListener('input', () => { liste[i] = zone.value; ajusterHauteur(zone); });
    const deplacer = (sens) => {
      const j = i + sens;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      afficherEtapes();
    };
    return el('li', {}, [
      el('span', { classe: 'numero', 'aria-hidden': 'true', texte: String(i + 1) }),
      zone,
      el('span', { classe: 'outils-etape' }, [
        el('button', { type: 'button', 'aria-label': 'Monter l\'étape ' + (i + 1), texte: '↑', disabled: i === 0 ? '' : null, onclick: () => deplacer(-1) }),
        el('button', { type: 'button', 'aria-label': 'Descendre l\'étape ' + (i + 1), texte: '↓', disabled: i === liste.length - 1 ? '' : null, onclick: () => deplacer(1) }),
        el('button', { type: 'button', classe: 'retirer', 'aria-label': 'Retirer l\'étape ' + (i + 1), texte: '×', onclick: () => { liste.splice(i, 1); afficherEtapes(); } })
      ])
    ]);
  }));
  for (const zone of $('listeEtapes').querySelectorAll('textarea')) ajusterHauteur(zone);
  $('boutonAjouterEtape').disabled = liste.length >= 40;
  if (focusIndex != null) $('listeEtapes').querySelectorAll('textarea')[focusIndex].focus();
}
$('boutonAjouterEtape').addEventListener('click', () => {
  etat.etapesEdition.push('');
  afficherEtapes(etat.etapesEdition.length - 1);
});

// Carnets que je peux remplir : les communs (si je les gère) puis les miens
function carnetsModifiables() {
  return [
    ...(etat.gereCommuns ? etat.carnets.filter((c) => c.commun) : []),
    ...etat.carnets.filter((c) => !c.commun && c.proprietaire === etat.moi)
  ];
}

function afficherCarnetsFormulaire() {
  const carnets = carnetsModifiables();
  $('zoneCarnetsRecette').hidden = carnets.length === 0;
  $('choixCarnetsRecette').replaceChildren(...carnets.map((c) => {
    const coche = etat.carnetsEdition.has(c.id);
    return el('button', {
      type: 'button', classe: 'puce choix' + (coche ? ' coche' : ''), 'aria-pressed': coche,
      texte: (coche ? '✓ ' : '') + c.nom + (c.commun ? '' : ' · perso'),
      onclick: () => {
        if (etat.carnetsEdition.has(c.id)) etat.carnetsEdition.delete(c.id);
        else etat.carnetsEdition.add(c.id);
        afficherCarnetsFormulaire();
      }
    });
  }));
}

async function enregistrerCarnetsRecette(id) {
  for (const c of carnetsModifiables()) {
    const voulu = etat.carnetsEdition.has(c.id);
    const dedans = estDans(c.id, id);
    if (voulu === dedans) continue;
    const { error } = voulu
      ? await client.from('carnet_recettes').insert({ carnet_id: c.id, recette_id: id })
      : await client.from('carnet_recettes').delete().eq('carnet_id', c.id).eq('recette_id', id);
    if (error && error.code !== '23505') throw error;
  }
}

// ---------- Mode cuisine ----------

let etapeCuisine = 0;
let verrouEcran = null;   // garde l'écran allumé (Screen Wake Lock), si le téléphone le permet

function etapesDe(r) {
  return (r.etapes || []).map((e) => e.trim()).filter(Boolean);
}

async function garderEcranAllume() {
  try {
    if (!('wakeLock' in navigator) || verrouEcran) return;
    verrouEcran = await navigator.wakeLock.request('screen');
    verrouEcran.addEventListener('release', () => { verrouEcran = null; $('badgeEcran').hidden = true; });
    $('badgeEcran').hidden = false;
  } catch (e) {
    // Refusé ou pas disponible (appli installée avant iOS 18.4…) : l'écran se met en veille normalement
    console.warn('Écran allumé impossible', e);
    $('badgeEcran').hidden = true;
  }
}

function libererEcran() {
  if (verrouEcran) verrouEcran.release().catch(() => {});
  verrouEcran = null;
  $('badgeEcran').hidden = true;
}

// Le verrou saute quand l'appli passe en arrière-plan : on le redemande au retour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('feuilleCuisine').open) garderEcranAllume();
});

function ouvrirCuisine() {
  const r = etat.recetteFiche;
  if (!etapesDe(r).length) return;
  etapeCuisine = 0;
  $('nomCuisine').textContent = r.nom;
  $('ingredientsCuisine').hidden = true;
  $('boutonIngredientsCuisine').setAttribute('aria-expanded', 'false');
  $('boutonIngredientsCuisine').textContent = 'Voir les ingrédients';
  afficherCuisine();
  $('feuilleCuisine').showModal();
  garderEcranAllume();   // dans le geste de l'utilisateur
}

function afficherCuisine() {
  const r = etat.recetteFiche;
  const etapes = etapesDe(r);
  const n = etapes.length;
  $('compteurCuisine').textContent = 'Étape ' + (etapeCuisine + 1) + ' / ' + n;
  $('barresCuisine').replaceChildren(...etapes.map((_, i) => el('span', { classe: i <= etapeCuisine ? 'faite' : '' })));
  $('texteCuisine').textContent = etapes[etapeCuisine];
  $('texteCuisine').scrollTop = 0;
  $('boutonEtapePrecedente').disabled = etapeCuisine === 0;
  $('boutonEtapeSuivante').textContent = etapeCuisine < n - 1 ? 'Suivante' : 'Terminé';
  // Ingrédients pour le nombre de portions choisi dans la fiche
  const base = r.nb_portions ? Number(r.nb_portions) : null;
  const facteur = base ? etat.portionsFiche / base : 1;
  $('ingredientsCuisine').replaceChildren(...r.lignes
    .map((l) => ({ l, a: etat.aliments.find((x) => x.id === l.aliment_id) }))
    .filter((x) => x.a)
    .map(({ l, a }) => el('li', {}, [
      el('span', { texte: a.nom }),
      el('strong', { texte: qteLisible(Number(l.quantite) * facteur) + ' ' + a.unite })
    ])));
}

$('boutonModeCuisine').addEventListener('click', ouvrirCuisine);
$('boutonFermerCuisine').addEventListener('click', () => $('feuilleCuisine').close());
$('feuilleCuisine').addEventListener('close', libererEcran);
$('boutonEtapePrecedente').addEventListener('click', () => {
  if (etapeCuisine > 0) etapeCuisine--;
  afficherCuisine();
});
$('boutonEtapeSuivante').addEventListener('click', () => {
  if (etapeCuisine < etapesDe(etat.recetteFiche).length - 1) { etapeCuisine++; afficherCuisine(); }
  else $('feuilleCuisine').close();
});
$('boutonIngredientsCuisine').addEventListener('click', () => {
  const ouvrir = $('ingredientsCuisine').hidden;
  $('ingredientsCuisine').hidden = !ouvrir;
  $('boutonIngredientsCuisine').setAttribute('aria-expanded', ouvrir);
  $('boutonIngredientsCuisine').textContent = ouvrir ? 'Masquer les ingrédients' : 'Voir les ingrédients';
});

// ---------- Apparence : Automatique / Clair / Sombre (gardée sur ce téléphone) ----------

const CLE_APPARENCE = 'buonapp-apparence';   // pas « buonapp: » : on la garde après la déconnexion
const TEXTES_APPARENCE = {
  auto: 'Suit le réglage de l\'iPhone. Gardé sur ce téléphone.',
  clair: 'Toujours en clair, même si l\'iPhone est en sombre. Gardé sur ce téléphone.',
  sombre: 'Toujours en sombre, même si l\'iPhone est en clair. Gardé sur ce téléphone.'
};

function lireApparence() {
  try {
    const a = localStorage.getItem(CLE_APPARENCE);
    return a === 'clair' || a === 'sombre' ? a : 'auto';
  } catch (e) { return 'auto'; }
}

function appliquerApparence(a) {
  const racine = document.documentElement;
  if (a === 'auto') delete racine.dataset.theme;
  else racine.dataset.theme = a;
  // Couleur de la barre du haut et des contrôles natifs
  document.querySelector('meta[name="color-scheme"]').content = a === 'auto' ? 'light dark' : a === 'clair' ? 'light' : 'dark';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const sombre = meta.media.includes('dark');
    meta.content = a === 'clair' ? '#F2F2F4' : a === 'sombre' ? '#0F1012' : (sombre ? '#0F1012' : '#F2F2F4');
  }
  for (const b of $('choixApparence').querySelectorAll('[data-apparence]')) {
    const actif = b.dataset.apparence === a;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-checked', actif);
  }
  $('texteApparence').textContent = TEXTES_APPARENCE[a];
}

for (const b of $('choixApparence').querySelectorAll('[data-apparence]')) {
  b.addEventListener('click', () => {
    const a = b.dataset.apparence;
    try {
      if (a === 'auto') localStorage.removeItem(CLE_APPARENCE);
      else localStorage.setItem(CLE_APPARENCE, a);
    } catch (e) { console.warn('Apparence non gardée', e); }
    appliquerApparence(a);
  });
}
appliquerApparence(lireApparence());

// ---------- Modifier / supprimer une ligne ----------

function ouvrirLigne(ligne) {
  etat.ligneChoisie = ligne;
  $('titreLigne').textContent = ligne.nom;
  $('uniteLigne').textContent = ligne.unite;
  $('champQuantiteLigne').value = String(ligne.quantite).replace('.', ',');
  $('boutonSupprimerLigne').classList.remove('confirmer');
  $('boutonSupprimerLigne').textContent = 'Supprimer';
  majApercuLigne();
  $('feuilleLigne').showModal();
}

function majApercuLigne() {
  const l = etat.ligneChoisie;
  const q = lireQuantite($('champQuantiteLigne').value);
  $('boutonEnregistrerLigne').disabled = q === null;
  const ref = { kcal: l.kcal_ref, proteines: l.proteines_ref, glucides: l.glucides_ref, lipides: l.lipides_ref, fibres: l.fibres_ref };
  $('apercuLigne').textContent = q === null ? 'Quantité entre 0 et 5 000' : apercu(ref, q, l.unite === 'portion');
}
$('champQuantiteLigne').addEventListener('input', majApercuLigne);

$('boutonEnregistrerLigne').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const q = lireQuantite($('champQuantiteLigne').value);
  if (q === null) return;
  const { error } = await client.from('entrees').update({ quantite: q }).eq('id', etat.ligneChoisie.id);
  if (error) return erreur(error);
  $('feuilleLigne').close();
  chargerJour().catch(erreur);
});

// Suppression en deux appuis : « Supprimer » puis « Confirmer »
$('boutonSupprimerLigne').addEventListener('click', async () => {
  if (lectureSeule()) return;
  const bouton = $('boutonSupprimerLigne');
  if (!bouton.classList.contains('confirmer')) {
    bouton.classList.add('confirmer');
    bouton.textContent = 'Confirmer la suppression';
    return;
  }
  const { error } = await client.from('entrees').delete().eq('id', etat.ligneChoisie.id);
  if (error) return erreur(error);
  $('feuilleLigne').close();
  chargerJour().catch(erreur);
});

// ---------- Onglets ----------

function montrerEcran(ecran) {
  etat.ecran = ecran;
  $('ecranJour').hidden = ecran !== 'jour';
  $('ecranSemaine').hidden = ecran !== 'semaine';
  $('ecranRecettes').hidden = ecran !== 'recettes';
  for (const [id, nom] of [['ongletJour', 'jour'], ['ongletSemaine', 'semaine'], ['ongletRecettes', 'recettes']]) {
    $(id).classList.toggle('actif', ecran === nom);
    if (ecran === nom) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  $('defilement').scrollTop = 0;
}

$('ongletJour').addEventListener('click', () => {
  montrerEcran('jour');
  chargerJour().catch(erreur);
});
$('ongletSemaine').addEventListener('click', () => {
  montrerEcran('semaine');
  chargerSemaine().catch(erreur);
});
$('ongletRecettes').addEventListener('click', () => {
  // Toucher l'onglet quand on y est déjà : retour aux carnets
  if (etat.ecran === 'recettes') { etat.niveau = 'carnets'; etat.carnetOuvert = null; }
  montrerEcran('recettes');
  afficherRecettes();
  if (!etat.horsLigne) Promise.all([chargerRecettes(), chargerCarnets(), chargerFavoris()]).then(afficherRecettes).catch(erreur);
});
$('ongletProfil').addEventListener('click', ouvrirProfil);

// ---------- Profil : objectifs ----------

const CHAMPS_OBJECTIF = ['kcal', 'proteines', 'glucides', 'lipides'];
const MAX_OBJECTIF = { kcal: 10000, proteines: 1000, glucides: 1000, lipides: 1000 };

function ouvrirProfil() {
  for (const type of ['repos', 'entrainement']) {
    const o = etat.objectifs[type];
    for (const c of CHAMPS_OBJECTIF) $('obj_' + type + '_' + c).value = o ? String(o[c]) : '';
  }
  $('messageObjectifs').textContent = '';
  $('feuilleProfil').showModal();
}

$('formObjectifs').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (lectureSeule()) return;
  $('messageObjectifs').textContent = '';
  // 1) Vérification de toutes les cases avant d'écrire quoi que ce soit
  const aEcrire = {};
  for (const type of ['repos', 'entrainement']) {
    const textes = CHAMPS_OBJECTIF.map((c) => $('obj_' + type + '_' + c).value.trim());
    if (textes.every((t) => t === '')) { aEcrire[type] = null; continue; }
    const valeurs = {};
    for (let i = 0; i < CHAMPS_OBJECTIF.length; i++) {
      const c = CHAMPS_OBJECTIF[i];
      if (!/^\d+$/.test(textes[i]) || Number(textes[i]) > MAX_OBJECTIF[c]) {
        $('messageObjectifs').textContent = 'Jours ' + (type === 'repos' ? 'repos' : 'entraînement') +
          ' : remplis les 4 cases avec des nombres entiers (ou laisse-les toutes vides).';
        return;
      }
      valeurs[c] = Number(textes[i]);
    }
    aEcrire[type] = valeurs;
  }
  // 2) Écriture : on modifie la ligne si elle existe, sinon on la crée, ou on la supprime si tout est vide
  $('boutonEnregistrerObjectifs').disabled = true;
  try {
    for (const [type, valeurs] of Object.entries(aEcrire)) {
      if (valeurs === null) {
        const { error } = await client.from('objectifs').delete().eq('type_jour', type);
        if (error) throw error;
        continue;
      }
      const maj = await client.from('objectifs').update(valeurs).eq('type_jour', type).select('type_jour');
      if (maj.error) throw maj.error;
      if (maj.data.length === 0) {
        const { error } = await client.from('objectifs').insert({ type_jour: type, ...valeurs });
        if (error) throw error;
      }
    }
    await chargerObjectifs();
    afficherJour();
    $('feuilleProfil').close();
    afficherBandeau('Objectifs enregistrés');
  } catch (e) {
    erreur(e);
  } finally {
    $('boutonEnregistrerObjectifs').disabled = false;
  }
});

// ---------- Semaine ----------

const JOURS_COURTS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const GRIGNOTAGES = MOMENTS.filter((m) => !m.repas);

// Lundi de la semaine qui contient ce jour
function lundiDe(jour) {
  const d = new Date(jour + 'T12:00:00Z');
  return decaler(jour, -((d.getUTCDay() + 6) % 7));
}

function texteSemaine(lundi) {
  const debut = new Date(lundi + 'T12:00:00Z');
  const fin = new Date(decaler(lundi, 6) + 'T12:00:00Z');
  const f = (d, options) => new Intl.DateTimeFormat('fr-BE', { ...options, timeZone: 'UTC' }).format(d);
  return debut.getUTCMonth() === fin.getUTCMonth()
    ? f(debut, { day: 'numeric' }) + ' – ' + f(fin, { day: 'numeric', month: 'long' })
    : f(debut, { day: 'numeric', month: 'short' }) + ' – ' + f(fin, { day: 'numeric', month: 'short' });
}

async function chargerSemaine() {
  const lundi = lundiDe(etat.jour);
  const dimanche = decaler(lundi, 6);
  $('texteSemaine').textContent = texteSemaine(lundi);
  if (etat.horsLigne) {
    const c = copie.lire('semaine:' + lundi);
    if (!c) afficherBandeau('Pas de copie de cette semaine sur ce téléphone');
    return afficherSemaine(lundi, c ? c.lignes : [], c ? c.cheats : []);
  }
  const [lignes, cheats] = await Promise.all([
    client.from('entrees').select('jour, moment, proteines, glucides, lipides, fibres, kcal')
      .gte('jour', lundi).lte('jour', dimanche).limit(5000),
    client.from('cheat_meals').select('jour, moment').gte('jour', lundi).lte('jour', dimanche)
  ]);
  for (const r of [lignes, cheats]) if (r.error) throw r.error;
  if (lundiDe(etat.jour) !== lundi) return;   // on a changé de semaine entre-temps
  afficherSemaine(lundi, lignes.data, cheats.data);
  copie.ecrire('semaine:' + lundi, { lignes: lignes.data, cheats: cheats.data });
  copie.garder('semaines', 'semaine:' + lundi, 8);   // les 8 dernières semaines consultées
}

function afficherSemaine(lundi, lignes, cheats) {
  // Un objet par jour : kcal par repas, grignotages, macros
  const jours = JOURS_COURTS.map((court, i) => ({
    court, jour: decaler(lundi, i), cheat: false, nb: 0,
    kcalMoment: { dejeuner: 0, diner: 0, quatre_heures: 0, souper: 0, grignotages: 0 },
    proteines: 0, glucides: 0, lipides: 0, fibres: 0, kcal: 0
  }));
  const parJour = Object.fromEntries(jours.map((j) => [j.jour, j]));
  const momentsCheat = new Set(cheats.map((c) => c.jour + '|' + c.moment));
  for (const c of cheats) if (parJour[c.jour]) parJour[c.jour].cheat = true;

  const kcalGrignotage = Object.fromEntries(GRIGNOTAGES.map((m) => [m.id, 0]));
  let kcalSemaine = 0;
  for (const l of lignes) {
    const j = parJour[l.jour];
    if (!j || momentsCheat.has(l.jour + '|' + l.moment)) continue;
    j.nb++;
    for (const c of ['proteines', 'glucides', 'lipides', 'fibres', 'kcal']) j[c] += Number(l[c]);
    const repas = momentParId(l.moment).repas;
    j.kcalMoment[repas ? l.moment : 'grignotages'] += Number(l.kcal);
    if (!repas) kcalGrignotage[l.moment] += Number(l.kcal);
    kcalSemaine += Number(l.kcal);
  }

  // Moyenne : seulement les jours encodés et sans cheat meal
  const complets = jours.filter((j) => j.nb > 0 && !j.cheat);
  const moyenne = (c) => complets.reduce((s, j) => s + j[c], 0) / complets.length;
  $('moyenneKcal').textContent = complets.length
    ? 'moyenne ' + nombre(moyenne('kcal')) + ' (' + complets.length + ' j.)'
    : 'pas encore de jour complet';

  // Barres empilées
  const max = Math.max(1, ...jours.map((j) => j.kcal));
  const couleurs = { dejeuner: 'var(--dejeuner)', diner: 'var(--diner)', quatre_heures: 'var(--quatre-heures)', souper: 'var(--souper)', grignotages: 'var(--grignotage)' };
  $('barresSemaine').replaceChildren(...jours.map((j) => {
    const morceaux = Object.entries(j.kcalMoment).filter(([, k]) => k > 0)
      .map(([m, k]) => el('i', { style: 'width:' + (k / max * 100).toFixed(1) + '%;background:' + couleurs[m] }));
    const total = j.cheat ? 'partiel' : j.nb ? nombre(j.kcal) : '–';
    return el('button', { classe: 'barre-jour' + (j.cheat ? ' partiel' : ''), 'aria-label': j.court + ' : ' + total, onclick: () => ouvrirJour(j.jour) }, [
      el('span', { classe: 'jour-court', texte: j.court }),
      el('span', { classe: 'pile' }, morceaux),
      el('span', { classe: 'total', texte: total })
    ]);
  }));

  // Grignotages par moment
  const totalGrig = Object.values(kcalGrignotage).reduce((a, b) => a + b, 0);
  $('totalGrignotages').textContent = nombre(totalGrig) + ' kcal' +
    (kcalSemaine > 0 ? ' · ' + nombre(totalGrig / kcalSemaine * 100, 1) + ' % de la semaine' : '');
  const maxGrig = Math.max(1, ...Object.values(kcalGrignotage));
  $('grignotagesSemaine').replaceChildren(...GRIGNOTAGES.map((m) =>
    el('div', { classe: 'ligne-grignotage' }, [
      el('span', { classe: 'nom', texte: m.nom.replace('Grignotage · ', '').replace(/^./, (x) => x.toUpperCase()) }),
      el('span', { classe: 'jauge' }, [el('i', { style: 'width:' + (kcalGrignotage[m.id] / maxGrig * 100).toFixed(1) + '%' })]),
      el('span', { classe: 'valeur', texte: nombre(kcalGrignotage[m.id]) + ' kcal' })
    ])
  ));

  // Tableau des macros
  const cellule = (j, c) => el('td', { texte: j.nb ? nombre(j[c]) : '–' });
  $('corpsTableSemaine').replaceChildren(...jours.map((j) =>
    el('tr', { classe: j.cheat ? 'partiel' : j.nb ? '' : 'vide' }, [
      el('td', {}, [el('button', { texte: j.court + (j.cheat ? ' · cheat' : ''), onclick: () => ouvrirJour(j.jour) })]),
      cellule(j, 'proteines'), cellule(j, 'glucides'), cellule(j, 'lipides'), cellule(j, 'fibres')
    ])
  ));
  $('ligneMoyenne').replaceChildren(
    el('td', { texte: 'Moy.' }),
    ...['proteines', 'glucides', 'lipides', 'fibres'].map((c) => el('td', { texte: complets.length ? nombre(moyenne(c)) : '–' }))
  );

  const nbCheat = cheats.length;
  $('texteCheatSemaine').textContent = nbCheat === 0 ? 'Aucun cheat meal cette semaine'
    : nbCheat + (nbCheat > 1 ? ' cheat meals' : ' cheat meal') + ' cette semaine (jours exclus de la moyenne)';
}

function ouvrirJour(jour) {
  montrerEcran('jour');
  allerAu(jour);
}

$('boutonSemainePrecedente').addEventListener('click', () => { etat.jour = decaler(lundiDe(etat.jour), -7); chargerSemaine().catch(erreur); });
$('boutonSemaineSuivante').addEventListener('click', () => { etat.jour = decaler(lundiDe(etat.jour), 7); chargerSemaine().catch(erreur); });

// ---------- Feuilles ----------

for (const bouton of document.querySelectorAll('[data-fermer]')) {
  bouton.addEventListener('click', () => bouton.closest('dialog').close());
}

// iPhone : quand le clavier se ferme, Safari peut laisser toute la page décalée vers le haut
// (la barre du bas se retrouve au milieu de l'écran). La page elle-même ne défile jamais
// (c'est #defilement qui défile), donc on la remet simplement en haut, sauf si on tape quelque chose.
function recalerPage() {
  const actif = document.activeElement;
  if (actif && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) return;
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
}
const recalerBientot = () => setTimeout(recalerPage, 150);
document.addEventListener('focusout', recalerBientot);
if (window.visualViewport) window.visualViewport.addEventListener('resize', recalerBientot);
for (const feuille of document.querySelectorAll('dialog')) feuille.addEventListener('close', recalerBientot);

// Appli installable et ouverture sans réseau
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.error('Service worker', e));
}

demarrer().catch(erreur);
