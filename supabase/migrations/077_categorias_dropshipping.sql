-- Pedido explicito del usuario 2026-07-24: "analisis profundo de que categorias de productos
-- deberia tener un formulario para una plataforma de dropshipping unicornio". Se agregan 14
-- categorias principales nuevas (mas subcategorias) cubriendo los rubros tipicos de un
-- marketplace de dropshipping general (moda, belleza, hogar, electronica, mascotas, etc.),
-- sin tocar "Calzado" ni "Billeteras" (ya tienen productos reales asociados) -- a Calzado se le
-- agregan subcategorias nuevas (no tenia ninguna).
--
-- Tambien agrega 3 tipos de talla nuevos (Ropa S-XL, Ropa numerica dama, Ninos) -- el tipo de
-- medida pasa a ser OPCIONAL por producto (ver cambio de UI en FormProductoModal.tsx), asi que
-- estos no son obligatorios para categorias que no aplican (electronica, hogar, etc.).

-- ── Subcategorias para "Calzado" (categoria existente, id se resuelve por nombre) ──────────────
insert into categories (name, slug, parent_id, sort_order)
select v.name, v.slug, c.id, v.sort_order
from categories c
cross join (values
  ('Tenis', 'calzado-tenis', 1),
  ('Sandalias', 'calzado-sandalias', 2),
  ('Tacones', 'calzado-tacones', 3),
  ('Botas', 'calzado-botas', 4),
  ('Formal', 'calzado-formal', 5),
  ('Zapatos Planos', 'calzado-planos', 6)
) as v(name, slug, sort_order)
where c.name = 'Calzado' and c.parent_id is null;

-- ── Categorias principales nuevas + subcategorias ───────────────────────────────────────────────
do $$
declare
  v_parent_id bigint;
  v_sort int := 1;
  cat record;
begin
  for cat in
    select * from (values
      ('Moda Mujer', 'moda-mujer', array['Vestidos','Blusas y Camisas','Pantalones y Jeans','Faldas','Conjuntos','Ropa Interior y Pijamas','Trajes de Baño']),
      ('Moda Hombre', 'moda-hombre', array['Camisas y Camisetas','Pantalones y Jeans','Chaquetas y Abrigos','Ropa Interior','Ropa Deportiva']),
      ('Moda Infantil', 'moda-infantil', array['Ropa Niña','Ropa Niño','Ropa Bebé','Calzado Infantil']),
      ('Bolsos y Maletas', 'bolsos-maletas', array['Bolsos de Mano','Mochilas','Maletas de Viaje','Bolsos Deportivos','Riñoneras']),
      ('Joyería y Bisutería', 'joyeria-bisuteria', array['Anillos','Aretes','Collares','Pulseras','Relojes','Sets de Joyería']),
      ('Belleza y Cuidado Personal', 'belleza-cuidado-personal', array['Maquillaje','Cuidado Facial','Cuidado del Cabello','Perfumería','Manicure y Pedicure','Herramientas de Belleza']),
      ('Salud y Bienestar', 'salud-bienestar', array['Suplementos y Vitaminas','Equipos de Ejercicio','Cuidado Personal','Productos Ortopédicos']),
      ('Electrónica y Tecnología', 'electronica-tecnologia', array['Celulares y Accesorios','Audífonos y Parlantes','Smartwatches','Cámaras y Fotografía','Accesorios de Computador']),
      ('Hogar y Cocina', 'hogar-cocina', array['Decoración','Organización y Almacenamiento','Cocina y Electrodomésticos','Textiles para el Hogar','Iluminación']),
      ('Deportes y Aire Libre', 'deportes-aire-libre', array['Ropa Deportiva','Equipos de Gimnasio','Ciclismo','Camping y Senderismo','Accesorios Deportivos']),
      ('Mascotas', 'mascotas', array['Ropa y Accesorios','Juguetes para Mascotas','Alimentación','Aseo e Higiene']),
      ('Bebés y Maternidad', 'bebes-maternidad', array['Ropa de Bebé','Accesorios de Lactancia','Pañaleras y Maletas','Juguetes para Bebé','Cuidado del Bebé']),
      ('Juguetes y Entretenimiento', 'juguetes-entretenimiento', array['Juguetes Educativos','Peluches','Juegos de Mesa','Muñecas y Figuras','Juegos al Aire Libre']),
      ('Automóviles y Motos', 'automoviles-motos', array['Accesorios para Carro','Accesorios para Moto','Herramientas y Repuestos']),
      ('Papelería y Oficina', 'papeleria-oficina', array['Útiles Escolares','Organización de Oficina','Regalos y Detalles'])
    ) as t(name, slug, subs)
  loop
    insert into categories (name, slug, parent_id, sort_order)
    values (cat.name, cat.slug, null, v_sort)
    returning id into v_parent_id;

    insert into categories (name, slug, parent_id, sort_order)
    select sub, cat.slug || '-' || row_number() over (), v_parent_id, row_number() over ()
    from unnest(cat.subs) as sub;

    v_sort := v_sort + 1;
  end loop;
end $$;

-- ── Tipos de talla adicionales (ropa/ninos) -- el tipo de medida sigue siendo opcional ─────────
insert into size_types (name, sort_order)
values ('Talla Ropa (S-XL)', 1), ('Talla Ropa Numérica Dama', 2), ('Talla Niños', 3)
on conflict (name) do nothing;

insert into sizes (name, size_type_id, sort_order)
select v.name, st.id, v.sort_order
from size_types st
cross join (values ('XS',1),('S',2),('M',3),('L',4),('XL',5),('XXL',6)) as v(name, sort_order)
where st.name = 'Talla Ropa (S-XL)';

insert into sizes (name, size_type_id, sort_order)
select v.name, st.id, v.sort_order
from size_types st
cross join (values ('6',1),('8',2),('10',3),('12',4),('14',5),('16',6),('18',7)) as v(name, sort_order)
where st.name = 'Talla Ropa Numérica Dama';

insert into sizes (name, size_type_id, sort_order)
select v.name, st.id, v.sort_order
from size_types st
cross join (values ('0-3 meses',1),('3-6 meses',2),('6-12 meses',3),('1-2 años',4),('2-4 años',5),('4-6 años',6),('6-8 años',7),('8-10 años',8),('10-12 años',9)) as v(name, sort_order)
where st.name = 'Talla Niños';
