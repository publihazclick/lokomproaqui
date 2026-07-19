-- Fase 1 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): scoring
-- de riesgo por vendedor y por producto. A diferencia de customer_risk_profile (migracion 049),
-- aca NO hace falta una tabla mantenida por trigger -- seller_id/product_id ya viven completos en
-- orders/order_items, asi que una VIEW normal calcula esto siempre al dia sin logica adicional que
-- mantener sincronizada. Con el volumen de pedidos que va a manejar la plataforma esto es
-- perfectamente barato de calcular en vivo.
--
-- IMPORTANTE: hoy (2026-07-19) no hay pedidos reales en produccion todavia, asi que estas vistas
-- devuelven vacio -- se construyen ahora para que la infraestructura este lista apenas empiece a
-- correr trafico real, mismo criterio que Fase 0 (return_reason).

CREATE VIEW seller_return_stats AS
SELECT
  seller_id,
  count(*) FILTER (WHERE status IN ('success', 'rejected')) AS total_orders,
  count(*) FILTER (WHERE status = 'rejected') AS total_returns,
  CASE WHEN count(*) FILTER (WHERE status IN ('success', 'rejected')) > 0
    THEN count(*) FILTER (WHERE status = 'rejected')::numeric / count(*) FILTER (WHERE status IN ('success', 'rejected'))
    ELSE 0
  END AS return_rate
FROM orders
WHERE seller_id IS NOT NULL
GROUP BY seller_id;

CREATE VIEW product_return_stats AS
SELECT
  oi.product_id,
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
