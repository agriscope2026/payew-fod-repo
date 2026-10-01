-- =============================================================================
-- PAYEW · Phase 6B (Addendum B) · Suppliers master list & procurement lists
-- Suppliers are a shared, system-wide list: every active user reads them;
-- superadmins and program admins create/edit. Bank details are admin-only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Procurement reference lists (editable in Settings → Master lists)
-- ---------------------------------------------------------------------------
create table public.procurement_categories (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name                      text not null check (length(trim(name)) between 2 and 80),
  description               text,
  default_expense_class_id  uuid references public.expense_classes (id) on delete set null,
  default_uacs_code_id      uuid references public.uacs_codes (id) on delete set null,
  sort_order                integer not null default 0,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references auth.users (id) on delete set null,
  deleted_at                timestamptz
);

create table public.procurement_modes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name        text not null check (length(trim(name)) between 2 and 120),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create trigger set_updated_at before update on public.procurement_categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.procurement_modes
  for each row execute function public.set_updated_at();

-- Reference data needed in every environment.
insert into public.procurement_categories (code, name, sort_order) values
  ('LODGING',   'Lodging / Accommodation', 1),
  ('MEALS',     'Meals / Catering', 2),
  ('TRANSPORT', 'Transportation / Vehicle Rental', 3),
  ('SUPPLIES',  'Supplies / Materials', 4),
  ('VENUE',     'Venue', 5),
  ('PRINTING',  'Printing / Publication', 6),
  ('EQUIPMENT', 'Equipment / Machinery', 7),
  ('SERVICES',  'Honoraria / Services', 8),
  ('OTHER',     'Other', 99);

insert into public.procurement_modes (code, name, sort_order) values
  ('SVP',       'Small Value Procurement', 1),
  ('BIDDING',   'Competitive Bidding', 2),
  ('SHOPPING',  'Shopping', 3),
  ('DIRECT',    'Direct Contracting', 4),
  ('NEGOTIATED','Negotiated Procurement (Emergency Cases)', 5),
  ('A2A',       'Agency-to-Agency', 6),
  ('DRP',       'Direct Retail Purchase', 7),
  ('REPEAT',    'Repeat Order', 8),
  ('LSB',       'Limited Source Bidding', 9);

do $$
declare
  t text;
begin
  foreach t in array array['procurement_categories', 'procurement_modes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: active users read" on public.%1$I for select to authenticated '
      'using ((select public.current_user_role()) is not null)', t);
    execute format(
      'create policy "%1$s: superadmin insert" on public.%1$I for insert to authenticated '
      'with check ((select public.is_superadmin()))', t);
    execute format(
      'create policy "%1$s: superadmin update" on public.%1$I for update to authenticated '
      'using ((select public.is_superadmin())) with check ((select public.is_superadmin()))', t);
    execute format(
      'create policy "%1$s: superadmin delete" on public.%1$I for delete to authenticated '
      'using ((select public.is_superadmin()))', t);
    execute format('select public.enable_audit(%L)', 'public.' || t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
-- "Benguet Highland Trading & General Merchandise, Inc." → "benguet highland"
create or replace function public.supplier_name_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9ñ ]+', ' ', 'g'),
      '\m(the|and|of|enterprises?|trading|general|merchandise|gen|merch|corp|corporation|inc|incorporated|co|company|ltd|opc|services?|store|supply|supplies)\M',
      ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

