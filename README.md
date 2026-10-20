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
3. Em **Authentication > Users**, clique em **Add user > Create new user**, coloque seu e-mail e uma senha e marque **Auto Confirm User**. Repita para cada pessoa que vai usar o site.
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

A chave fica guardada só no Supabase e nunca aparece no site. Só usuários logados conseguem usar a leitura.

## Bom saber

- No plano grátis, o Supabase pausa o projeto depois de 7 dias sem nenhum acesso. Para reativar, basta entrar no painel do Supabase e clicar em **Restore**.
- Cada arquivo enviado recebe um nome aleatório. O endereço do arquivo só aparece para quem está logado e abre a obra.
- O código deste repositório é público, mas os dados das obras não ficam aqui: ficam no Supabase, protegidos pelo login.

## Estrutura

- `index.html`, `style.css`: página e visual.
- `app.js`: telas e regras (obras, medições, cronograma, fotos, documentos).
- `backend.js`: login e ligação com o Supabase (banco, arquivos e leitura automática).
- `config.js`: endereço e chave pública do Supabase.
- `supabase/schema.sql`: estrutura do banco e obras iniciais.
- `supabase/functions/ler-documento/index.ts`: função que lê documentos com o Claude.
