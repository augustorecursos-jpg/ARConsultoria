// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências nativas).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'arconsultoria.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  login      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil     TEXT NOT NULL DEFAULT 'operador' CHECK (perfil IN ('admin', 'operador')),
  ativo      INTEGER NOT NULL DEFAULT 1,
  ultimo_acesso TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  documento   TEXT,
  segmento    TEXT,
  contato     TEXT,
  email       TEXT,
  telefone    TEXT,
  cidade      TEXT,
  origem      TEXT,
  observacoes TEXT,
  portfolio   INTEGER NOT NULL DEFAULT 0,
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contatos comerciais (funil de vendas).
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  empresa     TEXT,
  email       TEXT,
  telefone    TEXT,
  interesse   TEXT,
  mensagem    TEXT,
  origem      TEXT NOT NULL DEFAULT 'manual',
  status      TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'contato', 'proposta', 'ganho', 'perdido')),
  valor_estimado REAL,
  proximo_contato TEXT,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  observacoes TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Serviços oferecidos: entram no portfólio em PDF e servem de base para os itens das propostas.
CREATE TABLE IF NOT EXISTS servicos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  resumo      TEXT,
  descricao   TEXT,
  icone       TEXT,
  preco_base  REAL,
  unidade     TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  publicado   INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Portfólio: aplicativos, sistemas, e-books e projetos (conteúdo inicial em catalogo.js).
-- cliente = nome do cliente atendido (cases); realizado_em = empresa onde o projeto foi feito, quando não é cliente.
-- recursos = um recurso por linha. A imagem (print da tela) fica em DATA_DIR/vitrine-<id>.png|jpg.
CREATE TABLE IF NOT EXISTS vitrine (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'aplicativo',
  cliente     TEXT,
  realizado_em TEXT,
  slogan      TEXT,
  descricao   TEXT,
  recursos    TEXT,
  publico     TEXT,
  link        TEXT,
  link_repo   TEXT,
  tecnologias TEXT,
  destaque    INTEGER NOT NULL DEFAULT 0,
  ordem       INTEGER NOT NULL DEFAULT 0,
  publicado   INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- itens = JSON [{ "descricao": "...", "qtd": 1, "valor": 1500 }]
CREATE TABLE IF NOT EXISTS propostas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  numero      TEXT NOT NULL UNIQUE,
  cliente_id  INTEGER REFERENCES clientes(id),
  lead_id     INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  titulo      TEXT NOT NULL,
  introducao  TEXT,
  itens       TEXT NOT NULL DEFAULT '[]',
  desconto    REAL NOT NULL DEFAULT 0,
  condicoes   TEXT,
  prazo       TEXT,
  validade    TEXT,
  status      TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'recusada')),
  usuario     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projetos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id),
  proposta_id INTEGER REFERENCES propostas(id) ON DELETE SET NULL,
  servico     TEXT,
  status      TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'andamento', 'pausado', 'concluido', 'cancelado')),
  inicio      TEXT,
  prazo       TEXT,
  valor       REAL,
  progresso   INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Financeiro da consultoria: receitas (a receber/recebidas) e despesas (a pagar/pagas).
CREATE TABLE IF NOT EXISTS lancamentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao   TEXT NOT NULL,
  categoria   TEXT,
  valor       REAL NOT NULL,
  vencimento  TEXT NOT NULL,
  pago_em     TEXT,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  projeto_id  INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  observacoes TEXT,
  usuario     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Central de sistemas: plataformas publicadas (Hessel, Vértice, Trilha, Reembolsos…) com links e verificação de "no ar".
-- Nenhuma senha é guardada aqui: o acesso continua sendo feito com o login de cada sistema.
CREATE TABLE IF NOT EXISTS sistemas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  cliente     TEXT,
  descricao   TEXT,
  url         TEXT,
  caminho_admin TEXT,
  acesso      TEXT,
  observacoes TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  monitorar   INTEGER NOT NULL DEFAULT 1,
  status      TEXT,
  codigo_http INTEGER,
  latencia_ms INTEGER,
  verificado_em TEXT,
  online_em   TEXT,
  erro        TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo      TEXT NOT NULL,
  destinatario TEXT,
  corpo       TEXT NOT NULL DEFAULT '',
  local_data  TEXT,
  assinatura  TEXT,
  usuario     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario   TEXT,
  acao      TEXT NOT NULL,
  detalhe   TEXT,
  ip        TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lanc_venc ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em);
