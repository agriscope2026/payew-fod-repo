-- =============================================================================
-- PAYEW · DEV seed · Phase 4 · Beneficiaries / Farmers' Associations
-- Fictional organizations across the Cordillera. Coordinates are approximate
-- town centers. Safe to re-run (fixed ids + ON CONFLICT DO NOTHING), so it can
-- also be pasted into the SQL Editor of an already-seeded project.
-- =============================================================================

insert into public.beneficiaries (
  id, registered_by_program_id, type_id, name, registration_no, registration_agency,
  province_id, municipality_id, barangay_id, contact_person, contact_no,
  members_male, members_female, members_ip, members_youth, members_pwd, members_senior,
  area_ha, status, latitude, longitude
)
select v.id::uuid, pr.id, bt.id, v.name, v.reg_no, v.agency,
       pv.id, mu.id, br.id, v.contact, v.phone,
       v.m, v.f, v.ip, v.youth, v.pwd, v.senior,
       v.area, v.status, v.lat, v.lng
from (values
  ('30000000-0000-4000-8000-000000000001', 'HVC',  'FA',   'Buguias Highland Vegetable Growers Association', 'DOLE-CAR-2018-0412', 'DOLE', 'Benguet', 'Buguias', 'Abatan', 'Rodel Pacio', '0917 555 0101', 48, 37, 80, 12, 1, 9, 62.50, 'active', 16.7220, 120.8330),
  ('30000000-0000-4000-8000-000000000002', 'HVC',  'FA',   'Atok Strawberry and Vegetable Farmers Association', 'DOLE-CAR-2019-0108', 'DOLE', 'Benguet', 'Atok', 'Paoay', 'Marites Bacbac', '0918 555 0102', 31, 29, 55, 8, 0, 6, 38.00, 'active', 16.5810, 120.7000),
  ('30000000-0000-4000-8000-000000000003', 'HVC',  'COOP', 'La Trinidad Strawberry Farmers Cooperative', 'CDA-9520-2015-0031', 'CDA', 'Benguet', 'La Trinidad', 'Betag', 'Arthur Dangwa', '0919 555 0103', 66, 74, 98, 15, 2, 21, 45.75, 'active', 16.4550, 120.5870),
  ('30000000-0000-4000-8000-000000000004', 'HVC',  'FA',   'Kabayan Arabica Coffee Growers Association', null, null, 'Benguet', 'Kabayan', null, 'Lorna Ekid', '0920 555 0104', 22, 25, 47, 5, 1, 7, 30.00, 'active', 16.6230, 120.8490),
  ('30000000-0000-4000-8000-000000000005', 'AMIA', 'FA',   'Mankayan Organic Farmers Association', 'DOLE-CAR-2021-0233', 'DOLE', 'Benguet', 'Mankayan', null, 'Felix Banggawan', '0921 555 0105', 19, 21, 38, 9, 0, 3, 18.20, 'active', 16.8630, 120.7930),
  ('30000000-0000-4000-8000-000000000006', 'RICE', 'FA',   'Batad Rice Terraces Farmers Association', 'DOLE-CAR-2017-0077', 'DOLE', 'Ifugao', 'Banaue', 'Batad', 'Jose Dulnuan', '0922 555 0106', 41, 36, 77, 6, 1, 18, 25.40, 'active', 16.9130, 121.0610),
  ('30000000-0000-4000-8000-000000000007', 'RICE', 'COOP', 'Kiangan Heirloom Rice Producers Cooperative', 'CDA-9520-2016-0112', 'CDA', 'Ifugao', 'Kiangan', 'Nagacadan', 'Esther Ngohayon', '0923 555 0107', 35, 44, 79, 10, 0, 14, 33.10, 'active', 16.7800, 121.0900),
  ('30000000-0000-4000-8000-000000000008', 'CORN', 'FA',   'Lagawe Integrated Farmers Association', null, null, 'Ifugao', 'Lagawe', null, 'Benito Hangdaan', '0924 555 0108', 27, 18, 40, 7, 0, 4, 52.00, 'active', 16.8000, 121.1200),
  ('30000000-0000-4000-8000-000000000009', 'AMIA', 'FA',   'Samoki Farmers and Weavers Association', 'DOLE-CAR-2020-0190', 'DOLE', 'Mountain Province', 'Bontoc', 'Samoki', 'Gloria Fagyan', '0925 555 0109', 14, 33, 47, 4, 1, 11, 12.60, 'active', 17.0900, 120.9770),
  ('30000000-0000-4000-8000-000000000010', 'HVC',  'FA',   'Sagada Arabica Coffee Farmers Association', 'DOLE-CAR-2018-0388', 'DOLE', 'Mountain Province', 'Sagada', 'Fidelisan', 'Clifford Dao-ines', '0926 555 0110', 38, 30, 68, 11, 0, 8, 41.30, 'active', 17.0800, 120.9000),
  ('30000000-0000-4000-8000-000000000011', 'RICE', 'COOP', 'Tabuk City Rice and Corn Farmers Cooperative', 'CDA-9520-2012-0009', 'CDA', 'Kalinga', 'Tabuk City', 'Bulanao', 'Antonio Saboy', '0927 555 0111', 112, 96, 150, 24, 3, 40, 310.00, 'active', 17.4100, 121.4400),
  ('30000000-0000-4000-8000-000000000012', 'CORN', 'FA',   'Pinukpuk Yellow Corn Growers Association', 'DOLE-CAR-2022-0045', 'DOLE', 'Kalinga', 'Pinukpuk', null, 'Rosalie Gammod', '0928 555 0112', 57, 39, 81, 16, 2, 10, 128.50, 'active', 17.5800, 121.3600),
  ('30000000-0000-4000-8000-000000000013', 'HVC',  'FA',   'Lubuagan Robusta Coffee Farmers Association', null, null, 'Kalinga', 'Lubuagan', null, 'Daniel Ballag', '0929 555 0113', 25, 20, 45, 3, 0, 9, 27.00, 'inactive', 17.3500, 121.1800),
  ('30000000-0000-4000-8000-000000000014', 'HVC',  'FA',   'Bangued Lowland Vegetable Growers Association', 'DOLE-CAR-2019-0301', 'DOLE', 'Abra', 'Bangued', 'Calaba', 'Teodora Bersamin', '0930 555 0114', 29, 34, 12, 9, 1, 8, 22.80, 'active', 17.5960, 120.6180),
  ('30000000-0000-4000-8000-000000000015', 'HVC',  'FA',   'Dolores Cacao Farmers Association', null, null, 'Abra', 'Dolores', null, 'Ernesto Valera', '0931 555 0115', 18, 12, 6, 4, 0, 5, 15.00, 'active', 17.6500, 120.7100),
  ('30000000-0000-4000-8000-000000000016', 'APA',  'FA',   'Tayum Climate-Resilient Farmers Association', 'DOLE-CAR-2023-0017', 'DOLE', 'Abra', 'Tayum', null, 'Milagros Turqueza', '0932 555 0116', 33, 31, 10, 12, 1, 7, 40.20, 'active', 17.6170, 120.6560),
  ('30000000-0000-4000-8000-000000000017', 'APA',  'IPO',  'Kabugao Isnag Indigenous Farmers Organization', 'NCIP-CAR-2020-0012', 'NCIP', 'Apayao', 'Kabugao', 'Lucab', 'Ricardo Agsaoay', '0933 555 0117', 44, 38, 82, 14, 0, 12, 95.00, 'active', 18.0200, 121.1800),
  ('30000000-0000-4000-8000-000000000018', 'CORN', 'FA',   'Luna Corn and Banana Growers Association', 'DOLE-CAR-2021-0402', 'DOLE', 'Apayao', 'Luna', 'San Isidro', 'Imelda Agcaoili', '0934 555 0118', 52, 41, 30, 13, 2, 9, 140.00, 'active', 18.3000, 121.3700),
  ('30000000-0000-4000-8000-000000000019', 'AMIA', 'FA',   'Flora AMIA Village Farmers Association', null, null, 'Apayao', 'Flora', null, 'Nestor Lumawag', '0935 555 0119', 37, 35, 41, 18, 1, 6, 76.50, 'active', 18.2100, 121.4200),
  ('30000000-0000-4000-8000-000000000020', 'AMIA', 'SLP',  'Irisan Urban Gardeners SLP Association', 'DSWD-SLP-CAR-0456', 'DSWD', 'Baguio City', 'Baguio City', 'Irisan', 'Cecilia Bayan', '0936 555 0120', 6, 24, 9, 5, 2, 8, 1.20, 'active', 16.4200, 120.5600),
  ('30000000-0000-4000-8000-000000000021', 'HVC',  'LGU',  'Municipal Agriculture Office of Buguias', null, null, 'Benguet', 'Buguias', null, 'Municipal Agriculturist', '074 555 0121', 0, 0, 0, 0, 0, 0, null, 'active', 16.7300, 120.8250),
  ('30000000-0000-4000-8000-000000000022', 'RICE', 'IND',  'Pedro Bayang', null, null, 'Ifugao', 'Hungduan', null, 'Pedro Bayang', '0937 555 0122', 1, 0, 1, 0, 0, 1, 1.50, 'active', 16.8300, 121.0000)
) as v(id, program, type, name, reg_no, agency, province, municipality, barangay, contact, phone,
       m, f, ip, youth, pwd, senior, area, status, lat, lng)
