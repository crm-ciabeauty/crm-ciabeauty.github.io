-- Painel Cia Beauty — submódulo Lala Move (Financeiro › Contas a pagar)
-- Rodar depois do financeiro.sql. Guarda cada linha do extrato detalhado (Excel "Monthly Statement Detailed Breakdown").

create table if not exists public.fin_lalamove (
  id text primary key,                 -- chave da linha: conta|pedido|ação|horário|valor|forma|nº (reimportar não duplica)
  conta text not null,                 -- Company ID da Lalamove
  tipo text not null,                  -- ORDER ou TOP-UP
  acao text not null,                  -- Order, Priority fee, Refund, Refund - priority fee, Cancellation fee, Top-up...
  pedido text,                         -- Order ID
  quando timestamp not null,           -- horário da transação como vem no extrato
  forma text,                          -- Business wallet, Cash, Online payment
  valor numeric(14,2) not null,        -- negativo = gasto, positivo = recarga ou reembolso
  usuario text,
  periodo text not null,               -- mês do extrato (AAAA-MM)
  importado_por uuid default auth.uid(),
  importado_em timestamptz not null default now()
);
create index if not exists fin_lalamove_quando on public.fin_lalamove (quando);
create index if not exists fin_lalamove_pedido on public.fin_lalamove (pedido);

create table if not exists public.fin_lalamove_extratos (
  conta text not null,
  periodo text not null,               -- AAAA-MM
  empresa text,                        -- nome da conta na Lalamove
  empresa_doc text,                    -- empresa do grupo que paga
  de date, ate date,
  saldo_inicial numeric(14,2),
  saldo_final numeric(14,2),
  gerado_em text,
  arquivo text,
  linhas int,
  titulo_id uuid references public.fin_titulos(id) on delete set null,
  importado_por uuid default auth.uid(),
  importado_em timestamptz not null default now(),
  primary key (conta, periodo)
);

do $$ declare t text; begin
  foreach t in array array['fin_lalamove','fin_lalamove_extratos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_financeiro()) with check (public.pode_financeiro())', t||'_acesso', t);
  end loop;
end $$;

-- ===== BACKUP: inclui o Lala Move =====
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
      'conferencia', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_conferencia x), '[]'),
      'lalamove', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_lalamove x), '[]'),
      'lalamove_extratos', coalesce((select jsonb_agg(to_jsonb(x)) from public.fin_lalamove_extratos x), '[]'))
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
  delete from public.fin_lalamove_extratos; delete from public.fin_lalamove;
  delete from public.fin_compensacoes; delete from public.fin_baixas; delete from public.fin_titulos;
  delete from public.fin_conferencia; delete from public.fin_contas;
  insert into public.fin_contas select * from jsonb_populate_recordset(null::public.fin_contas, f->'contas');
  insert into public.fin_titulos select * from jsonb_populate_recordset(null::public.fin_titulos, f->'titulos');
  insert into public.fin_baixas select * from jsonb_populate_recordset(null::public.fin_baixas, f->'baixas');
  insert into public.fin_compensacoes select * from jsonb_populate_recordset(null::public.fin_compensacoes, f->'compensacoes');
  insert into public.fin_conferencia select * from jsonb_populate_recordset(null::public.fin_conferencia, f->'conferencia');
  if f ? 'lalamove' then
    insert into public.fin_lalamove select * from jsonb_populate_recordset(null::public.fin_lalamove, f->'lalamove');
  end if;
  if f ? 'lalamove_extratos' then
    insert into public.fin_lalamove_extratos select * from jsonb_populate_recordset(null::public.fin_lalamove_extratos, f->'lalamove_extratos');
  end if;
end $$;

revoke all on function public.fin_restaurar(jsonb) from public, anon;
grant execute on function public.fin_restaurar(jsonb) to authenticated;
revoke all on function public.fazer_backup(text) from public, anon;
grant execute on function public.fazer_backup(text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.fin_lalamove_extratos;
exception when duplicate_object then null; end $$;
