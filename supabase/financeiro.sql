-- Painel Cia Beauty — módulo Financeiro (contas a pagar/receber, antecipações, conferência de notas)
-- Rodar depois do schema.sql. Acesso: administrador, master ou usuário com a aba "financeiro" liberada.

create or replace function public.pode_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and ativo
                 and (papel in ('admin','master') or 'financeiro' = any(abas)))
$$;

create table if not exists public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  empresa_doc text,
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo date not null default current_date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.fin_titulos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar','receber')),
  origem text not null default 'manual' check (origem in ('nf','antecipacao','folha','lalamove','por_fora','manual')),
  empresa_doc text,
  contraparte text not null default '',
  contraparte_doc text,
  descricao text not null default '',
  categoria text,
  nf_chave text,
  nf_num text,
  parcela text,
  emissao date,
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  obs text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fin_titulos_tipo_venc on public.fin_titulos (tipo, vencimento);
create index if not exists fin_titulos_doc on public.fin_titulos (contraparte_doc);
create unique index if not exists fin_titulos_nf_parcela on public.fin_titulos (nf_chave, parcela) where nf_chave is not null;

create table if not exists public.fin_baixas (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references public.fin_titulos(id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  conta_id uuid references public.fin_contas(id) on delete set null,
  forma text,
  obs text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fin_baixas_titulo on public.fin_baixas (titulo_id);
create index if not exists fin_baixas_data on public.fin_baixas (data);

-- abatimento de uma antecipação (título origem 'antecipacao') num título de nota
create table if not exists public.fin_compensacoes (
  id uuid primary key default gen_random_uuid(),
  antecipacao_id uuid not null references public.fin_titulos(id) on delete cascade,
  titulo_id uuid not null references public.fin_titulos(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  data date not null default current_date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- decisão da conferência de cada nota (gera ou não gera título)
create table if not exists public.fin_conferencia (
  chave text primary key,
  decisao text not null check (decisao in ('gera','nao_gera')),
  categoria text,
  obs text,
  conferido_por uuid default auth.uid(),
  conferido_em timestamptz not null default now()
);

create or replace function public.fin_carimbo() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists fin_titulos_carimbo on public.fin_titulos;
create trigger fin_titulos_carimbo before update on public.fin_titulos for each row execute function public.fin_carimbo();

do $$ declare t text; begin
  foreach t in array array['fin_contas','fin_titulos','fin_baixas','fin_compensacoes','fin_conferencia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro())', t||'_acesso', t);
  end loop;
end $$;

-- ===== BACKUP: inclui o financeiro nas cópias e na restauração =====
create or replace function public.fazer_backup(p_tipo text default 'manual') returns bigint
language plpgsql security definer set search_path = public as $$
declare v jsonb; novo bigint;
begin
  if auth.uid() is not null and not public.sou_gestor() then
    raise exception 'Só o administrador ou o master podem criar cópias.';
  end if;
  select jsonb_build_object(
    'gerado_em', now(),
    'base', coalesce((select jsonb_agg(jsonb_build_object('chave', chave, 'conteudo', conteudo)) from public.base), '[]'),
    'registros', coalesce((select jsonb_agg(jsonb_build_object('colecao', colecao, 'id', id, 'dados', dados)) from public.registros), '[]'),
    'perfis', coalesce((select jsonb_agg(to_jsonb(p)) from public.perfis p), '[]'),
    'qtd_xml', (select count(*) from public.notas_xml),
    'fin', jsonb_build_object(
      'contas', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_contas x), '[]'),
      'titulos', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_titulos x), '[]'),
      'baixas', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_baixas x), '[]'),
      'compensacoes', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_compensacoes x), '[]'),
      'conferencia', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_conferencia x), '[]'))
  ) into v;
  insert into public.backups (tipo, tamanho, conteudo) values (coalesce(p_tipo, 'manual'), octet_length(v::text), v) returning id into novo;
  delete from public.backups where tipo = 'automatico' and id not in (select id from public.backups where tipo = 'automatico' order by criado_em desc limit 14);
  delete from public.backups where tipo <> 'automatico' and id not in (select id from public.backups where tipo <> 'automatico' order by criado_em desc limit 10);
  return novo;
end $$;

create or replace function public.fin_restaurar(f jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.sou_admin() then raise exception 'Só o administrador do sistema pode restaurar.'; end if;
  if f is null then return; end if;
  delete from public.fin_compensacoes; delete from public.fin_baixas; delete from public.fin_titulos;
  delete from public.fin_conferencia; delete from public.fin_contas;
  insert into public.fin_contas select * from jsonb_populate_recordset(null::public.fin_contas, f->'contas');
  insert into public.fin_titulos select * from jsonb_populate_recordset(null::public.fin_titulos, f->'titulos');
  insert into public.fin_baixas select * from jsonb_populate_recordset(null::public.fin_baixas, f->'baixas');
  insert into public.fin_compensacoes select * from jsonb_populate_recordset(null::public.fin_compensacoes, f->'compensacoes');
  insert into public.fin_conferencia select * from jsonb_populate_recordset(null::public.fin_conferencia, f->'conferencia');
end $$;

create or replace function public.restaurar_backup(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.sou_admin() then raise exception 'Só o administrador do sistema pode restaurar.'; end if;
  select conteudo into v from public.backups where id = p_id;
  if v is null then raise exception 'Cópia não encontrada.'; end if;
  perform public.fazer_backup('antes da restauração');
  delete from public.base;
  insert into public.base (chave, conteudo) select x->>'chave', x->>'conteudo' from jsonb_array_elements(v->'base') x;
  delete from public.registros;
  insert into public.registros (colecao, id, dados) select x->>'colecao', x->>'id', x->'dados' from jsonb_array_elements(v->'registros') x;
  if v ? 'fin' then perform public.fin_restaurar(v->'fin'); end if;
end $$;

revoke all on function public.fin_restaurar(jsonb) from public, anon;
grant execute on function public.fin_restaurar(jsonb) to authenticated;
revoke all on function public.fazer_backup(text) from public, anon;
revoke all on function public.restaurar_backup(bigint) from public, anon;
grant execute on function public.fazer_backup(text) to authenticated;
grant execute on function public.restaurar_backup(bigint) to authenticated;

-- tempo real (as telas do financeiro se atualizam quando outra pessoa lança algo)
alter publication supabase_realtime add table public.fin_titulos, public.fin_baixas, public.fin_compensacoes, public.fin_conferencia, public.fin_contas;
