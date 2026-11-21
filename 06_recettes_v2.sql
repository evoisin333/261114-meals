-- 06_recettes_v2.sql : recettes comme dans ReciMe (photo, étapes, temps, source, notes) + carnets
-- À coller dans Supabase › SQL Editor après 05_test_securite.sql. Rejouable sans erreur.
-- ⚠️ Si tu relances 02_securite.sql, relance ensuite ce script : 02 remet les droits de départ
--    et oublie les colonnes et les tables ajoutées ici.

-- 1) Nouvelles colonnes des recettes ---------------------------------------------------------

alter table public.recettes add column if not exists photo text;            -- chemin dans le stockage
alter table public.recettes add column if not exists etapes text[] not null default '{}';
alter table public.recettes add column if not exists prep_min integer;
alter table public.recettes add column if not exists cuisson_min integer;
alter table public.recettes add column if not exists source_url text;
alter table public.recettes add column if not exists notes text;

-- Contraintes (supprimées puis recréées pour pouvoir rejouer le script)
alter table public.recettes drop constraint if exists photo_valide;
alter table public.recettes add constraint photo_valide
  check (photo is null or photo ~ ('^' || id || '/[a-z0-9-]{8,64}\.jpg$'));   -- « 12/xxxx.jpg » : dossier = la recette
alter table public.recettes drop constraint if exists etapes_valides;
alter table public.recettes add constraint etapes_valides
  check (cardinality(etapes) <= 40 and char_length(array_to_string(etapes, '')) <= 20000);
alter table public.recettes drop constraint if exists temps_valides;
alter table public.recettes add constraint temps_valides
  check ((prep_min is null or prep_min between 0 and 1440) and (cuisson_min is null or cuisson_min between 0 and 1440));
alter table public.recettes drop constraint if exists source_valide;
alter table public.recettes add constraint source_valide
  check (source_url is null or (source_url ~ '^https://[^\s]+$' and char_length(source_url) <= 500));
alter table public.recettes drop constraint if exists notes_valides;
alter table public.recettes add constraint notes_valides
  check (notes is null or char_length(notes) <= 2000);

-- Toutes les recettes ont maintenant un nombre de portions (le poids cuit reste facultatif).
-- « not valid » : les anciennes recettes sans portions restent, mais il faudra en mettre
-- dès qu'on les modifie. Les nouvelles recettes en ont toujours.
alter table public.recettes drop constraint if exists portions_obligatoires;
alter table public.recettes add constraint portions_obligatoires check (nb_portions is not null) not valid;

-- 2) Qui gère les carnets communs ------------------------------------------------------------

alter table public.membres add column if not exists gere_carnets_communs boolean not null default false;
update public.membres set gere_carnets_communs = (id = '353b7103-d481-4477-9105-afee50109203');   -- Emma seule

create or replace function prive.gere_communs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.membres where id = (select auth.uid()) and gere_carnets_communs);
$$;
revoke all on function prive.gere_communs() from public, anon;
grant execute on function prive.gere_communs() to authenticated;

-- 3) Carnets ---------------------------------------------------------------------------------

-- Un carnet est commun (vu par tous, géré par Emma) ou perso (vu par son propriétaire seulement)
create table if not exists public.carnets (
  id bigint generated always as identity primary key,
  nom text not null check (char_length(nom) between 1 and 60 and nom = btrim(nom)),
  commun boolean not null default false,
  proprietaire uuid not null default auth.uid() references public.membres (id) on delete cascade,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
-- Pas deux carnets communs du même nom, ni deux carnets perso du même nom chez la même personne
create unique index if not exists carnets_communs_nom on public.carnets (lower(nom)) where commun;
create unique index if not exists carnets_perso_nom on public.carnets (proprietaire, lower(nom)) where not commun;

-- Une recette peut être dans plusieurs carnets
create table if not exists public.carnet_recettes (
  carnet_id bigint not null references public.carnets (id) on delete cascade,
  recette_id bigint not null references public.recettes (id) on delete cascade,
  ajoute_le timestamptz not null default now(),
  primary key (carnet_id, recette_id)
);
create index if not exists carnet_recettes_recette on public.carnet_recettes (recette_id);

drop trigger if exists maj_modifie_le on public.carnets;
create trigger maj_modifie_le before update on public.carnets
  for each row execute function prive.maj_modifie_le();

-- 4) Droits ----------------------------------------------------------------------------------

revoke all on public.carnets, public.carnet_recettes from anon, authenticated;
alter table public.carnets enable row level security;
alter table public.carnet_recettes enable row level security;

-- Recettes : les nouvelles colonnes s'écrivent comme les autres (l'auteur seul, voir 02)
grant insert (nom, nb_portions, poids_cuit, photo, etapes, prep_min, cuisson_min, source_url, notes),
      update (nom, nb_portions, poids_cuit, photo, etapes, prep_min, cuisson_min, source_url, notes)
  on public.recettes to authenticated;

