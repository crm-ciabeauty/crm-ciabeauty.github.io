-- Painel Cia Beauty — banco (Supabase). Rodar uma vez num projeto novo.

-- ===== TABELAS =====
create table if not exists public.base (
  chave text primary key,
  conteudo text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  papel text not null default 'leitor' check (papel in ('admin','master','editor','leitor')),
  abas text[] not null default array['inicio','entregas','simulador','carteira','compras','notas','vendas','estoque'],
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.registros (
  colecao text not null,
  id text not null,
  dados jsonb not null,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (colecao, id)
);

-- XMLs das NF-e: um por nota, baixado só quando alguém abre a nota
create table if not exists public.notas_xml (
  chave text primary key,
  xml text not null,
  emissao date,
  tp_nf text,
  origem text not null default 'importada',
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists notas_xml_emissao on public.notas_xml (emissao);

create table if not exists public.config (
  chave text primary key,
  valor jsonb,
  atualizado_em timestamptz not null default now()
);

-- cópias de segurança feitas dentro do banco (automáticas e manuais)
create table if not exists public.backups (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  tipo text not null,
  tamanho bigint,
  conteudo jsonb not null
);

-- ===== FUNÇÕES DE PERMISSÃO =====
create or replace function public.meu_papel() returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where user_id = auth.uid() and ativo
$$;
create or replace function public.pode_ler() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and ativo)
$$;
create or replace function public.pode_editar() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin','master','editor'), false)
$$;
create or replace function public.sou_gestor() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin','master'), false)
$$;
create or replace function public.sou_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false)
$$;
-- compatibilidade com o nome antigo
create or replace function public.sou_master() returns boolean language sql stable security definer set search_path = public as $$
  select public.sou_gestor()
$$;

-- carimbo de quem alterou
create or replace function public.carimbar() returns trigger language plpgsql as $$
begin
  new.atualizado_por := auth.uid();
  new.atualizado_em  := now();
  return new;
end $$;
drop trigger if exists registros_carimbo on public.registros;
create trigger registros_carimbo before insert or update on public.registros for each row execute function public.carimbar();

-- ===== RLS =====
alter table public.base      enable row level security;
alter table public.perfis    enable row level security;
alter table public.registros enable row level security;
alter table public.notas_xml enable row level security;
alter table public.config    enable row level security;
alter table public.backups   enable row level security;

create policy base_ler      on public.base for select to authenticated using (pode_ler());
create policy base_gravar   on public.base for insert to authenticated with check (sou_gestor());
create policy base_alterar  on public.base for update to authenticated using (sou_gestor()) with check (sou_gestor());

create policy perfis_ler    on public.perfis for select to authenticated using (user_id = auth.uid() or pode_ler());

create policy reg_ler       on public.registros for select to authenticated using (pode_ler());
create policy reg_inserir   on public.registros for insert to authenticated with check (pode_editar());
create policy reg_alterar   on public.registros for update to authenticated using (pode_editar()) with check (pode_editar());
create policy reg_apagar    on public.registros for delete to authenticated using (pode_editar());

create policy xml_ler       on public.notas_xml for select to authenticated using (pode_ler());
create policy xml_inserir   on public.notas_xml for insert to authenticated with check (pode_editar());
create policy xml_alterar   on public.notas_xml for update to authenticated using (pode_editar()) with check (pode_editar());
create policy xml_apagar    on public.notas_xml for delete to authenticated using (sou_gestor());

create policy config_ler    on public.config for select to authenticated using (pode_ler());
create policy config_gravar on public.config for insert to authenticated with check (sou_gestor());
create policy config_alterar on public.config for update to authenticated using (sou_gestor()) with check (sou_gestor());

create policy backups_ler   on public.backups for select to authenticated using (sou_gestor());

-- ===== BACKUP =====
-- Guarda base + registros + perfis (os XMLs não mudam; ficam no backup completo baixado pelo painel).
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
    'qtd_xml', (select count(*) from public.notas_xml)
  ) into v;
  insert into public.backups (tipo, tamanho, conteudo) values (coalesce(p_tipo, 'manual'), octet_length(v::text), v) returning id into novo;
  -- mantém as 14 automáticas e as 10 manuais/outras mais recentes
  delete from public.backups where tipo = 'automatico' and id not in (select id from public.backups where tipo = 'automatico' order by criado_em desc limit 14);
  delete from public.backups where tipo <> 'automatico' and id not in (select id from public.backups where tipo <> 'automatico' order by criado_em desc limit 10);
  return novo;
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
end $$;

revoke all on function public.fazer_backup(text) from public, anon;
revoke all on function public.restaurar_backup(bigint) from public, anon;
grant execute on function public.fazer_backup(text) to authenticated;
grant execute on function public.restaurar_backup(bigint) to authenticated;

-- backup automático todo dia às 03:00 (horário de Brasília = 06:00 UTC)
create extension if not exists pg_cron;
select cron.schedule('backup-diario', '0 6 * * *', $$select public.fazer_backup('automatico')$$);

-- ===== MANTER O PROJETO ATIVO =====
-- Chamado a cada 3 dias pelo GitHub (.github/workflows/manter-ativo.yml) para o plano gratuito não pausar.
create table if not exists public.pings (id int primary key default 1, em timestamptz not null default now());
alter table public.pings enable row level security;
create or replace function public.manter_ativo() returns timestamptz
language sql security definer set search_path = public as $$
  insert into public.pings (id, em) values (1, now()) on conflict (id) do update set em = now() returning em
$$;
grant execute on function public.manter_ativo() to anon, authenticated;

-- realtime da tabela registros (o painel atualiza sozinho quando alguém altera)
alter publication supabase_realtime add table public.registros;
