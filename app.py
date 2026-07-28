import io
import os
import time
import uuid
import threading

import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory, send_file, abort

from docx import Document as DocxReader
from pypdf import PdfReader

from docx_abnt import gerar_documento_word_bytes, gerar_documento_simples_bytes

load_dotenv()

# ==========================================
# CONFIGURAÇÃO DA API (Azure AI Foundry)
# ==========================================
AZURE_AI_ENDPOINT = (os.environ.get("AZURE_AI_ENDPOINT") or "").rstrip("/")
AZURE_AI_KEY = os.environ.get("AZURE_AI_KEY")
AZURE_AI_MODEL = os.environ.get("AZURE_AI_MODEL")

if not AZURE_AI_ENDPOINT or not AZURE_AI_KEY or not AZURE_AI_MODEL:
    print(
        "[AVISO] Configure AZURE_AI_ENDPOINT, AZURE_AI_KEY e AZURE_AI_MODEL "
        "no arquivo .env antes de usar a IA."
    )


def chamar_ia(prompt_texto):
    """
    Chama o endpoint de chat completions da Azure AI Foundry
    (equivalente à função chamarIA do server.js / chamar_gemini do Python original).
    """
    url = f"{AZURE_AI_ENDPOINT}/chat/completions"
    body = {
        "model": AZURE_AI_MODEL,
        "messages": [{"role": "user", "content": prompt_texto}],
    }
    headers = {
        "Content-Type": "application/json",
        "api-key": AZURE_AI_KEY,
        # Algumas configurações da Azure AI Foundry (Entra ID) esperam Bearer
        # em vez de api-key. Se necessário, troque a linha acima por:
        # "Authorization": f"Bearer {AZURE_AI_KEY}",
    }

    try:
        resp = requests.post(url, json=body, headers=headers, timeout=120)
        data = resp.json()
        if not resp.ok:
            return f"Erro na API ({resp.status_code}): {data}"
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return f"Falha na requisição: {e}"


# ==========================================
# LEITURA DE ARQUIVOS (.txt, .docx, .pdf)
# ==========================================
def ler_arquivo_bytes(buffer, nome_original):
    if not buffer:
        return ""
    ext = os.path.splitext(nome_original or "")[1].lower()

    try:
        if ext == ".txt":
            return buffer.decode("utf-8", errors="replace")

        if ext == ".docx":
            doc = DocxReader(io.BytesIO(buffer))
            return "\n".join(p.text for p in doc.paragraphs)

        if ext == ".pdf":
            reader = PdfReader(io.BytesIO(buffer))
            return "\n".join((page.extract_text() or "") for page in reader.pages)

        return ""
    except Exception as e:
        return f"[Erro ao ler o arquivo: {e}]"


# ==========================================
# CONTEXTOS DA ÁREA ACADÊMICA
# ==========================================
CONTEXTOS = {
    "TCC": (
        "Você é um especialista em TCC e normas ABNT. Gere um trabalho acadêmico completo, "
        "com conteúdo original e linguagem acadêmica.\n"
        "Estruture OBRIGATORIAMENTE nesta ordem, cada uma como seção de nível 1 (#): "
        "Resumo (com 'Palavras-chave:' ao final do parágrafo), Introdução, Desenvolvimento "
        "(pode ter subseções ##), Conclusão, Referências."
    ),
    "Trabalho Acadêmico": (
        "Você é especialista em trabalhos acadêmicos. Estruture o trabalho, melhore a escrita "
        "e organize os capítulos.\n"
        "Estruture nesta ordem, como seções de nível 1 (#): Introdução, Desenvolvimento "
        "(pode ter subseções ##), Conclusão, Referências."
    ),
    "Artigo Científico": (
        "Você é especialista em artigos científicos, seguindo a NBR 6022.\n"
        "Estruture OBRIGATORIAMENTE nesta ordem, como seções de nível 1 (#): "
        "Resumo (parágrafo único, seguido de 'Palavras-chave:'), "
        "Abstract (versão em inglês do resumo, seguido de 'Keywords:'), "
        "Introdução, Desenvolvimento (com subseções ## como Metodologia, Resultados e Discussão), "
        "Conclusão, Referências."
    ),
    "Relatório de Estágio": (
        "Você é especialista em relatórios de estágio.\n"
        "Estruture nesta ordem, como seções de nível 1 (#): Apresentação da Empresa, "
        "Atividades Desenvolvidas, Resultados Obtidos, Considerações Finais, Referências."
    ),
}

