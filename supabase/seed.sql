-- =============================================================================
-- PAYEW · Seed data (DEV ONLY)
-- Runs after reference.sql (programs, master lists, settings). Adds fiscal years,
-- a representative sample of Cordillera locations and the demo user accounts.
-- Later phases append activities, finance, beneficiaries, comments, etc.
--
-- Dev password for EVERY seeded account:  Payew@2026
-- Never run this file against production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fiscal years
-- ---------------------------------------------------------------------------
insert into public.fiscal_years (id, year, label, start_date, end_date, status, is_current) values
  ('20000000-0000-4000-8000-000000002025', 2025, 'FY 2025', '2025-01-01', '2025-12-31', 'closed', false),
  ('20000000-0000-4000-8000-000000002026', 2026, 'FY 2026', '2026-01-01', '2026-12-31', 'open',   true),
  ('20000000-0000-4000-8000-000000002027', 2027, 'FY 2027', '2027-01-01', '2027-12-31', 'draft',  false);

-- ---------------------------------------------------------------------------
-- Locations (representative sample; extend in Settings → Master Lists)
-- ---------------------------------------------------------------------------
insert into public.provinces (name, is_city, sort_order) values
  ('Abra', false, 1),
  ('Apayao', false, 2),
  ('Benguet', false, 3),
  ('Ifugao', false, 4),
  ('Kalinga', false, 5),
  ('Mountain Province', false, 6),
  ('Baguio City', true, 7);

insert into public.municipalities (province_id, name, is_city)
select p.id, m.name, m.is_city
from (values
  ('Abra', 'Bangued', false), ('Abra', 'Bucay', false), ('Abra', 'Dolores', false),
  ('Abra', 'La Paz', false), ('Abra', 'Tayum', false),
  ('Apayao', 'Kabugao', false), ('Apayao', 'Conner', false), ('Apayao', 'Flora', false),
  ('Apayao', 'Luna', false), ('Apayao', 'Pudtol', false),
  ('Benguet', 'La Trinidad', false), ('Benguet', 'Atok', false), ('Benguet', 'Buguias', false),
  ('Benguet', 'Kabayan', false), ('Benguet', 'Mankayan', false), ('Benguet', 'Tuba', false),
  ('Ifugao', 'Lagawe', false), ('Ifugao', 'Banaue', false), ('Ifugao', 'Kiangan', false),
  ('Ifugao', 'Hungduan', false), ('Ifugao', 'Mayoyao', false),
  ('Kalinga', 'Tabuk City', true), ('Kalinga', 'Lubuagan', false), ('Kalinga', 'Pinukpuk', false),
  ('Kalinga', 'Rizal', false), ('Kalinga', 'Tanudan', false),
  ('Mountain Province', 'Bontoc', false), ('Mountain Province', 'Sagada', false),
  ('Mountain Province', 'Bauko', false), ('Mountain Province', 'Besao', false),
  ('Mountain Province', 'Sabangan', false),
  ('Baguio City', 'Baguio City', true)
) as m(province, name, is_city)
join public.provinces p on p.name = m.province;

insert into public.barangays (municipality_id, name)
select mu.id, b.name
from (values
  ('La Trinidad', 'Balili'), ('La Trinidad', 'Betag'), ('La Trinidad', 'Pico'),
  ('La Trinidad', 'Puguis'), ('La Trinidad', 'Wangal'),
  ('Buguias', 'Abatan'), ('Buguias', 'Loo'), ('Buguias', 'Sebang'),
  ('Atok', 'Paoay'), ('Atok', 'Caliking'),
  ('Banaue', 'Poblacion'), ('Banaue', 'Batad'), ('Banaue', 'Bangaan'),
  ('Kiangan', 'Poblacion'), ('Kiangan', 'Nagacadan'),
  ('Bontoc', 'Poblacion'), ('Bontoc', 'Samoki'), ('Bontoc', 'Caluttit'),
  ('Sagada', 'Poblacion'), ('Sagada', 'Fidelisan'),
  ('Tabuk City', 'Bulanao'), ('Tabuk City', 'Dagupan Centro'), ('Tabuk City', 'Magsaysay'),
  ('Bangued', 'Zone 1 Poblacion'), ('Bangued', 'Calaba'),
  ('Kabugao', 'Poblacion'), ('Kabugao', 'Lucab'),
  ('Luna', 'San Isidro'), ('Luna', 'Santa Marcela'),
  ('Baguio City', 'Irisan'), ('Baguio City', 'Loakan Proper'), ('Baguio City', 'Camp 7')
) as b(municipality, name)
join public.municipalities mu on mu.name = b.municipality;

