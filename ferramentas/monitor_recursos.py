"""
Monitor de recursos e repasses para Edealina (GO).

Consulta fontes públicas do governo, junta tudo em dados/recursos/edealina.json
(lido pela seção "Recursos e repasses" do site) e avisa por Telegram e/ou e-mail
quando aparece algo novo. Roda todo dia pelo robô .github/workflows/recursos-diario.yml.

Variáveis de ambiente (todas opcionais, menos a do Portal para os convênios):
  CHAVE_PORTAL                 chave da API do Portal da Transparência
  TG_TOKEN, TG_CHAT            bot do Telegram
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_PARA   e-mail
  CODIGO_IBGE                  troca o município (padrão: Edealina)
"""
import hashlib
import json
import os
import re
import smtplib
import sys
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage

import requests

MUNICIPIO = "Edealina"
UF = "GO"
CODIGO_IBGE = os.environ.get("CODIGO_IBGE") or "5207352"
ARQUIVO = os.environ.get("ARQUIVO_RECURSOS") or "dados/recursos/edealina.json"
TIMEOUT = 60
PALAVRAS_DIARIO = ["obra", "convênio", "pavimentação", "licitação", "emenda", "repasse"]
SITE = "https://higor2008-hash.github.io/CONTROLE-DE-OBRAS-SOUZA/"
HEADERS = {"User-Agent": "monitor-recursos-municipais/1.0", "Accept": "application/json"}


# ---------------------------------------------------------------- utilidades
def achar(d, *nomes):
    """Primeiro campo com um desses nomes, em qualquer nível do JSON."""
    if isinstance(d, dict):
        for n in nomes:
            if d.get(n) not in (None, "", [], {}):
                return d[n]
        for v in d.values():
            r = achar(v, *nomes)
            if r not in (None, ""):
                return r
    elif isinstance(d, list):
        for v in d:
            r = achar(v, *nomes)
            if r not in (None, ""):
                return r
    return None


def numero(v):
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def data_iso(v):
    if not v:
        return None
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def texto(v, limite=400):
    if v in (None, ""):
        return ""
    if isinstance(v, (dict, list)):
        v = achar(v, "descricao", "nome") or ""
    return re.sub(r"\s+", " ", str(v)).strip()[:limite]


def moeda(v):
    if v is None:
        return "não informado"
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def hash_id(prefixo, obj):
    return f"{prefixo}:{hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]}"


# ---------------------------------------------------------------- fontes
def convenios():
    """Convênios e contratos de repasse federais (Portal da Transparência)."""
    chave = os.environ.get("CHAVE_PORTAL")
    if not chave:
        raise RuntimeError("CHAVE_PORTAL não cadastrada; convênios não consultados")
    url = "https://api.portaldatransparencia.gov.br/api-de-dados/convenios"
    itens = []
    for pagina in range(1, 31):
        r = requests.get(url, headers={**HEADERS, "chave-api-dados": chave},
                         params={"codigoIBGE": CODIGO_IBGE, "pagina": pagina}, timeout=TIMEOUT)
        r.raise_for_status()
        dados = r.json()
        if not dados:
            break
        for c in dados:
            dim = c.get("dimConvenio") or {}
            num = texto(dim.get("numero") or achar(c, "numeroConvenio", "numero"))
            orgao = texto((c.get("orgao") or {}).get("nome") or (c.get("unidadeGestora") or {}).get("nome")
                          or achar(c, "nomeOrgao"))
            objeto = texto(dim.get("objeto") or achar(c, "objeto"), 600)
            itens.append({
                "id": f"convenio:{c.get('id') or num or hash_id('c', c)}",
                "tipo": "convenio",
                "titulo": objeto or "Convênio sem descrição",
                "numero": num,
                "orgao": orgao,
                "instrumento": texto(achar(c, "tipoInstrumento")),
                "situacao": texto(c.get("situacao") or achar(c, "situacaoConvenio")),
                "valor": numero(c.get("valor") or achar(c, "valorConvenio", "valorGlobal")),
                "liberado": numero(c.get("valorLiberado") if c.get("valorLiberado") is not None else achar(c, "valorLiberado")),
                "contrapartida": numero(achar(c, "valorContrapartida")),
                "ultimaLiberacao": data_iso(achar(c, "dataUltimaLiberacao")),
                "data": data_iso(achar(c, "dataPublicacao", "dataInicioVigencia", "dataReferencia")),
                "vigenciaFim": data_iso(achar(c, "dataFinalVigencia")),
                "url": f"https://portaldatransparencia.gov.br/convenios/{num}" if num else "https://portaldatransparencia.gov.br/convenios",
                "fonte": "Portal da Transparência",
            })
    return itens