REGRA_FORMATACAO = """
IMPORTANTE - formate sua resposta usando OBRIGATORIAMENTE esta marcação,
pois ela será convertida automaticamente em um documento Word:
Use "# " no início da linha para cada seção de nível 1 (ex: "# Introdução", "# Resumo", "# Referências").
Use "## " para subseções e "### " para subitens, se necessário.
Escreva os títulos de seção SEM numeração (a numeração não é aplicada automaticamente).
Não use "#" para nada além de títulos de seção.
Não use markdown de negrito (**) ou itálico (*) no texto corrido.
Na seção de Referências, coloque cada referência em uma linha própria (sem numerar).
Não inclua capa, folha de rosto, nome do aluno ou instituição no texto: isso é gerado à parte.
"""


# ==========================================
# LÓGICA DA ÁREA DE CORREÇÃO
# ==========================================
def correcao(texto_usuario="", texto_arquivo=""):
    conteudo = ""
    if texto_usuario:
        conteudo += texto_usuario + "\n\n"
    if texto_arquivo:
        conteudo += texto_arquivo

    if not conteudo.strip():
        return "Digite um texto ou envie um arquivo para correção.", None, None

    prompt = f"""
Você é um professor universitário especialista em:
Revisão textual
Gramática
Ortografia
ABNT
Correção acadêmica

Primeiro analise automaticamente o conteúdo enviado.
Identifique se é:
• Trabalho Acadêmico
• TCC
• Artigo Científico
• Relatório
• Redação
• Lista de Exercícios
• Questionário
• Prova
• Outro

Depois siga estas regras.

====================================================
SE FOR UM TRABALHO
Corrija ortografia, gramática, clareza, coesão, normas ABNT, referências e citações.
Preserve totalmente o sentido original.

Depois produza duas partes:
PARTE 1: TEXTO CORRIGIDO
PARTE 2: SUGESTÕES DE MELHORIA (em tópicos)

====================================================
SE FOR UMA LISTA DE EXERCÍCIOS
Corrija questão por questão.
Para cada questão informe:
Questão X
Resposta Correta
Explicação
====================================================

Conteúdo enviado:
{conteudo}
"""

    resposta = chamar_ia(prompt)
    resposta_lower = resposta.lower()

    if "questão 1" in resposta_lower or "questao 1" in resposta_lower:
        buffer_docx = gerar_documento_simples_bytes(resposta)
        nome_arquivo = "questoes_corrigidas.docx"
        texto_final = resposta
    else:
        texto_corrigido = resposta
        sugestoes = ""
        if "SUGESTÕES DE MELHORIA" in resposta:
            partes = resposta.split("SUGESTÕES DE MELHORIA")
            texto_corrigido = partes[0]
            sugestoes = "SUGESTÕES DE MELHORIA\n\n" + "SUGESTÕES DE MELHORIA".join(partes[1:])
        buffer_docx = gerar_documento_simples_bytes(texto_corrigido)
        nome_arquivo = "trabalho_corrigido.docx"
        texto_final = sugestoes

    return texto_final, buffer_docx, nome_arquivo


# ==========================================
# SERVIDOR FLASK
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

# Guarda em memória os últimos documentos gerados (id -> {buffer, nomeArquivo})
documentos_gerados = {}
documentos_lock = threading.Lock()


