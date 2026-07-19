-- Fase 4 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): vista de
-- apoyo para el dashboard admin de causas de devolucion -- agrupa por return_reason (Fase 0,
-- migracion 048). Mismo criterio que seller_return_stats/product_return_stats (migracion 050):
-- vista en vivo, sin tabla mantenida aparte.

CREATE VIEW return_reason_stats AS
SELECT
  coalesce(return_reason::text, 'sin_clasificar') AS return_reason,
  count(*) AS total
FROM orders
WHERE status = 'rejected'
GROUP BY coalesce(return_reason::text, 'sin_clasificar');
