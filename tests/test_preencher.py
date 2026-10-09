import copy
import json
import zipfile
from pathlib import Path

from exportador_multipla import gerar_origem, ler_multipla, preencher_multipla

BUEIRO = json.loads((Path(__file__).parent / "bueiro.json").read_text(encoding="utf-8"))


def _modelo(tmp_path):
    # Arquivo com as mesmas abas e nomes da PM v3.16, usado como modelo nos testes
    # (a Múltipla real da Caixa não vai para o repositório).
    return gerar_origem(BUEIRO, tmp_path / "modelo.xlsx")


def test_preenche_e_le_de_volta(tmp_path):
    orc = copy.deepcopy(BUEIRO)
    pedreiro = next(i for i in orc["itens"] if i.get("codigo") == "4750")
    pedreiro["quantidade_frentes"] = [100]
    pedreiro["memoria"] = "100"
    orc["itens"][0]["descricao"] = "BUEIRO NOVO"

    saida = preencher_multipla(orc, _modelo(tmp_path), tmp_path / "saida.xlsx")
    lido = ler_multipla(saida)

    assert lido["dados"] == orc["dados"]
    assert lido["bdi"] == orc["bdi"]
    assert lido["itens"][0]["descricao"] == "BUEIRO NOVO"
    assert next(i for i in lido["itens"] if i.get("codigo") == "4750")["quantidade_frentes"] == [100]


def test_so_altera_as_abas_com_dados(tmp_path):
    modelo = _modelo(tmp_path)
    saida = preencher_multipla(BUEIRO, modelo, tmp_path / "saida.xlsx")
    antes, depois = zipfile.ZipFile(modelo), zipfile.ZipFile(saida)
    assert antes.namelist() == depois.namelist()
    alteradas = {n for n in antes.namelist() if antes.read(n) != depois.read(n)}
    assert "xl/workbook.xml" in alteradas
    assert not any(n.startswith(("xl/styles", "xl/theme")) for n in alteradas)


def test_recusa_orcamento_maior_que_a_planilha(tmp_path):
    orc = copy.deepcopy(BUEIRO)
    orc["itens"] += copy.deepcopy(orc["itens"][2:])
    try:
        preencher_multipla(orc, _modelo(tmp_path), tmp_path / "saida.xlsx")
    except ValueError as e:
        assert "só tem" in str(e)
    else:
        raise AssertionError("deveria recusar")
