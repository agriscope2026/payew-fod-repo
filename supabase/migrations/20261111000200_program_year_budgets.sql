-- =============================================================================
-- Total budget of a program for a fiscal year, set by its program admin.
-- Allotments record what has been released; this records the year's whole budget.
-- =============================================================================

create table public.program_year_budgets (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.programs (id) on delete cascade,
  fiscal_year_id  uuid not null references public.fiscal_years (id) on delete restrict,
  total_budget    numeric(16, 2) not null check (total_budget >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
  unique (program_id, fiscal_year_id)
);

create trigger set_updated_at before update on public.program_year_budgets
  for each row execute function public.set_updated_at();
-- Same rules as allotments: fixed program and year, no edits to a locked year.
create trigger guard_program_year_budget before insert or update on public.program_year_budgets
  for each row execute function public.guard_allotment();

select public.enable_audit('public.program_year_budgets');

alter table public.program_year_budgets enable row level security;
grant select, insert, update on public.program_year_budgets to authenticated;

create policy "program_year_budgets: read" on public.program_year_budgets
  for select to authenticated using (public.has_program_access(program_id));
create policy "program_year_budgets: admins insert" on public.program_year_budgets
  for insert to authenticated with check (public.can_manage_program(program_id));
create policy "program_year_budgets: admins update" on public.program_year_budgets
  for update to authenticated
  using (public.can_manage_program(program_id)) with check (public.can_manage_program(program_id));