def registrar_documento(buffer, nome_arquivo):
    doc_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    with documentos_lock:
        documentos_gerados[doc_id] = {"buffer": buffer, "nomeArquivo": nome_arquivo}

    def limpar():
        with documentos_lock:
            documentos_gerados.pop(doc_id, None)

    timer = threading.Timer(30 * 60, limpar)  # 30 min, igual ao original
    timer.daemon = True
    timer.start()
    return doc_id


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/download/<doc_id>")
def download(doc_id):
    with documentos_lock:
        item = documentos_gerados.get(doc_id)
    if not item:
        return "Arquivo não encontrado ou expirado.", 404

    return send_file(
        io.BytesIO(item["buffer"]),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name=item["nomeArquivo"],
    )


# ---- Rota: geração de documentos acadêmicos (TCC, Artigo, Relatório, Trabalho) ----
@app.route("/api/academico", methods=["POST"])
def api_academico():
    try:
        tipo_doc = request.form.get("tipoDoc", "")
        prompt = request.form.get("prompt", "")
        nome_aluno = request.form.get("nomeAluno", "")
        instituicao = request.form.get("instituicao", "")
        curso = request.form.get("curso", "")
        orientador = request.form.get("orientador", "")
        cidade = request.form.get("cidade", "")
        arquivo = request.files.get("arquivo")

        if tipo_doc not in CONTEXTOS:
            return jsonify({"erro": "Tipo de documento inválido."}), 400
        if not prompt.strip() and not arquivo:
            return jsonify({"erro": "Digite a solicitação ou envie um arquivo com as orientações do trabalho."}), 400
        if not nome_aluno.strip() or not instituicao.strip():
            return jsonify({"erro": "Preencha o Nome e a Instituição para montar a capa ABNT."}), 400

        texto_arquivo = ""
        if arquivo:
            texto_arquivo = ler_arquivo_bytes(arquivo.read(), arquivo.filename)

        prompt_completo = prompt + (f"\n\nMaterial anexado:\n{texto_arquivo}" if texto_arquivo else "")

        contexto = CONTEXTOS[tipo_doc]
        prompt_final = f"""
{contexto}

{REGRA_FORMATACAO}

Tipo de Documento: {tipo_doc}

Solicitação do usuário:
{prompt_completo}
"""

        resposta = chamar_ia(prompt_final)
        if resposta.startswith("Erro") or resposta.startswith("Falha"):
            return jsonify({"erro": resposta}), 502

        buffer_docx = gerar_documento_word_bytes(
            resposta, tipo_doc, nome_aluno, instituicao, tipo_doc,
            curso=curso, orientador=orientador, cidade=cidade or "Cidade", ano="2026",
        )

        nome_arquivo = f"{tipo_doc.lower().replace(' ', '_')}.docx"
        doc_id = registrar_documento(buffer_docx, nome_arquivo)

        return jsonify({"resposta": resposta, "downloadUrl": f"/download/{doc_id}", "nomeArquivo": nome_arquivo})
    except Exception as e:
        app.logger.exception("Erro em /api/academico")
        return jsonify({"erro": f"Falha na requisição:\n\n{e}"}), 500


# ---- Rota: correção automatizada ----
@app.route("/api/correcao", methods=["POST"])
def api_correcao():
    try:
        prompt = request.form.get("prompt", "")
        arquivo = request.files.get("arquivo")

        texto_arquivo = ""
        if arquivo:
            texto_arquivo = ler_arquivo_bytes(arquivo.read(), arquivo.filename)

        resposta, buffer_docx, nome_arquivo = correcao(prompt, texto_arquivo)

        if not buffer_docx:
            return jsonify({"resposta": resposta, "downloadUrl": None, "nomeArquivo": None})

        doc_id = registrar_documento(buffer_docx, nome_arquivo)
        return jsonify({"resposta": resposta, "downloadUrl": f"/download/{doc_id}", "nomeArquivo": nome_arquivo})
    except Exception as e:
        app.logger.exception("Erro em /api/correcao")
        return jsonify({"erro": f"Falha na requisição:\n\n{e}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=True)