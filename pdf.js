// Geração de PDFs em papel timbrado (pdf-lib): timbrado em branco, documentos e tabelas.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const FONTES = {
  regular: fs.readFileSync(path.join(__dirname, 'assets/fontes/montserrat-latin-400-normal.woff')),
  negrito: fs.readFileSync(path.join(__dirname, 'assets/fontes/montserrat-latin-700-normal.woff')),
};

// Paleta tirada do logo da AR Consultoria (marinho, azul, ciano e azul-claro das setas).
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const COR = {
  azul: hex('#005ea4'),
  marinho: hex('#17397d'),
  ciano: hex('#20b8d5'),
  claro: hex('#b3d8eb'),
  claroFundo: hex('#eaf4fa'),
  cianoClaro: hex('#e3f6fa'),
  texto: hex('#22344a'),
  cinza: hex('#5f7287'),
  borda: hex('#cfdde8'),
  branco: rgb(1, 1, 1),
};

const A4 = { retrato: [595.28, 841.89], paisagem: [841.89, 595.28] };
const MARGEM = 40;

/** Remove caracteres que a fonte não desenha (emojis etc.). */
function limpar(texto) {
  return String(texto ?? '')
    .replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'X')
    .replace(/\t/g, ' ')
    .replace(/[^\n -~ -ÿ–—‘’“”•…€]/g, '');
}

async function novoPdf(titulo) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpar(titulo || 'AR Consultoria'));
  pdf.setProducer('AR Consultoria');
  pdf.registerFontkit(fontkit);
  const f = {
    regular: await pdf.embedFont(FONTES.regular, { subset: true }),
    negrito: await pdf.embedFont(FONTES.negrito, { subset: true }),
  };
  return { pdf, f };
}

async function embutirLogo(pdf, logo) {
  if (!logo) return null;
  try {
    const ehPng = logo[0] === 0x89 && logo[1] === 0x50;
    return ehPng ? await pdf.embedPng(logo) : await pdf.embedJpg(logo);
  } catch {
    return null;
  }
}

/** Corta o texto com "…" para caber na largura. */
function caber(texto, fonte, tamanho, largura) {
  let t = limpar(texto).replace(/\n/g, ' ');
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', tamanho) > largura) t = t.slice(0, -1);
  return t + '…';
}

/** Quebra o texto em linhas que caibam na largura. */
function quebrar(texto, fonte, tamanho, largura) {
  const linhas = [];
  for (const paragrafo of limpar(texto).split('\n')) {
    const palavras = paragrafo.split(/ +/);
    let atual = '';
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(teste, tamanho) <= largura || !atual) atual = teste;
      else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  return linhas;
}

/**
 * Desenha cabeçalho e rodapé do papel timbrado na página.
 * Retorna a área útil { topo, base, esquerda, direita } (coordenadas do PDF, origem embaixo).
 */
function desenharTimbrado(page, { f, logo, cfg, marcaDagua = false }) {
  const { width: W, height: H } = page.getSize();

  // Faixa superior azul-claro com detalhe ciano
  page.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: COR.marinho });
  page.drawRectangle({ x: W - 200, y: H - 7, width: 120, height: 7, color: COR.azul });
  page.drawRectangle({ x: W - 80, y: H - 7, width: 80, height: 7, color: COR.ciano });

  // Logo
  const altLogo = 56;
  let xTexto = MARGEM;
  if (logo) {
    const larg = logo.width * (altLogo / logo.height);
    page.drawImage(logo, { x: MARGEM, y: H - 22 - altLogo, width: larg, height: altLogo });
    xTexto = MARGEM + larg;
  }

  // Dados da empresa, alinhados à direita
  const dir = W - MARGEM;
  const linhaDir = (texto, y, tamanho, fonte, cor) => {
    const t = caber(texto, fonte, tamanho, dir - xTexto - 10);
    if (!t) return;
    page.drawText(t, { x: dir - fonte.widthOfTextAtSize(t, tamanho), y, size: tamanho, font: fonte, color: cor });
  };
  let y = H - 38;
  linhaDir(cfg.empresa_nome || 'AR Consultoria', y, 15, f.negrito, COR.marinho);
  y -= 13;
  if (cfg.empresa_subtitulo) { linhaDir(cfg.empresa_subtitulo, y, 9, f.regular, COR.azul); y -= 12; }
  const contato = [cfg.empresa_cnpj && `CNPJ ${cfg.empresa_cnpj}`, cfg.empresa_telefone].filter(Boolean).join('  •  ');
  if (contato) { linhaDir(contato, y, 8, f.regular, COR.cinza); y -= 10; }
  const web = [cfg.empresa_email, cfg.empresa_site].filter(Boolean).join('  •  ');
  if (web) linhaDir(web, y, 8, f.regular, COR.cinza);

  // Linha divisória do cabeçalho
  const yLinha = H - 90;
  page.drawLine({ start: { x: MARGEM, y: yLinha }, end: { x: W - MARGEM, y: yLinha }, thickness: 0.8, color: COR.claro });
  page.drawLine({ start: { x: MARGEM, y: yLinha }, end: { x: MARGEM + 60, y: yLinha }, thickness: 2, color: COR.ciano });

  // Marca d'água (logo bem clara no centro)
  if (marcaDagua && logo) {
    const larg = W * 0.42;
    const alt = logo.height * (larg / logo.width);
    page.drawImage(logo, { x: (W - larg) / 2, y: (H - alt) / 2 - 20, width: larg, height: alt, opacity: 0.06 });
  }

  // Rodapé
  const rodape = [cfg.empresa_endereco, cfg.rodape_extra].filter(Boolean);
  page.drawLine({ start: { x: MARGEM, y: 46 }, end: { x: W - MARGEM, y: 46 }, thickness: 0.6, color: COR.borda });
  let yr = 34;
  for (const r of rodape.slice(0, 2)) {
    const t = caber(r, f.regular, 7.5, W - 2 * MARGEM - 90);
    page.drawText(t, { x: (W - f.regular.widthOfTextAtSize(t, 7.5)) / 2, y: yr, size: 7.5, font: f.regular, color: COR.cinza });
    yr -= 10;
  }
  page.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: COR.marinho });
  page.drawRectangle({ x: 0, y: 0, width: 120, height: 6, color: COR.ciano });

  return { topo: yLinha - 22, base: 60, esquerda: MARGEM, direita: W - MARGEM };
}