create table public.suppliers (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null check (length(trim(business_name)) between 2 and 200),
  trade_name        text check (trade_name is null or length(trade_name) <= 200),
  name_key          text generated always as (public.supplier_name_key(business_name)) stored,
  owner_name        text check (owner_name is null or length(owner_name) <= 150),
  supplier_type     text not null default 'individual'
                    check (supplier_type in ('individual', 'partnership', 'corporation', 'cooperative', 'government', 'other')),
  tin               text check (tin is null or tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  tin_key           text generated always as (nullif(left(regexp_replace(coalesce(tin, ''), '[^0-9]', '', 'g'), 9), '')) stored,
  philgeps_no       text check (philgeps_no is null or length(philgeps_no) <= 40),
  philgeps_expiry   date,
  permit_no         text check (permit_no is null or length(permit_no) <= 60),
  permit_expiry     date,
  province_id       uuid references public.provinces (id) on delete restrict,
  municipality_id   uuid references public.municipalities (id) on delete restrict,
  barangay_id       uuid references public.barangays (id) on delete restrict,
  address_line      text check (address_line is null or length(address_line) <= 250),
  contact_person    text check (contact_person is null or length(contact_person) <= 120),
  contact_no        text check (contact_no is null or length(contact_no) <= 40),
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  categories        text[] not null default '{}', -- procurement_categories.code
  status            text not null default 'active' check (status in ('active', 'suspended', 'blacklisted')),
  status_reason     text check (status_reason is null or length(status_reason) <= 1000),
  notes             text check (notes is null or length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,
  deleted_by        uuid references auth.users (id) on delete set null,
  check (status = 'active' or status_reason is not null)
);
create index suppliers_name_key_trgm_idx on public.suppliers using gin (name_key extensions.gin_trgm_ops);
create unique index suppliers_tin_key_idx on public.suppliers (tin_key) where tin_key is not null and deleted_at is null;
create index suppliers_status_idx on public.suppliers (status) where deleted_at is null;
create index suppliers_expiry_idx on public.suppliers (least(philgeps_expiry, permit_expiry));

create trigger set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger enforce_location_hierarchy
  before insert or update of province_id, municipality_id, barangay_id on public.suppliers
  for each row execute function public.enforce_location_hierarchy();

-- Other compliance documents (tax clearance, BIR 2303, …) with expiry.
create table public.supplier_documents (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers (id) on delete cascade,
  doc_type      text not null check (doc_type in (
                  'philgeps', 'business_permit', 'bir_2303', 'dti_sec_cda', 'tax_clearance',
                  'omnibus_sworn', 'audited_fs', 'other')),
  doc_no        text check (doc_no is null or length(doc_no) <= 60),
  issued_on     date,
  expires_on    date,
  remarks       text check (remarks is null or length(remarks) <= 500),
  attachment_id uuid references public.attachments (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index supplier_documents_supplier_idx on public.supplier_documents (supplier_id);
create index supplier_documents_expiry_idx on public.supplier_documents (expires_on);
create trigger set_updated_at before update on public.supplier_documents
  for each row execute function public.set_updated_at();

-- Bank details: separate table so RLS can hide it from staff.
create table public.supplier_bank_accounts (
  supplier_id   uuid primary key references public.suppliers (id) on delete cascade,
  bank_name     text not null check (length(trim(bank_name)) between 2 and 120),
  branch        text check (branch is null or length(branch) <= 120),
  account_name  text not null check (length(trim(account_name)) between 2 and 200),
  account_no    text not null check (account_no ~ '^[0-9 -]{4,30}$'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references auth.users (id) on delete set null
);
create trigger set_updated_at before update on public.supplier_bank_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_suppliers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('superadmin', 'program_admin'), false)
$$;

-- Only superadmins blacklist or lift a blacklist; trash stamps deleted_by.
create or replace function public.guard_supplier_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.status = 'blacklisted') is distinct from (old.status = 'blacklisted') and not public.is_superadmin() then
    raise exception 'Only a superadmin can blacklist a supplier or lift a blacklist' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    new.deleted_by := case when new.deleted_at is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;
create trigger guard_supplier_update before update on public.suppliers
  for each row execute function public.guard_supplier_update();

create or replace function public.guard_supplier_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.status = 'blacklisted' and not public.is_superadmin() then
    raise exception 'Only a superadmin can blacklist a supplier' using errcode = '42501';
  end if;
  new.deleted_at := null;
  return new;
end;
$$;
create trigger guard_supplier_insert before insert on public.suppliers
  for each row execute function public.guard_supplier_insert();

alter table public.suppliers enable row level security;
alter table public.supplier_documents enable row level security;
alter table public.supplier_bank_accounts enable row level security;

revoke delete, update on public.suppliers from authenticated;
grant update (
  business_name, trade_name, owner_name, supplier_type, tin, philgeps_no, philgeps_expiry, permit_no,
  permit_expiry, province_id, municipality_id, barangay_id, address_line, contact_person, contact_no,
  email, categories, status, status_reason, notes, deleted_at
) on public.suppliers to authenticated;

create policy "suppliers: read" on public.suppliers
  for select to authenticated
  using ((select public.current_user_role()) is not null
         and (deleted_at is null or (select public.can_manage_suppliers())));
create policy "suppliers: insert" on public.suppliers
  for insert to authenticated with check ((select public.can_manage_suppliers()));
create policy "suppliers: update" on public.suppliers
  for update to authenticated
  using ((select public.can_manage_suppliers())) with check ((select public.can_manage_suppliers()));

create policy "supplier_documents: read" on public.supplier_documents
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy "supplier_documents: insert" on public.supplier_documents
  for insert to authenticated with check ((select public.can_manage_suppliers()));
create policy "supplier_documents: update" on public.supplier_documents
  for update to authenticated
  using ((select public.can_manage_suppliers())) with check ((select public.can_manage_suppliers()));
create policy "supplier_documents: delete" on public.supplier_documents
  for delete to authenticated using ((select public.can_manage_suppliers()));

create policy "supplier_bank_accounts: admins" on public.supplier_bank_accounts
  for all to authenticated
  using ((select public.can_manage_suppliers())) with check ((select public.can_manage_suppliers()));

select public.enable_audit('public.suppliers');
select public.enable_audit('public.supplier_documents');
-- Bank changes are audited without the account number in the log.
create or replace function public.audit_bank_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, new_data)
  values ((select auth.uid()), tg_op, 'supplier_bank_accounts', coalesce(new.supplier_id, old.supplier_id)::text,
          case when tg_op = 'DELETE' then null
               else jsonb_build_object('bank_name', new.bank_name, 'account_no_last4', right(new.account_no, 4)) end);
  return null;
end;
$$;
create trigger audit_bank_change after insert or update or delete on public.supplier_bank_accounts
  for each row execute function public.audit_bank_change();

-- ---------------------------------------------------------------------------
-- Duplicate detection & compliance
-- ---------------------------------------------------------------------------
create or replace function public.find_similar_suppliers(
  p_name text,
  p_tin text default null,
  p_exclude_id uuid default null,
  p_limit integer default 5
)
returns table (id uuid, business_name text, tin text, status text, similarity real, same_tin boolean)
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.supplier_name_key(p_name) as key,
           nullif(left(regexp_replace(coalesce(p_tin, ''), '[^0-9]', '', 'g'), 9), '') as tin_key
  )
  select s.id, s.business_name, s.tin, s.status,
         extensions.similarity(s.name_key, q.key) as similarity,
         coalesce(s.tin_key = q.tin_key, false) as same_tin
  from public.suppliers s, q
  where s.deleted_at is null
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and ((length(q.key) > 0 and extensions.similarity(s.name_key, q.key) >= 0.45)
         or (q.tin_key is not null and s.tin_key = q.tin_key))
  order by same_tin desc, (s.name_key = q.key) desc, similarity desc
  limit least(greatest(p_limit, 1), 20)
$$;

-- Warnings shown before awarding: [{level: 'block'|'warn', message}]
create or replace function public.supplier_award_check(p_supplier_id uuid, p_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s     public.suppliers;
  v_on    date := coalesce(p_on, public.today_ph());
  v_out   jsonb := '[]'::jsonb;
  d       record;
begin
  select * into v_s from public.suppliers where id = p_supplier_id and deleted_at is null;
  if not found then
    return jsonb_build_array(jsonb_build_object('level', 'block', 'message', 'Supplier not found'));
  end if;
  if v_s.status = 'blacklisted' then
    v_out := v_out || jsonb_build_object('level', 'block',
      'message', 'Blacklisted: ' || coalesce(v_s.status_reason, 'see supplier record'));
  elsif v_s.status = 'suspended' then
    v_out := v_out || jsonb_build_object('level', 'warn',
      'message', 'Suspended: ' || coalesce(v_s.status_reason, 'see supplier record'));
  end if;
  if v_s.philgeps_no is null then
    v_out := v_out || jsonb_build_object('level', 'warn', 'message', 'No PhilGEPS registration on file');
  elsif v_s.philgeps_expiry < v_on then
    v_out := v_out || jsonb_build_object('level', 'warn',
      'message', 'PhilGEPS registration expired on ' || to_char(v_s.philgeps_expiry, 'FMMon FMDD, YYYY'));
  end if;
  if v_s.permit_expiry < v_on then
    v_out := v_out || jsonb_build_object('level', 'warn',
      'message', 'Business permit expired on ' || to_char(v_s.permit_expiry, 'FMMon FMDD, YYYY'));
  end if;
  for d in select * from public.supplier_documents where supplier_id = p_supplier_id and expires_on < v_on loop
    v_out := v_out || jsonb_build_object('level', 'warn',
      'message', initcap(replace(d.doc_type, '_', ' ')) || ' expired on ' || to_char(d.expires_on, 'FMMon FMDD, YYYY'));
  end loop;
  return v_out;
end;
$$;

-- Excel import (max 1000 rows). Rows use column names; ids already resolved by the client.
create or replace function public.import_suppliers(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.can_manage_suppliers() then
    raise exception 'Only admins can import suppliers' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import at most 1,000 suppliers at a time' using errcode = '22023';
  end if;
  insert into public.suppliers (
    business_name, trade_name, owner_name, supplier_type, tin, philgeps_no, philgeps_expiry, permit_no,
    permit_expiry, province_id, municipality_id, barangay_id, address_line, contact_person, contact_no,
    email, categories, notes
  )
  select r.business_name, r.trade_name, r.owner_name, coalesce(r.supplier_type, 'individual'), r.tin,
         r.philgeps_no, r.philgeps_expiry, r.permit_no, r.permit_expiry, r.province_id, r.municipality_id,
         r.barangay_id, r.address_line, r.contact_person, r.contact_no, r.email, coalesce(r.categories, '{}'), r.notes
  from jsonb_to_recordset(p_rows) as r(
    business_name text, trade_name text, owner_name text, supplier_type text, tin text, philgeps_no text,
    philgeps_expiry date, permit_no text, permit_expiry date, province_id uuid, municipality_id uuid,
    barangay_id uuid, address_line text, contact_person text, contact_no text, email text,
    categories text[], notes text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.can_manage_suppliers() from public, anon;
grant execute on function public.can_manage_suppliers() to authenticated;
revoke execute on function public.find_similar_suppliers(text, text, uuid, integer) from public, anon;
grant execute on function public.find_similar_suppliers(text, text, uuid, integer) to authenticated;
revoke execute on function public.supplier_award_check(uuid, date) from public, anon;
grant execute on function public.supplier_award_check(uuid, date) to authenticated;
revoke execute on function public.import_suppliers(jsonb) from public, anon;
grant execute on function public.import_suppliers(jsonb) to authenticated;
revoke execute on function public.audit_bank_change() from public, anon, authenticated;
