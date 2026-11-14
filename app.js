// Journal des repas – étape 3a : connexion, écran du jour, ajout / modification / suppression
'use strict';

const client = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseCle);

// Les 4 repas principaux, dans l'ordre de la journée
const REPAS = [
  { id: 'dejeuner', nom: 'Déjeuner', couleur: 'var(--dejeuner)' },
  { id: 'diner', nom: 'Dîner', couleur: 'var(--diner)' },
  { id: 'quatre_heures', nom: '4h', couleur: 'var(--quatre-heures)' },
  { id: 'souper', nom: 'Souper', couleur: 'var(--souper)' }
];
const TOUR_KCAL = 2 * Math.PI * 70;   // circonférence du grand anneau
const TOUR_MACRO = 2 * Math.PI * 26;  // circonférence des petits anneaux

const etat = {
  jour: aujourdhui(),   // date affichée, 'AAAA-MM-JJ' (heure de Bruxelles)
  lignes: [],           // lignes du journal de ce jour
  typeJour: 'repos',
  objectifs: {},        // { repos: {...}, entrainement: {...} }
  aliments: [],         // base d'aliments (chargée une fois)
  ouvert: null,         // repas déplié
  momentAjout: null,    // repas où on ajoute
  alimentChoisi: null,
  ligneChoisie: null
};

// ---------- Outils ----------

const $ = (id) => document.getElementById(id);

// Date du jour à Bruxelles, au format AAAA-MM-JJ
function aujourdhui() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
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

function nombre(x, decimales = 0) {
  return Number(x).toLocaleString('fr-BE', { maximumFractionDigits: decimales });
}

// Lit une quantité tapée (virgule acceptée). Renvoie null si invalide.
function lireQuantite(texte) {
  const q = parseFloat(String(texte).replace(',', '.'));
  return Number.isFinite(q) && q > 0 && q <= 5000 ? Math.round(q * 10) / 10 : null;
}