-- Carnets : on choisit « commun » à la création, on ne peut ensuite changer que le nom
grant select, delete on public.carnets to authenticated;
grant insert (nom, commun), update (nom) on public.carnets to authenticated;
grant select, delete on public.carnet_recettes to authenticated;
grant insert (carnet_id, recette_id) on public.carnet_recettes to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 5) Règles RLS ------------------------------------------------------------------------------

-- carnets : je vois les communs et les miens ; j'écris dans les miens (et dans les communs si je les gère)
drop policy if exists "voir communs et les siens" on public.carnets;
create policy "voir communs et les siens" on public.carnets for select to authenticated
  using ((select prive.est_membre()) and (commun or proprietaire = (select auth.uid())));
drop policy if exists "creer" on public.carnets;
create policy "creer" on public.carnets for insert to authenticated
  with check ((select prive.est_membre()) and proprietaire = (select auth.uid())
              and (not commun or (select prive.gere_communs())));
drop policy if exists "modifier les siens" on public.carnets;
create policy "modifier les siens" on public.carnets for update to authenticated
  using ((select prive.est_membre()) and proprietaire = (select auth.uid())
         and (not commun or (select prive.gere_communs())))
  with check ((select prive.est_membre()) and proprietaire = (select auth.uid())
              and (not commun or (select prive.gere_communs())));
drop policy if exists "supprimer les siens" on public.carnets;
create policy "supprimer les siens" on public.carnets for delete to authenticated
  using ((select prive.est_membre()) and proprietaire = (select auth.uid())
         and (not commun or (select prive.gere_communs())));

-- contenu des carnets : visible si le carnet l'est ; modifiable par qui peut modifier le carnet
drop policy if exists "voir" on public.carnet_recettes;
create policy "voir" on public.carnet_recettes for select to authenticated
  using ((select prive.est_membre()) and exists (
    select 1 from public.carnets c
    where c.id = carnet_recettes.carnet_id and (c.commun or c.proprietaire = (select auth.uid()))));
drop policy if exists "ajouter" on public.carnet_recettes;
create policy "ajouter" on public.carnet_recettes for insert to authenticated
  with check ((select prive.est_membre()) and exists (
    select 1 from public.carnets c
    where c.id = carnet_recettes.carnet_id and c.proprietaire = (select auth.uid())
      and (not c.commun or (select prive.gere_communs()))));
drop policy if exists "retirer" on public.carnet_recettes;
create policy "retirer" on public.carnet_recettes for delete to authenticated
  using ((select prive.est_membre()) and exists (
    select 1 from public.carnets c
    where c.id = carnet_recettes.carnet_id and c.proprietaire = (select auth.uid())
      and (not c.commun or (select prive.gere_communs()))));

-- 6) Photos des recettes (Supabase Storage) --------------------------------------------------

-- Espace privé : 2 Mo par photo au plus, JPEG seulement (l'appli réduit la photo avant l'envoi)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-recettes', 'photos-recettes', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Le chemin « 12/xxxx.jpg » est-il dans le dossier d'une recette dont je suis l'auteur ?
create or replace function prive.peut_ecrire_photo(chemin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when chemin ~ '^[0-9]{1,18}/[a-z0-9-]{8,64}\.jpg$' then
      prive.est_membre() and exists (
        select 1 from public.recettes r
        where r.id = split_part(chemin, '/', 1)::bigint and r.cree_par = (select auth.uid()))
    else false
  end;
$$;
revoke all on function prive.peut_ecrire_photo(text) from public, anon;
grant execute on function prive.peut_ecrire_photo(text) to authenticated;

-- Tous les membres voient les photos ; seul l'auteur de la recette ajoute, remplace ou supprime
drop policy if exists "photos : membres lisent" on storage.objects;
create policy "photos : membres lisent" on storage.objects for select to authenticated
  using (bucket_id = 'photos-recettes' and (select prive.est_membre()));
drop policy if exists "photos : auteur ajoute" on storage.objects;
create policy "photos : auteur ajoute" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos-recettes' and prive.peut_ecrire_photo(name));
drop policy if exists "photos : auteur remplace" on storage.objects;
create policy "photos : auteur remplace" on storage.objects for update to authenticated
  using (bucket_id = 'photos-recettes' and prive.peut_ecrire_photo(name))
  with check (bucket_id = 'photos-recettes' and prive.peut_ecrire_photo(name));
drop policy if exists "photos : auteur supprime" on storage.objects;
create policy "photos : auteur supprime" on storage.objects for delete to authenticated
  using (bucket_id = 'photos-recettes' and prive.peut_ecrire_photo(name));

-- Vérification : doit afficher le bucket privé et « Emma | true »
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos-recettes';
select prenom, gere_carnets_communs from public.membres order by prenom;
