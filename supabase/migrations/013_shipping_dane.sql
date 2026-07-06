-- Hito 7: columnas necesarias para integrar Mipaquete (codigos DANE de origen/destino)

alter table orders add column if not exists destino_dane_code text;
alter table orders add column if not exists origen_dane_code text;
