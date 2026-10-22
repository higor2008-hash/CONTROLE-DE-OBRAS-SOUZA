// Função do Supabase que lê documentos de obra (boletins, contratos, cronogramas) com o Claude
// e devolve o texto da resposta. Só usuários logados no site conseguem chamá-la.
// A chave da API fica no segredo ANTHROPIC_API_KEY (Edge Functions > Secrets), nunca no site.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Imagem = { media_type: string; data: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // Confere o login aqui também, para a função continuar protegida mesmo com "Verify JWT" desligado.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: quem } = token ? await sb.auth.getUser(token) : { data: { user: null } };
  if (!quem?.user) return resposta({ code: "funcao_login", message: "Entre no site para usar a leitura automática." }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return resposta({ code: "sampling_disabled", message: "Falta o segredo ANTHROPIC_API_KEY." }, 503);

  let prompt = "";
  let imagens: Imagem[] = [];
  try {
    const body = await req.json();
    prompt = String(body.prompt || "");
    imagens = Array.isArray(body.imagens) ? body.imagens.slice(0, 20) : [];
  } catch {
    return resposta({ code: "invalid_request", message: "Pedido inválido." }, 400);
  }
  if (!prompt) return resposta({ code: "invalid_request", message: "Pedido sem texto." }, 400);

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
    if (e instanceof Anthropic.RateLimitError) return resposta({ code: "rate_limited", message: e.message }, 429);
    if (e instanceof Anthropic.AuthenticationError) return resposta({ code: "sampling_disabled", message: "Chave da API inválida." }, 503);
    if (e instanceof Anthropic.APIError) return resposta({ code: "upstream_error", message: e.message }, 502);
    return resposta({ code: "upstream_error", message: String(e) }, 500);
  }
});
