alter table product_variants add column if not exists images jsonb not null default '[]'::jsonb;
