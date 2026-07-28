const TIPOS_ACADEMICOS = ["TCC", "Artigo Científico", "Relatório de Estágio", "Trabalho Acadêmico"];
 
const abasEl = document.getElementById("abas");
const paineisEl = document.getElementById("paineis");

// ---------- helpers de renderização do chat ----------

function criarMensagemUsuario(texto, nomeArquivo) {
  const msg = document.createElement("div");
  msg.className = "msg usuario";
  const bolha = document.createElement("div");
  bolha.className = "bolha";
  bolha.textContent = texto || "(sem texto, apenas arquivo anexado)";
  msg.appendChild(bolha);
  if (nomeArquivo) {
    const tag = document.createElement("div");
    tag.className = "anexo-tag";
    tag.textContent = `📎 ${nomeArquivo}`;
    msg.appendChild(tag);
  }
  return msg;
}

function criarMensagemDigitando() {
  const msg = document.createElement("div");
  msg.className = "msg assistente digitando";
  msg.innerHTML = `<div class="bolha">Escrevendo...</div>`;
  return msg;
}

function criarMensagemAssistente(texto, downloadUrl, nomeArquivo) {
  const msg = document.createElement("div");
  msg.className = "msg assistente";
  const bolha = document.createElement("div");
  bolha.className = "bolha";
  bolha.textContent = texto || "(sem texto adicional)";
  msg.appendChild(bolha);
  if (downloadUrl) {
    const baixar = document.createElement("div");
    baixar.className = "baixar";
    baixar.innerHTML = `📄 <a href="${downloadUrl}" target="_blank" rel="noopener">Baixar ${nomeArquivo}</a>`;
    msg.appendChild(baixar);
  }
  return msg;
}

function criarMensagemErro(texto) {
  const msg = document.createElement("div");
  msg.className = "msg assistente erro";
  msg.innerHTML = `<div class="bolha">${texto}</div>`;
  return msg;
}

// ---------- painel de um tipo de documento acadêmico ----------

