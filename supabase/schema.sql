-- Controle de Obras: estrutura do banco no Supabase.
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo sem problema: nada é apagado.

-- Tabela das obras. Cada obra é um documento JSON com todos os dados da ficha.
create table if not exists public.obras (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Só quem está logado no site lê e altera as obras.
alter table public.obras enable row level security;
drop policy if exists "logados leem obras" on public.obras;
drop policy if exists "logados incluem obras" on public.obras;
drop policy if exists "logados alteram obras" on public.obras;
drop policy if exists "logados excluem obras" on public.obras;
create policy "logados leem obras" on public.obras for select to authenticated using (true);
create policy "logados incluem obras" on public.obras for insert to authenticated with check (true);
create policy "logados alteram obras" on public.obras for update to authenticated using (true) with check (true);
create policy "logados excluem obras" on public.obras for delete to authenticated using (true);

-- Atualização em tempo real (duas abas abertas veem as mudanças uma da outra).
do $$ begin
  alter publication supabase_realtime add table public.obras;
exception when duplicate_object then null; end $$;

-- Arquivos (projetos, PO, medições, fotos). Cada arquivo recebe um nome aleatório;
-- o endereço só é conhecido por quem vê a obra no site. Limite de 50 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', true, 52428800)
on conflict (id) do nothing;
drop policy if exists "logados enviam arquivos" on storage.objects;
drop policy if exists "logados alteram arquivos" on storage.objects;
drop policy if exists "logados apagam arquivos" on storage.objects;
create policy "logados enviam arquivos" on storage.objects for insert to authenticated with check (bucket_id = 'arquivos');
create policy "logados alteram arquivos" on storage.objects for update to authenticated using (bucket_id = 'arquivos');
create policy "logados apagam arquivos" on storage.objects for delete to authenticated using (bucket_id = 'arquivos');

-- Obras já cadastradas (copiadas do primeiro site). Não substitui se já existirem.
insert into public.obras (id, data) values
  ('centro-de-especialidades', $obra${"aditivos": [], "atualizadoEm": "2026-10-19T19:40:00.000Z", "caixa": {"valorPO": 22000}, "cnpj": "18.257.984/0001-56", "dataInicio": "2026-04-16", "empresa": "Rogerio Garcia da Silva Mendes", "endereco": "Anexo da Câmara Municipal, Edealina-GO", "fonte": "Fundo Municipal de Saúde", "lat": -17.425833, "lng": -49.66, "modalidade": "Compra direta, sem instrumento contratual", "nome": "Centro de Especialidades (Anexo da Câmara Municipal)", "numero": "NFS-e nº 112 de 12/11/2025", "objeto": "Paredes em gesso acartonado (115,81 m) com lã de vidro para isolamento acústico (115,81 m) e 4 conjuntos de porta completa e montada", "observacoes": "Valor de R$ 22.000,00 pago integralmente em dezembro de 2025, antes do início. Execução adiada cerca de 6 meses por falta de entrega do imóvel pela Câmara; autorizada em 16/04/2026.\nNa vistoria de 17/10/2026 as paredes estavam sendo fechadas sem a manta de lã de vidro. Fechamento das paredes paralisado; prazo final e improrrogável em 19 e 20/10/2026. Se não concluir, encaminhar à Procuradoria Jurídica (Lei 14.133/2021).", "pendencias": [{"prazo": "2026-10-20", "resolvida": false, "texto": "Retirar as chapas fixadas sem manta (fotos 11 a 14) e instalar a lã de vidro, sem ônus ao Município"}, {"prazo": "2026-10-20", "resolvida": false, "texto": "Concluir integralmente os serviços (paredes, juntas e 4 portas)"}, {"prazo": "2026-10-21", "resolvida": false, "texto": "Se não concluído até 20/10, encaminhar o caso à Procuradoria Jurídica"}], "percentual": null, "prazoFinal": "2026-10-20", "relatorios": [{"arquivo": "relatorios/Relatorio_Obra_em_Atraso_Centro_de_Especialidades.docx", "data": "2026-10-19", "titulo": "Relatório técnico de obra em atraso"}], "situacao": "paralisada", "valor": 22000, "vistorias": [{"data": "2026-10-17", "obs": "Paredes sendo fechadas sem manta de isolamento acústico. Serviço de fechamento paralisado e contratada notificada.", "percentual": null, "situacao": "paralisada"}]}$obra$::jsonb),
  ('cmei-proinfancia', $obra${"aditivos": [{"data": "2026-06-12", "descricao": "Prorrogação de vigência e execução por 12 meses, sem alteração de valor", "novoPrazo": "2027-06-11", "numero": "1º", "valor": null}], "atualizadoEm": "2026-10-19T19:40:00.000Z", "caixa": {"operacao": "Transferegov nº 968155/2024 (FNDE, Novo PAC)"}, "cnpj": "57.740.956/0001-47", "dataInicio": "2025-06-12", "empresa": "CR Transporte e Serviços Ltda.", "endereco": "Lot. Complemento Edealina II, Qd 02, Lt 01 e 02", "fonte": "Fundo Municipal de Educação, FNDE Proinfância (Transferegov 968155/2024)", "modalidade": "Concorrência Eletrônica nº 001/2025, empreitada por preço global", "nome": "CMEI Proinfância Tipo 02", "numero": "Contrato nº 124/2025", "objeto": "Construção de Centro Municipal de Educação Infantil, Projeto Padrão Tipo 02, Programa Proinfância", "observacoes": "Obra parada na fase de estrutura e alvenaria, sem trabalhadores. Armaduras expostas, alvenarias desabadas, vegetação no canteiro, tapume tombado na via pública e placa danificada.", "pendencias": [{"prazo": "", "resolvida": false, "texto": "Notificar a contratada para retomar os serviços e justificar a paralisação"}, {"prazo": "", "resolvida": false, "texto": "Recompor o tapume e isolar o canteiro com sinalização"}, {"prazo": "", "resolvida": false, "texto": "Proteger armaduras, limpar o canteiro e retirar a vegetação"}, {"prazo": "", "resolvida": false, "texto": "Verificar cláusula 3.1 do 1º aditivo (cronograma, % executado, garantia de 5%)"}, {"prazo": "", "resolvida": false, "texto": "Instaurar processo de apuração do atraso (cláusula 5.2 do aditivo)"}, {"prazo": "", "resolvida": false, "texto": "Comunicar a situação ao FNDE"}], "percentual": null, "prazoFinal": "2026-06-11", "relatorios": [{"arquivo": "relatorios/Relatorio_Vistoria_Obra_Paralisada_CMEI.docx", "data": "2026-10-19", "titulo": "Relatório de vistoria, obra paralisada"}], "situacao": "paralisada", "valor": 2395000, "vistorias": [{"data": "2026-10-19", "obs": "Canteiro abandonado, sem atividade. Estrutura e alvenaria parciais.", "percentual": null, "situacao": "paralisada"}]}$obra$::jsonb)
on conflict (id) do nothing;
