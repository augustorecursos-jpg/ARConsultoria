// AR Consultoria · sistema de gestão
// Servidor HTTP: login, portfólio em PDF (serviços, Vértice e projetos), leads, clientes, propostas,
// projetos, financeiro, documentos em papel timbrado e administração.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { db, DATA_DIR, DB_FILE, lerConfig, hashSenha, conferirSenha, CONFIG_PADRAO } = require('./db');
const { gerarTimbradoEmBranco, gerarDocumento, gerarTabela, gerarProposta, gerarPortfolio, totaisProposta } = require('./pdf');

const PORT = Number(process.env.PORT) || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';
const SENHA_INICIAL = 'ar-admin';

const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(SECRET_FILE, 'utf8');
})();

// Primeiro acesso: cria o administrador inicial se ainda não houver usuários.
if (!db.prepare('SELECT COUNT(*) n FROM usuarios').get().n) {
  const login = process.env.ADMIN_LOGIN || 'admin';
  const senha = process.env.ADMIN_PASSWORD || (PRODUCAO ? null : SENHA_INICIAL);
  if (!senha) {
    console.error('[erro] Em produção defina ADMIN_PASSWORD para criar o primeiro administrador.');
    process.exit(1);
  }
  db.prepare("INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, 'admin')")
    .run('Augusto Rodrigues', login, hashSenha(senha));
  console.log(`[info] Administrador inicial criado: login "${login}"${process.env.ADMIN_PASSWORD ? '' : ` / senha "${SENHA_INICIAL}" (troque no primeiro acesso)`}.`);
}

// ---------- utilitários ----------
function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