function criarFormularioAcademico(tipo) {
  const slug = tipo.replace(/\s+/g, "-").toLowerCase();
  const painel = document.createElement("section");
  painel.className = "painel";
  painel.dataset.slug = slug;

  painel.innerHTML = `
    <details class="dados-capa">
      <summary>Dados para capa e folha de rosto (ABNT)</summary>
      <div class="grade-campos">
        <div class="campo"><label>Seu nome completo</label><input type="text" data-campo="nomeAluno" /></div>
        <div class="campo"><label>Instituição</label><input type="text" data-campo="instituicao" /></div>
        <div class="campo"><label>Curso / Disciplina</label><input type="text" data-campo="curso" /></div>
        <div class="campo"><label>Orientador(a) (opcional)</label><input type="text" data-campo="orientador" /></div>
        <div class="campo"><label>Cidade</label><input type="text" data-campo="cidade" /></div>
      </div>
    </details>

    <div class="chat-janela">
      <div class="chat-mensagens" data-el="mensagens">
        <div class="chat-vazio" data-el="vazio">Preencha os dados da capa acima e descreva aqui o tema, as orientações ou anexe um material de apoio para gerar seu ${tipo}.</div>
      </div>
      <div class="anexo-atual" data-el="anexo-atual">
        <span data-el="anexo-nome"></span>
        <button type="button" data-acao="remover-anexo">remover</button>
      </div>
      <div class="barra-envio">
        <button class="btn-icone" type="button" data-acao="anexar" title="Anexar arquivo (.txt, .docx, .pdf)">📎</button>
        <input type="file" data-campo="arquivo" accept=".txt,.docx,.pdf" />
        <textarea class="entrada-texto" rows="1" data-campo="prompt" placeholder="Descreva o tema ou as orientações do ${tipo}..."></textarea>
        <button class="btn-enviar" type="button" data-acao="gerar" title="Enviar">➤</button>
      </div>
    </div>
  `;

  const mensagensEl = painel.querySelector('[data-el="mensagens"]');
  const vazioEl = painel.querySelector('[data-el="vazio"]');
  const anexoAtualEl = painel.querySelector('[data-el="anexo-atual"]');
  const anexoNomeEl = painel.querySelector('[data-el="anexo-nome"]');
  const arquivoInput = painel.querySelector('[data-campo="arquivo"]');
  const textoInput = painel.querySelector('[data-campo="prompt"]');
  const botaoAnexar = painel.querySelector('[data-acao="anexar"]');
  const botaoRemoverAnexo = painel.querySelector('[data-acao="remover-anexo"]');
  const botaoEnviar = painel.querySelector('[data-acao="gerar"]');

  botaoAnexar.addEventListener("click", () => arquivoInput.click());

  arquivoInput.addEventListener("change", () => {
    if (arquivoInput.files[0]) {
      anexoNomeEl.textContent = `📎 ${arquivoInput.files[0].name}`;
      anexoAtualEl.style.display = "flex";
    } else {
      anexoAtualEl.style.display = "none";
    }
  });

  botaoRemoverAnexo.addEventListener("click", () => {
    arquivoInput.value = "";
    anexoAtualEl.style.display = "none";
  });

  async function enviar() {
    const campo = (nome) => painel.querySelector(`[data-campo="${nome}"]`).value;
    const textoPrompt = textoInput.value.trim();
    const arquivo = arquivoInput.files[0];

    if (!textoPrompt && !arquivo) return;
    if (!campo("nomeAluno").trim() || !campo("instituicao").trim()) {
      painel.querySelector(".dados-capa").open = true;
      mensagensEl.appendChild(criarMensagemErro("Preencha o Nome e a Instituição na seção acima para montar a capa ABNT."));
      mensagensEl.scrollTop = mensagensEl.scrollHeight;
      return;
    }

    if (vazioEl) vazioEl.remove();
    mensagensEl.appendChild(criarMensagemUsuario(textoPrompt, arquivo ? arquivo.name : null));
    const msgDigitando = criarMensagemDigitando();
    mensagensEl.appendChild(msgDigitando);
    mensagensEl.scrollTop = mensagensEl.scrollHeight;

    textoInput.value = "";
    textoInput.style.height = "auto";
    botaoEnviar.disabled = true;

    try {
      const formData = new FormData();
      formData.append("tipoDoc", tipo);
      formData.append("prompt", textoPrompt);
      formData.append("nomeAluno", campo("nomeAluno"));
      formData.append("instituicao", campo("instituicao"));
      formData.append("curso", campo("curso"));
      formData.append("orientador", campo("orientador"));
      formData.append("cidade", campo("cidade"));
      if (arquivo) formData.append("arquivo", arquivo);

      const resp = await fetch("/api/academico", { method: "POST", body: formData });
      const dados = await resp.json();

      msgDigitando.remove();

      if (!resp.ok) {
        mensagensEl.appendChild(criarMensagemErro(dados.erro || "Ocorreu um erro."));
      } else {
        mensagensEl.appendChild(criarMensagemAssistente(dados.resposta, dados.downloadUrl, dados.nomeArquivo));
      }
    } catch (e) {
      msgDigitando.remove();
      mensagensEl.appendChild(criarMensagemErro("Falha na requisição: " + e.message));
    } finally {
      arquivoInput.value = "";
      anexoAtualEl.style.display = "none";
      botaoEnviar.disabled = false;
      mensagensEl.scrollTop = mensagensEl.scrollHeight;
    }
  }

  botaoEnviar.addEventListener("click", enviar);
  textoInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      enviar();
    }
  });
  textoInput.addEventListener("input", () => {
    textoInput.style.height = "auto";
    textoInput.style.height = Math.min(textoInput.scrollHeight, 120) + "px";
  });

  return painel;
}

// ---------- painel de correção ----------

