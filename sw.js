// Service worker de Buon app' : l'appli s'ouvre sans réseau.
// Les données (Supabase) et Open Food Facts ne passent JAMAIS par ici : les droits restent vérifiés par Supabase.
'use strict';

const CACHE = 'buonapp-1';   // à changer si la liste ci-dessous change
const FICHIERS = [
  './', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.json',
  'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png'
];
// Bibliothèques aux versions figées : on peut garder la copie sans jamais la redemander
const CDN = ['https://cdn.jsdelivr.net/', 'https://fastly.jsdelivr.net/'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      // On garde les photos des recettes (cache « buonapp-photos », rempli par app.js)
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE && c !== 'buonapp-photos').map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const requete = ev.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) ev.respondWith(reseauDAbord(requete));
  else if (CDN.some((debut) => requete.url.startsWith(debut))) ev.respondWith(copieDAbord(requete));
  // Tout le reste (Supabase, Open Food Facts) : le navigateur s'en occupe normalement
});

// Fichiers de l'appli : toujours la dernière version, la copie seulement sans réseau (ou après 4 s)
async function reseauDAbord(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await avecDelai(fetch(requete, { cache: 'no-cache' }), 4000);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch (e) {
    const copie = await cache.match(requete, { ignoreSearch: true });
    if (copie) return copie;
    if (requete.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }
}

// Bibliothèques (versions figées) : la copie si on l'a, sinon on la télécharge et on la garde
async function copieDAbord(requete) {
  const copie = await caches.match(requete);
  if (copie) return copie;
  const reponse = await fetch(requete);
  if (reponse.ok) (await caches.open(CACHE)).put(requete, reponse.clone());
  return reponse;
}

function avecDelai(promesse, ms) {
  return Promise.race([promesse, new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('délai')), ms))]);
}
