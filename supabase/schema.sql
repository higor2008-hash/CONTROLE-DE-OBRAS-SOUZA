-- Controle de Obras: estrutura do banco no Supabase.
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo sem problema: nada é apagado.

-- Tabela das obras. Cada obra é um documento JSON com todos os dados da ficha.
create table if not exists public.obras (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Só a equipe cadastrada lê e altera as obras (regras na parte "Equipe" no fim do arquivo).
alter table public.obras enable row level security;

-- Atualização em tempo real (duas abas abertas veem as mudanças uma da outra).
do $$ begin
  alter publication supabase_realtime add table public.obras;
exception when duplicate_object then null; end $$;

-- Arquivos (projetos, PO, medições, fotos). Cada arquivo recebe um nome aleatório;
-- o endereço só é conhecido por quem vê a obra no site. Limite de 50 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', true, 52428800)
on conflict (id) do nothing;

-- Segurança extra: visitantes sem login não têm acesso à tabela, ninguém apaga a tabela inteira
-- e o bucket só aceita os tipos de arquivo usados pelo site (nada de HTML, SVG ou scripts).
revoke all on table public.obras from anon;
revoke truncate, references, trigger on table public.obras from authenticated;
update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf','text/plain','text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/octet-stream'
] where id = 'arquivos';

-- Obras já cadastradas (copiadas do primeiro site). Não substitui se já existirem.
insert into public.obras (id, data) values
  ('centro-de-especialidades', $obra${"aditivos": [], "atualizadoEm": "2026-10-19T19:40:00.000Z", "caixa": {"valorPO": 22000}, "cnpj": "18.257.984/0001-56", "dataInicio": "2026-04-16", "empresa": "Rogerio Garcia da Silva Mendes", "endereco": "Anexo da Câmara Municipal, Edealina-GO", "fonte": "Fundo Municipal de Saúde", "lat": -17.425833, "lng": -49.66, "modalidade": "Compra direta, sem instrumento contratual", "nome": "Centro de Especialidades (Anexo da Câmara Municipal)", "numero": "NFS-e nº 112 de 12/11/2025", "objeto": "Paredes em gesso acartonado (115,81 m) com lã de vidro para isolamento acústico (115,81 m) e 4 conjuntos de porta completa e montada", "observacoes": "Valor de R$ 22.000,00 pago integralmente em dezembro de 2025, antes do início. Execução adiada cerca de 6 meses por falta de entrega do imóvel pela Câmara; autorizada em 16/04/2026.\nNa vistoria de 17/10/2026 as paredes estavam sendo fechadas sem a manta de lã de vidro. Fechamento das paredes paralisado; prazo final e improrrogável em 19 e 20/10/2026. Se não concluir, encaminhar à Procuradoria Jurídica (Lei 14.133/2021).", "pendencias": [{"prazo": "2026-10-20", "resolvida": false, "texto": "Retirar as chapas fixadas sem manta (fotos 11 a 14) e instalar a lã de vidro, sem ônus ao Município"}, {"prazo": "2026-10-20", "resolvida": false, "texto": "Concluir integralmente os serviços (paredes, juntas e 4 portas)"}, {"prazo": "2026-10-21", "resolvida": false, "texto": "Se não concluído até 20/10, encaminhar o caso à Procuradoria Jurídica"}], "percentual": null, "prazoFinal": "2026-10-20", "relatorios": [{"arquivo": "relatorios/Relatorio_Obra_em_Atraso_Centro_de_Especialidades.docx", "data": "2026-10-19", "titulo": "Relatório técnico de obra em atraso"}], "situacao": "paralisada", "valor": 22000, "vistorias": [{"data": "2026-10-17", "obs": "Paredes sendo fechadas sem manta de isolamento acústico. Serviço de fechamento paralisado e contratada notificada.", "percentual": null, "situacao": "paralisada"}]}$obra$::jsonb),
  ('cmei-proinfancia', $obra${"aditivos": [{"data": "2026-06-12", "descricao": "Prorrogação de vigência e execução por 12 meses, sem alteração de valor", "novoPrazo": "2027-06-11", "numero": "1º", "valor": null}], "atualizadoEm": "2026-10-19T19:40:00.000Z", "caixa": {"operacao": "Transferegov nº 968155/2024 (FNDE, Novo PAC)"}, "cnpj": "57.740.956/0001-47", "dataInicio": "2025-06-12", "empresa": "CR Transporte e Serviços Ltda.", "endereco": "Lot. Complemento Edealina II, Qd 02, Lt 01 e 02", "fonte": "Fundo Municipal de Educação, FNDE Proinfância (Transferegov 968155/2024)", "modalidade": "Concorrência Eletrônica nº 001/2025, empreitada por preço global", "nome": "CMEI Proinfância Tipo 02", "numero": "Contrato nº 124/2025", "objeto": "Construção de Centro Municipal de Educação Infantil, Projeto Padrão Tipo 02, Programa Proinfância", "observacoes": "Obra parada na fase de estrutura e alvenaria, sem trabalhadores. Armaduras expostas, alvenarias desabadas, vegetação no canteiro, tapume tombado na via pública e placa danificada.", "pendencias": [{"prazo": "", "resolvida": false, "texto": "Notificar a contratada para retomar os serviços e justificar a paralisação"}, {"prazo": "", "resolvida": false, "texto": "Recompor o tapume e isolar o canteiro com sinalização"}, {"prazo": "", "resolvida": false, "texto": "Proteger armaduras, limpar o canteiro e retirar a vegetação"}, {"prazo": "", "resolvida": false, "texto": "Verificar cláusula 3.1 do 1º aditivo (cronograma, % executado, garantia de 5%)"}, {"prazo": "", "resolvida": false, "texto": "Instaurar processo de apuração do atraso (cláusula 5.2 do aditivo)"}, {"prazo": "", "resolvida": false, "texto": "Comunicar a situação ao FNDE"}], "percentual": null, "prazoFinal": "2026-06-11", "relatorios": [{"arquivo": "relatorios/Relatorio_Vistoria_Obra_Paralisada_CMEI.docx", "data": "2026-10-19", "titulo": "Relatório de vistoria, obra paralisada"}], "situacao": "paralisada", "valor": 2395000, "vistorias": [{"data": "2026-10-19", "obs": "Canteiro abandonado, sem atividade. Estrutura e alvenaria parciais.", "percentual": null, "situacao": "paralisada"}]}$obra$::jsonb)
