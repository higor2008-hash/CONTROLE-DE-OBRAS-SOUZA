/* Controle de Obras: telas e regras. Os dados vêm de backend.js (Supabase). */
(function () {
  const SIT = { andamento: "Em andamento", atrasada: "Atrasada", paralisada: "Paralisada", nao_iniciada: "Não iniciada", concluida: "Concluída" };
  const CATS = ["Projeto arquitetônico", "Projeto estrutural", "Projeto elétrico", "Projeto hidrossanitário", "Outros projetos",
    "PO / Planilha orçamentária", "Referências Caixa / SINAPI", "Cronograma físico-financeiro", "Memorial descritivo",
    "ART / RRT", "Contrato e aditivos", "Outros documentos"];
  const TABS = [["resumo", "Resumo"], ["orcamento", "Orçamento"], ["diario", "Diário de obra"], ["servicos", "Serviços"], ["documentos", "Projetos e documentos"], ["medicoes", "Medições"], ["cronograma", "Cronograma"], ["fotos", "Fotos"], ["vistorias", "Vistorias e pendências"], ["notificacoes", "Notificações e prazos"]];
  const TIPOS_OBRA = ["Edificação nova", "Reforma e ampliação", "Pavimentação e recapeamento", "Drenagem e bueiros", "Praça, parque e paisagismo",
    "Rede de água e esgoto", "Rede elétrica e iluminação pública", "Ponte e obra de arte especial", "Quadra e equipamento esportivo", "Habitação / casa", "Outra"];
  /* Duas áreas no mesmo site: a fiscalização da Prefeitura e as obras pessoais do engenheiro */
  const AREAS = {
    prefeitura: { nome: "Prefeitura de Edealina", eyebrow: "Prefeitura Municipal de Edealina · Fiscalização de Obras", titulo: "Controle de Obras", resumo: "Fiscalização das obras do Município" },
    pessoal: { nome: "Higor Rodrigues de Souza", eyebrow: "Obras particulares · Orçamentos e projetos", titulo: "Minhas Obras", resumo: "Obras, orçamentos e projetos particulares" }
  };
  const areaDe = o => o && o.area === "pessoal" ? "pessoal" : "prefeitura";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const SHEETJS = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"];
  const MAMMOTH = ["https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js", "https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js"];
  const ACEITA = "application/pdf,image/*,.csv,text/csv,.txt,.xlsx,.xlsm,.xls,.ods,.docx,.doc,.odt";
  const PLANILHA = /\.(xlsx|xlsm|xls|ods|csv)$/i, TEXTO = /\.(docx)$/i;

  const app = document.getElementById("app");
  const state = { db: null, assets: null, sample: null, imgLimits: null, obras: [], loaded: false, view: "lista", tab: "resumo",
    filtro: "todas", busca: "", draft: null, editId: null, error: "", info: "", warn: "", readOnly: false, confirm: "",
    med: null, medFiles: [], reg: null, todosAlertas: false, doc: null, docFiles: [], cron: null, fotoData: "", busy: "", preview: null, downloads: null, impFiles: [], and: null, area: null, userId: null };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = v => v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
  const brl = v => !isNum(v) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const brlCurto = v => { v = Number(v) || 0; if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi"; if (Math.abs(v) >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil"; return "R$ " + v.toFixed(0); };
  const pct = (a, b) => b ? (a / b * 100) : 0;
  const pctTxt = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const dt = s => { if (!s) return "—"; const [y, m, d] = String(s).split("-"); return d ? `${d}/${m}/${y}` : esc(s); };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mesTxt = ym => { if (!ym) return "—"; const [y, m] = ym.split("-"); return `${MESES[Number(m) - 1] || m}/${y}`; };
  const ym = s => s ? String(s).slice(0, 7) : "";
  const addMes = (m, n) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  const hojeISO = () => { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
  const hoje = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const diasAte = s => { if (!s) return null; const d = new Date(s + "T00:00:00"); return Math.round((d - hoje()) / 86400000); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const prazoAtual = o => { const ad = (o.aditivos || []).filter(a => a.novoPrazo).map(a => a.novoPrazo).sort(); return ad.length ? ad[ad.length - 1] : (o.prazoFinal || ""); };
  const valorTotal = o => Number(o.valor || 0) + (o.aditivos || []).reduce((s, a) => s + Number(a.valor || 0), 0);
  const medido = o => (o.medicoes || []).reduce((s, m) => s + Number(m.valor || 0), 0);
  const pendAbertas = o => (o.pendencias || []).filter(p => !p.resolvida).length;
  const ultimaVist = o => [...(o.vistorias || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  const blob = id => window.CONTROLE_SITE ? window.CONTROLE_SITE.fileUrl(id) : "/_blob/" + encodeURIComponent(id);
  const curObra = () => state.obras.find(x => x.id === state.view);

  function parseCoord(txt) {
    txt = String(txt || "").trim(); if (!txt) return { lat: null, lng: null };
    const dms = [...txt.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})?\s*['’′]?\s*([\d.,]+)?/g)];
    if (dms.length >= 2) {
      const hs = (txt.match(/[NSLOWE]/gi) || []).map(h => h.toUpperCase());
      const conv = (m, h) => { let v = Number(m[1]) + Number(m[2] || 0) / 60 + Number(String(m[3] || 0).replace(",", ".")) / 3600; return h === "S" || h === "O" || h === "W" ? -v : v; };
      return { lat: conv(dms[0], hs[0]), lng: conv(dms[1], hs[1]) };
    }
    const n = txt.match(/-?\d+(?:[.,]\d+)?/g);
    if (n && n.length >= 2) return { lat: Number(n[0].replace(",", ".")), lng: Number(n[1].replace(",", ".")) };
    return null;
  }
  const coordTxt = o => isNum(o.lat) && isNum(o.lng) ? `${Number(o.lat).toFixed(6)}, ${Number(o.lng).toFixed(6)}` : "";
  const mapsUrl = o => `https://www.google.com/maps?q=${Number(o.lat)},${Number(o.lng)}`;

  /* Cronograma: previsto (do cronograma) x realizado (das medições), por mês */
  function cronoCalc(o) {
    const prev = {}; (o.cronograma || []).forEach(c => { if (c.mes) prev[c.mes] = (prev[c.mes] || 0) + Number(c.previsto || 0); });
    const med = {}; (o.medicoes || []).forEach(m => { const k = ym(m.periodoFim || m.data); if (k) med[k] = (med[k] || 0) + Number(m.valor || 0); });
    const keys = [...new Set([...Object.keys(prev), ...Object.keys(med)])].sort();
    if (!keys.length) return { rows: [], status: null };
    const all = []; for (let k = keys[0]; k <= keys[keys.length - 1]; k = addMes(k, 1)) all.push(k);
    let pa = 0, ma = 0; const rows = all.map(k => { pa += prev[k] || 0; ma += med[k] || 0; return { mes: k, prev: prev[k] || 0, prevAc: pa, med: med[k] || 0, medAc: ma }; });
    const agora = ym(hojeISO());
    const ref = [...rows].reverse().find(r => r.mes <= agora);
    let status = null;
    if (Object.keys(prev).length && ref) {
      const r = ref.prevAc ? ref.medAc / ref.prevAc : 1;
      status = { ref, ratio: r, desvio: ref.medAc - ref.prevAc,
        cls: r >= 0.95 ? "ok" : r >= 0.8 ? "warn" : "bad",
        txt: !ref.prevAc ? "Sem execução prevista até agora" : r >= 0.95 ? "Cumprindo o cronograma" : r >= 0.8 ? "Pequeno atraso no cronograma" : "Atrasada em relação ao cronograma" };
    }
    return { rows, status, temPrev: Object.keys(prev).length > 0 };
  }

  function prazoTxt(o) {
    const p = prazoAtual(o); const n = diasAte(p);
    if (n === null) return `<span class="muted">Sem prazo</span>`;
    if (o.situacao === "concluida") return `Prazo ${dt(p)}`;
    if (n < 0) return `<span class="prazo-late">Vencido há ${-n} dia${n === -1 ? "" : "s"} (${dt(p)})</span>`;
    if (n === 0) return `<span class="prazo-late">Vence hoje (${dt(p)})</span>`;
    if (n <= 30) return `<span class="prazo-soon">Faltam ${n} dia${n === 1 ? "" : "s"} (${dt(p)})</span>`;
    return `Faltam ${n} dias (${dt(p)})`;
  }
  const pill = s => `<span class="pill s-${esc(s || "nao_iniciada")}">${esc(SIT[s] || "Sem situação")}</span>`;
  const bar = p => !isNum(p) ? `<span class="muted mono">— % executado</span>` :
    `<div class="bar" title="${esc(p)}% executado"><i style="width:${Math.max(0, Math.min(100, Number(p)))}%"></i></div><span class="mono">${esc(p)}% executado</span>`;
  const kindTxt = f => f.tipo === "application/pdf" ? "PDF" : (f.tipo || "").startsWith("image/") ? "IMG" : PLANILHA.test(f.nome || "") ? "XLS" : /\.docx?$/i.test(f.nome || "") ? "DOC" : "ARQ";
  const OFFICE = /\.(xlsx|xlsm|xls|ods|docx|doc|odt)$/i;
  const fileChip = f => (f.codificado || OFFICE.test(f.nome || "")) ? `<button class="file" data-ver="${esc(f.id)}" data-nome="${esc(f.nome)}" style="font-weight:400"><span class="kind">${kindTxt(f)}</span><span>${esc(f.nome || "arquivo")}</span></button>` : `<a class="file" href="${blob(f.id)}" target="_blank" rel="noopener"><span class="kind">${f.tipo === "application/pdf" ? "PDF" : (f.tipo || "").startsWith("image/") ? "IMG" : "ARQ"}</span><span>${esc(f.nome || "arquivo")}</span></a>`;
  const yesNo = (key, label, extra = "") => state.confirm === key
    ? `<span class="confirm"><span class="small">Excluir de vez?</span><button class="sm danger" data-yes="${esc(key)}">Sim, excluir</button><button class="sm" data-no="1">Não</button></span>`
    : `<button class="sm danger" data-ask="${esc(key)}" ${extra}>${label}</button>`;
  const canWrite = () => !state.readOnly && !!state.db;
  const canUpload = () => canWrite() && !!state.assets;

  const areaAtual = () => state.view === "editar" ? areaDe(state.draft) : state.view !== "lista" && state.view !== "inicio" && curObra() ? areaDe(curObra()) : state.area || "prefeitura";
  function header() {
    if (state.view === "inicio") return `<header class="top"><div class="titulo"><div class="eyebrow">Higor Rodrigues de Souza · Engenheiro Civil</div><h1>Controle de Obras</h1></div></header>`;
    const ar = areaAtual(), A = AREAS[ar];
    return `<header class="top area-${ar}">
      ${ar === "pessoal" ? `<div class="logo-pessoal"><img src="img/marca-higor.svg" alt="" width="64" height="64"><div><b>Higor Rodrigues de Souza</b><span>Engenheiro Civil</span></div></div>`
        : `<div class="logo-pref"><img src="img/logo-prefeitura.png" alt="Prefeitura de Edealina" width="900" height="272"></div>`}
      <div class="titulo"><div class="eyebrow">${esc(A.eyebrow)}</div><h1>${esc(A.titulo)}</h1></div>
      <div class="head-btns">${state.view === "lista" ? `<button class="ghost-claro" data-act="inicio">Trocar de área</button>` : ""}${state.view === "lista" && canWrite() ? `<button class="primary" data-act="nova">+ Nova obra</button>` : ""}</div>
    </header>`;
  }
  /* Tela inicial: escolher entre a parte da Prefeitura e a parte pessoal */
  function renderInicio() {
    const cont = ar => state.obras.filter(o => areaDe(o) === ar), card = (ar, logo) => { const os = cont(ar), at = os.filter(o => o.situacao !== "concluida"), al = os.flatMap(alertas).filter(x => x.nivel === "bad").length; return `
      <button class="area-card area-${ar}" data-area="${ar}">
        <span class="area-logo">${logo}</span>
        <span class="area-txt"><span class="eyebrow">${ar === "pessoal" ? "Pessoal" : "Prefeitura"}</span><b>${esc(AREAS[ar].nome)}</b><span class="muted">${esc(AREAS[ar].resumo)}</span>
          <span class="area-num">${state.loaded ? `${os.length} obra${os.length === 1 ? "" : "s"}${at.length ? ` · ${at.length} em aberto` : ""}${al ? ` · <span style="color:var(--bad)">${al} alerta${al > 1 ? "s" : ""}</span>` : ""}` : "Carregando…"}</span></span>
        <span class="seta">›</span>
      </button>`; };
    app.innerHTML = header() + msgs() + `<p class="muted" style="margin:0 0 14px">Escolha onde você quer entrar.</p>
      <div class="areas">${card("prefeitura", `<img src="img/logo-prefeitura.png" alt="Prefeitura de Edealina" width="900" height="272">`)}${card("pessoal", `<img src="img/marca-higor.svg" alt="" width="72" height="72"><span class="area-nome"><b>Higor Rodrigues de Souza</b>Engenheiro Civil</span>`)}</div>`;
  }
  const msgs = () => (state.error ? `<div class="msg err">${esc(state.error)}</div>` : "") + (state.warn ? `<div class="msg warn">${esc(state.warn)}</div>` : "") + (state.info ? `<div class="msg info">${esc(state.info)}</div>` : "");

  function render() {
    const y = window.scrollY;
    if (state.view === "editar") { renderForm(); return; }
    if (state.view === "inicio" || (state.view === "lista" && !state.area)) { state.view = "inicio"; renderInicio(); return; }
    if (state.view !== "lista") { const o = curObra(); if (o) { renderFicha(o); rotularTabelas(); mostrarAba(); if (state.tab === "orcamento") orcResultados(); window.scrollTo(0, y); return; } state.view = "lista"; }
    renderLista();
  }
  /* No celular as tabelas viram cartões; cada célula recebe o nome da sua coluna */
  // No celular a barra de abas rola para o lado: mantém a aba aberta visível.
  function mostrarAba() {
    const nav = app.querySelector(".tabs"), ab = nav && nav.querySelector('[aria-selected="true"]');
    if (ab) { const r = ab.getBoundingClientRect(), n = nav.getBoundingClientRect(); nav.scrollLeft += r.left - n.left - (n.width - r.width) / 2; }
  }
  function rotularTabelas() {
    app.querySelectorAll(".tbl table").forEach(tb => {
      const nomes = []; tb.querySelectorAll("thead th").forEach(th => { for (let i = 0; i < (th.colSpan || 1); i++) nomes.push(th.textContent.trim()); });
      tb.classList.add("cards");
      tb.querySelectorAll("tbody tr, tfoot tr").forEach(tr => { let i = 0; [...tr.cells].forEach(td => { if (nomes[i] && td.colSpan === 1) td.dataset.label = nomes[i]; i += td.colSpan || 1; }); });
    });
  }

  /* ---------- Lista ---------- */
  function renderLista() {
    const obras = state.obras.filter(o => areaDe(o) === state.area);
    const cont = k => obras.filter(o => o.situacao === k).length;
    const ativos = obras.filter(o => o.situacao !== "concluida");
    let lista = obras.filter(o => state.filtro === "todas" || o.situacao === state.filtro);
    const q = state.busca.trim().toLowerCase();
    if (q) lista = lista.filter(o => [o.nome, o.empresa, o.cnpj, o.numero, o.endereco].join(" ").toLowerCase().includes(q));
    const ordem = { paralisada: 0, atrasada: 1, andamento: 2, nao_iniciada: 3, concluida: 4 };
    lista.sort((a, b) => (ordem[a.situacao] ?? 5) - (ordem[b.situacao] ?? 5) || String(prazoAtual(a)).localeCompare(String(prazoAtual(b))));
    let body;
    if (!state.db) body = `<div class="empty">Não foi possível abrir o banco de dados desta página. Entre na sua conta do Claude e abra o link de novo.</div>`;
    else if (!state.loaded) body = `<div class="empty">Carregando as obras cadastradas…</div>`;
    else if (!obras.length) body = `<div class="empty">Nenhuma obra cadastrada ainda. Use <b>+ Nova obra</b> para criar a primeira ficha.</div>` + blocoRecursos();
    else body = `
      <div class="summary">
        <div class="tile"><div class="eyebrow">Obras</div><div class="v num">${obras.length}</div></div>
        <div class="tile"><div class="eyebrow">Paralisadas</div><div class="v num" style="color:var(--bad)">${cont("paralisada")}</div></div>
        <div class="tile"><div class="eyebrow">Atrasadas</div><div class="v num" style="color:var(--warn)">${cont("atrasada")}</div></div>
        <div class="tile"><div class="eyebrow">Pendências abertas</div><div class="v num">${obras.reduce((s, o) => s + pendAbertas(o), 0)}</div></div>
        <div class="tile"><div class="eyebrow">Valor em execução</div><div class="v num sm">${brl(ativos.reduce((s, o) => s + valorTotal(o), 0))}</div><div class="sub">Medido ${brl(ativos.reduce((s, o) => s + medido(o), 0))}</div></div>
      </div>
      ${blocoAlertas(obras.flatMap(alertas), true)}
      ${blocoRecursos()}
      <div class="filters">
        ${["todas", "andamento", "atrasada", "paralisada", "nao_iniciada", "concluida"].map(k =>
          `<button class="chip" data-filtro="${k}" aria-pressed="${state.filtro === k}">${k === "todas" ? "Todas" : SIT[k]}</button>`).join("")}
        <input id="busca" type="search" placeholder="Buscar por obra, empresa, CNPJ, contrato…" value="${esc(state.busca)}">
      </div>
      <div class="list">${lista.length ? lista.map(o => { const vt = valorTotal(o), md = medido(o), cs = cronoCalc(o).status; return `
        <button class="obra" data-abrir="${esc(o.id)}">
          <span class="stripe bg-${esc(o.situacao || "nao_iniciada")}"></span>
          <span class="main">
            <span class="name">${esc(o.nome)}</span>
            <span class="meta">${o.tipoObra ? `<span>${esc(o.tipoObra)}</span>` : ""}<span>${esc(o.numero || "Sem nº de contrato")}</span><span>${esc(o.empresa || "Empresa não informada")}</span><span class="mono">${brl(vt)}</span>${md ? `<span class="mono">Medido ${pctTxt(pct(md, vt))}</span>` : ""}</span>
            <span class="meta">${prazoTxt(o)}${cs ? `<span>${esc(cs.txt)}</span>` : ""}${pendAbertas(o) ? `<span>${pendAbertas(o)} pendência${pendAbertas(o) > 1 ? "s" : ""} aberta${pendAbertas(o) > 1 ? "s" : ""}</span>` : ""}${ultimaVist(o) ? `<span>Última vistoria ${dt(ultimaVist(o).data)}</span>` : ""}</span>
          </span>
          <span class="side">${pill(o.situacao)}${bar(o.percentual)}</span>
        </button>`; }).join("") : `<div class="empty">Nenhuma obra neste filtro.</div>`}</div>`;
    app.innerHTML = header() + msgs() + body;
    const b = document.getElementById("busca");
    if (b && state._focusBusca) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); state._focusBusca = false; }
  }

  /* ---------- Recursos e repasses ----------
     dados/recursos/edealina.json é gravado todo dia pelo robô recursos-diario (ferramentas/monitor_recursos.py)
     com convênios federais (Portal da Transparência), obras do Obrasgov e menções no diário oficial. */
  const TIPO_REC = { convenio: "Convênio federal", obra: "Obra federal (Obrasgov)", diario: "Diário oficial" };
  const NOME_FONTE = { convenios: "Portal da Transparência", obras: "Obrasgov.br", diario: "Querido Diário" };
  const soDig = s => String(s || "").replace(/\D/g, "");
  const urlSegura = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";
  const recente = d => { const n = diasAte(d); return n !== null && n >= -30 && n <= 0; };
  const frase = t => { t = String(t || "").trim(); if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/^./, c => c.toUpperCase()); return t; };
  /* Liga a ficha ao convênio pelo número: "Contrato de repasse / operação", nº do contrato ou fonte de recurso */
  function recDaObra(o) {
    if (!state.recursos || areaDe(o) !== "prefeitura") return null;
    const alvos = [(o.caixa || {}).operacao, o.numero, o.fonte].map(soDig).filter(Boolean);
    return (state.recursos.itens || []).find(x => x.tipo === "convenio" && soDig(x.numero).length >= 5 && alvos.some(a => a.includes(soDig(x.numero)))) || null;
  }
  const obraDoRec = x => state.obras.find(o => recDaObra(o) === x);
  function blocoRecursos() {
    const R = state.recursos;
    if (state.area !== "prefeitura" || !R) return "";
    const its = [...(R.itens || [])].sort((a, b) => (recente(b.primeiraVez) || recente(b.liberadoMudouEm)) - (recente(a.primeiraVez) || recente(a.liberadoMudouEm))
      || String(b.data || b.primeiraVez || "").localeCompare(String(a.data || a.primeiraVez || "")));
    const conv = its.filter(x => x.tipo === "convenio"), tot = conv.reduce((s, x) => s + (Number(x.valor) || 0), 0), lib = conv.reduce((s, x) => s + (Number(x.liberado) || 0), 0);
    const novos = its.filter(x => recente(x.primeiraVez) || recente(x.liberadoMudouEm)).length;
    const max = state.todosRecursos ? its.length : 5;
    const falhas = Object.entries(R.fontes || {}).filter(([, f]) => !f.ok);
    const quando = R.atualizadoEm ? new Date(R.atualizadoEm).toLocaleDateString("pt-BR") : "";
    const item = x => {
      const ob = x.tipo !== "diario" ? obraDoRec(x) : null, url = urlSegura(x.url), v = Number(x.valor) || 0, l = Number(x.liberado) || 0;
      return `<li class="rec">
        <div class="rec-top"><span class="kind">${esc(TIPO_REC[x.tipo] || x.fonte || "")}</span>${recente(x.primeiraVez) ? `<span class="pill s-ok">Novo</span>` : ""}${!recente(x.primeiraVez) && recente(x.liberadoMudouEm) ? `<span class="pill s-ok">Nova liberação</span>` : ""}${x.situacao ? `<span class="muted small">${esc(frase(x.situacao))}</span>` : ""}</div>
        <b class="rec-tit">${esc(frase(x.titulo))}</b>
        <div class="meta small muted">${x.numero ? `<span>Nº ${esc(x.numero)}</span>` : ""}${x.orgao ? `<span>${esc(x.orgao)}</span>` : ""}${x.data ? `<span>${dt(x.data)}</span>` : ""}${x.vigenciaFim ? `<span>Vigência até ${dt(x.vigenciaFim)}</span>` : ""}</div>
        ${v ? `<div class="rec-val"><span class="small"><b class="num">${brl(l)}</b> liberado de <span class="num">${brl(v)}</span>${x.tipo === "convenio" ? ` (${pctTxt(pct(l, v))})` : ""}</span>${x.tipo === "convenio" ? `<div class="bar wide"><i style="width:${Math.min(100, pct(l, v))}%"></i></div>` : ""}</div>` : ""}
        ${x.trecho ? `<p class="small rec-trecho">${esc(x.trecho)}</p>` : ""}
        <div class="btns">${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Ver na fonte ↗</a>` : ""}${ob ? `<button class="sm" data-abrir="${esc(ob.id)}">Ficha: ${esc(ob.nome)}</button>` : x.tipo !== "diario" && canWrite() ? `<button class="sm" data-rec-criar="${esc(x.id)}">Criar ficha desta obra</button>` : ""}</div>
      </li>`;
    };
    return `<section class="blk recursos"><header><h3>Recursos e repasses para Edealina</h3><span class="muted small">${novos ? `<b style="color:var(--ok)">${novos} novidade${novos > 1 ? "s" : ""}</b> · ` : ""}${quando ? `Atualizado em ${quando}` : "Ainda não consultado"}</span></header>
      ${conv.length ? `<div class="rec-resumo small"><span><b class="num">${conv.length}</b> convênio${conv.length > 1 ? "s" : ""} federa${conv.length > 1 ? "is" : "l"}</span><span>Valor <b class="num">${brl(tot)}</b></span><span>Liberado <b class="num">${brl(lib)}</b> (${pctTxt(pct(lib, tot))})</span></div>` : ""}
      ${its.length ? `<ul class="rec-lista">${its.slice(0, max).map(item).join("")}</ul>` : `<p class="muted small" style="margin:0">${Object.keys(R.fontes || {}).length ? "Nenhum recurso encontrado para Edealina nas fontes consultadas." : "Aguardando a primeira consulta do robô, que roda todo dia às 7h17."}</p>`}
      ${its.length > max ? `<button class="ghost sm" data-rec-todos="1">Ver todos os ${its.length} itens</button>` : ""}
      ${falhas.length ? `<p class="muted small" style="margin:10px 0 0">Sem resposta na última consulta: ${falhas.map(([k, f]) => esc(NOME_FONTE[k] || k) + (/CHAVE_PORTAL/.test(f.erro || "") ? " (falta cadastrar a chave da API)" : "")).join(", ")}.</p>` : ""}
    </section>`;
  }
  function blocoRepasse(o, md) {
    const x = recDaObra(o); if (!x) return "";
    const v = Number(x.valor) || 0, l = Number(x.liberado) || 0, url = urlSegura(x.url);
    return `<section class="blk"><header><h3>Repasse do governo federal</h3>${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Ver na fonte ↗</a>` : ""}</header>
      <dl class="kv" style="margin:0 0 10px">
        ${kv(esc(x.instrumento || "Convênio"), esc(x.numero || "—"))}
        ${kv("Órgão", esc(x.orgao || "—"))}
        ${kv("Situação", esc(frase(x.situacao) || "—"))}
        ${kv("Valor do repasse", `<span class="num">${brl(x.valor)}</span>`)}
        ${kv("Contrapartida", `<span class="num">${brl(x.contrapartida)}</span>`)}
        ${kv("Liberado pelo governo", `<span class="num">${brl(l)}</span> <span class="muted">(${pctTxt(pct(l, v))})</span>`)}
        ${kv("Última liberação", dt(x.ultimaLiberacao))}
        ${kv("Vigência até", dt(x.vigenciaFim))}
      </dl>
      <div class="bar wide" title="Liberado"><i style="width:${Math.min(100, pct(l, v))}%"></i></div>
      <p class="small" style="margin:8px 0 0">Medido na obra <b class="num">${brl(md)}</b> · liberado pelo governo <b class="num">${brl(l)}</b>.
        ${md > l + 0.01 ? `<span style="color:var(--warn)">O medido passa ${brl(md - l)} do liberado: confira a contrapartida e se há parcela a liberar.</span>` : ""}</p>
      <p class="muted small" style="margin:6px 0 0">Dados de ${esc(x.fonte || "fonte pública")}, atualizados todo dia.</p>
    </section>`;
  }

  /* ---------- Ficha ---------- */
  function renderFicha(o) {
    const n = { orcamento: orcItens(o).filter(x => x.nivel === "servico").length, diario: (o.diario || []).length, servicos: (o.servicos || []).length, notificacoes: (o.notificacoes || []).length + (o.prazos || []).length, documentos: (o.documentos || []).length, medicoes: (o.medicoes || []).length, fotos: (o.fotos || []).length, vistorias: (o.vistorias || []).length + pendAbertas(o) };
    const corpo = { resumo: tabResumo, orcamento: tabOrcamento, diario: tabDiario, servicos: tabServicos, notificacoes: tabNotificacoes, documentos: tabDocumentos, medicoes: tabMedicoes, cronograma: tabCronograma, fotos: tabFotos, vistorias: tabVistorias }[state.tab] || tabResumo;
    app.innerHTML = header() + `
      <button class="ghost back" data-act="voltar">← Todas as obras</button>
      <div class="ficha-head">
        <div><div class="eyebrow">Ficha da obra</div><h2>${esc(o.nome)}</h2>
          <div class="muted" style="margin-top:4px">${esc(o.objeto || "")}</div></div>
        <div class="head-acts">${pill(o.situacao)}${canWrite() ? `<button data-act="editar">Editar dados</button>` : ""}</div>
      </div>
      <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}${n[k] ? `<span class="count">${n[k]}</span>` : ""}</button>`).join("")}</nav>
      ${msgs()}${previewHtml()}${corpo(o)}
      <p class="muted" style="font-size:12px">Atualizada em ${o.atualizadoEm ? new Date(o.atualizadoEm).toLocaleString("pt-BR") : "—"}</p>`;
  }

  const kv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  /* Atualização rápida da situação e do % executado, pensada para usar no celular durante a vistoria */
  function andDraft(o) {
    if (!state.and || state.and.id !== o.id) state.and = { id: o.id, situacao: o.situacao || "", percentual: isNum(o.percentual) ? Number(o.percentual) : 0, obs: o.observacoes || "", vistoria: false };
    return state.and;
  }
  function blocoAndamento(o) {
    if (!canWrite()) return "";
    const a = andDraft(o), p = Math.max(0, Math.min(100, Number(a.percentual) || 0));
    return `<section class="blk andamento"><header><h3>Situação e andamento</h3></header>
      <div class="lbl">Situação da obra</div>
      <div class="sit-opts">${Object.entries(SIT).map(([k, t]) => `<button type="button" class="sit-opt" data-and-sit="${k}" aria-pressed="${a.situacao === k}"><span class="dot bg-${k}"></span>${t}</button>`).join("")}</div>
      <div class="lbl" style="margin-top:16px">% executado (físico)</div>
      <div class="pct-row"><input type="range" id="and-range" min="0" max="100" step="1" value="${p}" data-and-pct="1" aria-label="% executado">
        <span class="pct-num"><input type="number" id="and-num" min="0" max="100" step="1" inputmode="numeric" value="${p}" data-and-pct="1" aria-label="% executado em número"><span>%</span></span></div>
      <div class="pct-quick">${[-5, -1, 1, 5].map(d => `<button type="button" data-and-step="${d}">${d > 0 ? "+" : "−"}${Math.abs(d)}%</button>`).join("")}</div>
      <label class="f" style="margin-top:16px">Situação atual / observações<textarea id="and-obs" data-and-obs="1" rows="3" placeholder="O que foi visto na obra">${esc(a.obs)}</textarea></label>
      <label class="check"><input type="checkbox" id="and-vist" data-and-vist="1" ${a.vistoria ? "checked" : ""}><span>Registrar também como vistoria de hoje (${dt(hojeISO())})</span></label>
      <div class="btns end"><button class="primary" data-act="and-save" ${state.busy ? "disabled" : ""}>${state.busy === "and" ? "Salvando…" : "Salvar situação"}</button></div>
    </section>`;
  }
  function tabResumo(o) {
    const vt = valorTotal(o), md = medido(o), cc = cronoCalc(o), cx = o.caixa || {};
    const pend = o.pendencias || [];
    return `${blocoAlertas(alertas(o), false)}${blocoAndamento(o)}${blocoRelatorios()}
      <div class="summary">
        <div class="tile"><div class="eyebrow">Valor com aditivos</div><div class="v num sm">${brl(vt)}</div></div>
        <div class="tile"><div class="eyebrow">Medido</div><div class="v num sm">${brl(md)}</div><div class="sub">${pctTxt(pct(md, vt))} do contrato</div></div>
        <div class="tile"><div class="eyebrow">Saldo</div><div class="v num sm" ${vt - md < 0 ? 'style="color:var(--bad)"' : ""}>${brl(vt - md)}</div></div>
        <div class="tile"><div class="eyebrow">Cronograma</div><div style="margin-top:6px">${cc.status ? `<span class="pill s-${cc.status.cls}">${esc(cc.status.txt)}</span>` : `<span class="muted small">Cronograma não lançado</span>`}</div></div>
      </div>
      ${blocoRepasse(o, md)}
      <dl class="kv">
        ${kv("Tipo de obra", esc(o.tipoObra || "—"))}
        ${kv("Contrato / instrumento", esc(o.numero || "—"))}
        ${kv("Modalidade", esc(o.modalidade || "—"))}
        ${kv("Empresa", esc(o.empresa || "—"))}
        ${kv("CNPJ", `<span class="mono">${esc(o.cnpj || "—")}</span>`)}
        ${kv("Fonte de recurso", esc(o.fonte || "—"))}
        ${kv("Endereço", esc(o.endereco || "—"))}
        ${kv("Localização", coordTxt(o) ? `<span class="mono">${coordTxt(o)}</span><br><a href="${mapsUrl(o)}" target="_blank" rel="noopener">Abrir no mapa ↗</a>` : `<span class="muted">Sem coordenadas</span>`)}
        ${kv("Valor inicial", `<span class="mono">${brl(o.valor)}</span>`)}
        ${kv("Início", dt(o.dataInicio))}
        ${kv("Prazo original", dt(o.prazoFinal))}
        ${kv("Prazo vigente", prazoTxt(o))}
        ${kv("Execução física", `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${bar(o.percentual)}</div>`)}
      </dl>
      <section class="blk"><header><h3>Orçamento e referências Caixa</h3></header>
        <dl class="kv" style="margin:0">
          ${kv("Valor da PO", `<span class="mono">${brl(cx.valorPO)}</span>`)}
          ${kv("Tabela de referência", esc(cx.referencia || "—"))}
          ${kv("Data-base", cx.dataBase ? mesTxt(cx.dataBase) : "—")}
          ${kv("Desoneração", cx.desonerado === "sim" ? "Desonerado" : cx.desonerado === "nao" ? "Não desonerado" : "—")}
          ${kv("BDI", isNum(cx.bdi) ? `<span class="mono">${esc(cx.bdi)}%</span>` : "—")}
          ${kv("Contrato de repasse / operação", esc(cx.operacao || "—"))}
          ${orcItens(o).length ? kv("Orçamento no site", `<span class="mono">${brl(orcTotais(o).comBdi)}</span> <button class="ghost sm" data-tab="orcamento">Abrir</button>`) : ""}
        </dl>
        <p class="small muted" style="margin:10px 0 0">Monte a planilha na aba Orçamento. Os arquivos da PO e das composições ficam na aba Projetos e documentos.</p>
      </section>
      ${o.observacoes ? `<section class="blk"><header><h3>Situação atual</h3></header><div class="note">${esc(o.observacoes)}</div></section>` : ""}
      <section class="blk"><header><h3>Pendências abertas</h3><button class="ghost" data-tab="vistorias">Ver todas</button></header>
        ${pend.filter(p => !p.resolvida).length ? `<ul class="pend">${pend.map((p, i) => p.resolvida ? "" : `<li><input type="checkbox" id="pend-${i}" data-pend="${i}" ${canWrite() ? "" : "disabled"} style="margin-top:4px">
          <label for="pend-${i}"><span>${esc(p.texto)}</span>${p.prazo ? ` <span class="muted mono">· até ${dt(p.prazo)}</span>` : ""}</label></li>`).join("")}</ul>`
          : `<div class="muted">Nenhuma pendência aberta.</div>`}
      </section>`;
  }

  function tabVistorias(o) {
    const vist = [...(o.vistorias || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const adit = o.aditivos || [], pend = o.pendencias || [], rel = o.relatorios || [];
    return `
      <section class="blk"><header><h3>Pendências</h3><span class="muted">${pendAbertas(o)} aberta(s)</span></header>
        ${pend.length ? `<ul class="pend">${pend.map((p, i) => `<li class="${p.resolvida ? "done" : ""}">
          <input type="checkbox" id="pend-${i}" data-pend="${i}" ${p.resolvida ? "checked" : ""} ${canWrite() ? "" : "disabled"} style="margin-top:4px">
          <label for="pend-${i}"><span>${esc(p.texto)}</span>${p.prazo ? ` <span class="muted mono">· até ${dt(p.prazo)}</span>` : ""}</label></li>`).join("")}</ul>`
          : `<div class="muted">Nenhuma pendência registrada.</div>`}
      </section>
      <section class="blk"><header><h3>Vistorias</h3></header>
        ${vist.length ? `<div class="tbl"><table><thead><tr><th>Data</th><th>Situação</th><th>% exec.</th><th>Observações</th></tr></thead><tbody>
          ${vist.map(v => `<tr><td class="mono">${dt(v.data)}</td><td>${v.situacao ? pill(v.situacao) : "—"}</td><td class="mono">${isNum(v.percentual) ? esc(v.percentual) + "%" : "—"}</td><td class="note">${esc(v.obs || "")}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted">Nenhuma vistoria registrada.</div>`}
      </section>
      <section class="blk"><header><h3>Aditivos</h3></header>
        ${adit.length ? `<div class="tbl"><table><thead><tr><th>Nº</th><th>Data</th><th>Objeto</th><th>Novo prazo</th><th class="r">Valor</th></tr></thead><tbody>
          ${adit.map(a => `<tr><td>${esc(a.numero || "")}</td><td class="mono">${dt(a.data)}</td><td>${esc(a.descricao || "")}</td><td class="mono">${dt(a.novoPrazo)}</td><td class="mono r">${a.valor ? brl(a.valor) : "—"}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted">Nenhum aditivo registrado.</div>`}
      </section>
      <section class="blk"><header><h3>Relatórios emitidos</h3></header>
        ${rel.length ? `<div class="tbl"><table><thead><tr><th>Data</th><th>Relatório</th><th>Arquivo</th></tr></thead><tbody>
          ${rel.map(r => `<tr><td class="mono">${dt(r.data)}</td><td>${esc(r.titulo || "")}</td><td class="mono" style="font-size:12px;overflow-wrap:anywhere">${esc(r.arquivo || "")}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted">Nenhum relatório registrado.</div>`}
        <p class="small muted" style="margin:10px 0 0">Vistorias, pendências, aditivos e relatórios são editados pelo botão Editar dados.</p>
      </section>`;
  }

  /* ---------- Documentos ---------- */
  const pendingChips = (arr, kind) => arr.length ? `<div class="files" style="margin-top:8px">${arr.map((f, i) => `<span class="file"><span class="kind">${kindTxt({ tipo: f.type, nome: f.name })}</span><span>${esc(f.name)}</span><button class="x" data-unpend="${kind}" data-i="${i}" aria-label="Tirar ${esc(f.name)}">×</button></span>`).join("")}</div>` : "";
  function tabDocumentos(o) {
    const docs = o.documentos || [];
    const d = state.doc;
    const form = d ? `<div class="panel"><h4>Novo documento</h4><div class="grid">
        <label class="f">Tipo<select id="doc-cat" data-bind="doc.categoria">${CATS.map(c => `<option ${d.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label class="f">Título<input id="doc-tit" data-bind="doc.titulo" value="${esc(d.titulo)}" placeholder="Ex.: Planta baixa, prancha 01"></label>
        <label class="f">Revisão / data<input id="doc-data" type="date" data-bind="doc.data" value="${esc(d.data)}"></label>
      </div>
      <div class="btns" style="margin-top:10px"><span class="btn upl">Escolher arquivos (PDF, Excel, Word, imagem)<input type="file" id="doc-files" multiple accept="${ACEITA}"></span></div>
      ${pendingChips(state.docFiles, "doc")}
      <div class="btns end" style="margin-top:10px"><button data-act="doc-cancel">Cancelar</button><button class="primary" data-act="doc-save" ${state.busy ? "disabled" : ""}>${state.busy === "doc" ? "Enviando…" : "Salvar documento"}</button></div></div>` : "";
    const grupos = CATS.map(c => [c, docs.filter(x => x.categoria === c)]).filter(([, l]) => l.length);
    return `${form}
      <section class="blk"><header><h3>Projetos e documentos</h3>${canUpload() && !d ? `<button class="primary" data-act="doc-new">+ Adicionar documento</button>` : ""}</header>
        ${!state.assets && canWrite() ? `<p class="small muted">O envio de arquivos só funciona para quem pode editar este site.</p>` : ""}
        ${grupos.length ? grupos.map(([c, l]) => `<div class="cat"><h5>${esc(c)}</h5>${l.map(x => `<div class="docrow"><div><div>${esc(x.titulo || "Sem título")}${x.data ? ` <span class="muted mono small">· ${dt(x.data)}</span>` : ""}</div><div class="files" style="margin-top:4px">${(x.arquivos || []).map(fileChip).join("")}</div></div>${canWrite() ? yesNo("doc:" + x.id, "Excluir") : ""}</div>`).join("")}</div>`).join("")
          : `<div class="muted">Nenhum documento lançado. Adicione os projetos, a PO / planilha orçamentária, as composições SINAPI e o cronograma.</div>`}
      </section>`;
  }

  /* ---------- Medições ---------- */
  function tabMedicoes(o) {
    const vt = valorTotal(o), meds = [...(o.medicoes || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.numero) - Number(b.numero));
    let ac = 0; const md = medido(o);
    const m = state.med;
    const form = m ? `<div class="panel"><h4>${m.id ? "Editar medição" : "Nova medição"}</h4>
      <div class="btns">
        <span class="btn upl">Anexar PDF, planilha ou foto<input type="file" id="med-files" multiple accept="${ACEITA}"></span>
        <span class="btn upl">Tirar foto<input type="file" id="med-cam" accept="image/*" capture="environment"></span>
        ${state.sample && state.medFiles.length ? `<button data-act="med-ler" ${state.busy ? "disabled" : ""}>${state.busy === "ler" ? "Lendo o arquivo…" : "Ler valores do arquivo"}</button>` : ""}
      </div>
      ${pendingChips(state.medFiles, "med")}
      ${(m.arquivos || []).length ? `<div class="files" style="margin-top:8px">${m.arquivos.map((f, i) => `<span class="file"><span class="kind">${kindTxt(f)}</span><span>${esc(f.nome)}</span><button class="x" data-unarq="${i}" aria-label="Tirar ${esc(f.nome)}">×</button></span>`).join("")}</div>` : ""}
      <div class="grid" style="margin-top:12px">
        <label class="f">Nº da medição<input id="med-num" data-bind="med.numero" value="${esc(m.numero)}"></label>
        <label class="f">Data<input id="med-data" type="date" data-bind="med.data" value="${esc(m.data)}"></label>
        <label class="f">Período início<input id="med-pi" type="date" data-bind="med.periodoIni" value="${esc(m.periodoIni)}"></label>
        <label class="f">Período fim<input id="med-pf" type="date" data-bind="med.periodoFim" value="${esc(m.periodoFim)}"></label>
        <label class="f">Valor desta medição (R$)<input id="med-valor" type="number" step="0.01" data-bind="med.valor" value="${esc(m.valor)}"></label>
        <label class="f wide">Observações<textarea id="med-obs" data-bind="med.obs">${esc(m.obs)}</textarea></label>
      </div>
      <div class="btns end" style="margin-top:10px"><button data-act="med-cancel">Cancelar</button><button class="primary" data-act="med-save" ${state.busy ? "disabled" : ""}>${state.busy === "med" ? "Salvando…" : "Salvar medição"}</button></div></div>` : "";
    return `
      <div class="summary">
        <div class="tile"><div class="eyebrow">Valor da obra</div><div class="v num sm">${brl(vt)}</div><div class="sub">com aditivos</div></div>
        <div class="tile"><div class="eyebrow">Total medido</div><div class="v num sm">${brl(md)}</div><div class="sub">${meds.length} medição(ões)</div></div>
        <div class="tile"><div class="eyebrow">Saldo a medir</div><div class="v num sm" ${vt - md < 0 ? 'style="color:var(--bad)"' : ""}>${brl(vt - md)}</div></div>
        <div class="tile"><div class="eyebrow">Executado financeiro</div><div class="v num">${pctTxt(pct(md, vt))}</div><div class="bar wide" style="margin-top:6px"><i class="${md > vt ? "over" : ""}" style="width:${Math.min(100, pct(md, vt))}%"></i></div></div>
      </div>
      ${md > vt && vt ? `<div class="msg err">As medições somam ${brl(md - vt)} acima do valor da obra. Confira os lançamentos.</div>` : ""}
      ${form}
      <section class="blk"><header><h3>Boletins de medição</h3>${canWrite() && !m ? `<button class="primary" data-act="med-new">+ Lançar medição</button>` : ""}</header>
        ${meds.length ? `<div class="tbl"><table><thead><tr><th>Nº</th><th>Data</th><th>Período</th><th class="r">Valor</th><th class="r">Acumulado</th><th class="r">% obra</th><th>Arquivos</th><th></th></tr></thead><tbody>
          ${meds.map(x => { ac += Number(x.valor || 0); return `<tr><td>${esc(x.numero || "")}</td><td class="mono">${dt(x.data)}</td><td class="mono small">${x.periodoIni || x.periodoFim ? `${dt(x.periodoIni)} a ${dt(x.periodoFim)}` : "—"}</td>
            <td class="mono r">${brl(x.valor)}</td><td class="mono r">${brl(ac)}</td><td class="mono r">${pctTxt(pct(ac, vt))}</td>
            <td><div class="files">${(x.arquivos || []).map(fileChip).join("") || `<span class="muted small">Manual</span>`}</div>${x.obs ? `<div class="small muted note" style="margin-top:4px">${esc(x.obs)}</div>` : ""}</td>
            <td>${canWrite() ? `<div class="btns"><button class="sm" data-med-edit="${esc(x.id)}">Editar</button>${yesNo("med:" + x.id, "Excluir")}</div>` : ""}</td></tr>`; }).join("")}
          </tbody><tfoot><tr><td colspan="3">Total</td><td class="mono r">${brl(md)}</td><td></td><td class="mono r">${pctTxt(pct(md, vt))}</td><td colspan="2"></td></tr></tfoot></table></div>`
          : `<div class="muted">Nenhuma medição lançada. Lance à mão ou anexe o boletim em PDF, planilha ou foto${state.sample ? " e peça para o site ler os valores" : ""}.</div>`}
      </section>`;
  }

  /* ---------- Cronograma ---------- */
  function curvaS(rows, total) {
    const W = 680, H = 240, L = 70, R = 14, T = 14, B = 34;
    const max = Math.max(total || 0, ...rows.map(r => Math.max(r.prevAc, r.medAc)), 1);
    const n = rows.length, x = i => L + (n <= 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = v => T + (H - T - B) * (1 - v / max);
    const agora = ym(hojeISO()), ai = rows.findIndex(r => r.mes === agora);
    const pPrev = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.prevAc).toFixed(1)}`).join(" ");
    const lastMed = rows.reduce((k, r, i) => r.med ? i : k, -1);
    const pMed = rows.slice(0, lastMed + 1).map((r, i) => `${x(i).toFixed(1)},${y(r.medAc).toFixed(1)}`).join(" ");
    const ticks = [0, .25, .5, .75, 1].map(f => max * f);
    const step = Math.max(1, Math.ceil(n / 8));
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S: valor acumulado previsto e medido por mês">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${brlCurto(t)}</text>`).join("")}
      ${total ? `<line x1="${L}" x2="${W - R}" y1="${y(total)}" y2="${y(total)}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 3"/><text x="${W - R}" y="${y(total) - 4}" text-anchor="end">Valor da obra</text>` : ""}
      ${ai >= 0 ? `<line x1="${x(ai)}" x2="${x(ai)}" y1="${T}" y2="${H - B}" stroke="var(--warn)" stroke-width="1.5"/><text x="${x(ai) + 4}" y="${T + 10}">hoje</text>` : ""}
      <polyline points="${pPrev}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 4"/>
      ${lastMed >= 0 ? `<polyline points="${pMed}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${rows.slice(0, lastMed + 1).map((r, i) => `<circle cx="${x(i)}" cy="${y(r.medAc)}" r="${i === lastMed ? 4.5 : 2.5}" fill="var(--accent)"/>`).join("")}` : ""}
      ${rows.map((r, i) => i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - B + 18}" text-anchor="middle">${mesTxt(r.mes)}</text>` : "").join("")}
    </svg></div><div class="legend"><span><i class="dash"></i>Previsto acumulado</span><span><i></i>Medido acumulado</span></div>`;
  }
  function tabCronograma(o) {
    const vt = valorTotal(o), cc = cronoCalc(o), c = state.cron;
    const form = c ? `<div class="panel"><h4>Lançar cronograma</h4>
      <p class="small" style="margin:0 0 10px">Informe o valor previsto em cada mês, conforme o cronograma físico-financeiro aprovado.</p>
      <div class="btns" style="margin-bottom:10px">
        <button data-act="cron-gerar">Gerar meses do contrato</button>
        ${state.sample ? `<span class="btn upl">${state.busy === "cron-ler" ? "Lendo o arquivo…" : "Ler de PDF, planilha ou foto"}<input type="file" id="cron-file" accept="${ACEITA}" ${state.busy ? "disabled" : ""}></span>` : ""}
      </div>
      <div class="tbl"><table><thead><tr><th>Mês</th><th class="r">Previsto (R$)</th><th class="r">% da obra</th><th></th></tr></thead><tbody>
        ${c.linhas.map((l, i) => `<tr><td><input id="cron-m-${i}" type="month" data-cron="${i}" data-k="mes" value="${esc(l.mes)}"></td><td><input id="cron-v-${i}" type="number" step="0.01" data-cron="${i}" data-k="previsto" value="${esc(l.previsto)}" style="text-align:right"></td><td class="mono r">${pctTxt(pct(Number(l.previsto) || 0, vt))}</td><td><button class="sm danger" data-cron-rem="${i}">Remover</button></td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total</td><td class="mono r">${brl(c.linhas.reduce((s, l) => s + (Number(l.previsto) || 0), 0))}</td><td class="mono r">${pctTxt(pct(c.linhas.reduce((s, l) => s + (Number(l.previsto) || 0), 0), vt))}</td><td></td></tr></tfoot></table></div>
      <div class="btns" style="margin-top:8px"><button class="sm" data-act="cron-add">+ Mês</button></div>
      <div class="btns end" style="margin-top:10px"><button data-act="cron-cancel">Cancelar</button><button class="primary" data-act="cron-save" ${state.busy ? "disabled" : ""}>Salvar cronograma</button></div></div>` : "";
    const st = cc.status;
    return `${form}
      ${st ? `<div class="summary">
        <div class="tile"><div class="eyebrow">Situação</div><div style="margin-top:6px"><span class="pill s-${st.cls}">${esc(st.txt)}</span></div><div class="sub" style="margin-top:6px">Referência ${mesTxt(st.ref.mes)}</div></div>
        <div class="tile"><div class="eyebrow">Previsto até ${mesTxt(st.ref.mes)}</div><div class="v num sm">${brl(st.ref.prevAc)}</div><div class="sub">${pctTxt(pct(st.ref.prevAc, vt))} da obra</div></div>
        <div class="tile"><div class="eyebrow">Medido até ${mesTxt(st.ref.mes)}</div><div class="v num sm">${brl(st.ref.medAc)}</div><div class="sub">${pctTxt(pct(st.ref.medAc, vt))} da obra</div></div>
        <div class="tile"><div class="eyebrow">Diferença</div><div class="v num sm" style="color:var(--${st.desvio < 0 ? "bad" : "ok"})">${brl(st.desvio)}</div><div class="sub">${st.ref.prevAc ? pctTxt(st.ratio * 100) + " do previsto" : ""}</div></div>
      </div>` : ""}
      <section class="blk"><header><h3>Previsto x realizado</h3>${canWrite() && !c ? `<button class="primary" data-act="cron-edit">${(o.cronograma || []).length ? "Editar cronograma" : "+ Lançar cronograma"}</button>` : ""}</header>
        ${cc.rows.length ? curvaS(cc.rows, vt) + `<div class="tbl" style="margin-top:14px"><table><thead><tr><th>Mês</th><th class="r">Previsto</th><th class="r">Prev. acumulado</th><th class="r">Medido</th><th class="r">Med. acumulado</th><th class="r">Diferença</th></tr></thead><tbody>
          ${cc.rows.map(r => { const passado = r.mes <= ym(hojeISO()); const dif = r.medAc - r.prevAc; return `<tr><td class="mono">${mesTxt(r.mes)}</td><td class="mono r">${r.prev ? brl(r.prev) : "—"}</td><td class="mono r">${brl(r.prevAc)}</td><td class="mono r">${r.med ? brl(r.med) : "—"}</td><td class="mono r">${passado ? brl(r.medAc) : "—"}</td><td class="mono r" style="color:var(--${!passado ? "muted" : dif < -0.005 * Math.max(r.prevAc, 1) ? "bad" : "ok"})">${passado ? brl(dif) : "—"}</td></tr>`; }).join("")}
        </tbody></table></div>`
          : `<div class="muted">Nenhum cronograma lançado. Lance os valores previstos por mês para o site comparar com as medições e dizer se a obra está cumprindo o cronograma.</div>`}
        ${cc.rows.length && !cc.temPrev ? `<p class="small muted">Só há medições. Lance o cronograma previsto para comparar.</p>` : ""}
      </section>`;
  }

  /* ---------- Fotos ---------- */
  function tabFotos(o) {
    const fotos = [...(o.fotos || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const datas = [...new Set(fotos.map(f => f.data || ""))];
    let n = 0;
    return `
      <section class="blk"><header><h3>Relatório fotográfico</h3>
        ${canUpload() ? `<div class="btns"><label class="f" style="grid-auto-flow:column;align-items:center;gap:6px">Data da vistoria<input id="foto-data" type="date" data-bind="fotoData" value="${esc(state.fotoData || hojeISO())}" style="width:auto"></label>
          <span class="btn upl primary" style="background:var(--accent);color:var(--panel);border-color:var(--accent)">${state.busy === "foto" ? "Enviando…" : "+ Adicionar fotos"}<input type="file" id="foto-files" multiple accept="image/*" ${state.busy ? "disabled" : ""}></span>
          <span class="btn upl">Tirar foto<input type="file" id="foto-cam" accept="image/*" capture="environment" ${state.busy ? "disabled" : ""}></span></div>` : ""}
      </header>
        ${!state.assets && canWrite() ? `<p class="small muted">O envio de fotos só funciona para quem pode editar este site.</p>` : ""}
        ${fotos.length ? datas.map(d => `<div class="cat"><h5>Vistoria de ${dt(d)}</h5><div class="fotos">${fotos.filter(f => (f.data || "") === d).map(f => { n++; return `
          <figure class="foto" style="margin:0"><a href="${blob(f.id)}" target="_blank" rel="noopener"><img src="${blob(f.id)}" alt="${esc(f.legenda || "Foto " + n)}" loading="lazy"></a>
            <figcaption class="cap"><b>Foto ${n}</b>
              ${canWrite() ? `<textarea id="leg-${esc(f.id)}" data-legenda="${esc(f.id)}" rows="2" placeholder="Legenda da foto" style="min-height:52px;font-size:13px">${esc(f.legenda || "")}</textarea><div class="btns">${state.sample ? `<button class="sm" data-descrever="${esc(f.id)}" ${state.busy ? "disabled" : ""}>${state.busy === "desc:" + f.id ? "Descrevendo…" : f.legenda ? "Refazer legenda" : "Descrever com Claude"}</button>` : ""}${yesNo("foto:" + f.id, "Excluir foto")}</div>` : `<span>${esc(f.legenda || "")}</span>`}
            </figcaption></figure>`; }).join("")}</div></div>`).join("")
          : `<div class="muted">Nenhuma foto lançada. Adicione as fotos de cada vistoria com a data${state.sample ? " e o Claude escreve a legenda de cada uma para você conferir" : " e escreva a legenda de cada uma"}.</div>`}
      </section>`;
  }

  /* ---------- Registros da obra: diário, serviços, notificações e prazos ---------- */
  const CLIMA = ["Bom", "Nublado", "Chuva fraca", "Chuva forte (sem trabalho)"];
  const ETAPAS_PADRAO = ["Serviços preliminares e canteiro", "Movimento de terra", "Fundações", "Estrutura", "Alvenaria e vedações", "Cobertura",
    "Instalações hidrossanitárias", "Instalações elétricas", "Esquadrias", "Revestimentos e pisos", "Pintura", "Louças, metais e acabamentos", "Serviços complementares e limpeza"];
  const SIT_NOT = { aguardando: "Aguardando resposta", respondida: "Respondida", atendida: "Atendida", sem_resposta: "Sem resposta" };
  const TIPOS_PRAZO = ["ART / RRT", "Alvará de construção", "Seguro-garantia / caução", "Licença ambiental", "Vigência do contrato", "Garantia da obra", "Outro"];
  const REG = {
    diario: { nome: "registro do diário", novo: () => ({ data: hojeISO(), diaTipo: "", climaManha: "Bom", climaTarde: "Bom", chuva: "", temperatura: "", impraticavel: "nao", efetivo: "", equipe: "", responsavel: "", equipamentos: "", servicos: "", ocorrencias: "" }),
      campos: [["data", "Data", "date"], ["diaTipo", "Dia", "text", "Ex.: Segunda-feira ou Feriado"], ["climaManha", "Tempo de manhã", CLIMA], ["climaTarde", "Tempo à tarde", CLIMA],
        ["chuva", "Chuva no dia (mm)", "number"], ["temperatura", "Temperatura", "text", "Ex.: mín. 18 °C / máx. 31 °C"], ["impraticavel", "Dia impraticável?", { nao: "Não, houve trabalho", sim: "Sim, sem condições de trabalho" }], ["efetivo", "Trabalhadores na obra", "number"],
        ["equipe", "Equipe (funções)", "text", "Ex.: 1 encarregado, 4 pedreiros, 6 serventes"], ["responsavel", "Responsável da empresa no dia", "text", "Nome do engenheiro ou mestre da contratada"], ["equipamentos", "Equipamentos e materiais recebidos", "text", "Ex.: betoneira, 2 caminhões de areia"],
        ["servicos", "Serviços executados", "textarea", "O que foi feito no dia"], ["ocorrencias", "Ocorrências e orientações à empresa", "textarea", "Problemas, acidentes, falta de material, orientações dadas"]] },
    servicos: { nome: "serviço", novo: () => ({ etapa: "", valor: "", percentual: "0", obs: "" }),
      campos: [["etapa", "Serviço / etapa", "text", "Ex.: Fundações"], ["valor", "Valor na planilha (R$)", "number"], ["percentual", "% executado", "number"], ["obs", "Observações", "text"]] },
    notificacoes: { nome: "notificação", novo: () => ({ numero: "", data: hojeISO(), assunto: "", prazoResposta: "", situacao: "aguardando", resposta: "" }),
      campos: [["numero", "Nº / ofício", "text"], ["data", "Data de envio", "date"], ["assunto", "Assunto", "textarea", "O que foi pedido ou notificado à empresa"],
        ["prazoResposta", "Prazo para resposta", "date"], ["situacao", "Situação", SIT_NOT], ["resposta", "Resposta da empresa", "textarea"]] },
    prazos: { nome: "documento com validade", novo: () => ({ tipo: TIPOS_PRAZO[0], descricao: "", vencimento: "" }),
      campos: [["tipo", "Tipo", TIPOS_PRAZO], ["descricao", "Descrição / número", "text"], ["vencimento", "Vence em", "date"]] }
  };
  const NUMS = ["efetivo", "valor", "percentual", "chuva"];

  function formReg() {
    const r = state.reg; if (!r) return "";
    const L = REG[r.lista], it = r.item;
    const campo = ([k, lb, t, ph]) => {
      const id = `reg-${k}`, wide = t === "textarea" ? " wide" : "";
      if (Array.isArray(t) || (t && typeof t === "object")) {
        const ops = Array.isArray(t) ? t.map(v => [v, v]) : Object.entries(t);
        return `<label class="f${wide}">${lb}<select id="${id}" data-reg="${k}">${ops.map(([v, txt]) => `<option value="${esc(v)}" ${it[k] === v ? "selected" : ""}>${esc(txt)}</option>`).join("")}</select></label>`;
      }
      if (t === "textarea") return `<label class="f wide">${lb}<textarea id="${id}" data-reg="${k}" rows="3" placeholder="${esc(ph || "")}">${esc(it[k])}</textarea></label>`;
      return `<label class="f">${lb}<input id="${id}" data-reg="${k}" type="${t}" ${t === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(it[k])}" placeholder="${esc(ph || "")}"></label>`;
    };
    return `<div class="panel"><h4>${it.id ? "Editar" : "Novo"} ${L.nome}</h4>${r.lista === "diario" ? blocoDiaAuto() : ""}<div class="grid">${L.campos.map(campo).join("")}</div>
      <div class="btns end" style="margin-top:10px"><button data-act="reg-cancel">Cancelar</button><button class="primary" data-act="reg-save" ${state.busy ? "disabled" : ""}>${state.busy === "reg" ? "Salvando…" : "Salvar"}</button></div></div>`;
  }
  const botaoNovo = (lista, txt) => canWrite() && !state.reg ? `<button class="primary" data-reg-new="${lista}">${txt}</button>` : "";
  const acoesReg = (lista, x) => canWrite() ? `<div class="btns"><button class="sm" data-reg-edit="${lista}:${esc(x.id)}">Editar</button>${yesNo(`reg:${lista}:${x.id}`, "Excluir")}</div>` : "";
  const porData = (arr, k = "data") => [...(arr || [])].sort((a, b) => String(b[k]).localeCompare(String(a[k])));

  function tabDiario(o) {
    const dias = porData(o.diario), fotosDia = d => (o.fotos || []).filter(f => f.data === d);
    return `${formReg()}${resumoDiario(o)}${blocoPeriodo(o)}
      <section class="blk"><header><h3>Diário de obra</h3>${botaoNovo("diario", "+ Registrar dia")}</header>
        ${dias.length ? dias.map(x => { const fs = fotosDia(x.data); return `<article class="dia">
          <header><b class="mono">${dt(x.data)}</b>${x.diaTipo ? `<span class="small">${esc(x.diaTipo)}</span>` : ""}${x.impraticavel === "sim" ? `<span class="pill s-warn">Dia impraticável</span>` : ""}<span class="muted small">${esc(x.climaManha || "—")} de manhã · ${esc(x.climaTarde || "—")} à tarde${isNum(x.chuva) ? ` · ${esc(x.chuva)} mm` : ""}${x.temperatura ? ` · ${esc(x.temperatura)}` : ""}${isNum(x.efetivo) ? ` · ${esc(x.efetivo)} trabalhador(es)` : ""}</span></header>
          ${x.equipe ? `<p><span class="lbl">Equipe</span>${esc(x.equipe)}</p>` : ""}
          ${x.equipamentos ? `<p><span class="lbl">Equipamentos e materiais</span>${esc(x.equipamentos)}</p>` : ""}
          ${x.servicos ? `<p><span class="lbl">Serviços executados</span><span class="note">${esc(x.servicos)}</span></p>` : ""}
          ${x.ocorrencias ? `<p><span class="lbl">Ocorrências</span><span class="note">${esc(x.ocorrencias)}</span></p>` : ""}
          ${fs.length ? `<div class="dia-fotos">${fs.slice(0, 6).map(f => `<a href="${blob(f.id)}" target="_blank" rel="noopener"><img src="${blob(f.id)}" alt="${esc(f.legenda || "Foto do dia")}" loading="lazy"></a>`).join("")}${fs.length > 6 ? `<button class="ghost sm" data-tab="fotos">+${fs.length - 6} foto(s)</button>` : ""}</div>` : ""}
          <div class="btns">${acoesReg("diario", x).replace(/^<div class="btns">|<\/div>$/g, "")}<button class="sm" data-rel="rdo" data-formato="pdf" data-dia="${esc(x.data)}" ${state.busy ? "disabled" : ""}>RDO em PDF</button><button class="sm" data-rel="dia" data-formato="pdf" data-dia="${esc(x.data)}" ${state.busy ? "disabled" : ""}>PDF do dia</button></div></article>`; }).join("")
          : `<div class="muted">Nenhum dia registrado. Anote o tempo, a equipe, os serviços e as ocorrências de cada dia em que for à obra. As fotos com a mesma data aparecem junto e tudo entra no relatório do dia.</div>`}
      </section>`;
  }

  /* ---------- Diário automático: clima (Open-Meteo), feriados (BrasilAPI) e dados que já estão na ficha ---------- */
  const EDEALINA = { lat: -17.4258, lng: -49.66 };
  const FERIADOS_FIXOS = { "01-01": "Confraternização Universal", "04-21": "Tiradentes", "05-01": "Dia do Trabalho", "09-07": "Independência do Brasil", "10-12": "Nossa Senhora Aparecida", "11-02": "Finados", "11-15": "Proclamação da República", "11-20": "Dia da Consciência Negra", "12-25": "Natal" };
  const SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const cacheFeriados = {};
  async function jsonDe(url) { const r = await fetch(url); if (!r.ok) throw new Error("http " + r.status); return r.json(); }
  async function feriadoDe(dia) {
    const ano = dia.slice(0, 4);
    if (!cacheFeriados[ano]) cacheFeriados[ano] = jsonDe(`https://brasilapi.com.br/api/feriados/v1/${ano}`).catch(() => null);
    const lista = await cacheFeriados[ano];
    const f = Array.isArray(lista) && lista.find(x => x.date === dia);
    return f ? f.name : (lista ? "" : FERIADOS_FIXOS[dia.slice(5)] || "");
  }
  const climaDe = (mm, cod) => mm >= 5 ? "Chuva forte (sem trabalho)" : mm > 0.2 || cod >= 51 ? "Chuva fraca" : cod >= 2 ? "Nublado" : "Bom";
  async function tempoDe(dia, lat, lng) {
    const q = `latitude=${lat}&longitude=${lng}&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min&hourly=precipitation,weather_code&timezone=America%2FSao_Paulo&start_date=${dia}&end_date=${dia}`;
    let j = null;
    for (const base of ["https://api.open-meteo.com/v1/forecast", "https://archive-api.open-meteo.com/v1/archive"]) {
      try { j = await jsonDe(`${base}?${q}`); if (j && j.daily && isNum(j.daily.precipitation_sum?.[0])) break; } catch (e) { j = null; }
    }
    if (!j || !j.daily) return null;
    const h = j.hourly || {}, faixa = (ini, fim) => { let mm = 0, cod = 0; (h.time || []).forEach((t, i) => { const hr = Number(t.slice(11, 13)); if (hr >= ini && hr < fim) { mm += Number(h.precipitation[i]) || 0; cod = Math.max(cod, Number(h.weather_code[i]) || 0); } }); return climaDe(mm, cod); };
    const d = j.daily, r1 = n => Math.round(Number(n) * 10) / 10;
    return { manha: faixa(6, 12), tarde: faixa(12, 18), chuva: r1(d.precipitation_sum[0] || 0), tmax: r1(d.temperature_2m_max[0]), tmin: r1(d.temperature_2m_min[0]) };
  }
  async function diarioAutomatico() {
    const o = curObra(), r = state.reg; if (!o || !r) return;
    const it = r.item, dia = it.data || hojeISO(), feito = [];
    state.busy = "dia-auto"; state.error = state.warn = ""; state.info = "Buscando o clima, os feriados e os dados da obra…"; render();
    const lat = isNum(o.lat) ? Number(o.lat) : EDEALINA.lat, lng = isNum(o.lng) ? Number(o.lng) : EDEALINA.lng;
    const [tempo, feriado] = await Promise.all([tempoDe(dia, lat, lng).catch(() => null), feriadoDe(dia).catch(() => "")]);
    if (tempo) {
      Object.assign(it, { climaManha: tempo.manha, climaTarde: tempo.tarde, chuva: String(tempo.chuva), temperatura: isNum(tempo.tmin) ? `mín. ${tempo.tmin.toLocaleString("pt-BR")} °C / máx. ${tempo.tmax.toLocaleString("pt-BR")} °C` : "" });
      if (tempo.chuva >= 10) it.impraticavel = "sim";
      feito.push(`clima${isNum(o.lat) ? " no local da obra" : " de Edealina"}`);
    }
    const sem = SEMANA[new Date(dia + "T12:00:00").getDay()];
    it.diaTipo = feriado ? `Feriado: ${feriado}` : sem; feito.push("dia da semana e feriados");
    const ant = porData(o.diario).find(x => x.data < dia && x.id !== it.id);
    if (ant) { ["efetivo", "equipe", "equipamentos", "responsavel"].forEach(k => { if (!String(it[k] ?? "").trim() && ant[k] !== null && ant[k] !== undefined) it[k] = String(ant[k]); }); feito.push(`equipe do dia ${dt(ant.data)}`); }
    const fotos = (o.fotos || []).filter(f => f.data === dia && f.legenda);
    const vist = (o.vistorias || []).filter(v => v.data === dia && v.obs), meds = (o.medicoes || []).filter(m => m.data === dia);
    if (!String(it.servicos || "").trim() && (fotos.length || vist.length)) { it.servicos = [...vist.map(v => v.obs), ...fotos.map(f => "– " + f.legenda)].join("\n"); feito.push(`${fotos.length} legenda(s) de foto`); }
    if (!String(it.ocorrencias || "").trim()) {
      const oc = [...meds.map(m => `Medição nº ${m.numero || "–"} lançada, no valor de ${brl(m.valor)}.`),
        ...(o.pendencias || []).filter(p => !p.resolvida && p.prazo && p.prazo < dia).map(p => `Pendência vencida: ${p.texto} (prazo ${dt(p.prazo)}).`),
        ...(o.notificacoes || []).filter(x => x.situacao === "aguardando" && x.prazoResposta && x.prazoResposta < dia).map(x => `Notificação ${x.numero || ""} sem resposta no prazo: ${x.assunto}.`)];
      if (oc.length) { it.ocorrencias = oc.join("\n"); feito.push("medições, pendências e notificações"); }
    }
    state.busy = "";
    state.info = `Preenchido com: ${feito.join(", ")}. Confira e corrija antes de salvar.`;
    if (!tempo) state.warn = "Não consegui buscar o clima na internet agora. Preencha o tempo à mão.";
    render();
  }
  async function diarioComClaude() {
    const o = curObra(), r = state.reg; if (!o || !r || !state.sample) return;
    const it = r.item, dia = it.data || hojeISO();
    const fotos = (o.fotos || []).filter(f => f.data === dia), ant = porData(o.diario).filter(x => x.data < dia).slice(0, 3);
    const pend = (o.pendencias || []).filter(p => !p.resolvida).map(p => p.texto + (p.prazo ? ` (prazo ${dt(p.prazo)})` : ""));
    const ctx = { obra: o.nome, objeto: o.objeto || "", dia: `${dt(dia)} (${SEMANA[new Date(dia + "T12:00:00").getDay()]})`, situacao: SIT[o.situacao] || "", executado: o.percentual,
      tempo: `manhã ${it.climaManha}, tarde ${it.climaTarde}${isNum(it.chuva) ? `, ${it.chuva} mm de chuva` : ""}`, equipe: `${it.efetivo || "?"} trabalhadores: ${it.equipe || ""}`,
      anotacoesDoFiscal: { servicos: it.servicos || "", ocorrencias: it.ocorrencias || "" }, legendasDasFotosDoDia: fotos.map(f => f.legenda).filter(Boolean),
      servicosEmAndamento: (o.servicos || []).filter(x => Number(x.percentual) > 0 && Number(x.percentual) < 100).map(x => `${x.etapa} (${x.percentual}%)`),
      diasAnteriores: ant.map(x => ({ data: dt(x.data), servicos: x.servicos })), pendenciasAbertas: pend };
    const imgs = [];
    for (const f of fotos.slice(0, 4)) { try { const b = await (await fetch(blob(f.id))).blob(); if (/^image\/(jpeg|png|webp|gif)$/.test(b.type)) imgs.push(b); } catch (e) {} }
    state.busy = "dia-claude"; state.error = state.warn = ""; state.info = "O Claude está escrevendo o diário do dia…"; render();
    try {
      const res = await state.sample.json(`${areaDe(o) === "pessoal" ? "Você é o engenheiro civil responsável técnico desta obra." : "Você é engenheiro civil fiscal de obra pública da Prefeitura de Edealina-GO."} Escreva o diário de obra (RDO) deste dia, em português formal e objetivo, só com fatos que estejam nos dados ou nas fotos; não invente quantidades nem serviços.
Dados: ${JSON.stringify(ctx)}
Responda só com JSON: {"servicos": "serviços executados no dia, um por linha começando com – ", "ocorrencias": "ocorrências, condições de segurança, orientações à empresa e pendências relevantes, um por linha começando com – (vazio se não houver)"}`, imgs.length ? { images: imgs } : undefined);
      if (res && typeof res.servicos === "string") it.servicos = res.servicos.trim();
      if (res && typeof res.ocorrencias === "string" && res.ocorrencias.trim()) it.ocorrencias = res.ocorrencias.trim();
      state.info = "Texto escrito pelo Claude. Confira e corrija antes de salvar.";
    } catch (e) { state.info = ""; state.error = sampleErro(e); }
    state.busy = ""; render();
  }
  function blocoDiaAuto() {
    return `<div class="auto-box"><div><b>Preencher automático</b><span class="small muted">Clima do dia pela localização da obra, feriados, equipe do último dia, legendas das fotos, medições e pendências.</span></div>
      <div class="btns"><button data-act="dia-auto" ${state.busy ? "disabled" : ""}>${state.busy === "dia-auto" ? "Buscando…" : "Preencher automático"}</button>
      ${state.sample ? `<button data-act="dia-claude" ${state.busy ? "disabled" : ""}>${state.busy === "dia-claude" ? "Escrevendo…" : "Escrever com Claude"}</button>` : ""}</div></div>`;
  }
  function resumoDiario(o) {
    const d = o.diario || []; if (!d.length) return "";
    const imp = d.filter(x => x.impraticavel === "sim").length, chuva = d.reduce((s, x) => s + (Number(x.chuva) || 0), 0);
    const ef = d.filter(x => isNum(x.efetivo)), media = ef.length ? ef.reduce((s, x) => s + Number(x.efetivo), 0) / ef.length : null;
    return `<div class="summary">
      <div class="tile"><div class="eyebrow">Dias registrados</div><div class="v num">${d.length}</div></div>
      <div class="tile"><div class="eyebrow">Dias impraticáveis</div><div class="v num" ${imp ? 'style="color:var(--warn)"' : ""}>${imp}</div><div class="sub">contam para prazo e aditivo</div></div>
      <div class="tile"><div class="eyebrow">Chuva registrada</div><div class="v num sm">${chuva.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</div></div>
      <div class="tile"><div class="eyebrow">Efetivo médio</div><div class="v num sm">${media === null ? "—" : media.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " pessoas"}</div></div>
    </div>`;
  }

  /* % físico pelos serviços: média ponderada pelo valor de cada serviço (ou média simples, se faltar o valor de algum) */
  function fisicoServicos(o) {
    const s = (o.servicos || []).filter(x => x.etapa); if (!s.length) return null;
    const tot = s.reduce((a, x) => a + (Number(x.valor) || 0), 0), todos = s.every(x => Number(x.valor) > 0);
    const p = todos ? s.reduce((a, x) => a + (Number(x.valor) || 0) * (Number(x.percentual) || 0), 0) / tot : s.reduce((a, x) => a + (Number(x.percentual) || 0), 0) / s.length;
    return { pct: Math.round(p * 10) / 10, total: tot, n: s.length, ponderado: todos };
  }
  function tabServicos(o) {
    const s = o.servicos || [], f = fisicoServicos(o), vt = valorTotal(o);
    const dif = f && isNum(o.percentual) ? f.pct - Number(o.percentual) : null;
    return `${formReg()}
      ${f ? `<div class="summary">
        <div class="tile"><div class="eyebrow">Executado pelos serviços</div><div class="v num">${pctTxt(f.pct)}</div><div class="bar wide" style="margin-top:6px"><i style="width:${Math.min(100, f.pct)}%"></i></div><div class="sub">${f.ponderado ? "Média pesada pelo valor de cada serviço" : "Média simples: ponha o valor de todos os serviços para pesar pelo valor"}</div></div>
        <div class="tile"><div class="eyebrow">% da ficha da obra</div><div class="v num">${isNum(o.percentual) ? pctTxt(Number(o.percentual)) : "—"}</div>${canWrite() && s.some(x => Number(x.percentual) > 0) && (dif === null || Math.abs(dif) >= 0.1) ? `<button class="sm" data-act="serv-aplicar" style="margin-top:6px">Usar ${pctTxt(f.pct)} na ficha</button>` : `<div class="sub">${dif !== null && Math.abs(dif) < 0.1 ? "Igual ao calculado" : "Marque o % de cada serviço"}</div>`}</div>
        <div class="tile"><div class="eyebrow">Valor dos serviços</div><div class="v num sm">${f.total ? brl(f.total) : "—"}</div><div class="sub">${f.total && vt ? pctTxt(pct(f.total, vt)) + " do valor da obra" : `${f.n} serviço(s)`}</div></div>
      </div>` : ""}
      <section class="blk"><header><h3>Serviços da obra</h3><div class="btns">${canWrite() && !s.length && !state.reg ? `<button data-act="serv-padrao">Usar etapas padrão</button>` : ""}${botaoNovo("servicos", "+ Serviço")}</div></header>
        ${s.length ? `<div class="tbl"><table><thead><tr><th>Serviço / etapa</th><th class="r">Valor</th><th class="r">Peso</th><th class="r">% executado</th><th></th></tr></thead><tbody>
          ${s.map(x => `<tr><td>${esc(x.etapa)}${x.obs ? `<div class="small muted">${esc(x.obs)}</div>` : ""}</td><td class="mono r">${isNum(x.valor) ? brl(x.valor) : "—"}</td>
            <td class="mono r">${f && f.ponderado ? pctTxt(pct(Number(x.valor), f.total)) : "—"}</td>
            <td class="r">${canWrite() ? `<span class="pct-cel"><input type="number" min="0" max="100" step="1" inputmode="numeric" id="serv-p-${esc(x.id)}" data-serv-pct="${esc(x.id)}" value="${esc(Number(x.percentual) || 0)}" aria-label="% executado de ${esc(x.etapa)}"><span>%</span></span>` : `<span class="mono">${esc(Number(x.percentual) || 0)}%</span>`}
              <div class="bar" style="margin-top:4px"><i style="width:${Math.max(0, Math.min(100, Number(x.percentual) || 0))}%"></i></div></td>
            <td>${acoesReg("servicos", x)}</td></tr>`).join("")}
        </tbody></table></div><p class="small muted" style="margin:10px 0 0">Mude o % de cada serviço direto na tabela; ele é salvo na hora.</p>`
          : `<div class="muted">Nenhum serviço lançado. Lance as etapas da planilha orçamentária com o valor de cada uma e vá marcando o % executado. O site calcula o % da obra.</div>`}
      </section>`;
  }

  function tabNotificacoes(o) {
    const nots = porData(o.notificacoes), prazos = [...(o.prazos || [])].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    const venc = d => { const n = diasAte(d); return n === null ? "—" : n < 0 ? `<span class="prazo-late">${dt(d)} · vencido</span>` : n <= 30 ? `<span class="prazo-soon">${dt(d)} · faltam ${n} dia(s)</span>` : dt(d); };
    const sitNot = x => { const atras = x.situacao === "aguardando" && diasAte(x.prazoResposta) !== null && diasAte(x.prazoResposta) < 0;
      return `<span class="pill s-${x.situacao === "atendida" ? "ok" : x.situacao === "respondida" ? "andamento" : atras || x.situacao === "sem_resposta" ? "bad" : "warn"}">${atras ? "Prazo vencido" : esc(SIT_NOT[x.situacao] || "—")}</span>`; };
    return `${formReg()}
      <section class="blk"><header><h3>Notificações à empresa</h3>${botaoNovo("notificacoes", "+ Notificação")}</header>
        ${nots.length ? `<div class="tbl"><table><thead><tr><th>Nº</th><th>Data</th><th>Assunto</th><th>Responder até</th><th>Situação</th><th></th></tr></thead><tbody>
          ${nots.map(x => `<tr><td>${esc(x.numero || "")}</td><td class="mono">${dt(x.data)}</td><td class="note">${esc(x.assunto || "")}${x.resposta ? `<div class="small muted">Resposta: ${esc(x.resposta)}</div>` : ""}</td><td class="mono">${dt(x.prazoResposta)}</td><td>${sitNot(x)}</td><td>${acoesReg("notificacoes", x)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted">Nenhuma notificação registrada. Registre os ofícios e notificações enviados à empresa com o prazo de resposta, e o site avisa quando o prazo vencer.</div>`}
      </section>
      <section class="blk"><header><h3>Documentos com validade</h3>${botaoNovo("prazos", "+ Documento")}</header>
        ${prazos.length ? `<div class="tbl"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th></th></tr></thead><tbody>
          ${prazos.map(x => `<tr><td>${esc(x.tipo || "")}</td><td>${esc(x.descricao || "")}</td><td class="mono">${venc(x.vencimento)}</td><td>${acoesReg("prazos", x)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted">Nenhum documento com validade. Lance a ART, o alvará, o seguro-garantia e a licença ambiental com a data de vencimento, e o site avisa 30 dias antes.</div>`}
      </section>`;
  }

  /* ---------- Monitoramento: alertas de cada obra ---------- */
  function alertas(o) {
    const a = [], add = (nivel, txt, tab) => a.push({ nivel, txt, tab, obra: o });
    if (o.situacao === "concluida") {
      (o.prazos || []).forEach(x => { const n = diasAte(x.vencimento); if (n !== null && n >= 0 && n <= 30 && /garantia/i.test(x.tipo || "")) add("warn", `${x.tipo} vence em ${n} dia(s) (${dt(x.vencimento)})`, "notificacoes"); });
      return a;
    }
    const p = prazoAtual(o), np = diasAte(p);
    if (np !== null && np < 0) add("bad", `Prazo da obra vencido há ${-np} dia(s) (${dt(p)})`, "resumo");
    else if (np !== null && np <= 30) add("warn", `Prazo da obra vence em ${np} dia(s) (${dt(p)})`, "resumo");
    if (o.situacao === "paralisada") add("bad", "Obra paralisada", "resumo");
    if (o.situacao !== "nao_iniciada") {
      const ult = [...(o.vistorias || []).map(v => v.data), ...(o.diario || []).map(d => d.data), ...(o.fotos || []).map(f => f.data)].filter(Boolean).sort().pop();
      const nd = ult ? -diasAte(ult) : null;
      if (nd === null) add("warn", "Nenhuma visita registrada (vistoria, diário ou foto)", "diario");
      else if (nd > 15) add(nd > 30 ? "bad" : "warn", `Última visita registrada há ${nd} dias (${dt(ult)})`, "diario");
    }
    const vt = valorTotal(o), md = medido(o), fis = fisicoServicos(o), pf = fis ? fis.pct : isNum(o.percentual) ? Number(o.percentual) : null;
    if (vt && md > vt) add("bad", `Medições passam ${brl(md - vt)} do valor da obra`, "medicoes");
    else if (vt && pf !== null && pct(md, vt) - pf > 10) add("warn", `Medido (${pctTxt(pct(md, vt))}) está acima do executado (${pctTxt(pf)})`, "medicoes");
    const cs = cronoCalc(o).status;
    if (cs && cs.cls === "bad") add("bad", "Atrasada em relação ao cronograma", "cronograma");
    else if (cs && cs.cls === "warn") add("warn", "Pequeno atraso no cronograma", "cronograma");
    const pv = (o.pendencias || []).filter(x => !x.resolvida && diasAte(x.prazo) !== null && diasAte(x.prazo) < 0).length;
    if (pv) add("bad", `${pv} pendência(s) com prazo vencido`, "vistorias");
    const nv = (o.notificacoes || []).filter(x => x.situacao === "aguardando" && diasAte(x.prazoResposta) !== null && diasAte(x.prazoResposta) < 0).length;
    if (nv) add("bad", `${nv} notificação(ões) sem resposta no prazo`, "notificacoes");
    (o.prazos || []).forEach(x => { const n = diasAte(x.vencimento); if (n === null) return;
      if (n < 0) add("bad", `${x.tipo} vencido(a) em ${dt(x.vencimento)}`, "notificacoes"); else if (n <= 30) add("warn", `${x.tipo} vence em ${n} dia(s) (${dt(x.vencimento)})`, "notificacoes"); });
    const rc = recDaObra(o), nr = rc ? diasAte(rc.vigenciaFim) : null;
    if (nr !== null && nr < 0) add("bad", `Vigência do convênio ${rc.numero} terminou em ${dt(rc.vigenciaFim)}`, "resumo");
    else if (nr !== null && nr <= 60) add("warn", `Vigência do convênio ${rc.numero} termina em ${nr} dia(s) (${dt(rc.vigenciaFim)})`, "resumo");
    if (fis && isNum(o.percentual) && Math.abs(fis.pct - Number(o.percentual)) >= 5) add("info", `% da ficha (${pctTxt(Number(o.percentual))}) diferente do calculado pelos serviços (${pctTxt(fis.pct)})`, "servicos");
    return a;
  }
  const ORD_ALERTA = { bad: 0, warn: 1, info: 2 };
  function blocoAlertas(lista, comObra) {
    if (!lista.length) return "";
    lista = [...lista].sort((x, y) => ORD_ALERTA[x.nivel] - ORD_ALERTA[y.nivel]);
    const max = comObra && !state.todosAlertas ? 8 : lista.length;
    return `<section class="blk alertas"><header><h3>${comObra ? "Monitoramento" : "Alertas desta obra"}</h3><span class="muted small">${lista.filter(x => x.nivel === "bad").length} grave(s) · ${lista.filter(x => x.nivel === "warn").length} atenção</span></header>
      <ul>${lista.slice(0, max).map(x => `<li><button class="alerta a-${x.nivel}" data-alerta="${esc(x.obra.id)}" data-alerta-tab="${esc(x.tab)}"><span class="dot"></span><span>${comObra ? `<b>${esc(x.obra.nome)}</b> · ` : ""}${esc(x.txt)}</span><span class="seta">›</span></button></li>`).join("")}</ul>
      ${lista.length > max ? `<button class="ghost sm" data-act="alertas-todos">Ver todos os ${lista.length} alertas</button>` : ""}</section>`;
  }

  /* ---------- Formulário de dados ---------- */
  const LISTAS = {
    aditivos: { titulo: "Aditivos", novo: { numero: "", data: "", descricao: "", novoPrazo: "", valor: "" },
      campos: [["numero", "Nº", "text"], ["data", "Data", "date"], ["descricao", "Objeto", "text"], ["novoPrazo", "Novo prazo", "date"], ["valor", "Valor (R$)", "number"]] },
    vistorias: { titulo: "Vistorias", novo: { data: "", situacao: "", percentual: "", obs: "" },
      campos: [["data", "Data", "date"], ["situacao", "Situação", "sit"], ["percentual", "% exec.", "number"], ["obs", "Observações", "text"]] },
    pendencias: { titulo: "Pendências", novo: { texto: "", prazo: "", resolvida: false },
      campos: [["texto", "Pendência", "text"], ["prazo", "Prazo", "date"], ["resolvida", "Resolvida", "check"]] },
    relatorios: { titulo: "Relatórios emitidos", novo: { data: "", titulo: "", arquivo: "" },
      campos: [["data", "Data", "date"], ["titulo", "Relatório", "text"], ["arquivo", "Arquivo", "text"]] }
  };
  const sitOpts = v => `<option value="">—</option>` + Object.entries(SIT).map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("");
  function renderForm() {
    const d = state.draft; d.caixa = d.caixa || {};
    const f = (k, label, type = "text", wide = false, ph = "") => `<label class="f ${wide ? "wide" : ""}">${label}
      ${type === "textarea" ? `<textarea id="f-${k}" data-k="${k}">${esc(d[k])}</textarea>` :
        type === "sit" ? `<select id="f-${k}" data-k="${k}">${sitOpts(d[k])}</select>` :
        `<input id="f-${k}" data-k="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(d[k])}" placeholder="${esc(ph)}">`}</label>`;
    const cx = (k, label, type = "text", ph = "") => `<label class="f">${label}<input id="cx-${k}" data-cx="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(d.caixa[k])}" placeholder="${esc(ph)}"></label>`;
    const lista = nome => { const L = LISTAS[nome]; const arr = d[nome] || []; return `
      <section class="blk"><header><h3>${L.titulo}</h3><button type="button" data-add="${nome}">+ Adicionar</button></header>
        <div class="rows">${arr.length ? arr.map((it, i) => `<div class="row">${L.campos.map(([k, lb, t]) => `<label class="f">${lb}
          ${t === "sit" ? `<select id="l-${nome}-${i}-${k}" data-l="${nome}" data-i="${i}" data-k="${k}">${sitOpts(it[k])}</select>` :
            t === "check" ? `<input id="l-${nome}-${i}-${k}" type="checkbox" data-l="${nome}" data-i="${i}" data-k="${k}" ${it[k] ? "checked" : ""}>` :
            `<input id="l-${nome}-${i}-${k}" type="${t}" ${t === "number" ? 'step="any"' : ""} data-l="${nome}" data-i="${i}" data-k="${k}" value="${esc(it[k])}">`}</label>`).join("")}
          <button type="button" class="danger" data-rem="${nome}" data-i="${i}">Remover</button></div>`).join("")
          : `<div class="muted">Nada registrado.</div>`}</div></section>`; };
    app.innerHTML = header() + msgs() + `
      <button class="ghost back" data-act="cancelar">← Cancelar</button>
      <h2 style="margin-bottom:14px">${state.editId ? "Editar dados da obra" : "Nova obra"}</h2>
      ${importHtml()}
      <form id="form" novalidate>
        <section class="blk"><header><h3>Dados da obra</h3></header><div class="grid">
          <label class="f">Área<select id="f-area" data-k="area"><option value="prefeitura" ${areaDe(d) === "prefeitura" ? "selected" : ""}>Prefeitura de Edealina</option><option value="pessoal" ${areaDe(d) === "pessoal" ? "selected" : ""}>Pessoal (minhas obras)</option></select></label>
          ${f("nome", "Nome da obra *", "text", true)}
          ${f("objeto", "Objeto", "text", true)}
          <label class="f">Tipo de obra<select id="f-tipoObra" data-k="tipoObra"><option value="">—</option>${TIPOS_OBRA.map(t => `<option ${d.tipoObra === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
          ${f("numero", "Contrato / instrumento")}
          ${f("modalidade", "Modalidade")}
          ${areaDe(d) === "pessoal" ? f("cliente", "Cliente / proprietário") : ""}
          ${f("empresa", areaDe(d) === "pessoal" ? "Empresa executora (se houver)" : "Empresa contratada")}
          ${f("cnpj", "CNPJ")}
          ${f("fonte", "Fonte de recurso")}
          ${f("valor", "Valor inicial (R$)", "number")}
          ${f("dataInicio", "Início", "date")}
          ${f("prazoFinal", "Prazo original", "date")}
          ${f("situacao", "Situação", "sit")}
          ${f("percentual", "% executado (físico)", "number")}
          ${f("observacoes", "Situação atual / observações", "textarea", true)}
        </div></section>
        <section class="blk"><header><h3>Localização</h3></header><div class="grid">
          ${f("endereco", "Endereço", "text", true)}
          ${f("municipio", "Município - UF", "text", false, "Ex.: Edealina - GO")}
          ${f("coordenadas", "Coordenadas", "text", true, "Ex.: S 17°25'33\" W 49°39'36\" ou -17.4258, -49.6600")}
        </div><p class="small muted" style="margin:8px 0 0">Copie as coordenadas do Google Maps ou da foto georreferenciada.</p></section>
        <section class="blk"><header><h3>Orçamento e referências Caixa</h3></header><div class="grid">
          ${cx("valorPO", "Valor da PO (R$)", "number")}
          ${cx("referencia", "Tabela de referência", "text", "Ex.: SINAPI-GO")}
          ${cx("dataBase", "Data-base", "month")}
          <label class="f">Desoneração<select id="cx-desonerado" data-cx="desonerado"><option value="">—</option><option value="sim" ${d.caixa.desonerado === "sim" ? "selected" : ""}>Desonerado</option><option value="nao" ${d.caixa.desonerado === "nao" ? "selected" : ""}>Não desonerado</option></select></label>
          ${cx("bdi", "BDI (%)", "number")}
          ${cx("operacao", "Contrato de repasse / operação", "text", "Nº da operação Caixa ou Transferegov")}
        </div></section>
        ${lista("pendencias")}${lista("vistorias")}${lista("aditivos")}${lista("relatorios")}
        <div class="actions">
          ${state.editId ? `<span style="margin-right:auto">${yesNo("obra:" + state.editId, "Excluir obra", 'type="button"')}</span>` : ""}
          <button type="button" data-act="cancelar">Cancelar</button>
          <button type="submit" class="primary" id="salvar">Salvar</button>
        </div>
      </form>`;
  }

  const slug = s => (s || "obra").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "obra";
  const limpo = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
  const go = v => { state.view = v; state.error = ""; state.info = ""; state.warn = ""; state.confirm = ""; render(); window.scrollTo(0, 0); };
  const erroTxt = (e, acao) => {
    const c = e && e.code;
    if (c === "invalid_argument") { state.readOnly = true; return "Você não tem permissão para alterar este controle."; }
    if (c === "quota_exceeded" || c === "quota_or_state") return "O espaço de armazenamento está cheio. Exclua arquivos antigos para liberar espaço.";
    if (c === "unsupported_type") return "Esse tipo de arquivo não é aceito.";
    if (c === "too_large") return "O arquivo é grande demais (máximo de 20 MB).";
    return `Não foi possível ${acao} agora. Tente de novo em instantes.`;
  };

  async function salvarObra() {
    const d = state.draft;
    if (!String(d.nome || "").trim()) { state.error = "Informe o nome da obra para salvar."; render(); return; }
    const c = parseCoord(d.coordenadas);
    if (c === null) { state.error = "Não entendi as coordenadas. Use o formato -17.4258, -49.6600 ou S 17°25'33\" W 49°39'36\"."; render(); return; }
    d.lat = c.lat; d.lng = c.lng; delete d.coordenadas;
    ["valor", "percentual"].forEach(k => { d[k] = isNum(d[k]) ? Number(d[k]) : null; });
    ["valorPO", "bdi"].forEach(k => { d.caixa[k] = isNum(d.caixa[k]) ? Number(d.caixa[k]) : null; });
    (d.aditivos || []).forEach(a => { a.valor = isNum(a.valor) ? Number(a.valor) : null; });
    (d.vistorias || []).forEach(v => { v.percentual = isNum(v.percentual) ? Number(v.percentual) : null; });
    d.area = areaDe(d);
    if (d.area === "pessoal" && !d.dono && state.userId) d.dono = state.userId;
    state.area = d.area;
    d.atualizadoEm = new Date().toISOString();
    let id = state.editId;
    if (!id) { id = slug(d.nome); if (state.obras.some(o => o.id === id)) id += "-" + Date.now().toString(36); }
    const btn = document.getElementById("salvar"); if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
    try {
      if (btn) btn.textContent = state.impFiles.length ? "Salvando e enviando arquivos…" : "Salvando…";
      await state.db.collection("obras").doc(id).set(limpo(d));
      if (!state.obras.some(x => x.id === id)) state.obras = [...state.obras, { id, ...limpo(d) }];
      let anexos = 0, falhaAnexo = "";
      try { anexos = await anexarImportados(id); } catch (e) { falhaAnexo = erroTxt(e, "anexar os documentos"); }
      state.impFiles = []; state.draft = null; state.editId = null; state.tab = "resumo"; go(id);
      state.info = "Dados salvos." + (anexos ? ` ${anexos} documento(s) anexado(s) na aba Projetos e documentos.` : ""); state.error = falhaAnexo; render();
    } catch (e) { state.error = erroTxt(e, "salvar"); d.coordenadas = coordTxt(d); render(); }
  }

  async function patch(o, data) {
    await state.db.collection("obras").doc(o.id).update({ ...data, atualizadoEm: new Date().toISOString() });
  }
  const tipoDe = f => f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : /\.csv$/i.test(f.name) ? "text/csv" : /\.txt$/i.test(f.name) ? "text/plain" : /\.jpe?g$/i.test(f.name) ? "image/jpeg" : /\.png$/i.test(f.name) ? "image/png" : "");
  const nativo = t => !!window.CONTROLE_SITE || t === "application/pdf" || t === "text/csv" || t === "text/plain" || (t.startsWith("image/") && !/heic|heif|tiff/i.test(t));
  const paraBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(file); });
  async function subir(file) {
    let type = tipoDe(file);
    if (type === "application/vnd.ms-excel" && /\.csv$/i.test(file.name)) type = "text/csv";
    if (!nativo(type)) {
      /* Excel, Word e outros formatos: guardados como texto base64 e devolvidos ao formato original no download */
      const b64 = await paraBase64(file);
      const r = await state.assets.upload(new Blob([b64], { type: "text/plain" }), { type: "text/plain" });
      return { id: r.id, nome: file.name, tipo: type || "application/octet-stream", tam: file.size, codificado: "base64" };
    }
    const r = await state.assets.upload(file, { type });
    return { id: r.id, nome: file.name, tipo: r.contentType, tam: r.sizeBytes };
  }
  async function bytesDoArquivo(f) {
    const res = await fetch(blob(f.id)); if (!res.ok) throw new Error("fetch");
    if (!f.codificado) return new Uint8Array(await res.arrayBuffer());
    const bin = atob((await res.text()).trim()); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  const loadAny = async urls => { for (const u of urls) { try { await loadScript(u); return; } catch (e) {} } throw new Error("script"); };
  async function sheetLib() { if (!window.XLSX) await loadAny(SHEETJS); return window.XLSX; }
  async function docLib() { if (!window.mammoth) await loadAny(MAMMOTH); return window.mammoth; }
  const PERMITIDAS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "BR", "SUP", "SUB"]);
  function limparHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = el => { [...el.children].forEach(c => { walk(c); if (!PERMITIDAS.has(c.tagName)) { c.replaceWith(...c.childNodes); return; } [...c.attributes].forEach(a => { if (!["colspan", "rowspan"].includes(a.name)) c.removeAttribute(a.name); }); }); };
    walk(doc.body); return doc.body.innerHTML;
  }
  async function abrirPreview(id, nome) {
    const o = curObra(); const todos = [...(o.documentos || []).flatMap(d => d.arquivos || []), ...(o.medicoes || []).flatMap(m => m.arquivos || [])];
    const f = todos.find(x => x.id === id) || { id, nome, codificado: "base64" };
    state.preview = { f, loading: true, html: "", sheets: null, sheet: 0 }; render(); window.scrollTo(0, 0);
    try {
      const bytes = await bytesDoArquivo(f);
      if (PLANILHA.test(f.nome)) {
        const X = await sheetLib(); const wb = X.read(bytes, { type: "array" });
        state.preview.sheets = wb.SheetNames.map(n => ({ nome: n, linhas: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }) }));
      } else if (TEXTO.test(f.nome)) {
        const M = await docLib(); const r = await M.convertToHtml({ arrayBuffer: bytes.buffer });
        state.preview.html = limparHtml(r.value);
      } else state.preview.semVisual = true;
    } catch (e) { state.preview.erro = true; }
    state.preview.loading = false; render();
  }
  function previewHtml() {
    const p = state.preview; if (!p) return "";
    let corpo;
    if (p.loading) corpo = `<div class="muted" style="padding:16px">Abrindo o arquivo…</div>`;
    else if (p.erro) corpo = `<div class="muted" style="padding:16px">Não foi possível abrir este arquivo aqui.${state.downloads ? " Baixe o original para abrir no computador." : ""}</div>`;
    else if (p.semVisual) corpo = `<div class="muted" style="padding:16px">Este formato não tem visualização no site.${state.downloads ? " Baixe o original para abrir no computador." : ""}</div>`;
    else if (p.sheets) {
      const sh = p.sheets[p.sheet] || { linhas: [] }; const linhas = sh.linhas.slice(0, 1000);
      const ncol = Math.min(60, Math.max(0, ...linhas.map(l => l.length)));
      corpo = `<table><tbody>${linhas.map((l, i) => `<tr><td class="rn">${i + 1}</td>${Array.from({ length: ncol }, (_, j) => `<td>${esc(l[j] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>${sh.linhas.length > 1000 ? `<div class="muted small" style="padding:8px">Mostrando as primeiras 1.000 linhas.</div>` : ""}`;
    } else corpo = `<div class="docx">${p.html || "<p>Documento vazio.</p>"}</div>`;
    return `<div class="panel"><div class="btns" style="justify-content:space-between"><h4 style="margin:0;min-width:0;overflow-wrap:anywhere">${esc(p.f.nome)}</h4>
      <div class="btns">${state.downloads ? `<button data-act="prev-baixar">Baixar original</button>` : ""}<button data-act="prev-fechar">Fechar</button></div></div>
      ${p.sheets && p.sheets.length > 1 ? `<div class="filters" style="margin:10px 0 0">${p.sheets.map((s, i) => `<button class="chip" data-aba="${i}" aria-pressed="${p.sheet === i}">${esc(s.nome)}</button>`).join("")}</div>` : ""}
      <div class="preview">${corpo}</div></div>`;
  }
  async function baixarOriginal() {
    const f = state.preview?.f; if (!f || !state.downloads) return;
    try {
      const bytes = await bytesDoArquivo(f);
      await state.downloads.save({ filename: f.nome, data: new Blob([bytes], { type: f.tipo || "application/octet-stream" }) });
    } catch (e) {
      if (e && e.code === "declined") return;
      state.error = e && e.code === "rejected_extension" ? "Este formato antigo não pode ser baixado pelo site. Salve como .xlsx ou .docx e envie de novo." : "Não foi possível baixar o arquivo agora.";
      render();
    }
  }
  async function paraTexto(files) {
    let out = "";
    for (const f of files) {
      try {
        if (PLANILHA.test(f.name)) {
          const X = await sheetLib(); const wb = X.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
          wb.SheetNames.forEach(n => { out += `\n### Planilha "${f.name}", aba "${n}" (CSV)\n` + X.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }); });
        } else if (TEXTO.test(f.name)) {
          const M = await docLib(); const r = await M.extractRawText({ arrayBuffer: await f.arrayBuffer() });
          out += `\n### Documento "${f.name}"\n` + r.value;
        }
      } catch (e) {}
    }
    return out.slice(0, 180000);
  }

  /* ---------- Leitura de arquivos pelo Claude ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("script")); document.head.appendChild(s); });
  }
  async function pdfLib() {
    if (!window.pdfjsWorker) await loadScript(PDFJS_WORKER);
    if (!window.pdfjsLib) await loadScript(PDFJS);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return window.pdfjsLib;
  }
  const canvasBlob = cv => new Promise(r => cv.toBlob(r, "image/jpeg", 0.85));
  async function paraImagens(files, max) {
    const out = [];
    for (const f of files) {
      if (out.length >= max) break;
      if (tipoDe(f) === "application/pdf") {
        const lib = await pdfLib();
        const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        for (let p = 1; p <= pdf.numPages && out.length < max; p++) {
          const page = await pdf.getPage(p); const v0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(2.5, 1800 / Math.max(v0.width, v0.height)) });
          const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
          const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          out.push(await canvasBlob(cv));
        }
      } else if (tipoDe(f).startsWith("image/")) {
        try {
          const bmp = await createImageBitmap(f); const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
          const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
          cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height); out.push(await canvasBlob(cv));
        } catch (e) { out.push(f); }
      }
    }
    return out;
  }
  /* Legenda automática das fotos: o Claude olha a foto e escreve no estilo do relatório fotográfico */
  async function descreverFoto(o, arquivo, data) {
    const [img] = await paraImagens([arquivo], 1);
    if (!img) throw { code: "image_rejected" };
    const r = await state.sample(
      `Você ajuda um fiscal de obras públicas de uma prefeitura a montar o relatório fotográfico de vistoria.\n` +
      `Obra: ${o.nome}. Objeto: ${o.objeto || "não informado"}. Situação: ${SIT[o.situacao] || "não informada"}. Data da foto: ${dt(data)}.\n` +
      `Escreva a legenda desta foto em português, em 1 ou 2 frases curtas e objetivas, no estilo de relatório técnico de fiscalização: ` +
      `o que aparece (serviço, etapa, elemento construtivo, material) e qualquer problema visível (falha de execução, risco, abandono, falta de segurança ou limpeza). ` +
      `Não invente medidas, quantidades nem fatos que não dá para ver na foto. Responda só com a legenda, sem aspas e sem começar com "Foto".`,
      { images: [img] });
    return String((r && r.text) || "").trim().replace(/^["“']+|["”']+$/g, "").slice(0, 600);
  }
  async function legendarFotos(pares) {
    let feitas = 0, erro = null;
    for (let i = 0; i < pares.length; i++) {
      state.info = pares.length > 1 ? `Escrevendo a legenda da foto ${i + 1} de ${pares.length}…` : "Escrevendo a legenda da foto…"; render();
      try {
        const o = curObra(); const leg = await descreverFoto(o, pares[i].arquivo, pares[i].data);
        if (!leg) continue;
        const atual = curObra();
        await patch(atual, { fotos: (atual.fotos || []).map(f => f.id === pares[i].id && (!f.legenda || pares[i].trocar) ? { ...f, legenda: leg } : f) });
        feitas++;
      } catch (e) { erro = e; if (e && /sampling_disabled|not_granted|funcao_/.test(e.code)) break; }
    }
    return { feitas, erro };
  }
  const sampleErro = e => ({ sampling_disabled: "A leitura automática ainda não foi configurada no servidor: a função ler-documento existe, mas falta a chave ANTHROPIC_API_KEY em Edge Functions > Secrets (ou a chave está errada).",
    funcao_ausente: "A leitura automática ainda não foi configurada: a função ler-documento não foi encontrada no Supabase (Edge Functions). Confira se ela foi criada com esse nome exato.",
    funcao_login: "Sua sessão expirou. Saia e entre de novo no site.", not_granted: "A leitura automática não está liberada para o seu usuário. Preencha os valores à mão.", rate_limited: "Muitas leituras seguidas. Espere um pouco e tente de novo.",
    invalid_json: "Não consegui entender o arquivo. Preencha os valores à mão.", image_rejected: "A imagem não pôde ser lida. Tente uma foto mais nítida." }[e && e.code] || "Não foi possível ler o arquivo agora. Preencha os valores à mão.");

  async function lerMedicao() {
    const o = curObra(); if (!o || !state.medFiles.length) return;
    state.busy = "ler"; state.error = ""; state.info = ""; render();
    try {
      const max = state.imgLimits?.maxCount || 5;
      const imgs = !state.imgLimits ? [] : await paraImagens(state.medFiles, Math.min(max, 6));
      const textos = await paraTexto(state.medFiles);
      if (!imgs.length && !textos) throw { code: "image_rejected" };
      const anterior = medido(o) - (state.med.id ? Number((o.medicoes || []).find(m => m.id === state.med.id)?.valor || 0) : 0);
      const r = await state.sample.json(
        `Você ajuda um fiscal de obras públicas de uma prefeitura. Os arquivos (imagens e/ou texto abaixo) são de um boletim ou planilha de medição de obra (pode ser também uma nota fiscal ou resumo de medição).\n` +
        `Obra: ${o.nome}. Contrato: ${o.numero || "?"}. Empresa: ${o.empresa || "?"}. Valor da obra: ${valorTotal(o)}. Já medido antes desta medição: ${anterior}.\n` +
        `Extraia os dados e responda SOMENTE com um objeto JSON neste formato:\n` +
        `{"numero": "nº da medição ou null", "data": "AAAA-MM-DD ou null", "periodoInicio": "AAAA-MM-DD ou null", "periodoFim": "AAAA-MM-DD ou null", "valor": número em reais do valor DESTA medição (não o acumulado) ou null, "valorAcumulado": número em reais acumulado até esta medição ou null, "resumo": "frase curta em português dizendo o que foi medido"}\n` +
        `Números com ponto decimal, sem R$ e sem separador de milhar. Use null quando não encontrar.` +
        (textos ? `\n\nConteúdo dos arquivos enviados:\n${textos}` : ""),
        imgs.length ? { images: imgs } : {});
      const m = state.med; let lidos = 0;
      if (r && typeof r === "object") {
        if (r.numero) { m.numero = String(r.numero); lidos++; }
        if (r.data) { m.data = String(r.data).slice(0, 10); lidos++; }
        if (r.periodoInicio) { m.periodoIni = String(r.periodoInicio).slice(0, 10); lidos++; }
        if (r.periodoFim) { m.periodoFim = String(r.periodoFim).slice(0, 10); lidos++; }
        if (isNum(r.valor)) { m.valor = Number(r.valor).toFixed(2); lidos++; }
        else if (isNum(r.valorAcumulado)) { m.valor = (Number(r.valorAcumulado) - anterior).toFixed(2); lidos++; }
        if (r.resumo && !m.obs) m.obs = String(r.resumo);
      }
      state.info = lidos ? "Valores lidos do arquivo. Confira cada campo antes de salvar." : "";
      if (!lidos) state.error = "Não encontrei os valores no arquivo. Preencha à mão.";
      if (isNum(r?.valorAcumulado) && isNum(r?.valor) && Math.abs(Number(r.valorAcumulado) - (anterior + Number(r.valor))) > 1)
        state.warn = `O acumulado do boletim (${brl(r.valorAcumulado)}) não bate com o medido no site mais esta medição (${brl(anterior + Number(r.valor))}). Confira se falta lançar alguma medição.`;
    } catch (e) { state.error = sampleErro(e); }
    state.busy = ""; render();
  }

  async function lerCronograma(file) {
    const o = curObra(); if (!o) return;
    state.busy = "cron-ler"; state.error = ""; state.info = ""; render();
    try {
      const imgs = !state.imgLimits ? [] : await paraImagens([file], Math.min(state.imgLimits?.maxCount || 5, 6));
      const textos = await paraTexto([file]);
      if (!imgs.length && !textos) throw { code: "image_rejected" };
      const r = await state.sample.json(
        `O arquivo (imagens e/ou texto abaixo) é um cronograma físico-financeiro de obra pública. Obra: ${o.nome}. Início: ${o.dataInicio || "?"}. Valor: ${valorTotal(o)}.\n` +
        `Extraia o valor financeiro previsto em CADA período (mês) somando todas as etapas, e responda SOMENTE com JSON:\n` +
        `{"meses": [{"ordem": 1, "mes": "AAAA-MM ou null se o cronograma só numera os meses", "previsto": número em reais}]}\n` +
        `Use a linha de total do período quando existir. Números com ponto decimal, sem R$.` +
        (textos ? `\n\nConteúdo do arquivo:\n${textos}` : ""),
        imgs.length ? { images: imgs } : {});
      const lista = Array.isArray(r?.meses) ? r.meses : [];
      const ini = ym(o.dataInicio) || ym(hojeISO());
      const linhas = lista.filter(x => isNum(x.previsto)).map((x, i) => ({ mes: /^\d{4}-\d{2}$/.test(x.mes || "") ? x.mes : addMes(ini, (Number(x.ordem) || i + 1) - 1), previsto: Number(x.previsto).toFixed(2) }));
      if (linhas.length) { state.cron.linhas = linhas; state.info = `Li ${linhas.length} meses do cronograma. Confira os valores e os meses antes de salvar.`; }
      else state.error = "Não encontrei os valores mensais no arquivo. Lance à mão.";
    } catch (e) { state.error = sampleErro(e); }
    state.busy = ""; render();
  }

  /* ---------- Cadastro pelos documentos da licitação ---------- */
  function catPorNome(n) {
    n = (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const r = [[/aditiv|contrato|ordem de servico|homolog|adjudica/, "Contrato e aditivos"], [/cronograma/, "Cronograma físico-financeiro"], [/planilha|orcament|\bpo\b|bdi/, "PO / Planilha orçamentária"],
      [/sinapi|composic|cotac|caixa/, "Referências Caixa / SINAPI"], [/memorial/, "Memorial descritivo"], [/\bart\b|\brrt\b/, "ART / RRT"], [/arquitet|planta|fachada|corte/, "Projeto arquitetônico"],
      [/estrutur|fundac|forma|armac/, "Projeto estrutural"], [/eletric|spda|lumin/, "Projeto elétrico"], [/hidr|sanit|esgoto|pluvial|agua/, "Projeto hidrossanitário"], [/projeto|prancha/, "Outros projetos"]];
    for (const [re, c] of r) if (re.test(n)) return c;
    return "Outros documentos";
  }
  async function lerLicitacao() {
    const files = state.impFiles.map(x => x.file);
    if (!files.length) { state.error = "Escolha os documentos da licitação primeiro."; return render(); }
    state.busy = "imp"; state.error = state.info = state.warn = ""; render();
    try {
      const { texto, escaneados } = await paraTextoInfo(files);
      const imgs = !state.imgLimits ? [] : await paraImagens([...files.filter(f => tipoDe(f).startsWith("image/")), ...escaneados], Math.min(state.imgLimits.maxCount || 5, 20));
      if (!texto.trim() && !imgs.length) throw { code: "image_rejected" };
      const r = await state.sample.json(
        `Você ajuda o fiscal de obras da Prefeitura de Edealina-GO a cadastrar uma obra a partir dos documentos da licitação e do contrato (edital, contrato, ordem de serviço, aditivos, planilha orçamentária, cronograma, projetos).\n` +
        `Arquivos enviados:\n${files.map((f, i) => `${i + 1}. ${f.name}`).join("\n")}\n\n` +
        `Responda SOMENTE com um objeto JSON neste formato (use null quando não encontrar; datas AAAA-MM-DD; números com ponto decimal, sem R$):\n` +
        `{"nome": "nome curto da obra", "objeto": "objeto do contrato", "numero": "ex.: Contrato nº 124/2025", "modalidade": "modalidade da licitação, nº e regime de execução", "empresa": "razão social da contratada", "cnpj": "CNPJ da contratada", ` +
        `"fonte": "contratante e origem dos recursos", "valor": valor global do contrato, "dataInicio": "data da ordem de serviço ou início", "prazoFinal": "término do prazo de execução original (calcule a partir do início e do prazo em dias/meses se precisar)", ` +
        `"endereco": "local da obra", "coordenadas": "coordenadas se houver", "caixa": {"valorPO": valor total da planilha orçamentária, "referencia": "tabela de referência, ex.: SINAPI-GO", "dataBase": "AAAA-MM", "desonerado": "sim" ou "nao", "bdi": percentual, "operacao": "nº do contrato de repasse, convênio ou Transferegov"}, ` +
        `"aditivos": [{"numero": "1º", "data": "AAAA-MM-DD", "descricao": "objeto do aditivo", "novoPrazo": "AAAA-MM-DD", "valor": acréscimo em reais ou null}], ` +
        `"cronograma": [{"ordem": 1, "mes": "AAAA-MM ou null", "previsto": valor financeiro previsto no mês}], ` +
        `"arquivos": [{"indice": 1, "categoria": uma destas: ${CATS.map(c => `"${c}"`).join(", ")}}], "resumo": "duas ou três frases sobre a obra e pontos de atenção do contrato"}` +
        (texto ? `\n\nTexto extraído dos arquivos:\n${texto}` : ""),
        imgs.length ? { images: imgs } : {});
      if (!r || typeof r !== "object") throw { code: "invalid_json" };
      const d = state.draft, novo = !state.editId; let n = 0;
      const put = (obj, k, v) => { if (v === null || v === undefined || v === "") return; if (!novo && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return; obj[k] = v; n++; };
      ["nome", "objeto", "numero", "modalidade", "empresa", "cnpj", "fonte", "endereco", "coordenadas"].forEach(k => put(d, k, r[k] ? String(r[k]) : null));
      put(d, "valor", isNum(r.valor) ? Number(r.valor) : null);
      ["dataInicio", "prazoFinal"].forEach(k => put(d, k, /^\d{4}-\d{2}-\d{2}/.test(r[k] || "") ? r[k].slice(0, 10) : null));
      d.caixa = d.caixa || {}; const cx = r.caixa || {};
      put(d.caixa, "valorPO", isNum(cx.valorPO) ? Number(cx.valorPO) : null); put(d.caixa, "bdi", isNum(cx.bdi) ? Number(cx.bdi) : null);
      put(d.caixa, "referencia", cx.referencia || null); put(d.caixa, "operacao", cx.operacao || null);
      put(d.caixa, "dataBase", /^\d{4}-\d{2}/.test(cx.dataBase || "") ? cx.dataBase.slice(0, 7) : null);
      put(d.caixa, "desonerado", cx.desonerado === "sim" || cx.desonerado === "nao" ? cx.desonerado : null);
      if (Array.isArray(r.aditivos)) { const tem = new Set((d.aditivos || []).map(a => String(a.numero))); r.aditivos.filter(a => a && !tem.has(String(a.numero))).forEach(a => { d.aditivos = [...(d.aditivos || []), { numero: a.numero || "", data: a.data || "", descricao: a.descricao || "", novoPrazo: a.novoPrazo || "", valor: isNum(a.valor) ? a.valor : "" }]; n++; }); }
      if (Array.isArray(r.cronograma) && r.cronograma.length && !(d.cronograma || []).length) {
        const ini = ym(d.dataInicio) || ym(hojeISO());
        d.cronograma = r.cronograma.filter(x => isNum(x.previsto)).map((x, i) => ({ mes: /^\d{4}-\d{2}$/.test(x.mes || "") ? x.mes : addMes(ini, (Number(x.ordem) || i + 1) - 1), previsto: Number(x.previsto) }));
        if (d.cronograma.length) n++;
      }
      if (Array.isArray(r.arquivos)) r.arquivos.forEach(a => { const it = state.impFiles[Number(a.indice) - 1]; if (it && CATS.includes(a.categoria)) it.cat = a.categoria; });
      if (r.resumo && !d.observacoes) d.observacoes = String(r.resumo);
      if (novo && d.dataInicio) d.situacao = d.dataInicio > hojeISO() ? "nao_iniciada" : "andamento";
      state.info = n ? `Preenchi ${n} campo(s) a partir dos documentos${(d.cronograma || []).length ? ", incluindo o cronograma" : ""}. Confira tudo antes de salvar.` : "";
      if (!n) state.error = "Não encontrei os dados da obra nesses arquivos. Preencha à mão ou envie o contrato.";
    } catch (e) { state.error = sampleErro(e); }
    state.busy = ""; render();
  }
  async function paraTextoInfo(files) {
    let texto = ""; const escaneados = [];
    for (const f of files) {
      let t = "";
      try {
        if (tipoDe(f) === "application/pdf") {
          const lib = await pdfLib(); const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
          for (let p = 1; p <= Math.min(pdf.numPages, 120); p++) { const c = await (await pdf.getPage(p)).getTextContent(); t += c.items.map(i => i.str).join(" ") + "\n"; }
          if (t.replace(/\s/g, "").length < 150 * Math.min(pdf.numPages, 120)) escaneados.push(f);
          t = t.trim() ? `\n### Arquivo "${f.name}" (texto do PDF)\n` + t : "";
        } else t = await paraTexto([f]);
      } catch (e) {}
      texto += t.slice(0, 70000);
    }
    return { texto: texto.slice(0, 200000), escaneados };
  }
  function importHtml() {
    if (!state.sample && !state.assets) return "";
    return `<div class="panel"><h4>${state.editId ? "Atualizar pelos documentos" : "Cadastrar pelos documentos da licitação"}</h4>
      <p class="small" style="margin:0 0 10px">Envie o contrato, edital, ordem de serviço, aditivos, planilha orçamentária, cronograma e projetos. ${state.sample ? "O site lê os documentos e preenche a ficha para você conferir." : ""} Ao salvar, os arquivos ficam anexados na aba Projetos e documentos.</p>
      <div class="btns"><span class="btn upl">Escolher documentos<input type="file" id="imp-files" multiple accept="${ACEITA}"></span>
        ${state.sample && state.impFiles.length ? `<button class="primary" data-act="imp-ler" ${state.busy ? "disabled" : ""}>${state.busy === "imp" ? "Lendo os documentos…" : "Ler documentos e preencher"}</button>` : ""}</div>
      ${state.impFiles.length ? `<div class="rows" style="margin-top:10px">${state.impFiles.map((x, i) => `<div class="docrow" style="border-top:0;padding:0"><span class="file"><span class="kind">${kindTxt({ tipo: tipoDe(x.file), nome: x.file.name })}</span><span>${esc(x.file.name)}</span><button type="button" class="x" data-impdel="${i}" aria-label="Tirar ${esc(x.file.name)}">×</button></span>
        <select id="imp-cat-${i}" data-impcat="${i}" style="width:auto;max-width:100%">${CATS.map(c => `<option ${x.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>`).join("")}</div>` : ""}
      ${state.busy === "imp" ? `<p class="small muted" style="margin:8px 0 0">Documentos longos podem levar até um ou dois minutos.</p>` : ""}</div>`;
  }
  async function anexarImportados(id) {
    if (!state.impFiles.length || !state.assets) return 0;
    const novos = [];
    for (const x of state.impFiles) { const arq = await subir(x.file); novos.push({ id: uid(), categoria: x.cat, titulo: x.file.name.replace(/\.[^.]+$/, ""), data: "", arquivos: [arq], enviadoEm: new Date().toISOString() }); }
    const o = state.obras.find(z => z.id === id);
    await state.db.collection("obras").doc(id).update({ documentos: [...((o && o.documentos) || []), ...novos] });
    return novos.length;
  }

  /* ---------- Relatórios em Word (papel timbrado 2025-2028) ---------- */
  const FISCAL = { nome: "Higor Rodrigues de Souza", cargo: "Engenheiro Civil – CREA-GO 1017177278D-2", funcao: "Fiscal da Obra" };
  const JSZIP = ["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"];
  const MODELO = window.CONTROLE_SITE ? { url: "modelos/papel-timbrado.docx" } : { url: "/_blob/0c0b5d47dcd5cdc1b254395f91d58c60", base64: true };
  let docObra = null;
  const docPessoal = () => areaDe(docObra) === "pessoal";
  const LOCAL_DOC = () => docPessoal() ? (String(docObra.municipio || "").replace(/\s+-\s+/, " – ") || "Goiás") : "Edealina – GO";
  const FUNCAO_DOC = () => docPessoal() ? "Responsável técnico" : FISCAL.funcao;
  const RODAPE_PESSOAL = () => [`${FISCAL.nome} · ${FISCAL.cargo}`];
  const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  async function zipLib() {
    if (window.JSZip) return window.JSZip;
    for (const u of JSZIP) { try { await loadScript(u); if (window.JSZip) return window.JSZip; } catch (e) {} }
    throw new Error("jszip");
  }
  const xe = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const W = {
    run: (t, o = {}) => `<w:r><w:rPr>${o.b ? "<w:b/><w:bCs/>" : ""}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ""}</w:rPr>${String(t ?? "").split("\n").map((l, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${xe(l)}</w:t>`).join("")}</w:r>`,
    p: (runs, o = {}) => `<w:p><w:pPr>${o.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}" w:line="300" w:lineRule="auto"/><w:jc w:val="${o.jc || "both"}"/></w:pPr>${runs}</w:p>`,
  };
  /* Os mesmos textos servem para Word e PDF: no modo PDF cada bloco vira um marcador que montarPdf desenha. */
  let modoPdf = false;
  const B = obj => "\u0001" + JSON.stringify(obj) + "\u0002";
  const P = (t, o) => modoPdf ? B({ k: "p", t: String(t ?? ""), o: o || {} }) : W.p(W.run(t, o), o);
  const titulo = t => modoPdf ? B({ k: "titulo", t }) : W.p(W.run(t, { b: true }), { jc: "center", after: 60 });
  const secao = t => modoPdf ? B({ k: "secao", t }) : W.p(W.run(t, { b: true }), { jc: "left", before: 240, keep: true });
  const campo = (k, v) => v === undefined || v === null || v === "" ? "" : modoPdf ? B({ k: "campo", a: k, t: String(v) }) : W.p(W.run(k + ":", { b: true }) + W.run(" " + v), { jc: "left", after: 40 });
  const item = t => modoPdf ? B({ k: "p", t: "– " + t, o: { after: 60 } }) : W.p(W.run("– " + t), { jc: "both", after: 60 });
  const quebra = () => modoPdf ? B({ k: "quebra" }) : `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  function tabela(cab, linhas, larg) {
    if (modoPdf) return B({ k: "tabela", cab, linhas: linhas.map(l => l.map(c => c && c.t !== undefined ? { t: String(c.t), b: !!c.b } : { t: String(c ?? "") })), larg: larg || null });
    const tot = 9070, ws = larg || cab.map(() => Math.floor(tot / cab.length));
    const cel = (t, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.cab ? `<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>` : ""}</w:tcPr>${W.p(W.run(t, { b: o.cab || o.b, sz: 18 }), { jc: o.r ? "right" : "left", after: 0 })}</w:tc>`;
    const b = `<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${tot}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cab.map((c, i) => cel(String(c).replace(/^>/, ""), ws[i], { cab: true, r: String(c).startsWith(">") })).join("")}</w:tr>` +
      linhas.map(l => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((c, i) => cel(c && c.t !== undefined ? c.t : c, ws[i], { r: String(cab[i]).startsWith(">"), b: c && c.b })).join("")}</w:tr>`).join("") + `</w:tbl>` + P("", { after: 120 });
  }
  function assinatura(data) {
    const [y, m, d] = data.split("-");
    if (modoPdf) return B({ k: "assinatura", t: `${LOCAL_DOC()}, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}.`, funcao: FUNCAO_DOC() });
    return P(`${LOCAL_DOC()}, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}.`, { jc: "right", before: 360, after: 720 }) +
      P("_______________________________________________", { jc: "center", after: 0, keep: true }) +
      P(FISCAL.nome, { jc: "center", after: 0, b: true, keep: true }) + P(FISCAL.cargo, { jc: "center", after: 0, keep: true }) + P(FUNCAO_DOC(), { jc: "center", after: 0 });
  }
  function identificacao(o) {
    const cx = o.caixa || {};
    return secao("1. IDENTIFICAÇÃO") + campo("Obra", o.nome) + campo("Objeto", o.objeto) + campo("Endereço", o.endereco) +
      campo("Coordenadas", coordTxt(o)) + campo("Contratada", [o.empresa, o.cnpj ? "CNPJ " + o.cnpj : ""].filter(Boolean).join(", ")) +
      campo("Contrato / instrumento", o.numero) + campo("Modalidade", o.modalidade) + campo("Fonte de recurso", o.fonte) +
      campo("Contrato de repasse / operação", cx.operacao) + campo("Valor inicial", isNum(o.valor) ? brl(o.valor) : "") +
      campo("Valor com aditivos", (o.aditivos || []).some(a => a.valor) ? brl(valorTotal(o)) : "") +
      campo("Início", o.dataInicio ? dt(o.dataInicio) : "") + campo("Prazo original", o.prazoFinal ? dt(o.prazoFinal) : "") +
      campo("Prazo vigente", prazoAtual(o) && prazoAtual(o) !== o.prazoFinal ? dt(prazoAtual(o)) : "") +
      campo(docPessoal() ? "Cliente / proprietário" : "", docPessoal() ? o.cliente : "") +
      campo(docPessoal() ? "Responsável técnico" : "Fiscal da obra", `${FISCAL.nome}, ${FISCAL.cargo}`);
  }
  function situacaoTxt(o, sit, perc) {
    const vt = valorTotal(o), md = medido(o), cc = cronoCalc(o);
    return campo("Situação", SIT[sit] || "Não informada") +
      campo("Execução física", isNum(perc) ? `${String(perc).replace(".", ",")}% executado` : "não informada") +
      campo("Execução financeira", `${brl(md)} medidos (${pctTxt(pct(md, vt))} do valor da obra); saldo a medir ${brl(vt - md)}`) +
      campo("Cronograma", cc.status ? `${cc.status.txt} (referência ${mesTxt(cc.status.ref.mes)}: previsto ${brl(cc.status.ref.prevAc)}, medido ${brl(cc.status.ref.medAc)})` : "") +
      campo("Prazo", prazoTxt(o).replace(/<[^>]+>/g, ""));
  }
  async function fotoParaDocx(f) {
    const res = await fetch(blob(f.id)); if (!res.ok) throw new Error("foto");
    const bmp = await createImageBitmap(await res.blob());
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    return { dados: await canvasBlob(cv), w: cv.width, h: cv.height };
  }
  async function anexoFotos(fotos, zip, rels, texto) {
    if (!fotos.length) return "";
    if (modoPdf) return quebra() + titulo("ANEXO – REGISTRO FOTOGRÁFICO") + B({ k: "fotos", fotos: fotos.map(f => ({ id: f.id, legenda: f.legenda || "", data: f.data || "" })), texto });
    const cels = []; let n = 0;
    for (const f of fotos) {
      n++; let img = null;
      try { img = await fotoParaDocx(f); } catch (e) {}
      let desenho = W.run("(foto indisponível)");
      if (img) {
        const rid = "rIdFotoRel" + n, nome = `foto_rel_${n}.jpg`;
        zip.file("word/media/" + nome, img.dados);
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nome}"/>`);
        const cx = 2736000, cy = Math.round(Math.min(cx * img.h / img.w, 3400000)), cxr = Math.round(cy * img.w / img.h);
        const larg = Math.min(cx, cxr);
        desenho = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${larg}" cy="${cy}"/><wp:docPr id="${2000 + n}" name="Foto ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${2000 + n}" name="${nome}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${larg}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      }
      cels.push(`<w:tc><w:tcPr><w:tcW w:w="4535" w:type="dxa"/></w:tcPr>${W.p(desenho, { jc: "center", before: 120, after: 60 })}${W.p(W.run(`Foto ${n} – `, { b: true, sz: 20 }) + W.run((f.legenda || "Sem legenda.") + (f.data ? ` (${dt(f.data)})` : ""), { sz: 20 }), { jc: "center", after: 120 })}</w:tc>`);
    }
    if (cels.length % 2) cels.push(`<w:tc><w:tcPr><w:tcW w:w="4535" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
    let linhas = ""; for (let i = 0; i < cels.length; i += 2) linhas += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cels[i]}${cels[i + 1]}</w:tr>`;
    return quebra() + titulo("ANEXO – REGISTRO FOTOGRÁFICO") + P(texto, { after: 240 }) +
      `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4535"/><w:gridCol w:w="4535"/></w:tblGrid>${linhas}</w:tbl>`;
  }
  /* Parte pessoal: troca o cabeçalho e o rodapé da Prefeitura pela marca do engenheiro */
  async function timbrePessoalDocx(zip) {
    const mh = await marcaPessoal();
    if (mh) zip.file("word/media/marca-higor.png", mh.bytes);
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"', T = 520000;
    const img = mh ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${T}" cy="${T}"/><wp:docPr id="9101" name="Marca"/><a:graphic ${NS}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="9101" name="marca-higor.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMarcaH"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${T}" cy="${T}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : "";
    const txt = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${o.b ? "<w:b/>" : ""}<w:color w:val="${o.cor || "16324F"}"/><w:sz w:val="${o.sz || 18}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
    const par = (runs, o = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${runs}</w:p>`;
    const cab = `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="12" w:color="E0A526"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="8070"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${par(img)}</w:tc><w:tc><w:tcPr><w:tcW w:w="8070" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${par(txt(FISCAL.nome.toUpperCase(), { b: true, sz: 28 }))}${par(txt(FISCAL.cargo, { sz: 19 }))}</w:tc></w:tr></w:tbl>${par("")}`;
    const rod = par(txt(RODAPE_PESSOAL().join("   "), { sz: 15, cor: "5A5A5A" }), { jc: "center" });
    for (const nome of Object.keys(zip.files)) {
      const m = nome.match(/^word\/(header|footer)\d+\.xml$/); if (!m) continue;
      let x = await zip.file(nome).async("string");
      x = m[1] === "header" ? x.replace(/(<w:hdr\b[^>]*>)[\s\S]*(<\/w:hdr>)/, `$1${cab}$2`) : x.replace(/(<w:ftr\b[^>]*>)[\s\S]*(<\/w:ftr>)/, `$1${rod}$2`);
      zip.file(nome, x);
      if (m[1] === "header") zip.file(nome.replace("word/", "word/_rels/") + ".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMarcaH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/marca-higor.png"/></Relationships>`);
    }
  }
  async function montarDocx(corpo) {
    const Z = await zipLib();
    const res = await fetch(MODELO.url); if (!res.ok) throw new Error("modelo");
    let bin;
    if (MODELO.base64) { const s = atob((await res.text()).trim()); bin = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i); }
    else bin = new Uint8Array(await res.arrayBuffer());
    const zip = await Z.loadAsync(bin), rels = [];
    if (docPessoal()) await timbrePessoalDocx(zip);
    const body = await corpo(zip, rels);
    let doc = await zip.file("word/document.xml").async("string");
    const ini = doc.indexOf("<w:body>") + 8, fim = doc.lastIndexOf("<w:sectPr");
    doc = doc.slice(0, ini) + body + doc.slice(fim);
    zip.file("word/document.xml", doc);
    if (rels.length) {
      const rp = "word/_rels/document.xml.rels"; const r = await zip.file(rp).async("string");
      zip.file(rp, r.replace("</Relationships>", rels.join("") + "</Relationships>"));
      const ct = await zip.file("[Content_Types].xml").async("string");
      if (!/Extension="jpg"/i.test(ct)) zip.file("[Content_Types].xml", ct.replace("<Default ", '<Default Extension="jpg" ContentType="image/jpeg"/><Default '));
    }
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  function relatorioDiario(o, dia) {
    return async (zip, rels) => {
      const vist = (o.vistorias || []).filter(v => v.data === dia);
      const ult = vist[vist.length - 1];
      const meds = (o.medicoes || []).filter(m => m.data === dia);
      const fotos = (o.fotos || []).filter(f => f.data === dia);
      const pend = (o.pendencias || []).filter(p => !p.resolvida);
      const di = (o.diario || []).filter(d => d.data === dia);
      let s = titulo("RELATÓRIO DIÁRIO DE FISCALIZAÇÃO DE OBRA") + P(`Data: ${dt(dia)}`, { jc: "center", after: 360 });
      s += identificacao(o);
      s += secao("2. SITUAÇÃO DA OBRA") + situacaoTxt(o, ult?.situacao || o.situacao, isNum(ult?.percentual) ? ult.percentual : o.percentual);
      s += secao("3. REGISTROS DO DIA");
      di.forEach(d => {
        s += campo("Dia", d.diaTipo);
        s += campo("Condições do tempo", `manhã: ${(d.climaManha || "–").toLowerCase()}; tarde: ${(d.climaTarde || "–").toLowerCase()}${isNum(d.chuva) ? `; chuva de ${d.chuva} mm` : ""}${d.temperatura ? `; ${d.temperatura}` : ""}`);
        if (d.impraticavel === "sim") s += campo("Dia impraticável", "sim, sem condições de trabalho");
        s += campo("Trabalhadores na obra", isNum(d.efetivo) ? `${d.efetivo}${d.equipe ? ` (${d.equipe})` : ""}` : d.equipe);
        s += campo("Equipamentos e materiais", d.equipamentos);
        if (d.servicos) s += P("Serviços executados:", { b: true, before: 120, after: 40 }) + P(d.servicos);
        if (d.ocorrencias) s += P("Ocorrências e orientações:", { b: true, before: 120, after: 40 }) + P(d.ocorrencias);
      });
      if (vist.length) vist.forEach(v => { s += P(v.obs || `Vistoria realizada, obra ${(SIT[v.situacao] || "").toLowerCase()}.`); });
      else if (!di.length) s += P(dia === hojeISO() && o.observacoes ? o.observacoes : "Não há vistoria registrada nesta data.");
      meds.forEach(m => { s += item(`Medição nº ${m.numero || "–"} lançada nesta data, no valor de ${brl(m.valor)}${m.obs ? `: ${m.obs}` : "."}`); });
      if (fotos.length) s += P(`Foram registradas ${fotos.length} fotografia(s), apresentadas no anexo.`);
      s += secao("4. PENDÊNCIAS EM ABERTO");
      s += pend.length ? pend.map(p => item(p.texto + (p.prazo ? ` Prazo: ${dt(p.prazo)}.` : ""))).join("") : P("Não há pendências em aberto.");
      s += assinatura(dia);
      s += await anexoFotos(fotos, zip, rels, `Fotografias obtidas em ${dt(dia)}${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, ${LOCAL_DOC()}.`);
      return s;
    };
  }
  function relatorioCompleto(o, dia) {
    return async (zip, rels) => {
      const vt = valorTotal(o), md = medido(o), cc = cronoCalc(o);
      const meds = [...(o.medicoes || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.numero) - Number(b.numero));
      const vist = [...(o.vistorias || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const pend = o.pendencias || [], adit = o.aditivos || [], docs = o.documentos || [];
      const fotos = [...(o.fotos || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
      let n = 1, s = titulo("RELATÓRIO GERAL DE ACOMPANHAMENTO DA OBRA") + P(`Posição em ${dt(dia)}`, { jc: "center", after: 360 });
      s += identificacao(o);
      s += secao(`${++n}. SITUAÇÃO ATUAL`) + situacaoTxt(o, o.situacao, o.percentual) + (o.observacoes ? P(o.observacoes, { before: 120 }) : "");
      s += secao(`${++n}. EXECUÇÃO FINANCEIRA`) + campo("Valor da obra", brl(vt)) + campo("Total medido", `${brl(md)} (${pctTxt(pct(md, vt))})`) + campo("Saldo a medir", brl(vt - md));
      if (meds.length) { let ac = 0; s += P("", { after: 60 }) + tabela(["Nº", "Data", "Período", ">Valor", ">Acumulado", ">% obra"], meds.map(m => { ac += Number(m.valor || 0); return [m.numero || "", dt(m.data), m.periodoIni || m.periodoFim ? `${dt(m.periodoIni)} a ${dt(m.periodoFim)}` : "–", brl(m.valor), brl(ac), pctTxt(pct(ac, vt))]; }), [700, 1300, 2270, 1700, 1700, 1400]); }
      else s += P("Nenhuma medição lançada até esta data.", { before: 120 });
      s += secao(`${++n}. CRONOGRAMA FÍSICO-FINANCEIRO`);
      if (cc.rows.length && cc.temPrev) {
        s += P(cc.status ? `${cc.status.txt}.` : "");
        s += tabela(["Mês", ">Previsto acumulado", ">Medido acumulado", ">Diferença"], cc.rows.map(r => { const passou = r.mes <= ym(hojeISO()); return [mesTxt(r.mes), brl(r.prevAc), passou ? brl(r.medAc) : "–", passou ? brl(r.medAc - r.prevAc) : "–"]; }), [1870, 2400, 2400, 2400]);
      } else s += P("Cronograma previsto não lançado.");
      const dd = o.diario || [];
      if (dd.length) { const imp = dd.filter(x => x.impraticavel === "sim"); s += secao(`${++n}. DIÁRIO DE OBRA`) + campo("Dias registrados", String(dd.length)) + campo("Dias impraticáveis", imp.length ? `${imp.length} (${imp.map(x => dt(x.data)).sort().join(", ")})` : "nenhum") + campo("Chuva registrada", `${dd.reduce((t, x) => t + (Number(x.chuva) || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`); }
      const sv = (o.servicos || []).filter(x => x.etapa), fis = fisicoServicos(o);
      if (sv.length) s += secao(`${++n}. EXECUÇÃO FÍSICA POR SERVIÇO`) + P(`Execução física calculada pelos serviços: ${pctTxt(fis.pct)}.`) + tabela(["Serviço / etapa", ">Valor", ">% executado"], sv.map(x => [x.etapa, isNum(x.valor) ? brl(x.valor) : "–", pctTxt(Number(x.percentual) || 0)]), [5070, 2200, 1800]);
      if (adit.length) s += secao(`${++n}. ADITIVOS`) + tabela(["Nº", "Data", "Objeto", "Novo prazo", ">Valor"], adit.map(a => [a.numero || "", dt(a.data), a.descricao || "", dt(a.novoPrazo), a.valor ? brl(a.valor) : "–"]), [800, 1300, 4070, 1300, 1600]);
      s += secao(`${++n}. VISTORIAS`);
      s += vist.length ? tabela(["Data", "Situação", ">% exec.", "Observações"], vist.map(v => [dt(v.data), SIT[v.situacao] || "–", isNum(v.percentual) ? v.percentual + "%" : "–", v.obs || ""]), [1300, 1500, 1000, 5270]) : P("Nenhuma vistoria registrada.");
      s += secao(`${++n}. PENDÊNCIAS`);
      s += pend.length ? pend.map(p => item(p.texto + (p.prazo ? ` Prazo: ${dt(p.prazo)}.` : "") + (p.resolvida ? " (resolvida)" : " (em aberto)"))).join("") : P("Nenhuma pendência registrada.");
      const nots = [...(o.notificacoes || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
      if (nots.length) s += secao(`${++n}. NOTIFICAÇÕES À EMPRESA`) + tabela(["Nº", "Data", "Assunto", "Prazo", "Situação"], nots.map(x => [x.numero || "", dt(x.data), x.assunto || "", dt(x.prazoResposta), SIT_NOT[x.situacao] || "–"]), [900, 1200, 4170, 1200, 1600]);
      const prz = (o.prazos || []).filter(x => x.vencimento);
      if (prz.length) s += secao(`${++n}. DOCUMENTOS COM VALIDADE`) + prz.map(x => item(`${x.tipo}${x.descricao ? ` (${x.descricao})` : ""}: vence em ${dt(x.vencimento)}${diasAte(x.vencimento) < 0 ? ", vencido" : ""}.`)).join("");
      if (docs.length) s += secao(`${++n}. PROJETOS E DOCUMENTOS ARQUIVADOS`) + CATS.map(c => docs.filter(d => d.categoria === c).map(d => item(`${c}: ${d.titulo || "sem título"}${d.data ? ` (${dt(d.data)})` : ""}`)).join("")).join("");
      s += P("É o relatório.", { before: 240 }) + assinatura(dia);
      s += await anexoFotos(fotos, zip, rels, `Fotografias registradas nas vistorias da obra${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, ${LOCAL_DOC()}.`);
      return s;
    };
  }
  /* ---------- PDF no papel timbrado (jsPDF): desenha os mesmos blocos do Word ---------- */
  const JSPDF = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"];
  async function pdfLibJs() {
    if (window.jspdf) return window.jspdf.jsPDF;
    for (const u of JSPDF) { try { await loadScript(u); if (window.jspdf) return window.jspdf.jsPDF; } catch (e) {} }
    throw new Error("jspdf");
  }
  const RODAPE = ["Rua 21, Quadra 04 - Centro - Edealina - GO - Tel.: (64) 3480-1133", "E-mail: gabineteprefedealina@hotmail.com", "CNPJ: 24.852.618/0001-48"];
  const pdfTxt = t => String(t ?? "").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=").replace(/[^\n\t -~ -ÿ–—‘’“”•…€]/g, "");
  let timbrado = null;
  async function imagemJpeg(src, alfa = 1) {
    const bmp = await createImageBitmap(src instanceof Blob ? src : await (await fetch(src)).blob(), { imageOrientation: "from-image" });
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = alfa; g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return { url: cv.toDataURL("image/jpeg", 0.82), w: cv.width, h: cv.height };
  }
  async function papelTimbrado() {
    if (timbrado) return timbrado;
    try {
      const Z = await zipLib(), res = await fetch(MODELO.url); if (!res.ok) throw new Error("modelo");
      let bin; if (MODELO.base64) { const s = atob((await res.text()).trim()); bin = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i); } else bin = new Uint8Array(await res.arrayBuffer());
      const zip = await Z.loadAsync(bin);
      const png = async n => new Blob([await zip.file("word/media/" + n).async("uint8array")], { type: "image/png" });
      timbrado = { topo: await imagemJpeg(await png("image1.png")), marca: await imagemJpeg(await png("image2.png"), 0.13) };
    } catch (e) { timbrado = { topo: null, marca: null }; }
    return timbrado;
  }
  let marcaH = null;
  async function marcaPessoal() {
    if (marcaH) return marcaH;
    try { const r = await fetch("img/marca-higor.png"); if (!r.ok) throw 0; const b = new Uint8Array(await r.arrayBuffer()); let t = ""; for (let i = 0; i < b.length; i += 32768) t += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); marcaH = { url: "data:image/png;base64," + btoa(t), bytes: b }; }
    catch (e) { marcaH = null; }
    return marcaH;
  }
  async function montarPdf(corpo) {
    const JsPDF = await pdfLibJs(), tb = await papelTimbrado();
    modoPdf = true; let s;
    try { s = await corpo(null, []); } finally { modoPdf = false; }
    const blocos = [...s.matchAll(/\u0001(.*?)\u0002/gs)].map(m => JSON.parse(m[1]));
    const doc = new JsPDF({ unit: "pt", format: "a4" });
    const PW = 595.28, PH = 841.89, ML = 85, MR = 56.7, TW = PW - ML - MR, TOPO = docPessoal() ? 118 : 158, BASE = PH - 66, FS = 11.5, LH = FS * 1.3;
    let y = TOPO;
    const pessoal = docPessoal(), mh = pessoal ? await marcaPessoal() : null;
    const fundo = () => {
      if (pessoal) {
        if (mh) doc.addImage(mh.url, "PNG", ML, 34, 46, 46, "marcaH", "FAST");
        doc.setTextColor(22, 50, 79); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(pdfTxt(FISCAL.nome.toUpperCase()), ML + 58, 54);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(pdfTxt(FISCAL.cargo), ML + 58, 70);
        doc.setDrawColor(224, 165, 38); doc.setLineWidth(1.6); doc.line(ML, 92, PW - MR, 92);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90);
        RODAPE_PESSOAL().forEach((l, i) => doc.text(pdfTxt(l), PW / 2, PH - 30 + i * 9, { align: "center" }));
        doc.setTextColor(0); doc.setFont("times", "normal"); doc.setFontSize(FS); return;
      }
      if (tb.marca) doc.addImage(tb.marca.url, "JPEG", ML + 20.85, 85 + 124.35, 411.9, 383.7, "marca", "FAST");
      if (tb.topo) { const w = 399.4, h = w * tb.topo.h / tb.topo.w; doc.addImage(tb.topo.url, "JPEG", ML + (TW - w) / 2, 22.7, w, h, "topo", "FAST"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(60);
      RODAPE.forEach((l, i) => doc.text(l, PW / 2, PH - 34 + i * 9, { align: "center" }));
      doc.setTextColor(0); doc.setFont("times", "normal"); doc.setFontSize(FS);
    };
    const nova = () => { doc.addPage(); fundo(); y = TOPO; };
    const cabe = h => { if (y + h > BASE) nova(); };
    const linhas = (t, w, b = false, sz = FS) => { doc.setFont("times", b ? "bold" : "normal"); doc.setFontSize(sz); return doc.splitTextToSize(pdfTxt(t), w); };
    const escrever = (t, { b = false, jc = "left", sz = FS, antes = 0, depois = 6 } = {}) => {
      y += antes; const ls = linhas(t, TW, b, sz), lh = sz * 1.3;
      ls.forEach(l => { cabe(lh); doc.setFont("times", b ? "bold" : "normal"); doc.setFontSize(sz); doc.text(l, jc === "center" ? PW / 2 : jc === "right" ? PW - MR : ML, y + sz, { align: jc === "both" ? "left" : jc }); y += lh; });
      y += depois;
    };
    fundo();
    for (const k of blocos) {
      if (k.k === "titulo") escrever(k.t, { b: true, jc: "center", depois: 3, sz: 12.5 });
      else if (k.k === "secao") { cabe(LH * 3); escrever(k.t, { b: true, antes: 12, depois: 4 }); }
      else if (k.k === "p") { const o = k.o || {}; if (!k.t) { y += (o.after ?? 120) / 20; continue; } escrever(k.t, { b: !!o.b, jc: o.jc || "left", antes: (o.before || 0) / 20, depois: (o.after ?? 120) / 20 }); }
      else if (k.k === "campo") {
        doc.setFont("times", "bold"); doc.setFontSize(FS); const rot = pdfTxt(k.a + ": "), wr = doc.getTextWidth(rot);
        const pars = String(k.t).split("\n"), resto = linhas(pars[0], TW - wr);
        const mais = [...(resto.length > 1 ? linhas(resto.slice(1).join(" "), TW) : []), ...pars.slice(1).flatMap(t => linhas(t, TW))];
        cabe(LH); doc.setFont("times", "bold"); doc.text(rot, ML, y + FS); doc.setFont("times", "normal"); doc.text(resto[0] || "", ML + wr, y + FS); y += LH;
        mais.forEach(l => { cabe(LH); doc.text(l, ML, y + FS); y += LH; }); y += 2;
      }
      else if (k.k === "quebra") nova();
      else if (k.k === "tabela") {
        const ws = (k.larg || k.cab.map(() => 9070 / k.cab.length)).map(w => w / 20), sz = 9, lh = sz * 1.25, pad = 3.5;
        const dir = k.cab.map(c => String(c).startsWith(">")), cab = k.cab.map(c => String(c).replace(/^>/, ""));
        const linha = (cels, negrito, fundoCor) => {
          const ls = cels.map((c, i) => linhas(c.t, ws[i] - 2 * pad, negrito || c.b, sz)), h = Math.max(...ls.map(l => l.length)) * lh + 2 * pad;
          return { desenhar: () => { let x = ML; ls.forEach((l, i) => {
            if (fundoCor) { doc.setFillColor(217, 226, 243); doc.rect(x, y, ws[i], h, "F"); }
            doc.setDrawColor(128); doc.setLineWidth(0.4); doc.rect(x, y, ws[i], h);
            doc.setFont("times", negrito || cels[i].b ? "bold" : "normal"); doc.setFontSize(sz);
            l.forEach((t, j) => doc.text(t, dir[i] ? x + ws[i] - pad : x + pad, y + pad + sz + j * lh - 1, { align: dir[i] ? "right" : "left" }));
            x += ws[i]; }); y += h; }, h };
        };
        const topo = linha(cab.map(t => ({ t })), true, true);
        cabe(topo.h * 2); topo.desenhar();
        for (const l of k.linhas) { const r = linha(l, false, false); if (y + r.h > BASE) { nova(); topo.desenhar(); } r.desenhar(); }
        y += 10; doc.setFontSize(FS);
      }
      else if (k.k === "assinatura") {
        cabe(130); escrever(k.t, { jc: "right", antes: 18, depois: 36 });
        escrever("_______________________________________________", { jc: "center", depois: 0 });
        escrever(FISCAL.nome, { jc: "center", b: true, depois: 0 }); escrever(FISCAL.cargo, { jc: "center", depois: 0 }); escrever(k.funcao || FISCAL.funcao, { jc: "center", depois: 0 });
      }
      else if (k.k === "assinatura2") {
        cabe(140); escrever(k.t, { jc: "right", antes: 18, depois: 40 });
        const cw = TW / 2, y0 = y;
        k.lados.forEach((l, j) => { const cx = ML + j * cw + cw / 2; let yy = y0;
          doc.setLineWidth(0.6); doc.setDrawColor(0); doc.line(cx - 95, yy, cx + 95, yy); yy += 4;
          l.forEach((t, m) => { const ls = linhas(t, cw - 20, m === 0, m === 0 ? FS : 10); ls.forEach(x => { doc.setFont("times", m === 0 ? "bold" : "normal"); doc.setFontSize(m === 0 ? FS : 10); doc.text(x, cx, yy + 11, { align: "center" }); yy += 13; }); }); y = Math.max(y, yy); });
        y += 6; doc.setFontSize(FS);
      }
      else if (k.k === "fotos") {
        escrever(k.texto, { depois: 12 });
        const cw = TW / 2, iw = 200, ih = 250;
        for (let i = 0; i < k.fotos.length; i += 2) {
          const par = []; for (const f of k.fotos.slice(i, i + 2)) { let img = null; try { img = await imagemJpeg(blob(f.id)); } catch (e) {} par.push({ f, img, n: k.fotos.indexOf(f) + 1 }); }
          const dims = par.map(p => { if (!p.img) return { w: iw, h: 40 }; let w = iw, h = w * p.img.h / p.img.w; if (h > ih) { h = ih; w = h * p.img.w / p.img.h; } return { w, h }; });
          const leg = par.map(p => linhas(`Foto ${p.n} – ${p.f.legenda || "Sem legenda."}${p.f.data ? ` (${dt(p.f.data)})` : ""}`, cw - 16, false, 9.5));
          const alt = Math.max(...dims.map(d => d.h)) + Math.max(...leg.map(l => l.length)) * 12 + 22;
          cabe(alt);
          par.forEach((p, j) => {
            const cx = ML + j * cw + cw / 2, d = dims[j];
            if (p.img) doc.addImage(p.img.url, "JPEG", cx - d.w / 2, y + 4, d.w, d.h, undefined, "FAST");
            else { doc.setFont("times", "italic"); doc.setFontSize(10); doc.text("(foto indisponível)", cx, y + 24, { align: "center" }); }
            doc.setFont("times", "normal"); doc.setFontSize(9.5); leg[j].forEach((t, m) => doc.text(t, cx, y + d.h + 18 + m * 12, { align: "center" }));
          });
          y += alt;
        }
      }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110); doc.text(`Página ${i} de ${n}`, PW - MR, PH - 16, { align: "right" }); doc.setTextColor(0); }
    return doc.output("blob");
  }
  function diarioPeriodo(o, ini, fim) {
    return async (zip, rels) => {
      const dd = (o.diario || []).filter(d => d.data >= ini && d.data <= fim).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const fotos = (o.fotos || []).filter(f => f.data >= ini && f.data <= fim).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const imp = dd.filter(x => x.impraticavel === "sim"), ef = dd.filter(x => isNum(x.efetivo));
      let s = titulo("DIÁRIO DE OBRA") + P(`Período: ${dt(ini)} a ${dt(fim)}`, { jc: "center", after: 360 });
      s += identificacao(o);
      s += secao("2. RESUMO DO PERÍODO") + campo("Dias registrados", String(dd.length)) +
        campo("Dias impraticáveis", imp.length ? `${imp.length} (${imp.map(x => dt(x.data)).join(", ")})` : "nenhum") +
        campo("Chuva registrada", `${dd.reduce((t, x) => t + (Number(x.chuva) || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`) +
        campo("Efetivo médio", ef.length ? `${(ef.reduce((t, x) => t + Number(x.efetivo), 0) / ef.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} trabalhadores` : "") +
        campo("Situação atual", `${SIT[o.situacao] || "não informada"}${isNum(o.percentual) ? `, ${String(o.percentual).replace(".", ",")}% executado` : ""}`);
      s += secao("3. REGISTROS DIÁRIOS");
      if (!dd.length) s += P("Não há registros no diário de obra neste período.");
      dd.forEach(d => {
        s += P(`${dt(d.data)}${d.diaTipo ? ` – ${d.diaTipo}` : ""}${d.impraticavel === "sim" ? " – dia impraticável" : ""}`, { b: true, before: 200, after: 60, keep: true });
        s += campo("Tempo", `manhã: ${(d.climaManha || "–").toLowerCase()}; tarde: ${(d.climaTarde || "–").toLowerCase()}${isNum(d.chuva) ? `; chuva de ${String(d.chuva).replace(".", ",")} mm` : ""}${d.temperatura ? `; ${d.temperatura}` : ""}`);
        s += campo("Trabalhadores", isNum(d.efetivo) ? `${d.efetivo}${d.equipe ? ` (${d.equipe})` : ""}` : d.equipe);
        s += campo("Equipamentos e materiais", d.equipamentos);
        s += campo("Serviços executados", d.servicos);
        s += campo("Ocorrências", d.ocorrencias);
        const nf = fotos.filter(f => f.data === d.data).length; if (nf) s += campo("Fotos", `${nf} no anexo`);
      });
      s += assinatura(fim);
      s += await anexoFotos(fotos, zip, rels, `Fotografias registradas no período${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, ${LOCAL_DOC()}.`);
      return s;
    };
  }
  /* ---------- RDO: Relatório Diário de Obra no formato padrão ---------- */
  function assinaturaDupla(data, empresa, resp) {
    const [y, m, d] = data.split("-"), local = `${LOCAL_DOC()}, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}.`;
    const lados = docPessoal()
      ? [[FISCAL.nome, FISCAL.cargo, "Responsável técnico"], [resp || (docObra && docObra.cliente) || " ", empresa ? `Responsável – ${empresa}` : "Contratante / proprietário", empresa ? "Executora" : "Contratante"]]
      : [[FISCAL.nome, FISCAL.cargo, "Fiscal da Obra – Prefeitura"], [resp || " ", empresa ? `Responsável técnico – ${empresa}` : "Responsável técnico da contratada", "Contratada"]];
    if (modoPdf) return B({ k: "assinatura2", t: local, lados });
    const cel = l => `<w:tc><w:tcPr><w:tcW w:w="4535" w:type="dxa"/></w:tcPr>${P("________________________________", { jc: "center", after: 0, before: 600 })}${P(l[0], { jc: "center", after: 0, b: true })}${P(l[1], { jc: "center", after: 0 })}${P(l[2], { jc: "center", after: 0 })}</w:tc>`;
    return P(local, { jc: "right", before: 360, after: 120 }) +
      `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4535"/><w:gridCol w:w="4535"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${lados.map(cel).join("")}</w:tr></w:tbl>`;
  }
  // "1 encarregado, 4 pedreiros e 6 serventes" → [["Encarregado", 1], ["Pedreiros", 4], ["Serventes", 6]]
  function maoDeObra(txt) {
    return String(txt || "").split(/[,;\n]|\s+e\s+/).map(x => x.trim()).filter(Boolean).map(x => {
      const m = x.match(/^(\d+)\s*(?:x\s*)?(.+)$/i) || x.match(/^(.+?)\s*[:=-]?\s*(\d+)$/);
      if (!m) return [x, null];
      const [n, f] = /^\d+$/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
      return [f.charAt(0).toUpperCase() + f.slice(1), n];
    });
  }
  const praticavel = c => /sem trabalho|forte/i.test(c || "") ? "Impraticável" : c ? "Praticável" : "–";
  const linhasTexto = t => String(t || "").split("\n").map(l => l.replace(/^[–\-•*]\s*/, "").trim()).filter(Boolean);
  function rdo(o, dia, soCorpo = false) {
    return async (zip, rels) => {
      const ds = [...(o.diario || [])].filter(x => x.data).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const d = ds.find(x => x.data === dia) || {}, num = d.data ? ds.indexOf(d) + 1 : ds.filter(x => x.data < dia).length + 1;
      const sem = SEMANA[new Date(dia + "T12:00:00").getDay()];
      const ini = o.dataInicio, fim = prazoAtual(o), dias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
      const fotos = (o.fotos || []).filter(f => f.data === dia), vist = (o.vistorias || []).filter(v => v.data === dia && v.obs);
      const pend = (o.pendencias || []).filter(p => !p.resolvida), servs = (o.servicos || []).filter(x => x.etapa && Number(x.percentual) > 0);
      let s = titulo("RELATÓRIO DIÁRIO DE OBRA – RDO") + P(`RDO nº ${String(num).padStart(3, "0")} · ${dt(dia)} · ${d.diaTipo || sem}`, { jc: "center", after: 240 });
      s += tabela(["Obra", "Contrato", "Contratada"], [[o.nome || "", o.numero || "–", [o.empresa, o.cnpj ? "CNPJ " + o.cnpj : ""].filter(Boolean).join(", ") || "–"]], [3870, 1700, 3500]);
      s += tabela(["Início", "Término previsto", ">Prazo (dias)", ">Decorridos", ">Restantes"], [[dt(ini), dt(fim),
        ini && fim ? String(dias(ini, fim)) : "–", ini ? String(Math.max(0, dias(ini, dia))) : "–", fim ? String(dias(dia, fim)) : "–"]], [1814, 1814, 1814, 1814, 1814]);
      s += secao("1. CONDIÇÕES DO TEMPO");
      s += tabela(["Turno", "Tempo", "Condição de trabalho"], [["Manhã", d.climaManha || "–", praticavel(d.climaManha)], ["Tarde", d.climaTarde || "–", praticavel(d.climaTarde)]], [2000, 4070, 3000]);
      s += campo("Chuva no dia", isNum(d.chuva) ? `${String(d.chuva).replace(".", ",")} mm` : "") + campo("Temperatura", d.temperatura) + (d.impraticavel === "sim" ? campo("Dia impraticável", "sim, sem condições de trabalho") : "");
      s += secao("2. MÃO DE OBRA");
      const mo = maoDeObra(d.equipe), tot = mo.reduce((t, [, n]) => t + (n || 0), 0);
      if (mo.length) s += tabela(["Função", ">Quantidade"], [...mo.map(([f, n]) => [f, n === null ? "–" : String(n)]), [{ t: "Total", b: true }, { t: String(tot || d.efetivo || "–"), b: true }]], [6570, 2500]);
      else s += P(isNum(d.efetivo) ? `Efetivo total: ${d.efetivo} trabalhador(es).` : "Mão de obra não informada.");
      s += secao("3. EQUIPAMENTOS E MATERIAIS");
      const eq = String(d.equipamentos || "").split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
      s += eq.length ? tabela(["Equipamento / material recebido"], eq.map(x => [x]), [9070]) : P("Não informado.");
      s += secao("4. ATIVIDADES EXECUTADAS");
      const at = [...linhasTexto(d.servicos), ...vist.flatMap(v => linhasTexto(v.obs))];
      s += at.length ? at.map(item).join("") : P("Nenhuma atividade registrada neste dia.");
      if (servs.length) s += P("Andamento dos serviços:", { b: true, before: 120, after: 60 }) + tabela(["Serviço / etapa", ">% executado"], servs.map(x => [x.etapa, pctTxt(Number(x.percentual))]), [6570, 2500]);
      s += secao("5. OCORRÊNCIAS E ORIENTAÇÕES À CONTRATADA");
      const oc = linhasTexto(d.ocorrencias);
      s += oc.length ? oc.map(item).join("") : P("Sem ocorrências.");
      s += secao("6. PENDÊNCIAS EM ABERTO");
      s += pend.length ? pend.map(p => item(p.texto + (p.prazo ? ` Prazo: ${dt(p.prazo)}.` : ""))).join("") : P("Não há pendências em aberto.");
      s += secao("7. REGISTRO FOTOGRÁFICO") + P(fotos.length ? `${fotos.length} fotografia(s) no anexo.` : "Sem fotografias neste dia.");
      s += assinaturaDupla(dia, o.empresa, d.responsavel);
      if (!soCorpo) s += await anexoFotos(fotos, zip, rels, `Fotografias do dia ${dt(dia)}${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, ${LOCAL_DOC()}.`);
      return s;
    };
  }
  function rdosPeriodo(o, ini, fim) {
    return async (zip, rels) => {
      const dias = [...new Set((o.diario || []).map(x => x.data).filter(x => x && x >= ini && x <= fim))].sort();
      if (!dias.length) return titulo("RELATÓRIOS DIÁRIOS DE OBRA – RDO") + P(`Não há registros no diário de obra entre ${dt(ini)} e ${dt(fim)}.`, { jc: "center" });
      let s = "";
      for (let i = 0; i < dias.length; i++) s += (i ? quebra() : "") + await rdo(o, dias[i], true)(zip, rels);
      const fotos = (o.fotos || []).filter(f => dias.includes(f.data)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      return s + await anexoFotos(fotos, zip, rels, `Fotografias dos dias ${dt(ini)} a ${dt(fim)}${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, ${LOCAL_DOC()}.`);
    };
  }
  async function gerarRelatorio(tipo, formato = "docx") {
    const o = curObra(); if (!o) return; docObra = o;
    const dia = state.relData || hojeISO(), pdf = formato === "pdf";
    const ini = state.perIni || primeiroDiario(o) || dia, fim = state.perFim || hojeISO();
    if ((tipo === "periodo" || tipo === "rdos") && ini > fim) { state.error = "A data inicial do período é depois da data final."; return render(); }
    state.busy = `rel-${tipo}-${formato}`; state.error = state.info = state.warn = ""; render();
    try {
      const corpo = tipo === "dia" ? relatorioDiario(o, dia) : tipo === "rdo" ? rdo(o, dia) : tipo === "rdos" ? rdosPeriodo(o, ini, fim) : tipo === "periodo" ? diarioPeriodo(o, ini, fim) : relatorioCompleto(o, dia);
      const arq = pdf ? await montarPdf(corpo) : await montarDocx(corpo);
      const base = { dia: "Relatorio_Diario", obra: "Relatorio_Geral", periodo: "Diario_de_Obra", rdo: "RDO", rdos: "RDOs" }[tipo], per = tipo === "periodo" || tipo === "rdos";
      const nome = `${base}_${slug(o.nome).replace(/-/g, "_")}_${per ? `${ini}_a_${fim}` : dia}.${pdf ? "pdf" : "docx"}`;
      if (state.downloads) await state.downloads.save({ filename: nome, data: arq });
      else { const u = URL.createObjectURL(arq); const a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
      const reg = { data: per ? fim : dia, titulo: { dia: "Relatório diário de fiscalização", obra: "Relatório geral da obra", periodo: `Diário de obra de ${dt(ini)} a ${dt(fim)}`, rdo: `RDO de ${dt(dia)}`, rdos: `RDOs de ${dt(ini)} a ${dt(fim)}` }[tipo] + (pdf ? " (PDF)" : ""), arquivo: nome };
      if (canWrite()) await patch(curObra(), { relatorios: [...(curObra().relatorios || []).filter(r => r.arquivo !== nome), reg] }).catch(() => {});
      state.info = `Arquivo gerado: ${nome}. Ele também foi anotado em Vistorias e pendências > Relatórios emitidos.`;
    } catch (e) {
      if (e && e.code === "declined") state.info = "";
      else state.error = `Não foi possível gerar o ${pdf ? "PDF" : "relatório"} agora. Verifique a internet e tente de novo.`;
    }
    state.busy = ""; render();
  }
  const primeiroDiario = o => (o.diario || []).map(d => d.data).filter(Boolean).sort()[0] || "";
  const botaoRel = (tipo, formato, txt, primario) => `<button ${primario ? 'class="primary" ' : ""}data-rel="${tipo}" data-formato="${formato}" ${state.busy ? "disabled" : ""}>${state.busy === `rel-${tipo}-${formato}` ? "Gerando…" : txt}</button>`;
  function blocoRelatorios() {
    return `<section class="blk"><header><h3>Relatórios em Word e PDF</h3></header>
      <p class="small muted" style="margin:0 0 10px">Gera o arquivo no papel timbrado da Prefeitura, com as fotos e a assinatura do fiscal. Use Word para editar e PDF para enviar ou imprimir.</p>
      <div class="rel-row"><label class="f">Data do relatório<input id="rel-data" type="date" data-bind="relData" value="${esc(state.relData || hojeISO())}"></label></div>
      <div class="rel-grid">
        <div><b>RDO – Relatório Diário de Obra</b><div class="btns">${botaoRel("rdo", "docx", "Word", true)}${botaoRel("rdo", "pdf", "PDF", true)}</div></div>
        <div><b>Relatório do dia</b><div class="btns">${botaoRel("dia", "docx", "Word")}${botaoRel("dia", "pdf", "PDF")}</div></div>
        <div><b>Relatório completo da obra</b><div class="btns">${botaoRel("obra", "docx", "Word")}${botaoRel("obra", "pdf", "PDF")}</div></div>
      </div>
    </section>`;
  }
  function blocoPeriodo(o) {
    if (!(o.diario || []).length) return "";
    return `<section class="blk"><header><h3>Vários dias num arquivo (diário ou RDOs)</h3></header>
      <div class="rel-row"><label class="f">De<input id="per-ini" type="date" data-bind="perIni" value="${esc(state.perIni || primeiroDiario(o))}"></label>
        <label class="f">Até<input id="per-fim" type="date" data-bind="perFim" value="${esc(state.perFim || hojeISO())}"></label>
        ${botaoRel("periodo", "pdf", "Diário em PDF", true)}${botaoRel("periodo", "docx", "Diário em Word")}${botaoRel("rdos", "pdf", "RDOs em PDF")}${botaoRel("rdos", "docx", "RDOs em Word")}</div>
      <p class="small muted" style="margin:8px 0 0">O diário junta os dias num relatório corrido. Os RDOs saem um por página, no formato padrão, prontos para assinar.</p>
    </section>`;
  }

  /* ---------- Orçamento: SINAPI, BDI, memória de cálculo, cronograma, PLE, memorial e Múltipla ---------- */
  const BDI_TIPOS = {
    "Construção e Reforma de Edifícios": { AC: [3.00, 4.00, 5.50], SG: [0.80, 0.80, 1.00], R: [0.97, 1.27, 1.27], DF: [0.59, 1.23, 1.39], L: [6.16, 7.40, 8.96] },
    "Construção de Praças Urbanas, Rodovias, Ferrovias e recapeamento e pavimentação de vias urbanas": { AC: [3.80, 4.01, 4.67], SG: [0.32, 0.40, 0.74], R: [0.50, 0.56, 0.97], DF: [1.02, 1.11, 1.21], L: [6.64, 7.30, 8.69] },
    "Construção de Redes de Abastecimento de Água, Coleta de Esgoto": { AC: [3.43, 4.93, 6.71], SG: [0.28, 0.49, 0.75], R: [1.00, 1.39, 1.74], DF: [0.94, 0.99, 1.17], L: [6.74, 8.04, 9.40] },
    "Construção e Manutenção de Estações e Redes de Distribuição de Energia Elétrica": { AC: [5.29, 5.92, 7.93], SG: [0.25, 0.51, 0.56], R: [1.00, 1.48, 1.97], DF: [1.01, 1.07, 1.11], L: [8.00, 8.31, 9.51] },
    "Obras Portuárias, Marítimas e Fluviais": { AC: [4.00, 5.52, 7.85], SG: [0.81, 1.22, 1.99], R: [1.46, 2.32, 3.16], DF: [0.94, 1.02, 1.33], L: [7.14, 8.40, 10.43] },
    "Fornecimento de Materiais e Equipamentos (aquisição indireta - em conjunto com licitação de obras)": { AC: [1.50, 3.45, 4.49], SG: [0.30, 0.48, 0.82], R: [0.56, 0.85, 0.89], DF: [0.85, 0.85, 1.11], L: [3.50, 5.11, 6.22] }
  };
  const BDI_ITENS = [["AC", "Administração central"], ["SG", "Seguro e garantia"], ["R", "Risco"], ["DF", "Despesas financeiras"], ["L", "Lucro"],
    ["CP", "Tributos: PIS e COFINS"], ["ISSbase", "Base de cálculo do ISS (% do valor)"], ["ISS", "Alíquota do ISS"], ["CPRB", "CPRB (só no desonerado)"]];
  const FONTES_ORC = ["SINAPI", "SINAPI-I", "SICRO", "Composição", "Cotação"];
  const NIVEL_TXT = { meta: "Meta", etapa: "Etapa", servico: "Serviço" }, RANK = { meta: 0, etapa: 1, servico: 2 };
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const num2 = (v, d = 2) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pctBdi = v => (Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

  function tipoBdiPadrao(o) {
    const t = semAcento(o.tipoObra || o.objeto || "").toLowerCase(), k = Object.keys(BDI_TIPOS);
    if (/paviment|recape|praca|drenag|bueir|estrada|rodov|ponte|parque/.test(t)) return k[1];
    if (/agua|esgoto|saneam/.test(t)) return k[2];
    if (/eletric|ilumina|energia/.test(t)) return k[3];
    return k[0];
  }
  function orcNovo(o) {
    const cx = o.caixa || {}, tipo = tipoBdiPadrao(o), m = BDI_TIPOS[tipo];
    return {
      dataBase: cx.dataBase || "", desonerado: cx.desonerado === "sim",
      bdi: { tipo, AC: m.AC[1], SG: m.SG[1], R: m.R[1], DF: m.DF[1], L: m.L[1], CP: 3.65, ISSbase: 50, ISS: 3.83, CPRB: 4.5 },
      itens: [], crono: { inicio: ym(o.dataInicio) || ym(hojeISO()), meses: 6, dist: {} },
      proposta: areaDe(o) === "pessoal"
        ? { proponente: String(o.cliente || "").toUpperCase(), municipio: String(o.municipio || "").toUpperCase(), responsavel: FISCAL.nome,
          registro: (FISCAL.cargo.match(/CREA[^,]*/) || [""])[0], art: "", prefeito: o.cliente || "", cargoPrefeito: "Contratante" }
        : { proponente: "PREFEITURA MUNICIPAL DE EDEALINA", municipio: "EDEALINA - GO", responsavel: FISCAL.nome,
          registro: (FISCAL.cargo.match(/CREA[^,]*/) || [""])[0], art: "", prefeito: "", cargoPrefeito: "PREFEITO(A) MUNICIPAL" },
      memorial: {}
    };
  }
  const orcDe = o => { const n = orcNovo(o), c = o.orcamento || {}; return { ...n, ...c, bdi: { ...n.bdi, ...(c.bdi || {}) }, crono: { ...n.crono, ...(c.crono || {}) }, proposta: { ...n.proposta, ...(c.proposta || {}) }, memorial: { ...(c.memorial || {}) }, itens: c.itens || [] }; };
  const orcItens = o => (o.orcamento && o.orcamento.itens) || [];
  async function salvarOrc(o, mud) {
    const novo = { ...orcDe(o), ...mud };
    await patch(o, { orcamento: novo });
    return novo;
  }

  /* BDI pela fórmula do Acórdão TCU 2622/2013, igual à aba BDI da Múltipla */
  function bdiCalc(orc) {
    const b = orc.bdi || {}, f = k => (Number(b[k]) || 0) / 100;
    const I = f("CP") + f("ISS") * f("ISSbase") + (orc.desonerado ? f("CPRB") : 0);
    if (I >= 1) return 0;
    return Math.round((((1 + f("AC") + f("SG") + f("R")) * (1 + f("DF")) * (1 + f("L"))) / (1 - I) - 1) * 10000) / 10000;
  }

  /* Memória de cálculo: aceita 3*8*4, 2,5 x 3, (4+2)*1,5 e potência com ^. Sem eval. */
  function calcExpr(txt) {
    let s = String(txt || "").replace(/\s+/g, "").replace(/[xX×]/g, "*").replace(/÷/g, "/");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(/,/g, ".");
    if (!/^[0-9.+\-*/()^]+$/.test(s)) return null;
    let i = 0;
    const num = () => { const m = s.slice(i).match(/^\d*\.?\d+/); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
    const pot = b => { if (s[i] === "^") { i++; return Math.pow(b, fator()); } return b; };
    const fator = () => {
      if (s[i] === "-") { i++; return -fator(); }
      if (s[i] === "+") { i++; return fator(); }
      if (s[i] === "(") { i++; const v = soma(); if (s[i] !== ")") throw 0; i++; return pot(v); }
      return pot(num());
    };
    const termo = () => { let v = fator(); while (s[i] === "*" || s[i] === "/") { const op = s[i++], w = fator(); v = op === "*" ? v * w : v / w; } return v; };
    const soma = () => { let v = termo(); while (s[i] === "+" || s[i] === "-") { const op = s[i++], w = termo(); v = op === "+" ? v + w : v - w; } return v; };
    try { const v = soma(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  const qtdDe = x => { const m = String(x.memoria || "").trim(); if (m) { const v = calcExpr(m); if (v !== null) return r2(v); } return isNum(x.qtd) ? r2(x.qtd) : 0; };

  /* Numeração (1, 1.1, 1.1.1), preço com BDI arredondado como na Múltipla e subtotais por meta e etapa */
  function orcCalc(o) {
    const orc = orcDe(o), bdi = bdiCalc(orc), linhas = [], porItem = new Map();
    let im = 0, ie = 0, is = 0, meta = null, etapa = null;
    for (const x of orc.itens) {
      let num;
      if (x.nivel === "meta") { im++; ie = 0; is = 0; meta = x; etapa = null; num = `${im}`; }
      else if (x.nivel === "etapa") { ie++; is = 0; etapa = x; num = `${Math.max(im, 1)}.${ie}`; }
      else { is++; num = etapa ? `${Math.max(im, 1)}.${ie}.${is}` : `${Math.max(im, 1)}.${is}`; }
      const l = { x, num, meta, etapa, total: 0, totalSem: 0 };
      if (x.nivel === "servico") {
        l.grupo = etapa || meta; l.qtd = qtdDe(x); l.custo = r2(x.custo); l.preco = r2(l.custo * (1 + bdi));
        l.total = r2(l.qtd * l.preco); l.totalSem = r2(l.qtd * l.custo);
      }
      linhas.push(l); porItem.set(x, l);
    }
    const grupos = [];
    for (const l of linhas) if (l.x.nivel === "servico") {
      for (const g of [l.meta, l.etapa]) if (g) { const gl = porItem.get(g); gl.total = r2(gl.total + l.total); gl.totalSem = r2(gl.totalSem + l.totalSem); }
      if (l.grupo && !grupos.includes(porItem.get(l.grupo))) grupos.push(porItem.get(l.grupo));
    }
    const servs = linhas.filter(l => l.x.nivel === "servico");
    const sem = r2(servs.reduce((s, l) => s + l.totalSem, 0)), com = r2(servs.reduce((s, l) => s + l.total, 0));
    return { orc, bdi, linhas, servs, grupos, sem, com };
  }
  const orcMes = orc => orc.dataBase || (sinapi.indice && sinapi.indice.bases[0] ? sinapi.indice.bases[0].mes : "");
  const orcTotais = o => { const c = orcCalc(o); return { comBdi: c.com, semBdi: c.sem }; };
  function orcAvisos(c) {
    const a = [];
    if (c.linhas.length && c.linhas[0].x.nivel !== "meta") a.push("O primeiro item precisa ser uma Meta (a Múltipla exige).");
    c.servs.forEach(l => {
      if (!l.x.codigo) a.push(`Item ${l.num}: serviço sem código.`);
      if (!l.qtd) a.push(`Item ${l.num}: quantidade zerada.`);
      if (String(l.x.memoria || "").trim() && calcExpr(l.x.memoria) === null) a.push(`Item ${l.num}: não entendi a memória de cálculo "${l.x.memoria}".`);
      if (!l.custo) a.push(`Item ${l.num}: sem custo unitário.`);
    });
    const tipo = BDI_TIPOS[c.orc.bdi.tipo];
    if (tipo) ["AC", "SG", "R", "DF", "L"].forEach(k => { const v = Number(c.orc.bdi[k]); if (v < tipo[k][0] || v > tipo[k][2]) a.push(`BDI: ${k} de ${num2(v)}% está fora da faixa do TCU para este tipo de obra (${num2(tipo[k][0])}% a ${num2(tipo[k][2])}%).`); });
    return a;
  }

  /* Base SINAPI (arquivos em dados/sinapi, atualizados todo mês pelo robô do GitHub) */
  const SINAPI_DIR = "dados/sinapi/";
  const sinapi = { indice: null, bases: {}, erro: "" };
  async function sinapiIndice() {
    if (!sinapi.indice) { const r = await fetch(SINAPI_DIR + "indice.json", { cache: "no-cache" }); if (!r.ok) throw new Error("sinapi"); sinapi.indice = await r.json(); }
    return sinapi.indice;
  }
  async function sinapiBase(mes) {
    const ind = await sinapiIndice(), b = ind.bases.find(x => x.mes === mes) || ind.bases[0];
    if (!sinapi.bases[b.mes]) {
      const r = await fetch(SINAPI_DIR + b.arquivo); if (!r.ok) throw new Error("sinapi");
      const j = await r.json();
      j.chave = it => (it[0] ? "SINAPI-I" : "SINAPI") + " " + it[1];
      j.mapa = new Map(j.itens.map(it => [j.chave(it), it]));
      j.norm = j.itens.map(it => semAcento(it[2]).toLowerCase());
      sinapi.bases[b.mes] = j;
    }
    return sinapi.bases[b.mes];
  }
  function sinapiBuscar(base, q, fonte) {
    q = semAcento(q).toLowerCase().trim(); if (!q) return [];
    const ok = it => fonte === "todas" || (fonte === "SINAPI" ? !it[0] : !!it[0]);
    if (/^\d+$/.test(q)) return base.itens.filter(it => ok(it) && String(it[1]).startsWith(q)).sort((a, b) => String(a[1]).length - String(b[1]).length).slice(0, 60);
    const tk = q.split(/\s+/), res = [];
    for (let i = 0; i < base.itens.length && res.length < 60; i++) if (ok(base.itens[i]) && tk.every(t => base.norm[i].includes(t))) res.push(base.itens[i]);
    return res;
  }
  const precoBase = (it, orc) => (orc.desonerado ? it[4] : it[5]) ?? it[5] ?? it[4] ?? 0;
  async function orcBaseAtual(o) { const orc = orcDe(o), ind = await sinapiIndice(); return sinapiBase(orc.dataBase && ind.bases.some(b => b.mes === orc.dataBase) ? orc.dataBase : ind.bases[0].mes); }

  function orcResultados() {
    const b = state.orcBusca || {}, el = document.getElementById("orc-res"); if (!el) return;
    if (b.carregando) { el.innerHTML = `<div class="muted small">Carregando a base SINAPI…</div>`; return; }
    if (b.erro) { el.innerHTML = `<div class="msg err">${esc(b.erro)}</div>`; return; }
    if (!b.q || !b.q.trim()) { el.innerHTML = ""; return; }
    if (!b.res.length) { el.innerHTML = `<div class="muted small">Nada encontrado. Tente outra palavra ou o código.</div>`; return; }
    const orc = orcDe(curObra());
    el.innerHTML = `<ul class="sinapi-res">${b.res.map(it => { const p = precoBase(it, orc), ch = (it[0] ? "SINAPI-I" : "SINAPI") + " " + it[1]; return `<li>
      <span class="cod mono">${it[0] ? "SINAPI-I" : "SINAPI"} ${esc(it[1])}</span><span class="desc">${esc(it[2])}</span>
      <span class="un mono">${esc(it[3])}</span><span class="pr mono">${p ? brl(p) : "sem preço"}</span>
      <button class="sm" data-orc-add="${esc(ch)}">Adicionar</button></li>`; }).join("")}</ul>`;
  }
  let orcBuscaTimer = null;
  function orcBuscarAgora() {
    const b = state.orcBusca; clearTimeout(orcBuscaTimer);
    orcBuscaTimer = setTimeout(async () => {
      try { b.carregando = !Object.keys(sinapi.bases).length; orcResultados(); const base = await orcBaseAtual(curObra()); b.carregando = false; b.erro = ""; b.res = sinapiBuscar(base, b.q, b.fonte); }
      catch (e) { b.carregando = false; b.erro = "Não consegui abrir a base SINAPI. Verifique a internet e tente de novo."; }
      orcResultados();
    }, 220);
  }

  function posInsercao(itens, alvoId) {
    const i = itens.findIndex(x => x.id === alvoId); if (i < 0) return itens.length;
    let j = i + 1; while (j < itens.length && RANK[itens[j].nivel] > RANK[itens[i].nivel]) j++;
    return j;
  }
  async function orcInserir(o, item) {
    const orc = orcDe(o), itens = [...orc.itens];
    if (item.nivel !== "meta" && !itens.some(x => x.nivel === "meta")) itens.unshift({ id: uid(), nivel: "meta", descricao: String(o.nome || "OBRA").toUpperCase() });
    let alvo = state.orcAlvo && itens.some(x => x.id === state.orcAlvo) ? state.orcAlvo : null;
    if (item.nivel === "meta") alvo = null;
    else if (item.nivel === "etapa" && alvo) { const a = itens.find(x => x.id === alvo); if (a.nivel === "etapa") alvo = [...itens.slice(0, itens.indexOf(a))].reverse().find(x => x.nivel === "meta")?.id || null; }
    const pos = alvo ? posInsercao(itens, alvo) : itens.length;
    itens.splice(pos, 0, item);
    if (item.nivel !== "servico") state.orcAlvo = item.id;
    await salvarOrc(o, { itens });
  }

  /* Distribuição do cronograma: % de cada grupo (etapa, ou meta sem etapas) por mês */
  function cronoOrc(c) {
    const cr = c.orc.crono, n = Math.max(1, Math.min(60, Number(cr.meses) || 1)), meses = [];
    for (let i = 0; i < n; i++) meses.push(addMes(cr.inicio || ym(hojeISO()), i));
    const linhas = c.grupos.map(g => {
      const d = (cr.dist || {})[g.x.id] || [], p = meses.map((_, i) => Number(d[i]) || 0);
      return { g, p, soma: Math.round(p.reduce((s, v) => s + v, 0) * 100) / 100, v: p.map(x => r2(g.total * x / 100)) };
    });
    const tot = meses.map((_, i) => r2(linhas.reduce((s, l) => s + l.v[i], 0)));
    let ac = 0; const acum = tot.map(v => (ac = r2(ac + v)));
    return { meses, linhas, tot, acum };
  }

  const orcFld = (id, campo, valor, tipo = "text", extra = "") => `<input id="${id}" type="${tipo}" ${tipo === "number" ? 'step="any"' : ""} data-orc-campo="${esc(campo)}" value="${esc(valor ?? "")}" ${extra}>`;
  function tabOrcamento(o) {
    const c = orcCalc(o), orc = c.orc, w = canWrite(), avisos = orcAvisos(c);
    const ind = sinapi.indice;
    if (!ind && !sinapi.erro && !sinapi.pedindo) { sinapi.pedindo = true; sinapiIndice().then(() => { sinapi.pedindo = false; render(); }).catch(() => { sinapi.pedindo = false; sinapi.erro = "Não consegui abrir a lista de bases SINAPI."; render(); }); }
    const bases = ind ? ind.bases : [];
    const baseTxt = orc.dataBase ? mesTxt(orc.dataBase) : bases[0] ? mesTxt(bases[0].mes) : "—";
    const b = state.orcBusca || (state.orcBusca = { q: "", fonte: "todas", res: [] });
    const tipoB = BDI_TIPOS[orc.bdi.tipo];
    const alvo = orc.itens.find(x => x.id === state.orcAlvo);
    const cr = cronoOrc(c);
    const ro = !w ? "disabled" : "";
    return `
      <div class="summary">
        <div class="tile"><div class="eyebrow">Custo direto (sem BDI)</div><div class="v num sm">${brl(c.sem)}</div><div class="sub">${c.servs.length} serviço(s)</div></div>
        <div class="tile"><div class="eyebrow">BDI</div><div class="v num">${pctBdi(c.bdi)}</div><div class="sub">${esc(orc.desonerado ? "Desonerado" : "Não desonerado")}</div></div>
        <div class="tile"><div class="eyebrow">Total com BDI</div><div class="v num sm">${brl(c.com)}</div><div class="sub">SINAPI-GO ${esc(baseTxt)}</div></div>
      </div>
      ${avisos.length ? `<div class="msg warn"><b>Conferir antes de exportar:</b><ul style="margin:6px 0 0 18px;padding:0">${avisos.slice(0, 8).map(t => `<li>${esc(t)}</li>`).join("")}${avisos.length > 8 ? `<li>e mais ${avisos.length - 8}…</li>` : ""}</ul></div>` : ""}

      <section class="blk"><header><h3>Planilha orçamentária</h3>${w ? `<div class="btns"><button data-act="orc-meta">+ Meta</button><button data-act="orc-etapa">+ Etapa</button><button data-act="orc-proprio">+ Item próprio</button></div>` : ""}</header>
        ${w ? `<div class="orc-busca">
          <div class="filters" style="margin:0 0 8px">${["todas", "SINAPI", "SINAPI-I"].map(f => `<button class="chip" data-orc-fonte="${f}" aria-pressed="${b.fonte === f}">${f === "todas" ? "Composições e insumos" : f === "SINAPI" ? "Só composições" : "Só insumos"}</button>`).join("")}
            <input id="orc-q" type="search" placeholder="Buscar no SINAPI-GO ${esc(baseTxt)}: código ou descrição (ex.: 88316, servente, concreto fck 25)" value="${esc(b.q)}" autocomplete="off"></div>
          <div class="small muted" style="margin-bottom:6px">${alvo ? `Os itens entram em <b>${esc(alvo.descricao || NIVEL_TXT[alvo.nivel])}</b>. <button class="ghost sm" data-act="orc-alvo-fim">Pôr no fim da planilha</button>` : "Os itens entram no fim da planilha. Clique em ＋ numa meta ou etapa para pôr os itens dentro dela."}</div>
          <div id="orc-res"></div></div>` : ""}
        ${c.linhas.length ? `<div class="tbl orc-tbl"><table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Und</th><th>Memória de cálculo</th><th class="r">Quant.</th><th class="r">Custo unit.</th><th class="r">Preço c/ BDI</th><th class="r">Total</th>${w ? "<th></th>" : ""}</tr></thead><tbody>
          ${c.linhas.map((l, i) => { const x = l.x, sv = x.nivel === "servico", id = esc(x.id);
            if (!sv) return `<tr class="orc-${x.nivel}${state.orcAlvo === x.id ? " orc-alvo" : ""}"><td class="mono">${l.num}</td><td class="small">${NIVEL_TXT[x.nivel]}</td>
              <td colspan="6">${w ? `<input id="orc-d-${id}" class="orc-desc" data-orc-item="${id}" data-k="descricao" value="${esc(x.descricao)}" aria-label="Descrição">` : `<b>${esc(x.descricao)}</b>`}</td>
              <td class="mono r"><b>${brl(l.total)}</b></td>${w ? `<td class="orc-acts"><button class="sm" title="Pôr os próximos itens aqui" data-orc-alvo="${id}">＋</button>${acoesItem(x, i, c.linhas.length)}</td>` : ""}</tr>`;
            const memOk = !String(x.memoria || "").trim() || calcExpr(x.memoria) !== null, proprio = !/^SINAPI/.test(x.fonte || "");
            return `<tr><td class="mono">${l.num}</td><td class="small mono orc-cod">${esc(x.fonte || "")}<br>${esc(x.codigo || "")}</td>
              <td class="small">${w && proprio ? `<textarea id="orc-d-${id}" rows="2" data-orc-item="${id}" data-k="descricao">${esc(x.descricao)}</textarea>` : esc(x.descricao)}</td>
              <td class="mono">${w && proprio ? `<input id="orc-u-${id}" class="orc-un" data-orc-item="${id}" data-k="unidade" value="${esc(x.unidade)}">` : esc(x.unidade)}</td>
              <td>${w ? `<input id="orc-m-${id}" class="orc-mem${memOk ? "" : " invalido"}" data-orc-item="${id}" data-k="memoria" value="${esc(x.memoria)}" placeholder="ex.: 3*8*4">` : `<span class="mono small">${esc(x.memoria || "")}</span>`}</td>
              <td class="r">${w && !String(x.memoria || "").trim() ? `<input id="orc-q-${id}" class="orc-num" type="number" step="any" data-orc-item="${id}" data-k="qtd" value="${esc(x.qtd)}">` : `<span class="mono">${num2(l.qtd)}</span>`}</td>
              <td class="r">${w && proprio ? `<input id="orc-c-${id}" class="orc-num" type="number" step="any" data-orc-item="${id}" data-k="custo" value="${esc(x.custo)}">` : `<span class="mono">${num2(l.custo)}</span>`}</td>
              <td class="mono r">${num2(l.preco)}</td><td class="mono r">${num2(l.total)}</td>${w ? `<td class="orc-acts">${acoesItem(x, i, c.linhas.length)}</td>` : ""}</tr>`; }).join("")}
          </tbody><tfoot><tr><td colspan="8">Total sem BDI</td><td class="mono r">${brl(c.sem)}</td>${w ? "<td></td>" : ""}</tr>
            <tr><td colspan="8">Total com BDI (${pctBdi(c.bdi)})</td><td class="mono r"><b>${brl(c.com)}</b></td>${w ? "<td></td>" : ""}</tr></tfoot></table></div>
          <p class="small muted" style="margin:10px 0 0">Na memória de cálculo use * para multiplicar e vírgula para decimais (ex.: 2,5*3*4). A quantidade sai dela. O preço com BDI é arredondado em 2 casas, como na Múltipla.</p>`
          : `<div class="muted">Planilha vazia. Comece com <b>+ Meta</b> (ex.: "CONSTRUÇÃO DA PRAÇA"), crie as etapas e busque os serviços no SINAPI. Itens fora do SINAPI entram por <b>+ Item próprio</b> (cotação ou composição própria).</div>`}
      </section>

      <section class="blk"><header><h3>Dados da proposta</h3></header><div class="grid">
        <label class="f">Data-base (SINAPI-GO)<select id="orc-database" data-orc-campo="dataBase" ${ro}>${bases.map(x => `<option value="${esc(x.mes)}" ${(orc.dataBase || bases[0]?.mes) === x.mes ? "selected" : ""}>${mesTxt(x.mes)}</option>`).join("") || `<option>${esc(baseTxt)}</option>`}</select></label>
        <label class="f">Desoneração<select id="orc-deson" data-orc-campo="desonerado" ${ro}><option value="nao" ${!orc.desonerado ? "selected" : ""}>Não desonerado</option><option value="sim" ${orc.desonerado ? "selected" : ""}>Desonerado</option></select></label>
        <label class="f">Proponente / tomador${orcFld("orc-p-proponente", "proposta.proponente", orc.proposta.proponente, "text", ro)}</label>
        <label class="f">Município - UF${orcFld("orc-p-municipio", "proposta.municipio", orc.proposta.municipio, "text", ro)}</label>
        <label class="f">Responsável técnico${orcFld("orc-p-resp", "proposta.responsavel", orc.proposta.responsavel, "text", ro)}</label>
        <label class="f">CREA / CAU${orcFld("orc-p-reg", "proposta.registro", orc.proposta.registro, "text", ro)}</label>
        <label class="f">ART / RRT${orcFld("orc-p-art", "proposta.art", orc.proposta.art, "text", ro)}</label>
        <label class="f">${areaDe(o) === "pessoal" ? "Quem assina pelo contratante" : "Prefeito(a)"}${orcFld("orc-p-pref", "proposta.prefeito", orc.proposta.prefeito, "text", ro)}</label>
        <label class="f">${areaDe(o) === "pessoal" ? "Qualificação" : "Cargo"}${orcFld("orc-p-cargo", "proposta.cargoPrefeito", orc.proposta.cargoPrefeito, "text", ro)}</label>
      </div>
      ${w && c.servs.some(l => /^SINAPI/.test(l.x.fonte)) ? `<div class="btns" style="margin-top:12px"><button data-act="orc-reprecificar" ${state.busy ? "disabled" : ""}>${state.busy === "orc-rep" ? "Atualizando…" : `Atualizar preços SINAPI para ${esc(baseTxt)} ${orc.desonerado ? "desonerado" : "não desonerado"}`}</button></div>` : ""}
      ${ind && ind.bases[0] ? `<p class="small muted" style="margin:8px 0 0">Base mais nova no site: SINAPI-GO ${mesTxt(ind.bases[0].mes)}${ind.bases[0].atualizadoEm ? `, carregada em ${dt(ind.bases[0].atualizadoEm)}` : ""}. A base é atualizada todo mês, e cada orçamento fica na data-base escolhida até você mudar.</p>` : ""}
      </section>

      <section class="blk"><header><h3>BDI</h3><span class="mono"><b>${pctBdi(c.bdi)}</b></span></header>
        <label class="f wide">Tipo de obra (Acórdão TCU 2622/2013)<select id="orc-bdi-tipo" data-orc-campo="bdi.tipo" ${ro}>${Object.keys(BDI_TIPOS).map(t => `<option ${orc.bdi.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <div class="grid" style="margin-top:12px">${BDI_ITENS.filter(([k]) => k !== "CPRB" || orc.desonerado).map(([k, t]) => `<label class="f">${t} (%)${orcFld("orc-bdi-" + k, "bdi." + k, orc.bdi[k], "number", ro)}
          ${tipoB && tipoB[k] ? `<span class="small muted" style="font-weight:400">TCU: ${num2(tipoB[k][0])}% a ${num2(tipoB[k][2])}%, médio ${num2(tipoB[k][1])}%</span>` : ""}</label>`).join("")}</div>
        ${w && tipoB ? `<div class="btns" style="margin-top:10px"><button class="sm" data-act="orc-bdi-medio">Usar os valores médios do TCU</button></div>` : ""}
        <p class="small muted" style="margin:8px 0 0">BDI = ((1+AC+SG+R) × (1+DF) × (1+L)) ÷ (1 − CP − ISS × base${orc.desonerado ? " − CPRB" : ""}) − 1</p>
      </section>

      ${c.grupos.length ? `<section class="blk"><header><h3>Cronograma físico-financeiro</h3>${w ? `<div class="btns"><button class="sm" data-act="orc-crono-igual">Distribuir igual</button>${o.dataInicio && prazoAtual(o) ? `<button class="sm" data-act="orc-crono-obra">Usar início e prazo da obra</button>` : ""}</div>` : ""}</header>
        <div class="grid" style="margin-bottom:12px"><label class="f">Primeiro mês${orcFld("orc-cr-ini", "crono.inicio", orc.crono.inicio, "month", ro)}</label><label class="f">Duração (meses)${orcFld("orc-cr-n", "crono.meses", orc.crono.meses, "number", ro + ' min="1" max="60"')}</label></div>
        <div class="tbl"><table class="crono-orc"><thead><tr><th>Etapa</th><th class="r">Valor</th>${cr.meses.map(m => `<th class="r">${mesTxt(m)}</th>`).join("")}<th class="r">Soma</th></tr></thead><tbody>
          ${cr.linhas.map(l => `<tr><td><span class="mono">${l.g.num}</span> ${esc(l.g.x.descricao)}</td><td class="mono r">${brl(l.g.total)}</td>
            ${l.p.map((p, i) => `<td class="r">${w ? `<span class="pct-cel"><input type="number" min="0" max="100" step="any" id="orc-cr-${esc(l.g.x.id)}-${i}" data-orc-crono="${esc(l.g.x.id)}" data-i="${i}" value="${p || ""}" aria-label="% em ${mesTxt(cr.meses[i])}"><span>%</span></span>` : `${num2(p)}%`}<div class="small muted mono">${l.v[i] ? num2(l.v[i]) : ""}</div></td>`).join("")}
            <td class="mono r ${Math.abs(l.soma - 100) > 0.01 ? "prazo-late" : ""}">${num2(l.soma)}%</td></tr>`).join("")}
        </tbody><tfoot><tr><td>Total no mês</td><td class="mono r">${brl(c.com)}</td>${cr.tot.map(v => `<td class="mono r">${num2(v)}</td>`).join("")}<td></td></tr>
          <tr><td>Acumulado</td><td></td>${cr.acum.map(v => `<td class="mono r">${num2(v)}<div class="small muted">${pctTxt(pct(v, c.com))}</div></td>`).join("")}<td></td></tr></tfoot></table></div>
        <p class="small muted" style="margin:10px 0 0">Ponha o % de cada etapa em cada mês. Cada linha precisa somar 100%.</p>
      </section>` : ""}

      ${c.grupos.length ? `<section class="blk"><header><h3>Memorial descritivo</h3>${w && state.sample ? `<button data-act="orc-memorial-claude" ${state.busy ? "disabled" : ""}>${state.busy === "orc-mem" ? "Escrevendo…" : "Escrever com Claude"}</button>` : ""}</header>
        <p class="small muted" style="margin:0 0 10px">Texto de cada etapa no memorial. Se ficar em branco, o memorial lista os serviços da etapa com as quantidades.</p>
        <label class="f wide">Considerações gerais<textarea id="orc-mem-geral" rows="3" data-orc-memorial="_geral" ${ro} placeholder="${esc(memorialGeralPadrao(o))}">${esc(orc.memorial._geral || "")}</textarea></label>
        ${c.grupos.map(g => `<label class="f wide" style="margin-top:10px">${g.num} ${esc(g.x.descricao)}<textarea id="orc-mem-${esc(g.x.id)}" rows="3" data-orc-memorial="${esc(g.x.id)}" ${ro} placeholder="${esc(memorialAuto(c, g))}">${esc(orc.memorial[g.x.id] || "")}</textarea></label>`).join("")}
      </section>` : ""}

      <section class="blk"><header><h3>Documentos da proposta</h3></header>
        <p class="small muted" style="margin:0 0 10px">Saem no papel timbrado, com os mesmos cálculos e arredondamentos da Múltipla, prontos para imprimir e assinar.</p>
        <div class="rel-grid">
          ${[["orc", "Planilha orçamentária"], ["bdi", "Composição do BDI"], ["memoria", "Memória de cálculo"], ["crono", "Cronograma físico-financeiro"], ["ple", "PLE – Planilha de Levantamento de Eventos"], ["memorial", "Memorial descritivo"]].map(([k, t]) =>
            `<div><b>${t}</b><div class="btns">${botaoOrcDoc(k, "pdf", "PDF", true)}${botaoOrcDoc(k, "docx", "Word")}</div></div>`).join("")}
          <div><b>Proposta completa (todos acima)</b><div class="btns">${botaoOrcDoc("tudo", "pdf", "PDF", true)}${botaoOrcDoc("tudo", "docx", "Word")}</div></div>
        </div>
        <div class="btns" style="margin-top:14px">
          <button data-act="orc-excel" ${state.busy || !c.servs.length ? "disabled" : ""}>${state.busy === "orc-xlsx" ? "Gerando…" : "Planilha em Excel"}</button>
          <button class="primary" data-act="orc-multipla" ${state.busy || !c.servs.length ? "disabled" : ""}>${state.busy === "orc-pm" ? "Gerando…" : "Arquivo para a Múltipla da Caixa"}</button>
          ${w && c.servs.length ? `<button data-act="orc-usar" ${state.busy ? "disabled" : ""}>Usar no controle da obra</button>` : ""}
        </div>
        <details class="small muted" style="margin-top:10px"><summary>Como levar para a Múltipla</summary>
          <ol style="margin:6px 0 0 18px;padding:0"><li>Baixe o <b>Arquivo para a Múltipla da Caixa</b>.</li><li>Abra a Múltipla v3.16 em branco no Excel, com a Referência ${esc(baseTxt)} aberta junto.</li>
          <li>No MENU, use <b>Importar de outra Planilha Múltipla</b> e escolha o arquivo baixado. A própria macro da Caixa cria as linhas e preenche DADOS, BDI, ORÇAMENTO e CÁLCULO.</li><li>Confira o total: deve dar ${brl(c.com)}.</li></ol></details>
        ${w && c.servs.length ? `<p class="small muted" style="margin:8px 0 0"><b>Usar no controle da obra</b> passa as etapas com valor para a aba Serviços, o cronograma para a aba Cronograma e o total, o BDI e a data-base para os dados Caixa da obra.</p>` : ""}
      </section>`;
  }
  const acoesItem = (x, i, n) => `<button class="sm ghost" title="Subir" data-orc-mover="${esc(x.id)}" data-dir="-1" ${i === 0 ? "disabled" : ""}>↑</button><button class="sm ghost" title="Descer" data-orc-mover="${esc(x.id)}" data-dir="1" ${i === n - 1 ? "disabled" : ""}>↓</button>${state.confirm === "orc:" + x.id ? `<button class="sm danger" data-orc-del="${esc(x.id)}">Excluir${x.nivel !== "servico" ? " com itens" : ""}</button><button class="sm" data-no="1">Não</button>` : `<button class="sm ghost" title="Excluir" data-ask="orc:${esc(x.id)}">✕</button>`}`;
  const botaoOrcDoc = (tipo, formato, txt, primario) => `<button ${primario ? 'class="primary" ' : ""}data-orc-doc="${tipo}" data-formato="${formato}" ${state.busy ? "disabled" : ""}>${state.busy === `orcdoc-${tipo}-${formato}` ? "Gerando…" : txt}</button>`;

  /* ----- Textos e documentos ----- */
  const memorialGeralPadrao = o => `Este memorial descreve os serviços para ${o.objeto || o.nome}${o.endereco ? `, em ${o.endereco}` : ""}. Os serviços seguirão os projetos, as normas da ABNT e as especificações das composições SINAPI indicadas na planilha orçamentária. Materiais e mão de obra conforme a planilha; qualquer alteração depende de aprovação da fiscalização.`;
  const memorialAuto = (c, g) => { const s = c.servs.filter(l => l.grupo === g.x); return s.length ? `Compreende: ${s.map(l => `${l.x.descricao.toLowerCase()} (${num2(l.qtd)} ${l.x.unidade})`).join("; ")}.` : ""; };
  function cabecalhoOrc(o, c, nome) {
    const orc = c.orc;
    return titulo(nome) + P("", { after: 120 }) + campo("Obra", o.nome) + campo("Objeto", o.objeto) + campo("Local", [o.endereco, orc.proposta.municipio].filter(Boolean).join(" – ")) +
      campo("Proponente", orc.proposta.proponente) + campo("Referência", `SINAPI-GO ${mesTxt(orcMes(orc))} – ${orc.desonerado ? "desonerado" : "não desonerado"}`) +
      campo("BDI", pctBdi(c.bdi)) + P("", { after: 120 });
  }
  function assinaturaOrc(c) {
    const p = c.orc.proposta, [y, m, d] = hojeISO().split("-"), local = `${(p.municipio || LOCAL_DOC()).replace(/\s-\s/, " – ")}, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}.`;
    const lados = [[p.responsavel || " ", [p.registro, p.art ? "ART " + p.art : ""].filter(Boolean).join(" – ") || " ", "Responsável técnico"], [p.prefeito || " ", p.cargoPrefeito || " ", p.proponente || " "]];
    if (modoPdf) return B({ k: "assinatura2", t: local, lados });
    const cel = l => `<w:tc><w:tcPr><w:tcW w:w="4535" w:type="dxa"/></w:tcPr>${P("________________________________", { jc: "center", after: 0, before: 600 })}${P(l[0], { jc: "center", after: 0, b: true })}${P(l[1], { jc: "center", after: 0 })}${P(l[2], { jc: "center", after: 0 })}</w:tc>`;
    return P(local, { jc: "right", before: 360, after: 120 }) +
      `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4535"/><w:gridCol w:w="4535"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${lados.map(cel).join("")}</w:tr></w:tbl>`;
  }
  const docsOrc = {
    orc: (o, c) => cabecalhoOrc(o, c, "PLANILHA ORÇAMENTÁRIA") +
      tabela(["Item", "Código", "Descrição", "Und", ">Quant.", ">Custo unit.", ">Preço c/ BDI", ">Total (R$)"],
        [...c.linhas.map(l => l.x.nivel === "servico"
          ? [l.num, `${l.x.fonte} ${l.x.codigo}`, l.x.descricao, l.x.unidade, num2(l.qtd), num2(l.custo), num2(l.preco), num2(l.total)]
          : [{ t: l.num, b: true }, { t: NIVEL_TXT[l.x.nivel], b: true }, { t: l.x.descricao, b: true }, "", "", "", "", { t: num2(l.total), b: true }]),
        [{ t: "", b: true }, "", { t: "TOTAL SEM BDI", b: true }, "", "", "", "", { t: num2(c.sem), b: true }],
        [{ t: "", b: true }, "", { t: `TOTAL COM BDI (${pctBdi(c.bdi)})`, b: true }, "", "", "", "", { t: num2(c.com), b: true }]],
        [620, 1050, 3050, 550, 800, 950, 1000, 1050]) + assinaturaOrc(c),
    bdi: (o, c) => { const b = c.orc.bdi, t = BDI_TIPOS[b.tipo];
      return cabecalhoOrc(o, c, "COMPOSIÇÃO DO BDI") + campo("Tipo de obra", b.tipo) +
        tabela(["Item", "Sigla", ">% adotado", ">Faixa TCU (1º a 3º quartil)"],
          [...BDI_ITENS.filter(([k]) => k !== "CPRB" || c.orc.desonerado).map(([k, n]) => [n, k, num2(b[k]) + "%", t && t[k] ? `${num2(t[k][0])}% a ${num2(t[k][2])}%` : "—"]),
            [{ t: "BDI adotado", b: true }, "", { t: pctBdi(c.bdi), b: true }, ""]], [4170, 900, 1600, 2400]) +
        P(`Fórmula (Acórdão TCU nº 2622/2013): BDI = ((1 + AC + SG + R) × (1 + DF) × (1 + L)) ÷ (1 - CP - ISS${c.orc.desonerado ? " - CPRB" : ""}) - 1, com ISS = ${num2(b.ISS)}% sobre base de ${num2(b.ISSbase)}% do valor, ou seja, ${num2(b.ISS * b.ISSbase / 100)}%.`) +
        P(`Declaro, para os devidos fins, que conforme a legislação tributária municipal a base de cálculo do ISS para este tipo de obra corresponde a ${num2(b.ISSbase)}%, com a respectiva alíquota de ${num2(b.ISS)}%.`) + assinaturaOrc(c); },
    memoria: (o, c) => cabecalhoOrc(o, c, "MEMÓRIA DE CÁLCULO DOS QUANTITATIVOS") +
      tabela(["Item", "Descrição", "Und", "Memória de cálculo", ">Quant."],
        c.linhas.map(l => l.x.nivel === "servico" ? [l.num, l.x.descricao, l.x.unidade, l.x.memoria || "Quantidade informada", num2(l.qtd)] : [{ t: l.num, b: true }, { t: l.x.descricao, b: true }, "", "", ""]),
        [650, 3920, 550, 2750, 1200]) + assinaturaOrc(c),
    crono: (o, c) => { const cr = cronoOrc(c); let s = cabecalhoOrc(o, c, "CRONOGRAMA FÍSICO-FINANCEIRO");
      for (let i = 0; i < cr.meses.length; i += 4) {
        const ms = cr.meses.slice(i, i + 4), larg = [600, 2470, 1200, ...ms.map(() => Math.floor(4800 / ms.length))];
        s += tabela(["Item", "Etapa", ">Valor (R$)", ...ms.map(m => ">" + mesTxt(m))],
          [...cr.linhas.map(l => [l.g.num, l.g.x.descricao, num2(l.g.total), ...ms.map((_, j) => l.p[i + j] ? `${num2(l.v[i + j])}\n${num2(l.p[i + j])}%` : "–")]),
            [{ t: "", b: true }, { t: "Total no mês", b: true }, { t: num2(c.com), b: true }, ...ms.map((_, j) => ({ t: `${num2(cr.tot[i + j])}\n${pctTxt(pct(cr.tot[i + j], c.com))}`, b: true }))],
            [{ t: "", b: true }, { t: "Acumulado", b: true }, "", ...ms.map((_, j) => ({ t: `${num2(cr.acum[i + j])}\n${pctTxt(pct(cr.acum[i + j], c.com))}`, b: true }))]], larg);
      }
      return s + assinaturaOrc(c); },
    ple: (o, c) => { const cr = cronoOrc(c);
      return cabecalhoOrc(o, c, "PLE – PLANILHA DE LEVANTAMENTO DE EVENTOS") +
        P("Cada evento corresponde a uma etapa da planilha orçamentária. O evento é medido quando os serviços que o compõem estiverem executados e aferidos pela fiscalização.") +
        tabela(["Evento", "Descrição", ">Valor (R$)", ">% da obra", "Meses previstos", "Critério de aferição"],
          [...cr.linhas.map((l, i) => [String(i + 1), `${l.g.num} ${l.g.x.descricao}`, num2(l.g.total), pctTxt(pct(l.g.total, c.com)),
            l.p.map((p, j) => p ? mesTxt(cr.meses[j]) : "").filter(Boolean).join(", ") || "–",
            `Execução de 100% dos serviços do item ${l.g.num}, conforme quantidades da planilha`]),
            [{ t: "", b: true }, { t: "TOTAL", b: true }, { t: num2(c.com), b: true }, { t: "100%", b: true }, "", ""]], [700, 2400, 1200, 900, 1470, 2400]) + assinaturaOrc(c); },
    memorial: (o, c) => { const m = c.orc.memorial; let s = titulo("MEMORIAL DESCRITIVO") + P("", { after: 120 });
      s += secao("1. IDENTIFICAÇÃO") + campo("Obra", o.nome) + campo("Objeto", o.objeto) + campo("Tipo de obra", o.tipoObra) + campo("Local", [o.endereco, c.orc.proposta.municipio].filter(Boolean).join(" – ")) +
        campo("Coordenadas", coordTxt(o)) + campo("Proponente", c.orc.proposta.proponente) + campo("Valor orçado", `${brl(c.com)} (BDI de ${pctBdi(c.bdi)})`) + campo("Referência de preços", `SINAPI-GO ${mesTxt(orcMes(c.orc))}`);
      s += secao("2. CONSIDERAÇÕES GERAIS") + String(m._geral || memorialGeralPadrao(o)).split(/\n+/).map(t => P(t)).join("");
      c.grupos.forEach((g, i) => {
        s += secao(`${i + 3}. ${g.x.descricao.toUpperCase()}`);
        const txt = m[g.x.id]; if (txt) s += String(txt).split(/\n+/).map(t => P(t)).join("");
        else s += P("Compreende os seguintes serviços:") + c.servs.filter(l => l.grupo === g.x).map(l => item(`${l.x.descricao} – ${num2(l.qtd)} ${l.x.unidade} (${l.x.fonte} ${l.x.codigo}).`)).join("");
      });
      return s + assinaturaOrc(c); }
  };
  async function gerarDocOrc(tipo, formato) {
    const o = curObra(); if (!o) return; docObra = o;
    const c = orcCalc(o), pdf = formato === "pdf";
    if (!c.servs.length) { state.error = "Lance pelo menos um serviço na planilha antes de gerar os documentos."; return render(); }
    state.busy = `orcdoc-${tipo}-${formato}`; state.error = state.info = state.warn = ""; render();
    try {
      const ordem = tipo === "tudo" ? ["orc", "bdi", "memoria", "crono", "ple", "memorial"] : [tipo];
      const corpo = async () => ordem.map((k, i) => (i ? quebra() : "") + docsOrc[k](o, c)).join("");
      const arq = pdf ? await montarPdf(corpo) : await montarDocx(corpo);
      const base = { orc: "Planilha_Orcamentaria", bdi: "BDI", memoria: "Memoria_de_Calculo", crono: "Cronograma_Fisico_Financeiro", ple: "PLE", memorial: "Memorial_Descritivo", tudo: "Proposta_Completa" }[tipo];
      await baixar(`${base}_${slug(o.nome).replace(/-/g, "_")}.${pdf ? "pdf" : "docx"}`, arq);
    } catch (e) { if (!(e && e.code === "declined")) state.error = `Não foi possível gerar o ${pdf ? "PDF" : "arquivo Word"} agora. Verifique a internet e tente de novo.`; }
    state.busy = ""; render();
  }
  async function baixar(nome, arq) {
    if (state.downloads) await state.downloads.save({ filename: nome, data: arq });
    else { const u = URL.createObjectURL(arq); const a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    state.info = `Arquivo gerado: ${nome}.`;
  }

  /* ----- Excel simples e arquivo de origem para a Múltipla (macro "Importar de outra Planilha Múltipla") ----- */
  async function gerarExcelOrc() {
    const o = curObra(), c = orcCalc(o); state.busy = "orc-xlsx"; state.error = ""; render();
    try {
      const X = await sheetLib(), linhas = [["PLANILHA ORÇAMENTÁRIA"], ["Obra", o.nome], ["Referência", `SINAPI-GO ${mesTxt(orcMes(c.orc))} ${c.orc.desonerado ? "desonerado" : "não desonerado"}`], ["BDI", c.bdi], [],
        ["Item", "Nível", "Fonte", "Código", "Descrição", "Unidade", "Memória de cálculo", "Quantidade", "Custo unitário", "Preço com BDI", "Total"]];
      c.linhas.forEach(l => linhas.push(l.x.nivel === "servico" ? [l.num, "Serviço", l.x.fonte, l.x.codigo, l.x.descricao, l.x.unidade, l.x.memoria || "", l.qtd, l.custo, l.preco, l.total] : [l.num, NIVEL_TXT[l.x.nivel], "", "", l.x.descricao, "", "", "", "", "", l.total]));
      linhas.push([], ["", "", "", "", "Total sem BDI", "", "", "", "", "", c.sem], ["", "", "", "", "Total com BDI", "", "", "", "", "", c.com]);
      const ws = X.utils.aoa_to_sheet(linhas); ws["!cols"] = [8, 9, 9, 9, 60, 8, 22, 11, 13, 13, 14].map(wch => ({ wch }));
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Orçamento");
      const cr = cronoOrc(c);
      if (cr.linhas.length) {
        const cl = [["Item", "Etapa", "Valor", ...cr.meses.map(mesTxt)], ...cr.linhas.map(l => [l.g.num, l.g.x.descricao, l.g.total, ...l.v]), ["", "Total no mês", c.com, ...cr.tot], ["", "Acumulado", "", ...cr.acum]];
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(cl), "Cronograma");
      }
      const out = X.write(wb, { bookType: "xlsx", type: "array" });
      await baixar(`Orcamento_${slug(o.nome).replace(/-/g, "_")}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    } catch (e) { if (!(e && e.code === "declined")) state.error = "Não foi possível gerar a planilha agora. Verifique a internet e tente de novo."; }
    state.busy = ""; render();
  }
  const colNum = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  function pmResolve(texto) {
    const t = texto.replace(/^=/, "").trim(), REF = /^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/;
    const cel = s => { const m = s.trim().match(REF); if (!m) throw 0; return [m[1], colNum(m[2]), Number(m[3])]; };
    const off = s => { const m = s.trim().match(/^OFFSET\((.+),(-?\d+),(-?\d+)\)$/); if (!m) return cel(s); const [sh, c, r] = cel(m[1]); return [sh, c + Number(m[3]), r + Number(m[2])]; };
    let m = t.match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
    if (m) return [m[1], colNum(m[2]), Number(m[3]), colNum(m[4]), Number(m[5])];
    const partes = t.split(/:(?=OFFSET|'?[^!:]+!)/);
    try { if (partes.length === 2) { const a = off(partes[0]), b = off(partes[1]); return [a[0], a[1], a[2], b[1], b[2]]; } const a = off(t); return [a[0], a[1], a[2], a[1], a[2]]; }
    catch (e) { return null; }
  }
  const serialExcel = iso => { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d || 1) - Date.UTC(1899, 11, 30)) / 86400000; };
  async function gerarMultipla() {
    const o = curObra(), c = orcCalc(o), avisos = orcAvisos(c).filter(a => !a.startsWith("BDI"));
    if (avisos.length) { state.error = "Corrija a planilha antes de gerar o arquivo da Múltipla: " + avisos.slice(0, 3).join(" ") + (avisos.length > 3 ? " …" : ""); return render(); }
    state.busy = "orc-pm"; state.error = ""; render();
    try {
      const X = await sheetLib(), r = await fetch("dados/multipla/pm316_names.json"); if (!r.ok) throw new Error("modelo");
      const T = await r.json(), FIRST = 15, n = c.linhas.length, ultima = FIRST + n + 1;
      const wb = X.utils.book_new(), sheets = {};
      T.sheets.forEach(nome => { sheets[nome] = {}; X.utils.book_append_sheet(wb, sheets[nome], nome); });
      const nomes = {}; wb.Workbook = wb.Workbook || {}; wb.Workbook.Names = [];
      for (const [nome, txt0] of Object.entries(T.names)) {
        if (nome.startsWith("_xlnm")) continue;
        const txt = txt0.replace(/((?:ORÇAMENTO|CÁLCULO)!\$[A-Z]+\$)22\b/g, `$1${ultima}`).replace(/((?:ORÇAMENTO|CÁLCULO)!\$)22:\$22\b/g, `$1${ultima}:$${ultima}`);
        nomes[nome] = txt; wb.Workbook.Names.push({ Name: nome, Ref: txt });
      }
      const set = (sh, col, row, v) => {
        if (v === null || v === undefined || v === "") return;
        const ref = X.utils.encode_cell({ c: col - 1, r: row - 1 }), ws = sheets[sh];
        ws[ref] = typeof v === "object" ? v : typeof v === "number" ? { t: "n", v } : typeof v === "boolean" ? { t: "b", v } : { t: "s", v: String(v) };
      };
      const put = (nome, valores) => { const rg = pmResolve(nomes[nome]); if (!rg) throw new Error("nome " + nome); const [sh, c1, r1] = rg; valores.forEach((lin, i) => lin.forEach((v, j) => set(sh, c1 + j, r1 + i, v))); };
      const orc = c.orc, p = orc.proposta, b = orc.bdi;
      set("MENU", 10, 1, "PM"); set("MENU", 10, 2, T.versao); set("MENU", 15, 3, 1); set("MENU", 15, 4, 1);
      set("CRONO", 8, 10, 2); set("CÁLCULO", 11, 12, "Nº AGRUPADOR DE EVENTOS"); set("ORÇAMENTO", 13, FIRST, "LOTE"); set("ORÇAMENTO", 1, ultima, -1);
      const data = iso => ({ t: "n", v: serialExcel(iso), z: "dd/mm/yyyy" });
      const dados = { "import.recurso": /fgts/i.test(o.fonte || "") ? "FGTS" : "OGU", "Import.Proponente": p.proponente, "Import.Município": p.municipio, "Import.CR": (o.caixa || {}).operacao,
        "Import.Apelido": o.nome, "Import.DescLote": o.objeto || o.nome, "Import.Desoneracao": orc.desonerado ? "DESONERADO" : "NÃO DESONERADO",
        "Import.DataBase": data((orc.dataBase || (sinapi.indice && sinapi.indice.bases[0].mes) || ym(hojeISO())) + "-01"), "Import.DataPreenchimento": data(hojeISO()),
        "Import.TipoArredondamento": "TransfereGOV", "Import.RegimeExecução": "(SELECIONAR)" };
      for (const [nome, v] of Object.entries(dados)) if (nomes[nome]) put(nome, [[v]]);
      put("Import.RespOrçamento", [[p.responsavel], [p.registro], [p.art]]);
      put("IMport.Prefeito", [[p.prefeito], [p.cargoPrefeito]]);
      put("Import.BDI.Tipo1", [[b.tipo]]);
      const fr = v => Number(((Number(v) || 0) / 100).toFixed(6));
      put("Import.BDI.Det1", ["AC", "SG", "R", "DF", "L", "CP"].map(k => [fr(b[k])]));
      put("Import.BDI.ISS", [[fr(b.ISSbase)], [fr(b.ISS)]]);
      put("Import.BDI.Tipo2", [["(SELECIONAR)"]]); put("Import.BDI.Tipo3", [["(SELECIONAR)"]]);
      const NIV = { meta: "Meta", etapa: "Nível 2", servico: "Serviço" };
      const col = (nome, f) => put(nome, c.linhas.map(l => [f(l)]));
      col("Import.Nível", l => NIV[l.x.nivel]);
      col("Import.Fonte", l => l.x.nivel === "servico" ? l.x.fonte : null);
      col("Import.Código", l => l.x.nivel === "servico" ? String(l.x.codigo) : null);
      col("Import.Descrição", l => l.x.descricao);
      col("Import.Unidade", l => l.x.nivel === "servico" ? l.x.unidade : null);
      col("Import.OpcaoBDI", () => "BDI 1");
      col("Import.ORÇAMENTO.DivRecurso", () => "RA");
      col("Import.PLQ.MemCalc", l => l.x.nivel === "servico" ? (String(l.x.memoria || "").trim() || null) : null);
      put("Import.PLQ", c.linhas.map(l => [l.x.nivel === "servico" ? l.qtd : null]));
      put("Import.FrenteDeObra", [[1]]);
      c.linhas.forEach((l, i) => { if (l.x.nivel !== "servico") return; const row = FIRST + 1 + i; set("ORÇAMENTO", 33, row, l.custo); set("ORÇAMENTO", 21, row, { t: "n", v: l.custo, f: `AG${row}` }); });
      put("Import.QCI.Divisao", Array.from({ length: 10 }, () => ["Proporcional"]));
      put("Import.Eventos.Nível", [["Automática, conforme os agrupadores Nível 2 do Orçamento"]]);
      put("Import.POArred", Array.from({ length: 5 }, () => [true]));
      put("Import.BMArred", [[true]]);
      Object.values(sheets).forEach(ws => { const ks = Object.keys(ws).filter(k => k[0] !== "!"); ws["!ref"] = ks.length ? X.utils.encode_range(ks.map(k => X.utils.decode_cell(k)).reduce((a, d) => ({ s: { r: Math.min(a.s.r, d.r), c: Math.min(a.s.c, d.c) }, e: { r: Math.max(a.e.r, d.r), c: Math.max(a.e.c, d.c) } }), { s: { r: 1e6, c: 1e6 }, e: { r: 0, c: 0 } })) : "A1"; });
      const out = X.write(wb, { bookType: "xlsx", type: "array" });
      await baixar(`IMPORTAR_Multipla_${slug(o.nome).replace(/-/g, "_")}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      state.info += " Abra a Múltipla v3.16 em branco e use Importar de outra Planilha Múltipla com este arquivo.";
    } catch (e) { if (!(e && e.code === "declined")) state.error = "Não foi possível gerar o arquivo da Múltipla agora. Verifique a internet e tente de novo."; }
    state.busy = ""; render();
  }

  async function memorialComClaude() {
    const o = curObra(), c = orcCalc(o); if (!state.sample || !c.grupos.length) return;
    state.busy = "orc-mem"; state.error = state.info = ""; render();
    try {
      const ctx = { obra: o.nome, objeto: o.objeto, tipo: o.tipoObra, local: o.endereco, etapas: c.grupos.map(g => ({ id: g.x.id, etapa: g.x.descricao, servicos: c.servs.filter(l => l.grupo === g.x).map(l => `${l.x.descricao} – ${num2(l.qtd)} ${l.x.unidade}`) })) };
      const res = await state.sample.json(`Você é engenheiro civil e escreve o memorial descritivo de uma obra pública municipal para a Caixa. Escreva em português formal e técnico, só com base nos serviços listados: descreva como cada etapa será executada, materiais e cuidados, sem inventar quantidades, marcas ou serviços que não estão na lista.
Dados: ${JSON.stringify(ctx)}
Responda só com JSON: {"_geral": "considerações gerais em 1 ou 2 parágrafos", "<id da etapa>": "texto da etapa em 1 a 3 parágrafos", ...} usando os ids recebidos.`);
      const r = res && typeof res === "object" ? res : {}, memorial = { ...orcDe(o).memorial };
      let n = 0; for (const [k, v] of Object.entries(r)) if (typeof v === "string" && (k === "_geral" || c.grupos.some(g => g.x.id === k))) { memorial[k] = v.trim(); n++; }
      if (!n) throw new Error("vazio");
      await salvarOrc(o, { memorial }); state.info = "Memorial escrito pelo Claude. Confira e ajuste o texto de cada etapa.";
    } catch (e) { state.error = e && e.message === "vazio" ? "O Claude não devolveu o texto. Tente de novo." : sampleErro(e); }
    state.busy = ""; render();
  }

  async function orcClick(t, o) {
    const a = t.dataset.act;
    if (t.dataset.orcFonte) { state.orcBusca.fonte = t.dataset.orcFonte; app.querySelectorAll("[data-orc-fonte]").forEach(b => b.setAttribute("aria-pressed", b === t)); orcBuscarAgora(); return true; }
    if (t.dataset.orcAlvo) { state.orcAlvo = state.orcAlvo === t.dataset.orcAlvo ? null : t.dataset.orcAlvo; render(); return true; }
    if (a === "orc-alvo-fim") { state.orcAlvo = null; render(); return true; }
    if (t.dataset.orcDoc) { await gerarDocOrc(t.dataset.orcDoc, t.dataset.formato); return true; }
    if (a === "orc-excel") { await gerarExcelOrc(); return true; }
    if (a === "orc-multipla") { await gerarMultipla(); return true; }
    if (a === "orc-memorial-claude") { await memorialComClaude(); return true; }
    if (!t.dataset.orcAdd && !t.dataset.orcMover && !t.dataset.orcDel && !/^orc-/.test(a || "")) return false;
    try {
      if (t.dataset.orcAdd) {
        const base = await orcBaseAtual(o), it = base.mapa.get(t.dataset.orcAdd); if (!it) return true;
        await orcInserir(o, { id: uid(), nivel: "servico", fonte: it[0] ? "SINAPI-I" : "SINAPI", codigo: String(it[1]), descricao: it[2], unidade: it[3], custo: precoBase(it, orcDe(o)), memoria: "", qtd: "" });
        state.info = `Adicionado: ${it[2].slice(0, 80)}${it[2].length > 80 ? "…" : ""}. Lance a memória de cálculo ou a quantidade.`;
      }
      else if (a === "orc-meta") await orcInserir(o, { id: uid(), nivel: "meta", descricao: "NOVA META" });
      else if (a === "orc-etapa") await orcInserir(o, { id: uid(), nivel: "etapa", descricao: "NOVA ETAPA" });
      else if (a === "orc-proprio") await orcInserir(o, { id: uid(), nivel: "servico", fonte: "Cotação", codigo: "COT-" + (orcItens(o).filter(x => x.fonte === "Cotação").length + 1), descricao: "DESCREVA O ITEM", unidade: "UN", custo: "", memoria: "", qtd: "" });
      else if (t.dataset.orcMover) {
        const itens = [...orcItens(o)], i = itens.findIndex(x => x.id === t.dataset.orcMover), j = i + Number(t.dataset.dir);
        if (i < 0 || j < 0 || j >= itens.length) return true;
        [itens[i], itens[j]] = [itens[j], itens[i]]; await salvarOrc(o, { itens });
      }
      else if (t.dataset.orcDel) {
        const itens = orcItens(o), i = itens.findIndex(x => x.id === t.dataset.orcDel); if (i < 0) return true;
        const fim = itens[i].nivel === "servico" ? i + 1 : posInsercao(itens, itens[i].id);
        state.confirm = ""; await salvarOrc(o, { itens: [...itens.slice(0, i), ...itens.slice(fim)] }); state.info = "Excluído.";
      }
      else if (a === "orc-bdi-medio") { const orc = orcDe(o), m = BDI_TIPOS[orc.bdi.tipo]; if (m) await salvarOrc(o, { bdi: { ...orc.bdi, AC: m.AC[1], SG: m.SG[1], R: m.R[1], DF: m.DF[1], L: m.L[1] } }); }
      else if (a === "orc-reprecificar") {
        state.busy = "orc-rep"; render();
        const orc = orcDe(o), base = await orcBaseAtual(o); let n = 0, falta = 0;
        const itens = orc.itens.map(x => { if (x.nivel !== "servico" || !/^SINAPI/.test(x.fonte)) return x; const it = base.mapa.get(`${x.fonte} ${x.codigo}`); if (!it) { falta++; return x; } n++; return { ...x, custo: precoBase(it, orc), descricao: it[2], unidade: it[3] }; });
        await salvarOrc(o, { itens, dataBase: orc.dataBase || base.mes });
        state.info = `${n} preço(s) atualizado(s) para SINAPI-GO ${mesTxt(base.mes)}.` + (falta ? ` ${falta} código(s) não existem nesta base; confira esses itens.` : "");
        state.busy = "";
      }
      else if (a === "orc-crono-igual" || a === "orc-crono-obra") {
        const orc = orcDe(o), c = orcCalc(o), cr = { ...orc.crono };
        if (a === "orc-crono-obra") { const ini = ym(o.dataInicio), fim = ym(prazoAtual(o)); let n = 0; for (let k = ini; k <= fim && n < 60; k = addMes(k, 1)) n++; cr.inicio = ini; cr.meses = Math.max(1, n); }
        const n = Math.max(1, Math.min(60, Number(cr.meses) || 1)), parte = Math.floor(10000 / n) / 100;
        cr.dist = Object.fromEntries(c.grupos.map(g => [g.x.id, Array.from({ length: n }, (_, i) => i === n - 1 ? Math.round((100 - parte * (n - 1)) * 100) / 100 : parte)]));
        await salvarOrc(o, { crono: cr }); state.info = "Distribuí cada etapa igualmente nos meses. Ajuste conforme a sequência real da obra.";
      }
      else if (a === "orc-usar") {
        const c = orcCalc(o), cr = cronoOrc(c), antigos = o.servicos || [];
        const servicos = c.grupos.map(g => { const ant = antigos.find(s => s.orcId === g.x.id || s.etapa === g.x.descricao); return { id: ant?.id || uid(), orcId: g.x.id, etapa: g.x.descricao, valor: g.total, percentual: ant?.percentual || 0, obs: ant?.obs || "" }; });
        const outros = antigos.filter(s => !servicos.some(n => n.id === s.id));
        const mud = { servicos: [...servicos, ...outros], caixa: { ...(o.caixa || {}), valorPO: c.com, bdi: Math.round(c.bdi * 10000) / 100, dataBase: c.orc.dataBase || "", desonerado: c.orc.desonerado ? "sim" : "nao", referencia: "SINAPI-GO" } };
        if (cr.tot.some(v => v)) mud.cronograma = cr.meses.map((m, i) => ({ mes: m, previsto: cr.tot[i] })).filter(x => x.previsto);
        await patch(o, mud);
        state.info = `Pronto: ${servicos.length} etapa(s) na aba Serviços${mud.cronograma ? ", cronograma mensal na aba Cronograma" : ""} e valor da PO de ${brl(c.com)} nos dados Caixa.`;
      }
      else return false;
    } catch (e) { state.busy = ""; state.error = erroTxt(e, "salvar o orçamento"); }
    render(); return true;
  }
  async function orcChange(el, o) {
    try {
      if (el.dataset.orcItem) {
        const k = el.dataset.k, itens = orcItens(o).map(x => x.id === el.dataset.orcItem ? { ...x, [k]: (k === "custo" || k === "qtd") ? (isNum(el.value) ? Number(el.value) : "") : el.value } : x);
        await salvarOrc(o, { itens }); render(); return true;
      }
      if (el.dataset.orcCampo) {
        const [a, b] = el.dataset.orcCampo.split("."), orc = orcDe(o);
        let v = el.value;
        if (a === "desonerado") v = v === "sim";
        if (a === "bdi" && b !== "tipo") v = isNum(v) ? Number(v) : 0;
        if (a === "crono" && b === "meses") v = Math.max(1, Math.min(60, Number(v) || 1));
        await salvarOrc(o, b ? { [a]: { ...orc[a], [b]: v } } : { [a]: v });
        if (a === "dataBase" || a === "desonerado") state.info = "Para trazer os preços desta base, clique em Atualizar preços SINAPI.";
        render(); return true;
      }
      if (el.dataset.orcCrono) {
        const orc = orcDe(o), dist = { ...(orc.crono.dist || {}) }, arr = [...(dist[el.dataset.orcCrono] || [])];
        arr[Number(el.dataset.i)] = isNum(el.value) ? Number(el.value) : 0; for (let i = 0; i < arr.length; i++) arr[i] = arr[i] || 0;
        dist[el.dataset.orcCrono] = arr; await salvarOrc(o, { crono: { ...orc.crono, dist } }); render(); return true;
      }
      if (el.dataset.orcMemorial) {
        await salvarOrc(o, { memorial: { ...orcDe(o).memorial, [el.dataset.orcMemorial]: el.value } }); return true;
      }
    } catch (e) { state.error = erroTxt(e, "salvar o orçamento"); render(); return true; }
    return false;
  }

  /* ---------- Eventos ---------- */
  app.addEventListener("click", async ev => {
    const t = ev.target.closest("button"); if (!t || t.disabled) return;
    if (t.type === "submit" && t.form) return;
    const o = curObra();
    if (t.dataset.impdel) { state.impFiles.splice(Number(t.dataset.impdel), 1); return render(); }
    if (t.dataset.ver) return abrirPreview(t.dataset.ver, t.dataset.nome);
    if (t.dataset.aba) { state.preview.sheet = Number(t.dataset.aba); return render(); }
    if (t.dataset.filtro) { state.filtro = t.dataset.filtro; return render(); }
    if (t.dataset.area) { state.area = t.dataset.area; state.filtro = "todas"; state.busca = ""; return go("lista"); }
    if (t.dataset.abrir) { try { history.replaceState(null, "", "#" + t.dataset.abrir); } catch (e) {} state.tab = "resumo"; state.med = null; state.doc = null; state.cron = null; state.reg = null; state.preview = null; state.and = null; return go(t.dataset.abrir); }
    if (t.dataset.alerta) { try { history.replaceState(null, "", "#" + t.dataset.alerta); } catch (e) {} state.tab = t.dataset.alertaTab || "resumo"; state.med = null; state.doc = null; state.cron = null; state.reg = null; state.preview = null; state.and = null; return go(t.dataset.alerta); }
    if (t.dataset.tab) { state.preview = null; state.reg = null; state.tab = t.dataset.tab; state.error = state.info = state.warn = ""; state.confirm = ""; return render(); }
    if (o && state.tab === "orcamento" && await orcClick(t, o)) return;
    if (t.dataset.add) { state.draft[t.dataset.add] = [...(state.draft[t.dataset.add] || []), { ...LISTAS[t.dataset.add].novo }]; return render(); }
    if (t.dataset.rem) { state.draft[t.dataset.rem].splice(Number(t.dataset.i), 1); return render(); }
    if (t.dataset.descrever) {
      const f = (o.fotos || []).find(x => x.id === t.dataset.descrever); if (!f) return;
      state.busy = "desc:" + f.id; state.error = state.warn = ""; render();
      try {
        const res = await fetch(blob(f.id)); if (!res.ok) throw new Error("foto");
        const arq = new File([await res.blob()], f.nome || "foto.jpg", { type: f.tipo || "image/jpeg" });
        const { feitas, erro } = await legendarFotos([{ id: f.id, data: f.data, arquivo: arq, trocar: true }]);
        state.info = feitas ? "Legenda escrita pelo Claude. Confira e corrija se precisar." : "";
        if (!feitas) state.error = erro ? sampleErro(erro) : "Não consegui descrever esta foto.";
      } catch (e) { state.info = ""; state.error = "Não consegui abrir esta foto para descrever."; }
      state.busy = ""; return render();
    }
    if (t.dataset.regNew) { state.reg = { lista: t.dataset.regNew, item: REG[t.dataset.regNew].novo() }; state.error = state.info = state.warn = ""; render(); window.scrollTo(0, app.querySelector(".panel")?.offsetTop - 70 || 0); return; }
    if (t.dataset.regEdit) {
      const [lista, id] = t.dataset.regEdit.split(/:(.*)/s), x = (o[lista] || []).find(y => y.id === id); if (!x) return;
      state.reg = { lista, item: JSON.parse(JSON.stringify({ ...REG[lista].novo(), ...x })) }; NUMS.forEach(k => { if (state.reg.item[k] === null) state.reg.item[k] = ""; });
      state.error = state.info = state.warn = ""; render(); window.scrollTo(0, app.querySelector(".panel")?.offsetTop - 70 || 0); return;
    }
    if (t.dataset.recTodos) { state.todosRecursos = true; return render(); }
    if (t.dataset.recCriar) {
      const x = (state.recursos?.itens || []).find(y => y.id === t.dataset.recCriar); if (!x || !canWrite()) return;
      const nome = frase(x.titulo), instr = x.tipo === "convenio" && x.numero ? `${frase(x.instrumento) || "Convênio"} nº ${x.numero}` : x.tipo === "obra" && x.numero ? `Obrasgov ${x.numero}` : "";
      state.impFiles = []; state.editId = null;
      state.draft = { area: "prefeitura", situacao: "nao_iniciada", nome: nome.length > 90 ? nome.slice(0, 87).replace(/\s+\S*$/, "") + "…" : nome, objeto: frase(x.descricao) || nome,
        municipio: "Edealina - GO", fonte: [x.orgao, instr].filter(Boolean).join(" · ") || x.fonte || "", caixa: { operacao: x.tipo === "convenio" ? x.numero || "" : "" },
        pendencias: [], vistorias: [], aditivos: [], relatorios: [] };
      go("editar"); state.info = "Ficha preenchida com os dados do repasse. Complete contrato, empresa, valor e prazo e salve."; return render();
    }
    if (t.dataset.ask) { state.confirm = t.dataset.ask; return render(); }
    if (t.dataset.no) { state.confirm = ""; return render(); }
    if (t.dataset.unpend) { (t.dataset.unpend === "med" ? state.medFiles : state.docFiles).splice(Number(t.dataset.i), 1); return render(); }
    if (t.dataset.unarq) { state.med.arquivos.splice(Number(t.dataset.unarq), 1); return render(); }
    if (t.dataset.cronRem) { state.cron.linhas.splice(Number(t.dataset.cronRem), 1); return render(); }
    if (t.dataset.medEdit) { const m = (o.medicoes || []).find(x => x.id === t.dataset.medEdit); state.med = JSON.parse(JSON.stringify(m)); state.med.arquivos = state.med.arquivos || []; state.medFiles = []; state.error = state.info = state.warn = ""; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.yes) {
      const [tipo, id] = t.dataset.yes.split(/:(.*)/s); state.confirm = "";
      try {
        if (tipo === "obra") { if (state.draft) state.area = areaDe(state.draft); await state.db.collection("obras").doc(id).delete(); state.draft = null; state.editId = null; go("lista"); state.info = "Obra excluída."; return render(); }
        if (tipo === "med") await patch(o, { medicoes: (o.medicoes || []).filter(x => x.id !== id) });
        if (tipo === "reg") { const [lista, rid] = id.split(/:(.*)/s); if (REG[lista]) await patch(o, { [lista]: (o[lista] || []).filter(x => x.id !== rid) }); }
        if (tipo === "doc") { const d = (o.documentos || []).find(x => x.id === id); await patch(o, { documentos: (o.documentos || []).filter(x => x.id !== id) }); for (const f of (d?.arquivos || [])) await state.assets?.delete(f.id).catch(() => {}); }
        if (tipo === "foto") { await patch(o, { fotos: (o.fotos || []).filter(x => x.id !== id) }); await state.assets?.delete(id).catch(() => {}); }
        state.info = "Excluído.";
      } catch (e) { state.error = erroTxt(e, "excluir"); }
      return render();
    }
    if (t.dataset.andSit) { andDraft(o).situacao = t.dataset.andSit; return render(); }
    if (t.dataset.andStep) { const d = andDraft(o); d.percentual = Math.max(0, Math.min(100, (Number(d.percentual) || 0) + Number(t.dataset.andStep))); return render(); }
    const a = t.dataset.act;
    if (t.dataset.rel) { if (t.dataset.dia) state.relData = t.dataset.dia; return gerarRelatorio(t.dataset.rel, t.dataset.formato); }
    if (a === "and-save") {
      const d = andDraft(o), p = Math.max(0, Math.min(100, Math.round((Number(d.percentual) || 0) * 10) / 10));
      if (!d.situacao) { state.error = "Escolha a situação da obra."; return render(); }
      const mud = { situacao: d.situacao, percentual: p, observacoes: d.obs };
      if (d.vistoria) mud.vistorias = [...(o.vistorias || []), { data: hojeISO(), situacao: d.situacao, percentual: p, obs: d.obs }];
      state.busy = "and"; state.error = state.info = ""; render();
      try { await patch(o, mud); state.and = null; state.info = d.vistoria ? "Situação salva e vistoria de hoje registrada." : "Situação salva."; }
      catch (e) { state.error = erroTxt(e, "salvar a situação"); }
      state.busy = ""; return render();
    }
    if (a === "alertas-todos") { state.todosAlertas = true; return render(); }
    // Diário, serviços, notificações e prazos
    if (a === "dia-auto") return diarioAutomatico();
    if (a === "dia-claude") return diarioComClaude();
    if (a === "reg-cancel") { state.reg = null; state.error = ""; return render(); }
    if (a === "reg-save") {
      const { lista, item } = state.reg, reg = { ...item };
      const falta = { diario: !reg.data && "Informe a data do dia.", servicos: !String(reg.etapa || "").trim() && "Informe o nome do serviço.",
        notificacoes: !String(reg.assunto || "").trim() && "Informe o assunto da notificação.", prazos: !reg.vencimento && "Informe a data de vencimento." }[lista];
      if (falta) { state.error = falta; return render(); }
      NUMS.forEach(k => { if (k in reg) reg[k] = isNum(reg[k]) ? Number(reg[k]) : null; });
      if (lista === "servicos") reg.percentual = Math.max(0, Math.min(100, reg.percentual || 0));
      reg.id = reg.id || uid();
      const atual = o[lista] || [], existe = atual.some(x => x.id === reg.id);
      state.busy = "reg"; state.error = ""; render();
      try { await patch(o, { [lista]: existe ? atual.map(x => x.id === reg.id ? reg : x) : [...atual, reg] }); state.reg = null; state.info = "Salvo."; }
      catch (e) { state.error = erroTxt(e, "salvar"); }
      state.busy = ""; return render();
    }
    if (a === "serv-padrao") {
      try { await patch(o, { servicos: ETAPAS_PADRAO.map(etapa => ({ id: uid(), etapa, valor: null, percentual: 0, obs: "" })) }); state.info = "Etapas padrão lançadas. Edite cada uma para pôr o valor da planilha, e apague as que não existem nesta obra."; }
      catch (e) { state.error = erroTxt(e, "lançar as etapas"); }
      return render();
    }
    if (a === "serv-aplicar") {
      const f = fisicoServicos(o); if (!f) return;
      try { await patch(o, { percentual: f.pct }); state.and = null; state.info = `% executado da obra atualizado para ${pctTxt(f.pct)}.`; }
      catch (e) { state.error = erroTxt(e, "atualizar o % executado"); }
      return render();
    }
    if (a === "prev-fechar") { state.preview = null; return render(); }
    if (a === "prev-baixar") return baixarOriginal();
    if (a === "voltar") { if (o) state.area = areaDe(o); try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return go("lista"); }
    if (a === "inicio") { state.area = null; return go("inicio"); }
    if (a === "imp-ler") return lerLicitacao();
    if (a === "nova") { state.impFiles = []; state.editId = null; state.draft = { area: state.area || "prefeitura", situacao: "andamento", caixa: {}, pendencias: [], vistorias: [], aditivos: [], relatorios: [] }; return go("editar"); }
    if (a === "editar") { state.impFiles = []; state.editId = o.id; state.draft = limpo(o); state.draft.coordenadas = coordTxt(o); return go("editar"); }
    if (a === "cancelar") { state.impFiles = []; const back = state.editId || "lista"; if (state.draft) state.area = areaDe(state.draft); state.draft = null; state.editId = null; return go(back); }
    // Documentos
    if (a === "doc-new") { state.doc = { categoria: CATS[0], titulo: "", data: "" }; state.docFiles = []; return render(); }
    if (a === "doc-cancel") { state.doc = null; state.docFiles = []; state.error = ""; return render(); }
    if (a === "doc-save") {
      if (!state.docFiles.length) { state.error = "Escolha pelo menos um arquivo."; return render(); }
      state.busy = "doc"; state.error = ""; render();
      try {
        const arquivos = []; for (const f of state.docFiles) arquivos.push(await subir(f));
        const novo = { id: uid(), categoria: state.doc.categoria, titulo: state.doc.titulo || state.docFiles[0].name.replace(/\.[^.]+$/, ""), data: state.doc.data || "", arquivos, enviadoEm: new Date().toISOString() };
        await patch(curObra(), { documentos: [...(curObra().documentos || []), novo] });
        state.doc = null; state.docFiles = []; state.info = "Documento salvo.";
      } catch (e) { state.error = erroTxt(e, "enviar o arquivo"); }
      state.busy = ""; return render();
    }
    // Medições
    if (a === "med-new") { const prox = Math.max(0, ...(o.medicoes || []).map(m => parseInt(m.numero) || 0)) + 1; state.med = { numero: String(prox), data: hojeISO(), periodoIni: "", periodoFim: "", valor: "", obs: "", arquivos: [] }; state.medFiles = []; state.error = state.info = state.warn = ""; return render(); }
    if (a === "med-cancel") { state.med = null; state.medFiles = []; state.error = state.info = state.warn = ""; return render(); }
    if (a === "med-ler") return lerMedicao();
    if (a === "med-save") {
      const m = state.med;
      if (!isNum(m.valor)) { state.error = "Informe o valor desta medição."; return render(); }
      if (state.medFiles.length && !state.assets) { state.error = "O envio de arquivos só funciona para quem pode editar este site. Tire os anexos ou salve sem eles."; return render(); }
      state.busy = "med"; state.error = ""; render();
      try {
        const novos = []; for (const f of state.medFiles) novos.push(await subir(f));
        const arquivos = [...(m.arquivos || []), ...novos];
        const reg = { id: m.id || uid(), numero: m.numero || "", data: m.data || "", periodoIni: m.periodoIni || "", periodoFim: m.periodoFim || "", valor: Number(m.valor), obs: m.obs || "", arquivos,
          origem: arquivos.some(f => f.tipo === "application/pdf") ? "pdf" : arquivos.length ? "foto" : "manual" };
        const atual = curObra().medicoes || [];
        await patch(curObra(), { medicoes: m.id ? atual.map(x => x.id === m.id ? reg : x) : [...atual, reg] });
        state.med = null; state.medFiles = []; state.warn = ""; state.info = "Medição salva.";
      } catch (e) { state.error = erroTxt(e, "salvar a medição"); }
      state.busy = ""; return render();
    }
    // Cronograma
    if (a === "cron-edit") { state.cron = { linhas: (o.cronograma || []).map(c => ({ mes: c.mes, previsto: c.previsto })) }; if (!state.cron.linhas.length) state.cron.linhas.push({ mes: ym(o.dataInicio) || ym(hojeISO()), previsto: "" }); state.error = state.info = ""; return render(); }
    if (a === "cron-cancel") { state.cron = null; state.error = state.info = ""; return render(); }
    if (a === "cron-add") { const ult = state.cron.linhas[state.cron.linhas.length - 1]; state.cron.linhas.push({ mes: ult?.mes ? addMes(ult.mes, 1) : ym(o.dataInicio) || ym(hojeISO()), previsto: "" }); return render(); }
    if (a === "cron-gerar") {
      const ini = ym(o.dataInicio), fim = ym(prazoAtual(o));
      if (!ini || !fim || fim < ini) { state.error = "Informe a data de início e o prazo da obra em Editar dados para gerar os meses."; return render(); }
      const meses = []; for (let k = ini; k <= fim && meses.length < 120; k = addMes(k, 1)) meses.push(k);
      const ant = Object.fromEntries(state.cron.linhas.filter(l => l.mes).map(l => [l.mes, l.previsto]));
      const vt = valorTotal(o); const igual = vt ? (vt / meses.length).toFixed(2) : "";
      const temAnt = Object.values(ant).some(v => isNum(v));
      state.cron.linhas = meses.map(k => ({ mes: k, previsto: temAnt ? (ant[k] ?? "") : igual }));
      state.info = temAnt ? `Gerei ${meses.length} meses mantendo os valores já lançados.` : `Gerei ${meses.length} meses com o valor dividido igualmente. Ajuste conforme o cronograma aprovado.`;
      return render();
    }
    if (a === "cron-save") {
      const linhas = state.cron.linhas.filter(l => l.mes && isNum(l.previsto)).map(l => ({ mes: l.mes, previsto: Number(l.previsto) }));
      state.busy = "cron"; render();
      try { await patch(o, { cronograma: linhas }); state.cron = null; state.info = "Cronograma salvo."; }
      catch (e) { state.error = erroTxt(e, "salvar o cronograma"); }
      state.busy = ""; return render();
    }
  });

  app.addEventListener("input", ev => {
    const el = ev.target;
    if (el.id === "busca") { state.busca = el.value; state._focusBusca = true; return renderLista(); }
    if (el.id === "orc-q") { state.orcBusca.q = el.value; orcBuscarAgora(); return; }
    if (el.dataset.orcItem || el.dataset.orcCampo || el.dataset.orcCrono || el.dataset.orcMemorial) return;
    if (el.dataset.andPct) {
      const d = andDraft(curObra()); d.percentual = el.value;
      const outro = document.getElementById(el.id === "and-range" ? "and-num" : "and-range"); if (outro) outro.value = el.value;
      return;
    }
    if (el.dataset.andObs) { andDraft(curObra()).obs = el.value; return; }
    if (el.dataset.andVist) { andDraft(curObra()).vistoria = el.checked; return; }
    if (el.dataset.bind) { const [obj, k] = el.dataset.bind.split("."); if (k) { if (state[obj]) state[obj][k] = el.value; } else state[obj] = el.value; return; }
    if (el.dataset.reg && state.reg) { state.reg.item[el.dataset.reg] = el.value; return; }
    if (el.dataset.servPct) return;
    if (el.dataset.cron !== undefined) { state.cron.linhas[Number(el.dataset.cron)][el.dataset.k] = el.value; return; }
    if (!state.draft) return;
    const val = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.l) state.draft[el.dataset.l][Number(el.dataset.i)][el.dataset.k] = val;
    else if (el.dataset.cx) state.draft.caixa[el.dataset.cx] = val;
    else if (el.dataset.k) state.draft[el.dataset.k] = val;
  });

  app.addEventListener("change", async ev => {
    const el = ev.target; const o = curObra();
    if (o && (el.dataset.orcItem || el.dataset.orcCampo || el.dataset.orcCrono || el.dataset.orcMemorial)) { await orcChange(el, o); return; }
    if (el.dataset.andVist) { andDraft(o).vistoria = el.checked; return; }
    if (el.dataset.andPct || el.dataset.andObs) return;
    if (el.dataset.bind) { const [obj, k] = el.dataset.bind.split("."); if (k) { if (state[obj]) state[obj][k] = el.value; } else state[obj] = el.value; return; }
    if (el.dataset.cron !== undefined) { state.cron.linhas[Number(el.dataset.cron)][el.dataset.k] = el.value; return render(); }
    if (el.dataset.reg && state.reg) { state.reg.item[el.dataset.reg] = el.value; return; }
    if (el.dataset.servPct) {
      const v = Math.max(0, Math.min(100, Number(el.value) || 0));
      const servicos = (o.servicos || []).map(x => x.id === el.dataset.servPct ? { ...x, percentual: v } : x);
      try { await patch(o, { servicos }); } catch (e) { state.error = erroTxt(e, "salvar o %"); }
      return render();
    }
    if (el.dataset.impcat !== undefined) { state.impFiles[Number(el.dataset.impcat)].cat = el.value; return; }
    if (el.id === "imp-files") { [...el.files].forEach(f => state.impFiles.push({ file: f, cat: catPorNome(f.name) })); state.error = ""; return render(); }
    if (state.draft && (el.dataset.l || el.dataset.k || el.dataset.cx)) {
      const val = el.type === "checkbox" ? el.checked : el.value;
      if (el.dataset.l) state.draft[el.dataset.l][Number(el.dataset.i)][el.dataset.k] = val; else if (el.dataset.cx) state.draft.caixa[el.dataset.cx] = val; else state.draft[el.dataset.k] = val;
      if (el.id === "f-area") render(); return;
    }
    if (el.id === "med-files" || el.id === "med-cam") { state.medFiles.push(...el.files); state.error = ""; return render(); }
    if (el.id === "doc-files") { state.docFiles.push(...el.files); state.error = ""; return render(); }
    if (el.id === "cron-file" && el.files[0]) return lerCronograma(el.files[0]);
    if ((el.id === "foto-files" || el.id === "foto-cam") && el.files.length) {
      const files = [...el.files]; state.busy = "foto"; state.error = ""; render();
      try {
        const novas = [];
        for (const f of files) { const r = await subir(f); novas.push({ id: r.id, nome: r.nome, tipo: r.tipo, data: state.fotoData || hojeISO(), legenda: "" }); }
        await patch(curObra(), { fotos: [...(curObra().fotos || []), ...novas] });
        state.info = `${novas.length} foto(s) adicionada(s). Escreva a legenda de cada uma.`;
        if (state.sample) {
          state.busy = "legenda";
          const { feitas, erro } = await legendarFotos(novas.map((f, i) => ({ id: f.id, data: f.data, arquivo: files[i] })));
          state.info = feitas ? `${novas.length} foto(s) adicionada(s) e ${feitas} legenda(s) escrita(s) pelo Claude. Confira e corrija se precisar.` : `${novas.length} foto(s) adicionada(s). Escreva a legenda de cada uma.`;
          if (erro && !feitas) state.warn = sampleErro(erro);
        }
      } catch (e) { state.error = erroTxt(e, "enviar as fotos"); }
      state.busy = ""; return render();
    }
    if (el.dataset.legenda) {
      const fotos = (o.fotos || []).map(f => f.id === el.dataset.legenda ? { ...f, legenda: el.value } : f);
      try { await patch(o, { fotos }); } catch (e) { state.error = erroTxt(e, "salvar a legenda"); render(); }
      return;
    }
    if (el.dataset.pend !== undefined) {
      const pend = JSON.parse(JSON.stringify(o.pendencias || []));
      pend[Number(el.dataset.pend)].resolvida = el.checked; el.disabled = true;
      try { await patch(o, { pendencias: pend }); }
      catch (e) { state.error = "Não foi possível atualizar a pendência."; render(); }
    }
  });
  app.addEventListener("submit", ev => { ev.preventDefault(); salvarObra(); });

  const inicial = (location.hash || "").slice(1);
  render();
  (async () => {
    const use = n => window.claude?.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
    const db = await use("db");
    state.db = db || null;
    if (!db) { render(); return; }
    try { const user = await use("user"); if (user && (await user.can("data.write")) === false) state.readOnly = true; if (user && user.id) state.userId = await user.id(); } catch (e) {}
    db.collection("obras").onSnapshot(snap => {
      state.obras = snap.docs.map(d => ({ id: d.id, ...JSON.parse(JSON.stringify(d.data())) }));
      const first = !state.loaded; state.loaded = true;
      if (first && inicial && state.obras.some(o => o.id === inicial)) state.view = inicial;
      const ativo = document.activeElement;
      const digitando = ativo && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName) && ativo.id !== "busca";
      if (state.view !== "editar" && !digitando && !state.busy) render();
    }, () => { state.error = "A conexão com o banco de dados caiu. Recarregue a página."; render(); });
    use("assets").then(a => { state.assets = a || null; render(); });
    fetch("dados/recursos/edealina.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(R => { if (R && Array.isArray(R.itens)) { state.recursos = R; if (state.view !== "editar") render(); } }).catch(() => {});
    use("downloads").then(d => { state.downloads = d || null; if (state.preview) render(); });
    use("sample").then(async s => { state.sample = s || null; if (s) { const l = await s.limits().catch(() => null); state.imgLimits = l?.images || null; } render(); });
  })();
})();
