-- Fase 4 del plan de reduccion de devoluciones: agrega el titulo del producto directo a la vista
-- (order_items.title ya lo guarda denormalizado al momento de la venta) para que el dashboard admin
-- no necesite una segunda consulta a products solo para mostrar nombres legibles en el ranking.

DROP VIEW IF EXISTS product_return_stats;

CREATE VIEW product_return_stats AS
SELECT
  oi.product_id,
  max(oi.title) AS product_title,
  count(DISTINCT o.id) FILTER (WHERE o.status IN ('success', 'rejected')) AS total_orders,
  count(DISTINCT o.id) FILTER (WHERE o.status = 'rejected') AS total_returns,
  CASE WHEN count(DISTINCT o.id) FILTER (WHERE o.status IN ('success', 'rejected')) > 0
    THEN count(DISTINCT o.id) FILTER (WHERE o.status = 'rejected')::numeric / count(DISTINCT o.id) FILTER (WHERE o.status IN ('success', 'rejected'))
    ELSE 0
  END AS return_rate
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.product_id IS NOT NULL
GROUP BY oi.product_id;
