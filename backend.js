/* Ligação do Controle de Obras com o Supabase: login, banco de dados, arquivos e leitura automática.
   Oferece a mesma interface que o app.js usa (window.claude.use), então as telas não dependem do servidor. */
(function () {
  const cfg = window.CONTROLE_CONFIG || {};
  const app = document.getElementById("app");
  const BUCKET = "arquivos";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const topo = `<header class="top"><div><div class="eyebrow">Prefeitura Municipal de Edealina · Fiscalização de Obras</div><h1>Controle de Obras</h1></div></header>`;

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.startsWith("COLE_")) {
    app.innerHTML = topo + `<div class="empty">O site ainda não foi ligado ao banco de dados. Preencha o arquivo <b>config.js</b> com a Project URL e a chave anon public do Supabase (veja o README).</div>`;
    return;
  }
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
      if (error) throw { code: /size|large|exceed/i.test(error.message) ? "too_large" : /quota/i.test(error.message) ? "quota_or_state" : "upstream_error", message: error.message };
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
      else if (status === 401 || status === 403) code = "funcao_login";
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

  /* ---------- Login ---------- */
  function telaLogin(msg = "", tipo = "err") {
    document.getElementById("conta").hidden = true;
    app.innerHTML = topo + `<div class="login"><section class="blk"><header><h3>Entrar</h3></header>
      ${msg ? `<div class="msg ${tipo}">${esc(msg)}</div>` : ""}
      <form id="login-form" novalidate>
        <label class="f">E-mail<input id="login-email" type="email" autocomplete="username" required></label>
        <label class="f">Senha<input id="login-senha" type="password" autocomplete="current-password" required></label>
        <div class="btns end"><button type="button" class="ghost" id="login-esqueci">Esqueci a senha</button><button class="primary" type="submit" id="login-entrar">Entrar</button></div>
      </form></section></div>`;
    document.getElementById("login-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const b = document.getElementById("login-entrar"); b.disabled = true; b.textContent = "Entrando…";
      const { error } = await sb.auth.signInWithPassword({ email: document.getElementById("login-email").value.trim(), password: document.getElementById("login-senha").value });
      if (error) telaLogin("E-mail ou senha incorretos.");
    });
    document.getElementById("login-esqueci").addEventListener("click", async () => {
      const email = document.getElementById("login-email").value.trim();
      if (!email) return telaLogin("Digite seu e-mail e clique de novo em Esqueci a senha.");
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      telaLogin("Se o e-mail estiver cadastrado, chegará um link para criar uma nova senha.", "info");
    });
  }
  function telaNovaSenha() {
    app.innerHTML = topo + `<div class="login"><section class="blk"><header><h3>Criar nova senha</h3></header>
      <form id="senha-form" novalidate><label class="f">Nova senha<input id="nova-senha" type="password" autocomplete="new-password" minlength="6" required></label>
      <div class="btns end"><button class="primary" type="submit">Salvar senha</button></div></form></section></div>`;
    document.getElementById("senha-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const { error } = await sb.auth.updateUser({ password: document.getElementById("nova-senha").value });
      if (error) alert("Não foi possível salvar a senha: " + error.message); else location.reload();
    });
  }

  let iniciado = false;
  function iniciarApp(session) {
    if (iniciado) return; iniciado = true;
    const user = {
      isOwner: () => true, canEdit: () => true, can: async () => true,
      id: async () => session.user.id, me: async () => ({ id: session.user.id, name: session.user.email, guest: false })
    };
    const caps = { db, assets, sample, downloads, user };
    window.claude = { use: async nome => caps[nome] || null };
    document.getElementById("conta").hidden = false;
    document.getElementById("conta-email").textContent = session.user.email;
    const s = document.createElement("script"); s.src = "app.js"; document.body.appendChild(s);
  }
  document.getElementById("sair").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === "PASSWORD_RECOVERY") return telaNovaSenha();
    if (session) iniciarApp(session);
  });
  sb.auth.getSession().then(({ data }) => { if (data.session) iniciarApp(data.session); else if (!/type=recovery/.test(location.hash)) telaLogin(); });
})();
