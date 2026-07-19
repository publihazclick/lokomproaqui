-- Fase 0 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): sin saber
-- POR QUE se devuelve un pedido, todo lo demas (scoring de riesgo, dashboard, priorizacion) se
-- construye a ciegas. Este es el primer paso, puramente informativo -- no toca ninguna logica de
-- dinero (approve_order/reject_order quedan intactos).

CREATE TYPE return_reason AS ENUM (
  'no_contesto',
  'no_encontrado',
  'se_arrepintio',
  'direccion_invalida',
  'producto_no_esperado',
  'fraude_sospechado',
  'otro'
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason return_reason;
