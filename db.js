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

-- Portfólio: aplicativos, sistemas, painéis e projetos (Vértice e os cases da Hessel e da Âmbar em destaque).
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

if (!db.prepare('SELECT COUNT(*) n FROM vitrine').get().n) {
  const vertice = db.prepare(`INSERT INTO vitrine (nome, tipo, slogan, descricao, recursos, publico, link, link_repo, tecnologias, destaque, ordem)
    VALUES (?, 'aplicativo', ?, ?, ?, ?, ?, ?, ?, 1, 1)`).run(
    'Vértice',
    'Gestão financeira de alto padrão',
    'O Vértice organiza receitas, despesas, investimentos e poupança mês a mês, mostra quanto já foi pago e quanto falta pagar e consolida tudo em uma visão anual por categoria. Visual moderno, rápido e pensado para quem quer controle sem planilhas complicadas.',
    [
      'Painel do mês: total recebido, patrimônio, contas a pagar, contas pagas, falta pagar e saldo líquido',
      'Lançamentos por categoria: despesa fixa, despesa variável, investimento, poupança e renda',
      'Recorrência automática: lançamento único, repetição mensal ou parcelamento em N vezes',
      'Marcar contas como pagas e ordenar por data ou valor',
      'Visão anual consolidada por categoria, com detalhamento de cada lançamento',
      'Acesso com login e cadastro de usuário',
    ].join('\n'),
    'Pessoas e pequenos negócios que querem controlar o fluxo de caixa',
    '',
    'https://github.com/augustorecursos-jpg/App_Vertice_Gest-o_Financeira',
    'HTML, Tailwind CSS, JavaScript',
  );
  // Prints reais do Vértice (com dados de exemplo).
  copiarImagem('vitrine/vertice-1.jpg', `vitrine-${Number(vertice.lastInsertRowid)}-1`);
  copiarImagem('vitrine/vertice-2.jpg', `vitrine-${Number(vertice.lastInsertRowid)}-2`);
}

