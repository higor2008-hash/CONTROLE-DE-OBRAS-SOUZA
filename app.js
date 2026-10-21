/* Controle de Obras: telas e regras. Os dados vêm de backend.js (Supabase). */
(function () {
  const SIT = { andamento: "Em andamento", atrasada: "Atrasada", paralisada: "Paralisada", nao_iniciada: "Não iniciada", concluida: "Concluída" };
  const CATS = ["Projeto arquitetônico", "Projeto estrutural", "Projeto elétrico", "Projeto hidrossanitário", "Outros projetos",
    "PO / Planilha orçamentária", "Referências Caixa / SINAPI", "Cronograma físico-financeiro", "Memorial descritivo",
    "ART / RRT", "Contrato e aditivos", "Outros documentos"];
  const TABS = [["resumo", "Resumo"], ["documentos", "Projetos e documentos"], ["medicoes", "Medições"], ["cronograma", "Cronograma"], ["fotos", "Fotos"], ["vistorias", "Vistorias e pendências"]];
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const SHEETJS = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"];
  const MAMMOTH = ["https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js", "https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js"];
  const ACEITA = "application/pdf,image/*,.csv,text/csv,.txt,.xlsx,.xlsm,.xls,.ods,.docx,.doc,.odt";
  const PLANILHA = /\.(xlsx|xlsm|xls|ods|csv)$/i, TEXTO = /\.(docx)$/i;

  const app = document.getElementById("app");
  const state = { db: null, assets: null, sample: null, imgLimits: null, obras: [], loaded: false, view: "lista", tab: "resumo",
    filtro: "todas", busca: "", draft: null, editId: null, error: "", info: "", warn: "", readOnly: false, confirm: "",
    med: null, medFiles: [], doc: null, docFiles: [], cron: null, fotoData: "", busy: "", preview: null, downloads: null, impFiles: [], and: null };

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

  function header() {
    return `<header class="top">
      <div><div class="eyebrow">Prefeitura Municipal de Edealina · Fiscalização de Obras</div><h1>Controle de Obras</h1></div>
      ${state.view === "lista" && canWrite() ? `<button class="primary" data-act="nova">+ Nova obra</button>` : ""}
    </header>`;
  }
  const msgs = () => (state.error ? `<div class="msg err">${esc(state.error)}</div>` : "") + (state.warn ? `<div class="msg warn">${esc(state.warn)}</div>` : "") + (state.info ? `<div class="msg info">${esc(state.info)}</div>` : "");

  function render() {
    const y = window.scrollY;
    if (state.view === "editar") { renderForm(); return; }
    if (state.view !== "lista") { const o = curObra(); if (o) { renderFicha(o); rotularTabelas(); window.scrollTo(0, y); return; } state.view = "lista"; }
    renderLista();
  }
  /* No celular as tabelas viram cartões; cada célula recebe o nome da sua coluna */
  function rotularTabelas() {
    app.querySelectorAll(".tbl table").forEach(tb => {
      const nomes = []; tb.querySelectorAll("thead th").forEach(th => { for (let i = 0; i < (th.colSpan || 1); i++) nomes.push(th.textContent.trim()); });
      tb.classList.add("cards");
      tb.querySelectorAll("tbody tr, tfoot tr").forEach(tr => { let i = 0; [...tr.cells].forEach(td => { if (nomes[i] && td.colSpan === 1) td.dataset.label = nomes[i]; i += td.colSpan || 1; }); });
    });
  }

  /* ---------- Lista ---------- */
  function renderLista() {
    const obras = state.obras;
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
    else if (!obras.length) body = `<div class="empty">Nenhuma obra cadastrada ainda. Use <b>+ Nova obra</b> para criar a primeira ficha.</div>`;
    else body = `
      <div class="summary">
        <div class="tile"><div class="eyebrow">Obras</div><div class="v num">${obras.length}</div></div>
        <div class="tile"><div class="eyebrow">Paralisadas</div><div class="v num" style="color:var(--bad)">${cont("paralisada")}</div></div>
        <div class="tile"><div class="eyebrow">Atrasadas</div><div class="v num" style="color:var(--warn)">${cont("atrasada")}</div></div>
        <div class="tile"><div class="eyebrow">Pendências abertas</div><div class="v num">${obras.reduce((s, o) => s + pendAbertas(o), 0)}</div></div>
        <div class="tile"><div class="eyebrow">Valor em execução</div><div class="v num sm">${brl(ativos.reduce((s, o) => s + valorTotal(o), 0))}</div><div class="sub">Medido ${brl(ativos.reduce((s, o) => s + medido(o), 0))}</div></div>
      </div>
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
            <span class="meta"><span>${esc(o.numero || "Sem nº de contrato")}</span><span>${esc(o.empresa || "Empresa não informada")}</span><span class="mono">${brl(vt)}</span>${md ? `<span class="mono">Medido ${pctTxt(pct(md, vt))}</span>` : ""}</span>
            <span class="meta">${prazoTxt(o)}${cs ? `<span>${esc(cs.txt)}</span>` : ""}${pendAbertas(o) ? `<span>${pendAbertas(o)} pendência${pendAbertas(o) > 1 ? "s" : ""} aberta${pendAbertas(o) > 1 ? "s" : ""}</span>` : ""}${ultimaVist(o) ? `<span>Última vistoria ${dt(ultimaVist(o).data)}</span>` : ""}</span>
          </span>
          <span class="side">${pill(o.situacao)}${bar(o.percentual)}</span>
        </button>`; }).join("") : `<div class="empty">Nenhuma obra neste filtro.</div>`}</div>`;
    app.innerHTML = header() + msgs() + body;
    const b = document.getElementById("busca");
    if (b && state._focusBusca) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); state._focusBusca = false; }
  }

  /* ---------- Ficha ---------- */
  function renderFicha(o) {
    const n = { documentos: (o.documentos || []).length, medicoes: (o.medicoes || []).length, fotos: (o.fotos || []).length, vistorias: (o.vistorias || []).length + pendAbertas(o) };
    const corpo = { resumo: tabResumo, documentos: tabDocumentos, medicoes: tabMedicoes, cronograma: tabCronograma, fotos: tabFotos, vistorias: tabVistorias }[state.tab] || tabResumo;
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
    return `${blocoAndamento(o)}${blocoRelatorios()}
      <div class="summary">
        <div class="tile"><div class="eyebrow">Valor com aditivos</div><div class="v num sm">${brl(vt)}</div></div>
        <div class="tile"><div class="eyebrow">Medido</div><div class="v num sm">${brl(md)}</div><div class="sub">${pctTxt(pct(md, vt))} do contrato</div></div>
        <div class="tile"><div class="eyebrow">Saldo</div><div class="v num sm" ${vt - md < 0 ? 'style="color:var(--bad)"' : ""}>${brl(vt - md)}</div></div>
        <div class="tile"><div class="eyebrow">Cronograma</div><div style="margin-top:6px">${cc.status ? `<span class="pill s-${cc.status.cls}">${esc(cc.status.txt)}</span>` : `<span class="muted small">Cronograma não lançado</span>`}</div></div>
      </div>
      <dl class="kv">
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
        </dl>
        <p class="small muted" style="margin:10px 0 0">Os arquivos da PO e das composições ficam na aba Projetos e documentos.</p>
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
          ${f("nome", "Nome da obra *", "text", true)}
          ${f("objeto", "Objeto", "text", true)}
          ${f("numero", "Contrato / instrumento")}
          ${f("modalidade", "Modalidade")}
          ${f("empresa", "Empresa contratada")}
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
    d.atualizadoEm = new Date().toISOString();
    let id = state.editId;
    if (!id) { id = slug(d.nome); if (state.obras.some(o => o.id === id)) id += "-" + Date.now().toString(36); }
    const btn = document.getElementById("salvar"); if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
    try {
      if (btn) btn.textContent = state.impFiles.length ? "Salvando e enviando arquivos…" : "Salvando…";
      await state.db.collection("obras").doc(id).set(limpo(d));
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
      } catch (e) { erro = e; if (e && (e.code === "sampling_disabled" || e.code === "not_granted")) break; }
    }
    return { feitas, erro };
  }
  const sampleErro = e => ({ sampling_disabled: "A leitura automática ainda não foi configurada no servidor (falta a chave da API). Preencha à mão.", not_granted: "A leitura automática não foi autorizada. Preencha os valores à mão.", rate_limited: "Muitas leituras seguidas. Espere um pouco e tente de novo.",
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
  const P = (t, o) => W.p(W.run(t, o), o);
  const titulo = t => W.p(W.run(t, { b: true }), { jc: "center", after: 60 });
  const secao = t => W.p(W.run(t, { b: true }), { jc: "left", before: 240, keep: true });
  const campo = (k, v) => v === undefined || v === null || v === "" ? "" : W.p(W.run(k + ":", { b: true }) + W.run(" " + v), { jc: "left", after: 40 });
  const item = t => W.p(W.run("– " + t), { jc: "both", after: 60 });
  const quebra = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  function tabela(cab, linhas, larg) {
    const tot = 9070, ws = larg || cab.map(() => Math.floor(tot / cab.length));
    const cel = (t, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.cab ? `<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>` : ""}</w:tcPr>${W.p(W.run(t, { b: o.cab || o.b, sz: 18 }), { jc: o.r ? "right" : "left", after: 0 })}</w:tc>`;
    const b = `<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${tot}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cab.map((c, i) => cel(String(c).replace(/^>/, ""), ws[i], { cab: true, r: String(c).startsWith(">") })).join("")}</w:tr>` +
      linhas.map(l => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((c, i) => cel(c && c.t !== undefined ? c.t : c, ws[i], { r: String(cab[i]).startsWith(">"), b: c && c.b })).join("")}</w:tr>`).join("") + `</w:tbl>` + P("", { after: 120 });
  }
  function assinatura(data) {
    const [y, m, d] = data.split("-");
    return P(`Edealina – GO, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}.`, { jc: "right", before: 360, after: 720 }) +
      P("_______________________________________________", { jc: "center", after: 0, keep: true }) +
      P(FISCAL.nome, { jc: "center", after: 0, b: true, keep: true }) + P(FISCAL.cargo, { jc: "center", after: 0, keep: true }) + P(FISCAL.funcao, { jc: "center", after: 0 });
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
      campo("Fiscal da obra", `${FISCAL.nome}, ${FISCAL.cargo}`);
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
  async function montarDocx(corpo) {
    const Z = await zipLib();
    const res = await fetch(MODELO.url); if (!res.ok) throw new Error("modelo");
    let bin;
    if (MODELO.base64) { const s = atob((await res.text()).trim()); bin = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i); }
    else bin = new Uint8Array(await res.arrayBuffer());
    const zip = await Z.loadAsync(bin), rels = [];
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
      let s = titulo("RELATÓRIO DIÁRIO DE FISCALIZAÇÃO DE OBRA") + P(`Data: ${dt(dia)}`, { jc: "center", after: 360 });
      s += identificacao(o);
      s += secao("2. SITUAÇÃO DA OBRA") + situacaoTxt(o, ult?.situacao || o.situacao, isNum(ult?.percentual) ? ult.percentual : o.percentual);
      s += secao("3. REGISTROS DO DIA");
      if (vist.length) vist.forEach(v => { s += P(v.obs || `Vistoria realizada, obra ${(SIT[v.situacao] || "").toLowerCase()}.`); });
      else if (dia === hojeISO() && o.observacoes) s += P(o.observacoes);
      else s += P("Não há vistoria registrada nesta data.");
      meds.forEach(m => { s += item(`Medição nº ${m.numero || "–"} lançada nesta data, no valor de ${brl(m.valor)}${m.obs ? `: ${m.obs}` : "."}`); });
      if (fotos.length) s += P(`Foram registradas ${fotos.length} fotografia(s), apresentadas no anexo.`);
      s += secao("4. PENDÊNCIAS EM ABERTO");
      s += pend.length ? pend.map(p => item(p.texto + (p.prazo ? ` Prazo: ${dt(p.prazo)}.` : ""))).join("") : P("Não há pendências em aberto.");
      s += assinatura(dia);
      s += await anexoFotos(fotos, zip, rels, `Fotografias obtidas em ${dt(dia)}${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, Edealina – GO.`);
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
      if (adit.length) s += secao(`${++n}. ADITIVOS`) + tabela(["Nº", "Data", "Objeto", "Novo prazo", ">Valor"], adit.map(a => [a.numero || "", dt(a.data), a.descricao || "", dt(a.novoPrazo), a.valor ? brl(a.valor) : "–"]), [800, 1300, 4070, 1300, 1600]);
      s += secao(`${++n}. VISTORIAS`);
      s += vist.length ? tabela(["Data", "Situação", ">% exec.", "Observações"], vist.map(v => [dt(v.data), SIT[v.situacao] || "–", isNum(v.percentual) ? v.percentual + "%" : "–", v.obs || ""]), [1300, 1500, 1000, 5270]) : P("Nenhuma vistoria registrada.");
      s += secao(`${++n}. PENDÊNCIAS`);
      s += pend.length ? pend.map(p => item(p.texto + (p.prazo ? ` Prazo: ${dt(p.prazo)}.` : "") + (p.resolvida ? " (resolvida)" : " (em aberto)"))).join("") : P("Nenhuma pendência registrada.");
      if (docs.length) s += secao(`${++n}. PROJETOS E DOCUMENTOS ARQUIVADOS`) + CATS.map(c => docs.filter(d => d.categoria === c).map(d => item(`${c}: ${d.titulo || "sem título"}${d.data ? ` (${dt(d.data)})` : ""}`)).join("")).join("");
      s += P("É o relatório.", { before: 240 }) + assinatura(dia);
      s += await anexoFotos(fotos, zip, rels, `Fotografias registradas nas vistorias da obra${coordTxt(o) ? `, nas coordenadas aproximadas ${coordTxt(o)}` : ""}, Edealina – GO.`);
      return s;
    };
  }
  async function gerarRelatorio(tipo) {
    const o = curObra(); if (!o) return;
    const dia = state.relData || hojeISO();
    state.busy = "rel-" + tipo; state.error = state.info = state.warn = ""; render();
    try {
      const arq = await montarDocx(tipo === "dia" ? relatorioDiario(o, dia) : relatorioCompleto(o, dia));
      const nome = `${tipo === "dia" ? "Relatorio_Diario" : "Relatorio_Geral"}_${slug(o.nome).replace(/-/g, "_")}_${dia}.docx`;
      if (state.downloads) await state.downloads.save({ filename: nome, data: arq });
      else { const u = URL.createObjectURL(arq); const a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
      const reg = { data: dia, titulo: tipo === "dia" ? "Relatório diário de fiscalização" : "Relatório geral da obra", arquivo: nome };
      if (canWrite()) await patch(curObra(), { relatorios: [...(curObra().relatorios || []).filter(r => r.arquivo !== nome), reg] }).catch(() => {});
      state.info = `Relatório gerado: ${nome}. Ele também foi anotado em Vistorias e pendências > Relatórios emitidos.`;
    } catch (e) {
      if (e && e.code === "declined") state.info = "";
      else state.error = "Não foi possível gerar o relatório agora. Verifique a internet e tente de novo.";
    }
    state.busy = ""; render();
  }
  function blocoRelatorios() {
    return `<section class="blk"><header><h3>Relatórios em Word</h3></header>
      <p class="small muted" style="margin:0 0 10px">Gera o arquivo .docx no papel timbrado da Prefeitura, com as fotos e a assinatura do fiscal, para você revisar e imprimir.</p>
      <div class="rel-row"><label class="f">Data do relatório<input id="rel-data" type="date" data-bind="relData" value="${esc(state.relData || hojeISO())}"></label>
        <button class="primary" data-act="rel-dia" ${state.busy ? "disabled" : ""}>${state.busy === "rel-dia" ? "Gerando…" : "Relatório do dia"}</button>
        <button data-act="rel-obra" ${state.busy ? "disabled" : ""}>${state.busy === "rel-obra" ? "Gerando…" : "Relatório completo da obra"}</button></div>
    </section>`;
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
    if (t.dataset.abrir) { try { history.replaceState(null, "", "#" + t.dataset.abrir); } catch (e) {} state.tab = "resumo"; state.med = null; state.doc = null; state.cron = null; state.preview = null; state.and = null; return go(t.dataset.abrir); }
    if (t.dataset.tab) { state.preview = null; state.tab = t.dataset.tab; state.error = state.info = state.warn = ""; state.confirm = ""; return render(); }
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
    if (t.dataset.ask) { state.confirm = t.dataset.ask; return render(); }
    if (t.dataset.no) { state.confirm = ""; return render(); }
    if (t.dataset.unpend) { (t.dataset.unpend === "med" ? state.medFiles : state.docFiles).splice(Number(t.dataset.i), 1); return render(); }
    if (t.dataset.unarq) { state.med.arquivos.splice(Number(t.dataset.unarq), 1); return render(); }
    if (t.dataset.cronRem) { state.cron.linhas.splice(Number(t.dataset.cronRem), 1); return render(); }
    if (t.dataset.medEdit) { const m = (o.medicoes || []).find(x => x.id === t.dataset.medEdit); state.med = JSON.parse(JSON.stringify(m)); state.med.arquivos = state.med.arquivos || []; state.medFiles = []; state.error = state.info = state.warn = ""; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.yes) {
      const [tipo, id] = t.dataset.yes.split(/:(.*)/s); state.confirm = "";
      try {
        if (tipo === "obra") { await state.db.collection("obras").doc(id).delete(); state.draft = null; state.editId = null; go("lista"); state.info = "Obra excluída."; return render(); }
        if (tipo === "med") await patch(o, { medicoes: (o.medicoes || []).filter(x => x.id !== id) });
        if (tipo === "doc") { const d = (o.documentos || []).find(x => x.id === id); await patch(o, { documentos: (o.documentos || []).filter(x => x.id !== id) }); for (const f of (d?.arquivos || [])) await state.assets?.delete(f.id).catch(() => {}); }
        if (tipo === "foto") { await patch(o, { fotos: (o.fotos || []).filter(x => x.id !== id) }); await state.assets?.delete(id).catch(() => {}); }
        state.info = "Excluído.";
      } catch (e) { state.error = erroTxt(e, "excluir"); }
      return render();
    }
    if (t.dataset.andSit) { andDraft(o).situacao = t.dataset.andSit; return render(); }
    if (t.dataset.andStep) { const d = andDraft(o); d.percentual = Math.max(0, Math.min(100, (Number(d.percentual) || 0) + Number(t.dataset.andStep))); return render(); }
    const a = t.dataset.act;
    if (a === "rel-dia" || a === "rel-obra") return gerarRelatorio(a === "rel-dia" ? "dia" : "obra");
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
    if (a === "prev-fechar") { state.preview = null; return render(); }
    if (a === "prev-baixar") return baixarOriginal();
    if (a === "voltar") { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return go("lista"); }
    if (a === "imp-ler") return lerLicitacao();
    if (a === "nova") { state.impFiles = []; state.editId = null; state.draft = { situacao: "andamento", caixa: {}, pendencias: [], vistorias: [], aditivos: [], relatorios: [] }; return go("editar"); }
    if (a === "editar") { state.impFiles = []; state.editId = o.id; state.draft = limpo(o); state.draft.coordenadas = coordTxt(o); return go("editar"); }
    if (a === "cancelar") { state.impFiles = []; const back = state.editId || "lista"; state.draft = null; state.editId = null; return go(back); }
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
    if (el.dataset.andPct) {
      const d = andDraft(curObra()); d.percentual = el.value;
      const outro = document.getElementById(el.id === "and-range" ? "and-num" : "and-range"); if (outro) outro.value = el.value;
      return;
    }
    if (el.dataset.andObs) { andDraft(curObra()).obs = el.value; return; }
    if (el.dataset.andVist) { andDraft(curObra()).vistoria = el.checked; return; }
    if (el.dataset.bind) { const [obj, k] = el.dataset.bind.split("."); if (k) { if (state[obj]) state[obj][k] = el.value; } else state[obj] = el.value; return; }
    if (el.dataset.cron !== undefined) { state.cron.linhas[Number(el.dataset.cron)][el.dataset.k] = el.value; return; }
    if (!state.draft) return;
    const val = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.l) state.draft[el.dataset.l][Number(el.dataset.i)][el.dataset.k] = val;
    else if (el.dataset.cx) state.draft.caixa[el.dataset.cx] = val;
    else if (el.dataset.k) state.draft[el.dataset.k] = val;
  });

  app.addEventListener("change", async ev => {
    const el = ev.target; const o = curObra();
    if (el.dataset.andVist) { andDraft(o).vistoria = el.checked; return; }
    if (el.dataset.andPct || el.dataset.andObs) return;
    if (el.dataset.bind) { const [obj, k] = el.dataset.bind.split("."); if (k) { if (state[obj]) state[obj][k] = el.value; } else state[obj] = el.value; return; }
    if (el.dataset.cron !== undefined) { state.cron.linhas[Number(el.dataset.cron)][el.dataset.k] = el.value; return render(); }
    if (el.dataset.impcat !== undefined) { state.impFiles[Number(el.dataset.impcat)].cat = el.value; return; }
    if (el.id === "imp-files") { [...el.files].forEach(f => state.impFiles.push({ file: f, cat: catPorNome(f.name) })); state.error = ""; return render(); }
    if (state.draft && (el.dataset.l || el.dataset.k || el.dataset.cx)) {
      const val = el.type === "checkbox" ? el.checked : el.value;
      if (el.dataset.l) state.draft[el.dataset.l][Number(el.dataset.i)][el.dataset.k] = val; else if (el.dataset.cx) state.draft.caixa[el.dataset.cx] = val; else state.draft[el.dataset.k] = val; return;
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
          if (erro && !feitas) state.warn = erro.code === "sampling_disabled" ? "A legenda automática ainda não está ligada (falta a chave da API no servidor). Escreva a legenda à mão." : "Não consegui escrever a legenda automática agora. Escreva à mão ou use o botão Descrever com Claude.";
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
    try { const user = await use("user"); if (user && (await user.can("data.write")) === false) state.readOnly = true; } catch (e) {}
    db.collection("obras").onSnapshot(snap => {
      state.obras = snap.docs.map(d => ({ id: d.id, ...JSON.parse(JSON.stringify(d.data())) }));
      const first = !state.loaded; state.loaded = true;
      if (first && inicial && state.obras.some(o => o.id === inicial)) state.view = inicial;
      const ativo = document.activeElement;
      const digitando = ativo && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName) && ativo.id !== "busca";
      if (state.view !== "editar" && !digitando && !state.busy) render();
    }, () => { state.error = "A conexão com o banco de dados caiu. Recarregue a página."; render(); });
    use("assets").then(a => { state.assets = a || null; render(); });
    use("downloads").then(d => { state.downloads = d || null; if (state.preview) render(); });
    use("sample").then(async s => { state.sample = s || null; if (s) { const l = await s.limits().catch(() => null); state.imgLimits = l?.images || null; } render(); });
  })();
})();
