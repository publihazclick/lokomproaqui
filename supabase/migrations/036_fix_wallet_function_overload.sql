-- Bug real encontrado 2026-07-17 auditando el menu de administrador: 026_wallet_ledger_kind.sql
-- agrego p_kind a credit_wallet/debit_wallet con "create or replace function", pero como el
-- nuevo parametro cambia la firma, Postgres NO reemplazo la funcion vieja -- creo una SEGUNDA
-- funcion sobrecargada (overload) y dejo la original intacta. Cualquier llamada que no incluya
-- p_kind (ej. otorgarPuntos en src/lib/usuarios.ts, boton "Dar puntos" de /config/ventas) queda
-- ambigua entre las dos firmas y PostgREST la rechaza con PGRST203 ("Could not choose the best
-- candidate function"). Confirmado en vivo: "Dar puntos" esta roto en produccion ahora mismo.
--
-- Fix: borrar las firmas VIEJAS (sin p_kind), dejando solo la version con p_kind default null --
-- asi cualquier llamada que no lo pase sigue funcionando igual que antes, sin ambiguedad.

drop function if exists credit_wallet(uuid, wallet_type, numeric, bigint, numeric);
drop function if exists debit_wallet(uuid, wallet_type, numeric, bigint);