function numerarPaginas(pdf, f) {
  const paginas = pdf.getPages();
  if (paginas.length < 2) return;
  paginas.forEach((p, i) => {
    const t = `Página ${i + 1} de ${paginas.length}`;
    const { width: W } = p.getSize();
    p.drawText(t, { x: W - MARGEM - f.regular.widthOfTextAtSize(t, 7.5), y: 14, size: 7.5, font: f.regular, color: COR.cinza });
  });
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

// ---------- 1. Papel timbrado em branco ----------
async function gerarTimbradoEmBranco({ cfg, logo, paginas = 1, orientacao = 'retrato' }) {
  const { pdf, f } = await novoPdf('Papel timbrado');
  const img = await embutirLogo(pdf, logo);
  for (let i = 0; i < Math.min(Math.max(paginas, 1), 20); i++) {
    const page = pdf.addPage(A4[orientacao] || A4.retrato);
    desenharTimbrado(page, { f, logo: img, cfg, marcaDagua: true });
  }
  return pdf.save();
}

// ---------- 2. Documento (ofício, declaração, comunicado…) ----------
async function gerarDocumento({ cfg, logo, doc }) {
  const { pdf, f } = await novoPdf(doc.titulo);
  const img = await embutirLogo(pdf, logo);
  let page, area, y;
  const novaPagina = () => {
    page = pdf.addPage(A4.retrato);
    area = desenharTimbrado(page, { f, logo: img, cfg, marcaDagua: true });
    y = area.topo;
  };
  novaPagina();
  const largura = area.direita - area.esquerda;
  const garantir = (altura) => { if (y - altura < area.base + 10) novaPagina(); };

  // Título
  if (doc.titulo) {
    for (const l of quebrar(doc.titulo.toUpperCase(), f.negrito, 14, largura)) {
      garantir(20);
      page.drawText(l, { x: (page.getWidth() - f.negrito.widthOfTextAtSize(l, 14)) / 2, y, size: 14, font: f.negrito, color: COR.marinho });
      y -= 20;
    }
    y -= 12;
  }

  if (doc.destinatario) {
    for (const l of quebrar(doc.destinatario, f.regular, 11, largura)) {
      garantir(16);
      page.drawText(l, { x: area.esquerda, y, size: 11, font: f.regular, color: COR.texto });
      y -= 16;
    }
    y -= 10;
  }

  // Corpo: parágrafos separados por linha em branco
  const TAM = 11, ALT = 16.5;
  const paragrafos = String(doc.corpo || '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const par of paragrafos) {
    // Cada quebra de linha manual vira um bloco; justifica todas as linhas do bloco, menos a última.
    const linhas = [];
    for (const bloco of par.trim().split('\n')) {
      const q = quebrar(bloco.trim(), f.regular, TAM, largura);
      q.forEach((l, i) => linhas.push({ l, ultima: i === q.length - 1 }));
    }
    linhas.forEach(({ l, ultima }) => {
      garantir(ALT);
      const palavras = l.split(' ');
      if (!ultima && palavras.length > 1) {
        const somaPalavras = palavras.reduce((s, p) => s + f.regular.widthOfTextAtSize(p, TAM), 0);
        const espaco = (largura - somaPalavras) / (palavras.length - 1);
        let x = area.esquerda;
        for (const p of palavras) {
          page.drawText(p, { x, y, size: TAM, font: f.regular, color: COR.texto });
          x += f.regular.widthOfTextAtSize(p, TAM) + espaco;
        }
      } else {
        page.drawText(l, { x: area.esquerda, y, size: TAM, font: f.regular, color: COR.texto });
      }
      y -= ALT;
    });
    y -= 8;
  }

  // Local e data
  const localData = doc.local_data || dataHoje();
  garantir(40);
  y -= 14;
  const ld = limpar(localData);
  page.drawText(ld, { x: area.direita - f.regular.widthOfTextAtSize(ld, TAM), y, size: TAM, font: f.regular, color: COR.texto });
  y -= 20;

  // Assinatura
  if (doc.assinatura) {
    const linhasAss = limpar(doc.assinatura).split('\n').filter(Boolean);
    garantir(60 + linhasAss.length * 14);
    y -= 40;
    const cx = page.getWidth() / 2;
    page.drawLine({ start: { x: cx - 120, y }, end: { x: cx + 120, y }, thickness: 0.7, color: COR.texto });
    y -= 14;
    linhasAss.forEach((l, i) => {
      const fonte = i === 0 ? f.negrito : f.regular;
      const t = caber(l, fonte, 10, 300);
      page.drawText(t, { x: cx - fonte.widthOfTextAtSize(t, 10) / 2, y, size: 10, font: fonte, color: COR.texto });
      y -= 13;
    });
  }

  numerarPaginas(pdf, f);
  return pdf.save();
}

// ---------- 3. Tabela (planilha de atendimento, listas, conferência…) ----------
/**
 * tabela = {
 *   titulo, subtitulo, orientacao: 'retrato'|'paisagem', tamanhoFonte,
 *   colunas: [{ titulo, largura?, alinhar?: 'esq'|'centro'|'dir', destaque? }],
 *   linhas: [[...]] ou [{ celulas: [...], negrito?: bool }],
 *   observacao?, assinaturas?: ['Nome', ...]
 * }
 */
async function gerarTabela({ cfg, logo, tabela }) {
  const { pdf, f } = await novoPdf(tabela.titulo);
  const img = await embutirLogo(pdf, logo);
  const tamanhoPagina = A4[tabela.orientacao] || A4.retrato;
  const colunas = (tabela.colunas || []).slice(0, 60);
  const linhas = (tabela.linhas || []).slice(0, 5000).map((l) => (Array.isArray(l) ? { celulas: l } : l));
  const TAM = Math.min(Math.max(Number(tabela.tamanhoFonte) || 8.5, 5.5), 12);
  const PAD = 3.5;
  const ALT_LINHA = TAM + 2 * PAD + 2;

  let page, area, y;
  const novaPagina = () => {
    page = pdf.addPage(tamanhoPagina);
    area = desenharTimbrado(page, { f, logo: img, cfg });
    y = area.topo;
  };
  novaPagina();
  const disponivel = area.direita - area.esquerda;

  // Larguras: fixas quando informadas; as demais pelo conteúdo, ajustadas para ocupar a largura útil.
  const natural = colunas.map((c, i) => {
    if (c.largura) return Number(c.largura);
    let w = f.negrito.widthOfTextAtSize(limpar(c.titulo), TAM);
    for (const l of linhas.slice(0, 400)) w = Math.max(w, f.regular.widthOfTextAtSize(limpar(l.celulas[i]), TAM));
    return Math.min(w + 2 * PAD + 2, 240);
  });
  const fixas = colunas.reduce((s, c, i) => s + (c.largura ? natural[i] : 0), 0);
  const flex = natural.reduce((s, w, i) => s + (colunas[i].largura ? 0 : w), 0);
  const sobra = disponivel - fixas;
  const larguras = natural.map((w, i) => (colunas[i].largura || flex === 0 ? w : Math.max(24, (w / flex) * sobra)));

  // Título e subtítulo
  const titulo = limpar(tabela.titulo || '');
  if (titulo) {
    page.drawText(caber(titulo, f.negrito, 13, disponivel), { x: area.esquerda, y, size: 13, font: f.negrito, color: COR.marinho });
    y -= 16;
  }
  if (tabela.subtitulo) {
    for (const l of quebrar(tabela.subtitulo, f.regular, 9, disponivel).slice(0, 3)) {
      page.drawText(l, { x: area.esquerda, y, size: 9, font: f.regular, color: COR.cinza });
      y -= 12;
    }
  }
  y -= 6;

  const celula = (texto, x, w, fonte, cor, alinhar) => {
    const t = caber(texto, fonte, TAM, w - 2 * PAD);
    const tw = fonte.widthOfTextAtSize(t, TAM);
    const tx = alinhar === 'centro' ? x + (w - tw) / 2 : alinhar === 'dir' ? x + w - PAD - tw : x + PAD;
    page.drawText(t, { x: tx, y: y - PAD - TAM + 1.5, size: TAM, font: fonte, color: cor });
  };

  const cabecalho = () => {
    let x = area.esquerda;
    page.drawRectangle({ x, y: y - ALT_LINHA, width: larguras.reduce((a, b) => a + b, 0), height: ALT_LINHA, color: COR.azul });
    colunas.forEach((c, i) => {
      celula(c.titulo, x, larguras[i], f.negrito, COR.branco, c.alinhar || 'esq');
      x += larguras[i];
    });
    y -= ALT_LINHA;
  };
  cabecalho();

  linhas.forEach((linha, idx) => {
    if (y - ALT_LINHA < area.base + 4) { novaPagina(); cabecalho(); }
    let x = area.esquerda;
    const total = larguras.reduce((a, b) => a + b, 0);
    if (linha.negrito) page.drawRectangle({ x, y: y - ALT_LINHA, width: total, height: ALT_LINHA, color: COR.claroFundo });
    else if (idx % 2 === 1) page.drawRectangle({ x, y: y - ALT_LINHA, width: total, height: ALT_LINHA, color: rgb(0.973, 0.984, 0.992) });
    colunas.forEach((c, i) => {
      if (c.destaque && !linha.negrito) page.drawRectangle({ x, y: y - ALT_LINHA, width: larguras[i], height: ALT_LINHA, color: COR.cianoClaro, opacity: 0.7 });
      celula(linha.celulas[i], x, larguras[i], linha.negrito ? f.negrito : f.regular, COR.texto, c.alinhar || 'esq');
      page.drawLine({ start: { x, y: y - ALT_LINHA }, end: { x, y }, thickness: 0.3, color: COR.borda });
      x += larguras[i];
    });
    page.drawLine({ start: { x, y: y - ALT_LINHA }, end: { x, y }, thickness: 0.3, color: COR.borda });
    page.drawLine({ start: { x: area.esquerda, y: y - ALT_LINHA }, end: { x, y: y - ALT_LINHA }, thickness: 0.3, color: COR.borda });
    y -= ALT_LINHA;
  });

  if (!linhas.length) {
    y -= 14;
    page.drawText('Nenhum registro.', { x: area.esquerda, y, size: 9, font: f.regular, color: COR.cinza });
  }

  if (tabela.observacao) {
    y -= 14;
    for (const l of quebrar(tabela.observacao, f.regular, 8, disponivel)) {
      if (y - 11 < area.base) novaPagina();
      page.drawText(l, { x: area.esquerda, y, size: 8, font: f.regular, color: COR.cinza });
      y -= 11;
    }
  }

  const assinaturas = (tabela.assinaturas || []).filter(Boolean).slice(0, 4);
  if (assinaturas.length) {
    if (y - 70 < area.base) novaPagina();
    y -= 50;
    const larg = Math.min(200, (disponivel - 30 * (assinaturas.length - 1)) / assinaturas.length);
    assinaturas.forEach((nome, i) => {
      const x = area.esquerda + i * (larg + 30);
      page.drawLine({ start: { x, y }, end: { x: x + larg, y }, thickness: 0.6, color: COR.texto });
      const t = caber(nome, f.regular, 8.5, larg);
      page.drawText(t, { x: x + (larg - f.regular.widthOfTextAtSize(t, 8.5)) / 2, y: y - 12, size: 8.5, font: f.regular, color: COR.texto });
    });
  }

  // Data de emissão no rodapé de cada página
  for (const p of pdf.getPages()) {
    const t = `Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    p.drawText(t, { x: MARGEM, y: 14, size: 7, font: f.regular, color: COR.cinza });
  }
  numerarPaginas(pdf, f);
  return pdf.save();
}

// ---------- 4. Proposta comercial ----------
const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Soma dos itens, desconto e total de uma proposta. */
function totaisProposta(p) {
  const subtotal = (p.itens || []).reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.valor) || 0), 0);
  const desconto = Math.min(Math.max(Number(p.desconto) || 0, 0), subtotal);
  return { subtotal, desconto, total: subtotal - desconto };
}

/**
 * proposta = { numero, titulo, introducao, itens: [{ descricao, qtd, valor }], desconto, condicoes, prazo, validade, criado_em }
 * cliente = { nome, contato, email, telefone, documento } (opcional)
 */
async function gerarProposta({ cfg, logo, proposta, cliente }) {
  const { pdf, f } = await novoPdf(`Proposta ${proposta.numero} - ${proposta.titulo}`);
  const img = await embutirLogo(pdf, logo);
  let page, area, y;
  const novaPagina = () => {
    page = pdf.addPage(A4.retrato);
    area = desenharTimbrado(page, { f, logo: img, cfg, marcaDagua: true });
    y = area.topo;
  };
  novaPagina();
  const largura = area.direita - area.esquerda;
  const garantir = (altura) => { if (y - altura < area.base + 10) novaPagina(); };
  const escrever = (t, { x = area.esquerda, tam = 10, fonte = f.regular, cor = COR.texto } = {}) =>
    page.drawText(t, { x, y, size: tam, font: fonte, color: cor });
  const paragrafos = (textoLivre, tam = 10, alt = 15) => {
    for (const par of String(textoLivre || '').replace(/\r/g, '').split(/\n\s*\n/)) {
      for (const bloco of par.trim().split('\n')) {
        for (const l of quebrar(bloco.trim(), f.regular, tam, largura)) {
          garantir(alt);
          escrever(l, { tam });
          y -= alt;
        }
      }
      y -= 6;
    }
  };
  const secao = (titulo) => {
    garantir(40);
    y -= 6;
    page.drawRectangle({ x: area.esquerda, y: y - 3, width: 4, height: 14, color: COR.ciano });
    escrever(limpar(titulo).toUpperCase(), { x: area.esquerda + 10, tam: 10, fonte: f.negrito, cor: COR.marinho });
    y -= 20;
  };

  // Cabeçalho da proposta: título à esquerda, número/datas em uma caixa à direita.
  const caixaL = 170;
  page.drawRectangle({ x: area.direita - caixaL, y: y - 50, width: caixaL, height: 58, color: COR.claroFundo, borderColor: COR.claro, borderWidth: 0.8 });
  const info = [
    ['Proposta', proposta.numero],
    ['Emissão', dataCurta(proposta.criado_em) || dataCurta(new Date().toISOString())],
    ['Validade', dataCurta(proposta.validade) || '-'],
  ];
  info.forEach(([k, v], i) => {
    const yy = y - 6 - i * 16;
    page.drawText(k, { x: area.direita - caixaL + 10, y: yy, size: 8, font: f.regular, color: COR.cinza });
    const t = limpar(v);
    page.drawText(t, { x: area.direita - 10 - f.negrito.widthOfTextAtSize(t, 9), y: yy, size: 9, font: f.negrito, color: COR.marinho });
  });
  escrever('PROPOSTA COMERCIAL', { tam: 9, fonte: f.negrito, cor: COR.ciano });
  y -= 18;
  for (const l of quebrar(proposta.titulo || '', f.negrito, 15, largura - caixaL - 20).slice(0, 3)) {
    escrever(l, { tam: 15, fonte: f.negrito, cor: COR.marinho });
    y -= 19;
  }
  y = Math.min(y, area.topo - 66) - 8;

  // Cliente
  if (cliente) {
    secao('Para');
    escrever(caber(cliente.nome, f.negrito, 11, largura), { tam: 11, fonte: f.negrito });
    y -= 14;
    const linhas = [
      [cliente.contato && `A/C ${cliente.contato}`, cliente.documento].filter(Boolean).join('  •  '),
      [cliente.email, cliente.telefone].filter(Boolean).join('  •  '),
    ].filter(Boolean);
    for (const l of linhas) { escrever(caber(l, f.regular, 9, largura), { tam: 9, cor: COR.cinza }); y -= 13; }
    y -= 4;
  }

  if (proposta.introducao) { secao('Apresentação'); paragrafos(proposta.introducao); }

  // Itens
  secao('Investimento');
  const cols = [
    { t: 'Descrição', w: largura - 60 - 90 - 95, al: 'esq' },
    { t: 'Qtd.', w: 60, al: 'centro' },
    { t: 'Valor unitário', w: 90, al: 'dir' },
    { t: 'Total', w: 95, al: 'dir' },
  ];
  const PAD = 6;
  const celula = (t, x, w, al, fonte, cor, tam = 9) => {
    const tt = caber(t, fonte, tam, w - 2 * PAD);
    const tw = fonte.widthOfTextAtSize(tt, tam);
    const tx = al === 'centro' ? x + (w - tw) / 2 : al === 'dir' ? x + w - PAD - tw : x + PAD;
    page.drawText(tt, { x: tx, y, size: tam, font: fonte, color: cor });
  };
  const cabItens = () => {
    garantir(40);
    page.drawRectangle({ x: area.esquerda, y: y - 7, width: largura, height: 22, color: COR.marinho });
    y += 1;
    let x = area.esquerda;
    for (const c of cols) { celula(c.t, x, c.w, c.al, f.negrito, COR.branco, 8.5); x += c.w; }
    y -= 23;
  };
  cabItens();
  (proposta.itens || []).forEach((it, idx) => {
    const linhasDesc = quebrar(it.descricao || '', f.regular, 9, cols[0].w - 2 * PAD).slice(0, 6);
    const alt = Math.max(1, linhasDesc.length) * 12 + 10;
    if (y - alt < area.base + 10) { novaPagina(); cabItens(); }
    if (idx % 2 === 1) page.drawRectangle({ x: area.esquerda, y: y - alt + 13, width: largura, height: alt, color: rgb(0.973, 0.984, 0.992) });
    const yTopo = y;
    linhasDesc.forEach((l, i) => { y = yTopo - i * 12; celula(l, area.esquerda, cols[0].w, 'esq', f.regular, COR.texto); });
    y = yTopo;
    let x = area.esquerda + cols[0].w;
    const qtd = Number(it.qtd) || 0, valor = Number(it.valor) || 0;
    celula(qtd.toLocaleString('pt-BR'), x, cols[1].w, 'centro', f.regular, COR.texto); x += cols[1].w;
    celula(moeda(valor), x, cols[2].w, 'dir', f.regular, COR.texto); x += cols[2].w;
    celula(moeda(qtd * valor), x, cols[3].w, 'dir', f.negrito, COR.texto);
    y -= alt;
    page.drawLine({ start: { x: area.esquerda, y: y + 13 }, end: { x: area.direita, y: y + 13 }, thickness: 0.4, color: COR.borda });
  });

  // Totais
  const { subtotal, desconto, total } = totaisProposta(proposta);
  garantir(70);
  y -= 6;
  const xRot = area.direita - 230;
  const linhaTotal = (rot, val) => {
    page.drawText(rot, { x: xRot, y, size: 9, font: f.regular, color: COR.cinza });
    const t = moeda(val);
    page.drawText(t, { x: area.direita - PAD - f.regular.widthOfTextAtSize(t, 9), y, size: 9, font: f.regular, color: COR.texto });
    y -= 15;
  };
  if (desconto) { linhaTotal('Subtotal', subtotal); linhaTotal('Desconto', -desconto); y -= 12; }
  page.drawRectangle({ x: xRot - 10, y: y - 10, width: area.direita - xRot + 10, height: 28, color: COR.azul });
  page.drawText('TOTAL', { x: xRot, y: y, size: 10, font: f.negrito, color: COR.branco });
  const tt = moeda(total);
  page.drawText(tt, { x: area.direita - PAD - f.negrito.widthOfTextAtSize(tt, 13), y: y - 1, size: 13, font: f.negrito, color: COR.branco });
  y -= 34;

  if (proposta.prazo) { secao('Prazo de entrega'); paragrafos(proposta.prazo); }
  if (proposta.condicoes) { secao('Condições de pagamento'); paragrafos(proposta.condicoes); }

  // Assinaturas
  garantir(90);
  y -= 46;
  const larg = (largura - 40) / 2;
  const assinatura = (x, l1, l2) => {
    page.drawLine({ start: { x, y }, end: { x: x + larg, y }, thickness: 0.6, color: COR.texto });
    const a = caber(l1, f.negrito, 9, larg), b = caber(l2, f.regular, 8, larg);
    page.drawText(a, { x: x + (larg - f.negrito.widthOfTextAtSize(a, 9)) / 2, y: y - 13, size: 9, font: f.negrito, color: COR.texto });
    page.drawText(b, { x: x + (larg - f.regular.widthOfTextAtSize(b, 8)) / 2, y: y - 25, size: 8, font: f.regular, color: COR.cinza });
  };
  assinatura(area.esquerda, cfg.responsavel_nome || cfg.empresa_nome || 'AR Consultoria', [cfg.responsavel_cargo, cfg.empresa_nome].filter(Boolean).join(' · '));
  assinatura(area.esquerda + larg + 40, cliente?.contato || cliente?.nome || 'Cliente', 'De acordo · data: ____/____/______');

  numerarPaginas(pdf, f);
  return pdf.save();
}

// ---------- 5. Portfólio (apresentação em A4 paisagem) ----------
/** Retângulo com cantos arredondados; (x, y) = canto inferior esquerdo, como no pdf-lib. */
function retArred(page, x, y, w, h, r, opcoes) {
  r = Math.min(r, w / 2, h / 2);
  const d = `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`;
  page.drawSvgPath(d, { x, y: y + h, ...opcoes });
}

/** Encaixa a imagem dentro da caixa mantendo a proporção. */
function encaixar(img, w, h) {
  const k = Math.min(w / img.width, h / img.height);
  return { width: img.width * k, height: img.height * k };
}

// Ícones dos serviços (traço, grade 24x24, y para baixo como no SVG).
const ICONES_PDF = {
  grafico: 'M3 3v18h18 M19 9l-5 5-4-4-3 3',
  painel: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  raio: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  app: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01',
  capelo: 'M22 10 12 5 2 10l10 5 10-5z M6 12v5c3 3 9 3 12 0v-5',
  alvo: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
  estrela: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  dinheiro: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
};

const MESES_PDF = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TIPOS_VITRINE = { aplicativo: 'Aplicativo', sistema: 'Sistema web', painel: 'Painel / dashboard', ferramenta: 'Ferramenta', projeto: 'Projeto' };

/** Desenho genérico de um app (usado quando o item não tem print da tela). */
function desenharMockup(page, x, y, w, h) {
  retArred(page, x, y, w, h, 14, { color: hex('#0b1530') });
  retArred(page, x, y + h - 24, w, 24, 12, { color: hex('#16224a') });
  page.drawRectangle({ x, y: y + h - 24, width: w, height: 10, color: hex('#16224a') });
  [0, 1, 2].forEach((i) => page.drawCircle({ x: x + 16 + i * 13, y: y + h - 12, size: 3.6, color: [hex('#ef6b6b'), hex('#f2c14e'), hex('#4fc48a')][i] }));
  const pad = 16, gap = 10;
  const kw = (w - 2 * pad - 2 * gap) / 3;
  const cores = [hex('#34d399'), hex('#fbbf24'), hex('#60a5fa')];
  for (let i = 0; i < 3; i++) {
    const kx = x + pad + i * (kw + gap), ky = y + h - 24 - pad - 46;
    retArred(page, kx, ky, kw, 46, 9, { color: hex('#1a2550') });
    page.drawRectangle({ x: kx + 10, y: ky + 30, width: kw * 0.45, height: 4, color: hex('#3b4a7a') });
    page.drawRectangle({ x: kx + 10, y: ky + 12, width: kw * 0.6, height: 9, color: cores[i] });
  }
  const gy = y + pad, gh = h - 24 - pad - 46 - pad - gap - 4;
  retArred(page, x + pad, gy, w - 2 * pad, gh, 9, { color: hex('#141f45') });
  const barras = [0.45, 0.62, 0.38, 0.74, 0.58, 0.86, 0.66, 0.92, 0.7, 0.8];
  const bw = (w - 2 * pad - 24) / barras.length;
  barras.forEach((v, i) => {
    page.drawRectangle({ x: x + pad + 12 + i * bw + bw * 0.18, y: gy + 12, width: bw * 0.64, height: (gh - 26) * v, color: i % 2 ? COR.ciano : hex('#6366f1') });
  });
}

/**
 * Portfólio em PDF.
 * servicos: [{ nome, resumo, descricao }]; itens: [{ nome, tipo, slogan, descricao, recursos, publico, link, link_repo, tecnologias, destaque, imagem? (Buffer) }]
 */
async function gerarPortfolio({ cfg, logo, servicos = [], itens = [], clientes = [], para = '', sobre = true, contato = true }) {
  const { pdf, f } = await novoPdf(`${cfg.portfolio_titulo || 'Portfólio'} - ${cfg.empresa_nome || 'AR Consultoria'}`);
  const img = await embutirLogo(pdf, logo);
  const [W, H] = A4.paisagem;
  const M = 48;
  const LARG = W - 2 * M;
  const hoje = new Date();
  const mesAno = `${MESES_PDF[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  let nSecao = 0;

  const texto = (page, t, x, y, tam, fonte = f.regular, cor = COR.texto) => page.drawText(limpar(t), { x, y, size: tam, font: fonte, color: cor });
  const centro = (page, t, cx, y, tam, fonte, cor) => { const tt = limpar(t); page.drawText(tt, { x: cx - fonte.widthOfTextAtSize(tt, tam) / 2, y, size: tam, font: fonte, color: cor }); };
  /** Escreve um bloco de texto quebrado; devolve o y abaixo do bloco. */
  const bloco = (page, t, x, y, largura, tam, { fonte = f.regular, cor = COR.texto, alt = tam * 1.5, max = 99 } = {}) => {
    let linhas = [];
    for (const par of String(t || '').replace(/\r/g, '').split('\n')) linhas.push(...quebrar(par, fonte, tam, largura));
    if (linhas.length > max) { linhas = linhas.slice(0, max); linhas[max - 1] = caber(linhas[max - 1] + '…', fonte, tam, largura); }
    for (const l of linhas) { page.drawText(l, { x, y, size: tam, font: fonte, color: cor }); y -= alt; }
    return y;
  };

  // Imagens embutidas uma única vez (o mesmo print pode aparecer na capa e na página do item).
  const cacheImg = new Map();
  const embutir = async (bytes) => {
    if (!bytes) return null;
    if (!cacheImg.has(bytes)) { let im = null; try { im = await embutirLogo(pdf, bytes); } catch { im = null; } cacheImg.set(bytes, im); }
    return cacheImg.get(bytes);
  };

  /**
   * Print da tela dentro de uma moldura de navegador, encaixado na caixa (x, y = canto inferior esquerdo).
   * alinhar: 'centro' | 'esq' | 'dir' | 'topo'. Retorna a área ocupada { x, y, w, h } ou null.
   */
  const navegador = (page, im, x, y, w, h, { alinhar = 'centro', sombra = true } = {}) => {
    const BAR = Math.max(10, Math.min(16, w * 0.035));
    const { width, height } = encaixar(im, w, h - BAR);
    const fw = width, fh = height + BAR;
    const fx = alinhar === 'esq' ? x : alinhar === 'dir' ? x + w - fw : x + (w - fw) / 2;
    const fy = alinhar === 'topo' ? y + h - fh : y + (h - fh) / 2;
    if (sombra) {
      retArred(page, fx + 3, fy - 5, fw, fh, 9, { color: COR.marinho, opacity: 0.10 });
      retArred(page, fx + 1.5, fy - 2.5, fw, fh, 9, { color: COR.marinho, opacity: 0.10 });
    }
    retArred(page, fx, fy, fw, fh, 8, { color: hex('#e9eef4'), borderColor: COR.borda, borderWidth: 0.6 });
    [hex('#ef6b6b'), hex('#f2c14e'), hex('#4fc48a')].forEach((c, i) => page.drawCircle({ x: fx + 9 + i * (BAR * 0.62), y: fy + fh - BAR / 2, size: BAR * 0.17, color: c }));
    retArred(page, fx + fw * 0.3, fy + fh - BAR + BAR * 0.22, fw * 0.4, BAR * 0.56, BAR * 0.28, { color: COR.branco });
    page.drawImage(im, { x: fx, y: fy, width, height });
    return { x: fx, y: fy, w: fw, h: fh };
  };

  /** Desenha o print (ou a ilustração genérica, se o item não tiver imagem). */
  const telaOuMockup = async (page, bytes, x, y, w, h, opcoes) => {
    const im = await embutir(bytes);
    if (im) return navegador(page, im, x, y, w, h, opcoes);
    desenharMockup(page, x, y, w, h);
    return { x, y, w, h };
  };

    // Página interna: rótulo da seção, título, marca no canto e rodapé.
  const paginaInterna = (rotulo, titulo) => {
    const page = pdf.addPage(A4.paisagem);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: COR.marinho });
    page.drawRectangle({ x: W - 160, y: H - 6, width: 100, height: 6, color: COR.azul });
    page.drawRectangle({ x: W - 60, y: H - 6, width: 60, height: 6, color: COR.ciano });
    nSecao++;
    texto(page, `${String(nSecao).padStart(2, '0')}  ·  ${rotulo.toUpperCase()}`, M, H - 52, 9, f.negrito, COR.ciano);
    texto(page, caber(titulo, f.negrito, 24, LARG - 160), M, H - 82, 24, f.negrito, COR.marinho);
    page.drawRectangle({ x: M, y: H - 96, width: 46, height: 3, color: COR.ciano });
    if (img) {
      const { width, height } = encaixar(img, 120, 46);
      page.drawImage(img, { x: W - M - width, y: H - 34 - height, width, height });
    }
    page.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: COR.borda });
    texto(page, `${cfg.empresa_nome || 'AR Consultoria'}  ·  ${cfg.portfolio_titulo || 'Portfólio'}`, M, 20, 8, f.regular, COR.cinza);
    return page;
  };

  // ===== Capa =====
  {
    const page = pdf.addPage(A4.paisagem);
    const LP = W * 0.5;
    page.drawRectangle({ x: 0, y: 0, width: LP, height: H, color: COR.marinho });
    // setas decorativas em diagonal
    for (let i = 0; i < 6; i++) {
      page.drawLine({ start: { x: LP - 260 + i * 34, y: -10 }, end: { x: LP + 40 + i * 34, y: H * 0.62 }, thickness: 14, color: COR.azul, opacity: 0.18 - i * 0.022 });
    }
    page.drawRectangle({ x: LP - 8, y: 0, width: 8, height: H, color: COR.ciano });
    let y = H - 92;
    texto(page, (cfg.portfolio_titulo || 'Portfólio').toUpperCase(), M, y, 10, f.negrito, COR.ciano);
    y -= 44;
    texto(page, 'Olá! Meu nome é', M, y, 15, f.regular, COR.claro);
    y -= 34;
    for (const l of quebrar(cfg.responsavel_nome || cfg.empresa_nome || '', f.negrito, 30, LP - 2 * M).slice(0, 2)) {
      texto(page, l, M, y, 30, f.negrito, COR.branco); y -= 36;
    }
    y -= 6;
    y = bloco(page, cfg.portfolio_chamada || cfg.responsavel_cargo || '', M, y, LP - 2 * M - 10, 11, { fonte: f.negrito, cor: COR.claro, alt: 16, max: 4 });
    y -= 10;
    bloco(page, cfg.portfolio_frase || '', M, y, LP - 2 * M - 10, 10.5, { cor: COR.branco, alt: 16, max: 5 });
    if (para) {
      retArred(page, M, 74, LP - 2 * M - 10, 46, 10, { color: COR.azul });
      texto(page, 'PREPARADO PARA', M + 16, 102, 8, f.negrito, COR.claro);
      texto(page, caber(para, f.negrito, 13, LP - 2 * M - 42), M + 16, 84, 13, f.negrito, COR.branco);
    }
    texto(page, mesAno[0].toUpperCase() + mesAno.slice(1), M, 44, 9, f.regular, COR.claro);
    // Lado direito: logo e uma colagem com os prints dos projetos em destaque.
    const prints = [];
    for (const it of itens.filter((i) => i.destaque)) for (const b of it.imagens || []) if (prints.length < 3 && b) { const im = await embutir(b); if (im) { prints.push(im); break; } }
    const xR = LP + 34, wR = W - LP - 34 - 34;
    if (img) {
      const { width, height } = encaixar(img, prints.length ? 230 : wR, prints.length ? 96 : H * 0.46);
      const ly = prints.length ? H - 54 - height : H / 2 - height / 2 + 30;
      page.drawImage(img, { x: LP + (W - LP - width) / 2, y: ly, width, height });
    }
    if (prints.length) {
      const base = 120, topo = H - 176;
      const hh = topo - base;
      if (prints[0]) navegador(page, prints[0], xR, base + hh * 0.32, wR * 0.80, hh * 0.68, { alinhar: 'esq' });
      if (prints[1]) navegador(page, prints[1], xR + wR * 0.42, base + hh * 0.06, wR * 0.58, hh * 0.52, { alinhar: 'dir' });
      if (prints[2]) navegador(page, prints[2], xR, base - 6, wR * 0.44, hh * 0.38, { alinhar: 'esq' });
    }
    const cx = LP + (W - LP) / 2;
    const contatos = [cfg.empresa_telefone, cfg.empresa_email].filter(Boolean).join('   •   ');
    if (contatos) centro(page, contatos, cx, prints.length ? 74 : 80, 10, f.regular, COR.cinza);
    const redes = [cfg.instagram && `@${cfg.instagram}`, cfg.linkedin && `in/${cfg.linkedin}`].filter(Boolean).join('   •   ');
    if (redes) centro(page, redes, cx, prints.length ? 58 : 62, 10, f.regular, COR.cinza);
  }

  // ===== Sobre =====
  if (sobre) {
    const page = paginaInterna('Sobre mim', cfg.responsavel_nome ? `Conheça ${cfg.responsavel_nome.split(' ')[0]}` : 'Sobre a consultoria');
    const topo = H - 130;
    // coluna da esquerda: destaque de anos e empresas
    const LC = 230;
    retArred(page, M, topo - 120, LC, 120, 16, { color: COR.claroFundo });
    texto(page, cfg.portfolio_anos || '10+', M + 20, topo - 62, 46, f.negrito, COR.azul);
    bloco(page, 'anos de experiência profissional', M + 20, topo - 88, LC - 40, 10, { fonte: f.negrito, cor: COR.marinho, alt: 13 });
    let y = topo - 146;
    const empresas = String(cfg.portfolio_empresas || '').split(',').map((e) => e.trim()).filter(Boolean);
    if (empresas.length) {
      texto(page, 'EMPRESAS EM QUE ATUEI', M, y, 8, f.negrito, COR.cinza);
      y -= 12;
      let x = M;
      for (const e of empresas.slice(0, 12)) {
        const w = f.negrito.widthOfTextAtSize(limpar(e), 9) + 20;
        if (x + w > M + LC) { x = M; y -= 26; }
        retArred(page, x, y - 18, w, 20, 10, { borderColor: COR.claro, borderWidth: 1, color: COR.branco });
        texto(page, e, x + 10, y - 11.5, 9, f.negrito, COR.marinho);
        x += w + 6;
      }
    }
    // coluna da direita: texto
    const xT = M + LC + 36;
    bloco(page, cfg.portfolio_sobre || '', xT, topo - 12, W - M - xT, 12.5, { alt: 21, max: 9 });
    // habilidades
    const hab = String(cfg.portfolio_habilidades || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((l) => l[0]).slice(0, 4);
    if (hab.length) {
      const gap = 14, hy = 52, hh = 150;
      const hw = (LARG - gap * (hab.length - 1)) / hab.length;
      hab.forEach(([t, d], i) => {
        const x = M + i * (hw + gap);
        retArred(page, x, hy, hw, hh, 14, { color: COR.branco, borderColor: COR.borda, borderWidth: 1 });
        page.drawRectangle({ x: x + 16, y: hy + hh - 20, width: 26, height: 4, color: i % 2 ? COR.azul : COR.ciano });
        const yy = bloco(page, (t || '').toUpperCase(), x + 16, hy + hh - 40, hw - 32, 10.5, { fonte: f.negrito, cor: COR.marinho, alt: 14, max: 2 });
        bloco(page, d || '', x + 16, yy - 6, hw - 32, 9.5, { cor: COR.texto, alt: 14, max: 5 });
      });
    }
  }

  // ===== Serviços =====
  if (servicos.length) {
    const POR_PAGINA = 6;
    for (let p0 = 0; p0 < servicos.length; p0 += POR_PAGINA) {
      const page = paginaInterna('Como posso te ajudar', p0 ? 'Serviços (continuação)' : 'Serviços');
      const lote = servicos.slice(p0, p0 + POR_PAGINA);
      const colunas = lote.length <= 4 && servicos.length <= 4 ? 2 : 3;
      const linhas = Math.ceil(lote.length / colunas);
      const gap = 16, topo = H - 124, base = 50;
      const cw = (LARG - gap * (colunas - 1)) / colunas;
      const ch = (topo - base - gap * (linhas - 1)) / linhas;
      lote.forEach((sv, i) => {
        const x = M + (i % colunas) * (cw + gap);
        const y = topo - Math.floor(i / colunas) * (ch + gap) - ch;
        retArred(page, x, y, cw, ch, 16, { color: i % 2 ? COR.branco : COR.claroFundo, borderColor: COR.borda, borderWidth: 1 });
        retArred(page, x + 16, y + ch - 52, 36, 36, 10, { color: i % 2 ? COR.azul : COR.marinho });
        const icone = ICONES_PDF[sv.icone] || ICONES_PDF.estrela;
        page.drawSvgPath(icone, { x: x + 22, y: y + ch - 22, scale: 1, borderColor: COR.branco, borderWidth: 1.8, borderLineCap: 1 });
        const yy = bloco(page, (sv.nome || '').toUpperCase(), x + 62, y + ch - 30, cw - 80, 11, { fonte: f.negrito, cor: COR.marinho, alt: 14, max: 2 });
        const yTexto = Math.min(yy, y + ch - 62) - 6;
        const corpo = [sv.resumo, sv.descricao && sv.descricao !== sv.resumo ? sv.descricao : ''].filter(Boolean).join('\n');
        const maxLinhas = Math.max(1, Math.floor((yTexto - y - 14) / 14));
        bloco(page, corpo, x + 20, yTexto, cw - 40, 9.5, { cor: COR.texto, alt: 14, max: maxLinhas });
      });
    }
  }

  // ===== Clientes atendidos =====
  if (clientes.length) {
    const POR_PAGINA = 9;
    for (let p0 = 0; p0 < clientes.length; p0 += POR_PAGINA) {
      const page = paginaInterna('Clientes', p0 ? 'Clientes atendidos (continuação)' : 'Clientes atendidos');
      texto(page, 'Empresas que já contam com soluções da AR Consultoria.', M, H - 118, 10.5, f.regular, COR.cinza);
      const lote = clientes.slice(p0, p0 + POR_PAGINA);
      const colunas = lote.length <= 2 ? lote.length : 3;
      const linhas = Math.ceil(lote.length / colunas);
      const gap = 16, topo = H - 136, base = 50;
      const cw = (LARG - gap * (colunas - 1)) / colunas;
      const ch = Math.min(150, (topo - base - gap * (linhas - 1)) / linhas);
      for (const [i, c] of lote.entries()) {
        const x = M + (i % colunas) * (cw + gap);
        const y = topo - Math.floor(i / colunas) * (ch + gap) - ch;
        retArred(page, x, y, cw, ch, 16, { color: COR.branco, borderColor: COR.borda, borderWidth: 1 });
        page.drawRectangle({ x, y: y + 16, width: 4, height: ch - 32, color: COR.ciano });
        // Logo do cliente (imagem do case) no canto direito
        let reserva = 0;
        if (c.logo) {
          const im = await embutir(c.logo);
          if (im) {
            const lado = Math.min(90, ch - 30);
            const { width, height } = encaixar(im, lado, lado);
            page.drawImage(im, { x: x + cw - 18 - lado + (lado - width) / 2, y: y + (ch - height) / 2, width, height });
            reserva = lado + 14;
          }
        }
        let yy = y + ch - 30;
        yy = bloco(page, c.nome, x + 22, yy, cw - 44 - reserva, 13, { fonte: f.negrito, cor: COR.marinho, alt: 16, max: 2 });
        const sub = [c.segmento, c.cidade].filter(Boolean).join('  ·  ');
        if (sub) { texto(page, caber(sub, f.regular, 9, cw - 44 - reserva), x + 22, yy - 2, 9, f.regular, COR.cinza); yy -= 16; }
        if (c.casos?.length) {
          texto(page, 'O QUE FOI ENTREGUE', x + 22, yy - 6, 7.5, f.negrito, COR.ciano);
          yy -= 20;
          for (const caso of c.casos.slice(0, 3)) {
            if (yy < y + 12) break;
            page.drawCircle({ x: x + 26, y: yy + 3, size: 2.6, color: COR.azul });
            texto(page, caber(caso, f.negrito, 9, cw - 56 - reserva), x + 34, yy, 9, f.negrito, COR.texto);
            yy -= 14;
          }
        }
      }
    }
  }

  // ===== Destaques (um por página: Vértice, case da Hessel etc.) =====
  const destaques = itens.filter((i) => i.destaque);
  const outros = itens.filter((i) => !i.destaque);
  for (const it of destaques) {
    const rotulo = it.cliente ? `Case · ${it.cliente}` : it.realizado_em ? `${TIPOS_VITRINE[it.tipo] || 'Projeto'} · ${it.realizado_em}` : (TIPOS_VITRINE[it.tipo] || 'Destaque');
    const page = paginaInterna(rotulo, it.nome);
    const recursos = String(it.recursos || '').split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 9);
    const faixa = recursos.length ? 132 : 0; // faixa de recursos no rodapé
    const topo = H - 116, base = 44 + faixa + (faixa ? 14 : 0);
    // coluna da esquerda: textos
    const LC = LARG * 0.38;
    let y = topo;
    if (it.slogan) { y = bloco(page, it.slogan, M, y - 4, LC, 12.5, { fonte: f.negrito, cor: COR.azul, alt: 16, max: 3 }); y -= 6; }
    const meta = [['Cliente', it.cliente], ['Desenvolvido na', !it.cliente && it.realizado_em], ['Para quem', it.publico], ['Tecnologias', it.tecnologias],
      ['Acesse', it.link], ['Código', !it.link ? it.link_repo : '']].filter(([, v]) => v);
    const linhasMeta = meta.length * 26;
    y = bloco(page, it.descricao || '', M, y - 2, LC, 9.5, { alt: 14, max: Math.max(3, Math.floor((y - base - linhasMeta - 8) / 14)) });
    y -= 6;
    for (const [k, v] of meta) {
      if (y < base + 8) break;
      texto(page, k.toUpperCase(), M, y, 7, f.negrito, COR.ciano);
      const link = /^https?:\/\//.test(v);
      y = link ? (texto(page, caber(v.replace(/^https?:\/\//, ''), f.negrito, 8.5, LC), M, y - 11, 8.5, f.negrito, COR.azul), y - 22)
        : bloco(page, v, M, y - 11, LC, 8.5, { fonte: f.negrito, cor: COR.marinho, alt: 11, max: 2 }) - 5;
    }
    // coluna da direita: dois prints sobrepostos
    const xR = M + LC + 26, wR = W - M - xR, hR = topo - base + 8;
    const [b1, b2] = it.imagens || [];
    if (b2) {
      await telaOuMockup(page, b1, xR, base + hR * 0.26, wR * 0.86, hR * 0.74, { alinhar: 'esq' });
      await telaOuMockup(page, b2, xR + wR * 0.38, base - 4, wR * 0.62, hR * 0.56, { alinhar: 'dir' });
    } else {
      await telaOuMockup(page, b1, xR, base, wR, hR, { alinhar: 'topo' });
    }
    // faixa de recursos
    if (faixa) {
      const fy = 44;
      retArred(page, M, fy, LARG, faixa, 14, { color: COR.claroFundo });
      texto(page, 'PRINCIPAIS RECURSOS', M + 18, fy + faixa - 20, 8, f.negrito, COR.marinho);
      const ncol = recursos.length > 6 ? 3 : 2;
      const porCol = Math.ceil(recursos.length / ncol);
      const colW = (LARG - 36 - (ncol - 1) * 18) / ncol;
      for (let ci = 0; ci < ncol; ci++) {
        let yy = fy + faixa - 40;
        const x = M + 18 + ci * (colW + 18);
        for (const r of recursos.slice(ci * porCol, (ci + 1) * porCol)) {
          if (yy < fy + 8) break;
          page.drawCircle({ x: x + 5, y: yy + 3, size: 5, color: COR.ciano });
          page.drawSvgPath('M -2.4 0 L -0.6 1.8 L 2.6 -1.6', { x: x + 5, y: yy + 3, borderColor: COR.branco, borderWidth: 1.2 });
          yy = bloco(page, r, x + 15, yy, colW - 15, 8, { alt: 10.5, max: 3 }) - 5;
        }
      }
    }
  }

  // ===== Outros trabalhos =====
  if (outros.length) {
    const POR_PAGINA = 3;
    for (let p0 = 0; p0 < outros.length; p0 += POR_PAGINA) {
      const page = paginaInterna('Projetos', p0 ? 'Outros trabalhos (continuação)' : 'Outros trabalhos');
      const lote = outros.slice(p0, p0 + POR_PAGINA);
      const gap = 18, topo = H - 124, base = 50;
      const cw = (LARG - gap * (POR_PAGINA - 1)) / POR_PAGINA;
      const ch = topo - base;
      for (const [i, it] of lote.entries()) {
        const x = M + i * (cw + gap);
        retArred(page, x, base, cw, ch, 16, { color: COR.branco, borderColor: COR.borda, borderWidth: 1 });
        const hImg = 130;
        await telaOuMockup(page, (it.imagens || [])[0], x + 12, topo - 12 - hImg, cw - 24, hImg, { sombra: false });
        let y = topo - hImg - 34;
        texto(page, caber([TIPOS_VITRINE[it.tipo], it.cliente || it.realizado_em].filter(Boolean).join('  ·  ').toUpperCase(), f.negrito, 7.5, cw - 32), x + 16, y, 7.5, f.negrito, COR.ciano);
        y = bloco(page, it.nome, x + 16, y - 16, cw - 32, 13, { fonte: f.negrito, cor: COR.marinho, alt: 16, max: 2 });
        if (it.slogan) y = bloco(page, it.slogan, x + 16, y - 2, cw - 32, 9.5, { fonte: f.negrito, cor: COR.azul, alt: 13, max: 2 });
        const corpo = [it.descricao, it.tecnologias && `Tecnologias: ${it.tecnologias}`].filter(Boolean).join('\n');
        bloco(page, corpo, x + 16, y - 6, cw - 32, 8.5, { alt: 12.5, max: Math.max(1, Math.floor((y - 6 - base - 30) / 12.5)) });
        if (it.link) texto(page, caber(it.link, f.negrito, 8, cw - 32), x + 16, base + 14, 8, f.negrito, COR.azul);
      }
    }
  }

  // ===== Contato =====
  if (contato) {
    const page = pdf.addPage(A4.paisagem);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COR.marinho });
    for (let i = 0; i < 6; i++) {
      page.drawLine({ start: { x: W * 0.35 + i * 40, y: -10 }, end: { x: W * 0.75 + i * 40, y: H + 10 }, thickness: 16, color: COR.azul, opacity: 0.16 - i * 0.02 });
    }
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: COR.ciano });
    texto(page, 'ENTRE EM CONTATO', M, H - 100, 10, f.negrito, COR.ciano);
    texto(page, 'Vamos conversar?', M, H - 146, 36, f.negrito, COR.branco);
    bloco(page, 'Conte o seu desafio: eu ajudo a transformar dados em decisões, com painéis, ferramentas e aplicativos sob medida.',
      M, H - 180, W * 0.48, 12, { cor: COR.claro, alt: 18, max: 3 });
    const zap = String(cfg.whatsapp || '').replace(/\D/g, '');
    const itensContato = [
      ['Telefone / WhatsApp', cfg.empresa_telefone || (zap ? `+${zap}` : '')],
      ['E-mail', cfg.empresa_email],
      ['Instagram', cfg.instagram && `@${cfg.instagram}`],
      ['LinkedIn', cfg.linkedin && `/${cfg.linkedin}`],
      ['Portfólio online', cfg.portfolio_link],
      ['Site', cfg.empresa_site],
    ].filter(([, v]) => v);
    let y = H - 262;
    for (const [k, v] of itensContato) {
      page.drawRectangle({ x: M, y: y - 4, width: 3, height: 26, color: COR.ciano });
      texto(page, k.toUpperCase(), M + 14, y + 12, 8, f.negrito, COR.claro);
      texto(page, caber(v, f.negrito, 14, W * 0.5), M + 14, y - 4, 14, f.negrito, COR.branco);
      y -= 44;
    }
    // cartão branco com o logo
    const cw = 250, chh = 210, cx = W - M - cw, cy = (H - chh) / 2 - 10;
    retArred(page, cx, cy, cw, chh, 20, { color: COR.branco });
    if (img) {
      const { width, height } = encaixar(img, cw - 50, chh - 80);
      page.drawImage(img, { x: cx + (cw - width) / 2, y: cy + 56, width, height });
    }
    if (cfg.responsavel_nome) centro(page, cfg.responsavel_nome, cx + cw / 2, cy + 34, 10, f.negrito, COR.marinho);
    if (cfg.responsavel_cargo) centro(page, caber(cfg.responsavel_cargo, f.regular, 8.5, cw - 30), cx + cw / 2, cy + 20, 8.5, f.regular, COR.cinza);
  }

  // numeração (sem a capa)
  const paginas = pdf.getPages();
  paginas.forEach((pg, i) => {
    if (i === 0 || (contato && i === paginas.length - 1)) return;
    const t = `${i + 1} / ${paginas.length}`;
    pg.drawText(t, { x: W - M - f.regular.widthOfTextAtSize(t, 8), y: 20, size: 8, font: f.regular, color: COR.cinza });
  });
  return pdf.save();
}

module.exports = { gerarTimbradoEmBranco, gerarDocumento, gerarTabela, gerarProposta, gerarPortfolio, totaisProposta };
