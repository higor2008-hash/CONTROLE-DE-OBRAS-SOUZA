# CONTROLE-DE-OBRAS-SOUZA

Sistema de controle de obras com orçamento no formato da **Planilha Múltipla (PM v3.16)** da Caixa.

## Exportador para a Múltipla

A Múltipla tem a macro **"Importar de outra Planilha Múltipla"**, que lê os nomes definidos `Import.*`
de outro arquivo e monta o orçamento sozinha (inclusive inserindo linhas). Em vez de editar o `.xlsm`
oficial, o exportador gera um `.xlsx` simples com as mesmas abas e nomes. Basta abrir a PM em branco
e importar esse arquivo.

```bash
pip install -r requirements.txt

# Lê uma Múltipla existente e mostra o orçamento em JSON
python -m exportador_multipla ler "Minha Obra.xlsm" > obra.json

# Gera o arquivo para importar na Múltipla
python -m exportador_multipla gerar obra.json "IMPORTAR - Minha Obra.xlsx"

python -m pytest tests
```

Para importar no Excel: deixe o arquivo gerado na mesma pasta da Múltipla em branco e da
Referência do mês, abra a Múltipla e use o botão de importar de outra Planilha Múltipla no MENU.