function verificar(token) {
  if (!token) return null;
  const [corpo, sig] = token.split('.');
  if (!corpo || !sig) return null;
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try {
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function lerCookies(req) {
  const out = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

const HORAS_SESSAO = 12;
function definirSessao(res, usuario) {
  const token = assinar({ uid: usuario.id, v: usuario.senha_hash.slice(-12), exp: Date.now() + HORAS_SESSAO * 3600e3 });
  res.cookie('sess_ar', token, { httpOnly: true, sameSite: 'lax', maxAge: HORAS_SESSAO * 3600e3, secure: PRODUCAO });
}

function exigirLogin(req, res, next) {
  const s = verificar(lerCookies(req).sess_ar);
  const u = s && db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(s.uid);
  // A sessão cai quando a senha é trocada (v = final do hash).
  if (!u || u.senha_hash.slice(-12) !== s.v) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = u;
  next();
}

function exigirAdmin(req, res, next) {
  exigirLogin(req, res, () => {
    if (req.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
    next();
  });
}

function auditar(req, acao, detalhe = '') {
  db.prepare('INSERT INTO auditoria (usuario, acao, detalhe, ip) VALUES (?, ?, ?, ?)')
    .run(req.usuario?.login || '-', acao, String(detalhe).slice(0, 500), req.ip || '');
}

const texto = (v, max = 300) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const textoLongo = (v, max = 4000) => {
  const t = String(v ?? '').replace(/\r/g, '').trim();
  return t ? t.slice(0, max) : null;
};
/** Número em formato brasileiro ou JS ("1.500,50", "1500.5", 1500.5). */
const numero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const dataValida = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? v : null);
const mesValido = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const somarMeses = (iso, meses) => {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
};

function arquivoLogo() {
  for (const ext of ['png', 'jpg']) {
    const p = path.join(DATA_DIR, `logo.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'public/img/logo.png');
}
const lerLogo = () => fs.readFileSync(arquivoLogo());

function enviarPdf(res, bytes, nome) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.end(Buffer.from(bytes));
}

// Async handlers: erros viram 500 com mensagem genérica.
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Executa fn dentro de uma transação. */
function transacao(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/logo', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(arquivoLogo()); });

// ---------- autenticação ----------
const falhas = new Map(); // ip -> { n, ate }
app.post('/api/login', (req, res) => {
  const ip = req.ip || '';
  const f = falhas.get(ip);
  if (f && f.n >= 8 && f.ate > Date.now()) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });

  const login = texto(req.body?.login, 80);
  const u = login && db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
  if (!u || !u.ativo || !conferirSenha(req.body?.senha || '', u.senha_hash)) {
    const atual = f && f.ate > Date.now() ? f : { n: 0 };
    falhas.set(ip, { n: atual.n + 1, ate: Date.now() + 10 * 60e3 });
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }
  falhas.delete(ip);
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(u.id);
  definirSessao(res, u);
  req.usuario = u;
  auditar(req, 'login');
  res.json({ ok: true, perfil: u.perfil });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('sess_ar');
  res.json({ ok: true });
});

app.get('/api/eu', exigirLogin, (req, res) => {
  const { id, nome, login, perfil } = req.usuario;
  res.json({ id, nome, login, perfil, padrao: perfil === 'admin' && conferirSenha(SENHA_INICIAL, req.usuario.senha_hash) });
});

app.post('/api/eu/senha', exigirLogin, (req, res) => {
  const { atual, nova } = req.body || {};
  if (!conferirSenha(atual || '', req.usuario.senha_hash)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
  if (String(nova || '').length < 8) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  const hash = hashSenha(nova);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, req.usuario.id);
  definirSessao(res, { ...req.usuario, senha_hash: hash });
  auditar(req, 'trocou a própria senha');
  res.json({ ok: true });
});

app.get('/api/config', exigirLogin, (req, res) => res.json(lerConfig()));

// ---------- cadastros genéricos ----------
// Tipos: t = texto curto, l = texto longo, n = número, i = inteiro, d = data (AAAA-MM-DD), b = sim/não,
// ['a', 'b'] = uma das opções, { fk: 'tabela' } = id de outra tabela.
const LEAD_STATUS = ['novo', 'contato', 'proposta', 'ganho', 'perdido'];
const PROJETO_STATUS = ['planejado', 'andamento', 'pausado', 'concluido', 'cancelado'];
const VITRINE_TIPOS = ['aplicativo', 'sistema', 'painel', 'ferramenta', 'projeto'];

const TABELAS = {
  clientes: {
    rotulo: 'cliente', titulo: (r) => r.nome,
    campos: { nome: 't', documento: 't', segmento: 't', contato: 't', email: 't', telefone: 't', cidade: 't', origem: 't', observacoes: 'l', portfolio: 'b' },
    obrig: ['nome'], temAtivo: true,
    lista: `SELECT c.*,
        (SELECT COUNT(*) FROM projetos p WHERE p.cliente_id = c.id) AS projetos,
        (SELECT COUNT(*) FROM propostas p WHERE p.cliente_id = c.id) AS propostas,
        (SELECT COALESCE(SUM(valor), 0) FROM lancamentos l WHERE l.cliente_id = c.id AND l.tipo = 'receita' AND l.pago_em IS NOT NULL) AS faturado
      FROM clientes c ORDER BY c.ativo DESC, c.nome COLLATE NOCASE`,
    usos: (id) => ['propostas', 'projetos', 'lancamentos'].reduce((s, t) => s + db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE cliente_id = ?`).get(id).n, 0)
      + db.prepare('SELECT COUNT(*) n FROM leads WHERE cliente_id = ?').get(id).n,
  },
  leads: {
    rotulo: 'lead', titulo: (r) => r.nome,
    campos: { nome: 't', empresa: 't', email: 't', telefone: 't', interesse: 't', mensagem: 'l', origem: 't', status: LEAD_STATUS,
      valor_estimado: 'n', proximo_contato: 'd', cliente_id: { fk: 'clientes' }, observacoes: 'l' },
    obrig: ['nome'],
    lista: `SELECT l.*, c.nome AS cliente_nome FROM leads l LEFT JOIN clientes c ON c.id = l.cliente_id
      ORDER BY CASE l.status WHEN 'novo' THEN 0 WHEN 'contato' THEN 1 WHEN 'proposta' THEN 2 WHEN 'ganho' THEN 3 ELSE 4 END, l.criado_em DESC`,
  },
  servicos: {
    rotulo: 'serviço', titulo: (r) => r.nome,
    campos: { nome: 't', resumo: 'l', descricao: 'l', icone: 't', preco_base: 'n', unidade: 't', ordem: 'i', publicado: 'b' },
    obrig: ['nome'],
    lista: 'SELECT * FROM servicos ORDER BY ordem, id',
  },
  vitrine: {
    rotulo: 'item do portfólio', titulo: (r) => r.nome,
    campos: { nome: 't', tipo: VITRINE_TIPOS, cliente: 't', realizado_em: 't', slogan: 't', descricao: 'l', recursos: 'l', publico: 't', link: 't', link_repo: 't',
      tecnologias: 't', destaque: 'b', ordem: 'i', publicado: 'b' },
    obrig: ['nome'],
    lista: 'SELECT * FROM vitrine ORDER BY destaque DESC, ordem, id',
  },
  projetos: {
    rotulo: 'projeto', titulo: (r) => r.nome,
    campos: { nome: 't', cliente_id: { fk: 'clientes' }, proposta_id: { fk: 'propostas' }, servico: 't', status: PROJETO_STATUS,
      inicio: 'd', prazo: 'd', valor: 'n', progresso: 'i', observacoes: 'l' },
    obrig: ['nome'],
    lista: `SELECT p.*, c.nome AS cliente_nome, pr.numero AS proposta_numero,
        (SELECT COALESCE(SUM(valor), 0) FROM lancamentos l WHERE l.projeto_id = p.id AND l.tipo = 'receita' AND l.pago_em IS NOT NULL) AS recebido
      FROM projetos p LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN propostas pr ON pr.id = p.proposta_id
      ORDER BY CASE p.status WHEN 'andamento' THEN 0 WHEN 'planejado' THEN 1 WHEN 'pausado' THEN 2 ELSE 3 END, p.prazo IS NULL, p.prazo`,
  },
  lancamentos: {
    rotulo: 'lançamento', titulo: (r) => r.descricao,
    campos: { tipo: ['receita', 'despesa'], descricao: 't', categoria: 't', valor: 'n', vencimento: 'd', pago_em: 'd',
      cliente_id: { fk: 'clientes' }, projeto_id: { fk: 'projetos' }, observacoes: 'l' },
    obrig: ['tipo', 'descricao', 'valor', 'vencimento'],
    // A lista é filtrada por mês em /api/lancamentos (rota própria abaixo).
  },
};

/** Valida e converte o corpo da requisição conforme os campos da tabela. Retorna { item } ou { erro }. */
function lerItem(def, b) {
  const item = {};
  for (const [c, tipo] of Object.entries(def.campos)) {
    const v = b?.[c];
    if (Array.isArray(tipo)) item[c] = tipo.includes(v) ? v : null;
    else if (tipo && tipo.fk) {
      const id = Number(v);
      item[c] = id > 0 && db.prepare(`SELECT 1 FROM ${tipo.fk} WHERE id = ?`).get(id) ? id : null;
    } else if (tipo === 't') item[c] = texto(v, 300);
    else if (tipo === 'l') item[c] = textoLongo(v, 6000);
    else if (tipo === 'n') item[c] = numero(v);
    else if (tipo === 'i') { const n = numero(v); item[c] = n === null ? null : Math.round(n); }
    else if (tipo === 'd') item[c] = dataValida(v);
    else if (tipo === 'b') item[c] = v === true || v === 1 || v === '1' || v === 'on' || v === 'true' ? 1 : 0;
  }
  for (const c of def.obrig) {
    if (item[c] === null || item[c] === undefined || item[c] === '') return { erro: `Preencha o campo obrigatório: ${c.replace('_', ' ')}.` };
  }
  return { item };
}

/** Valores padrão para colunas NOT NULL quando não vierem preenchidas. */
function completarPadroes(tabela, item) {
  if (tabela === 'leads' && !item.status) item.status = 'novo';
  if (tabela === 'leads' && !item.origem) item.origem = 'manual';
  if (tabela === 'projetos' && !item.status) item.status = 'planejado';
  if (tabela === 'projetos') item.progresso = Math.min(Math.max(item.progresso || 0, 0), 100);
  if (tabela === 'vitrine' && !item.tipo) item.tipo = 'aplicativo';
  for (const c of ['ordem']) if (c in item && item[c] === null) item[c] = 0;
  if (tabela === 'lancamentos') item.valor = Math.abs(item.valor);
  return item;
}

for (const [tabela, def] of Object.entries(TABELAS)) {
  const cols = Object.keys(def.campos);
  if (def.lista) app.get(`/api/${tabela}`, exigirLogin, (req, res) => res.json(db.prepare(def.lista).all()));

  app.post(`/api/${tabela}`, exigirLogin, (req, res) => {
    const { item, erro } = lerItem(def, req.body);
    if (erro) return res.status(400).json({ erro });
    completarPadroes(tabela, item);
    if (tabela === 'lancamentos') item.usuario = req.usuario.login;
    const ks = Object.keys(item);
    const r = db.prepare(`INSERT INTO ${tabela} (${ks.join(', ')}) VALUES (${ks.map(() => '?').join(', ')})`).run(...ks.map((k) => item[k]));
    auditar(req, `cadastrou ${def.rotulo}`, def.titulo(item));
    res.json({ id: Number(r.lastInsertRowid) });
  });

  app.put(`/api/${tabela}/:id`, exigirLogin, (req, res) => {
    const id = Number(req.params.id);
    const atual = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    if (!atual) return res.status(404).json({ erro: 'Registro não encontrado.' });
    const { item, erro } = lerItem(def, { ...atual, ...req.body });
    if (erro) return res.status(400).json({ erro });
    completarPadroes(tabela, item);
    if (tabela === 'projetos' && item.proposta_id === id) item.proposta_id = null;
    let ativo = atual.ativo;
    if (def.temAtivo && req.body?.ativo !== undefined) ativo = req.body.ativo ? 1 : 0;
    db.prepare(`UPDATE ${tabela} SET ${cols.map((c) => `${c} = ?`).join(', ')}${def.temAtivo ? ', ativo = ?' : ''}, atualizado_em = datetime('now') WHERE id = ?`)
      .run(...cols.map((c) => item[c]), ...(def.temAtivo ? [ativo] : []), id);
    const extra = def.temAtivo && ativo !== atual.ativo ? (ativo ? ' (reativado)' : ' (inativado)') : '';
    auditar(req, `alterou ${def.rotulo}`, def.titulo(item) + extra);
    res.json({ ok: true });
  });

  app.delete(`/api/${tabela}/:id`, exigirLogin, (req, res) => {
    const id = Number(req.params.id);
    const atual = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    if (!atual) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (def.usos && def.usos(id)) {
      // Mantém o histórico: quem já tem propostas, projetos ou lançamentos é só inativado.
      db.prepare(`UPDATE ${tabela} SET ativo = 0, atualizado_em = datetime('now') WHERE id = ?`).run(id);
      auditar(req, `inativou ${def.rotulo}`, def.titulo(atual));
      return res.json({ inativado: true });
    }
    db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id);
    if (tabela === 'vitrine') SLOTS.forEach((n) => removerImagem('vitrine', id, n));
    if (tabela === 'clientes') removerImagem('cliente', id);
    auditar(req, `excluiu ${def.rotulo}`, def.titulo(atual));
    res.json({ excluido: true });
  });
}

const chaveNome = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Importação de clientes a partir da planilha do Excel (lida no navegador): adiciona novos e atualiza pelo nome.
app.post('/api/clientes/importar', exigirLogin, (req, res) => {
  const def = TABELAS.clientes;
  const cols = Object.keys(def.campos);
  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 5000) : [];
  const existentes = new Map(db.prepare('SELECT * FROM clientes').all().map((r) => [chaveNome(r.nome), r]));
  let novos = 0, atualizados = 0, ignorados = 0;
  transacao(() => {
    for (const bruto of itens) {
      const { item } = lerItem(def, bruto);
      if (!item) { ignorados++; continue; }
      const atual = existentes.get(chaveNome(item.nome));
      if (atual) {
        // Só preenche o que veio na planilha; não apaga dados já cadastrados.
        const mesclado = cols.map((c) => (c === 'nome' ? atual.nome : item[c] ?? atual[c] ?? null));
        db.prepare(`UPDATE clientes SET ${cols.map((c) => `${c} = ?`).join(', ')}, ativo = 1, atualizado_em = datetime('now') WHERE id = ?`).run(...mesclado, atual.id);
        Object.assign(atual, Object.fromEntries(cols.map((c, i) => [c, mesclado[i]])));
        atualizados++;
      } else {
        const r = db.prepare(`INSERT INTO clientes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => item[c]));
        existentes.set(chaveNome(item.nome), { ...item, id: Number(r.lastInsertRowid) });
        novos++;
      }
    }
  });
  auditar(req, 'importou clientes', `${novos} novos, ${atualizados} atualizados`);
  res.json({ novos, atualizados, ignorados });
});

// Converte um lead em cliente (ou vincula a um cliente com o mesmo nome).
app.post('/api/leads/:id/converter', exigirLogin, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(req.params.id));
  if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });
  const nome = lead.empresa || lead.nome;
  const existente = db.prepare('SELECT * FROM clientes').all().find((c) => chaveNome(c.nome) === chaveNome(nome));
  const clienteId = existente ? existente.id : Number(db.prepare(`INSERT INTO clientes (nome, contato, email, telefone, origem, observacoes)
      VALUES (?, ?, ?, ?, ?, ?)`).run(nome, lead.empresa ? lead.nome : null, lead.email, lead.telefone,
    lead.origem, lead.interesse ? `Interesse inicial: ${lead.interesse}` : null).lastInsertRowid);
  db.prepare("UPDATE leads SET cliente_id = ?, atualizado_em = datetime('now') WHERE id = ?").run(clienteId, lead.id);
  auditar(req, existente ? 'vinculou lead a cliente' : 'converteu lead em cliente', nome);
  res.json({ cliente_id: clienteId, existente: !!existente });
});

// ---------- propostas ----------
function lerProposta(b) {
  const itens = (Array.isArray(b?.itens) ? b.itens : []).slice(0, 60).map((i) => ({
    descricao: textoLongo(i?.descricao, 600) || '',
    qtd: Math.max(numero(i?.qtd) ?? 1, 0),
    valor: Math.max(numero(i?.valor) ?? 0, 0),
  })).filter((i) => i.descricao || i.valor);
  const clienteId = Number(b?.cliente_id);
  const leadId = Number(b?.lead_id);
  return {
    titulo: texto(b?.titulo, 200),
    cliente_id: clienteId > 0 && db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId) ? clienteId : null,
    lead_id: leadId > 0 && db.prepare('SELECT 1 FROM leads WHERE id = ?').get(leadId) ? leadId : null,
    introducao: textoLongo(b?.introducao, 8000),
    itens,
    desconto: Math.max(numero(b?.desconto) ?? 0, 0),
    condicoes: textoLongo(b?.condicoes, 3000),
    prazo: textoLongo(b?.prazo, 1000),
    validade: dataValida(b?.validade),
    status: ['rascunho', 'enviada', 'aprovada', 'recusada'].includes(b?.status) ? b.status : 'rascunho',
  };
}

function proximoNumero() {
  const ano = hojeISO().slice(0, 4);
  const ultimo = db.prepare("SELECT numero FROM propostas WHERE numero LIKE ? ORDER BY id DESC").all(`AR-${ano}-%`)
    .map((r) => Number(r.numero.split('-')[2]) || 0).reduce((m, n) => Math.max(m, n), 0);
  return `AR-${ano}-${String(ultimo + 1).padStart(3, '0')}`;
}

const comTotais = (p) => {
  const itens = JSON.parse(p.itens || '[]');
  return { ...p, itens, ...totaisProposta({ itens, desconto: p.desconto }) };
};

app.get('/api/propostas', exigirLogin, (req, res) => {
  res.json(db.prepare(`SELECT p.*, c.nome AS cliente_nome, l.nome AS lead_nome,
      (SELECT id FROM projetos x WHERE x.proposta_id = p.id LIMIT 1) AS projeto_id
    FROM propostas p LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN leads l ON l.id = p.lead_id
    ORDER BY p.id DESC`).all().map(comTotais));
});

app.post('/api/propostas', exigirLogin, (req, res) => {
  const p = lerProposta(req.body);
  if (!p.titulo) return res.status(400).json({ erro: 'Informe o título da proposta.' });
  const numeroP = proximoNumero();
  const r = db.prepare(`INSERT INTO propostas (numero, cliente_id, lead_id, titulo, introducao, itens, desconto, condicoes, prazo, validade, status, usuario)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(numeroP, p.cliente_id, p.lead_id, p.titulo, p.introducao, JSON.stringify(p.itens),
    p.desconto, p.condicoes, p.prazo, p.validade, p.status, req.usuario.login);
  if (p.lead_id) db.prepare("UPDATE leads SET status = 'proposta', atualizado_em = datetime('now') WHERE id = ? AND status IN ('novo', 'contato')").run(p.lead_id);
  auditar(req, 'criou proposta', `${numeroP} - ${p.titulo}`);
  res.json({ id: Number(r.lastInsertRowid), numero: numeroP });
});

app.put('/api/propostas/:id', exigirLogin, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ erro: 'Proposta não encontrada.' });
  const p = lerProposta({ ...comTotais(atual), ...req.body });
  if (!p.titulo) return res.status(400).json({ erro: 'Informe o título da proposta.' });
  db.prepare(`UPDATE propostas SET cliente_id = ?, lead_id = ?, titulo = ?, introducao = ?, itens = ?, desconto = ?, condicoes = ?, prazo = ?,
    validade = ?, status = ?, atualizado_em = datetime('now') WHERE id = ?`).run(p.cliente_id, p.lead_id, p.titulo, p.introducao,
    JSON.stringify(p.itens), p.desconto, p.condicoes, p.prazo, p.validade, p.status, id);
  // O status da proposta move o lead no funil.
  if (p.lead_id && p.status !== atual.status) {
    const novo = p.status === 'aprovada' ? 'ganho' : p.status === 'recusada' ? 'perdido' : 'proposta';
    db.prepare("UPDATE leads SET status = ?, atualizado_em = datetime('now') WHERE id = ?").run(novo, p.lead_id);
  }
  auditar(req, 'alterou proposta', `${atual.numero} - ${p.titulo}${p.status !== atual.status ? ` (${p.status})` : ''}`);
  res.json({ ok: true });
});

app.delete('/api/propostas/:id', exigirLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Proposta não encontrada.' });
  db.prepare('DELETE FROM propostas WHERE id = ?').run(p.id);
  auditar(req, 'excluiu proposta', `${p.numero} - ${p.titulo}`);
  res.json({ ok: true });
});

app.post('/api/propostas/:id/duplicar', exigirLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Proposta não encontrada.' });
  const numeroP = proximoNumero();
  const validade = somarDias(hojeISO(), Number(lerConfig().proposta_validade_dias) || 15);
  const r = db.prepare(`INSERT INTO propostas (numero, cliente_id, lead_id, titulo, introducao, itens, desconto, condicoes, prazo, validade, status, usuario)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?)`).run(numeroP, p.cliente_id, `${p.titulo} (cópia)`.slice(0, 200), p.introducao, p.itens,
    p.desconto, p.condicoes, p.prazo, validade, req.usuario.login);
  auditar(req, 'duplicou proposta', `${p.numero} → ${numeroP}`);
  res.json({ id: Number(r.lastInsertRowid), numero: numeroP });
});

