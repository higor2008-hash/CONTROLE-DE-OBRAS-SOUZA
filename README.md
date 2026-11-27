# Controle de Obras — Prefeitura de Edealina

Site para a fiscalização acompanhar cada obra: dados do contrato, localização, projetos e PO, referências Caixa/SINAPI, medições com soma automática, cronograma previsto x realizado (curva S), relatório fotográfico, vistorias e pendências. Também lê contratos, boletins e cronogramas (PDF, Excel, Word ou foto) e preenche os campos sozinho.

## Como o site funciona

| Parte | Onde fica | Custo |
|---|---|---|
| Páginas do site | GitHub Pages (este repositório) | Grátis |
| Banco de dados, arquivos e login | Supabase | Grátis até 500 MB de dados e 1 GB de arquivos |
| Leitura automática de documentos | Função `ler-documento` no Supabase, que usa a API do Claude | Paga por uso, em geral alguns centavos por documento |

Endereço do site depois de publicado: **https://higor2008-hash.github.io/CONTROLE-DE-OBRAS-SOUZA/**

## Passo a passo para colocar no ar

### 1. Criar o banco no Supabase (uns 10 minutos)

1. Crie uma conta em <https://supabase.com> e clique em **New project**. Escolha um nome (ex.: `controle-obras`), uma senha forte para o banco e a região **South America (São Paulo)**.
2. No menu do projeto, abra **SQL Editor**, clique em **New query**, cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria a tabela das obras, a pasta de arquivos e já traz o Centro de Especialidades e o CMEI cadastrados.
3. Em **Authentication > Users**, clique em **Add user > Create new user**, coloque seu e-mail e uma senha e marque **Auto Confirm User**. Esse primeiro usuário vira o administrador. As outras pessoas você cadastra depois pelo próprio site, no botão **Equipe** (no fim da página), escolhendo o papel de cada uma: Administrador, Editor ou Só leitura.
4. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**. Assim só entra quem você cadastrou.
5. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.

### 2. Ligar o site ao banco

Aqui no GitHub, abra o arquivo [`config.js`](config.js), clique no lápis (Edit), troque os dois textos `COLE_AQUI_...` pelos valores copiados e clique em **Commit changes**.

### 3. Publicar o site

No GitHub, vá em **Settings > Pages**. Em **Build and deployment**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**. Em um ou dois minutos o site estará no endereço acima.

### 4. Ativar a leitura automática (opcional)

Sem esta etapa o site funciona normalmente, só que os campos são preenchidos à mão.

1. Crie uma conta em <https://console.anthropic.com>, coloque crédito em **Billing** e crie uma chave em **API Keys**.
2. No Supabase, abra **Edge Functions > Deploy a new function > Via Editor**. Dê o nome `ler-documento`, apague o código de exemplo, cole o conteúdo de [`supabase/functions/ler-documento/index.ts`](supabase/functions/ler-documento/index.ts) e clique em **Deploy**.
3. Em **Edge Functions > Secrets**, adicione o segredo `ANTHROPIC_API_KEY` com a chave criada no passo 1.

A chave fica guardada só no Supabase e nunca aparece no site. Só administradores e editores ativos da equipe conseguem usar a leitura, com limite de 30 leituras a cada 10 minutos e 300 por dia por pessoa.

## Bom saber

- No plano grátis, o Supabase pausa o projeto depois de 7 dias sem nenhum acesso. Para reativar, basta entrar no painel do Supabase e clicar em **Restore**.
- Cada arquivo enviado recebe um nome aleatório. O endereço do arquivo só aparece para quem está logado e abre a obra.
- O código deste repositório é público, mas os dados das obras não ficam aqui: ficam no Supabase, protegidos pelo login.

## Estrutura

- `index.html`, `style.css`: página e visual.
- `app.js`: telas e regras (obras, medições, cronograma, fotos, documentos).
- `backend.js`: login e ligação com o Supabase (banco, arquivos e leitura automática).
- `config.js`: endereço e chave pública do Supabase.
- `dados/sinapi/`: bases SINAPI-GO por mês e o índice das bases.
- `dados/multipla/pm316_names.json`: nomes definidos da Múltipla v3.16 usados no arquivo de importação.
- `dados/recursos/edealina.json`: convênios, obras federais e diário oficial de Edealina, gravado todo dia pelo robô `recursos-diario`.
- `ferramentas/monitor_recursos.py`: consulta as fontes públicas, grava esse arquivo e manda os avisos.
- `ferramentas/sinapi_base.py`: converte a planilha SINAPI da Caixa (ou a Referência) na base do site.
- `supabase/schema.sql`: estrutura do banco e obras iniciais.
- `supabase/functions/ler-documento/index.ts`: função que lê documentos com o Claude.

