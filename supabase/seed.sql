-- =============================================================================
-- PAYEW · Seed data (DEV ONLY)
-- Phase 1: programs, fiscal years, Cordillera locations (representative sample),
-- master lists, settings, and user accounts.
-- Later phases append activities, finance, beneficiaries, comments, etc.
--
-- Dev password for EVERY seeded account:  Payew@2026
-- Never run this file against production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
insert into public.programs (id, code, name, description, color) values
  ('10000000-0000-4000-8000-000000000001', 'AMIA', 'Adaptation and Mitigation Initiative in Agriculture',
   'Climate-resilient agriculture and AMIA villages.', '#0f766e'),
  ('10000000-0000-4000-8000-000000000002', 'APA',  'Adapting Philippine Agriculture',
   'Climate-change adaptation of farming systems and communities.', '#7c3aed'),
  ('10000000-0000-4000-8000-000000000003', 'HVC',  'High Value Crops Development Program',
   'Coffee, cacao, highland vegetables, fruit trees and other high-value crops.', '#ea580c'),
  ('10000000-0000-4000-8000-000000000004', 'RICE', 'National Rice Program',
   'Rice production support, including heirloom rice in the Cordillera terraces.', '#16a34a'),
  ('10000000-0000-4000-8000-000000000005', 'CORN', 'National Corn Program',
   'Yellow and white corn production support.', '#ca8a04');

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
-- Finance master lists (UACS codes are a sample; verify against the current
-- DBM/COA UACS manual before production use)
-- ---------------------------------------------------------------------------
insert into public.fund_sources (code, name, description, sort_order) values
  ('GAA',  'General Appropriations Act', 'Current-year GAA allotment', 1),
  ('REG',  'Regular Fund', 'Regular program funds', 2),
  ('SPF',  'Special Purpose Fund', 'Special allotments / special projects', 3),
  ('CONT', 'Continuing Appropriations', 'Prior-year unobligated balances carried over', 4);

insert into public.expense_classes (code, name, sort_order) values
  ('PS',   'Personnel Services', 1),
  ('MOOE', 'Maintenance and Other Operating Expenses', 2),
  ('CO',   'Capital Outlay', 3);

insert into public.uacs_codes (expense_class_id, code, name)
select e.id, u.code, u.name
from (values
  ('PS',   '5010101001', 'Salaries and Wages - Regular'),
  ('MOOE', '5020101000', 'Traveling Expenses - Local'),
  ('MOOE', '5020201000', 'Training Expenses'),
  ('MOOE', '5020301000', 'Office Supplies Expenses'),
  ('MOOE', '5020399000', 'Other Supplies and Materials Expenses'),
  ('MOOE', '5029999000', 'Other Maintenance and Operating Expenses'),
  ('CO',   '1060502000', 'Office Equipment'),
  ('CO',   '1060503000', 'Information and Communications Technology Equipment'),
  ('CO',   '1060504000', 'Agricultural and Forestry Equipment')
) as u(class_code, code, name)
join public.expense_classes e on e.code = u.class_code;

insert into public.commodities (name, category) values
  ('Rice (Inbred)', 'Cereals'), ('Rice (Hybrid)', 'Cereals'), ('Heirloom Rice', 'Cereals'),
  ('Yellow Corn', 'Cereals'), ('White Corn', 'Cereals'),
  ('Arabica Coffee', 'Industrial Crops'), ('Robusta Coffee', 'Industrial Crops'), ('Cacao', 'Industrial Crops'),
  ('Highland Vegetables', 'Vegetables'), ('Lowland Vegetables', 'Vegetables'),
  ('Strawberry', 'Fruits'), ('Banana', 'Fruits'), ('Fruit Trees', 'Fruits'),
  ('Root Crops', 'Root Crops'), ('Legumes', 'Legumes');

insert into public.units (name, abbreviation) values
  ('piece', 'pc'), ('kilogram', 'kg'), ('bag', 'bag'), ('sack', 'sack'), ('hectare', 'ha'),
  ('set', 'set'), ('unit', 'unit'), ('participant', 'pax'), ('lot', 'lot'), ('liter', 'L'),
  ('bottle', 'btl'), ('pack', 'pack'), ('seedling', 'sdlg'), ('head', 'hd');

insert into public.activity_categories (name, description) values
  ('Training / Capacity Building', 'Trainings, seminars, farmer field schools'),
  ('Distribution of Inputs', 'Seeds, fertilizers, planting materials'),
  ('Machinery and Equipment', 'Farm machinery, postharvest equipment'),
  ('Infrastructure / Facilities', 'Small-scale irrigation, nurseries, storage'),
  ('Technical Assistance', 'Field visits, on-site technical support'),
  ('Monitoring and Evaluation', 'Monitoring visits, validation, reports'),
  ('Planning and Meetings', 'Planning workshops, coordination meetings'),
  ('Techno-Demo / Research', 'Techno-demo farms, adaptive trials'),
  ('Market Linkage', 'Trade fairs, market matching');

insert into public.beneficiary_types (code, name) values
  ('FA',   'Farmers'' Association'),
  ('COOP', 'Cooperative'),
  ('SLP',  'SLP Association'),
  ('IPO',  'Indigenous Peoples'' Organization'),
  ('LGU',  'Local Government Unit'),
  ('IND',  'Individual Farmer');

-- ---------------------------------------------------------------------------
-- Global settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('validation_strictness', '"warn"',
   'Obligation > allotment / disbursement > obligation: "warn" or "block"'),
  ('dashboard_thresholds',
   '{"utilization": {"green": 80, "amber": 50}, "obligation_rate": {"green": 85, "amber": 60}, "disbursement_rate": {"green": 75, "amber": 50}}',
   'RAG thresholds (%) for dashboard widgets'),
  ('overdue_notice_template',
   '{"title": "Overdue activity: {title}", "body": "Activity {title} was due on {date} ({n} days overdue). Please provide a status update and revised target date.", "response_days": 5}',
   'Default composer text for "Send Overdue Notice"'),
  ('maintenance_banner', '{"enabled": false, "message": ""}', 'System-wide maintenance banner'),
  ('uploads',
   '{"max_mb": 25, "allowed_extensions": ["xlsx", "xls", "csv", "pdf", "docx", "jpg", "jpeg", "png"], "presign_ttl_seconds": 600}',
   'File upload limits'),
  ('timezone', '"Asia/Manila"', 'Display timezone')
on conflict (key) do nothing;

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
