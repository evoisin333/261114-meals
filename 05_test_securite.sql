-- 05_test_securite.sql : vérifie les droits de chaque compte
-- À coller dans Supabase › SQL Editor après 04_aliments.sql. Ne laisse aucune trace dans les tables.
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
  membre record;
  nb_aliments bigint;
  un_aliment_emma bigint;
  nb bigint;
  obtenu text;
begin
  -- Préparation (en administrateur)
  select count(*) into nb_aliments from public.aliments;
  select min(id) into un_aliment_emma from public.aliments where cree_par = emma;

  -- Tests pour chaque membre
  for membre in select * from (values (emma, 'Emma'), (regine, 'Régine'), (jerome, 'Jérôme')) as m (id, prenom) loop
    perform set_config('request.jwt.claims', json_build_object('sub', membre.id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into nb from public.aliments;
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' voit les aliments', nb_aliments::text, nb::text);

    begin
      insert into public.entrees (jour, moment, nom, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref)
      values (date '2000-01-01', 'diner', 'TEST', 150, 'g', 1, 1, 1, 0, 17);
      obtenu := 'ok';
    exception when others then obtenu := 'refusé : ' || sqlerrm;
    end;
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' écrit dans son journal', 'ok', obtenu);

    begin
      insert into public.entrees (personne, jour, moment, nom, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref)
      values (case when membre.id = emma then regine else emma end, date '2000-01-01', 'diner', 'TEST', 100, 'g', 1, 1, 1, 0, 17);
      obtenu := 'accepté';
    exception when others then obtenu := 'refusé';
    end;
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' écrit dans le journal d''un autre', 'refusé', obtenu);

    update public.aliments set kcal = kcal where id = un_aliment_emma;
    get diagnostics nb = row_count;
    insert into resultats (test, attendu, obtenu)
      values (membre.prenom || ' modifie un aliment créé par Emma', case when membre.id = emma then '1' else '0' end, nb::text);

    reset role;
  end loop;

  -- Chaque membre a maintenant une ligne de test : personne ne doit voir celles des autres
  for membre in select * from (values (emma, 'Emma'), (regine, 'Régine'), (jerome, 'Jérôme')) as m (id, prenom) loop
    perform set_config('request.jwt.claims', json_build_object('sub', membre.id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into nb from public.entrees where personne <> membre.id;
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' voit le journal des autres', '0', nb::text);

    update public.entrees set quantite = quantite where personne <> membre.id;
    get diagnostics nb = row_count;
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' modifie le journal des autres', '0', nb::text);

    select kcal::text into obtenu from public.entrees where personne = membre.id and nom = 'TEST';
    insert into resultats (test, attendu, obtenu) values (membre.prenom || ' : total calculé (150 g à 17 kcal/100 g)', '25.5', obtenu);

    reset role;
  end loop;

  -- Compte de test (connecté, mais pas membre)
  perform set_config('request.jwt.claims', json_build_object('sub', test, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into nb from public.aliments;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit les aliments', '0', nb::text);
  select count(*) into nb from public.entrees;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit des journaux', '0', nb::text);
  select count(*) into nb from public.membres;
  insert into resultats (test, attendu, obtenu) values ('Compte test voit les membres', '0', nb::text);

  begin
    insert into public.aliments (nom, kcal) values ('TEST intrus', 1);
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Compte test ajoute un aliment', 'refusé', obtenu);

  begin
    insert into public.entrees (jour, moment, nom, quantite, unite, proteines_ref, glucides_ref, lipides_ref, fibres_ref, kcal_ref)
    values (date '2000-01-01', 'diner', 'TEST', 100, 'g', 1, 1, 1, 0, 17);
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Compte test écrit dans un journal', 'refusé', obtenu);
  reset role;

  -- Visiteur non connecté
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into nb from public.aliments;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Visiteur non connecté lit les aliments', 'refusé', obtenu);
  begin
    select count(*) into nb from public.entrees;
    obtenu := 'accepté';
  exception when others then obtenu := 'refusé';
  end;
  insert into resultats (test, attendu, obtenu) values ('Visiteur non connecté lit les journaux', 'refusé', obtenu);
  reset role;

  -- Nettoyage : on efface les lignes de test
  delete from public.entrees where jour = date '2000-01-01' and nom = 'TEST';
end;
$$;

update resultats set ok = (attendu = obtenu);
select test, attendu, obtenu, ok from resultats order by n;