// Proposta aprovada → projeto + parcelas a receber no financeiro.
app.post('/api/propostas/:id/projeto', exigirLogin, (req, res) => {
  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Proposta não encontrada.' });
  if (db.prepare('SELECT 1 FROM projetos WHERE proposta_id = ?').get(p.id)) return res.status(409).json({ erro: 'Esta proposta já gerou um projeto.' });
  const { total } = totaisProposta({ itens: JSON.parse(p.itens || '[]'), desconto: p.desconto });
  const parcelas = Math.min(Math.max(Math.round(Number(req.body?.parcelas) || 0), 0), 24);
  const primeiro = dataValida(req.body?.primeiro_vencimento) || hojeISO();
  const projetoId = transacao(() => {
    const id = Number(db.prepare(`INSERT INTO projetos (nome, cliente_id, proposta_id, status, inicio, prazo, valor)
      VALUES (?, ?, ?, 'planejado', ?, ?, ?)`).run(p.titulo, p.cliente_id, p.id, hojeISO(), dataValida(req.body?.prazo), total).lastInsertRowid);
    if (parcelas && total > 0) {
      const base = Math.floor((total / parcelas) * 100) / 100;
      for (let i = 0; i < parcelas; i++) {
        const valor = i === parcelas - 1 ? Math.round((total - base * (parcelas - 1)) * 100) / 100 : base;
        db.prepare(`INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, cliente_id, projeto_id, usuario)
          VALUES ('receita', ?, 'Consultoria', ?, ?, ?, ?, ?)`).run(`${p.numero} - ${p.titulo} (${i + 1}/${parcelas})`.slice(0, 300), valor,
          somarMeses(primeiro, i), p.cliente_id, id, req.usuario.login);
      }
    }
    if (p.status !== 'aprovada') db.prepare("UPDATE propostas SET status = 'aprovada', atualizado_em = datetime('now') WHERE id = ?").run(p.id);
    if (p.lead_id) db.prepare("UPDATE leads SET status = 'ganho', atualizado_em = datetime('now') WHERE id = ?").run(p.lead_id);
    return id;
  });
  auditar(req, 'gerou projeto a partir da proposta', `${p.numero}${parcelas ? `, ${parcelas} parcela(s)` : ''}`);
  res.json({ projeto_id: projetoId });
});

