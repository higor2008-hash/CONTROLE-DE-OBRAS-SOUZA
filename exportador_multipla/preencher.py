"""Preenche a Planilha Múltipla oficial (.xlsm) diretamente, sem passar pela macro de importação.

O arquivo é tratado como pacote zip: só o XML das abas que recebem dados é alterado, por
substituição pontual das células de entrada (as amarelas, desbloqueadas). Macros, botões,
proteções, formatação condicional e validações ficam exatamente como vieram da Caixa.
A planilha em branco precisa ter linhas de orçamento suficientes (a da Caixa vem com várias).
"""
import re
import zipfile
from datetime import date, datetime
from xml.sax.saxutils import escape

from openpyxl.utils import get_column_letter

from .multipla import DADOS_CAMPOS, LISTAS_DADOS, N_FRENTES, validar
from .names import resolve

NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# Colunas de entrada por item (ORÇAMENTO) e da PLQ (CÁLCULO)
ITEM_ENTRADAS = {"nivel": "M", "fonte": "P", "codigo": "Q", "bdi": "V", "recurso": "Y"}
COL_MEMORIA = "I"
COL_PRIMEIRA_FRENTE = 17  # Q


class Pacote:
    """Abas de um .xlsm em memória, editadas como texto XML."""

    def __init__(self, caminho):
        with zipfile.ZipFile(caminho) as z:
            self.infos = z.infolist()
            self.arquivos = {i.filename: z.read(i.filename) for i in self.infos}
        wb = self.arquivos["xl/workbook.xml"].decode("utf-8")
        rels = self.arquivos["xl/_rels/workbook.xml.rels"].decode("utf-8")
        alvo = {m.group(1): m.group(2) for m in re.finditer(r'<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"', rels)}
        alvo.update({m.group(2): m.group(1) for m in re.finditer(r'<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"', rels)})
        self.abas = {}
        for m in re.finditer(r'<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"', wb):
            nome = m.group(1).replace("&amp;", "&")
            self.abas[nome] = "xl/" + alvo[m.group(2)].lstrip("/").removeprefix("xl/")
        self.nomes = {}
        for m in re.finditer(r'<definedName name="([^"]+)"([^>]*)>([^<]*)</definedName>', wb):
            if "localSheetId" not in m.group(2):
                self.nomes[m.group(1)] = m.group(3).replace("&gt;", ">").replace("&lt;", "<").replace("&quot;", '"').replace("&amp;", "&")
        self._xml = {}

    def xml(self, aba):
        if aba not in self._xml:
            self._xml[aba] = self.arquivos[self.abas[aba]].decode("utf-8")
        return self._xml[aba]

    def faixa(self, nome):
        return resolve(self.nomes[nome])

    def escrever(self, aba, coluna, linha, valor, forcar=False):
        self._xml[aba] = _set_cell(self.xml(aba), coluna, linha, valor, forcar=forcar)

    def celula(self, aba, coluna, linha):
        m = re.search(rf'<c r="{coluna}{linha}"(?=[\s/>])[^>]*?(?:/>|>.*?</c>)', self.xml(aba), re.S)
        return m.group(0) if m else None

    def restaurar_padrao(self, aba, coluna, linha):
        """Copia a célula da LinhaPadrão (fórmula da Caixa) para a linha, ajustando as referências."""
        padrao = self.faixa(f"{aba}.LinhaPadrão")[2]
        origem = self.celula(aba, coluna, padrao)
        if origem is None:
            return
        nova = _traduzir_celula(origem, coluna, padrao, linha)
        self._xml[aba] = _set_cell(self.xml(aba), coluna, linha, None, forcar=True, bruto=nova)

    def salvar(self, saida):
        wb = self.arquivos["xl/workbook.xml"].decode("utf-8")
        if "<calcPr" in wb:
            wb = re.sub(r"<calcPr\b([^>]*?)\s*fullCalcOnLoad=\"[^\"]*\"", r"<calcPr\1", wb)
            wb = wb.replace("<calcPr", '<calcPr fullCalcOnLoad="1"', 1)
        else:
            wb = wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')
        self.arquivos["xl/workbook.xml"] = wb.encode("utf-8")
        for aba, texto in self._xml.items():
            self.arquivos[self.abas[aba]] = texto.encode("utf-8")
        with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
            for info in self.infos:
                z.writestr(info, self.arquivos[info.filename])
        return saida