def obras_federais():
    """Obras federais cadastradas no Obrasgov.br que citam o município."""
    url = "https://api.obrasgov.gestao.gov.br/obrasgov/api/projeto-investimento"
    itens = []
    for pagina in range(0, 300):
        r = requests.get(url, headers=HEADERS, params={"uf": UF, "pagina": pagina, "tamanhoDaPagina": 100}, timeout=TIMEOUT)
        r.raise_for_status()
        corpo = r.json()
        lista = corpo.get("content", []) if isinstance(corpo, dict) else corpo
        if not lista:
            break
        for o in lista:
            if MUNICIPIO.lower() not in json.dumps(o, ensure_ascii=False).lower():
                continue
            itens.append({
                "id": f"obra:{o.get('idUnico') or hash_id('o', o)}",
                "tipo": "obra",
                "titulo": texto(o.get("nome") or achar(o, "descricao"), 300) or "Obra sem nome",
                "descricao": texto(o.get("descricao"), 600),
                "numero": texto(o.get("idUnico")),
                "orgao": texto(achar(o, "executores", "repassadores", "tomadores")),
                "situacao": texto(o.get("situacao")),
                "valor": numero(achar(o, "valorInvestimentoPrevisto", "valor")),
                "liberado": None,
                "data": data_iso(achar(o, "dataCadastro", "dataInicialPrevista")),
                "url": "https://obrasgov.gestao.gov.br/",
                "fonte": "Obrasgov.br",
            })
        if isinstance(corpo, dict) and (corpo.get("last") is True or len(lista) < 100):
            break
    return itens


def diario_oficial():
    """Menções a obras e convênios no diário oficial do município (Querido Diário)."""
    url = "https://queridodiario.ok.org.br/api/gazettes"
    r = requests.get(url, headers=HEADERS, params={
        "territory_ids": CODIGO_IBGE,
        "querystring": " | ".join(PALAVRAS_DIARIO),
        "published_since": (date.today() - timedelta(days=60)).isoformat(),
        "excerpt_size": 300, "number_of_excerpts": 2, "size": 50,
    }, timeout=TIMEOUT)
    r.raise_for_status()
    itens = []
    for g in r.json().get("gazettes", []):
        itens.append({
            "id": f"diario:{g.get('url') or g.get('date')}",
            "tipo": "diario",
            "titulo": f"Diário oficial de {g.get('date', '')}",
            "trecho": texto(" … ".join(g.get("excerpts") or []), 600),
            "data": data_iso(g.get("date")),
            "url": g.get("url") or "",
            "fonte": "Querido Diário",
        })
    return itens


FONTES = {"convenios": convenios, "obras": obras_federais, "diario": diario_oficial}
ROTULO = {"convenios": "Convênios federais", "obras": "Obras federais (Obrasgov)", "diario": "Diário oficial"}


# ---------------------------------------------------------------- avisos
def aviso_txt(it):
    if it["tipo"] == "convenio":
        return (f"💰 Convênio federal {it.get('numero') or ''}\n{it['titulo']}\n"
                f"Valor: {moeda(it.get('valor'))} · Liberado: {moeda(it.get('liberado'))}\n"
                f"Situação: {it.get('situacao') or '-'} · {it.get('orgao') or ''}")
    if it["tipo"] == "obra":
        return f"🏗️ Obra federal (Obrasgov)\n{it['titulo']}\nSituação: {it.get('situacao') or '-'} · Valor: {moeda(it.get('valor'))}"
    return f"📰 {it['titulo']}\n{it.get('trecho', '')}\n{it.get('url', '')}"


def liberacao_txt(it, antes):
    return (f"💸 Nova liberação no convênio {it.get('numero') or ''}\n{it['titulo']}\n"
            f"Liberado: {moeda(antes)} → {moeda(it.get('liberado'))} de {moeda(it.get('valor'))}")