// Cases e projetos iniciais (só na primeira execução): Hessel Domiciliar (cliente) e projetos desenvolvidos na Âmbar Energia.
// imagens = prints reais das telas (com dados de demonstração) em assets/vitrine; logo do cliente em assets/clientes.
const CASOS_INICIAIS = [
  {
    cliente: { nome: 'Hessel Domiciliar', segmento: 'Saúde', observacoes: 'Atenção domiciliar. Sistema web de fechamento de folhas e produtividade.' },
    logo: 'clientes/hessel.png',
    imagens: ['vitrine/hessel-1.jpg', 'vitrine/hessel-2.jpg'],
    nome: 'Fechamento de folhas e produtividade',
    slogan: 'Do lançamento dos atendimentos ao fechamento do mês, sem retrabalho',
    descricao: 'Sistema web feito sob medida para a Hessel Domiciliar, empresa de atenção domiciliar. Centraliza os cadastros de pacientes e profissionais, a planilha de atendimentos do mês e a conferência das folhas recebidas, mostrando na hora o que falta e o que chegou com o nome errado. Relatórios e documentos saem em PDF no papel timbrado da empresa.',
    recursos: [
      'Painel do mês: pacientes e profissionais ativos, atendimentos lançados e folhas recebidas × faltando',
      'Planilha de atendimento por paciente + profissional, dia a dia, com salvamento automático',
      'Conferência das folhas da pasta: nome correto, grafia diferente, fora do padrão, duplicadas e faltantes',
      'Script que renomeia todos os arquivos para o padrão com dois cliques',
      'Cadastros com importação do Excel e exportação para Excel e PDF',
      'Papel timbrado e documentos (declarações, ofícios, recibos) em PDF',
      'Usuários com perfis, auditoria de ações e backup do banco',
    ],
    publico: 'Operação e administrativo da Hessel Domiciliar',
    link_repo: 'https://github.com/augustorecursos-jpg/Hessel',
    tecnologias: 'Node.js, SQLite, HTML/CSS/JavaScript, PDF e Excel',
  },
  {
    realizado_em: 'Âmbar Energia',
    imagens: ['vitrine/dho-1.jpg', 'vitrine/dho-2.jpg'],
    nome: 'Trilha de Desenvolvimento (DHO)',
    slogan: 'Treinamento dos colaboradores com avaliação e certificado automático',
    descricao: 'Plataforma de treinamento desenvolvida na Âmbar Energia para o time de DHO, acessada pelos colaboradores de todas as regionais apenas com o CPF. Organiza os temas da trilha com materiais em PDF protegidos, avaliações corrigidas no servidor e certificado emitido automaticamente para quem atinge 70% de acerto, além de um painel de indicadores para o RH.',
    recursos: [
      'Acesso do colaborador pelo CPF, com base importada do Excel (CPF, nome, cargo, filial e regional)',
      'Temas com materiais em PDF exibidos na plataforma, com bloqueio de impressão, cópia e captura',
      'Avaliações com gabarito no servidor; aprovação a partir de 70% e certificado em PDF com código de autenticidade',
      'Avaliação de reação com escala, nota, múltipla escolha e texto livre, inclusive por QR Code',
      'Painel do RH: acessos, conclusão por tema e regional, certificados, notas e aprovação',
      'Resultados por colaborador com filtros e exportação, backup do banco',
    ],
    publico: 'Colaboradores de todas as regionais e time de DHO / RH',
    link_repo: 'https://github.com/augustorecursos-jpg/DHO-mbar',
    tecnologias: 'Node.js, SQLite, HTML/CSS/JavaScript, pdf.js e pdf-lib',
  },
  {
    realizado_em: 'Âmbar Energia',
    imagens: ['vitrine/reembolsos-1.jpg', 'vitrine/reembolsos-2.jpg'],
    nome: 'Portal de Reembolsos',
    slogan: 'Solicitação, análise e aprovação de reembolsos sem e-mail e sem planilha paralela',
    descricao: 'Portal desenvolvido na Âmbar Energia para o RH controlar os reembolsos de medicamento, educacional, creche/babá e óculos. O colaborador envia a solicitação com os documentos pelo CPF, o RH analisa com saldo e histórico de cada beneficiário, e no dia 11 o sistema gera o arquivo das aprovadas para a folha de pagamento. Tudo fica rastreável, com regras de elegibilidade e limites aplicadas automaticamente.',
    recursos: [
      'Solicitação em 5 passos com anexos obrigatórios e validações na tela e no servidor',
      'Regras de cada benefício: limites por mês ou período, faixas etárias, sucedidos × não sucedidos',
      'Saldo calculado na hora (aprovadas e em análise) e bloqueio de aprovação acima do limite',
      'Área do RH: filtros, aprovação total ou parcial, reprovação com justificativa e linha do tempo',
      'Arquivo da folha de pagamento em CSV ou Excel, com verba de cada benefício',
      'Base mensal de elegibilidade importada do Excel, avisos por e-mail, auditoria e backup',
    ],
    publico: 'Colaboradores e time de RH da Âmbar Energia',
    link_repo: 'https://github.com/augustorecursos-jpg/Reembolsos_-mbar',
    tecnologias: 'Node.js, SQLite, HTML/CSS/JavaScript, Excel e e-mail',
  },
];

if (!db.prepare("SELECT 1 FROM config WHERE chave = 'seed_casos'").get()) {
  CASOS_INICIAIS.forEach((c, i) => {
    if (c.cliente && !db.prepare('SELECT 1 FROM clientes WHERE nome = ?').get(c.cliente.nome)) {
      const cli = db.prepare("INSERT INTO clientes (nome, segmento, origem, observacoes, portfolio) VALUES (?, ?, 'Indicação', ?, 1)")
        .run(c.cliente.nome, c.cliente.segmento || null, c.cliente.observacoes || null);
      if (c.logo) copiarImagem(c.logo, `cliente-${Number(cli.lastInsertRowid)}`);
    }
    const r = db.prepare(`INSERT INTO vitrine (nome, tipo, cliente, realizado_em, slogan, descricao, recursos, publico, link, link_repo, tecnologias, destaque, ordem)
      VALUES (?, 'sistema', ?, ?, ?, ?, ?, ?, '', ?, ?, 1, ?)`).run(c.nome, c.cliente?.nome || null, c.realizado_em || null, c.slogan, c.descricao, c.recursos.join('\n'),
      c.publico, c.link_repo, c.tecnologias, i + 2);
    (c.imagens || []).forEach((img, n) => copiarImagem(img, `vitrine-${Number(r.lastInsertRowid)}-${n + 1}`));
  });
  db.prepare("INSERT INTO config (chave, valor) VALUES ('seed_casos', '1')").run();
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