// Minuscules, sans accents : pour la recherche
function normaliser(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Crée un élément HTML (le texte passe par textContent : pas d'injection possible)
function el(balise, attributs = {}, enfants = []) {
  const e = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
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

// ---------- Connexion ----------

async function demarrer() {
  const { data } = await client.auth.getSession();
  if (data.session) ouvrirAppli();
  else montrerConnexion();
}

function montrerConnexion() {
  $('ecranJour').hidden = true;
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
  ouvrirAppli();
});

$('boutonDeconnexion').addEventListener('click', async () => {
  await client.auth.signOut({ scope: 'local' });   // ce téléphone seulement
  $('feuilleProfil').close();
  montrerConnexion();
});

async function ouvrirAppli() {
  $('ecranConnexion').hidden = true;
  $('ecranJour').hidden = false;
  try {
    await Promise.all([chargerAliments(), chargerObjectifs(), chargerPrenom()]);
    await chargerJour();
  } catch (e) {
    erreur(e);
  }
}

async function chargerPrenom() {
  const { data, error } = await client.from('membres').select('prenom').maybeSingle();
  if (error) throw error;
  $('titreProfil').textContent = data ? data.prenom : 'Profil';
}

// ---------- Chargement des données ----------

// Base d'aliments, par paquets de 1 000 (limite de l'API)
async function chargerAliments() {
  const tous = [];
  const taille = 1000;
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await client.from('aliments')
      .select('id, nom, unite, proteines, glucides, lipides, fibres, kcal, portion_nom, portion_qte')
      .order('nom')
      .range(debut, debut + taille - 1);
    if (error) throw error;
    tous.push(...data);
    if (data.length < taille) break;
  }
  etat.aliments = tous.map((a) => ({ ...a, recherche: normaliser(a.nom) }));
}

async function chargerObjectifs() {
  const { data, error } = await client.from('objectifs').select('type_jour, kcal, proteines, glucides, lipides');
  if (error) throw error;
  etat.objectifs = {};
  for (const o of data) etat.objectifs[o.type_jour] = o;
}

async function chargerJour() {
  const jour = etat.jour;
  const [lignes, type] = await Promise.all([
    client.from('entrees')
      .select('id, moment, nom, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref, proteines, glucides, lipides, fibres, kcal')
      .eq('jour', jour)
      .order('cree_le'),
    client.from('jours').select('type_jour').eq('jour', jour).maybeSingle()
  ]);
  if (lignes.error) throw lignes.error;
  if (type.error) throw type.error;
  if (jour !== etat.jour) return;   // on a changé de jour entre-temps
  etat.lignes = lignes.data;
  etat.typeJour = type.data ? type.data.type_jour : 'repos';
  afficherJour();
}

// ---------- Affichage du jour ----------

function afficherJour() {
  const auj = aujourdhui();
  const ecart = Math.round((new Date(etat.jour) - new Date(auj)) / 86400000);
  const surtitre = { 0: "Aujourd'hui", '-1': 'Hier', 1: 'Demain' }[ecart] || '';
  $('texteSurtitre').textContent = surtitre;
  const date = dateLisible(etat.jour);
  $('texteDate').textContent = date.charAt(0).toUpperCase() + date.slice(1);

  $('boutonRepos').classList.toggle('actif', etat.typeJour === 'repos');
  $('boutonEntrainement').classList.toggle('actif', etat.typeJour === 'entrainement');
  $('boutonRepos').setAttribute('aria-pressed', etat.typeJour === 'repos');
  $('boutonEntrainement').setAttribute('aria-pressed', etat.typeJour === 'entrainement');

  // Totaux du jour
  const total = { proteines: 0, glucides: 0, lipides: 0, fibres: 0, kcal: 0 };
  for (const l of etat.lignes) for (const cle in total) total[cle] += Number(l[cle]);

  const obj = etat.objectifs[etat.typeJour];
  $('texteKcal').textContent = nombre(total.kcal);
  $('texteObjectifKcal').textContent = obj ? '/ ' + nombre(obj.kcal) + ' kcal' : 'kcal';
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

  // Liste des repas
  const liste = $('listeMoments');
  liste.replaceChildren();
  for (const repas of REPAS) {
    const lignes = etat.lignes.filter((l) => l.moment === repas.id);
    const kcal = lignes.reduce((s, l) => s + Number(l.kcal), 0);
    const ouvert = etat.ouvert === repas.id;
    const n = lignes.length;

    const entete = el('div', { classe: 'moment-entete' }, [
      el('button', {
        classe: 'moment-bouton',
        'aria-expanded': ouvert,
        onclick: () => { etat.ouvert = ouvert ? null : repas.id; afficherJour(); }
      }, [
        el('span', { classe: 'point', style: 'background:' + repas.couleur }),
        el('span', { classe: 'moment-noms' }, [
          el('strong', { texte: repas.nom }),
          el('span', { classe: 'discret', texte: n === 0 ? 'Vide' : n + (n > 1 ? ' aliments' : ' aliment') })
        ]),
        el('span', { classe: 'moment-kcal', texte: n === 0 ? '' : nombre(kcal) })
      ]),
      el('button', { classe: 'bouton-plus', 'aria-label': 'Ajouter au ' + repas.nom, onclick: () => ouvrirAjout(repas) }, [iconePlus()])
    ]);

    let detail = null;
    if (ouvert && n > 0) {
      detail = el('ul', { classe: 'lignes' }, lignes.map((l) =>
        el('li', {}, [
          el('button', { onclick: () => ouvrirLigne(l) }, [
            el('span', { classe: 'nom', texte: l.nom + ' · ' + nombre(l.quantite, 1) + ' ' + uniteCourte(l.unite) }),
            el('span', { classe: 'valeur', texte: nombre(l.kcal) })
          ])
        ])
      ));
    }
    liste.append(el('section', { classe: 'moment' }, [entete, detail]));
  }
}

function uniteCourte(unite) {
  return unite === 'portion' ? 'portion' : unite;
}

// Remplit un anneau : valeur / objectif (anneau vide s'il n'y a pas d'objectif)
function remplirArc(id, valeur, objectif, tour) {
  const part = objectif ? Math.min(1, valeur / objectif) : 0;
  $(id).style.strokeDasharray = (part * tour).toFixed(1) + ' ' + tour.toFixed(1);
}

// ---------- Navigation entre les jours ----------

function allerAu(jour) {
  etat.jour = jour;
  etat.ouvert = null;
  etat.lignes = [];
  afficherJour();
  chargerJour().catch(erreur);
}

$('boutonVeille').addEventListener('click', () => allerAu(decaler(etat.jour, -1)));
$('boutonLendemain').addEventListener('click', () => allerAu(decaler(etat.jour, 1)));
$('boutonDate').addEventListener('click', () => allerAu(aujourdhui()));

// En revenant sur l'appli : on recharge (et on passe au nouveau jour après minuit)
let jourAuDepart = aujourdhui();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || $('ecranJour').hidden) return;
  const auj = aujourdhui();
  if (auj !== jourAuDepart && etat.jour === jourAuDepart) etat.jour = auj;
  jourAuDepart = auj;
  chargerJour().catch(erreur);
});

// ---------- Type de jour (repos par défaut = pas de ligne en base) ----------

