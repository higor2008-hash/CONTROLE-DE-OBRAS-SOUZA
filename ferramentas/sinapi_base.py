"""Gera a base SINAPI-GO usada pela aba Orçamento (dados/sinapi/GO-AAAA-MM.json).

Aceita dois tipos de arquivo:
  1. A "Referência MM-AAAA.xlsm" (Banco de Custos 2.8), aba Banco.
  2. A planilha "SINAPI_Referência_AAAA_MM.xlsx" que a Caixa publica todo mês
     (abas ISD/ICD de insumos e CSD/CCD de composições, uma coluna de preço por UF).

Uso:
  python ferramentas/sinapi_base.py ARQUIVO.xlsx AAAA-MM [--uf GO]

Se o formato do arquivo da Caixa mudar, o script para com erro em vez de gravar
uma base incompleta.
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "dados" / "sinapi"
MINIMO = 5000  # uma base de verdade tem mais de 14 mil itens


def _norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def _preco(v):
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    if isinstance(v, str) and re.fullmatch(r"[\d.]+,\d+", v.strip()):
        return round(float(v.strip().replace(".", "").replace(",", ".")), 2)
    return None


def ler_referencia(wb):
    """Aba Banco da Referência: B fonte, C código, D descrição, E unidade, F desonerado, G não desonerado."""
    itens = {}
    for r in wb["Banco"].iter_rows(min_row=6, values_only=True):
        fonte = r[1]
        if fonte not in ("SINAPI", "SINAPI-I"):
            continue
        cod = str(r[2]).strip()
        d, n = _preco(r[5]), _preco(r[6])
        if (fonte, cod) in itens or (d is None and n is None):
            continue
        itens[(fonte, cod)] = [0 if fonte == "SINAPI" else 1, cod, str(r[3]).strip(), str(r[4] or "").strip(), d, n]
    return itens


def _cabecalho(ws, uf):
    """Acha a linha de cabeçalho com Código, Descrição, Unidade e a coluna da UF."""
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=40, values_only=True), start=1):
        nomes = [_norm(v) for v in row]
        try:
            c_cod = next(j for j, v in enumerate(nomes) if v.startswith("CODIGO"))
            c_desc = next(j for j, v in enumerate(nomes) if v.startswith("DESCRICAO"))
            c_un = next(j for j, v in enumerate(nomes) if v.startswith("UNIDADE"))
        except StopIteration:
            continue
        c_uf = next((j for j, v in enumerate(nomes) if v == uf), None)
        if c_uf is None:  # às vezes a UF está na linha de cima ou de baixo
            for k in (i - 1, i + 1):
                if k < 1:
                    continue
                outra = [_norm(v) for v in next(ws.iter_rows(min_row=k, max_row=k, values_only=True))]
                c_uf = next((j for j, v in enumerate(outra) if v == uf), None)
                if c_uf is not None:
                    break
        if c_uf is None:
            raise ValueError(f"Aba {ws.title}: não achei a coluna da UF {uf}.")
        return i, c_cod, c_desc, c_un, c_uf
    raise ValueError(f"Aba {ws.title}: não achei o cabeçalho (Código, Descrição, Unidade).")


def ler_caixa(wb, uf):
    abas = {"ISD": (1, "n"), "ICD": (1, "d"), "CSD": (0, "n"), "CCD": (0, "d")}
    faltam = [a for a in abas if a not in wb.sheetnames]
    if faltam:
        raise ValueError(f"Arquivo da Caixa sem as abas {', '.join(faltam)}. O formato mudou?")
    itens = {}
    for aba, (tipo, regime) in abas.items():
        ws = wb[aba]
        lin, c_cod, c_desc, c_un, c_uf = _cabecalho(ws, uf)
        for r in ws.iter_rows(min_row=lin + 1, values_only=True):
            cod = r[c_cod] if c_cod < len(r) else None
            if cod is None or not re.fullmatch(r"\d+", str(cod).strip()):
                continue
            cod = str(cod).strip()
            chave = ("SINAPI-I" if tipo else "SINAPI", cod)
            it = itens.setdefault(chave, [tipo, cod, str(r[c_desc]).strip(), str(r[c_un] or "").strip(), None, None])
            it[4 if regime == "d" else 5] = _preco(r[c_uf])
    return {k: v for k, v in itens.items() if v[4] is not None or v[5] is not None}


def gerar(arquivo, mes, uf="GO"):
    if not re.fullmatch(r"\d{4}-\d{2}", mes):
        raise ValueError("Mês no formato AAAA-MM.")
    wb = openpyxl.load_workbook(arquivo, read_only=True, data_only=True)
    itens = ler_referencia(wb) if "Banco" in wb.sheetnames else ler_caixa(wb, uf)
    if len(itens) < MINIMO:
        raise ValueError(f"Só {len(itens)} itens lidos; esperava mais de {MINIMO}. Base não gravada.")
    nome = f"{uf}-{mes}.json"
    doc = {"uf": uf, "mes": mes, "fonte": f"SINAPI (Caixa), preços de {uf}",
           "campos": ["fonte (0 = SINAPI, 1 = SINAPI-I)", "codigo", "descricao", "unidade", "desonerado", "naoDesonerado"],
           "itens": sorted(itens.values(), key=lambda x: (x[0], x[2]))}
    DESTINO.mkdir(parents=True, exist_ok=True)
    (DESTINO / nome).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ind_p = DESTINO / "indice.json"
    ind = json.loads(ind_p.read_text(encoding="utf-8")) if ind_p.exists() else {"uf": uf, "bases": []}
    ind["bases"] = [b for b in ind["bases"] if b["mes"] != mes] + [{"mes": mes, "arquivo": nome, "atualizadoEm": date.today().isoformat(), "origem": Path(arquivo).name}]
    ind["bases"].sort(key=lambda b: b["mes"], reverse=True)
    ind_p.write_text(json.dumps(ind, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(itens), nome


if __name__ == "__main__":
    args = sys.argv[1:]
    uf = "GO"
    if "--uf" in args:
        i = args.index("--uf"); uf = args[i + 1].upper(); del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    n, nome = gerar(args[0], args[1], uf)
    print(f"{n} itens gravados em dados/sinapi/{nome}")
