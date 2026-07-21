-- Sistema de comisiones multinivel: RPC de apoyo para "Mis Referidos" (frontend). Cuenta las
-- entregas del mes calendario en curso para una lista de perfiles en UNA sola consulta -- evita
-- N+1 cuando la pantalla muestra un nivel con potencialmente cientos de referidos (10k+
-- vendedores en la plataforma). El query builder de supabase-js no arma GROUP BY, por eso esto
-- vive como funcion en la base de datos.
create or replace function fetch_entregas_mes(p_profile_ids uuid[])
returns table(profile_id uuid, entregas_mes bigint) as $$
begin
  return query
  select o.seller_id, count(*)
  from orders o
  where o.seller_id = any(p_profile_ids)
    and o.status = 'success'
    and o.delivered_at >= date_trunc('month', now())
  group by o.seller_id;
end;
$$ language plpgsql stable;
