// Função do Supabase para o administrador cadastrar e gerenciar a equipe do site.
// Só quem é admin ativo na tabela equipe consegue usar. Não apaga usuários: desativar bloqueia o acesso.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ORIGENS = ["https://higor2008-hash.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
const PAPEIS = ["admin", "editor", "leitor"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = (req: Request) => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const senhaBoa = (s: unknown) => typeof s === "string" && s.length >= 10 && s.length <= 72 && /[A-Za-z]/.test(s) && /\d/.test(s);
const texto = (s: unknown, max: number) => typeof s === "string" ? s.trim().slice(0, max) : "";

Deno.serve(async (req) => {
  const resposta = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!quem?.user) return resposta({ erro: "Entre no site de novo." }, 401);
  const { data: eu } = await admin.from("equipe").select("papel, ativo").eq("user_id", quem.user.id).maybeSingle();
  if (!eu?.ativo || eu.papel !== "admin") return resposta({ erro: "Só o administrador pode gerenciar a equipe." }, 403);

  const { data: ok } = await admin.rpc("consumir_cota", { p_user: quem.user.id, p_janela: "equipe-10min", p_segundos: 600, p_max: 60 });
  if (ok === false) return resposta({ erro: "Muitas alterações seguidas. Espere alguns minutos." }, 429);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return resposta({ erro: "Pedido inválido." }, 400); }

  try {
    if (b.acao === "listar") {
      const { data: membros, error } = await admin.from("equipe").select("user_id, email, nome, papel, ativo, criado_em").order("criado_em");
      if (error) throw error;
      const { data: us } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const ultimo = Object.fromEntries((us?.users || []).map((u) => [u.id, u.last_sign_in_at || null]));
      return resposta({ membros: (membros || []).map((m) => ({ ...m, ultimoAcesso: ultimo[m.user_id] || null, eu: m.user_id === quem.user!.id })) });
    }

    if (b.acao === "criar") {
      const email = texto(b.email, 254).toLowerCase(), nome = texto(b.nome, 120), papel = String(b.papel || "");
      if (!EMAIL.test(email)) return resposta({ erro: "E-mail inválido." }, 400);
      if (!PAPEIS.includes(papel)) return resposta({ erro: "Papel inválido." }, 400);
      if (!senhaBoa(b.senha)) return resposta({ erro: "A senha precisa ter pelo menos 10 caracteres, com letras e números." }, 400);
      const { data: criado, error } = await admin.auth.admin.createUser({ email, password: b.senha as string, email_confirm: true });
      if (error) return resposta({ erro: /already|exists|registered/i.test(error.message) ? "Já existe um usuário com esse e-mail." : "Não foi possível criar o usuário." }, 400);
      const { error: e2 } = await admin.from("equipe").insert({ user_id: criado.user.id, email, nome: nome || null, papel });
      if (e2) throw e2;
      return resposta({ ok: true });
    }

    if (b.acao === "alterar") {
      const id = String(b.user_id || "");
      if (!UUID.test(id)) return resposta({ erro: "Usuário inválido." }, 400);
      const mud: Record<string, unknown> = {};
      if (b.papel !== undefined) { if (!PAPEIS.includes(String(b.papel))) return resposta({ erro: "Papel inválido." }, 400); mud.papel = b.papel; }
      if (b.ativo !== undefined) mud.ativo = !!b.ativo;
      if (b.nome !== undefined) mud.nome = texto(b.nome, 120) || null;
      if (id === quem.user.id && (mud.ativo === false || (mud.papel && mud.papel !== "admin")))
        return resposta({ erro: "Você não pode tirar o seu próprio acesso de administrador." }, 400);
      if (b.senha !== undefined && !senhaBoa(b.senha)) return resposta({ erro: "A senha precisa ter pelo menos 10 caracteres, com letras e números." }, 400);
      if (Object.keys(mud).length) {
        const { error } = await admin.from("equipe").update(mud).eq("user_id", id);
        if (error) throw error;
      }
      if (mud.ativo !== undefined) await admin.auth.admin.updateUserById(id, { ban_duration: mud.ativo ? "none" : "876000h" });
      if (b.senha !== undefined) {
        const { error: e3 } = await admin.auth.admin.updateUserById(id, { password: b.senha as string });
        if (e3) throw e3;
      }
      return resposta({ ok: true });
    }

    return resposta({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("equipe", e instanceof Error ? e.message : String(e));
    return resposta({ erro: "Erro interno. Tente de novo." }, 500);
  }
});