app.get('/api/propostas/:id/pdf', exigirLogin, a(async (req, res) => {
  const p = db.prepare('SELECT * FROM propostas WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Proposta não encontrada.' });
  const cliente = p.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(p.cliente_id)
    : p.lead_id ? (({ empresa, nome, email, telefone }) => ({ nome: empresa || nome, contato: empresa ? nome : null, email, telefone }))(db.prepare('SELECT * FROM leads WHERE id = ?').get(p.lead_id))
      : null;
  const bytes = await gerarProposta({ cfg: lerConfig(), logo: lerLogo(), proposta: comTotais(p), cliente });
  enviarPdf(res, bytes, `Proposta ${p.numero} - ${p.titulo}.pdf`);
}));

// ---------- financeiro ----------
app.get('/api/lancamentos', exigirLogin, (req, res) => {
  const mes = req.query.mes;
  if (!mesValido(mes)) return res.status(400).json({ erro: 'Mês inválido.' });
  res.json(db.prepare(`SELECT l.*, c.nome AS cliente_nome, p.nome AS projeto_nome FROM lancamentos l
    LEFT JOIN clientes c ON c.id = l.cliente_id LEFT JOIN projetos p ON p.id = l.projeto_id
    WHERE substr(l.vencimento, 1, 7) = ? ORDER BY l.vencimento, l.id`).all(mes));
});

