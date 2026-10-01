-- =============================================================================
-- Phase 12: bulk location import (production master data)
--   import_locations(rows) loads provinces / municipalities / barangays from the
--   PSA PSGC file (parsed in the browser). Idempotent: an existing place is
--   matched by PSGC code, else by name within its parent, and is updated
--   (PSGC code filled in, restored if it was in Trash) rather than duplicated.
-- =============================================================================

create or replace function public.import_locations(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         jsonb;
  i         integer := 0;
  v_prov    uuid;
  v_mun     uuid;
  v_name    text;
  v_code    text;
  v_added   jsonb := '{"provinces": 0, "municipalities": 0, "barangays": 0}';
  v_sort    integer;
begin
  if not public.is_superadmin() then
    raise exception 'Only the superadmin can import locations' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected a list of rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import at most 5,000 rows at a time' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) into v_sort from public.provinces;

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;

    -- Province
    v_name := nullif(trim(r ->> 'province'), '');
    v_code := nullif(trim(r ->> 'province_psgc'), '');
    if v_name is null then
      raise exception 'Row %: province is required', i using errcode = '22023';
    end if;
    v_prov := null;
    if v_code is not null then
      select id into v_prov from public.provinces where psgc_code = v_code;
    end if;
    if v_prov is null then
      select id into v_prov from public.provinces where lower(name) = lower(v_name);
    end if;
    if v_prov is null then
      v_sort := v_sort + 1;
      insert into public.provinces (name, psgc_code, is_city, sort_order)
      values (v_name, v_code, coalesce((r ->> 'province_is_city')::boolean, false), v_sort)
      returning id into v_prov;
      v_added := jsonb_set(v_added, '{provinces}', to_jsonb((v_added ->> 'provinces')::integer + 1));
    else
      update public.provinces
      set psgc_code = coalesce(psgc_code, v_code), deleted_at = null
      where id = v_prov and (deleted_at is not null or (psgc_code is null and v_code is not null));
    end if;

    -- Municipality / city
    v_name := nullif(trim(r ->> 'municipality'), '');
    if v_name is null then
      if nullif(trim(r ->> 'barangay'), '') is not null then
        raise exception 'Row %: barangay without a municipality/city', i using errcode = '22023';
      end if;
      continue;
    end if;
    v_code := nullif(trim(r ->> 'municipality_psgc'), '');
    v_mun := null;
    if v_code is not null then
      select id into v_mun from public.municipalities where psgc_code = v_code;
    end if;
    if v_mun is null then
      select id into v_mun from public.municipalities where province_id = v_prov and lower(name) = lower(v_name);
    end if;
    if v_mun is null then
      insert into public.municipalities (province_id, name, psgc_code, is_city)
      values (v_prov, v_name, v_code, coalesce((r ->> 'municipality_is_city')::boolean, false))
      returning id into v_mun;
      v_added := jsonb_set(v_added, '{municipalities}', to_jsonb((v_added ->> 'municipalities')::integer + 1));
    else
      update public.municipalities
      set psgc_code = coalesce(psgc_code, v_code), deleted_at = null
      where id = v_mun and (deleted_at is not null or (psgc_code is null and v_code is not null));
    end if;

    -- Barangay
    v_name := nullif(trim(r ->> 'barangay'), '');
    continue when v_name is null;
    v_code := nullif(trim(r ->> 'barangay_psgc'), '');
    if (v_code is not null and exists (select 1 from public.barangays where psgc_code = v_code))
       or exists (select 1 from public.barangays where municipality_id = v_mun and lower(name) = lower(v_name)) then
      update public.barangays
      set psgc_code = coalesce(psgc_code, v_code), deleted_at = null
      where (psgc_code = v_code or (municipality_id = v_mun and lower(name) = lower(v_name)))
        and (deleted_at is not null or (psgc_code is null and v_code is not null));
    else
      insert into public.barangays (municipality_id, name, psgc_code) values (v_mun, v_name, v_code);
      v_added := jsonb_set(v_added, '{barangays}', to_jsonb((v_added ->> 'barangays')::integer + 1));
    end if;
  end loop;

  return v_added;
end;
$$;

revoke execute on function public.import_locations(jsonb) from public, anon;
grant execute on function public.import_locations(jsonb) to authenticated;
