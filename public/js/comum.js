// Utilitários compartilhados pelas telas.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(url, opcoes = {}) {
  const init = { method: opcoes.method || 'GET', headers: {} };
  if (opcoes.body !== undefined) {
    if (opcoes.body instanceof FormData) init.body = opcoes.body;
    else { init.body = JSON.stringify(opcoes.body); init.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(url, init);
  if (r.status === 401 && !url.endsWith('/api/login')) {
    location.href = '/';
    throw new Error('Sessão expirada.');
  }
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error(dados?.erro || `Erro ${r.status}`);
  return dados;
}

function toast(msg, erro = false) {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
  const d = document.createElement('div');
  d.innerHTML = ic(erro ? 'alerta' : 'check');
  d.append(msg);
  if (erro) d.className = 'erro';
  box.appendChild(d);
  setTimeout(() => d.remove(), erro ? 6000 : 3200);
}

/** Abre um modal com o HTML informado. Retorna { el, fechar }. */
function modal(html, { aoFechar } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo-modal';
  fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(fundo);
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); aoFechar?.(); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  $$('[data-fechar]', fundo).forEach((b) => b.addEventListener('click', fechar));
  setTimeout(() => $('input, select, textarea', fundo)?.focus(), 30);
  return { el: fundo, fechar };
}

function confirmar(mensagem, { botao = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal(`<h2>Confirmar</h2><p>${esc(mensagem)}</p>
      <div class="rodape-modal"><button class="btn sec" data-fechar>Cancelar</button>
      <button class="btn ${perigo ? 'coral' : ''}" id="btn-conf">${esc(botao)}</button></div>`, { aoFechar: () => resolve(ok) });
    $('#btn-conf', m.el).addEventListener('click', () => { ok = true; m.fechar(); });
  });
}

// ---------- mês de referência ----------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nomeCompetencia(c) {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}
function competenciaAnterior(c) {
  const [a, m] = c.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
function proximaCompetencia(c) {
  const [a, m] = c.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

function lsLer(chave, padrao) { try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; } }
function lsGravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ } }

function dataBR(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** AAAA-MM-DD → DD/MM/AAAA */
function dataCurta(iso) {
  return /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10).split('-').reverse().join('/') : '';
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function somarDiasISO(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCurta = (v) => {
  const n = Number(v) || 0;
  return Math.abs(n) >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : Math.abs(n) >= 1e4 ? `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : moeda(n);
};
/** "1.500,50" ou "1500.5" → 1500.5 */
function lerNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Remove acentos e caixa para buscas. */
function normalizar(t) {
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------- exportações ----------
/** Gera o PDF no servidor e abre em nova aba (ou baixa, se o navegador bloquear). */
async function abrirPdf(url, corpo, nome = 'documento.pdf') {
  const aba = window.open('', '_blank');
  try {
    const r = await fetch(url, corpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Falha ao gerar o PDF.');
    const blob = await r.blob();
    const link = URL.createObjectURL(blob);
    if (aba) aba.location.href = link;
    else baixarBlob(blob, nome);
    setTimeout(() => URL.revokeObjectURL(link), 60_000);
  } catch (e) {
    aba?.close();
    toast(e.message, true);
  }
}

function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/**
 * Exporta para Excel (.xlsx) com SheetJS.
 * cabecalho: linhas de título acima da tabela; colunas: [{ titulo, largura }]; linhas: [[...]]
 */
function exportarXlsx(nomeArquivo, { aba = 'Planilha', cabecalho = [], colunas, linhas }) {
  const dados = [...cabecalho.map((l) => [l]), ...(cabecalho.length ? [[]] : []), colunas.map((c) => c.titulo), ...linhas];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = colunas.map((c) => ({ wch: c.largura || 14 }));
  const linhaCab = cabecalho.length ? cabecalho.length + 1 : 0;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: linhaCab, c: 0 }, e: { r: linhaCab + linhas.length, c: colunas.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: linhaCab + 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31));
  XLSX.writeFile(wb, nomeArquivo);
}

/** Lê a primeira aba de um .xlsx/.csv e devolve objetos com as chaves em minúsculas sem acento. */
async function lerPlanilha(arquivo) {
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Datas do Excel viram AAAA-MM-DD (o formato padrão de data é lido como m/d/aa e trocaria dia e mês).
  for (const [ref, cel] of Object.entries(ws)) {
    if (ref[0] === '!' || cel.t !== 'n' || !cel.z || !XLSX.SSF.is_date(cel.z)) continue;
    const d = XLSX.SSF.parse_date_code(cel.v);
    if (d) cel.w = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  const chave = (k) => String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [chave(k), String(v).trim()])));
}

// ---------- ícones (traço, estilo Lucide) ----------
const ICONES = {
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  pasta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="m9 13 2 2 4-4"/>',
  pastaAberta: '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  usuario: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  coracao: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  estetoscopio: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  docOk: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  docX: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
  ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  esq: '<path d="m15 18-6-6 6-6"/>',
  dir: '<path d="m9 18 6-6-6-6"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  tabela: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lixo: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  banco: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  olho: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  atividade: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  etiqueta: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41Z"/><circle cx="7" cy="7" r="1.5"/>',
  voltar: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  prancheta: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  arquivos: '<path d="M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5M2 8v12a2 2 0 0 0 2 2h10"/>',
  brilho: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  grafico: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  app: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M12 18h.01"/>',
  capelo: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  funil: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  maleta: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  livro: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  seta: '<path d="M7 17 17 7M7 7h10v10"/>',
  sobe: '<path d="m18 15-6-6-6 6"/>',
  desce: '<path d="m6 9 6 6 6-6"/>',
  estrela: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  planilha: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h2M14 13h2M8 17h2M14 17h2"/>',
};

function ic(nome, extra = '') {
  return `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
}

/** Troca <i data-ic="nome"></i> do HTML estático pelo SVG. */
function hidratarIcones(raiz = document) {
  $$('i[data-ic]', raiz).forEach((el) => { el.outerHTML = ic(el.dataset.ic); });
}
hidratarIcones();

// ---------- avatares com iniciais ----------
const TONS = [205, 190, 220, 175, 240, 200, 260, 185];
function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter((x) => !/^(da|de|do|das|dos|e)$/i.test(x));
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function avatar(nome) {
  let h = 0;
  for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av" style="--h:${TONS[h % TONS.length]}">${esc(iniciais(nome))}</span>`;
}
function pessoa(nome, detalhe = '') {
  return `<div class="pessoa">${avatar(nome)}<div><b>${esc(nome)}</b>${detalhe ? `<small>${esc(detalhe)}</small>` : ''}</div></div>`;
}

// ---------- anel de progresso ----------
function anel(pct, rotulo = '') {
  const r = 52, c = 2 * Math.PI * r;
  return `<div class="anel"><svg viewBox="0 0 130 130">
      <defs><linearGradient id="grad-anel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20b8d5"/><stop offset="1" stop-color="#17397d"/></linearGradient></defs>
      <circle class="trilho" cx="65" cy="65" r="${r}"/>
      <circle class="valor" cx="65" cy="65" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(Math.max(pct, 0), 100) / 100)}"/>
    </svg><div class="centro"><b>${Math.round(pct)}%</b><span>${esc(rotulo)}</span></div></div>`;
}

// ---------- ilustrações dos estados vazios ----------
const ILUSTRA = {
  calendario: `<svg class="ilustra" viewBox="0 0 160 130" fill="none"><ellipse cx="80" cy="118" rx="58" ry="7" fill="#e8f3fa"/>
    <rect x="30" y="22" width="100" height="88" rx="14" fill="#fff" stroke="#b3d8eb" stroke-width="3"/>
    <path d="M30 36a14 14 0 0 1 14-14h72a14 14 0 0 1 14 14v10H30z" fill="#20b8d5"/>
    <rect x="52" y="12" width="6" height="20" rx="3" fill="#17397d"/><rect x="102" y="12" width="6" height="20" rx="3" fill="#17397d"/>
    <g fill="#e8f3fa"><rect x="44" y="58" width="14" height="12" rx="3"/><rect x="64" y="58" width="14" height="12" rx="3"/><rect x="104" y="58" width="14" height="12" rx="3"/><rect x="44" y="78" width="14" height="12" rx="3"/><rect x="84" y="78" width="14" height="12" rx="3"/><rect x="104" y="78" width="14" height="12" rx="3"/></g>
    <path d="M91 74c3-3 7-1 7 3 0 4-7 9-7 9s-7-5-7-9c0-4 4-6 7-3z" fill="#005ea4"/>
    <circle cx="136" cy="26" r="5" fill="#dcf4f9"/><path d="M136 21v10M131 26h10" stroke="#005ea4" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  pasta: `<svg class="ilustra" viewBox="0 0 160 130" fill="none"><ellipse cx="80" cy="118" rx="58" ry="7" fill="#e8f3fa"/>
    <path d="M28 38a10 10 0 0 1 10-10h26l10 10h48a10 10 0 0 1 10 10v52a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10z" fill="#b3d8eb"/>
    <rect x="46" y="30" width="56" height="64" rx="6" fill="#fff" stroke="#d3e8f4" stroke-width="2"/>
    <rect x="56" y="42" width="30" height="4" rx="2" fill="#20b8d5"/><rect x="56" y="52" width="36" height="4" rx="2" fill="#e8f3fa"/><rect x="56" y="60" width="28" height="4" rx="2" fill="#e8f3fa"/>
    <path d="M24 56a8 8 0 0 1 8-8h96a8 8 0 0 1 8 8l-4 46a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" fill="#20b8d5"/>
    <circle cx="80" cy="78" r="13" fill="#fff"/><path d="m74 78 4 4 8-8" stroke="#17397d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pessoas: `<svg class="ilustra" viewBox="0 0 160 130" fill="none"><ellipse cx="80" cy="118" rx="58" ry="7" fill="#e8f3fa"/>
    <circle cx="56" cy="50" r="16" fill="#d3e8f4"/><path d="M28 104c0-18 12-30 28-30s28 12 28 30z" fill="#b3d8eb"/>
    <circle cx="104" cy="46" r="18" fill="#dcf4f9"/><path d="M72 106c0-20 14-34 32-34s32 14 32 34z" fill="#005ea4"/>
    <path d="M104 86c2.5-2.5 6-1 6 2.5 0 3.5-6 7.5-6 7.5s-6-4-6-7.5c0-3.5 3.5-5 6-2.5z" fill="#fff"/></svg>`,
  documento: `<svg class="ilustra" viewBox="0 0 160 130" fill="none"><ellipse cx="80" cy="118" rx="58" ry="7" fill="#e8f3fa"/>
    <rect x="44" y="14" width="72" height="96" rx="10" fill="#fff" stroke="#d3e8f4" stroke-width="2"/>
    <rect x="44" y="14" width="72" height="6" rx="3" fill="#20b8d5"/><rect x="96" y="14" width="20" height="6" rx="3" fill="#005ea4"/>
    <rect x="56" y="34" width="24" height="10" rx="3" fill="#b3d8eb"/><rect x="56" y="54" width="48" height="4" rx="2" fill="#e8f3fa"/><rect x="56" y="64" width="48" height="4" rx="2" fill="#e8f3fa"/><rect x="56" y="74" width="34" height="4" rx="2" fill="#e8f3fa"/>
    <path d="M70 94h20" stroke="#17397d" stroke-width="2" stroke-linecap="round"/></svg>`,
};
function vazio({ ilustra = 'calendario', titulo, texto = '', acoes = '' }) {
  return `<div class="vazio">${ILUSTRA[ilustra] || ''}<h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${acoes ? `<div class="linha">${acoes}</div>` : ''}</div>`;
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
