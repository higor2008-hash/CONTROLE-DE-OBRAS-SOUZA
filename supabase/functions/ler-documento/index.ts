// Função do Supabase que lê documentos de obra (boletins, contratos, cronogramas, fotos) com o Claude
// e devolve o texto da resposta. Só admin e editor da equipe podem usar, com limite de uso por pessoa.
// A chave da API fica no segredo ANTHROPIC_API_KEY (Edge Functions > Secrets), nunca no site.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ORIGENS = ["https://higor2008-hash.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
const LIMITES = [["10min", 600, 30], ["dia", 86400, 300]] as const;
const TIPOS_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PROMPT = 300_000, MAX_IMGS = 12, MAX_IMG_B64 = 7_000_000;

const cors = (req: Request) => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

type Imagem = { media_type: string; data: string };

Deno.serve(async (req) => {
  const resposta = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return resposta({ code: "invalid_request", message: "Método não permitido." }, 405);

  // Login e permissão: precisa estar logado e ser admin ou editor ativo da equipe.
  const url = Deno.env.get("SUPABASE_URL")!, servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!quem?.user) return resposta({ code: "funcao_login", message: "Entre no site para usar a leitura automática." }, 401);
  const { data: membro } = await admin.from("equipe").select("papel, ativo").eq("user_id", quem.user.id).maybeSingle();
  if (!membro?.ativo || !["admin", "editor"].includes(membro.papel)) return resposta({ code: "not_granted", message: "Seu usuário não tem permissão para a leitura automática." }, 403);

  // Limite de uso por pessoa.
  for (const [janela, seg, max] of LIMITES) {
    const { data: ok, error } = await admin.rpc("consumir_cota", { p_user: quem.user.id, p_janela: "ler-" + janela, p_segundos: seg, p_max: max });
    if (error) { console.error("cota", error.message); return resposta({ code: "upstream_error", message: "Erro interno. Tente de novo." }, 500); }
    if (!ok) return resposta({ code: "rate_limited", message: "Muitas leituras seguidas. Espere um pouco e tente de novo." }, 429);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return resposta({ code: "sampling_disabled", message: "Falta o segredo ANTHROPIC_API_KEY." }, 503);

  let prompt = "";
  let imagens: Imagem[] = [];
  try {
    const body = await req.json();
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    imagens = Array.isArray(body.imagens) ? body.imagens : [];
  } catch {
    return resposta({ code: "invalid_request", message: "Pedido inválido." }, 400);
  }
  if (!prompt || prompt.length > MAX_PROMPT) return resposta({ code: "invalid_request", message: "Texto vazio ou grande demais." }, 400);
  if (imagens.length > MAX_IMGS || imagens.some((i) => !i || !TIPOS_IMG.includes(i.media_type) || typeof i.data !== "string" || i.data.length > MAX_IMG_B64))
    return resposta({ code: "image_rejected", message: "Imagem inválida ou grande demais." }, 400);

  const client = new Anthropic({ apiKey });
  try {
    const params = {
      model: Deno.env.get("MODELO_CLAUDE") || "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{
        role: "user",
        content: [
          ...imagens.map((i) => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } })),
          { type: "text", text: prompt },
        ],
      }],
    };
    // deno-lint-ignore no-explicit-any
    const msg = await client.beta.messages.create(params as any);
    if (msg.stop_reason === "refusal") return resposta({ code: "refused", message: "O pedido foi recusado." }, 422);
    // deno-lint-ignore no-explicit-any
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return resposta({ text, truncated: msg.stop_reason === "max_tokens" });
  } catch (e) {
    // Detalhes do erro ficam só nos registros do Supabase; o site recebe uma mensagem genérica.
    console.error("anthropic", e instanceof Error ? e.message : String(e));
    if (e instanceof Anthropic.RateLimitError) return resposta({ code: "rate_limited", message: "Muitas leituras seguidas. Espere um pouco." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return resposta({ code: "sampling_disabled", message: "Chave da API inválida." }, 503);
    return resposta({ code: "upstream_error", message: "Não foi possível ler agora. Tente de novo." }, 502);
  }
});
