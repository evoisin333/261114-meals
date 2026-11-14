-- 03_membres.sql : les comptes qui ont accès à l'appli
-- À coller dans Supabase › SQL Editor après 02_securite.sql. Rejouable sans erreur.
-- Identifiants copiés depuis Supabase › Authentication › Users (colonne « UID »).
-- Le compte de test n'est volontairement PAS dans cette liste : il ne doit rien voir.
insert into public.membres (id, prenom) values
  ('353b7103-d481-4477-9105-afee50109203', 'Emma'),
  ('b14c3f07-c250-4d07-904d-6bcb208abef6', 'Régine'),
  ('d8a1fe3c-3503-4ac3-bc3d-d241bb3cf7ce', 'Jérôme')
on conflict (id) do update set prenom = excluded.prenom;

-- Vérification : doit afficher les 3 prénoms
select prenom from public.membres order by prenom;