## Segurança

- Só entra quem está ativo na tabela `equipe`. Papéis: **Administrador** (vê, edita e cadastra pessoas), **Editor** (vê e edita) e **Só leitura**.
- As permissões valem no próprio banco (RLS), não só na tela: um leitor não consegue alterar nada mesmo chamando o Supabase direto.
- Ninguém é apagado: desativar uma pessoa bloqueia o login e mantém o histórico.
- O login trava por alguns minutos depois de 5 senhas erradas seguidas, além dos limites do próprio Supabase (**Authentication > Rate Limits**).
- As funções `ler-documento` e `equipe` conferem o login e o papel, têm limite de uso por pessoa e devolvem só mensagens genéricas de erro (os detalhes ficam em **Edge Functions > Logs**).
- O site só usa consultas parametrizadas do supabase-js e funções SQL sem SQL dinâmico, então não há ponto de entrada para SQL injection.

## Duas áreas: Prefeitura e Pessoal

Ao entrar, o site pergunta onde você quer ir:

- **Prefeitura de Edealina**: a fiscalização das obras do Município, com o logo e o papel timbrado da Prefeitura.
- **Pessoal**: as suas obras particulares, com a marca *Higor Rodrigues de Souza · Engenheiro Civil* no topo do site e em todos os PDFs e arquivos Word (sem timbre da Prefeitura).