def enviar(assunto, corpo):
    print(f"\n=== {assunto} ===\n{corpo}")
    token, chat = os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT")
    if token and chat:
        msg = f"{assunto}\n\n{corpo}\n\n{SITE}"
        for i in range(0, len(msg), 4000):
            requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                          data={"chat_id": chat, "text": msg[i:i + 4000]}, timeout=TIMEOUT).raise_for_status()
    host, user, senha, para = (os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_PARA"))
    if host and user and senha and para:
        m = EmailMessage()
        m["Subject"], m["From"], m["To"] = assunto, user, para
        m.set_content(f"{corpo}\n\nVeja no site: {SITE}")
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT") or "587"), timeout=TIMEOUT) as s:
            s.starttls()
            s.login(user, senha)
            s.send_message(m)


# ---------------------------------------------------------------- principal
def main():
    anterior = {}
    if os.path.exists(ARQUIVO):
        with open(ARQUIVO, encoding="utf-8") as f:
            anterior = json.load(f)
    fontes_antes = anterior.get("fontes") or {}
    velhos = {it["id"]: it for it in anterior.get("itens", [])}
    hoje = date.today().isoformat()

    situacao_fontes, atuais, avisos, estreias = {}, dict(velhos), [], []
    for nome, fn in FONTES.items():
        try:
            achados = fn()
            # Na primeira vez que uma fonte responde, só registra o que já existe (sem avisar item por item)
            estreia = not fontes_antes.get(nome, {}).get("jaRespondeu")
            situacao_fontes[nome] = {"ok": True, "jaRespondeu": True, "quando": hoje, "itens": len(achados)}
            if estreia:
                estreias.append(f"{ROTULO[nome]}: {len(achados)} item(ns) registrados")
            print(f"[{nome}] {len(achados)} itens")
        except Exception as e:  # uma fonte fora do ar não derruba as outras
            antes = fontes_antes.get(nome, {})
            situacao_fontes[nome] = {"ok": False, "jaRespondeu": bool(antes.get("jaRespondeu")), "quando": antes.get("quando"),
                                     "erro": str(e)[:200], "itens": antes.get("itens", 0)}
            print(f"[{nome}] ERRO: {e}", file=sys.stderr)
            continue
        for it in achados:
            velho = velhos.get(it["id"])
            if velho is None:
                it["primeiraVez"] = hoje
                if not estreia:
                    avisos.append(aviso_txt(it))
            else:
                it["primeiraVez"] = velho.get("primeiraVez") or hoje
                if it.get("liberado") and (velho.get("liberado") or 0) < it["liberado"] - 0.005:
                    it["liberadoMudouEm"] = hoje
                    avisos.append(liberacao_txt(it, velho.get("liberado")))
                elif velho.get("liberadoMudouEm"):
                    it["liberadoMudouEm"] = velho["liberadoMudouEm"]
            atuais[it["id"]] = it

    itens = sorted(atuais.values(), key=lambda x: (x.get("primeiraVez") or "", x.get("data") or ""), reverse=True)
    saida = {
        "municipio": MUNICIPIO, "uf": UF, "codigoIbge": CODIGO_IBGE,
        "atualizadoEm": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fontes": situacao_fontes, "itens": itens,
    }
    os.makedirs(os.path.dirname(ARQUIVO), exist_ok=True)
    with open(ARQUIVO, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)

    try:
        if estreias:
            enviar(f"Monitor de recursos de {MUNICIPIO} ativado" if not fontes_antes else f"Nova fonte conectada ao monitor de {MUNICIPIO}",
                   "\n".join(estreias) + "\n\nEsses já existiam. A partir de agora aviso só o que for novo.")
        if avisos:
            enviar(f"🔔 {len(avisos)} novidade(s) de recursos para {MUNICIPIO}", "\n\n────────\n\n".join(avisos))
        if not estreias and not avisos:
            print("Nada novo hoje.")
    except Exception as e:
        print(f"Não consegui mandar o aviso: {e}", file=sys.stderr)

    if not any(f["ok"] for f in situacao_fontes.values()):
        sys.exit("Nenhuma fonte respondeu.")


if __name__ == "__main__":
    main()
