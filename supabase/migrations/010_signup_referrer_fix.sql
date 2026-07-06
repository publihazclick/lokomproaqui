-- Permite pasar referrer_id directamente en el signup (además de referral_code)

create or replace function handle_new_user()
returns trigger as $$
declare
  ref_id uuid;
begin
  if new.raw_user_meta_data ->> 'referrer_id' is not null then
    ref_id := (new.raw_user_meta_data ->> 'referrer_id')::uuid;
  elsif new.raw_user_meta_data ->> 'referral_code' is not null then
    select id into ref_id from profiles where referral_code = new.raw_user_meta_data ->> 'referral_code';
  end if;

  insert into profiles (id, referrer_id, role_id, full_name, last_name, phone, referral_code)
  values (
    new.id,
    ref_id,
    case when new.raw_user_meta_data ->> 'role_name' = 'proveedor' then (select id from roles where name = 'proveedor')
         else (select id from roles where name = 'vendedor') end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    generate_referral_code()
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
