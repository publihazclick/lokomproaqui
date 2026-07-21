-- Fase 3 del plan de aislamiento proveedor<->vendedor (pedido explicito del usuario 2026-07-20, ver
-- C:\Users\MOINS\.claude\plans\clever-hugging-shore.md): antes "Autorizar y enviar a despacho" era
-- UN SOLO click del vendedor que hacia todo (condiciones de entrega + cobro wallet + transportadora
-- + guia). Eso ya no puede seguir siendo un solo paso del vendedor, porque la transportadora ahora
-- la elige el PROVEEDOR (desde su propia direccion de recogida, no la del vendedor). Se parte en
-- dos pasos reales:
-- 1) Vendedor confirma condiciones de entrega (cliente ya pago / envio incluido / seguro) -- pone
--    este flag en true, SIN cobrar wallet todavia (el monto exacto del flete depende de que
--    transportadora elija el proveedor despues).
-- 2) Proveedor ve el pedido solo cuando este flag esta en true, cotiza/elige transportadora desde
--    su propia ciudad, y AHI se cobra la wallet del vendedor (monto ya conocido) + se genera la
--    guia real.

alter table orders add column if not exists delivery_conditions_confirmed boolean not null default false;