join public.programs pr on pr.code = v.program
join public.beneficiary_types bt on bt.code = v.type
join public.provinces pv on pv.name = v.province
left join public.municipalities mu on mu.name = v.municipality and mu.province_id = pv.id
left join public.barangays br on br.name = v.barangay and br.municipality_id = mu.id
on conflict (id) do nothing;

insert into public.beneficiary_commodities (beneficiary_id, commodity_id)
select v.id::uuid, c.id
from (values
  ('30000000-0000-4000-8000-000000000001', 'Highland Vegetables'),
  ('30000000-0000-4000-8000-000000000002', 'Strawberry'),
  ('30000000-0000-4000-8000-000000000002', 'Highland Vegetables'),
  ('30000000-0000-4000-8000-000000000003', 'Strawberry'),
  ('30000000-0000-4000-8000-000000000004', 'Arabica Coffee'),
  ('30000000-0000-4000-8000-000000000005', 'Highland Vegetables'),
  ('30000000-0000-4000-8000-000000000005', 'Root Crops'),
  ('30000000-0000-4000-8000-000000000006', 'Heirloom Rice'),
  ('30000000-0000-4000-8000-000000000007', 'Heirloom Rice'),
  ('30000000-0000-4000-8000-000000000008', 'Yellow Corn'),
  ('30000000-0000-4000-8000-000000000009', 'Rice (Inbred)'),
  ('30000000-0000-4000-8000-000000000009', 'Legumes'),
  ('30000000-0000-4000-8000-000000000010', 'Arabica Coffee'),
  ('30000000-0000-4000-8000-000000000011', 'Rice (Inbred)'),
  ('30000000-0000-4000-8000-000000000011', 'Rice (Hybrid)'),
  ('30000000-0000-4000-8000-000000000011', 'Yellow Corn'),
  ('30000000-0000-4000-8000-000000000012', 'Yellow Corn'),
  ('30000000-0000-4000-8000-000000000013', 'Robusta Coffee'),
  ('30000000-0000-4000-8000-000000000014', 'Lowland Vegetables'),
  ('30000000-0000-4000-8000-000000000015', 'Cacao'),
  ('30000000-0000-4000-8000-000000000016', 'Rice (Inbred)'),
  ('30000000-0000-4000-8000-000000000016', 'Legumes'),
  ('30000000-0000-4000-8000-000000000017', 'Banana'),
  ('30000000-0000-4000-8000-000000000017', 'Root Crops'),
  ('30000000-0000-4000-8000-000000000018', 'Yellow Corn'),
  ('30000000-0000-4000-8000-000000000018', 'Banana'),
  ('30000000-0000-4000-8000-000000000019', 'Rice (Inbred)'),
  ('30000000-0000-4000-8000-000000000019', 'Root Crops'),
  ('30000000-0000-4000-8000-000000000020', 'Highland Vegetables'),
  ('30000000-0000-4000-8000-000000000022', 'Heirloom Rice')
) as v(id, commodity)
join public.commodities c on c.name = v.commodity
where exists (select 1 from public.beneficiaries b where b.id = v.id::uuid)
on conflict do nothing;
