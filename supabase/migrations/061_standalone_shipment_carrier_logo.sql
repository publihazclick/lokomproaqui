-- Modulo "Generacion de Guias" (pedido explicito del usuario 2026-07-20, "que se vea unicornio y
-- profesional... hay partes donde solo estas mostrando nombre y precio mas no su logo"): el listado
-- "Mis Guias" (/config/guias) mostraba transportadora+flete en texto plano, sin logo -- el logo ya
-- se recibia en la cotizacion (guide-quote devuelve logo_url) pero nunca se persistia junto con la
-- transportadora elegida.

alter table standalone_shipments add column if not exists delivery_company_logo_url text;
