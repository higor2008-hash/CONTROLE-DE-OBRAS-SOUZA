# Controle de Obras (Prefeitura de Edealina-GO)

Site estático (GitHub Pages) + Supabase. Usuário: fiscal de obras; toda a interface e os textos em português.

- `app.js` é o app inteiro em JS puro, sem build. Ele acessa dados só por `window.claude.use(nome)` (db, assets, sample, downloads, user), interface que veio da versão Artifact do claude.ai.
- `backend.js` implementa essa interface sobre o Supabase: tabela `obras` (id text, data jsonb), bucket público `arquivos` (nomes aleatórios), função `ler-documento` para leitura com Claude. Login é obrigatório antes de carregar `app.js`.
- Cada obra é um documento JSON: dados do contrato, `caixa`, `lat`/`lng`, `documentos[]`, `medicoes[]`, `cronograma[{mes,previsto}]`, `fotos[]`, `vistorias[]`, `pendencias[]`, `aditivos[]`, `relatorios[]`, `area` (`prefeitura` padrão | `pessoal`), `dono` (user id, obrigatório nas pessoais; RLS em `pode_ver_obra`/`pode_editar_obra`), `cliente`, `municipio`, `tipoObra`, `orcamento` (`dataBase`, `desonerado`, `bdi{}`, `itens[{nivel: meta|etapa|servico, fonte, codigo, descricao, unidade, custo, memoria, qtd}]`, `crono{inicio,meses,dist}`, `proposta{}`, `memorial{}`).
- Base SINAPI: `dados/sinapi/indice.json` + `GO-AAAA-MM.json` (itens `[0=SINAPI|1=SINAPI-I, código, descrição, unidade, desonerado, não desonerado]`), gerada por `ferramentas/sinapi_base.py`. A exportação para a Múltipla usa `dados/multipla/pm316_names.json`.
- Para testar sem Supabase: carregue `style.css` + um stub de `window.claude` + `app.js` numa página local (servida por HTTP, porque o orçamento busca `dados/`).
- Documentos (PDF/Word) da área pessoal usam `img/marca-higor.png` no lugar do papel timbrado da Prefeitura (`docObra`, `timbrePessoalDocx`).
- Mudanças no banco: atualize `supabase/schema.sql` de forma que possa ser rodado de novo sem apagar dados.
- Recursos e repasses: `ferramentas/monitor_recursos.py` (robô `recursos-diario.yml`, diário) grava `dados/recursos/edealina.json` (`fontes{}`, `itens[{id, tipo: convenio|obra|diario, titulo, numero, orgao, valor, liberado, situacao, vigenciaFim, url, primeiraVez, liberadoMudouEm}]`). `app.js` lê com `fetch` (`blocoRecursos` na lista da Prefeitura, `blocoRepasse` no resumo); a ficha se liga ao convênio pelos dígitos do número em `caixa.operacao`, `numero` ou `fonte` (`recDaObra`).
