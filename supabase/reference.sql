-- =============================================================================
-- PAYEW · Reference data (safe for PRODUCTION, idempotent)
-- Programs, finance and program master lists, and global settings. Run it once
-- after `supabase db push` on a new project; re-running it changes nothing.
--
-- Not included (on purpose):
-- * locations    — import the PSA PSGC file in Settings → Master Lists → Locations
-- * fiscal years — create them in Settings → Fiscal years
-- * users        — see docs/DEPLOYMENT.md (bootstrap the first superadmin)
-- Local `supabase db reset` loads this file before seed.sql (see config.toml).
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
   'Yellow and white corn production support.', '#ca8a04')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Finance master lists (UACS codes are a sample; verify against the current
-- DBM/COA UACS manual before production use)
-- ---------------------------------------------------------------------------
insert into public.fund_sources (code, name, description, sort_order) values
  ('GAA',  'General Appropriations Act', 'Current-year GAA allotment', 1),
  ('REG',  'Regular Fund', 'Regular program funds', 2),
  ('SPF',  'Special Purpose Fund', 'Special allotments / special projects', 3),
  ('CONT', 'Continuing Appropriations', 'Prior-year unobligated balances carried over', 4)
on conflict do nothing;

insert into public.expense_classes (code, name, sort_order) values
  ('PS',   'Personnel Services', 1),
  ('MOOE', 'Maintenance and Other Operating Expenses', 2),
  ('CO',   'Capital Outlay', 3)
on conflict do nothing;

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
join public.expense_classes e on e.code = u.class_code
on conflict do nothing;

insert into public.commodities (name, category) values
  ('Rice (Inbred)', 'Cereals'), ('Rice (Hybrid)', 'Cereals'), ('Heirloom Rice', 'Cereals'),
  ('Yellow Corn', 'Cereals'), ('White Corn', 'Cereals'),
  ('Arabica Coffee', 'Industrial Crops'), ('Robusta Coffee', 'Industrial Crops'), ('Cacao', 'Industrial Crops'),
  ('Highland Vegetables', 'Vegetables'), ('Lowland Vegetables', 'Vegetables'),
  ('Strawberry', 'Fruits'), ('Banana', 'Fruits'), ('Fruit Trees', 'Fruits'),
  ('Root Crops', 'Root Crops'), ('Legumes', 'Legumes')
on conflict do nothing;

insert into public.units (name, abbreviation) values
  ('piece', 'pc'), ('kilogram', 'kg'), ('bag', 'bag'), ('sack', 'sack'), ('hectare', 'ha'),
  ('set', 'set'), ('unit', 'unit'), ('participant', 'pax'), ('lot', 'lot'), ('liter', 'L'),
  ('bottle', 'btl'), ('pack', 'pack'), ('seedling', 'sdlg'), ('head', 'hd')
on conflict do nothing;

insert into public.activity_categories (name, description)
select v.name, v.description
from (values
  ('Training / Capacity Building', 'Trainings, seminars, farmer field schools'),
  ('Distribution of Inputs', 'Seeds, fertilizers, planting materials'),
  ('Machinery and Equipment', 'Farm machinery, postharvest equipment'),
  ('Infrastructure / Facilities', 'Small-scale irrigation, nurseries, storage'),
  ('Technical Assistance', 'Field visits, on-site technical support'),
  ('Monitoring and Evaluation', 'Monitoring visits, validation, reports'),
  ('Planning and Meetings', 'Planning workshops, coordination meetings'),
  ('Techno-Demo / Research', 'Techno-demo farms, adaptive trials'),
  ('Market Linkage', 'Trade fairs, market matching')
) as v(name, description)
where not exists (select 1 from public.activity_categories c
                  where c.program_id is null and lower(c.name) = lower(v.name));

insert into public.beneficiary_types (code, name) values
  ('FA',   'Farmers'' Association'),
  ('COOP', 'Cooperative'),
  ('SLP',  'SLP Association'),
  ('IPO',  'Indigenous Peoples'' Organization'),
  ('LGU',  'Local Government Unit'),
  ('IND',  'Individual Farmer')
on conflict do nothing;

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