async function choisirType(type) {
  if (type === etat.typeJour) return;
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

// ---------- Ajouter un aliment ----------

function ouvrirAjout(repas) {
  etat.momentAjout = repas;
  etat.alimentChoisi = null;
  $('titreAjout').textContent = 'Ajouter au ' + repas.nom;
  $('champRecherche').value = '';
  $('listeResultats').replaceChildren();
  $('etapeRecherche').hidden = false;
  $('etapeQuantite').hidden = true;
  $('feuilleAjout').showModal();
  $('champRecherche').focus();   // dans le geste de l'utilisateur : le clavier s'ouvre sur iPhone
}

$('champRecherche').addEventListener('input', () => {
  const mots = normaliser($('champRecherche').value).split(/\s+/).filter(Boolean);
  const liste = $('listeResultats');
  liste.replaceChildren();
  if (mots.length === 0) return;
  const trouves = etat.aliments
    .filter((a) => mots.every((m) => a.recherche.includes(m)))
    .sort((a, b) => (b.recherche.startsWith(mots[0]) - a.recherche.startsWith(mots[0])) || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, 40);
  if (trouves.length === 0) {
    liste.append(el('li', {}, [el('button', { disabled: '' }, [el('span', { classe: 'nom discret', texte: 'Aucun aliment trouvé' })])]));
    return;
  }
  for (const a of trouves) {
    liste.append(el('li', {}, [
      el('button', { onclick: () => choisirAliment(a) }, [
        el('span', { classe: 'nom', texte: a.nom }),
        el('span', { classe: 'valeur', texte: nombre(a.kcal) + ' kcal / 100 ' + a.unite })
      ])
    ]));
  }
});

function choisirAliment(a) {
  etat.alimentChoisi = a;
  $('nomChoisi').textContent = a.nom;
  $('uniteChoisie').textContent = a.unite;
  $('champQuantite').value = a.portion_qte ? String(a.portion_qte).replace('.', ',') : '100';
  $('etapeRecherche').hidden = true;
  $('etapeQuantite').hidden = false;
  majApercu();
  $('champQuantite').focus();
  $('champQuantite').select();
}

// Valeurs pour une quantité : valeurs pour 100 × quantité / 100
function apercu(ref, quantite, parPortion) {
  const f = parPortion ? quantite : quantite / 100;
  return nombre(ref.kcal * f) + ' kcal · P ' + nombre(ref.proteines * f, 1) + ' · G ' + nombre(ref.glucides * f, 1) +
    ' · L ' + nombre(ref.lipides * f, 1) + ' · F ' + nombre(ref.fibres * f, 1);
}

function majApercu() {
  const q = lireQuantite($('champQuantite').value);
  $('boutonAjouter').disabled = q === null;
  $('apercuAjout').textContent = q === null ? 'Quantité entre 0 et 5 000' : apercu(etat.alimentChoisi, q, false);
}
$('champQuantite').addEventListener('input', majApercu);

$('boutonRetour').addEventListener('click', () => {
  $('etapeQuantite').hidden = true;
  $('etapeRecherche').hidden = false;
  $('champRecherche').focus();
});

$('boutonAjouter').addEventListener('click', async () => {
  const a = etat.alimentChoisi;
  const q = lireQuantite($('champQuantite').value);
  if (!a || q === null) return;
  $('boutonAjouter').disabled = true;
  const { error } = await client.from('entrees').insert({
    jour: etat.jour,
    moment: etat.momentAjout.id,
    nom: a.nom,
    aliment_id: a.id,
    quantite: q,
    unite: a.unite,
    proteines_ref: a.proteines,
    glucides_ref: a.glucides,
    lipides_ref: a.lipides,
    fibres_ref: a.fibres,
    kcal_ref: a.kcal
  });
  $('boutonAjouter').disabled = false;
  if (error) return erreur(error);
  $('feuilleAjout').close();
  etat.ouvert = etat.momentAjout.id;
  chargerJour().catch(erreur);
});

// ---------- Modifier / supprimer une ligne ----------

function ouvrirLigne(ligne) {
  etat.ligneChoisie = ligne;
  $('titreLigne').textContent = ligne.nom;
  $('uniteLigne').textContent = uniteCourte(ligne.unite);
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
  const q = lireQuantite($('champQuantiteLigne').value);
  if (q === null) return;
  const { error } = await client.from('entrees').update({ quantite: q }).eq('id', etat.ligneChoisie.id);
  if (error) return erreur(error);
  $('feuilleLigne').close();
  chargerJour().catch(erreur);
});

// Suppression en deux appuis : « Supprimer » puis « Confirmer »
$('boutonSupprimerLigne').addEventListener('click', async () => {
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

// ---------- Feuilles ----------

$('boutonProfil').addEventListener('click', () => $('feuilleProfil').showModal());
for (const bouton of document.querySelectorAll('[data-fermer]')) {
  bouton.addEventListener('click', () => bouton.closest('dialog').close());
}

demarrer().catch(erreur);
