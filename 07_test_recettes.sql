-- 07_test_recettes.sql : vérifie les droits sur les recettes v2, les carnets et les photos
-- À coller dans Supabase › SQL Editor après 06_recettes_v2.sql. Ne laisse aucune trace dans les tables.
-- Le tableau final doit afficher « ok = true » sur toutes les lignes.

create temp table if not exists resultats (n serial, test text, attendu text, obtenu text, ok boolean);
truncate resultats;
grant insert on resultats to authenticated, anon;
grant usage on sequence resultats_n_seq to authenticated, anon;

do $$
declare
  emma   uuid := '353b7103-d481-4477-9105-afee50109203';
  regine uuid := 'b14c3f07-c250-4d07-904d-6bcb208abef6';
  jerome uuid := 'd8a1fe3c-3503-4ac3-bc3d-d241bb3cf7ce';
  test   uuid := '81c51e14-3512-4cdc-94e2-55594bdccd28';
  recette_emma bigint;
  carnet_commun bigint;
  carnet_regine bigint;
  nb bigint;
  obtenu text;
begin
  -- Emma ---------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', emma, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.recettes (nom, nb_portions, etapes, prep_min, cuisson_min, source_url, notes)
  values ('TEST recette v2', 7, array['Étape 1', 'Étape 2'], 20, 30, 'https://exemple.be/recette', 'Note')
  returning id into recette_emma;
  insert into resultats (test, attendu, obtenu) values ('Emma crée une recette avec étapes', 'ok', case when recette_emma is not null then 'ok' else 'non' end);

  begin
    insert into public.recettes (nom, poids_cuit) values ('TEST sans portions', 800);
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Nouvelle recette sans portions', 'refusé', obtenu);

  begin
    update public.recettes set source_url = 'javascript:alert(1)' where id = recette_emma;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Lien source qui ne commence pas par https://', 'refusé', obtenu);

  begin
    update public.recettes set photo = '999999/abcdefgh.jpg' where id = recette_emma;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Photo rangée dans le dossier d''une autre recette', 'refusé', obtenu);

  update public.recettes set photo = recette_emma || '/abcdefgh.jpg' where id = recette_emma;
  get diagnostics nb = row_count;
  insert into resultats (test, attendu, obtenu) values ('Emma met une photo à sa recette', '1', nb::text);

  insert into public.carnets (nom, commun) values ('TEST commun', true) returning id into carnet_commun;
  insert into public.carnet_recettes (carnet_id, recette_id) values (carnet_commun, recette_emma);
  insert into resultats (test, attendu, obtenu) values ('Emma crée un carnet commun et le remplit', 'ok', 'ok');

  insert into resultats (test, attendu, obtenu)
    values ('Emma peut mettre une photo dans le dossier de sa recette', 'true', prive.peut_ecrire_photo(recette_emma || '/abcdefgh.jpg')::text);
  reset role;

  -- Régine -------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', regine, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.carnets (nom, commun) values ('TEST commun Régine', true);
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Régine crée un carnet commun', 'refusé', obtenu);

  insert into public.carnets (nom) values ('TEST perso Régine') returning id into carnet_regine;
  insert into public.carnet_recettes (carnet_id, recette_id) values (carnet_regine, recette_emma);
  insert into resultats (test, attendu, obtenu) values ('Régine crée son carnet perso et y range une recette d''Emma', 'ok', 'ok');

  select count(*) into nb from public.carnets where id = carnet_commun;
  insert into resultats (test, attendu, obtenu) values ('Régine voit le carnet commun', '1', nb::text);
  select count(*) into nb from public.carnet_recettes where carnet_id = carnet_commun;
  insert into resultats (test, attendu, obtenu) values ('Régine voit les recettes du carnet commun', '1', nb::text);

  begin
    insert into public.carnet_recettes (carnet_id, recette_id) values (carnet_commun, recette_emma);
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Régine ajoute une recette au carnet commun', 'refusé', obtenu);

  delete from public.carnet_recettes where carnet_id = carnet_commun;
  get diagnostics nb = row_count;
  insert into resultats (test, attendu, obtenu) values ('Régine retire une recette du carnet commun', '0', nb::text);

  update public.carnets set nom = 'Piraté' where id = carnet_commun;
  get diagnostics nb = row_count;
  insert into resultats (test, attendu, obtenu) values ('Régine renomme le carnet commun', '0', nb::text);

  begin
    update public.carnets set commun = true where id = carnet_regine;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Régine rend son carnet commun', 'refusé', obtenu);

  update public.recettes set etapes = array['Piraté'] where id = recette_emma;
  get diagnostics nb = row_count;
  insert into resultats (test, attendu, obtenu) values ('Régine modifie les étapes d''une recette d''Emma', '0', nb::text);

  insert into resultats (test, attendu, obtenu)
    values ('Régine peut mettre une photo dans le dossier d''une recette d''Emma', 'false', prive.peut_ecrire_photo(recette_emma || '/abcdefgh.jpg')::text);
  insert into resultats (test, attendu, obtenu)
    values ('Chemin de photo bizarre (../)', 'false', prive.peut_ecrire_photo('../' || recette_emma || '/abcdefgh.jpg')::text);
  reset role;

  -- Jérôme et Emma ne voient pas le carnet perso de Régine ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', jerome, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nb from public.carnets where id = carnet_regine;
  insert into resultats (test, attendu, obtenu) values ('Jérôme voit le carnet perso de Régine', '0', nb::text);
  select count(*) into nb from public.carnet_recettes where carnet_id = carnet_regine;
  insert into resultats (test, attendu, obtenu) values ('Jérôme voit ce qu''il y a dans le carnet de Régine', '0', nb::text);
  select count(*) into nb from public.carnets where id = carnet_commun;
  insert into resultats (test, attendu, obtenu) values ('Jérôme voit le carnet commun', '1', nb::text);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', emma, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nb from public.carnets where id = carnet_regine;
  insert into resultats (test, attendu, obtenu) values ('Emma voit le carnet perso de Régine', '0', nb::text);
  delete from public.carnets where id = carnet_regine;
  get diagnostics nb = row_count;
  insert into resultats (test, attendu, obtenu) values ('Emma supprime le carnet perso de Régine', '0', nb::text);
  reset role;

  -- Compte de test (connecté, pas membre) et visiteur ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nb from public.carnets;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit des carnets', '0', nb::text);
  select count(*) into nb from public.carnet_recettes;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit le contenu des carnets', '0', nb::text);
  begin
    insert into public.carnets (nom) values ('TEST intrus');
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Compte test crée un carnet', 'refusé', obtenu);
  begin
    select count(*) into nb from storage.objects where bucket_id = 'photos-recettes';
    obtenu := nb::text;
  exception when others then obtenu := '0';   -- refusé : il ne voit rien non plus
  end;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit des photos', '0', obtenu);
  insert into resultats (test, attendu, obtenu)
    values ('Compte test peut mettre une photo', 'false', prive.peut_ecrire_photo(recette_emma || '/abcdefgh.jpg')::text);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into nb from public.carnets;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Visiteur non connecté lit les carnets', 'refusé', obtenu);
  reset role;

  -- Nettoyage (en administrateur)
  delete from public.carnets where id in (carnet_commun, carnet_regine);
  delete from public.recettes where id = recette_emma;
end;
$$;

update resultats set ok = (attendu = obtenu);
select test, attendu, obtenu, ok from resultats order by n;