app.post('/api/lancamentos/:id/baixa', exigirLogin, (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(Number(req.params.id));
  if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  const pago = req.body?.pago ? (dataValida(req.body?.data) || hojeISO()) : null;
  db.prepare("UPDATE lancamentos SET pago_em = ?, atualizado_em = datetime('now') WHERE id = ?").run(pago, l.id);
  auditar(req, pago ? (l.tipo === 'receita' ? 'registrou recebimento' : 'registrou pagamento') : 'estornou baixa', `${l.descricao} (${l.valor})`);
  res.json({ ok: true });
});

// Repete um lançamento nos meses seguintes (despesas fixas, assinaturas…).
app.post('/api/lancamentos/:id/repetir', exigirLogin, (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(Number(req.params.id));
  if (!l) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  const vezes = Math.min(Math.max(Math.round(Number(req.body?.vezes) || 0), 1), 36);
  transacao(() => {
    for (let i = 1; i <= vezes; i++) {
      db.prepare(`INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, cliente_id, projeto_id, observacoes, usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(l.tipo, l.descricao, l.categoria, l.valor, somarMeses(l.vencimento, i), l.cliente_id, l.projeto_id, l.observacoes, req.usuario.login);
    }
  });
  auditar(req, 'repetiu lançamento', `${l.descricao}: +${vezes} mês(es)`);
  res.json({ criados: vezes });
});

/** Resumo financeiro de um mês. */
function resumoMes(mes) {
  const r = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor END), 0) AS receitas,
      COALESCE(SUM(CASE WHEN tipo = 'receita' AND pago_em IS NOT NULL THEN valor END), 0) AS recebido,
      COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor END), 0) AS despesas,
      COALESCE(SUM(CASE WHEN tipo = 'despesa' AND pago_em IS NOT NULL THEN valor END), 0) AS pago
    FROM lancamentos WHERE substr(vencimento, 1, 7) = ?`).get(mes);
  return { ...r, a_receber: r.receitas - r.recebido, a_pagar: r.despesas - r.pago, saldo: r.recebido - r.pago, resultado: r.receitas - r.despesas };
}

app.get('/api/financeiro/resumo', exigirLogin, (req, res) => {
  const mes = req.query.mes;
  if (!mesValido(mes)) return res.status(400).json({ erro: 'Mês inválido.' });
  const ano = mes.slice(0, 4);
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  res.json({
    mes: resumoMes(mes),
    ano: meses.map((m) => ({ mes: m, ...resumoMes(m) })),
    categorias: db.prepare(`SELECT tipo, COALESCE(categoria, 'Sem categoria') AS categoria, SUM(valor) AS total FROM lancamentos
      WHERE substr(vencimento, 1, 7) = ? GROUP BY tipo, categoria ORDER BY total DESC`).all(mes),
    atrasados: db.prepare(`SELECT l.*, c.nome AS cliente_nome FROM lancamentos l LEFT JOIN clientes c ON c.id = l.cliente_id
      WHERE l.pago_em IS NULL AND l.vencimento < ? ORDER BY l.vencimento LIMIT 50`).all(hojeISO()),
  });
});

// ---------- painel ----------
app.get('/api/painel', exigirLogin, (req, res) => {
  const mes = mesValido(req.query.mes) ? req.query.mes : hojeISO().slice(0, 7);
  const hoje = hojeISO();
  const funil = Object.fromEntries(LEAD_STATUS.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM leads GROUP BY status').all()) funil[r.status] = r.n;
  const propostas = db.prepare('SELECT * FROM propostas').all().map(comTotais);
  const abertas = propostas.filter((p) => p.status === 'enviada');
  const decididas = propostas.filter((p) => ['aprovada', 'recusada'].includes(p.status));
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(somarMeses(`${mes}-01`, -i).slice(0, 7));
  res.json({
    mes,
    funil,
    leadsNoMes: db.prepare('SELECT COUNT(*) n FROM leads WHERE substr(criado_em, 1, 7) = ?').get(mes).n,
    clientes: db.prepare('SELECT COUNT(*) n FROM clientes WHERE ativo = 1').get().n,
    propostasAbertas: { qtd: abertas.length, valor: abertas.reduce((s, p) => s + p.total, 0) },
    aprovadasNoMes: propostas.filter((p) => p.status === 'aprovada' && p.atualizado_em.slice(0, 7) === mes).reduce((s, p) => s + p.total, 0),
    conversao: decididas.length ? propostas.filter((p) => p.status === 'aprovada').length / decididas.length : null,
    projetos: Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM projetos GROUP BY status').all().map((r) => [r.status, r.n])),
    financeiro: resumoMes(mes),
    serie: meses.map((m) => ({ mes: m, ...resumoMes(m) })),
    proximosContatos: db.prepare(`SELECT id, nome, empresa, status, proximo_contato FROM leads
      WHERE proximo_contato IS NOT NULL AND status NOT IN ('ganho', 'perdido') ORDER BY proximo_contato LIMIT 8`).all(),
    novosLeads: db.prepare("SELECT id, nome, empresa, interesse, origem, criado_em FROM leads WHERE status = 'novo' ORDER BY id DESC LIMIT 6").all(),
    projetosAtivos: db.prepare(`SELECT p.id, p.nome, p.prazo, p.progresso, p.status, c.nome AS cliente_nome FROM projetos p
      LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.status IN ('andamento', 'planejado') ORDER BY p.prazo IS NULL, p.prazo LIMIT 6`).all(),
    vencimentos: db.prepare(`SELECT l.id, l.tipo, l.descricao, l.valor, l.vencimento, c.nome AS cliente_nome FROM lancamentos l
      LEFT JOIN clientes c ON c.id = l.cliente_id WHERE l.pago_em IS NULL AND l.vencimento <= ? ORDER BY l.vencimento LIMIT 8`).all(somarDias(hoje, 15)),
    hoje,
  });
});

// ---------- portfólio ----------
const CONFIG_PORTFOLIO = ['portfolio_titulo', 'portfolio_chamada', 'portfolio_frase', 'portfolio_sobre', 'portfolio_anos',
  'portfolio_empresas', 'portfolio_habilidades', 'responsavel_nome', 'responsavel_cargo', 'whatsapp', 'instagram', 'linkedin', 'portfolio_link'];

// Textos do portfólio podem ser editados por qualquer usuário do sistema (não só o administrador).
app.put('/api/portfolio/config', exigirLogin, (req, res) => {
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor');
  for (const k of CONFIG_PORTFOLIO) {
    if (!(k in (req.body || {}))) continue;
    let v = CONFIG_LONGA.has(k) ? textoLongo(req.body[k], 3000) : texto(req.body[k], 600);
    if (k === 'whatsapp') v = String(v || '').replace(/\D/g, '');
    if (k === 'instagram') v = String(v || '').replace(/^@/, '');
    up.run(k, v || '');
  }
  auditar(req, 'alterou textos do portfólio');
  res.json({ ok: true });
});

// Imagens dos itens do portfólio: até 2 prints por item (1 = principal, 2 = secundário) em DATA_DIR/vitrine-<id>-<n>.png|jpg.
// Logo dos clientes (página "Clientes atendidos") em DATA_DIR/cliente-<id>.png|jpg.
const SLOTS = [1, 2];
const nomeImagem = (tipo, id, n) => (tipo === 'vitrine' ? `vitrine-${Number(id)}-${n}` : `cliente-${Number(id)}`);
const arquivoImagem = (tipo, id, n = 1) => ['png', 'jpg'].map((ext) => path.join(DATA_DIR, `${nomeImagem(tipo, id, n)}.${ext}`)).find((p) => fs.existsSync(p));
const removerImagem = (tipo, id, n = 1) => { for (const ext of ['png', 'jpg']) fs.rmSync(path.join(DATA_DIR, `${nomeImagem(tipo, id, n)}.${ext}`), { force: true }); };
const lerImagem = (tipo, id, n = 1) => { const arq = arquivoImagem(tipo, id, n); return arq ? fs.readFileSync(arq) : null; };

const uploadImagem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const ROTAS_IMAGEM = [
  { rota: '/api/vitrine/:id/imagem/:n', tipo: 'vitrine', tabela: 'vitrine', rotulo: 'imagem do portfólio' },
  { rota: '/api/clientes/:id/logo', tipo: 'cliente', tabela: 'clientes', rotulo: 'logo do cliente' },
];
for (const r of ROTAS_IMAGEM) {
  const slot = (req) => (r.tipo === 'vitrine' ? (SLOTS.includes(Number(req.params.n)) ? Number(req.params.n) : null) : 1);
  app.get(r.rota, exigirLogin, (req, res) => {
    const arq = slot(req) && arquivoImagem(r.tipo, req.params.id, slot(req));
    if (!arq) return res.status(404).json({ erro: 'Sem imagem.' });
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(arq);
  });
  app.post(r.rota, exigirLogin, uploadImagem.single('imagem'), (req, res) => {
    const item = db.prepare(`SELECT * FROM ${r.tabela} WHERE id = ?`).get(Number(req.params.id));
    if (!item || !slot(req)) return res.status(404).json({ erro: 'Registro não encontrado.' });
    const b = req.file?.buffer;
    const png = b && b[0] === 0x89 && b[1] === 0x50;
    const jpg = b && b[0] === 0xff && b[1] === 0xd8;
    if (!png && !jpg) return res.status(400).json({ erro: 'Envie uma imagem PNG ou JPG.' });
    removerImagem(r.tipo, item.id, slot(req));
    fs.writeFileSync(path.join(DATA_DIR, `${nomeImagem(r.tipo, item.id, slot(req))}.${png ? 'png' : 'jpg'}`), b);
    auditar(req, `enviou ${r.rotulo}`, item.nome);
    res.json({ ok: true });
  });
  app.delete(r.rota, exigirLogin, (req, res) => {
    if (!slot(req)) return res.status(404).json({ erro: 'Imagem não encontrada.' });
    removerImagem(r.tipo, req.params.id, slot(req));
    auditar(req, `removeu ${r.rotulo}`, String(req.params.id));
    res.json({ ok: true });
  });
}

/**
 * Gera o portfólio em PDF. Corpo (todos opcionais):
 * { para: 'Nome do cliente', servicos: [ids], itens: [ids], clientes: [ids], sobre: bool, contato: bool }
 * Sem listas = todos os serviços, itens e clientes marcados para aparecer no portfólio.
 */
app.post('/api/portfolio/pdf', exigirLogin, a(async (req, res) => {
  const b = req.body || {};
  const ids = (v) => (Array.isArray(v) ? new Set(v.map(Number)) : null);
  const selServ = ids(b.servicos), selItens = ids(b.itens), selClientes = ids(b.clientes);
  const servicos = db.prepare('SELECT * FROM servicos ORDER BY ordem, id').all().filter((s) => (selServ ? selServ.has(s.id) : s.publicado));
  const itens = db.prepare('SELECT * FROM vitrine ORDER BY destaque DESC, ordem, id').all()
    .filter((i) => (selItens ? selItens.has(i.id) : i.publicado))
    .map((i) => ({ ...i, imagens: SLOTS.map((n) => lerImagem('vitrine', i.id, n)).filter(Boolean) }));
  // Clientes atendidos: cada um com os cases (itens do portfólio) feitos para ele.
  const clientes = db.prepare('SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome COLLATE NOCASE').all()
    .filter((c) => (selClientes ? selClientes.has(c.id) : c.portfolio))
    .map((c) => ({
      nome: c.nome, segmento: c.segmento, cidade: c.cidade, logo: lerImagem('cliente', c.id),
      casos: db.prepare('SELECT nome, cliente FROM vitrine WHERE cliente IS NOT NULL ORDER BY destaque DESC, ordem, id').all()
        .filter((v) => chaveNome(v.cliente) === chaveNome(c.nome)).map((v) => v.nome),
    }));
  const para = texto(b.para, 160);
  const bytes = await gerarPortfolio({ cfg: lerConfig(), logo: lerLogo(), servicos, itens, clientes, para,
    sobre: b.sobre !== false, contato: b.contato !== false });
  auditar(req, 'gerou portfólio em PDF', para ? `para ${para}` : '');
  enviarPdf(res, bytes, `Portfólio AR Consultoria${para ? ` - ${para}` : ''}.pdf`);
}));

// ---------- documentos e PDFs ----------
app.get('/api/documentos', exigirLogin, (req, res) => {
  res.json(db.prepare('SELECT id, titulo, destinatario, usuario, criado_em, atualizado_em FROM documentos ORDER BY atualizado_em DESC').all());
});
app.get('/api/documentos/:id', exigirLogin, (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
  res.json(d);
});

const lerDoc = (b) => ({
  titulo: texto(b?.titulo, 200),
  destinatario: textoLongo(b?.destinatario, 500),
  corpo: textoLongo(b?.corpo, 20000) || '',
  local_data: texto(b?.local_data, 200),
  assinatura: textoLongo(b?.assinatura, 300),
});

app.post('/api/documentos', exigirLogin, (req, res) => {
  const d = lerDoc(req.body);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o título do documento.' });
  const r = db.prepare('INSERT INTO documentos (titulo, destinatario, corpo, local_data, assinatura, usuario) VALUES (?, ?, ?, ?, ?, ?)')
    .run(d.titulo, d.destinatario, d.corpo, d.local_data, d.assinatura, req.usuario.login);
  auditar(req, 'criou documento', d.titulo);
  res.json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/documentos/:id', exigirLogin, (req, res) => {
  const d = lerDoc(req.body);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o título do documento.' });
  const r = db.prepare("UPDATE documentos SET titulo = ?, destinatario = ?, corpo = ?, local_data = ?, assinatura = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(d.titulo, d.destinatario, d.corpo, d.local_data, d.assinatura, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Documento não encontrado.' });
  auditar(req, 'alterou documento', d.titulo);
  res.json({ ok: true });
});
app.delete('/api/documentos/:id', exigirLogin, (req, res) => {
  const d = db.prepare('SELECT titulo FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
  db.prepare('DELETE FROM documentos WHERE id = ?').run(Number(req.params.id));
  auditar(req, 'excluiu documento', d.titulo);
  res.json({ ok: true });
});

app.get('/api/documentos/:id/pdf', exigirLogin, a(async (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
  enviarPdf(res, await gerarDocumento({ cfg: lerConfig(), logo: lerLogo(), doc: d }), `${d.titulo}.pdf`);
}));

// Pré-visualização sem salvar
app.post('/api/pdf/documento', exigirLogin, a(async (req, res) => {
  const d = lerDoc(req.body);
  enviarPdf(res, await gerarDocumento({ cfg: lerConfig(), logo: lerLogo(), doc: d }), `${d.titulo || 'documento'}.pdf`);
}));

app.get('/api/pdf/timbrado', exigirLogin, a(async (req, res) => {
  const orientacao = req.query.orientacao === 'paisagem' ? 'paisagem' : 'retrato';
  const bytes = await gerarTimbradoEmBranco({ cfg: lerConfig(), logo: lerLogo(), paginas: Number(req.query.paginas) || 1, orientacao });
  auditar(req, 'gerou papel timbrado');
  enviarPdf(res, bytes, 'Papel timbrado - AR Consultoria.pdf');
}));

app.post('/api/pdf/tabela', exigirLogin, a(async (req, res) => {
  const tabela = req.body || {};
  if (!Array.isArray(tabela.colunas) || !tabela.colunas.length) return res.status(400).json({ erro: 'Tabela sem colunas.' });
  const bytes = await gerarTabela({ cfg: lerConfig(), logo: lerLogo(), tabela });
  auditar(req, 'gerou PDF de tabela', tabela.titulo || '');
  enviarPdf(res, bytes, `${tabela.titulo || 'tabela'}.pdf`);
}));

// ---------- administração ----------
app.get('/api/admin/usuarios', exigirAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nome, login, perfil, ativo, ultimo_acesso, criado_em FROM usuarios ORDER BY nome COLLATE NOCASE').all());
});

app.post('/api/admin/usuarios', exigirAdmin, (req, res) => {
  const nome = texto(req.body?.nome, 120), login = texto(req.body?.login, 80);
  const perfil = req.body?.perfil === 'admin' ? 'admin' : 'operador';
  const senha = String(req.body?.senha || '');
  if (!nome || !login) return res.status(400).json({ erro: 'Informe nome e login.' });
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(login)) return res.status(409).json({ erro: 'Esse login já existe.' });
  const r = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, ?)').run(nome, login, hashSenha(senha), perfil);
  auditar(req, 'criou usuário', `${login} (${perfil})`);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/usuarios/:id', exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const nome = texto(req.body?.nome, 120) || u.nome;
  const perfil = req.body?.perfil ? (req.body.perfil === 'admin' ? 'admin' : 'operador') : u.perfil;
  const ativo = req.body?.ativo === undefined ? u.ativo : (req.body.ativo ? 1 : 0);
  if (id === req.usuario.id && (perfil !== 'admin' || !ativo)) return res.status(400).json({ erro: 'Você não pode remover o seu próprio acesso de administrador.' });
  if (u.perfil === 'admin' && (perfil !== 'admin' || !ativo)) {
    const outros = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE perfil = 'admin' AND ativo = 1 AND id <> ?").get(id).n;
    if (!outros) return res.status(400).json({ erro: 'É preciso manter pelo menos um administrador ativo.' });
  }
  if (req.body?.senha && String(req.body.senha).length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, ativo = ? WHERE id = ?').run(nome, perfil, ativo, id);
  if (req.body?.senha) db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(req.body.senha), id);
  auditar(req, 'alterou usuário', `${u.login}: ${perfil}, ${ativo ? 'ativo' : 'bloqueado'}${req.body?.senha ? ', senha redefinida' : ''}`);
  res.json({ ok: true });
});

const CONFIG_EDITAVEL = Object.keys(CONFIG_PADRAO);
const CONFIG_LONGA = new Set(['portfolio_frase', 'portfolio_sobre', 'portfolio_habilidades', 'proposta_condicoes']);
app.put('/api/admin/config', exigirAdmin, (req, res) => {
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor');
  for (const k of CONFIG_EDITAVEL) {
    if (!(k in (req.body || {}))) continue;
    let v = CONFIG_LONGA.has(k) ? textoLongo(req.body[k], 3000) : texto(req.body[k], 600);
    if (k === 'whatsapp') v = String(v || '').replace(/\D/g, '');
    if (k === 'instagram') v = String(v || '').replace(/^@/, '');
    up.run(k, v || '');
  }
  auditar(req, 'alterou dados da empresa');
  res.json({ ok: true });
});

const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
app.post('/api/admin/logo', exigirAdmin, uploadLogo.single('logo'), (req, res) => {
  const b = req.file?.buffer;
  const png = b && b[0] === 0x89 && b[1] === 0x50;
  const jpg = b && b[0] === 0xff && b[1] === 0xd8;
  if (!png && !jpg) return res.status(400).json({ erro: 'Envie uma imagem PNG ou JPG.' });
  for (const ext of ['png', 'jpg']) fs.rmSync(path.join(DATA_DIR, `logo.${ext}`), { force: true });
  fs.writeFileSync(path.join(DATA_DIR, `logo.${png ? 'png' : 'jpg'}`), b);
  auditar(req, 'trocou o logo');
  res.json({ ok: true });
});
app.delete('/api/admin/logo', exigirAdmin, (req, res) => {
  for (const ext of ['png', 'jpg']) fs.rmSync(path.join(DATA_DIR, `logo.${ext}`), { force: true });
  auditar(req, 'restaurou o logo padrão');
  res.json({ ok: true });
});

app.get('/api/admin/auditoria', exigirAdmin, (req, res) => {
  const q = `%${texto(req.query.q, 100) || ''}%`;
  const limite = Math.min(Number(req.query.limite) || 300, 2000);
  res.json(db.prepare('SELECT * FROM auditoria WHERE usuario LIKE ? OR acao LIKE ? OR detalhe LIKE ? ORDER BY id DESC LIMIT ?').all(q, q, q, limite));
});

app.get('/api/admin/sistema', exigirAdmin, (req, res) => {
  const conta = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  res.json({
    usuarios: conta('usuarios'), clientes: conta('clientes'), leads: conta('leads'), propostas: conta('propostas'),
    projetos: conta('projetos'), lancamentos: conta('lancamentos'), documentos: conta('documentos'),
    tamanhoBanco: fs.statSync(DB_FILE).size,
    node: process.version,
    iniciadoEm: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  });
});

app.get('/api/admin/backup', exigirAdmin, (req, res) => {
  const destino = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  auditar(req, 'baixou backup do banco');
  const nome = `arconsultoria-backup-${hojeISO()}.db`;
  res.download(destino, nome, () => fs.rmSync(destino, { force: true }));
});

// ---------- estáticos ----------
app.get(['/entrar', '/app', '/admin'], (req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ erro: err.type === 'entity.too.large' ? 'Conteúdo grande demais.' : 'Erro interno. Tente novamente.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`AR Consultoria rodando em http://localhost:${PORT}`));
}

module.exports = { app, numero, somarMeses };