function criarPainelCorrecao() {
  const painel = document.createElement("section");
  painel.className = "painel";
  painel.dataset.slug = "correção";

  painel.innerHTML = `
    <div class="chat-janela">
      <div class="chat-mensagens" data-el="mensagens">
        <div class="chat-vazio" data-el="vazio">Envie um texto ou anexe um arquivo (trabalho ou lista de exercícios). A IA identifica o tipo de conteúdo e aplica as correções automaticamente.</div>
      </div>
      <div class="anexo-atual" data-el="anexo-atual">
        <span data-el="anexo-nome"></span>
        <button type="button" data-acao="remover-anexo">remover</button>
      </div>
      <div class="barra-envio">
        <button class="btn-icone" type="button" data-acao="anexar" title="Anexar arquivo (.txt, .docx, .pdf)">📎</button>
        <input type="file" data-campo="arquivo" accept=".txt,.docx,.pdf" />
        <textarea class="entrada-texto" rows="1" data-campo="prompt" placeholder="Cole o texto ou descreva o que deseja corrigir..."></textarea>
        <button class="btn-enviar" type="button" data-acao="corrigir" title="Enviar">➤</button>
      </div>
    </div>
  `;

  const mensagensEl = painel.querySelector('[data-el="mensagens"]');
  const vazioEl = painel.querySelector('[data-el="vazio"]');
  const anexoAtualEl = painel.querySelector('[data-el="anexo-atual"]');
  const anexoNomeEl = painel.querySelector('[data-el="anexo-nome"]');
  const arquivoInput = painel.querySelector('[data-campo="arquivo"]');
  const textoInput = painel.querySelector('[data-campo="prompt"]');
  const botaoAnexar = painel.querySelector('[data-acao="anexar"]');
  const botaoRemoverAnexo = painel.querySelector('[data-acao="remover-anexo"]');
  const botaoEnviar = painel.querySelector('[data-acao="corrigir"]');

  botaoAnexar.addEventListener("click", () => arquivoInput.click());

  arquivoInput.addEventListener("change", () => {
    if (arquivoInput.files[0]) {
      anexoNomeEl.textContent = `📎 ${arquivoInput.files[0].name}`;
      anexoAtualEl.style.display = "flex";
    } else {
      anexoAtualEl.style.display = "none";
    }
  });

  botaoRemoverAnexo.addEventListener("click", () => {
    arquivoInput.value = "";
    anexoAtualEl.style.display = "none";
  });

  async function enviar() {
    const textoPrompt = textoInput.value.trim();
    const arquivo = arquivoInput.files[0];

    if (!textoPrompt && !arquivo) return;

    if (vazioEl) vazioEl.remove();
    mensagensEl.appendChild(criarMensagemUsuario(textoPrompt, arquivo ? arquivo.name : null));
    const msgDigitando = criarMensagemDigitando();
    mensagensEl.appendChild(msgDigitando);
    mensagensEl.scrollTop = mensagensEl.scrollHeight;

    textoInput.value = "";
    textoInput.style.height = "auto";
    botaoEnviar.disabled = true;

    try {
      const formData = new FormData();
      formData.append("prompt", textoPrompt);
      if (arquivo) formData.append("arquivo", arquivo);

      const resp = await fetch("/api/correcao", { method: "POST", body: formData });
      const dados = await resp.json();

      msgDigitando.remove();

      if (!resp.ok) {
        mensagensEl.appendChild(criarMensagemErro(dados.erro || "Ocorreu um erro."));
      } else {
        mensagensEl.appendChild(criarMensagemAssistente(dados.resposta, dados.downloadUrl, dados.nomeArquivo));
      }
    } catch (e) {
      msgDigitando.remove();
      mensagensEl.appendChild(criarMensagemErro("Falha na requisição: " + e.message));
    } finally {
      arquivoInput.value = "";
      anexoAtualEl.style.display = "none";
      botaoEnviar.disabled = false;
      mensagensEl.scrollTop = mensagensEl.scrollHeight;
    }
  }

  botaoEnviar.addEventListener("click", enviar);
  textoInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      enviar();
    }
  });
  textoInput.addEventListener("input", () => {
    textoInput.style.height = "auto";
    textoInput.style.height = Math.min(textoInput.scrollHeight, 120) + "px";
  });

  return painel;
}

// ---------- montagem das abas ----------

function montarAbas() {
  const todasAsAbas = [...TIPOS_ACADEMICOS, "Correção"];

  todasAsAbas.forEach((nome, indice) => {
    const slug = nome.replace(/\s+/g, "-").toLowerCase();

    const btn = document.createElement("button");
    btn.textContent = nome;
    btn.dataset.slug = slug;
    if (indice === 0) btn.classList.add("ativa");
    btn.addEventListener("click", () => ativarAba(slug));
    abasEl.appendChild(btn);

    const painel = nome === "Correção" ? criarPainelCorrecao() : criarFormularioAcademico(nome);
    if (indice === 0) painel.classList.add("ativa");
    paineisEl.appendChild(painel);
  });
}

function ativarAba(slug) {
  document.querySelectorAll("nav.abas button").forEach((b) => b.classList.toggle("ativa", b.dataset.slug === slug));
  document.querySelectorAll("section.painel").forEach((p) => p.classList.toggle("ativa", p.dataset.slug === slug));
}

montarAbas();