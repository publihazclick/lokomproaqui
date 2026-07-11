-- Comentarios publicos en la pagina de un producto (formulario anonimo: nombre/email libres, sin
-- cuenta). Distinto de `testimonials` (testimonios curados del sitio, ligados a un profile_id).

create table product_comments (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  name text,
  email text,
  description text not null,
  status int not null default 0, -- 0 activo, 1 eliminado
  created_at timestamptz not null default now()
);

create index idx_product_comments_product on product_comments(product_id);

alter table product_comments enable row level security;
create policy "product_comments_all" on product_comments for all using (true) with check (true);
