/* Ligação do Controle de Obras com o Supabase: login, banco de dados, arquivos e leitura automática.
   Oferece a mesma interface que o app.js usa (window.claude.use), então as telas não dependem do servidor. */
(function () {
  // Não deixa o site ser aberto dentro de outra página (proteção contra clique disfarçado).
  if (window.top !== window.self) { document.documentElement.innerHTML = ""; try { window.top.location = window.self.location.href; } catch (e) {} return; }
  const cfg = window.CONTROLE_CONFIG || {};
  const app = document.getElementById("app");
  const BUCKET = "arquivos";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const topo = `<header class="top"><div><div class="eyebrow">Prefeitura Municipal de Edealina · Fiscalização de Obras</div><h1>Controle de Obras</h1></div></header>`;

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.startsWith("COLE_")) {
    app.innerHTML = topo + `<div class="empty">O site ainda não foi ligado ao banco de dados. Preencha o arquivo <b>config.js</b> com a Project URL e a chave anon public do Supabase (veja o README).</div>`;
    return;
  }
  const recuperando = /type=recovery/.test(location.hash);
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  window.CONTROLE_SITE = { fileUrl: id => sb.storage.from(BUCKET).getPublicUrl(id).data.publicUrl };

  /* ---------- Banco de dados (tabela obras: id + data jsonb) ---------- */
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  const deepMerge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; return out; };
  const dbErr = e => ({ code: e && (e.code === "42501" || e.code === "PGRST301") ? "invalid_argument" : "unavailable", message: (e && e.message) || String(e) });
  const meta = { fromCache: false, hasPendingWrites: false };
  const listeners = new Set();
  let canal = null;

  async function notificar() {
    try {
      const { data, error } = await sb.from("obras").select("id,data");
      if (error) throw error;
      const docs = data.map(r => ({ id: r.id, exists: true, data: () => r.data, metadata: meta }));
      const snap = { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
      listeners.forEach(l => l.next(snap));
    } catch (e) { listeners.forEach(l => l.error && l.error(dbErr(e))); }
  }
  function tempoReal() {
    if (canal) return;
    canal = sb.channel("obras-mudancas").on("postgres_changes", { event: "*", schema: "public", table: "obras" }, () => notificar()).subscribe();
  }
  function docRef(id) {
    const agora = () => new Date().toISOString();
    return {
      id, path: "obras/" + id,
      async get() {
        const { data, error } = await sb.from("obras").select("data").eq("id", id).maybeSingle();
        if (error) throw dbErr(error);
        return { id, exists: !!data, data: () => data ? data.data : undefined, metadata: meta };
      },
      async set(body) {
        const { error } = await sb.from("obras").upsert({ id, data: body, atualizado_em: agora() });
        if (error) throw dbErr(error);
        notificar();
      },
      async update(patch) {
        const atual = await this.get();
        if (!atual.exists) throw { code: "invalid_argument", message: "Obra não encontrada." };
        const { error } = await sb.from("obras").update({ data: deepMerge(atual.data(), patch), atualizado_em: agora() }).eq("id", id);
        if (error) throw dbErr(error);
        notificar();
      },
      async delete() {
        const { error } = await sb.from("obras").delete().eq("id", id);
        if (error) throw dbErr(error);
        notificar();
      }
    };
  }
  const db = {
    collection(nome) {
      if (nome !== "obras") throw new TypeError("Só existe a coleção obras.");
      return {
        path: nome,
        doc: id => docRef(id || crypto.randomUUID()),
        onSnapshot(next, error) { const l = { next, error }; listeners.add(l); tempoReal(); notificar(); return () => listeners.delete(l); }
      };
    },
    doc(caminho) { return docRef(caminho.split("/")[1]); }
  };

  /* ---------- Arquivos (Storage, bucket "arquivos") ---------- */
  const assets = {
    async upload(arquivo, opts = {}) {
      const type = opts.type || arquivo.type || "application/octet-stream";
      const ext = ((arquivo.name || "").match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0].toLowerCase();
      const id = crypto.randomUUID() + ext;
      const { error } = await sb.storage.from(BUCKET).upload(id, arquivo, { contentType: type, upsert: false });
      if (error) throw { code: /mime|type/i.test(error.message) ? "unsupported_type" : /size|large|exceed/i.test(error.message) ? "too_large" : /quota/i.test(error.message) ? "quota_or_state" : "upstream_error", message: error.message };
      return { id, url: window.CONTROLE_SITE.fileUrl(id), contentType: type, sizeBytes: arquivo.size };
    },
    async delete(id) { await sb.storage.from(BUCKET).remove([id]); },
    async list() { return { assets: [], usage: {} }; }
  };

  /* ---------- Leitura automática (função ler-documento no Supabase, que chama o Claude) ---------- */
  const paraBase64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(b); });
  async function sample(input, opts = {}) {
    const prompt = typeof input === "string" ? input : input.filter(t => t.role === "user").map(t => t.content).join("\n\n");
    const imagens = [];
    for (const b of [].concat(opts.images ? [...opts.images] : [])) imagens.push({ media_type: b.type || "image/jpeg", data: await paraBase64(b) });
    const { data, error } = await sb.functions.invoke("ler-documento", { body: { prompt, imagens } });
    if (error) {
      let code = "upstream_error";
      const status = error.context && error.context.status;
      try { const j = await error.context.json(); if (j && typeof j.code === "string") code = j.code; } catch (e) {}
      if (status === 404) code = "funcao_ausente";
      else if (status === 401) code = "funcao_login";
      else if (status === 403 && code !== "not_granted") code = "funcao_login";
      else if (error.name === "FunctionsRelayError" || error.name === "FunctionsFetchError") code = "funcao_ausente";
      throw { code, message: error.message };
    }
    return { text: (data && data.text) || "", truncated: !!(data && data.truncated) };
  }
  function lerJson(t) {
    try { return JSON.parse(t); } catch (e) {}
    const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (cerca) { try { return JSON.parse(cerca[1]); } catch (e) {} }
    const i = t.search(/[[{]/), j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
    return undefined;
  }
  sample.json = async (input, opts) => {
    const { text } = await sample(input, opts);
    const v = lerJson(text);
    if (v === undefined) throw { code: "invalid_json", message: "Resposta sem JSON.", text };
    return v;
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 12, maxInputBytes: 5 * 1024 * 1024, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } });

  /* ---------- Download de arquivos gerados no navegador ---------- */
  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

  /* ---------- Login (com trava depois de várias senhas erradas) ---------- */
  const TRAVA = "controle-login-trava";
  const lerTrava = () => { try { return JSON.parse(localStorage.getItem(TRAVA)) || { n: 0, ate: 0 }; } catch (e) { return { n: 0, ate: 0 }; } };
  const gravarTrava = t => { try { localStorage.setItem(TRAVA, JSON.stringify(t)); } catch (e) {} };
  const senhaBoa = s => s.length >= 10 && /[A-Za-z]/.test(s) && /\d/.test(s);
  const REGRA_SENHA = "Use pelo menos 10 caracteres, com letras e números.";

  let emailDigitado = "";
  function telaLogin(msg = "", tipo = "err") {
    document.getElementById("conta").hidden = true;
    app.innerHTML = topo + `<div class="login"><section class="blk"><header><h3>Entrar</h3></header>
      ${msg ? `<div class="msg ${tipo}" role="alert">${esc(msg)}</div>` : ""}
      <form id="login-form" novalidate>
        <label class="f">E-mail<input id="login-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="254" required></label>
        <label class="f">Senha<span class="senha-campo"><input id="login-senha" type="password" autocomplete="current-password" maxlength="72" required><button type="button" class="ghost sm" id="login-ver" aria-label="Mostrar senha">Ver</button></span></label>
        <button class="primary" type="submit" id="login-entrar">Entrar</button>
        <button type="button" class="ghost" id="login-esqueci">Esqueci a senha</button>
      </form>
      <p class="login-nota">Acesso só para a equipe cadastrada pelo administrador.</p></section></div>`;
    const email = document.getElementById("login-email"), senha = document.getElementById("login-senha");
    try { email.value = emailDigitado || localStorage.getItem("controle-ultimo-email") || ""; } catch (e) { email.value = emailDigitado; }
    email.addEventListener("input", () => { emailDigitado = email.value.trim(); });
    (email.value ? senha : email).focus();
    document.getElementById("login-ver").addEventListener("click", ev => {
      const ver = senha.type === "password"; senha.type = ver ? "text" : "password";
      ev.currentTarget.textContent = ver ? "Ocultar" : "Ver"; ev.currentTarget.setAttribute("aria-label", ver ? "Ocultar senha" : "Mostrar senha");
    });
    document.getElementById("login-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      emailDigitado = email.value.trim();
      const t = lerTrava(), falta = Math.ceil((t.ate - Date.now()) / 1000);
      if (falta > 0) return telaLogin(`Muitas tentativas erradas. Espere ${falta} segundos e tente de novo.`);
      if (!email.value.trim() || !senha.value) return telaLogin("Preencha o e-mail e a senha.");
      const b = document.getElementById("login-entrar"); b.disabled = true; b.textContent = "Entrando…";
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
      if (!error) { gravarTrava({ n: 0, ate: 0 }); try { localStorage.setItem("controle-ultimo-email", email.value.trim()); } catch (e) {} return; }
      if (error.status === 429) return telaLogin("Muitas tentativas. Espere alguns minutos e tente de novo.");
      const n = t.n + 1, espera = n >= 5 ? Math.min(60 * 2 ** (n - 5), 1800) : 0;
      gravarTrava({ n, ate: espera ? Date.now() + espera * 1000 : 0 });
      telaLogin(espera ? `E-mail ou senha incorretos. Por segurança, espere ${espera} segundos antes de tentar de novo.` : "E-mail ou senha incorretos.");
    });
    document.getElementById("login-esqueci").addEventListener("click", async () => {
      const e = email.value.trim();
      if (!e) return telaLogin("Digite seu e-mail e clique de novo em Esqueci a senha.");
      await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname });
      telaLogin("Se o e-mail estiver cadastrado, chegará um link para criar uma nova senha.", "info");
    });
  }

  function formSenha(destino, aoSalvar, titulo = "Criar nova senha") {
    destino.innerHTML = `<section class="blk"><header><h3>${titulo}</h3></header><div id="senha-msg"></div>
      <form id="senha-form" novalidate>
        <label class="f">Nova senha<input id="nova-senha" type="password" autocomplete="new-password" maxlength="72" required></label>
        <label class="f">Repita a nova senha<input id="nova-senha2" type="password" autocomplete="new-password" maxlength="72" required></label>
        <p class="login-nota">${REGRA_SENHA}</p>
        <div class="btns end">${destino.id === "painel-corpo" ? `<button type="button" class="ghost" data-fechar>Cancelar</button>` : ""}<button class="primary" type="submit">Salvar senha</button></div>
      </form></section>`;
    const aviso = (m, t = "err") => { destino.querySelector("#senha-msg").innerHTML = `<div class="msg ${t}" role="alert">${esc(m)}</div>`; };
    destino.querySelector("#senha-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const a = destino.querySelector("#nova-senha").value, b = destino.querySelector("#nova-senha2").value;
      if (!senhaBoa(a)) return aviso(REGRA_SENHA);
      if (a !== b) return aviso("As duas senhas não são iguais.");
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) return aviso(/same|different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : /reauth|recent/i.test(error.message) ? "Saia e entre de novo antes de trocar a senha." : "Não foi possível salvar a senha. Tente de novo.");
      aoSalvar();
    });
  }
  function telaNovaSenha() {
    document.getElementById("conta").hidden = true;
    app.innerHTML = topo + `<div class="login" id="login-box"></div>`;
    formSenha(document.getElementById("login-box"), () => { history.replaceState(null, "", location.pathname); location.reload(); });
  }
  function semAcesso(email) {
    document.getElementById("conta").hidden = true;
    app.innerHTML = topo + `<div class="login"><section class="blk"><header><h3>Acesso não liberado</h3></header>
      <div class="msg warn">O usuário ${esc(email)} não está liberado na equipe deste site. Peça ao administrador para liberar o seu acesso.</div>
      <div class="btns end"><button class="primary" id="sem-sair">Sair</button></div></section></div>`;
    document.getElementById("sem-sair").addEventListener("click", sair);
  }
  async function sair() { await sb.auth.signOut(); location.reload(); }

  /* ---------- Painel (trocar senha e equipe) ---------- */
  const painel = document.getElementById("painel"), corpo = document.getElementById("painel-corpo");
  const abrirPainel = () => { if (!painel.open) painel.showModal(); };
  painel.addEventListener("click", ev => { if (ev.target === painel || ev.target.closest("[data-fechar]")) painel.close(); });

  const NOME_PAPEL = { admin: "Administrador", editor: "Editor", leitor: "Só leitura" };
  const DESC_PAPEL = { admin: "vê, edita e cadastra pessoas", editor: "vê e edita as obras", leitor: "só vê, não altera nada" };
  const opcoesPapel = sel => Object.keys(NOME_PAPEL).map(p => `<option value="${p}"${p === sel ? " selected" : ""}>${NOME_PAPEL[p]}</option>`).join("");
  const dataBr = d => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca entrou";
  async function chamarEquipe(corpoPedido) {
    const { data, error } = await sb.functions.invoke("equipe", { body: corpoPedido });
    if (error) {
      let m = "Não foi possível falar com o servidor. Tente de novo.";
      try { const j = await error.context.json(); if (j && typeof j.erro === "string") m = j.erro; } catch (e) {}
      if (error.context && error.context.status === 404) m = "A função equipe ainda não está no Supabase.";
      throw new Error(m);
    }
    return data;
  }
  async function telaEquipe(msg = "", tipo = "info") {
    corpo.innerHTML = `<section class="blk"><header><h3>Equipe</h3><button class="ghost sm" data-fechar>Fechar</button></header><div class="empty">Carregando…</div></section>`;
    abrirPainel();
    let membros;
    try { membros = (await chamarEquipe({ acao: "listar" })).membros || []; }
    catch (e) { corpo.querySelector(".empty").outerHTML = `<div class="msg err" role="alert">${esc(e.message)}</div>`; return; }
    corpo.innerHTML = `<section class="blk"><header><h3>Equipe</h3><button class="ghost sm" data-fechar>Fechar</button></header>
      ${msg ? `<div class="msg ${tipo}" role="alert">${esc(msg)}</div>` : ""}
      <ul class="equipe">${membros.map(m => `<li data-id="${esc(m.user_id)}" class="${m.ativo ? "" : "inativo"}">
        <div class="eq-quem"><b>${esc(m.nome || m.email)}${m.eu ? " (você)" : ""}</b><span>${esc(m.email)}</span><span>Último acesso: ${esc(dataBr(m.ultimoAcesso))}${m.ativo ? "" : " · <b>desativado</b>"}</span></div>
        <div class="eq-acoes">
          <label class="f">Papel<select data-papel ${m.eu ? "disabled" : ""}>${opcoesPapel(m.papel)}</select></label>
          ${m.eu ? "" : `<button class="sm" data-ativo="${m.ativo ? "0" : "1"}">${m.ativo ? "Desativar" : "Reativar"}</button>
          <button class="sm" data-senha>Nova senha</button>`}
        </div></li>`).join("")}</ul>
      <details class="eq-novo"${membros.length < 2 ? " open" : ""}><summary>Cadastrar pessoa</summary>
        <form id="eq-form" novalidate>
          <label class="f">Nome<input name="nome" maxlength="120" autocomplete="off"></label>
          <label class="f">E-mail<input name="email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" maxlength="254" required autocomplete="off"></label>
          <label class="f">Papel<select name="papel">${opcoesPapel("editor")}</select></label>
          <label class="f">Senha provisória<input name="senha" type="text" maxlength="72" required autocomplete="off"></label>
          <p class="login-nota">${REGRA_SENHA} Passe a senha para a pessoa e peça que ela troque em “Trocar senha” no primeiro acesso.</p>
          <div class="btns end"><button type="button" class="ghost" id="eq-gerar">Gerar senha</button><button class="primary" type="submit">Cadastrar</button></div>
        </form></details>
      <p class="login-nota">${Object.keys(NOME_PAPEL).map(p => `<b>${NOME_PAPEL[p]}</b>: ${DESC_PAPEL[p]}`).join(" · ")}. Ninguém é apagado: desativar bloqueia o acesso e mantém o histórico.</p></section>`;
    const f = corpo.querySelector("#eq-form");
    corpo.querySelector("#eq-gerar").addEventListener("click", () => { f.senha.value = gerarSenha(); });
    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (!senhaBoa(f.senha.value)) return telaEquipe(REGRA_SENHA, "err");
      const b = f.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Cadastrando…";
      try { await chamarEquipe({ acao: "criar", nome: f.nome.value, email: f.email.value, papel: f.papel.value, senha: f.senha.value }); telaEquipe(`${f.email.value.trim()} cadastrado. Senha provisória: ${f.senha.value}`); }
      catch (e) { telaEquipe(e.message, "err"); }
    });
    corpo.querySelectorAll(".equipe li").forEach(li => {
      const id = li.dataset.id, alterar = async (mud, ok) => {
        try { await chamarEquipe({ acao: "alterar", user_id: id, ...mud }); telaEquipe(ok); } catch (e) { telaEquipe(e.message, "err"); }
      };
      li.querySelector("[data-papel]").addEventListener("change", ev => alterar({ papel: ev.target.value }, "Papel alterado."));
      const at = li.querySelector("[data-ativo]");
      if (at) at.addEventListener("click", () => {
        const ativar = at.dataset.ativo === "1";
        if (!ativar && !confirm("Desativar esta pessoa? Ela não conseguirá mais entrar no site.")) return;
        alterar({ ativo: ativar }, ativar ? "Acesso reativado." : "Acesso desativado.");
      });
      const sn = li.querySelector("[data-senha]");
      if (sn) sn.addEventListener("click", () => {
        const nova = gerarSenha();
        if (!confirm(`Trocar a senha desta pessoa para:\n\n${nova}\n\nAnote e passe para ela.`)) return;
        alterar({ senha: nova }, `Senha trocada. Nova senha provisória: ${nova}`);
      });
    });
  }
  function gerarSenha() {
    const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", nums = "23456789", todos = letras + nums;
    const r = n => { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a]; };
    const s = r(12).map((v, i) => (i === 0 ? letras : i === 1 ? nums : todos)[v % (i === 0 ? letras.length : i === 1 ? nums.length : todos.length)]);
    return s.join("");
  }

  /* ---------- Início: confere se a pessoa é da equipe e qual o papel ---------- */
  let iniciado = false;
  async function iniciarApp(session) {
    if (iniciado) return; iniciado = true;
    const { data: membro, error } = await sb.from("equipe").select("papel, ativo, nome").eq("user_id", session.user.id).maybeSingle();
    if (error) { iniciado = false; app.innerHTML = topo + `<div class="empty">Não foi possível conferir o seu acesso. Recarregue a página.</div>`; return; }
    if (!membro || !membro.ativo) return semAcesso(session.user.email);
    const papel = membro.papel, escreve = papel === "admin" || papel === "editor";
    const user = {
      isOwner: () => papel === "admin", canEdit: () => escreve,
      can: async acao => acao === "data.write" || acao === "assets.write" ? escreve : true,
      id: async () => session.user.id, me: async () => ({ id: session.user.id, name: membro.nome || session.user.email, guest: false })
    };
    const caps = { db, assets, sample, downloads, user };
    window.claude = { use: async nome => caps[nome] || null };
    document.getElementById("conta").hidden = false;
    document.getElementById("conta-email").textContent = membro.nome || session.user.email;
    document.getElementById("conta-papel").textContent = NOME_PAPEL[papel] || papel;
    document.getElementById("equipe-btn").hidden = papel !== "admin";
    const s = document.createElement("script"); s.src = "app.js"; document.body.appendChild(s);
  }
  document.getElementById("sair").addEventListener("click", sair);
  document.getElementById("trocar-senha").addEventListener("click", () => { formSenha(corpo, () => { painel.close(); alert("Senha trocada."); }, "Trocar senha"); abrirPainel(); });
  document.getElementById("equipe-btn").addEventListener("click", () => telaEquipe());

  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === "PASSWORD_RECOVERY") return telaNovaSenha();
    if (evento === "SIGNED_OUT" && iniciado) return location.reload();
    if (session && !recuperando) iniciarApp(session);
  });
  sb.auth.getSession().then(({ data }) => { if (recuperando) return; if (data.session) iniciarApp(data.session); else telaLogin(); });
})();
