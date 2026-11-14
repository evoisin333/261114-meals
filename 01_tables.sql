-- 01_tables.sql : création des tables
-- À coller dans Supabase › SQL Editor. Rejouable sans erreur.

-- Schéma privé : invisible pour l'API (fonctions internes)
create schema if not exists prive;

-- Met à jour la colonne modifie_le à chaque modification
create or replace function prive.maj_modifie_le()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

-- Membres : les seuls comptes qui ont accès à l'appli
create table if not exists public.membres (
  id uuid primary key references auth.users (id) on delete cascade,
  prenom text not null check (char_length(prenom) between 1 and 40)
);

-- Base d'aliments commune (valeurs pour 100 g ou pour 100 ml)
create table if not exists public.aliments (
  id bigint generated always as identity primary key,
  nom text not null check (char_length(nom) between 1 and 120 and nom = btrim(nom)),
  unite text not null default 'g' check (unite in ('g', 'ml')),
  proteines numeric(6,2) not null default 0 check (proteines between 0 and 100),
  glucides numeric(6,2) not null default 0 check (glucides between 0 and 100),
  lipides numeric(6,2) not null default 0 check (lipides between 0 and 100),
  fibres numeric(6,2) not null default 0 check (fibres between 0 and 100),
  kcal numeric(6,1) not null check (kcal between 0 and 900),
  categorie text check (char_length(categorie) <= 60),
  code_barres text unique check (code_barres ~ '^[0-9]{8,14}$'),
  portion_nom text check (char_length(portion_nom) between 1 and 40),   -- ex. « 1 tranche »
  portion_qte numeric(7,1) check (portion_qte > 0),                     -- ex. 35 (g ou ml)
  source text not null default 'manuel' check (source in ('excel', 'manuel', 'openfoodfacts')),
  cree_par uuid default auth.uid() references public.membres (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  constraint portion_complete check ((portion_nom is null) = (portion_qte is null))
);
-- Pas deux aliments avec le même nom (majuscules ignorées)
create unique index if not exists aliments_nom_unique on public.aliments (lower(nom));

-- Recettes communes (ex. sauce bolo) : nombre de portions et/ou poids du plat cuit
create table if not exists public.recettes (
  id bigint generated always as identity primary key,
  nom text not null check (char_length(nom) between 1 and 120 and nom = btrim(nom)),
  nb_portions numeric(5,1) check (nb_portions > 0),
  poids_cuit numeric(7,1) check (poids_cuit > 0),          -- en grammes
  cree_par uuid default auth.uid() references public.membres (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  constraint portions_ou_poids check (nb_portions is not null or poids_cuit is not null)
);
create unique index if not exists recettes_nom_unique on public.recettes (lower(nom));

create table if not exists public.recette_ingredients (
  id bigint generated always as identity primary key,
  recette_id bigint not null references public.recettes (id) on delete cascade,
  aliment_id bigint not null references public.aliments (id) on delete restrict,
  quantite numeric(7,1) not null check (quantite > 0),     -- dans l'unité de l'aliment
  unique (recette_id, aliment_id)
);
create index if not exists recette_ingredients_aliment on public.recette_ingredients (aliment_id);

-- Journal : une ligne = un aliment (ou une recette) mangé à un moment de la journée
create table if not exists public.entrees (
  id bigint generated always as identity primary key,
  personne uuid not null default auth.uid() references public.membres (id) on delete cascade,
  jour date not null,                                      -- date locale (Bruxelles)
  moment text not null check (moment in (
    'dejeuner', 'grignotage_matin', 'diner', 'grignotage_apres_midi',
    'quatre_heures', 'grignotage_apres_gouter', 'souper', 'grignotage_soir')),
  nom text not null check (char_length(nom) between 1 and 120),
  aliment_id bigint references public.aliments (id) on delete set null,
  recette_id bigint references public.recettes (id) on delete set null,
  quantite numeric(7,1) not null check (quantite > 0 and quantite <= 5000),
  unite text not null check (unite in ('g', 'ml', 'portion')),
  -- Valeurs copiées au moment de l'encodage : pour 100 g / 100 ml, ou pour 1 portion
  proteines_ref numeric(7,2) not null check (proteines_ref >= 0),
  glucides_ref numeric(7,2) not null check (glucides_ref >= 0),
  lipides_ref numeric(7,2) not null check (lipides_ref >= 0),
  fibres_ref numeric(7,2) not null check (fibres_ref >= 0),
  kcal_ref numeric(7,1) not null check (kcal_ref >= 0),
  -- Totaux de la ligne, calculés par la base
  proteines numeric generated always as (round(proteines_ref * case when unite = 'portion' then quantite else quantite / 100 end, 2)) stored,
  glucides numeric generated always as (round(glucides_ref * case when unite = 'portion' then quantite else quantite / 100 end, 2)) stored,
  lipides numeric generated always as (round(lipides_ref * case when unite = 'portion' then quantite else quantite / 100 end, 2)) stored,
  fibres numeric generated always as (round(fibres_ref * case when unite = 'portion' then quantite else quantite / 100 end, 2)) stored,
  kcal numeric generated always as (round(kcal_ref * case when unite = 'portion' then quantite else quantite / 100 end, 1)) stored,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  constraint aliment_ou_recette check (num_nonnulls(aliment_id, recette_id) <= 1)
);
create index if not exists entrees_personne_jour on public.entrees (personne, jour);
create index if not exists entrees_aliment on public.entrees (aliment_id);
create index if not exists entrees_recette on public.entrees (recette_id);

-- Type de jour (repos par défaut s'il n'y a pas de ligne)
create table if not exists public.jours (
  personne uuid not null default auth.uid() references public.membres (id) on delete cascade,
  jour date not null,
  type_jour text not null default 'repos' check (type_jour in ('repos', 'entrainement')),
  modifie_le timestamptz not null default now(),
  primary key (personne, jour)
);

-- Cheat meals : seulement sur les 4 repas principaux
create table if not exists public.cheat_meals (
  personne uuid not null default auth.uid() references public.membres (id) on delete cascade,
  jour date not null,
  moment text not null check (moment in ('dejeuner', 'diner', 'quatre_heures', 'souper')),
  cree_le timestamptz not null default now(),
  primary key (personne, jour, moment)
);

-- Objectifs de chaque personne, par type de jour
create table if not exists public.objectifs (
  personne uuid not null default auth.uid() references public.membres (id) on delete cascade,
  type_jour text not null check (type_jour in ('repos', 'entrainement')),
  kcal numeric(5,0) not null check (kcal between 0 and 10000),
  proteines numeric(4,0) not null check (proteines between 0 and 1000),
  glucides numeric(4,0) not null check (glucides between 0 and 1000),
  lipides numeric(4,0) not null check (lipides between 0 and 1000),
  modifie_le timestamptz not null default now(),
  primary key (personne, type_jour)
);

-- Favoris de chaque personne : un aliment ou une recette
create table if not exists public.favoris (
  id bigint generated always as identity primary key,
  personne uuid not null default auth.uid() references public.membres (id) on delete cascade,
  aliment_id bigint references public.aliments (id) on delete cascade,
  recette_id bigint references public.recettes (id) on delete cascade,
  constraint un_seul_favori check (num_nonnulls(aliment_id, recette_id) = 1),
  unique (personne, aliment_id),
  unique (personne, recette_id)
);
create index if not exists favoris_aliment on public.favoris (aliment_id);
create index if not exists favoris_recette on public.favoris (recette_id);

-- Déclencheurs « modifie_le »
drop trigger if exists maj_modifie_le on public.aliments;
create trigger maj_modifie_le before update on public.aliments
  for each row execute function prive.maj_modifie_le();
drop trigger if exists maj_modifie_le on public.recettes;
create trigger maj_modifie_le before update on public.recettes
  for each row execute function prive.maj_modifie_le();
drop trigger if exists maj_modifie_le on public.entrees;
create trigger maj_modifie_le before update on public.entrees
  for each row execute function prive.maj_modifie_le();
drop trigger if exists maj_modifie_le on public.jours;
create trigger maj_modifie_le before update on public.jours
  for each row execute function prive.maj_modifie_le();
drop trigger if exists maj_modifie_le on public.objectifs;
create trigger maj_modifie_le before update on public.objectifs
  for each row execute function prive.maj_modifie_le();
