-- 02_securite.sql : droits d'accès et règles RLS
-- À coller dans Supabase › SQL Editor après 01_tables.sql. Rejouable sans erreur.
-- Principe : un visiteur non connecté (anon) n'a accès à rien ;
-- un compte connecté qui n'est pas dans « membres » ne voit rien et ne peut rien écrire.

-- Le compte connecté est-il un membre ?
-- « security definer » : la fonction lit la table membres avec ses propres droits.
create or replace function prive.est_membre()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.membres where id = (select auth.uid()));
$$;

revoke all on schema prive from public, anon;
grant usage on schema prive to authenticated;
revoke all on function prive.est_membre() from public, anon;
grant execute on function prive.est_membre() to authenticated;
revoke all on function prive.maj_modifie_le() from public, anon, authenticated;

-- 1) On retire tous les droits, puis on donne seulement ce qu'il faut
revoke all on public.membres, public.aliments, public.recettes, public.recette_ingredients,
  public.entrees, public.jours, public.cheat_meals, public.objectifs, public.favoris
  from anon, authenticated;

-- 2) RLS sur chaque table
alter table public.membres enable row level security;
alter table public.aliments enable row level security;
alter table public.recettes enable row level security;
alter table public.recette_ingredients enable row level security;
alter table public.entrees enable row level security;
alter table public.jours enable row level security;
alter table public.cheat_meals enable row level security;
alter table public.objectifs enable row level security;
alter table public.favoris enable row level security;

-- 3) Droits colonne par colonne (personne, cree_par, dates : remplis par la base)
grant select on public.membres to authenticated;

grant select, delete on public.aliments to authenticated;
grant insert (nom, unite, proteines, glucides, lipides, fibres, kcal, categorie, code_barres, portion_nom, portion_qte, source),
      update (nom, unite, proteines, glucides, lipides, fibres, kcal, categorie, code_barres, portion_nom, portion_qte)
  on public.aliments to authenticated;

grant select, delete on public.recettes to authenticated;
grant insert (nom, nb_portions, poids_cuit), update (nom, nb_portions, poids_cuit) on public.recettes to authenticated;

grant select, delete on public.recette_ingredients to authenticated;
grant insert (recette_id, aliment_id, quantite), update (aliment_id, quantite) on public.recette_ingredients to authenticated;

grant select, delete on public.entrees to authenticated;
grant insert (jour, moment, nom, aliment_id, recette_id, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref),
      update (jour, moment, quantite)
  on public.entrees to authenticated;

grant select, delete on public.jours to authenticated;
grant insert (jour, type_jour), update (type_jour) on public.jours to authenticated;

grant select, delete on public.cheat_meals to authenticated;
grant insert (jour, moment) on public.cheat_meals to authenticated;

grant select, delete on public.objectifs to authenticated;
grant insert (type_jour, kcal, proteines, glucides, lipides), update (kcal, proteines, glucides, lipides) on public.objectifs to authenticated;

grant select, delete on public.favoris to authenticated;
grant insert (aliment_id, recette_id) on public.favoris to authenticated;

-- Compteurs des identifiants (colonnes « id ») : pas besoin d'y donner accès
revoke all on all sequences in schema public from anon, authenticated;

-- 4) Règles RLS (supprimées puis recréées pour pouvoir rejouer le script)

-- membres : chacun ne voit que sa propre ligne
drop policy if exists "voir sa ligne" on public.membres;
create policy "voir sa ligne" on public.membres for select to authenticated
  using (id = (select auth.uid()));

-- aliments et recettes : tous les membres voient tout ; on ne modifie que ce qu'on a créé
drop policy if exists "membres lisent" on public.aliments;
create policy "membres lisent" on public.aliments for select to authenticated
  using ((select prive.est_membre()));
drop policy if exists "membres ajoutent" on public.aliments;
create policy "membres ajoutent" on public.aliments for insert to authenticated
  with check ((select prive.est_membre()) and cree_par = (select auth.uid()));
drop policy if exists "auteur modifie" on public.aliments;
create policy "auteur modifie" on public.aliments for update to authenticated
  using ((select prive.est_membre()) and cree_par = (select auth.uid()))
  with check ((select prive.est_membre()) and cree_par = (select auth.uid()));
drop policy if exists "auteur supprime" on public.aliments;
create policy "auteur supprime" on public.aliments for delete to authenticated
  using ((select prive.est_membre()) and cree_par = (select auth.uid()));

drop policy if exists "membres lisent" on public.recettes;
create policy "membres lisent" on public.recettes for select to authenticated
  using ((select prive.est_membre()));
drop policy if exists "membres ajoutent" on public.recettes;
create policy "membres ajoutent" on public.recettes for insert to authenticated
  with check ((select prive.est_membre()) and cree_par = (select auth.uid()));
drop policy if exists "auteur modifie" on public.recettes;
create policy "auteur modifie" on public.recettes for update to authenticated
  using ((select prive.est_membre()) and cree_par = (select auth.uid()))
  with check ((select prive.est_membre()) and cree_par = (select auth.uid()));
drop policy if exists "auteur supprime" on public.recettes;
create policy "auteur supprime" on public.recettes for delete to authenticated
  using ((select prive.est_membre()) and cree_par = (select auth.uid()));

-- ingrédients : visibles par les membres ; modifiables par l'auteur de la recette
drop policy if exists "membres lisent" on public.recette_ingredients;
create policy "membres lisent" on public.recette_ingredients for select to authenticated
  using ((select prive.est_membre()));
drop policy if exists "auteur de la recette ecrit" on public.recette_ingredients;
create policy "auteur de la recette ecrit" on public.recette_ingredients for all to authenticated
  using ((select prive.est_membre()) and exists (
    select 1 from public.recettes r where r.id = recette_ingredients.recette_id and r.cree_par = (select auth.uid())))
  with check ((select prive.est_membre()) and exists (
    select 1 from public.recettes r where r.id = recette_ingredients.recette_id and r.cree_par = (select auth.uid())));

-- données personnelles : chacun ne voit et n'écrit que les siennes
drop policy if exists "ses donnees" on public.entrees;
create policy "ses donnees" on public.entrees for all to authenticated
  using ((select prive.est_membre()) and personne = (select auth.uid()))
  with check ((select prive.est_membre()) and personne = (select auth.uid()));

drop policy if exists "ses donnees" on public.jours;
create policy "ses donnees" on public.jours for all to authenticated
  using ((select prive.est_membre()) and personne = (select auth.uid()))
  with check ((select prive.est_membre()) and personne = (select auth.uid()));

drop policy if exists "ses donnees" on public.cheat_meals;
create policy "ses donnees" on public.cheat_meals for all to authenticated
  using ((select prive.est_membre()) and personne = (select auth.uid()))
  with check ((select prive.est_membre()) and personne = (select auth.uid()));

drop policy if exists "ses donnees" on public.objectifs;
create policy "ses donnees" on public.objectifs for all to authenticated
  using ((select prive.est_membre()) and personne = (select auth.uid()))
  with check ((select prive.est_membre()) and personne = (select auth.uid()));

drop policy if exists "ses donnees" on public.favoris;
create policy "ses donnees" on public.favoris for all to authenticated
  using ((select prive.est_membre()) and personne = (select auth.uid()))
  with check ((select prive.est_membre()) and personne = (select auth.uid()));