`);

// Dados da empresa, do papel timbrado e do portfólio (editáveis na administração).
const CONFIG_PADRAO = {
  empresa_nome: 'AR Consultoria',
  empresa_subtitulo: 'Consultoria financeira, dados e tecnologia',
  empresa_cnpj: '',
  empresa_endereco: '',
  empresa_telefone: '(11) 98634-5441',
  empresa_email: 'arconsultoriaa@outlook.com',
  empresa_site: '',
  rodape_extra: '',
  responsavel_nome: 'Augusto Rodrigues Silva',
  responsavel_cargo: 'Consultor · Business Intelligence',
  whatsapp: '5511986345441',
  instagram: 'augustorodry',
  linkedin: 'Augusto Rodrigues',
  portfolio_link: '',
  portfolio_titulo: 'Portfólio de serviços',
  portfolio_chamada: 'Business Intelligence · Power BI · Qlik Sense · IA Generativa · Automação · Desenvolvimento de Sistemas',
  portfolio_frase: 'Desenvolvo dashboards interativos e automatizados, ferramentas e aplicativos para diferentes áreas de negócio.',
  portfolio_sobre: 'Mais de 10 anos de experiência profissional em Human Resources e Analytics, com histórico de atuação em grandes companhias como Riachuelo, GPA, Assaí, Aché Laboratórios e JBS. Trabalho com o Power BI desde 2020 e sou apaixonado pelo universo de DataViz e design de dashboards. Procuro estar sempre antenado às atualizações do mercado para me manter atualizado.',
  portfolio_anos: '10+',
  portfolio_empresas: 'Riachuelo, GPA, Assaí, Aché Laboratórios, JBS',
  portfolio_habilidades: [
    'Visualização & análise de dados | Dashboards profissionais em Power BI, Power Apps, Tableau e Excel.',
    'Design de dashboards | Canvas, Figma ou PowerPoint para layouts premium de Business Intelligence.',
    'Automação de projetos | Processos manuais automatizados com Flow, Power Automate e outros.',
    'Business Intelligence | Atuação estratégica e consultiva como Business Partner e Analytics.',
  ].join('\n'),
  categorias_receita: 'Consultoria, Dashboards, Aplicativos, Treinamentos, Assinatura Vértice, Outras receitas',
  categorias_despesa: 'Impostos, Software e licenças, Hospedagem, Marketing, Equipamentos, Deslocamento, Outras despesas',
  segmentos: 'Varejo, Indústria, Saúde, Serviços, Educação, Agronegócio, Pessoa física',
  proposta_condicoes: '50% na aprovação da proposta e 50% na entrega.\nPagamento via PIX ou transferência bancária.',
  proposta_validade_dias: '15',
};
const insCfg = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(CONFIG_PADRAO)) insCfg.run(k, v);

function lerConfig() {
  const out = {};
  for (const r of db.prepare('SELECT chave, valor FROM config').all()) out[r.chave] = r.valor ?? '';
  return out;
}

// ---------- conteúdo inicial do portfólio (só na primeira execução) ----------
if (!db.prepare('SELECT COUNT(*) n FROM servicos').get().n) {
  const ins = db.prepare('INSERT INTO servicos (nome, resumo, descricao, icone, unidade, ordem) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['Consultoria financeira', 'Diagnóstico, organização do fluxo de caixa e indicadores para decidir com segurança.',
      'Levantamento da situação financeira, estruturação de plano de contas, fluxo de caixa, DRE gerencial e rotina de acompanhamento com indicadores.', 'grafico', 'projeto'],
    ['Painéis e dashboards', 'Dashboards em Power BI, Qlik Sense e Excel com design premium e atualização automática.',
      'Do layout (Figma/PowerPoint) ao projeto completo: modelagem de dados, medidas, design e publicação, com foco em leitura rápida e decisões.', 'painel', 'projeto'],
    ['Ferramentas e automações', 'Fim do trabalho manual repetitivo com Power Automate, fluxos e planilhas inteligentes.',
      'Mapeamento do processo, automação de rotinas (Power Automate, Flow, scripts) e ferramentas sob medida que economizam horas por semana.', 'raio', 'projeto'],
    ['Aplicativos sob medida', 'Sistemas web e aplicativos para controlar o que a sua operação precisa.',
      'Aplicativos e sistemas web com login, cadastros, relatórios e exportações — como o Vértice, de gestão financeira.', 'app', 'projeto'],
    ['Treinamentos', 'Capacitação online ou presencial em Power BI, Excel e análise de dados.',
      'Turmas fechadas ou individuais, com material próprio e exercícios com os dados da sua empresa.', 'capelo', 'hora'],
  ].forEach((s, i) => ins.run(...s, i + 1));
}

/** Copia imagens de exemplo (assets/...) para a pasta de dados com o nome usado pelo servidor. */
function copiarImagem(origem, destinoSemExt) {
  const arq = path.join(__dirname, 'assets', origem);
  if (fs.existsSync(arq)) fs.copyFileSync(arq, path.join(DATA_DIR, `${destinoSemExt}${path.extname(arq)}`));
}

// ---------- catálogo de ferramentas (portfólio + Central de sistemas) ----------
// O conteúdo está em catalogo.js. Cada banco aplica a versão do catálogo uma única vez, na inicialização.
const { CATALOGO_VERSAO, FERRAMENTAS } = require('./catalogo');

// Bancos anteriores ao catálogo não têm a coluna "chave" (identifica o item do catálogo).
for (const tabela of ['vitrine', 'sistemas']) {
  if (!db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === 'chave')) db.exec(`ALTER TABLE ${tabela} ADD COLUMN chave TEXT`);
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Encontra o item da vitrine pela chave, pelo repositório (atual ou antigo) ou pelo nome (atual ou antigo). */
function acharNaVitrine(f) {
  const porChave = db.prepare('SELECT * FROM vitrine WHERE chave = ?').get(f.chave);
  if (porChave) return porChave;
  const linhas = db.prepare('SELECT * FROM vitrine WHERE chave IS NULL').all();
  const repos = [f.link_repo, ...(f.antigos?.repos || [])].filter(Boolean).map((r) => r.split('/').pop().toLowerCase());
  const nomes = [f.nome, ...(f.antigos?.nomes || [])].map(semAcento);
  return linhas.find((l) => l.link_repo && repos.includes(l.link_repo.split('/').pop().toLowerCase()))
    || linhas.find((l) => nomes.includes(semAcento(l.nome)));
}

function trocarImagens(id, imagens) {
  for (const n of [1, 2]) for (const ext of ['png', 'jpg']) fs.rmSync(path.join(DATA_DIR, `vitrine-${id}-${n}.${ext}`), { force: true });
  imagens.forEach((img, n) => copiarImagem(img, `vitrine-${id}-${n + 1}`));
}

function aplicarCatalogo() {
  FERRAMENTAS.forEach((f, i) => {
    // Cliente do case (cadastrado só se ainda não existir; o logo entra se o cliente não tiver um).
    if (f.cliente) {
      let cli = db.prepare('SELECT id FROM clientes WHERE nome = ?').get(f.cliente.nome);
      if (!cli) {
        cli = { id: Number(db.prepare("INSERT INTO clientes (nome, segmento, origem, observacoes, portfolio) VALUES (?, ?, 'Indicação', ?, 1)")
          .run(f.cliente.nome, f.cliente.segmento || null, f.cliente.observacoes || null).lastInsertRowid) };
      }
      const temLogo = ['png', 'jpg'].some((ext) => fs.existsSync(path.join(DATA_DIR, `cliente-${cli.id}.${ext}`)));
      if (f.cliente.logo && !temLogo) copiarImagem(f.cliente.logo, `cliente-${cli.id}`);
    }

    // Item do portfólio: textos e prints do catálogo; ordem, destaque, publicação e link continuam como estão.
    const campos = {
      chave: f.chave, nome: f.nome, tipo: f.tipo, cliente: f.cliente?.nome || null, realizado_em: f.realizado_em || null,
      slogan: f.slogan, descricao: f.descricao, recursos: f.recursos.join('\n'), publico: f.publico,
      link_repo: f.link_repo || null, tecnologias: f.tecnologias,
    };
    const atual = acharNaVitrine(f);
    let id;
    if (atual) {
      id = atual.id;
      db.prepare(`UPDATE vitrine SET ${Object.keys(campos).map((k) => `${k} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`)
        .run(...Object.values(campos), id);
    } else {
      const ks = [...Object.keys(campos), 'link', 'destaque', 'publicado', 'ordem'];
      id = Number(db.prepare(`INSERT INTO vitrine (${ks.join(', ')}) VALUES (${ks.map(() => '?').join(', ')})`)
        .run(...Object.values(campos), '', 1, 1, i + 1).lastInsertRowid);
    }
    trocarImagens(id, f.imagens);

    // Central de sistemas: atualiza nome, cliente, descrição e acesso; o endereço cadastrado não muda.
    const sis = f.sistema;
    const nomesSis = [sis.nome, ...(sis.antigos || [])].map(semAcento);
    const existente = db.prepare('SELECT * FROM sistemas WHERE chave = ?').get(f.chave)
      || db.prepare('SELECT * FROM sistemas WHERE chave IS NULL').all().find((x) => nomesSis.includes(semAcento(x.nome)));
    if (existente) {
      db.prepare(`UPDATE sistemas SET chave = ?, nome = ?, cliente = ?, descricao = ?, caminho_admin = COALESCE(caminho_admin, ?), acesso = ?,
        atualizado_em = datetime('now') WHERE id = ?`).run(f.chave, sis.nome, sis.cliente, sis.descricao, sis.caminho_admin, sis.acesso, existente.id);
    } else {
      db.prepare('INSERT INTO sistemas (chave, nome, cliente, descricao, caminho_admin, acesso, ordem, monitorar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(f.chave, sis.nome, sis.cliente, sis.descricao, sis.caminho_admin, sis.acesso, i + 1, sis.monitorar ?? 1);
    }
  });
}

const versaoAplicada = Number(db.prepare("SELECT valor FROM config WHERE chave = 'catalogo_versao'").get()?.valor || 0);
if (versaoAplicada < CATALOGO_VERSAO) {
  db.exec('BEGIN');
  try {
    aplicarCatalogo();
    db.prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('catalogo_versao', ?)").run(String(CATALOGO_VERSAO));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- senhas (scrypt) ----------
function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  const [tipo, salHex, hHex] = String(armazenado || '').split('$');
  if (tipo !== 'scrypt' || !salHex || !hHex) return false;
  const h = crypto.scryptSync(String(senha), Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hHex, 'hex');
  return esperado.length === h.length && crypto.timingSafeEqual(h, esperado);
}

module.exports = { db, DATA_DIR, DB_FILE, lerConfig, hashSenha, conferirSenha, CONFIG_PADRAO };
