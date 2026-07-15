-- Campos de "Mi cuenta" (perfil.component.ts en Angular) que el formulario siempre pidio pero
-- UsuariosService.update() (ya en Supabase) nunca guardo desde la migracion de backend: se
-- escribian en pantalla y se perdian en silencio al apretar "Actualizar Datos". Se agregan aca
-- para que el port a Next.js (Fase 5, /config/perfil) los guarde de verdad.
--
-- OJO: supplier_doc_rut_url/supplier_doc_cc_url/supplier_doc_comercio_url y banner_url YA EXISTEN
-- desde 002_auth_profiles.sql -- ese es el mismo bug (columna creada, nunca mapeada en el update()
-- de UsuariosService), no hace falta crearlas de nuevo aca.

alter table profiles add column if not exists contact_email text;
alter table profiles add column if not exists facebook_url text;
alter table profiles add column if not exists instagram_url text;
alter table profiles add column if not exists youtube_url text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists gender text;
alter table profiles add column if not exists store_color text;
alter table profiles add column if not exists phone_country_code text default '57';

-- Especifico de proveedores (pestaña "Datos de bodegas"): tipo de proveedor, experiencia con
-- dropshipping, si ya paga publicidad en alguna plataforma.
alter table profiles add column if not exists supplier_type text; -- 'fabricante' | 'importador'
alter table profiles add column if not exists supplier_experience text; -- '0_6_meses' | '6_meses_1_anio' | 'mas_1_anio'
alter table profiles add column if not exists supplier_runs_ads boolean;
