-- Self-service profile (D052): every signed-in, active member can change their own
-- username, names and mobile number. Login identity is unaffected (auth e-mails are
-- synthetic per member id); the change is audited as MEMBER_PROFILE_UPDATED with the
-- member as actor. Roles, status and passwords stay owner/own-password flows.
create function public.normalize_member_phone(p_phone text)
returns text language plpgsql immutable set search_path = public, pg_temp
as $$ declare v text; begin
  if p_phone is null or btrim(p_phone) = '' then return null; end if;
  v := regexp_replace(btrim(p_phone), '[\s()-]', '', 'g');
  if v ~ '^01\d{9}$' then v := '+2' || v;
  elsif v ~ '^00201\d{9}$' then v := '+' || substr(v, 3);
  end if;
  if v !~ '^\+\d{8,15}$' then perform public.phase2_fail('INVALID_PHONE'); end if;
  return v;
end $$;

create function public.update_own_profile(p_op_id uuid, p_username text, p_full_name_en text,
  p_full_name_ar text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_member uuid := public.current_member_id(); v_before jsonb; v_after jsonb;
  v_saved public.client_ops; v_result jsonb; v_username text; v_name text; v_phone text; begin
  if v_member is null then perform public.phase2_fail('UNAUTHORIZED'); end if;
  if p_op_id is null then perform public.phase2_fail('INVALID_OP_ID'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text, 0));
  select * into v_saved from public.client_ops where op_id = p_op_id;
  if found then
    if v_saved.actor_id <> v_member or v_saved.rpc_name <> 'update_own_profile' then
      perform public.phase2_fail('OP_ID_CONFLICT');
    end if;
    return v_saved.result;
  end if;
  v_username := lower(btrim(coalesce(p_username, '')));
  if v_username !~ '^[a-z0-9_.]{3,30}$' then perform public.phase2_fail('INVALID_USERNAME'); end if;
  v_name := btrim(coalesce(p_full_name_en, ''));
  if v_name = '' or length(v_name) > 80 then perform public.phase2_fail('INVALID_NAME'); end if;
  if length(coalesce(p_full_name_ar, '')) > 80 then perform public.phase2_fail('INVALID_NAME'); end if;
  v_phone := public.normalize_member_phone(p_phone);
  if exists(select 1 from public.members where username = v_username and id <> v_member) then
    perform public.phase2_fail('DUPLICATE_USERNAME');
  end if;
  if v_phone is not null and exists(select 1 from public.members where phone = v_phone and id <> v_member) then
    perform public.phase2_fail('DUPLICATE_PHONE');
  end if;
  select jsonb_build_object('username', username, 'phone', phone, 'full_name_en', full_name_en,
      'full_name_ar', full_name_ar)
    into v_before from public.members where id = v_member for update;
  update public.members set username = v_username, phone = v_phone, full_name_en = v_name,
      full_name_ar = nullif(btrim(coalesce(p_full_name_ar, '')), ''), updated_at = now()
    where id = v_member;
  select jsonb_build_object('username', username, 'phone', phone, 'full_name_en', full_name_en,
      'full_name_ar', full_name_ar)
    into v_after from public.members where id = v_member;
  if v_after is distinct from v_before then
    insert into public.audit_log(actor_id, action, entity, entity_id, before, after)
      values(v_member, 'MEMBER_PROFILE_UPDATED', 'member', v_member, v_before, v_after);
  end if;
  v_result := jsonb_build_object('id', v_member) || v_after;
  insert into public.client_ops(op_id, actor_id, rpc_name, result)
    values(p_op_id, v_member, 'update_own_profile', v_result);
  return v_result;
end $$;

revoke all on function public.update_own_profile(uuid,text,text,text,text) from public, anon;
grant execute on function public.update_own_profile(uuid,text,text,text,text) to authenticated;
revoke all on function public.normalize_member_phone(text) from public, anon, authenticated;