def _traduzir_celula(xml_celula, coluna, de, para):
    from html import unescape
    from openpyxl.formula.translate import Translator

    def traduz(m):
        formula = Translator("=" + unescape(m.group(2)), origin=f"{coluna}{de}").translate_formula(f"{coluna}{para}")
        return m.group(1) + escape(formula[1:]) + m.group(3)

    nova = xml_celula.replace(f'r="{coluna}{de}"', f'r="{coluna}{para}"', 1)
    nova = nova.replace(f'ref="{coluna}{de}"', f'ref="{coluna}{para}"')
    nova = re.sub(r"(<f[^>]*>)(.*?)(</f>)", traduz, nova, flags=re.S)
    return re.sub(r"<v>.*?</v>|<v/>", "", nova)


def _col_num(letras):
    n = 0
    for ch in letras:
        n = n * 26 + ord(ch) - 64
    return n


def _celula_xml(ref, estilo, valor):
    s = f' s="{estilo}"' if estilo else ""
    if valor is None or valor == "":
        return f'<c r="{ref}"{s}/>'
    if isinstance(valor, bool):
        return f'<c r="{ref}"{s} t="b"><v>{int(valor)}</v></c>'
    if isinstance(valor, (date, datetime)):
        d = valor.date() if isinstance(valor, datetime) else valor
        valor = (d - date(1899, 12, 30)).days
    if isinstance(valor, (int, float)):
        return f'<c r="{ref}"{s}><v>{valor!r}</v></c>'
    texto = escape(str(valor))
    espaco = ' xml:space="preserve"' if texto != texto.strip() else ""
    return f'<c r="{ref}"{s} t="inlineStr"><is><t{espaco}>{texto}</t></is></c>'


def _set_cell(xml, coluna, linha, valor, forcar=False, bruto=None):
    """Troca o conteúdo de uma célula mantendo o estilo; cria a célula se não existir.

    `bruto` é o XML completo da nova célula (usado para restaurar fórmulas da linha padrão).
    """
    ref = f"{coluna}{linha}"
    m_row = re.search(rf'<row r="{linha}"(?:\s[^>]*)?(?:/>|>(.*?)</row>)', xml, re.S)
    if not m_row:
        if valor in (None, "") and bruto is None:
            return xml
        nova_linha = f'<row r="{linha}">{bruto or _celula_xml(ref, None, valor)}</row>'
        pos = None
        for m in re.finditer(r'<row r="(\d+)"', xml):
            if int(m.group(1)) > linha:
                pos = m.start()
                break
        if pos is None:
            pos = xml.index("</sheetData>") if "</sheetData>" in xml else None
            if pos is None:
                return xml.replace("<sheetData/>", f"<sheetData>{nova_linha}</sheetData>")
        return xml[:pos] + nova_linha + xml[pos:]
    corpo = m_row.group(1) or ""
    m_cel = re.search(rf'<c r="{ref}"(?=[\s/>])([^>]*?)(?:/>|>.*?</c>)', corpo, re.S)
    if m_cel:
        if "<f" in m_cel.group(0) and not forcar:
            raise ValueError(f"A célula {ref} tem fórmula; não é célula de entrada.")
        estilo = re.search(r'\ss="(\d+)"', m_cel.group(1))
        nova = bruto or _celula_xml(ref, estilo.group(1) if estilo else None, valor)
        corpo = corpo[: m_cel.start()] + nova + corpo[m_cel.end():]
    else:
        nova = bruto or _celula_xml(ref, None, valor)
        alvo = _col_num(coluna)
        pos = len(corpo)
        for m in re.finditer(r'<c r="([A-Z]+)\d+"', corpo):
            if _col_num(m.group(1)) > alvo:
                pos = m.start()
                break
        corpo = corpo[:pos] + nova + corpo[pos:]
    abertura = re.match(r"<row[^>]*?(?=/?>)", m_row.group(0)).group(0)
    return xml[: m_row.start()] + abertura + ">" + corpo + "</row>" + xml[m_row.end():]