Cada obra pertence a uma área (campo **Área** em Editar dados). As obras pessoais só aparecem para quem as criou: nem os outros membros da equipe da Prefeitura, nem os administradores, conseguem vê-las ou alterá-las, porque a regra fica no próprio banco. Para ativar essa regra, rode de novo o arquivo [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase (não apaga nada).

## Gestão da obra

Cada obra tem, além das abas originais:

- **Diário de obra**: tempo, chuva, temperatura, equipe, equipamentos, serviços e ocorrências do dia. O botão **Preencher automático** busca o clima do dia na localização da obra (Open-Meteo), marca feriados (BrasilAPI) e fins de semana, repete a equipe do último dia e puxa as legendas das fotos, as medições e as pendências. **Escrever com Claude** redige os serviços e as ocorrências a partir desses dados e das fotos do dia. Dias impraticáveis e a chuva somada ficam no topo da aba e no relatório geral.
- **Serviços**: etapas da planilha com valor e % executado; o site calcula o % físico da obra.
- **Notificações e prazos**: ofícios à empresa com prazo de resposta e documentos com validade (ART, alvará, seguro, licença).
- **Monitoramento**: alertas na tela inicial e no resumo de cada obra (prazo, visitas, pendências, notificações, medição acima do executado, documentos vencendo).

O **RDO (Relatório Diário de Obra)** sai no formato padrão: turnos de tempo, mão de obra por função, equipamentos, atividades, ocorrências, pendências, prazo decorrido/restante e assinatura do fiscal e do responsável da contratada, um por dia ou vários num arquivo.

Cada relatório (RDO, do dia, completo e o diário de vários dias) sai em **Word** ou **PDF**, no papel timbrado, com fotos e assinatura.

## Recursos e repasses para Edealina

Na tela inicial da Prefeitura há a seção **Recursos e repasses para Edealina**, atualizada sozinha todo dia às 7h17 pelo robô [`recursos-diario`](.github/workflows/recursos-diario.yml):

- **Convênios e contratos de repasse federais** (Portal da Transparência): valor, quanto já foi liberado, situação, órgão e vigência.
- **Obras federais** cadastradas no Obrasgov.br que citam Edealina.
- **Diário oficial** do município (Querido Diário), com menções a obra, convênio, licitação, emenda e repasse, se o município estiver coberto.

O que apareceu nos últimos 30 dias ganha a marca **Novo**; convênio com dinheiro liberado recentemente ganha **Nova liberação**. Em cada item:

- **Criar ficha desta obra** abre o cadastro já preenchido (nome, objeto, fonte de recurso e nº do convênio em *Contrato de repasse / operação*).
- Se a obra já tem ficha, o site liga os dois pelo número do convênio (campo *Contrato de repasse / operação*, nº do contrato ou fonte de recurso). A ficha passa a mostrar o quadro **Repasse do governo federal**: valor, contrapartida, quanto já foi liberado e a comparação com o medido. O Monitoramento avisa quando a vigência do convênio está para acabar.

Os dados ficam em `dados/recursos/edealina.json`. São informações públicas do governo, por isso podem ficar no repositório.

### Como ativar (uns 10 minutos)

1. **Chave do Portal da Transparência** (grátis, necessária para os convênios): entre em <https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email> com a conta gov.br. A chave chega por e-mail.
2. Aqui no GitHub, vá em **Settings > Secrets and variables > Actions > New repository secret** e crie `CHAVE_PORTAL` com a chave.
3. **Avisos no celular (opcional)**: no Telegram, fale com o `@BotFather`, mande `/newbot` e guarde o token. Mande uma mensagem qualquer para o seu bot e abra `https://api.telegram.org/bot<TOKEN>/getUpdates`; o número em `"chat":{"id": ...}` é o chat id. Crie os secrets `TG_TOKEN` e `TG_CHAT`.
4. **Avisos por e-mail (opcional)**: crie os secrets `SMTP_HOST` (ex.: `smtp.gmail.com`), `SMTP_PORT` (`587`), `SMTP_USER` (seu e-mail), `SMTP_PASS` (no Gmail, uma *senha de app*) e `EMAIL_PARA`.
5. Vá em **Actions > Recursos e repasses diário > Run workflow**. Na primeira vez ele só registra o que já existe e manda uma mensagem de "ativado"; depois avisa só o que for novo (convênio novo, nova liberação de dinheiro, obra nova, menção no diário).

Se uma fonte sair do ar, as outras continuam e o site mostra qual não respondeu. O código do IBGE usado é `5207352` (Edealina-GO); para trocar, edite `CODIGO_IBGE` em [`ferramentas/monitor_recursos.py`](ferramentas/monitor_recursos.py).

## Orçamento e proposta para a Caixa

Cada obra tem a aba **Orçamento**, com a planilha orçamentária no padrão da Múltipla:

- **Busca no SINAPI-GO** por código ou descrição (composições e insumos), com o preço da data-base escolhida, desonerado ou não. Itens fora do SINAPI entram como cotação ou composição própria.
- **Metas, etapas e serviços**, numerados 1, 1.1, 1.1.1, com **memória de cálculo** (ex.: `3*8*4` ou `2,5*3`) que calcula a quantidade.
- **BDI** pela fórmula do Acórdão TCU 2622/2013, com as faixas do TCU para o tipo de obra e aviso quando uma parcela sai da faixa. O preço com BDI é arredondado como na Múltipla (o orçamento do bueiro dá os mesmos R$ 6.006,88).
- **Cronograma físico-financeiro** por etapa e mês, com acumulado.
- **Memorial descritivo** por etapa, escrito à mão ou com o Claude a partir dos serviços.
- **Documentos em PDF e Word** no papel timbrado: planilha orçamentária, composição do BDI, memória de cálculo, cronograma, PLE (eventos por etapa), memorial descritivo, ou tudo num arquivo só.
- **Arquivo para a Múltipla**: um .xlsx que a própria Múltipla v3.16 importa pelo botão *Importar de outra Planilha Múltipla* (a macro da Caixa cria as linhas e preenche DADOS, BDI, ORÇAMENTO e CÁLCULO). Também sai a planilha simples em Excel.
- **Usar no controle da obra** passa as etapas com valor para a aba Serviços, o cronograma para a aba Cronograma e o total para os dados Caixa.

### Base SINAPI todo mês

A base de preços fica em `dados/sinapi/` (um arquivo por mês, Goiás). O robô [`sinapi-mensal`](.github/workflows/sinapi-mensal.yml) roda nos dias 12, 20 e 28, baixa o arquivo do mês no site da Caixa, converte com [`ferramentas/sinapi_base.py`](ferramentas/sinapi_base.py) e grava a base nova no site. Se a Caixa mudar o endereço ou o formato, ele falha e o GitHub manda e-mail, em vez de o site ficar com preço velho sem aviso. Para rodar na mão: **Actions > Base SINAPI mensal > Run workflow**. Também dá para gerar a base a partir da sua *Referência MM-AAAA.xlsm*: `python ferramentas/sinapi_base.py "Referência 06-2026.xlsm" 2026-06`.

Cada orçamento guarda o preço do mês em que foi feito. Mudar para a base nova é uma escolha sua, no botão **Atualizar preços SINAPI**.

Nada disso altera os dados antigos: são campos novos em cada obra, que começam vazios.
