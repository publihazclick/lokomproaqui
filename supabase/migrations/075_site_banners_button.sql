-- Boton "Ver ahora" superpuesto en cada banner de imagen (pedido explicito del usuario 2026-07-22):
-- color y posicion configurables POR banner desde el admin, porque cada imagen tiene su propia
-- composicion/colores y el admin es quien puede ver cual queda mejor en cada una.

alter table site_banners add column if not exists button_color text not null default '#0d6efd';
alter table site_banners add column if not exists button_position text not null default 'bottom-right';