on conflict (id) do nothing;

-- ========== Equipe, permissões por papel e limite de uso ==========
-- Equipe: só quem está aqui e ativo acessa o site.
--   admin  = vê, edita e cadastra pessoas
--   editor = vê e edita as obras
--   leitor = só vê
create table if not exists public.equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  papel text not null default 'leitor' check (papel in ('admin', 'editor', 'leitor')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.equipe enable row level security;
revoke all on table public.equipe from anon, authenticated;
grant select on table public.equipe to authenticated;

-- O primeiro usuário cadastrado vira administrador quando a equipe ainda está vazia.
insert into public.equipe (user_id, email, papel)
select id, email, 'admin' from auth.users
where not exists (select 1 from public.equipe)
order by created_at limit 1
on conflict (user_id) do nothing;

-- Papel de quem está logado (nulo se não for da equipe ou estiver desativado).
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = ''
as $$ select papel from public.equipe where user_id = auth.uid() and ativo $$;
revoke all on function public.meu_papel() from public, anon;
grant execute on function public.meu_papel() to authenticated;

drop policy if exists "ver equipe" on public.equipe;
create policy "ver equipe" on public.equipe for select to authenticated
  using (user_id = auth.uid() or public.meu_papel() = 'admin');

-- Obras: ler exige ser da equipe; incluir, alterar e excluir exige admin ou editor.
drop policy if exists "logados leem obras" on public.obras;
drop policy if exists "logados incluem obras" on public.obras;
drop policy if exists "logados alteram obras" on public.obras;
drop policy if exists "logados excluem obras" on public.obras;
drop policy if exists "equipe le obras" on public.obras;
drop policy if exists "editores incluem obras" on public.obras;
drop policy if exists "editores alteram obras" on public.obras;
drop policy if exists "editores excluem obras" on public.obras;
create policy "equipe le obras" on public.obras for select to authenticated
  using (public.meu_papel() is not null);
create policy "editores incluem obras" on public.obras for insert to authenticated
  with check (public.meu_papel() in ('admin', 'editor'));
create policy "editores alteram obras" on public.obras for update to authenticated
  using (public.meu_papel() in ('admin', 'editor')) with check (public.meu_papel() in ('admin', 'editor'));
create policy "editores excluem obras" on public.obras for delete to authenticated
  using (public.meu_papel() in ('admin', 'editor'));

-- Arquivos: enviar, alterar e apagar exige admin ou editor.
drop policy if exists "logados enviam arquivos" on storage.objects;
drop policy if exists "logados alteram arquivos" on storage.objects;
drop policy if exists "logados apagam arquivos" on storage.objects;
drop policy if exists "editores enviam arquivos" on storage.objects;
drop policy if exists "editores alteram arquivos" on storage.objects;
drop policy if exists "editores apagam arquivos" on storage.objects;
create policy "editores enviam arquivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and public.meu_papel() in ('admin', 'editor'));
create policy "editores alteram arquivos" on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and public.meu_papel() in ('admin', 'editor'))
  with check (bucket_id = 'arquivos' and public.meu_papel() in ('admin', 'editor'));
create policy "editores apagam arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and public.meu_papel() in ('admin', 'editor'));

-- Limite de uso por pessoa (usado pelas funções do servidor; o site não acessa direto).
create table if not exists public.limites_uso (
  user_id uuid not null,
  janela text not null,
  inicio timestamptz not null default now(),
  qtd integer not null default 0,
  primary key (user_id, janela)
);
alter table public.limites_uso enable row level security;
revoke all on table public.limites_uso from anon, authenticated;

create or replace function public.consumir_cota(p_user uuid, p_janela text, p_segundos integer, p_max integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sem permissão';
  end if;
  insert into public.limites_uso as l (user_id, janela, inicio, qtd) values (p_user, p_janela, now(), 1)
  on conflict (user_id, janela) do update set
    qtd = case when l.inicio < now() - make_interval(secs => p_segundos) then 1 else l.qtd + 1 end,
    inicio = case when l.inicio < now() - make_interval(secs => p_segundos) then now() else l.inicio end
  returning qtd into n;
  return n <= p_max;
end $$;
revoke all on function public.consumir_cota(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_cota(uuid, text, integer, integer) to service_role;
