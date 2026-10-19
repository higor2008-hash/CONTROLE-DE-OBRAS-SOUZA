# Controle de Obras (Prefeitura de Edealina-GO)

Site estático (GitHub Pages) + Supabase. Usuário: fiscal de obras; toda a interface e os textos em português.

- `app.js` é o app inteiro em JS puro, sem build. Ele acessa dados só por `window.claude.use(nome)` (db, assets, sample, downloads, user), interface que veio da versão Artifact do claude.ai.
- `backend.js` implementa essa interface sobre o Supabase: tabela `obras` (id text, data jsonb), bucket público `arquivos` (nomes aleatórios), função `ler-documento` para leitura com Claude. Login é obrigatório antes de carregar `app.js`.
- Cada obra é um documento JSON: dados do contrato, `caixa`, `lat`/`lng`, `documentos[]`, `medicoes[]`, `cronograma[{mes,previsto}]`, `fotos[]`, `vistorias[]`, `pendencias[]`, `aditivos[]`, `relatorios[]`.
- Para testar sem Supabase: carregue `style.css` + um stub de `window.claude` + `app.js` numa página local.
- Mudanças no banco: atualize `supabase/schema.sql` de forma que possa ser rodado de novo sem apagar dados.
