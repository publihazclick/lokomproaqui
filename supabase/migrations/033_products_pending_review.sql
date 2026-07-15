-- La pestaña admin "Productos por Activar de proveedor" (FormproductosComponent/TableProductComponent
-- en Angular) necesita distinguir un producto RECIEN CREADO por un proveedor, esperando aprobacion
-- del admin ("pendiente"), de uno DESACTIVADO/borrado -- pero `products.active` es un solo booleano,
-- las dos cosas colapsan en el mismo `active = false` y son indistinguibles hoy. Se agrega una
-- columna dedicada para poder filtrar de verdad.

alter table products add column if not exists pending_review boolean not null default false;
