-- =============================================================================
-- PAYEW · Phase 3 · Attachments (Cloudflare R2 metadata) & Document Repository
-- Files live in a private R2 bucket. Postgres stores metadata only. Rows are
-- created and finalized by the `files` Edge Function (service role) after it
-- checks can_upload_attachment(); clients read them through RLS and may edit
-- descriptive fields or move them to Trash.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Document types (master list)
-- ---------------------------------------------------------------------------
create table public.document_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create trigger set_updated_at before update on public.document_types
  for each row execute function public.set_updated_at();

alter table public.document_types enable row level security;
create policy "document_types: active users read" on public.document_types
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy "document_types: superadmin insert" on public.document_types
  for insert to authenticated with check ((select public.is_superadmin()));
create policy "document_types: superadmin update" on public.document_types
  for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "document_types: superadmin delete" on public.document_types
  for delete to authenticated using ((select public.is_superadmin()));

-- Reference data needed in every environment (not only dev seed).
insert into public.document_types (code, name, sort_order) values
  ('PPMP', 'Project Procurement Management Plan', 1),
  ('WFP', 'Work and Financial Plan', 2),
  ('APP', 'Annual Procurement Plan', 3),
  ('DESIGN', 'Activity Design / Proposal', 4),
  ('PR', 'Purchase Request', 5),
  ('RFQ', 'Request for Quotation / Bid Documents', 6),
  ('PO', 'Purchase Order / Contract', 7),
  ('IAR', 'Inspection and Acceptance Report', 8),
  ('ORS', 'Obligation Request and Status', 9),
  ('DV', 'Disbursement Voucher', 10),
  ('LIQ', 'Liquidation Report', 11),
  ('REPORT', 'Accomplishment / Narrative Report', 12),
  ('PHOTO', 'Photo Documentation', 13),
  ('MINUTES', 'Minutes of Meeting', 14),
  ('MEMO', 'Memorandum / Issuance', 15),
  ('OTHER', 'Other', 99);

-- ---------------------------------------------------------------------------
-- Write scope helper: who may create/modify program data.
--   superadmin, program admin of the program, or staff of the program with
--   can_edit_activities = true.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_program(p_program_id)
      or (
        public.current_user_role() = 'program_staff'
        and p_program_id in (select public.user_program_ids())
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.can_edit_activities
        )
      )
$$;

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------
create table public.attachments (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid references public.programs (id) on delete restrict, -- null = DA-wide / personal
  fiscal_year_id    uuid references public.fiscal_years (id) on delete set null,
  entity_type       text not null default 'repository'
                    check (entity_type ~ '^[a-z_]{2,40}$'),
  entity_id         uuid,
  document_type_id  uuid references public.document_types (id) on delete set null,
  folder            text check (folder is null or length(folder) <= 200),
  tags              text[] not null default '{}',
  description       text check (description is null or length(description) <= 2000),
  file_name         text not null check (length(file_name) between 1 and 255),
  r2_key            text not null unique,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- 25 MB
  status            text not null default 'pending' check (status in ('pending', 'ready')),
  version_group_id  uuid not null,
  version           integer not null default 1 check (version >= 1),
  is_latest         boolean not null default true,
  uploaded_by       uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references auth.users (id) on delete set null,
  unique (version_group_id, version)
);

create index attachments_program_idx on public.attachments (program_id);
create index attachments_fiscal_year_idx on public.attachments (fiscal_year_id);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);
create index attachments_group_idx on public.attachments (version_group_id);
create index attachments_doc_type_idx on public.attachments (document_type_id);
create index attachments_created_idx on public.attachments (created_at desc);
create index attachments_tags_idx on public.attachments using gin (tags);
create index attachments_name_trgm_idx on public.attachments using gin (file_name extensions.gin_trgm_ops);

create trigger set_updated_at before update on public.attachments
  for each row execute function public.set_updated_at();

-- Stamp who moved a file to (or out of) Trash.
create or replace function public.stamp_attachment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    new.deleted_by := case when new.deleted_at is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;

create trigger stamp_attachment_delete before update of deleted_at on public.attachments
  for each row execute function public.stamp_attachment_delete();

select public.enable_audit('public.attachments');

-- ---------------------------------------------------------------------------
-- Upload authorization (called by the Edge Function with the caller's JWT)
--   profile  → own avatar only (program_id must be null)
--   no program → superadmin (DA-wide documents)
--   program  → can_write_program
-- Entity-ownership checks are added as entity tables land (activities: Phase 5).
-- ---------------------------------------------------------------------------
create or replace function public.can_upload_attachment(
  p_program_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_user_role() is null then false
    when p_entity_type = 'profile' then p_program_id is null and p_entity_id = (select auth.uid())
    when p_program_id is null then public.is_superadmin()
    else public.can_write_program(p_program_id)
  end
$$;

-- Finalize an upload after the Edge Function verified the object in R2.
-- Marks the row ready and makes it the latest version of its group.
create or replace function public.mark_attachment_ready(p_attachment_id uuid, p_size_bytes bigint)
returns public.attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.attachments;
begin
  update public.attachments
  set status = 'ready', size_bytes = p_size_bytes, is_latest = true
  where id = p_attachment_id and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Upload not found or already finalized' using errcode = 'P0002';
  end if;

  update public.attachments
  set is_latest = false
  where version_group_id = v_row.version_group_id and id <> v_row.id and is_latest;

  return v_row;
end;
$$;

revoke execute on function public.mark_attachment_ready(uuid, bigint) from public, anon, authenticated;
grant execute on function public.mark_attachment_ready(uuid, bigint) to service_role;
revoke execute on function public.can_upload_attachment(uuid, text, uuid) from public, anon;
grant execute on function public.can_upload_attachment(uuid, text, uuid) to authenticated, service_role;
revoke execute on function public.can_write_program(uuid) from public, anon;
grant execute on function public.can_write_program(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.attachments enable row level security;

-- Clients never insert or hard-delete; only descriptive fields and Trash state are editable.
revoke insert, update, delete on public.attachments from authenticated;
grant update (file_name, description, document_type_id, folder, tags, deleted_at)
  on public.attachments to authenticated;

-- Readable when the scope is visible; Trash and pending uploads only to managers/uploader.
create policy "attachments: read" on public.attachments
  for select to authenticated
  using (
    (
      case
        when program_id is null then (select public.current_user_role()) is not null
        else public.has_program_access(program_id)
      end
    )
    and (status = 'ready' or uploaded_by = (select auth.uid()))
    and (
      deleted_at is null
      or uploaded_by = (select auth.uid())
      or case when program_id is null then (select public.is_superadmin())
              else public.can_manage_program(program_id) end
    )
  );

create policy "attachments: edit own or managed" on public.attachments
  for update to authenticated
  using (
    (uploaded_by = (select auth.uid()) and (select public.current_user_role()) is not null)
    or case when program_id is null then (select public.is_superadmin())
            else public.can_manage_program(program_id) end
  )
  with check (
    (uploaded_by = (select auth.uid()) and (select public.current_user_role()) is not null)
    or case when program_id is null then (select public.is_superadmin())
            else public.can_manage_program(program_id) end
  );