-- ---------------------------------------------------------------------------
-- Users (auth.users → handle_new_user → profiles + program_memberships)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'superadmin@payew.local',  'Elena Bagangan',     'Chief, Field Operations Division', 'superadmin',    null,   false),
      ('00000000-0000-4000-8000-000000000101'::uuid, 'amia.admin@payew.local',  'Jerome Palangdan',   'AMIA Regional Focal Person',       'program_admin', 'AMIA', false),
      ('00000000-0000-4000-8000-000000000102'::uuid, 'amia.staff1@payew.local', 'Liza Ayangwa',       'Agriculturist II',                 'program_staff', 'AMIA', false),
      ('00000000-0000-4000-8000-000000000103'::uuid, 'amia.staff2@payew.local', 'Mark Dalog',         'Science Research Specialist I',    'program_staff', 'AMIA', true),
      ('00000000-0000-4000-8000-000000000201'::uuid, 'apa.admin@payew.local',   'Grace Lumiwes',      'APA Regional Focal Person',        'program_admin', 'APA',  false),
      ('00000000-0000-4000-8000-000000000202'::uuid, 'apa.staff1@payew.local',  'Noel Bayawa',        'Agriculturist I',                  'program_staff', 'APA',  false),
      ('00000000-0000-4000-8000-000000000203'::uuid, 'apa.staff2@payew.local',  'Joy Pacio',          'Administrative Assistant II',      'program_staff', 'APA',  false),
      ('00000000-0000-4000-8000-000000000301'::uuid, 'hvc.admin@payew.local',   'Ramon Tayaban',      'HVCDP Regional Coordinator',       'program_admin', 'HVC',  false),
      ('00000000-0000-4000-8000-000000000302'::uuid, 'hvc.staff1@payew.local',  'Carla Bugtong',      'Agriculturist II',                 'program_staff', 'HVC',  false),
      ('00000000-0000-4000-8000-000000000303'::uuid, 'hvc.staff2@payew.local',  'Dennis Ognayon',     'Agricultural Technologist',        'program_staff', 'HVC',  false),
      ('00000000-0000-4000-8000-000000000401'::uuid, 'rice.admin@payew.local',  'Teresita Bulayo',    'Rice Program Regional Coordinator','program_admin', 'RICE', false),
      ('00000000-0000-4000-8000-000000000402'::uuid, 'rice.staff1@payew.local', 'Arnel Dumalo',       'Agriculturist I',                  'program_staff', 'RICE', false),
      ('00000000-0000-4000-8000-000000000403'::uuid, 'rice.staff2@payew.local', 'Mylene Kitongan',    'Administrative Officer I',         'program_staff', 'RICE', false),
      ('00000000-0000-4000-8000-000000000501'::uuid, 'corn.admin@payew.local',  'Victor Agustin',     'Corn Program Regional Coordinator','program_admin', 'CORN', false),
      ('00000000-0000-4000-8000-000000000502'::uuid, 'corn.staff1@payew.local', 'Bea Liwanen',        'Agriculturist I',                  'program_staff', 'CORN', false),
      ('00000000-0000-4000-8000-000000000503'::uuid, 'corn.staff2@payew.local', 'Paolo Saguid',       'Agricultural Technologist',        'program_staff', 'CORN', false)
    ) as t(id, email, full_name, position, app_role, program_code, must_change)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
      extensions.crypt('Payew@2026', extensions.gen_salt('bf')), now(),
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'app_role', r.app_role, 'program_code', r.program_code, 'must_change_password', r.must_change
      ),
      jsonb_build_object('full_name', r.full_name, 'position', r.position),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), r.id, r.id::text,
      jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end;
$$;

-- Office/province details for a few profiles.
update public.profiles p
set office = 'DA-CAR Field Operations Division',
    province_id = (select id from public.provinces where name = 'Benguet')
where p.role in ('superadmin', 'program_admin');

-- Welcome notifications so the bell has content.
insert into public.notifications (user_id, program_id, type, title, body, link)
select p.id, p.program_id, 'system',
       'Welcome to PAYEW',
       'Start with the User Guide to learn how programs, activities and budgets are tracked.',
       '/guide'
from public.profiles p;

insert into public.notifications (user_id, program_id, type, title, body, link)
select p.id, p.program_id, 'system',
       'FY 2026 is open',
       'Encode your FY 2026 PPMP, WFP and APP in the Finance module.',
       '/finance'
from public.profiles p
where p.role <> 'program_staff';