def preencher_multipla(orc, modelo, saida):
    """Grava o orçamento nas células de entrada da Múltipla `modelo` e salva em `saida`."""
    erros = validar(orc)
    if erros:
        raise ValueError("\n".join(erros))
    pm = Pacote(modelo)

    def put(nome, valores):
        aba, c1, r1, _, _ = pm.faixa(nome)
        for i, linha in enumerate(valores):
            for j, v in enumerate(linha):
                pm.escrever(aba, get_column_letter(c1 + j), r1 + i, v)

    d = orc["dados"]
    for campo, nome in DADOS_CAMPOS.items():
        v = d.get(campo)
        if campo in ("data_base", "data_preenchimento") and isinstance(v, str):
            v = date.fromisoformat(v[:10])
        if v is not None:
            put(nome, [[v]])
    for campo, nome in LISTAS_DADOS.items():
        put(nome, [[v] for v in d.get(campo, [])])

    b = orc["bdi"]
    put("Import.BDI.Tipo1", [[b["tipo"]]])
    put("Import.BDI.Det1", [[b["parcelas"].get(k)] for k in ["AC", "SG", "R", "DF", "L", "CP"]])
    put("Import.BDI.ISS", [[b.get("iss_base")], [b.get("iss_aliquota")]])

    _, _, primeira, _, ultima = pm.faixa("Import.Nível")
    capacidade = ultima - primeira + 1
    itens = orc["itens"]
    if len(itens) > capacidade:
        raise ValueError(f"O orçamento tem {len(itens)} linhas, mas a Múltipla em branco só tem {capacidade}.")

    for i in range(capacidade):
        linha = primeira + i
        it = itens[i] if i < len(itens) else {}
        servico = it.get("nivel") == "Serviço"
        for campo, col in ITEM_ENTRADAS.items():
            v = it.get(campo)
            if campo == "codigo" and v not in (None, "") and str(v).isdigit():
                v = str(v)
            pm.escrever("ORÇAMENTO", col, linha, v if (servico or campo in ("nivel", "bdi", "recurso")) else None)
        if it and not servico:
            pm.escrever("ORÇAMENTO", "R", linha, it.get("descricao"), forcar=True)
        else:
            pm.restaurar_padrao("ORÇAMENTO", "R", linha)
        if servico and "<f" not in (pm.celula("ORÇAMENTO", "U", linha) or ""):
            pm._xml["ORÇAMENTO"] = _set_cell(pm.xml("ORÇAMENTO"), "U", linha, None, forcar=True,
                                             bruto=_celula_formula(pm.celula("ORÇAMENTO", "U", linha), "U", linha, f"AG{linha}"))
        pm.escrever("CÁLCULO", COL_MEMORIA, linha, it.get("memoria") if servico else None)
        q = it.get("quantidade_frentes", []) if servico else []
        for f in range(N_FRENTES):
            pm.escrever("CÁLCULO", get_column_letter(COL_PRIMEIRA_FRENTE + f), linha, q[f] if f < len(q) else None,
                        forcar=True)  # quantidade pode ter sido digitada como fórmula (=3*8*4)

    return pm.salvar(saida)



def _celula_formula(atual, coluna, linha, formula):
    estilo = re.search(r'\ss="(\d+)"', atual or "")
    s = f' s="{estilo.group(1)}"' if estilo else ""
    return f'<c r="{coluna}{linha}"{s}><f>{escape(formula)}</f></c>'
