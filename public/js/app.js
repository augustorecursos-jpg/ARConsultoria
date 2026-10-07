// Sistema da AR Consultoria: painel, portfólio, leads, clientes, propostas, projetos, financeiro e documentos.
const estado = {
  eu: null,
  cfg: {},
  mes: lsLer('ar.mes', competenciaAtual()),
  clientes: [],
  leads: [],
  servicos: [],
  vitrine: [],
  propostas: [],
  projetos: [],
  secao: null,
};

const LEAD_STATUS = {
  novo: { rot: 'Novo', cor: 'indigo' },
  contato: { rot: 'Em contato', cor: 'info' },
  proposta: { rot: 'Proposta enviada', cor: 'aviso' },
  ganho: { rot: 'Ganho', cor: 'ok' },
  perdido: { rot: 'Perdido', cor: 'neutra' },
};
const PROPOSTA_STATUS = {
  rascunho: { rot: 'Rascunho', cor: 'neutra' },
  enviada: { rot: 'Enviada', cor: 'aviso' },
  aprovada: { rot: 'Aprovada', cor: 'ok' },
  recusada: { rot: 'Recusada', cor: 'erro' },
};
const PROJETO_STATUS = {
  planejado: { rot: 'Planejado', cor: 'indigo' },
  andamento: { rot: 'Em andamento', cor: 'info' },
  pausado: { rot: 'Pausado', cor: 'aviso' },
  concluido: { rot: 'Concluído', cor: 'ok' },
  cancelado: { rot: 'Cancelado', cor: 'neutra' },
};
const TIPOS_VITRINE = { aplicativo: 'Aplicativo', sistema: 'Sistema web', painel: 'Painel / dashboard', ferramenta: 'Ferramenta', projeto: 'Projeto' };
const ICONES_SERVICO = { grafico: 'grafico', painel: 'painel', raio: 'raio', app: 'app', capelo: 'capelo', alvo: 'alvo', estrela: 'estrela', dinheiro: 'dinheiro' };

const tag = (mapa, k) => `<span class="tag ${mapa[k]?.cor || 'neutra'}">${esc(mapa[k]?.rot || k || '')}</span>`;
const cfgLista = (chave) => String(estado.cfg[chave] || '').split(',').map((x) => x.trim()).filter(Boolean);
const tituloEmpresa = () => estado.cfg.empresa_nome || 'AR Consultoria';
const mesCapitalizado = (c) => { const n = nomeCompetencia(c); return n[0].toUpperCase() + n.slice(1); };
const linkZap = (tel) => { let d = String(tel || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = `55${d}`; return d.length >= 12 ? `https://wa.me/${d}` : ''; };

// ================= inicialização =================
(async function iniciar() {
  try {
    estado.eu = await api('/api/eu');
  } catch { return; }
  $('#nome-usuario').textContent = estado.eu.nome;
  $('#perfil-usuario').textContent = estado.eu.perfil === 'admin' ? 'Administrador' : 'Operador';
  $('#av-usuario').textContent = iniciais(estado.eu.nome);
  $('#saudacao').textContent = `${saudacao()}, ${estado.eu.nome.split(' ')[0]}!`;
  $('#hoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#link-admin').hidden = estado.eu.perfil !== 'admin';
  $('#aviso-senha-padrao').hidden = !estado.eu.padrao;
  estado.cfg = await api('/api/config');

  const inp = $('#competencia');
  const mudarMes = (c) => {
    if (!/^\d{4}-\d{2}$/.test(c)) return;
    estado.mes = c;
    inp.value = c;
    lsGravar('ar.mes', c);
    atualizarRotulosMes();
    abrirSecao(estado.secao, true);
  };
  inp.value = estado.mes;
  atualizarRotulosMes();
  inp.addEventListener('change', () => mudarMes(inp.value));
  $('#mes-ant').addEventListener('click', () => mudarMes(competenciaAnterior(estado.mes)));
  $('#mes-prox').addEventListener('click', () => mudarMes(proximaCompetencia(estado.mes)));

  $('#btn-sair').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; });
  $('#btn-senha').addEventListener('click', trocarSenha);
  $('#link-trocar-senha').addEventListener('click', (e) => { e.preventDefault(); trocarSenha(); });
  $$('[data-gerar-portfolio]').forEach((b) => b.addEventListener('click', () => gerarPortfolioModal()));
  $('[data-nova-proposta]').addEventListener('click', (e) => { e.preventDefault(); editarProposta(); });

  window.addEventListener('hashchange', () => abrirSecao(location.hash.slice(1)));
  abrirSecao(location.hash.slice(1) || 'painel');
})();

function atualizarRotulosMes() {
  $('#nome-comp').textContent = mesCapitalizado(estado.mes);
  $('#painel-mes').textContent = nomeCompetencia(estado.mes);
  $('#fn-mes').textContent = mesCapitalizado(estado.mes);
}

const CARREGADORES = {
  painel: carregarPainel,
  portfolio: carregarPortfolio,
  sistemas: carregarSistemas,
  leads: carregarLeads,
  clientes: carregarClientes,
  propostas: carregarPropostas,
  projetos: carregarProjetos,
  financeiro: carregarFinanceiro,
  documentos: carregarDocumentos,
};

function abrirSecao(nome, forcar = false) {
  if (!CARREGADORES[nome]) nome = 'painel';
  if (estado.secao === nome && !forcar) return;
  estado.secao = nome;
  $$('section[data-secao]').forEach((s) => { s.hidden = s.dataset.secao !== nome; });
  $$('#menu a[data-secao]').forEach((a) => a.classList.toggle('ativo', a.dataset.secao === nome));
  if (location.hash.slice(1) !== nome) history.replaceState(null, '', `#${nome}`);
  CARREGADORES[nome]().catch((e) => toast(e.message, true));
}
const recarregar = () => CARREGADORES[estado.secao]?.().catch((e) => toast(e.message, true));

function atualizarContadorLeads() {
  const n = estado.leads.filter((l) => l.status === 'novo').length;
  $('#cont-leads').textContent = n;
  $('#cont-leads').hidden = !n;
}

function trocarSenha() {
  const m = modal(`<h2>Trocar senha</h2>
    <form id="f-senha" class="grade-form">
      <div class="inteiro"><label class="rotulo">Senha atual</label><input type="password" name="atual" required autocomplete="current-password"></div>
      <div><label class="rotulo">Nova senha</label><input type="password" name="nova" required minlength="8" autocomplete="new-password"></div>
      <div><label class="rotulo">Repita a nova senha</label><input type="password" name="nova2" required minlength="8" autocomplete="new-password"></div>
    </form>
    <div class="rodape-modal"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" form="f-senha">Salvar</button></div>`);
  $('#f-senha', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.nova.value !== f.nova2.value) return toast('As senhas não conferem.', true);
    try {
      await api('/api/eu/senha', { method: 'POST', body: { atual: f.atual.value, nova: f.nova.value } });
      toast('Senha alterada.');
      $('#aviso-senha-padrao').hidden = true;
      m.fechar();
    } catch (err) { toast(err.message, true); }
  });
}

// ================= formulários genéricos =================
/**
 * campos: [{ k, rot, tipo: 'text'|'email'|'tel'|'date'|'area'|'select'|'check'|'valor'|'numero', opcoes: [[valor, rótulo]],
 *            lista: ['sugestões'], inteiro, obrig, ajuda }]
 */
function htmlCampos(campos, item = {}) {
  return campos.map((c) => {
    const v = item?.[c.k] ?? c.padrao ?? '';
    let ctrl;
    if (c.tipo === 'area') ctrl = `<textarea name="${c.k}" ${c.obrig ? 'required' : ''} style="min-height:${c.alt || 5}em">${esc(v)}</textarea>`;
    else if (c.tipo === 'select') ctrl = `<select name="${c.k}" ${c.obrig ? 'required' : ''}>${c.opcoes.map(([val, rot]) => `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(rot)}</option>`).join('')}</select>`;
    else if (c.tipo === 'check') ctrl = `<label class="check" style="margin-top:.5em"><input type="checkbox" name="${c.k}" ${v ? 'checked' : ''}> ${esc(c.texto || 'Sim')}</label>`;
    else if (c.tipo === 'valor') ctrl = `<input type="text" inputmode="decimal" name="${c.k}" value="${v === '' || v === null ? '' : esc(Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" placeholder="0,00" ${c.obrig ? 'required' : ''}>`;
    else {
      const lista = c.lista ? `list="dl-${c.k}"` : '';
      ctrl = `<input type="${c.tipo === 'numero' ? 'number' : c.tipo || 'text'}" name="${c.k}" value="${esc(v)}" ${c.obrig ? 'required' : ''} ${lista}
        ${c.min !== undefined ? `min="${c.min}"` : ''} ${c.max !== undefined ? `max="${c.max}"` : ''} ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''}>
        ${c.lista ? `<datalist id="dl-${c.k}">${c.lista.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
    }
    return `<div class="${c.inteiro ? 'inteiro' : ''}"><label class="rotulo">${esc(c.rot)}${c.ajuda ? ` <small>(${esc(c.ajuda)})</small>` : ''}</label>${ctrl}</div>`;
  }).join('');
}

function lerCampos(form, campos) {
  const dados = {};
  for (const c of campos) {
    const el = form.elements[c.k];
    if (!el) continue;
    if (c.tipo === 'check') dados[c.k] = el.checked;
    else if (c.tipo === 'valor') dados[c.k] = lerNumero(el.value);
    else dados[c.k] = el.value;
  }
  return dados;
}

/** Modal de cadastro com salvar/excluir. Retorna o modal. */
function formModal({ titulo, campos, item, topo = '', rodapeEsq = '', largo = false, aoSalvar, aoExcluir, rotuloExcluir = 'Excluir' }) {
  const m = modal(`<h2>${esc(titulo)}</h2>${topo}
    <form id="f-gen" class="grade-form">${htmlCampos(campos, item)}</form>
    <div class="rodape-modal" style="justify-content:space-between">
      <div class="linha">${aoExcluir ? `<button class="btn perigo" id="b-excluir">${ic('lixo')} ${esc(rotuloExcluir)}</button>` : ''}${rodapeEsq}</div>
      <div class="linha"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" form="f-gen">${ic('check')} Salvar</button></div>
    </div>`);
  if (largo) $('.modal', m.el).classList.add('largo');
  $('#f-gen', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[form="f-gen"]', m.el);
    btn.disabled = true;
    try {
      await aoSalvar(lerCampos(e.target, campos), m);
      m.fechar();
    } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  });
  $('#b-excluir', m.el)?.addEventListener('click', async () => {
    try { if (await aoExcluir(m) !== false) m.fechar(); } catch (err) { toast(err.message, true); }
  });
  return m;
}

const opcoesClientes = (vazioRot = '— nenhum —') => [['', vazioRot], ...estado.clientes.filter((c) => c.ativo).map((c) => [c.id, c.nome])];
const opcoesMapa = (mapa) => Object.entries(mapa).map(([k, v]) => [k, v.rot]);

async function carregarBase(...quais) {
  await Promise.all(quais.map(async (q) => { estado[q] = await api(`/api/${q}`); }));
  if (quais.includes('leads')) atualizarContadorLeads();
}

// ================= PAINEL =================
function kpi({ rot, val, det = '', icone, cor = '' }) {
  return `<div class="kpi ${cor}"><div class="topo-kpi"><span class="rot">${rot}</span><span class="bolha ${cor}">${ic(icone)}</span></div>
    <div class="val">${val}</div>${det ? `<div class="det">${det}</div>` : ''}</div>`;
}

/** Gráfico de barras agrupadas (receitas × despesas) em HTML. */
function graficoBarras(serie, { rotulo = (m) => MESES[Number(m.mes.slice(5)) - 1].slice(0, 3), atual = estado.mes } = {}) {
  const max = Math.max(1, ...serie.map((s) => Math.max(s.receitas, s.despesas)));
  return `<div class="grafico">${serie.map((s) => `
    <div class="col-graf ${s.mes === atual ? 'atual' : ''}" title="${esc(mesCapitalizado(s.mes))}: receitas ${moeda(s.receitas)} · despesas ${moeda(s.despesas)}">
      <div class="barras"><span class="rec" style="height:${(s.receitas / max) * 100}%"></span><span class="desp" style="height:${(s.despesas / max) * 100}%"></span></div>
      <small>${esc(rotulo(s))}</small></div>`).join('')}</div>
    <div class="legenda-graf"><span><i class="rec"></i> Receitas</span><span><i class="desp"></i> Despesas</span></div>`;
}

async function carregarPainel() {
  const [p] = await Promise.all([api(`/api/painel?mes=${estado.mes}`), carregarBase('leads')]);
  const f = p.financeiro;
  const totalFunil = Object.values(p.funil).reduce((a, b) => a + b, 0);
  $('#kpis').innerHTML = [
    kpi({ rot: 'Leads novos', val: p.funil.novo, icone: 'funil', cor: 'indigo', det: `${p.leadsNoMes} chegaram em ${nomeCompetencia(p.mes).split(' ')[0]}` }),
    kpi({ rot: 'Propostas em aberto', val: moedaCurta(p.propostasAbertas.valor), icone: 'documento', cor: 'ambar',
      det: `${p.propostasAbertas.qtd} enviada(s)${p.conversao !== null ? ` · conversão ${Math.round(p.conversao * 100)}%` : ''}` }),
    kpi({ rot: 'Recebido no mês', val: moedaCurta(f.recebido), icone: 'dinheiro', det: `faltam ${moeda(f.a_receber)}` }),
    kpi({ rot: 'Saldo do mês', val: moedaCurta(f.saldo), icone: 'grafico', cor: f.saldo < 0 ? 'ciano' : '', det: `despesas pagas ${moeda(f.pago)}` }),
  ].join('');

  atualizarContadorSistemas(p.sistemasFora.length);
  $('#painel-sistemas').innerHTML = !p.sistemasFora.length ? '' : `<div class="aviso-box erro">${ic('servidor')}<span><b>${p.sistemasFora.length === 1 ? 'Um sistema está fora do ar' : `${p.sistemasFora.length} sistemas estão fora do ar`}:</b>
    ${p.sistemasFora.map((x) => esc(x.nome)).join(', ')}. <a href="#sistemas">Ver na central de sistemas</a></span></div>`;

  $('#painel-grafico').innerHTML = p.serie.some((s) => s.receitas || s.despesas) ? graficoBarras(p.serie)
    : vazio({ ilustra: 'calendario', titulo: 'Sem lançamentos ainda', texto: 'Registre receitas e despesas no Financeiro para ver a evolução aqui.' });

  $('#painel-projetos').innerHTML = !p.projetosAtivos.length
    ? vazio({ ilustra: 'documento', titulo: 'Nenhum projeto em andamento', texto: 'Quando uma proposta for aprovada, gere o projeto direto pela proposta.' })
    : `<div class="lista-simples">${p.projetosAtivos.map((x) => `<div class="item">
        <div><b>${esc(x.nome)}</b><small>${esc(x.cliente_nome || 'Sem cliente')}${x.prazo ? ` · prazo ${dataCurta(x.prazo)}` : ''}</small></div>
        <div class="barra" title="${x.progresso}%"><span style="width:${x.progresso}%"></span></div>
        <small><b>${x.progresso}%</b></small></div>`).join('')}</div>`;

  $('#painel-funil').innerHTML = !totalFunil
    ? vazio({ ilustra: 'pessoas', titulo: 'Nenhum lead ainda', texto: 'Registre cada contato comercial para acompanhar o funil.', acoes: `<a class="btn" href="#leads">${ic('mais')} Novo lead</a>` })
    : `<div class="funil">${Object.entries(LEAD_STATUS).map(([k, s]) => `<a href="#leads" class="etapa">
        <span>${esc(s.rot)}</span><div class="barra ${k}"><span style="width:${(p.funil[k] / Math.max(...Object.values(p.funil), 1)) * 100}%"></span></div><b>${p.funil[k]}</b></a>`).join('')}</div>`;

  const agenda = [
    ...p.proximosContatos.map((l) => ({ data: l.proximo_contato, html: `${ic('telefone')}<div><b>${esc(l.nome)}</b><small>Retornar contato${l.empresa ? ` · ${esc(l.empresa)}` : ''}</small></div>`, lead: l.id })),
    ...p.vencimentos.map((v) => ({ data: v.vencimento, html: `${ic(v.tipo === 'receita' ? 'sobe' : 'desce')}<div><b>${esc(v.descricao)}</b><small>${v.tipo === 'receita' ? 'A receber' : 'A pagar'} · ${moeda(v.valor)}${v.cliente_nome ? ` · ${esc(v.cliente_nome)}` : ''}</small></div>`, lanc: v.id, tipo: v.tipo })),
  ].sort((a, b) => a.data.localeCompare(b.data));
  $('#painel-agenda').innerHTML = !agenda.length ? '<p class="suave" style="margin:0">Nada agendado para os próximos 15 dias.</p>'
    : `<div class="agenda">${agenda.map((x) => `<div class="item ${x.data < p.hoje ? 'atrasado' : ''}">
        <span class="data">${x.data === p.hoje ? 'Hoje' : dataCurta(x.data).slice(0, 5)}</span>${x.html}
        ${x.lanc ? `<button class="btn sec peq" data-baixa="${x.lanc}">${ic('check')} ${x.tipo === 'receita' ? 'Recebido' : 'Pago'}</button>` : `<a class="btn sec peq" href="#leads" data-lead="${x.lead}">Abrir</a>`}</div>`).join('')}</div>`;
  $$('#painel-agenda [data-baixa]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/lancamentos/${b.dataset.baixa}/baixa`, { method: 'POST', body: { pago: true } });
    toast('Baixa registrada.');
    carregarPainel();
  }));
  $$('#painel-agenda [data-lead]').forEach((b) => b.addEventListener('click', () => {
    const l = estado.leads.find((x) => x.id === Number(b.dataset.lead));
    if (l) setTimeout(() => editarLead(l), 50);
  }));
}

// ================= PORTFÓLIO =================
async function carregarPortfolio() {
  await carregarBase('servicos', 'vitrine', 'clientes');
  estado.cfg = await api('/api/config');
  const f = $('#pf-textos');
  for (const el of f.elements) if (el.name) el.value = estado.cfg[el.name] ?? '';
  if (f.elements.instagram.value) f.elements.instagram.value = `@${f.elements.instagram.value}`;
  desenharPaginasPortfolio();
  desenharItensVitrine();
  desenharServicos();
}

/** Miniatura das páginas que o PDF vai ter (com os itens publicados). */
function desenharPaginasPortfolio() {
  const serv = estado.servicos.filter((s) => s.publicado);
  const itens = estado.vitrine.filter((i) => i.publicado);
  const destaques = itens.filter((i) => i.destaque);
  const outros = itens.filter((i) => !i.destaque);
  const clientesPf = estado.clientes.filter((c) => c.ativo && c.portfolio);
  const paginas = [
    { t: 'Capa', d: estado.cfg.responsavel_nome || tituloEmpresa(), cls: 'capa' },
    { t: 'Sobre mim', d: `${estado.cfg.portfolio_anos || ''} anos · habilidades` },
    ...(serv.length ? [{ t: 'Serviços', d: `${serv.length} serviço(s)` }] : []),
    ...(clientesPf.length ? [{ t: 'Clientes atendidos', d: clientesPf.map((c) => c.nome).join(', ') }] : []),
    ...destaques.map((i) => ({ t: i.nome, d: i.cliente ? `Case · ${i.cliente}` : i.realizado_em || TIPOS_VITRINE[i.tipo] || 'Destaque', cls: 'destaque' })),
    ...(outros.length ? [{ t: 'Outros trabalhos', d: `${outros.length} item(ns)` }] : []),
    { t: 'Contato', d: 'Vamos conversar?', cls: 'capa' },
  ];
  $('#pf-paginas').innerHTML = paginas.map((p, i) => `<div class="pag-mini ${p.cls || ''}"><span class="n">${i + 1}</span><b>${esc(p.t)}</b><small>${esc(p.d)}</small></div>`).join('');
}

function desenharItensVitrine() {
  const lista = estado.vitrine;
  $('#pf-itens').innerHTML = !lista.length
    ? vazio({ ilustra: 'documento', titulo: 'Nenhum item ainda', texto: 'Cadastre aplicativos, painéis e projetos para mostrar no portfólio.' })
    : lista.map((it) => `<div class="item-vitrine ${it.publicado ? '' : 'oculto'}">
        <div class="capa-item" data-img="${it.id}">
          <div class="mock"><i></i><i></i><i></i><span></span></div>
          <img class="print1" src="/api/vitrine/${it.id}/imagem/1?v=${Date.now()}" alt="" onerror="this.remove()">
          <img class="print2" src="/api/vitrine/${it.id}/imagem/2?v=${Date.now()}" alt="" onerror="this.remove()">
          ${it.destaque ? `<span class="selo-destaque">${ic('estrela')} Destaque</span>` : ''}
        </div>
        <div class="corpo-item">
          <small class="tipo">${esc(TIPOS_VITRINE[it.tipo] || it.tipo)}${it.cliente ? ` · Cliente: ${esc(it.cliente)}` : it.realizado_em ? ` · ${esc(it.realizado_em)}` : ''}</small>
          <h3>${esc(it.nome)}</h3>
          ${it.slogan ? `<p class="slogan">${esc(it.slogan)}</p>` : ''}
          <p class="suave">${esc((it.descricao || '').slice(0, 150))}${(it.descricao || '').length > 150 ? '…' : ''}</p>
          <div class="linha" style="margin-top:auto">
            ${it.publicado ? '<span class="tag ok">No portfólio</span>' : '<span class="tag neutra">Fora do portfólio</span>'}
            ${it.link ? `<a class="btn fantasma peq icone" href="${esc(it.link)}" target="_blank" rel="noopener" title="Abrir">${ic('link')}</a>` : ''}
            <span class="cresce"></span>
            <button class="btn sec peq icone" title="Prints da tela" data-imagens="${it.id}">${ic('imagem')}</button>
            <button class="btn sec peq" data-editar-item="${it.id}">${ic('editar')} Editar</button>
          </div>
        </div></div>`).join('');
  $$('#pf-itens [data-editar-item]').forEach((b) => b.addEventListener('click', () => editarItemVitrine(estado.vitrine.find((x) => x.id === Number(b.dataset.editarItem)))));
  $$('#pf-itens [data-imagens]').forEach((b) => b.addEventListener('click', () => imagensItem(estado.vitrine.find((x) => x.id === Number(b.dataset.imagens)))));
}

/** Gerencia os 2 prints do item: o principal (grande) e o secundário (sobreposto) na página do portfólio. */
function imagensItem(item) {
  const slot = (n, rot) => `<div class="slot-img"><b>${rot}</b>
      <div class="previa" id="previa-${n}"><img src="/api/vitrine/${item.id}/imagem/${n}?v=${Date.now()}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'suave', textContent: 'Sem imagem' }))"></div>
      <div class="linha"><label class="btn sec peq"><input type="file" accept="image/png,image/jpeg" hidden data-n="${n}">${ic('enviar')} Enviar</label>
      <button class="btn perigo peq" data-rm="${n}">${ic('lixo')} Remover</button></div></div>`;
  const m = modal(`<h2>Prints · ${esc(item.nome)}</h2>
    <p class="suave" style="margin-top:-.4em">Use prints da tela (PNG ou JPG, de preferência na horizontal). No PDF eles aparecem em uma moldura de navegador; o secundário fica sobreposto ao principal. Sem imagem, o portfólio usa uma ilustração.</p>
    <div class="slots-img">${slot(1, 'Print principal')}${slot(2, 'Print secundário')}</div>
    <div class="rodape-modal"><button class="btn" data-fechar>Concluir</button></div>`, { aoFechar: () => desenharItensVitrine() });
  $('.modal', m.el).classList.add('largo');
  $$('input[data-n]', m.el).forEach((inp) => inp.addEventListener('change', async () => {
    const arq = inp.files[0];
    if (!arq) return;
    const fd = new FormData();
    fd.append('imagem', arq);
    try {
      await api(`/api/vitrine/${item.id}/imagem/${inp.dataset.n}`, { method: 'POST', body: fd });
      $(`#previa-${inp.dataset.n}`, m.el).innerHTML = `<img src="/api/vitrine/${item.id}/imagem/${inp.dataset.n}?v=${Date.now()}" alt="">`;
      toast('Imagem enviada.');
    } catch (e) { toast(e.message, true); }
  }));
  $$('[data-rm]', m.el).forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/vitrine/${item.id}/imagem/${b.dataset.rm}`, { method: 'DELETE' });
    $(`#previa-${b.dataset.rm}`, m.el).innerHTML = '<span class="suave">Sem imagem</span>';
    toast('Imagem removida.');
  }));
}

function editarItemVitrine(item = null) {
  const campos = [
    { k: 'nome', rot: 'Nome', obrig: true },
    { k: 'tipo', rot: 'Tipo', tipo: 'select', opcoes: Object.entries(TIPOS_VITRINE) },
    { k: 'cliente', rot: 'Cliente atendido', ajuda: 'vira um case do cliente', lista: estado.clientes.map((c) => c.nome) },
    { k: 'realizado_em', rot: 'Desenvolvido na empresa', ajuda: 'quando não é cliente', placeholder: 'Ex.: Âmbar Energia' },
    { k: 'slogan', rot: 'Slogan / frase curta', inteiro: true },
    { k: 'descricao', rot: 'Descrição', tipo: 'area', inteiro: true },
    { k: 'recursos', rot: 'Principais recursos', ajuda: 'um por linha', tipo: 'area', alt: 7, inteiro: true },
    { k: 'publico', rot: 'Para quem é', inteiro: true },
    { k: 'tecnologias', rot: 'Tecnologias', placeholder: 'Power BI, DAX, Power Automate…' },
    { k: 'ordem', rot: 'Ordem', tipo: 'numero', min: 0 },
    { k: 'link', rot: 'Link para acessar', ajuda: 'aparece no PDF', placeholder: 'https://…' },
    { k: 'link_repo', rot: 'Link do código (GitHub)', placeholder: 'https://github.com/…' },
    { k: 'destaque', rot: 'Destaque', tipo: 'check', texto: 'Página inteira no portfólio' },
    { k: 'publicado', rot: 'Portfólio', tipo: 'check', texto: 'Incluir no portfólio', padrao: 1 },
  ];
  formModal({
    titulo: item ? `Editar · ${item.nome}` : 'Novo item do portfólio', campos, item: item || { publicado: 1, tipo: 'aplicativo' }, largo: true,
    topo: item ? `<p class="suave" style="margin-top:-.4em">Os prints da tela ficam no botão ${ic('imagem')} do cartão.</p>` : '',
    aoSalvar: async (d) => {
      if (item) await api(`/api/vitrine/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/vitrine', { method: 'POST', body: d });
      toast('Salvo.');
      carregarPortfolio();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Excluir "${item.nome}" do portfólio?`, { botao: 'Excluir', perigo: true })) return false;
      await api(`/api/vitrine/${item.id}`, { method: 'DELETE' });
      toast('Excluído.');
      carregarPortfolio();
    }),
  });
}

function desenharServicos() {
  const lista = estado.servicos;
  $('#pf-servicos').innerHTML = !lista.length
    ? vazio({ ilustra: 'documento', titulo: 'Nenhum serviço cadastrado', texto: 'Cadastre os serviços que você oferece.' })
    : `<div class="tabela-wrap"><table class="t"><thead><tr><th style="width:5em">Ordem</th><th>Serviço</th><th>Preço base</th><th>Portfólio</th><th></th></tr></thead><tbody>
      ${lista.map((s, i) => `<tr class="${s.publicado ? '' : 'inativo'}">
        <td class="acoes" style="text-align:left"><button class="btn fantasma peq icone" data-mover="${i},-1" ${i ? '' : 'disabled'} title="Subir">${ic('sobe')}</button><button class="btn fantasma peq icone" data-mover="${i},1" ${i < lista.length - 1 ? '' : 'disabled'} title="Descer">${ic('desce')}</button></td>
        <td><div class="pessoa"><span class="bolha ciano">${ic(ICONES_SERVICO[s.icone] || 'estrela')}</span><div><b>${esc(s.nome)}</b><small>${esc(s.resumo || '')}</small></div></div></td>
        <td>${s.preco_base ? `${moeda(s.preco_base)}${s.unidade ? ` <small class="suave">/ ${esc(s.unidade)}</small>` : ''}` : '<span class="suave">—</span>'}</td>
        <td>${s.publicado ? '<span class="tag ok">Aparece</span>' : '<span class="tag neutra">Oculto</span>'}</td>
        <td class="acoes"><button class="btn sec peq" data-editar-serv="${s.id}">${ic('editar')} Editar</button></td></tr>`).join('')}
      </tbody></table></div>`;
  $$('#pf-servicos [data-editar-serv]').forEach((b) => b.addEventListener('click', () => editarServico(estado.servicos.find((x) => x.id === Number(b.dataset.editarServ)))));
  $$('#pf-servicos [data-mover]').forEach((b) => b.addEventListener('click', async () => {
    const [i, d] = b.dataset.mover.split(',').map(Number);
    const nova = [...lista];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    await Promise.all(nova.map((s, j) => (s.ordem === j + 1 ? null : api(`/api/servicos/${s.id}`, { method: 'PUT', body: { ordem: j + 1 } }))));
    estado.servicos = await api('/api/servicos');
    desenharServicos();
    desenharPaginasPortfolio();
  }));
}

function editarServico(item = null) {
  const campos = [
    { k: 'nome', rot: 'Nome do serviço', obrig: true, inteiro: true },
    { k: 'resumo', rot: 'Resumo', ajuda: '1 ou 2 frases', tipo: 'area', alt: 3, inteiro: true },
    { k: 'descricao', rot: 'Descrição detalhada', ajuda: 'opcional', tipo: 'area', inteiro: true },
    { k: 'icone', rot: 'Ícone', tipo: 'select', opcoes: [['grafico', 'Gráfico'], ['painel', 'Painel'], ['raio', 'Automação'], ['app', 'Aplicativo'], ['capelo', 'Treinamento'], ['alvo', 'Alvo'], ['estrela', 'Estrela'], ['dinheiro', 'Dinheiro']] },
    { k: 'preco_base', rot: 'Preço base', ajuda: 'sugerido na proposta', tipo: 'valor' },
    { k: 'unidade', rot: 'Unidade', lista: ['projeto', 'hora', 'mês', 'página', 'turma'], placeholder: 'projeto' },
    { k: 'publicado', rot: 'Portfólio', tipo: 'check', texto: 'Mostrar no portfólio' },
  ];
  formModal({
    titulo: item ? 'Editar serviço' : 'Novo serviço', campos, item: item || { publicado: 1, icone: 'estrela' },
    aoSalvar: async (d) => {
      if (item) await api(`/api/servicos/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/servicos', { method: 'POST', body: { ...d, ordem: estado.servicos.length + 1 } });
      toast('Salvo.');
      carregarPortfolio();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Excluir o serviço "${item.nome}"? (as propostas já feitas não mudam)`, { botao: 'Excluir', perigo: true })) return false;
      await api(`/api/servicos/${item.id}`, { method: 'DELETE' });
      toast('Excluído.');
      carregarPortfolio();
    }),
  });
}

$('#pf-novo-item').addEventListener('click', () => editarItemVitrine());
$('#pf-novo-servico').addEventListener('click', () => editarServico());
$('#pf-textos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/portfolio/config', { method: 'PUT', body: dados });
    estado.cfg = await api('/api/config');
    desenharPaginasPortfolio();
    toast('Textos do portfólio salvos.');
  } catch (err) { toast(err.message, true); }
});

/** Modal para escolher o que entra no portfólio e para quem ele é. */
async function gerarPortfolioModal(para = '') {
  try { await carregarBase('servicos', 'vitrine', 'clientes', 'leads'); } catch (e) { return toast(e.message, true); }
  const nomes = [...new Set([...estado.clientes.filter((c) => c.ativo).map((c) => c.nome),
    ...estado.leads.filter((l) => !['ganho', 'perdido'].includes(l.status)).map((l) => l.empresa || l.nome)])].sort((a, b) => a.localeCompare(b));
  const caixa = (nome, lista, rotulo) => lista.map((x) => `<label class="check opcao"><input type="checkbox" name="${nome}" value="${x.id}" ${x.publicado ? 'checked' : ''}>
    <span><b>${esc(x.nome)}</b>${rotulo(x) ? `<small>${esc(rotulo(x))}</small>` : ''}</span></label>`).join('');
  const m = modal(`<h2>Gerar portfólio em PDF</h2>
    <form id="f-port" class="grade-form">
      <div class="inteiro"><label class="rotulo">Preparado para <small>(opcional — aparece na capa)</small></label>
        <input type="text" name="para" list="dl-para" value="${esc(para)}" placeholder="Nome do cliente ou da empresa">
        <datalist id="dl-para">${nomes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="inteiro"><label class="rotulo">Serviços</label><div class="opcoes">${caixa('servicos', estado.servicos, (s) => s.resumo)}</div></div>
      <div class="inteiro"><label class="rotulo">Aplicativos, sistemas e projetos</label><div class="opcoes">${caixa('itens', estado.vitrine, (i) => [TIPOS_VITRINE[i.tipo], i.cliente ? `case ${i.cliente}` : i.realizado_em, i.destaque ? 'página de destaque' : ''].filter(Boolean).join(' · '))}</div></div>
      <div class="inteiro"><label class="rotulo">Clientes atendidos <small>(página “Clientes atendidos”)</small></label>
        <div class="opcoes">${caixa('clientes', estado.clientes.filter((c) => c.ativo).map((c) => ({ ...c, publicado: c.portfolio })), (c) => c.segmento) || '<p class="suave" style="margin:0">Nenhum cliente cadastrado.</p>'}</div></div>
      <div class="inteiro linha"><label class="check"><input type="checkbox" name="sobre" checked> Página “Sobre mim”</label>
        <label class="check"><input type="checkbox" name="contato" checked> Página de contato</label></div>
    </form>
    <div class="rodape-modal"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" form="f-port">${ic('baixar')} Gerar PDF</button></div>`);
  $('.modal', m.el).classList.add('largo');
  $('#f-port', m.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const marcados = (n) => $$(`input[name="${n}"]:checked`, f).map((x) => Number(x.value));
    const corpo = { para: f.para.value, servicos: marcados('servicos'), itens: marcados('itens'), clientes: marcados('clientes'), sobre: f.sobre.checked, contato: f.contato.checked };
    abrirPdf('/api/portfolio/pdf', corpo, `Portfólio AR Consultoria${corpo.para ? ` - ${corpo.para}` : ''}.pdf`);
    m.fechar();
  });
}

// ================= LEADS =================
async function carregarLeads() {
  await carregarBase('leads', 'clientes', 'servicos');
  desenharKanban();
}

function leadsFiltrados() {
  const q = normalizar($('#ld-busca').value);
  return estado.leads.filter((l) => !q || normalizar([l.nome, l.empresa, l.interesse, l.email, l.telefone, l.mensagem].join(' ')).includes(q));
}

function desenharKanban() {
  const lista = leadsFiltrados();
  const abertos = lista.filter((l) => !['ganho', 'perdido'].includes(l.status));
  $('#ld-info').textContent = `${lista.length} lead(s) · ${moeda(abertos.reduce((s, l) => s + (l.valor_estimado || 0), 0))} em negociação`;
  const hoje = hojeISO();
  $('#ld-kanban').innerHTML = Object.entries(LEAD_STATUS).map(([k, s]) => {
    const col = lista.filter((l) => l.status === k);
    const soma = col.reduce((t, l) => t + (l.valor_estimado || 0), 0);
    return `<div class="coluna ${k}" data-status="${k}">
      <div class="cab-coluna"><b>${esc(s.rot)}</b><span class="tag ${s.cor}">${col.length}</span>${soma ? `<small>${moedaCurta(soma)}</small>` : ''}</div>
      <div class="cartoes">${col.map((l) => `<div class="cartao-lead" draggable="true" data-lead="${l.id}">
          <b>${esc(l.nome)}</b>${l.empresa ? `<small>${esc(l.empresa)}</small>` : ''}
          ${l.interesse ? `<span class="tag info">${esc(l.interesse)}</span>` : ''}
          <div class="rodape-lead">
            ${l.valor_estimado ? `<span>${moedaCurta(l.valor_estimado)}</span>` : ''}
            ${l.proximo_contato ? `<span class="${l.proximo_contato < hoje && !['ganho', 'perdido'].includes(l.status) ? 'atrasado' : ''}">${ic('relogio')} ${dataCurta(l.proximo_contato).slice(0, 5)}</span>` : ''}
            ${l.cliente_id ? `<span title="Cliente: ${esc(l.cliente_nome)}">${ic('usuario')}</span>` : ''}
          </div></div>`).join('') || '<p class="suave vazio-col">Arraste um cartão para cá</p>'}</div></div>`;
  }).join('');
  $$('#ld-kanban [data-lead]').forEach((c) => {
    c.addEventListener('click', () => editarLead(estado.leads.find((l) => l.id === Number(c.dataset.lead))));
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.lead); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
  });
  $$('#ld-kanban .coluna').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('sobre'); });
    col.addEventListener('dragleave', () => col.classList.remove('sobre'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('sobre');
      const id = Number(e.dataTransfer.getData('text/plain'));
      const l = estado.leads.find((x) => x.id === id);
      if (!l || l.status === col.dataset.status) return;
      try {
        await api(`/api/leads/${id}`, { method: 'PUT', body: { status: col.dataset.status } });
        l.status = col.dataset.status;
        atualizarContadorLeads();
        desenharKanban();
      } catch (err) { toast(err.message, true); }
    });
  });
}

function editarLead(item = null) {
  const campos = [
    { k: 'nome', rot: 'Nome', obrig: true },
    { k: 'empresa', rot: 'Empresa' },
    { k: 'email', rot: 'E-mail', tipo: 'email' },
    { k: 'telefone', rot: 'Telefone / WhatsApp', tipo: 'tel' },
    { k: 'interesse', rot: 'Interesse', lista: [...estado.servicos.map((s) => s.nome), 'Vértice', 'Consultoria financeira', 'Dashboards', 'Treinamento'] },
    { k: 'origem', rot: 'Origem', lista: ['Indicação', 'Instagram', 'LinkedIn', 'WhatsApp', 'Evento', 'Cliente antigo', 'Outro'] },
    { k: 'status', rot: 'Etapa', tipo: 'select', opcoes: opcoesMapa(LEAD_STATUS) },
    { k: 'valor_estimado', rot: 'Valor estimado', tipo: 'valor' },
    { k: 'proximo_contato', rot: 'Próximo contato', tipo: 'date' },
    { k: 'cliente_id', rot: 'Cliente vinculado', tipo: 'select', opcoes: opcoesClientes() },
    { k: 'mensagem', rot: 'O que a pessoa precisa', tipo: 'area', alt: 3, inteiro: true },
    { k: 'observacoes', rot: 'Anotações', tipo: 'area', alt: 3, inteiro: true },
  ];
  const zap = item && linkZap(item.telefone);
  const m = formModal({
    titulo: item ? item.nome : 'Novo lead', campos, item: item || { status: 'novo' }, largo: true,
    topo: item ? `<div class="linha" style="margin:-.3em 0 1em">
        ${zap ? `<a class="btn sec peq" href="${zap}" target="_blank" rel="noopener">${ic('telefone')} WhatsApp</a>` : ''}
        ${item.email ? `<a class="btn sec peq" href="mailto:${esc(item.email)}">${ic('email')} E-mail</a>` : ''}
        <button class="btn sec peq" id="ld-portfolio">${ic('livro')} Portfólio para este lead</button>
        <button class="btn sec peq" id="ld-proposta">${ic('documento')} Criar proposta</button>
        ${item.cliente_id ? '' : `<button class="btn sec peq" id="ld-converter">${ic('usuario')} Converter em cliente</button>`}
        <small class="suave" style="margin-left:auto">Criado em ${esc(dataBR(item.criado_em))}</small></div>` : '',
    aoSalvar: async (d) => {
      if (item) await api(`/api/leads/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/leads', { method: 'POST', body: d });
      toast('Lead salvo.');
      recarregar();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Excluir o lead ${item.nome}?`, { botao: 'Excluir', perigo: true })) return false;
      await api(`/api/leads/${item.id}`, { method: 'DELETE' });
      toast('Lead excluído.');
      recarregar();
    }),
  });
  if (!item) return;
  $('#ld-portfolio', m.el).addEventListener('click', () => { m.fechar(); gerarPortfolioModal(item.empresa || item.nome); });
  $('#ld-proposta', m.el).addEventListener('click', () => { m.fechar(); editarProposta(null, { lead_id: item.id, cliente_id: item.cliente_id || '', titulo: item.interesse || '' }); });
  $('#ld-converter', m.el)?.addEventListener('click', async () => {
    try {
      const r = await api(`/api/leads/${item.id}/converter`, { method: 'POST' });
      toast(r.existente ? 'Lead vinculado ao cliente já cadastrado.' : 'Cliente criado a partir do lead.');
      m.fechar();
      recarregar();
    } catch (err) { toast(err.message, true); }
  });
}

$('#ld-novo').addEventListener('click', () => editarLead());
$('#ld-busca').addEventListener('input', desenharKanban);
$('#ld-xlsx').addEventListener('click', () => exportarXlsx('Leads.xlsx', {
  aba: 'Leads', cabecalho: [tituloEmpresa(), 'Leads'],
  colunas: [{ titulo: 'Nome', largura: 28 }, { titulo: 'Empresa', largura: 24 }, { titulo: 'E-mail', largura: 28 }, { titulo: 'Telefone', largura: 16 },
    { titulo: 'Interesse', largura: 22 }, { titulo: 'Origem', largura: 14 }, { titulo: 'Etapa', largura: 16 }, { titulo: 'Valor estimado', largura: 14 },
    { titulo: 'Próximo contato', largura: 14 }, { titulo: 'Criado em', largura: 16 }],
  linhas: leadsFiltrados().map((l) => [l.nome, l.empresa || '', l.email || '', l.telefone || '', l.interesse || '', l.origem || '', LEAD_STATUS[l.status]?.rot || l.status,
    l.valor_estimado || '', dataCurta(l.proximo_contato), dataBR(l.criado_em)]),
}));

// ================= CLIENTES =================
const CAMPOS_CLIENTE = () => [
  { k: 'nome', rot: 'Nome / razão social', obrig: true, inteiro: true },
  { k: 'documento', rot: 'CPF / CNPJ' },
  { k: 'segmento', rot: 'Segmento', lista: cfgLista('segmentos') },
  { k: 'contato', rot: 'Pessoa de contato' },
  { k: 'email', rot: 'E-mail', tipo: 'email' },
  { k: 'telefone', rot: 'Telefone', tipo: 'tel' },
  { k: 'cidade', rot: 'Cidade / UF' },
  { k: 'origem', rot: 'Como chegou', lista: ['Indicação', 'Instagram', 'LinkedIn', 'WhatsApp', 'Evento', 'Outro'] },
  { k: 'observacoes', rot: 'Observações', tipo: 'area', alt: 3, inteiro: true },
  { k: 'portfolio', rot: 'Portfólio', tipo: 'check', texto: 'Mostrar na página “Clientes atendidos” do portfólio', inteiro: true },
];
const SINONIMOS_CLIENTE = {
  nome: ['nome', 'cliente', 'razao_social', 'empresa', 'nome_fantasia'],
  documento: ['cnpj', 'cpf', 'cpf_cnpj', 'documento', 'cnpj_cpf'],
  segmento: ['segmento', 'setor', 'ramo', 'area'],
  contato: ['contato', 'responsavel', 'pessoa_de_contato'],
  email: ['email', 'e_mail'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone'],
  cidade: ['cidade', 'municipio', 'cidade_uf'],
  origem: ['origem', 'canal'],
  observacoes: ['observacoes', 'observacao', 'obs'],
};

async function carregarClientes() {
  await carregarBase('clientes');
  desenharClientes();
}

function clientesFiltrados() {
  const q = normalizar($('#cl-busca').value);
  const inativos = $('#cl-inativos').checked;
  return estado.clientes.filter((c) => (inativos || c.ativo) && (!q || normalizar(Object.values(c).join(' ')).includes(q)));
}

function desenharClientes() {
  const lista = clientesFiltrados();
  const ativos = estado.clientes.filter((c) => c.ativo);
  $('#cl-kpis').innerHTML = [
    kpi({ rot: 'Clientes ativos', val: ativos.length, icone: 'usuarios' }),
    kpi({ rot: 'Com projetos', val: ativos.filter((c) => c.projetos).length, icone: 'maleta', cor: 'indigo' }),
    kpi({ rot: 'Total recebido', val: moedaCurta(estado.clientes.reduce((s, c) => s + c.faturado, 0)), icone: 'dinheiro', cor: 'ciano', det: 'de todos os clientes' }),
  ].join('');
  $('#cl-tabela').innerHTML = !lista.length
    ? `<div class="cartao">${estado.clientes.length ? vazio({ ilustra: 'pessoas', titulo: 'Nenhum resultado', texto: 'Tente outro termo na busca.' })
      : vazio({ ilustra: 'pessoas', titulo: 'Nenhum cliente cadastrado ainda', texto: 'Cadastre um por um, converta um lead ou importe da sua planilha do Excel.' })}</div>`
    : `<div class="tabela-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Segmento</th><th>Contato</th><th>Propostas</th><th>Projetos</th><th>Recebido</th><th></th></tr></thead><tbody>
      ${lista.map((c) => `<tr class="${c.ativo ? '' : 'inativo'}">
        <td>${pessoa(c.nome, [c.cidade, c.documento].filter(Boolean).join(' · '))}${c.portfolio ? ` <span class="tag indigo" title="Aparece no portfólio">${ic('livro')} portfólio</span>` : ''}</td>
        <td>${c.segmento ? `<span class="tag info">${esc(c.segmento)}</span>` : ''}</td>
        <td><div style="line-height:1.3">${esc(c.contato || '')}<br><small class="suave">${esc([c.email, c.telefone].filter(Boolean).join(' · '))}</small></div></td>
        <td>${c.propostas || ''}</td><td>${c.projetos || ''}</td>
        <td>${c.faturado ? moeda(c.faturado) : ''}</td>
        <td class="acoes">${c.ativo ? '' : '<span class="tag neutra">Inativo</span> '}<button class="btn sec peq" data-editar="${c.id}">${ic('editar')} Abrir</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('#cl-tabela [data-editar]').forEach((b) => b.addEventListener('click', () => editarCliente(estado.clientes.find((c) => c.id === Number(b.dataset.editar)))));
}

function editarCliente(item = null) {
  const usos = item && (item.propostas || item.projetos);
  const zap = item && linkZap(item.telefone);
  const m = formModal({
    titulo: item ? item.nome : 'Novo cliente', campos: CAMPOS_CLIENTE(), item, largo: true,
    topo: item ? `<div class="linha" style="margin:-.3em 0 1em">
        ${zap ? `<a class="btn sec peq" href="${zap}" target="_blank" rel="noopener">${ic('telefone')} WhatsApp</a>` : ''}
        <button class="btn sec peq" id="cl-portfolio">${ic('livro')} Portfólio para este cliente</button>
        <button class="btn sec peq" id="cl-proposta">${ic('documento')} Nova proposta</button>
        <label class="btn sec peq" title="Logo usado na página “Clientes atendidos” do portfólio"><input type="file" accept="image/png,image/jpeg" hidden id="cl-logo">${ic('imagem')} Logo</label>
        <img class="logo-cliente" src="/api/clientes/${item.id}/logo?v=${Date.now()}" alt="" onerror="this.remove()">
        ${item.ativo ? '' : `<button class="btn sec peq" id="cl-reativar">${ic('check')} Reativar</button>`}</div>` : '',
    rotuloExcluir: usos ? 'Inativar' : 'Excluir',
    aoSalvar: async (d) => {
      if (item) await api(`/api/clientes/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/clientes', { method: 'POST', body: d });
      toast('Cliente salvo.');
      recarregar();
    },
    aoExcluir: item && item.ativo && (async () => {
      const msg = usos ? `${item.nome} tem propostas ou projetos, então será inativado (o histórico é mantido).` : `Excluir ${item.nome}?`;
      if (!await confirmar(msg, { botao: usos ? 'Inativar' : 'Excluir', perigo: true })) return false;
      const r = await api(`/api/clientes/${item.id}`, { method: 'DELETE' });
      toast(r.inativado ? 'Cliente inativado.' : 'Cliente excluído.');
      recarregar();
    }),
  });
  if (!item) return;
  $('#cl-portfolio', m.el).addEventListener('click', () => { m.fechar(); gerarPortfolioModal(item.nome); });
  $('#cl-logo', m.el).addEventListener('change', async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    const fd = new FormData();
    fd.append('imagem', arq);
    try {
      await api(`/api/clientes/${item.id}/logo`, { method: 'POST', body: fd });
      toast('Logo enviado. Ele aparece em “Clientes atendidos” no portfólio.');
      const atual = $('.logo-cliente', m.el);
      const novo = Object.assign(document.createElement('img'), { className: 'logo-cliente', src: `/api/clientes/${item.id}/logo?v=${Date.now()}` });
      if (atual) atual.replaceWith(novo); else e.target.closest('label').after(novo);
    } catch (err) { toast(err.message, true); }
  });
  $('#cl-proposta', m.el).addEventListener('click', () => { m.fechar(); editarProposta(null, { cliente_id: item.id }); });
  $('#cl-reativar', m.el)?.addEventListener('click', async () => {
    await api(`/api/clientes/${item.id}`, { method: 'PUT', body: { ativo: true } });
    toast('Cliente reativado.');
    m.fechar();
    recarregar();
  });
}

async function importarClientes(input) {
  const arq = input.files[0];
  input.value = '';
  if (!arq) return;
  try {
    const linhas = await lerPlanilha(arq);
    if (!linhas.length) return toast('Planilha vazia.', true);
    const colunasArq = Object.keys(linhas[0]);
    const mapa = {};
    for (const [campo, nomes] of Object.entries(SINONIMOS_CLIENTE)) mapa[campo] = nomes.find((n) => colunasArq.includes(n));
    if (!mapa.nome) return toast(`Não encontrei a coluna NOME (ou CLIENTE) na planilha. Colunas lidas: ${colunasArq.join(', ')}`, true);
    const itens = linhas.map((l) => Object.fromEntries(Object.entries(mapa).filter(([, col]) => col).map(([campo, col]) => [campo, l[col]]))).filter((i) => i.nome);
    const rot = Object.fromEntries(CAMPOS_CLIENTE().map((c) => [c.k, c.rot]));
    const usadas = Object.keys(mapa).filter((k) => mapa[k]);
    const m = modal(`<h2>Importar clientes</h2>
      <p><b>${itens.length}</b> cliente(s) encontrados em <i>${esc(arq.name)}</i>.</p>
      <p class="suave">Colunas reconhecidas: ${esc(usadas.map((k) => rot[k]).join(', '))}.<br>Nomes já cadastrados são atualizados (só os campos preenchidos); os demais são incluídos.</p>
      <div class="tabela-wrap" style="max-height:40vh"><table class="t"><thead><tr>${usadas.map((k) => `<th>${esc(rot[k])}</th>`).join('')}</tr></thead>
        <tbody>${itens.slice(0, 50).map((i) => `<tr>${usadas.map((k) => `<td style="white-space:nowrap">${esc(i[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${itens.length > 50 ? `<p class="suave">… e mais ${itens.length - 50}.</p>` : ''}
      <div class="rodape-modal"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" id="b-imp">${ic('enviar')} Importar</button></div>`);
    $('#b-imp', m.el).addEventListener('click', async () => {
      try {
        const r = await api('/api/clientes/importar', { method: 'POST', body: { itens } });
        toast(`${r.novos} novo(s), ${r.atualizados} atualizado(s).`);
        m.fechar();
        carregarClientes();
      } catch (err) { toast(err.message, true); }
    });
  } catch (e) { toast(`Não consegui ler a planilha: ${e.message}`, true); }
}

$('#cl-novo').addEventListener('click', () => editarCliente());
$('#cl-busca').addEventListener('input', desenharClientes);
$('#cl-inativos').addEventListener('change', desenharClientes);
$('#cl-importar').addEventListener('change', (e) => importarClientes(e.target));
$('#cl-modelo').addEventListener('click', () => exportarXlsx('Modelo de importação - Clientes.xlsx', {
  aba: 'Clientes',
  colunas: ['NOME', 'CNPJ', 'SEGMENTO', 'CONTATO', 'EMAIL', 'TELEFONE', 'CIDADE', 'ORIGEM', 'OBSERVACOES'].map((t) => ({ titulo: t, largura: t === 'NOME' ? 34 : 20 })),
  linhas: [['Empresa Exemplo Ltda', '00.000.000/0001-00', 'Varejo', 'Maria Souza', 'maria@exemplo.com', '(11) 99999-0000', 'São Paulo/SP', 'Indicação', '']],
}));
$('#cl-xlsx').addEventListener('click', () => exportarXlsx('Clientes.xlsx', {
  aba: 'Clientes', cabecalho: [tituloEmpresa(), 'Clientes'],
  colunas: [...CAMPOS_CLIENTE().filter((c) => !['observacoes', 'portfolio'].includes(c.k)).map((c) => ({ titulo: c.rot, largura: c.k === 'nome' ? 34 : 18 })),
    { titulo: 'Propostas', largura: 10 }, { titulo: 'Projetos', largura: 10 }, { titulo: 'Recebido', largura: 14 }, { titulo: 'Situação', largura: 10 }],
  linhas: clientesFiltrados().map((c) => [...CAMPOS_CLIENTE().filter((x) => !['observacoes', 'portfolio'].includes(x.k)).map((x) => c[x.k] || ''), c.propostas, c.projetos, c.faturado, c.ativo ? 'Ativo' : 'Inativo']),
}));
$('#cl-pdf').addEventListener('click', () => {
  const lista = clientesFiltrados();
  abrirPdf('/api/pdf/tabela', {
    titulo: 'Clientes', subtitulo: `${lista.length} cliente(s)`, orientacao: 'paisagem',
    colunas: [{ titulo: '#', largura: 24, alinhar: 'centro' }, { titulo: 'Cliente' }, { titulo: 'CPF/CNPJ' }, { titulo: 'Segmento' }, { titulo: 'Contato' },
      { titulo: 'E-mail' }, { titulo: 'Telefone' }, { titulo: 'Cidade' }, { titulo: 'Recebido', alinhar: 'dir' }],
    linhas: lista.map((c, i) => [String(i + 1), c.nome, c.documento || '', c.segmento || '', c.contato || '', c.email || '', c.telefone || '', c.cidade || '', c.faturado ? moeda(c.faturado) : '']),
  }, 'Clientes.pdf');
});

// ================= PROPOSTAS =================
let prFiltro = 'todas';

async function carregarPropostas() {
  await carregarBase('propostas', 'clientes', 'leads', 'servicos');
  desenharPropostas();
}

function propostasFiltradas() {
  const q = normalizar($('#pr-busca').value);
  return estado.propostas.filter((p) => (prFiltro === 'todas' || p.status === prFiltro)
    && (!q || normalizar([p.numero, p.titulo, p.cliente_nome, p.lead_nome].join(' ')).includes(q)));
}

function desenharPropostas() {
  const todas = estado.propostas;
  const soma = (st) => todas.filter((p) => p.status === st).reduce((s, p) => s + p.total, 0);
  const decididas = todas.filter((p) => ['aprovada', 'recusada'].includes(p.status)).length;
  $('#pr-kpis').innerHTML = [
    kpi({ rot: 'Em aberto (enviadas)', val: moedaCurta(soma('enviada')), icone: 'documento', cor: 'ambar', det: `${todas.filter((p) => p.status === 'enviada').length} proposta(s)` }),
    kpi({ rot: 'Aprovadas', val: moedaCurta(soma('aprovada')), icone: 'check', det: `${todas.filter((p) => p.status === 'aprovada').length} proposta(s)` }),
    kpi({ rot: 'Taxa de aprovação', val: decididas ? `${Math.round((todas.filter((p) => p.status === 'aprovada').length / decididas) * 100)}%` : '—', icone: 'alvo', cor: 'indigo', det: 'entre aprovadas e recusadas' }),
    kpi({ rot: 'Rascunhos', val: todas.filter((p) => p.status === 'rascunho').length, icone: 'editar', cor: 'ciano' }),
  ].join('');
  $('#pr-filtros').innerHTML = [['todas', 'Todas'], ...opcoesMapa(PROPOSTA_STATUS)].map(([k, r]) =>
    `<button class="${prFiltro === k ? 'ativo' : ''}" data-f="${k}">${esc(r)} <small>${k === 'todas' ? todas.length : todas.filter((p) => p.status === k).length}</small></button>`).join('');
  $$('#pr-filtros [data-f]').forEach((b) => b.addEventListener('click', () => { prFiltro = b.dataset.f; desenharPropostas(); }));
  const lista = propostasFiltradas();
  const hoje = hojeISO();
  $('#pr-tabela').innerHTML = !lista.length
    ? `<div class="cartao">${vazio({ ilustra: 'documento', titulo: todas.length ? 'Nenhuma proposta neste filtro' : 'Nenhuma proposta ainda',
      texto: 'Monte a primeira proposta usando os serviços do seu catálogo.', acoes: `<button class="btn" onclick="editarProposta()">${ic('mais')} Nova proposta</button>` })}</div>`
    : `<div class="tabela-wrap"><table class="t"><thead><tr><th>Nº</th><th>Proposta</th><th>Cliente</th><th>Validade</th><th style="text-align:right">Total</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr>
        <td><b>${esc(p.numero)}</b></td>
        <td><b>${esc(p.titulo)}</b><br><small class="suave">${p.itens.length} item(ns) · ${esc(dataBR(p.atualizado_em))}</small></td>
        <td>${esc(p.cliente_nome || p.lead_nome || '—')}${!p.cliente_nome && p.lead_nome ? ' <small class="suave">(lead)</small>' : ''}</td>
        <td>${p.validade ? `<span class="${p.validade < hoje && ['rascunho', 'enviada'].includes(p.status) ? 'txt-erro' : ''}">${dataCurta(p.validade)}</span>` : ''}</td>
        <td style="text-align:right;white-space:nowrap"><b>${moeda(p.total)}</b></td>
        <td>${tag(PROPOSTA_STATUS, p.status)}${p.projeto_id ? ` <span class="tag info" title="Projeto gerado">${ic('maleta')}</span>` : ''}</td>
        <td class="acoes"><button class="btn sec peq icone" data-pdf="${p.id}" title="PDF">${ic('baixar')}</button>
          <button class="btn sec peq" data-abrir="${p.id}">${ic('editar')} Abrir</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('#pr-tabela [data-abrir]').forEach((b) => b.addEventListener('click', () => editarProposta(estado.propostas.find((p) => p.id === Number(b.dataset.abrir)))));
  $$('#pr-tabela [data-pdf]').forEach((b) => b.addEventListener('click', () => {
    const p = estado.propostas.find((x) => x.id === Number(b.dataset.pdf));
    abrirPdf(`/api/propostas/${p.id}/pdf`, undefined, `Proposta ${p.numero}.pdf`);
  }));
}

/** Editor de proposta. inicial = valores para uma proposta nova (cliente, lead, título). */
async function editarProposta(item = null, inicial = {}) {
  if (!estado.servicos.length || !estado.clientes.length) {
    try { await carregarBase('clientes', 'leads', 'servicos'); } catch (e) { return toast(e.message, true); }
  }
  const p = item ? structuredClone(item) : {
    status: 'rascunho', itens: [], desconto: 0, condicoes: estado.cfg.proposta_condicoes || '',
    validade: somarDiasISO(hojeISO(), Number(estado.cfg.proposta_validade_dias) || 15), ...inicial,
  };
  const leadsAbertos = estado.leads.filter((l) => !['perdido'].includes(l.status) || l.id === p.lead_id);
  const m = modal(`<h2>${item ? `Proposta ${esc(item.numero)}` : 'Nova proposta'}</h2>
    <form id="f-prop">
      <div class="grade-form">
        <div class="inteiro"><label class="rotulo">Título</label><input type="text" name="titulo" required value="${esc(p.titulo || '')}" placeholder="Ex.: Painel financeiro em Power BI"></div>
        <div><label class="rotulo">Cliente</label><select name="cliente_id">${opcoesClientes('— sem cliente cadastrado —').map(([v, r]) => `<option value="${v}" ${String(v) === String(p.cliente_id ?? '') ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
        <div><label class="rotulo">Lead <small>(opcional)</small></label><select name="lead_id"><option value="">—</option>${leadsAbertos.map((l) => `<option value="${l.id}" ${l.id === Number(p.lead_id) ? 'selected' : ''}>${esc(l.nome)}${l.empresa ? ` · ${esc(l.empresa)}` : ''}</option>`).join('')}</select></div>
        <div><label class="rotulo">Validade</label><input type="date" name="validade" value="${esc(p.validade || '')}"></div>
        <div><label class="rotulo">Situação</label><select name="status">${opcoesMapa(PROPOSTA_STATUS).map(([v, r]) => `<option value="${v}" ${v === p.status ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="inteiro"><label class="rotulo">Apresentação <small>(texto de abertura — deixe uma linha em branco entre parágrafos)</small></label>
          <textarea name="introducao" style="min-height:5em" placeholder="Conforme conversamos, apresento a proposta para…">${esc(p.introducao || '')}</textarea></div>
      </div>
      <h3 style="margin:1.3em 0 .6em">Itens</h3>
      <div class="tabela-wrap"><table class="t itens-prop"><thead><tr><th>Descrição</th><th style="width:6em">Qtd.</th><th style="width:9em">Valor unit.</th><th style="width:9em;text-align:right">Total</th><th style="width:3em"></th></tr></thead>
        <tbody id="itens-prop"></tbody></table></div>
      <div class="linha" style="margin-top:.7em">
        <select id="add-serv" style="width:auto;max-width:100%"><option value="">+ Adicionar serviço do catálogo…</option>${estado.servicos.map((s) => `<option value="${s.id}">${esc(s.nome)}${s.preco_base ? ` · ${moeda(s.preco_base)}` : ''}</option>`).join('')}</select>
        <button type="button" class="btn sec peq" id="add-linha">${ic('mais')} Linha em branco</button>
        <span class="cresce"></span>
        <label class="rotulo" style="margin:0">Desconto</label><input type="text" inputmode="decimal" name="desconto" style="width:9em" value="${p.desconto ? Number(p.desconto).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}" placeholder="0,00">
      </div>
      <div class="totais-prop" id="totais-prop"></div>
      <div class="grade-form" style="margin-top:1em">
        <div><label class="rotulo">Prazo de entrega</label><textarea name="prazo" style="min-height:4em" placeholder="Ex.: 30 dias após a aprovação">${esc(p.prazo || '')}</textarea></div>
        <div><label class="rotulo">Condições de pagamento</label><textarea name="condicoes" style="min-height:4em">${esc(p.condicoes || '')}</textarea></div>
      </div>
    </form>
    <div class="rodape-modal" style="justify-content:space-between">
      <div class="linha">${item ? `<button class="btn perigo" id="pr-excluir">${ic('lixo')} Excluir</button>
        <button class="btn sec" id="pr-duplicar">${ic('copiar')} Duplicar</button>
        ${item.projeto_id ? '' : `<button class="btn sec" id="pr-projeto">${ic('maleta')} Gerar projeto</button>`}` : ''}</div>
      <div class="linha"><button class="btn sec" data-fechar>Cancelar</button>
        <button class="btn sec" id="pr-salvar-pdf">${ic('baixar')} Salvar e ver PDF</button>
        <button class="btn" form="f-prop">${ic('check')} Salvar</button></div>
    </div>`);
  $('.modal', m.el).classList.add('largo');
  const form = $('#f-prop', m.el);

  const desenharItens = () => {
    $('#itens-prop', m.el).innerHTML = p.itens.length ? p.itens.map((it, i) => `<tr data-i="${i}">
      <td><textarea data-k="descricao" rows="2" style="min-height:2.6em">${esc(it.descricao)}</textarea></td>
      <td><input type="text" inputmode="decimal" data-k="qtd" value="${esc(String(it.qtd ?? 1).replace('.', ','))}"></td>
      <td><input type="text" inputmode="decimal" data-k="valor" value="${it.valor ? Number(it.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}" placeholder="0,00"></td>
      <td style="text-align:right;white-space:nowrap" data-total>${moeda((Number(it.qtd) || 0) * (Number(it.valor) || 0))}</td>
      <td><button type="button" class="btn fantasma peq icone" data-rm="${i}" title="Remover">${ic('x')}</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="suave" style="text-align:center;padding:1.2em">Adicione serviços do catálogo ou uma linha em branco.</td></tr>';
    $$('[data-rm]', m.el).forEach((b) => b.addEventListener('click', () => { p.itens.splice(Number(b.dataset.rm), 1); desenharItens(); }));
    $$('#itens-prop [data-k]', m.el).forEach((el) => el.addEventListener('input', () => {
      const i = Number(el.closest('tr').dataset.i);
      p.itens[i][el.dataset.k] = el.dataset.k === 'descricao' ? el.value : lerNumero(el.value) ?? 0;
      $('[data-total]', el.closest('tr')).textContent = moeda((Number(p.itens[i].qtd) || 0) * (Number(p.itens[i].valor) || 0));
      desenharTotais();
    }));
    desenharTotais();
  };
  const desenharTotais = () => {
    const sub = p.itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.valor) || 0), 0);
    const desc = Math.min(lerNumero(form.desconto.value) || 0, sub);
    $('#totais-prop', m.el).innerHTML = `${desc ? `<span>Subtotal <b>${moeda(sub)}</b></span><span>Desconto <b>− ${moeda(desc)}</b></span>` : ''}<span class="total">Total <b>${moeda(sub - desc)}</b></span>`;
  };
  desenharItens();
  form.desconto.addEventListener('input', desenharTotais);
  $('#add-linha', m.el).addEventListener('click', () => { p.itens.push({ descricao: '', qtd: 1, valor: 0 }); desenharItens(); $$('#itens-prop textarea', m.el).at(-1)?.focus(); });
  $('#add-serv', m.el).addEventListener('change', (e) => {
    const s = estado.servicos.find((x) => x.id === Number(e.target.value));
    e.target.value = '';
    if (!s) return;
    p.itens.push({ descricao: s.resumo ? `${s.nome} — ${s.resumo}` : s.nome, qtd: 1, valor: s.preco_base || 0 });
    if (!form.titulo.value) form.titulo.value = s.nome;
    desenharItens();
  });

  const salvar = async () => {
    const corpo = {
      titulo: form.titulo.value, cliente_id: form.cliente_id.value || null, lead_id: form.lead_id.value || null, validade: form.validade.value,
      status: form.status.value, introducao: form.introducao.value, itens: p.itens, desconto: lerNumero(form.desconto.value) || 0,
      prazo: form.prazo.value, condicoes: form.condicoes.value,
    };
    if (!corpo.titulo.trim()) throw new Error('Informe o título da proposta.');
    if (item) { await api(`/api/propostas/${item.id}`, { method: 'PUT', body: corpo }); return item.id; }
    const r = await api('/api/propostas', { method: 'POST', body: corpo });
    toast(`Proposta ${r.numero} criada.`);
    return r.id;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await salvar(); toast('Proposta salva.'); m.fechar(); recarregar(); } catch (err) { toast(err.message, true); }
  });
  $('#pr-salvar-pdf', m.el).addEventListener('click', async () => {
    const aba = window.open('', '_blank');
    try {
      const id = await salvar();
      const r = await fetch(`/api/propostas/${id}/pdf`);
      if (!r.ok) throw new Error('Falha ao gerar o PDF.');
      const url = URL.createObjectURL(await r.blob());
      if (aba) aba.location.href = url; else window.open(url, '_blank');
      m.fechar();
      recarregar();
    } catch (err) { aba?.close(); toast(err.message, true); }
  });
  $('#pr-excluir', m.el)?.addEventListener('click', async () => {
    if (!await confirmar(`Excluir a proposta ${item.numero}?`, { botao: 'Excluir', perigo: true })) return;
    try { await api(`/api/propostas/${item.id}`, { method: 'DELETE' }); toast('Proposta excluída.'); m.fechar(); recarregar(); } catch (err) { toast(err.message, true); }
  });
  $('#pr-duplicar', m.el)?.addEventListener('click', async () => {
    try { const r = await api(`/api/propostas/${item.id}/duplicar`, { method: 'POST' }); toast(`Cópia criada: ${r.numero}.`); m.fechar(); recarregar(); } catch (err) { toast(err.message, true); }
  });
  $('#pr-projeto', m.el)?.addEventListener('click', () => { m.fechar(); gerarProjetoDaProposta(item); });
}

function gerarProjetoDaProposta(p) {
  const m = modal(`<h2>Gerar projeto · ${esc(p.numero)}</h2>
    <p class="suave" style="margin-top:-.4em">A proposta será marcada como <b>aprovada</b>, o projeto é criado com o valor de <b>${moeda(p.total)}</b>
      e as parcelas entram no Financeiro como receitas a receber.</p>
    <form id="f-gp" class="grade-form">
      <div><label class="rotulo">Parcelas a receber</label><select name="parcelas">${[0, 1, 2, 3, 4, 5, 6, 10, 12].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n ? `${n}x de ${moeda(p.total / n)}` : 'Não lançar no financeiro'}</option>`).join('')}</select></div>
      <div><label class="rotulo">1º vencimento</label><input type="date" name="primeiro_vencimento" value="${hojeISO()}"></div>
      <div><label class="rotulo">Prazo do projeto <small>(opcional)</small></label><input type="date" name="prazo"></div>
    </form>
    <div class="rodape-modal"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" form="f-gp">${ic('maleta')} Gerar projeto</button></div>`);
  $('#f-gp', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/propostas/${p.id}/projeto`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('Projeto criado.');
      m.fechar();
      location.hash = '#projetos';
    } catch (err) { toast(err.message, true); }
  });
}

$('#pr-nova').addEventListener('click', () => editarProposta());
$('#pr-busca').addEventListener('input', desenharPropostas);

// ================= PROJETOS =================
let pjFiltro = 'ativos';

async function carregarProjetos() {
  await carregarBase('projetos', 'clientes', 'servicos');
  desenharProjetos();
}

function projetosFiltrados() {
  const q = normalizar($('#pj-busca').value);
  return estado.projetos.filter((p) => (pjFiltro === 'todos' || (pjFiltro === 'ativos' ? ['planejado', 'andamento', 'pausado'].includes(p.status) : p.status === pjFiltro))
    && (!q || normalizar([p.nome, p.cliente_nome, p.servico].join(' ')).includes(q)));
}

function desenharProjetos() {
  const todos = estado.projetos;
  $('#pj-filtros').innerHTML = [['ativos', 'Ativos'], ['todos', 'Todos'], ...opcoesMapa(PROJETO_STATUS)].map(([k, r]) => {
    const n = k === 'todos' ? todos.length : k === 'ativos' ? todos.filter((p) => ['planejado', 'andamento', 'pausado'].includes(p.status)).length : todos.filter((p) => p.status === k).length;
    return `<button class="${pjFiltro === k ? 'ativo' : ''}" data-f="${k}">${esc(r)} <small>${n}</small></button>`;
  }).join('');
  $$('#pj-filtros [data-f]').forEach((b) => b.addEventListener('click', () => { pjFiltro = b.dataset.f; desenharProjetos(); }));
  const lista = projetosFiltrados();
  const hoje = hojeISO();
  $('#pj-lista').innerHTML = !lista.length
    ? `<div class="cartao" style="grid-column:1/-1">${vazio({ ilustra: 'documento', titulo: todos.length ? 'Nenhum projeto neste filtro' : 'Nenhum projeto ainda',
      texto: 'Crie um projeto ou gere a partir de uma proposta aprovada.' })}</div>`
    : lista.map((p) => {
      const atrasado = p.prazo && p.prazo < hoje && ['planejado', 'andamento', 'pausado'].includes(p.status);
      return `<div class="cartao projeto" data-pj="${p.id}">
        <div class="linha entre"><span class="tipo">${esc(p.servico || 'Projeto')}</span>${tag(PROJETO_STATUS, p.status)}</div>
        <h3>${esc(p.nome)}</h3>
        <p class="suave" style="margin:0 0 .8em">${esc(p.cliente_nome || 'Sem cliente')}${p.proposta_numero ? ` · ${esc(p.proposta_numero)}` : ''}</p>
        <div class="linha entre" style="font-size:.84rem"><span>Progresso</span><b>${p.progresso}%</b></div>
        <div class="barra" style="margin:.3em 0 .9em"><span style="width:${p.progresso}%"></span></div>
        <div class="dados-pj">
          <div><small>Prazo</small><b class="${atrasado ? 'txt-erro' : ''}">${p.prazo ? dataCurta(p.prazo) : '—'}</b></div>
          <div><small>Valor</small><b>${p.valor ? moedaCurta(p.valor) : '—'}</b></div>
          <div><small>Recebido</small><b>${p.recebido ? moedaCurta(p.recebido) : '—'}</b></div>
        </div></div>`;
    }).join('');
  $$('#pj-lista [data-pj]').forEach((c) => c.addEventListener('click', () => editarProjeto(estado.projetos.find((p) => p.id === Number(c.dataset.pj)))));
}

function editarProjeto(item = null) {
  const campos = [
    { k: 'nome', rot: 'Nome do projeto', obrig: true, inteiro: true },
    { k: 'cliente_id', rot: 'Cliente', tipo: 'select', opcoes: opcoesClientes() },
    { k: 'servico', rot: 'Serviço', lista: estado.servicos.map((s) => s.nome) },
    { k: 'status', rot: 'Situação', tipo: 'select', opcoes: opcoesMapa(PROJETO_STATUS) },
    { k: 'progresso', rot: 'Progresso (%)', tipo: 'numero', min: 0, max: 100 },
    { k: 'inicio', rot: 'Início', tipo: 'date' },
    { k: 'prazo', rot: 'Prazo de entrega', tipo: 'date' },
    { k: 'valor', rot: 'Valor do projeto', tipo: 'valor' },
    { k: 'observacoes', rot: 'Anotações / próximas entregas', tipo: 'area', inteiro: true },
  ];
  const m = formModal({
    titulo: item ? item.nome : 'Novo projeto', campos, item: item || { status: 'planejado', progresso: 0, inicio: hojeISO() }, largo: true,
    topo: item ? `<div class="linha" style="margin:-.3em 0 1em">
        <button class="btn sec peq" id="pj-receita">${ic('dinheiro')} Lançar receita deste projeto</button>
        ${item.recebido ? `<span class="tag ok">Recebido ${moeda(item.recebido)}</span>` : ''}
        ${item.proposta_id ? `<button class="btn sec peq" id="pj-proposta">${ic('documento')} Proposta ${esc(item.proposta_numero)}</button>` : ''}</div>` : '',
    aoSalvar: async (d) => {
      if (d.status === 'concluido' && Number(d.progresso) < 100) d.progresso = 100;
      if (item) await api(`/api/projetos/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/projetos', { method: 'POST', body: d });
      toast('Projeto salvo.');
      recarregar();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Excluir o projeto "${item.nome}"? Os lançamentos do financeiro continuam, só perdem o vínculo.`, { botao: 'Excluir', perigo: true })) return false;
      await api(`/api/projetos/${item.id}`, { method: 'DELETE' });
      toast('Projeto excluído.');
      recarregar();
    }),
  });
  if (!item) return;
  $('#pj-receita', m.el).addEventListener('click', () => { m.fechar(); editarLancamento(null, { tipo: 'receita', projeto_id: item.id, cliente_id: item.cliente_id, descricao: item.nome, categoria: 'Consultoria' }); });
  $('#pj-proposta', m.el)?.addEventListener('click', async () => {
    m.fechar();
    const props = await api('/api/propostas');
    const p = props.find((x) => x.id === item.proposta_id);
    if (p) editarProposta(p);
  });
}

$('#pj-novo').addEventListener('click', () => editarProjeto());
$('#pj-busca').addEventListener('input', desenharProjetos);
$('#pj-xlsx').addEventListener('click', () => exportarXlsx('Projetos.xlsx', {
  aba: 'Projetos', cabecalho: [tituloEmpresa(), 'Projetos'],
  colunas: [{ titulo: 'Projeto', largura: 34 }, { titulo: 'Cliente', largura: 28 }, { titulo: 'Serviço', largura: 22 }, { titulo: 'Situação', largura: 14 },
    { titulo: 'Progresso %', largura: 11 }, { titulo: 'Início', largura: 12 }, { titulo: 'Prazo', largura: 12 }, { titulo: 'Valor', largura: 14 }, { titulo: 'Recebido', largura: 14 }],
  linhas: projetosFiltrados().map((p) => [p.nome, p.cliente_nome || '', p.servico || '', PROJETO_STATUS[p.status]?.rot || p.status, p.progresso,
    dataCurta(p.inicio), dataCurta(p.prazo), p.valor || '', p.recebido || '']),
}));

// ================= FINANCEIRO =================
let fnLanc = [];
let fnFiltro = 'todos';

async function carregarFinanceiro() {
  const [lanc, resumo] = await Promise.all([api(`/api/lancamentos?mes=${estado.mes}`), api(`/api/financeiro/resumo?mes=${estado.mes}`),
    carregarBase('clientes', 'projetos')]);
  fnLanc = lanc;
  const r = resumo.mes;
  $('#fn-kpis').innerHTML = [
    kpi({ rot: 'Receitas do mês', val: moedaCurta(r.receitas), icone: 'sobe', det: `recebido ${moeda(r.recebido)} · falta ${moeda(r.a_receber)}` }),
    kpi({ rot: 'Despesas do mês', val: moedaCurta(r.despesas), icone: 'desce', cor: 'ciano', det: `pago ${moeda(r.pago)} · falta ${moeda(r.a_pagar)}` }),
    kpi({ rot: 'Saldo (realizado)', val: moedaCurta(r.saldo), icone: 'dinheiro', cor: r.saldo < 0 ? 'ciano' : 'indigo', det: 'recebido − pago' }),
    kpi({ rot: 'Resultado previsto', val: moedaCurta(r.resultado), icone: 'grafico', cor: 'ambar', det: 'receitas − despesas do mês' }),
  ].join('');
  $('#fn-atrasados').innerHTML = !resumo.atrasados.length ? '' : `<div class="aviso-box alerta">${ic('alerta')}<span><b>${resumo.atrasados.length} lançamento(s) vencido(s) sem baixa:</b>
    ${resumo.atrasados.slice(0, 4).map((l) => `${esc(l.descricao)} (${l.tipo === 'receita' ? 'a receber' : 'a pagar'} ${moeda(l.valor)}, ${dataCurta(l.vencimento)})`).join(' · ')}${resumo.atrasados.length > 4 ? ' …' : ''}</span></div>`;
  $('#fn-ano').textContent = estado.mes.slice(0, 4);
  $('#fn-anual').innerHTML = resumo.ano.some((m) => m.receitas || m.despesas) ? graficoBarras(resumo.ano)
    + `<div class="linha entre suave" style="margin-top:.6em;font-size:.86rem"><span>Receitas no ano: <b>${moeda(resumo.ano.reduce((s, m) => s + m.receitas, 0))}</b></span>
      <span>Despesas no ano: <b>${moeda(resumo.ano.reduce((s, m) => s + m.despesas, 0))}</b></span></div>`
    : '<p class="suave" style="margin:0">Sem lançamentos neste ano.</p>';
  const maxCat = Math.max(1, ...resumo.categorias.map((c) => c.total));
  $('#fn-categorias').innerHTML = !resumo.categorias.length ? '<p class="suave" style="margin:0">Sem lançamentos neste mês.</p>'
    : `<div class="lista-cat">${resumo.categorias.map((c) => `<div class="item"><span>${esc(c.categoria)} <small class="suave">${c.tipo === 'receita' ? 'receita' : 'despesa'}</small></span>
      <div class="barra ${c.tipo}"><span style="width:${(c.total / maxCat) * 100}%"></span></div><b>${moeda(c.total)}</b></div>`).join('')}</div>`;
  desenharLancamentos();
}

function lancFiltrados() {
  return fnLanc.filter((l) => fnFiltro === 'todos' || (fnFiltro === 'pendentes' ? !l.pago_em : l.tipo === fnFiltro));
}

function desenharLancamentos() {
  $('#fn-filtros').innerHTML = [['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'], ['pendentes', 'Pendentes']].map(([k, r]) =>
    `<button class="${fnFiltro === k ? 'ativo' : ''}" data-f="${k}">${r}</button>`).join('');
  $$('#fn-filtros [data-f]').forEach((b) => b.addEventListener('click', () => { fnFiltro = b.dataset.f; desenharLancamentos(); }));
  const lista = lancFiltrados();
  const hoje = hojeISO();
  $('#fn-tabela').innerHTML = !lista.length
    ? vazio({ ilustra: 'calendario', titulo: `Nenhum lançamento em ${nomeCompetencia(estado.mes)}`, texto: 'Registre receitas (projetos, consultorias, assinaturas) e despesas (impostos, licenças, hospedagem).' })
    : `<div class="tabela-wrap"><table class="t"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((l) => {
        const sit = l.pago_em ? `<span class="tag ok">${l.tipo === 'receita' ? 'Recebido' : 'Pago'} ${dataCurta(l.pago_em).slice(0, 5)}</span>`
          : l.vencimento < hoje ? '<span class="tag erro">Vencido</span>' : `<span class="tag aviso">${l.tipo === 'receita' ? 'A receber' : 'A pagar'}</span>`;
        return `<tr>
          <td>${dataCurta(l.vencimento)}</td>
          <td><b>${esc(l.descricao)}</b>${l.cliente_nome || l.projeto_nome ? `<br><small class="suave">${esc([l.cliente_nome, l.projeto_nome].filter(Boolean).join(' · '))}</small>` : ''}</td>
          <td>${l.categoria ? `<span class="tag ${l.tipo === 'receita' ? 'info' : 'neutra'}">${esc(l.categoria)}</span>` : ''}</td>
          <td style="text-align:right;white-space:nowrap" class="${l.tipo === 'receita' ? 'txt-ok' : 'txt-erro'}"><b>${l.tipo === 'receita' ? '+' : '−'} ${moeda(l.valor)}</b></td>
          <td>${sit}</td>
          <td class="acoes"><button class="btn sec peq" data-baixa="${l.id}" data-pago="${l.pago_em ? 1 : 0}">${l.pago_em ? `${ic('x')} Estornar` : `${ic('check')} ${l.tipo === 'receita' ? 'Recebido' : 'Pago'}`}</button>
            <button class="btn sec peq icone" data-editar="${l.id}" title="Editar">${ic('editar')}</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  $$('#fn-tabela [data-baixa]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/api/lancamentos/${b.dataset.baixa}/baixa`, { method: 'POST', body: { pago: b.dataset.pago !== '1' } });
      carregarFinanceiro();
    } catch (err) { toast(err.message, true); }
  }));
  $$('#fn-tabela [data-editar]').forEach((b) => b.addEventListener('click', () => editarLancamento(fnLanc.find((l) => l.id === Number(b.dataset.editar)))));
}

function editarLancamento(item = null, inicial = {}) {
  const base = item || { tipo: 'receita', vencimento: estado.mes === competenciaAtual() ? hojeISO() : `${estado.mes}-10`, ...inicial };
  const tipo = base.tipo;
  const campos = [
    { k: 'descricao', rot: 'Descrição', obrig: true, inteiro: true },
    { k: 'categoria', rot: 'Categoria', lista: cfgLista(tipo === 'receita' ? 'categorias_receita' : 'categorias_despesa') },
    { k: 'valor', rot: 'Valor', tipo: 'valor', obrig: true },
    { k: 'vencimento', rot: 'Vencimento', tipo: 'date', obrig: true },
    { k: 'pago_em', rot: tipo === 'receita' ? 'Recebido em' : 'Pago em', tipo: 'date', ajuda: 'vazio = pendente' },
    { k: 'cliente_id', rot: 'Cliente', tipo: 'select', opcoes: opcoesClientes() },
    { k: 'projeto_id', rot: 'Projeto', tipo: 'select', opcoes: [['', '— nenhum —'], ...estado.projetos.map((p) => [p.id, p.nome])] },
    { k: 'observacoes', rot: 'Observações', tipo: 'area', alt: 3, inteiro: true },
  ];
  const m = formModal({
    titulo: `${item ? 'Editar' : 'Nova'} ${tipo === 'receita' ? 'receita' : 'despesa'}`, campos, item: base,
    rodapeEsq: item ? `<button class="btn sec" id="ln-repetir">${ic('repetir')} Repetir nos próximos meses</button>` : '',
    aoSalvar: async (d) => {
      d.tipo = tipo;
      if (item) await api(`/api/lancamentos/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/lancamentos', { method: 'POST', body: d });
      toast('Lançamento salvo.');
      if (estado.secao === 'financeiro') carregarFinanceiro(); else recarregar();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Excluir "${item.descricao}"?`, { botao: 'Excluir', perigo: true })) return false;
      await api(`/api/lancamentos/${item.id}`, { method: 'DELETE' });
      toast('Lançamento excluído.');
      carregarFinanceiro();
    }),
  });
  $('#ln-repetir', m.el)?.addEventListener('click', async () => {
    const n = Number(prompt('Repetir este lançamento por quantos meses seguintes? (1 a 36)', '11'));
    if (!n) return;
    try {
      const r = await api(`/api/lancamentos/${item.id}/repetir`, { method: 'POST', body: { vezes: n } });
      toast(`${r.criados} lançamento(s) criado(s) nos próximos meses.`);
      m.fechar();
      carregarFinanceiro();
    } catch (err) { toast(err.message, true); }
  });
}

$('#fn-receita').addEventListener('click', () => editarLancamento(null, { tipo: 'receita' }));
$('#fn-despesa').addEventListener('click', () => editarLancamento(null, { tipo: 'despesa' }));
const linhasFin = () => lancFiltrados().map((l) => [dataCurta(l.vencimento), l.tipo === 'receita' ? 'Receita' : 'Despesa', l.descricao, l.categoria || '',
  l.cliente_nome || '', l.projeto_nome || '', l.valor, l.pago_em ? dataCurta(l.pago_em) : 'Pendente']);
$('#fn-xlsx').addEventListener('click', () => exportarXlsx(`Financeiro - ${estado.mes}.xlsx`, {
  aba: 'Lançamentos', cabecalho: [tituloEmpresa(), `Financeiro · ${mesCapitalizado(estado.mes)}`],
  colunas: [{ titulo: 'Vencimento', largura: 12 }, { titulo: 'Tipo', largura: 10 }, { titulo: 'Descrição', largura: 40 }, { titulo: 'Categoria', largura: 20 },
    { titulo: 'Cliente', largura: 24 }, { titulo: 'Projeto', largura: 24 }, { titulo: 'Valor', largura: 14 }, { titulo: 'Baixa', largura: 12 }],
  linhas: linhasFin(),
}));
$('#fn-pdf').addEventListener('click', () => {
  const lista = lancFiltrados();
  const rec = lista.filter((l) => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
  const desp = lista.filter((l) => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);
  abrirPdf('/api/pdf/tabela', {
    titulo: `Financeiro · ${mesCapitalizado(estado.mes)}`, subtitulo: `${lista.length} lançamento(s)`, orientacao: 'paisagem',
    colunas: [{ titulo: 'Vencimento', largura: 62 }, { titulo: 'Tipo', largura: 52 }, { titulo: 'Descrição' }, { titulo: 'Categoria' }, { titulo: 'Cliente' },
      { titulo: 'Valor', alinhar: 'dir', largura: 80 }, { titulo: 'Baixa', largura: 62 }],
    linhas: [...lista.map((l) => [dataCurta(l.vencimento), l.tipo === 'receita' ? 'Receita' : 'Despesa', l.descricao, l.categoria || '', l.cliente_nome || '',
      `${l.tipo === 'receita' ? '' : '- '}${moeda(l.valor)}`, l.pago_em ? dataCurta(l.pago_em) : 'Pendente']),
    { celulas: ['', '', 'Receitas', '', '', moeda(rec), ''], negrito: true }, { celulas: ['', '', 'Despesas', '', '', `- ${moeda(desp)}`, ''], negrito: true },
    { celulas: ['', '', 'Resultado', '', '', moeda(rec - desp), ''], negrito: true }],
  }, `Financeiro ${estado.mes}.pdf`);
});

// ================= DOCUMENTOS =================
let docs = [];
let docAtual = null;

const MODELOS = {
  contrato: {
    nome: 'Contrato de prestação de serviços',
    titulo: 'Contrato de prestação de serviços',
    corpo: (c) => `CONTRATANTE: [NOME / RAZÃO SOCIAL], inscrito(a) no CPF/CNPJ sob o nº [DOCUMENTO], com endereço em [ENDEREÇO].

CONTRATADA: ${c.empresa_nome || 'AR Consultoria'}${c.empresa_cnpj ? `, inscrita no CNPJ sob o nº ${c.empresa_cnpj}` : ''}, neste ato representada por ${c.responsavel_nome || '[NOME]'}.

1. OBJETO. A CONTRATADA prestará à CONTRATANTE os serviços de [DESCRIÇÃO DOS SERVIÇOS], conforme a proposta comercial nº [Nº DA PROPOSTA], que faz parte deste contrato.

2. PRAZO. Os serviços serão executados em [PRAZO], contados a partir da assinatura deste contrato e do recebimento das informações e acessos necessários.

3. VALOR E PAGAMENTO. Pelos serviços, a CONTRATANTE pagará o valor total de R$ [VALOR], da seguinte forma: [CONDIÇÕES DE PAGAMENTO].

4. OBRIGAÇÕES DA CONTRATANTE. Fornecer as informações, os dados e os acessos necessários, e indicar um responsável para as validações.

5. CONFIDENCIALIDADE. As partes se comprometem a manter sigilo sobre os dados e informações a que tiverem acesso em razão deste contrato, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

6. PROPRIEDADE. Após a quitação, os entregáveis desenvolvidos especificamente para a CONTRATANTE passam a ser de sua propriedade.

7. RESCISÃO. Este contrato pode ser rescindido por qualquer das partes mediante aviso prévio de [Nº] dias, sendo devidos os valores dos serviços já executados.

8. FORO. Fica eleito o foro da comarca de [CIDADE/UF] para dirimir quaisquer questões oriundas deste contrato.`,
  },
  recibo: {
    nome: 'Recibo',
    titulo: 'Recibo',
    corpo: (c) => `Recebi de [NOME DO CLIENTE], inscrito(a) no CPF/CNPJ sob o nº [DOCUMENTO], a importância de R$ [VALOR] ([VALOR POR EXTENSO]), referente a [DESCRIÇÃO DO SERVIÇO], prestado pela ${c.empresa_nome || 'AR Consultoria'}.\n\nPara clareza, firmo o presente recibo, dando plena quitação do valor recebido.`,
  },
  apresentacao: {
    nome: 'Carta de apresentação',
    titulo: 'Carta de apresentação',
    destinatario: 'À [EMPRESA]\nA/C [NOME DO CONTATO]',
    corpo: (c) => `Prezado(a) [NOME],

Sou ${c.responsavel_nome || '[SEU NOME]'}, da ${c.empresa_nome || 'AR Consultoria'}. ${c.portfolio_frase || ''}

${c.portfolio_sobre || ''}

Gostaria de apresentar como posso apoiar a [EMPRESA] em [DESAFIO DO CLIENTE]. Envio em anexo o meu portfólio com os serviços e alguns dos projetos já entregues.

Fico à disposição para uma conversa.

Atenciosamente,`,
  },
  declaracao: {
    nome: 'Declaração de prestação de serviço',
    titulo: 'Declaração',
    corpo: (c) => `Declaramos, para os devidos fins, que a ${c.empresa_nome || 'AR Consultoria'}${c.empresa_cnpj ? `, inscrita no CNPJ sob o nº ${c.empresa_cnpj}` : ''}, prestou à [NOME DO CLIENTE] os serviços de [DESCRIÇÃO DOS SERVIÇOS], no período de [DATA DE INÍCIO] a [DATA DE TÉRMINO].\n\nPor ser expressão da verdade, firmamos a presente declaração.`,
  },
};

async function carregarDocumentos() {
  const sel = $('#doc-modelo');
  if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', Object.entries(MODELOS).map(([k, m]) => `<option value="${k}">${esc(m.nome)}</option>`).join(''));
  docs = await api('/api/documentos');
  desenharListaDocs();
}

function desenharListaDocs() {
  const q = normalizar($('#doc-busca').value);
  const lista = docs.filter((d) => !q || normalizar(d.titulo + ' ' + (d.destinatario || '')).includes(q));
  $('#doc-lista').innerHTML = lista.length ? lista.map((d) => `<button data-doc="${d.id}" class="${docAtual?.id === d.id ? 'ativo' : ''}">
      <span class="bolha">${ic('documento')}</span><span><b>${esc(d.titulo)}</b><small class="suave">${esc(dataBR(d.atualizado_em))} · ${esc(d.usuario || '')}</small></span></button>`).join('')
    : vazio({ ilustra: 'documento', titulo: 'Nenhum documento salvo', texto: 'Escolha um modelo ao lado para começar.' });
  $$('#doc-lista [data-doc]').forEach((b) => b.addEventListener('click', () => abrirDoc(Number(b.dataset.doc))));
}

async function abrirDoc(id) {
  docAtual = await api(`/api/documentos/${id}`);
  preencherDoc(docAtual);
  desenharListaDocs();
}

function preencherDoc(d) {
  $('#doc-titulo').value = d?.titulo || '';
  $('#doc-dest').value = d?.destinatario || '';
  $('#doc-corpo').value = d?.corpo || '';
  $('#doc-local').value = d?.local_data || '';
  $('#doc-ass').value = d?.assinatura || '';
  $('#doc-excluir').hidden = !d?.id;
  $('#doc-modelo').value = '';
}

const lerFormDoc = () => ({
  titulo: $('#doc-titulo').value, destinatario: $('#doc-dest').value, corpo: $('#doc-corpo').value,
  local_data: $('#doc-local').value, assinatura: $('#doc-ass').value,
});

$('#doc-busca').addEventListener('input', desenharListaDocs);
$('#doc-novo').addEventListener('click', () => { docAtual = null; preencherDoc(null); desenharListaDocs(); $('#doc-titulo').focus(); });
$('#doc-modelo').addEventListener('change', async (e) => {
  const m = MODELOS[e.target.value];
  if (!m) return;
  if ($('#doc-corpo').value.trim() && !await confirmar('Substituir o texto atual pelo modelo?', { botao: 'Substituir' })) { e.target.value = ''; return; }
  $('#doc-titulo').value = m.titulo;
  $('#doc-dest').value = m.destinatario || '';
  $('#doc-corpo').value = m.corpo(estado.cfg).replace(/\n{3,}/g, '\n\n');
  if (!$('#doc-ass').value) $('#doc-ass').value = `${estado.cfg.responsavel_nome || estado.eu.nome}\n${tituloEmpresa()}`;
});
$('#doc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (docAtual?.id) await api(`/api/documentos/${docAtual.id}`, { method: 'PUT', body: lerFormDoc() });
    else docAtual = { id: (await api('/api/documentos', { method: 'POST', body: lerFormDoc() })).id };
    toast('Documento salvo.');
    $('#doc-excluir').hidden = false;
    docs = await api('/api/documentos');
    desenharListaDocs();
  } catch (err) { toast(err.message, true); }
});
$('#doc-previa').addEventListener('click', () => abrirPdf('/api/pdf/documento', lerFormDoc(), `${$('#doc-titulo').value || 'documento'}.pdf`));
$('#doc-excluir').addEventListener('click', async () => {
  if (!docAtual?.id || !await confirmar(`Excluir o documento "${$('#doc-titulo').value}"?`, { botao: 'Excluir', perigo: true })) return;
  await api(`/api/documentos/${docAtual.id}`, { method: 'DELETE' });
  docAtual = null;
  preencherDoc(null);
  docs = await api('/api/documentos');
  desenharListaDocs();
  toast('Documento excluído.');
});
$('#tb-gerar').addEventListener('click', () => abrirPdf(`/api/pdf/timbrado?orientacao=${$('#tb-orientacao').value}&paginas=${$('#tb-paginas').value}`, undefined, 'Papel timbrado.pdf'));


// ================= CENTRAL DE SISTEMAS =================
const SISTEMA_STATUS = {
  online: { rot: 'No ar', cor: 'ok' },
  offline: { rot: 'Fora do ar', cor: 'erro' },
  erro: { rot: 'Com erro', cor: 'erro' },
  sem_endereco: { rot: 'Sem endereço', cor: 'neutra' },
  pendente: { rot: 'Não verificado', cor: 'aviso' },
};
let sistemas = [];

function atualizarContadorSistemas(n) {
  $('#cont-sistemas').textContent = n;
  $('#cont-sistemas').hidden = !n;
  $('#cont-sistemas').classList.add('alerta');
}

const statusSistema = (x) => (!x.url ? 'sem_endereco' : !x.monitorar ? null : x.status && x.status !== 'sem_endereco' ? x.status : 'pendente');
const linkAdmin = (x) => (x.url ? x.url + (x.caminho_admin || '/') : '');

async function carregarSistemas() {
  $('#si-novo').hidden = estado.eu.perfil !== 'admin';
  sistemas = await api('/api/sistemas');
  desenharSistemas();
  // Verifica na hora ao abrir a tela (a lista atualiza quando a verificação termina).
  if (sistemas.some((x) => x.url && x.monitorar)) verificarSistemas(true);
}

async function verificarSistemas(silencioso = false) {
  const b = $('#si-verificar');
  b.disabled = true;
  $('#si-lista').classList.add('verificando');
  try {
    sistemas = await api('/api/sistemas/verificar', { method: 'POST' });
    desenharSistemas();
    if (!silencioso) toast('Verificação concluída.');
  } catch (e) { toast(e.message, true); } finally { b.disabled = false; $('#si-lista').classList.remove('verificando'); }
}

function desenharSistemas() {
  const sts = sistemas.map(statusSistema);
  const fora = sts.filter((x) => x === 'offline' || x === 'erro').length;
  atualizarContadorSistemas(fora);
  $('#si-kpis').innerHTML = [
    kpi({ rot: 'Sistemas', val: sistemas.length, icone: 'servidor', cor: 'indigo' }),
    kpi({ rot: 'No ar', val: sts.filter((x) => x === 'online').length, icone: 'check' }),
    kpi({ rot: 'Fora do ar', val: fora, icone: 'alerta', cor: fora ? 'ciano' : '', det: fora ? 'veja os cartões abaixo' : 'tudo certo' }),
    kpi({ rot: 'Sem endereço', val: sts.filter((x) => x === 'sem_endereco').length, icone: 'link', cor: 'ambar', det: 'cadastre o link publicado' }),
  ].join('');
  const admin = estado.eu.perfil === 'admin';
  $('#si-lista').innerHTML = !sistemas.length
    ? `<div class="cartao" style="grid-column:1/-1">${vazio({ ilustra: 'documento', titulo: 'Nenhum sistema cadastrado', texto: 'Cadastre as plataformas publicadas para acompanhar tudo daqui.' })}</div>`
    : sistemas.map((x) => {
      const st = statusSistema(x);
      const ultima = x.verificado_em ? `verificado ${esc(dataBR(x.verificado_em))}` : '';
      return `<div class="cartao sistema ${st || ''}">
        <div class="linha entre"><span class="tipo">${esc(x.cliente || '')}</span>${st ? tag(SISTEMA_STATUS, st) : '<span class="tag neutra">Sem monitoramento</span>'}</div>
        <h3>${esc(x.nome)}</h3>
        ${x.descricao ? `<p class="suave" style="margin:0 0 .6em">${esc(x.descricao)}</p>` : ''}
        ${x.url ? `<a class="endereco" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url.replace(/^https?:\/\//, ''))}</a>`
          : `<p class="suave endereco">${admin ? 'Informe o endereço publicado em Editar.' : 'Endereço ainda não cadastrado.'}</p>`}
        <div class="dados-si">
          <div><small>Resposta</small><b>${x.latencia_ms && st === 'online' ? `${x.latencia_ms} ms` : '—'}</b></div>
          <div><small>Último “no ar”</small><b>${x.online_em ? esc(dataBR(x.online_em)) : '—'}</b></div>
        </div>
        ${x.erro && st !== 'online' ? `<p class="txt-erro" style="font-size:.82rem;margin:.5em 0 0">${ic('alerta')} ${esc(x.erro)}</p>` : ''}
        ${x.acesso ? `<p class="suave acesso">${ic('chave')} ${esc(x.acesso)}</p>` : ''}
        <div class="linha" style="margin-top:auto;padding-top:.8em">
          ${x.url ? `<a class="btn peq" href="${esc(linkAdmin(x))}" target="_blank" rel="noopener noreferrer">${ic('escudo')} Abrir administração</a>
            <a class="btn sec peq" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${ic('externo')} Abrir sistema</a>` : ''}
          <span class="cresce"></span>
          ${admin ? `<button class="btn fantasma peq" data-editar-si="${x.id}">${ic('editar')} Editar</button>` : ''}
        </div>
        <small class="suave" style="margin-top:.5em;font-size:.74rem">${ultima}</small>
      </div>`;
    }).join('');
  $$('#si-lista [data-editar-si]').forEach((b) => b.addEventListener('click', () => editarSistema(sistemas.find((x) => x.id === Number(b.dataset.editarSi)))));
  $('#si-info').textContent = 'O servidor da AR consulta o endereço /healthz de cada sistema ao abrir esta tela, no botão “Verificar agora” e a cada 15 minutos.';
}

function editarSistema(item = null) {
  const campos = [
    { k: 'nome', rot: 'Nome', obrig: true },
    { k: 'cliente', rot: 'Cliente / empresa', lista: [...new Set([...estado.clientes.map((c) => c.nome), 'AR Consultoria', 'Âmbar Energia'])] },
    { k: 'url', rot: 'Endereço publicado', placeholder: 'https://meusistema.onrender.com', inteiro: true },
    { k: 'caminho_admin', rot: 'Página de administração', ajuda: 'caminho depois do endereço', placeholder: '/admin' },
    { k: 'ordem', rot: 'Ordem', tipo: 'numero', min: 0 },
    { k: 'descricao', rot: 'Descrição curta', inteiro: true },
    { k: 'acesso', rot: 'Como entrar como administrador', ajuda: 'dica — não coloque a senha', inteiro: true },
    { k: 'observacoes', rot: 'Observações', tipo: 'area', alt: 3, inteiro: true },
    { k: 'monitorar', rot: 'Monitoramento', tipo: 'check', texto: 'Verificar se está no ar', padrao: 1 },
  ];
  formModal({
    titulo: item ? item.nome : 'Novo sistema', campos, item: item || { monitorar: 1, ordem: sistemas.length + 1 },
    topo: '<p class="suave" style="margin-top:-.4em">Não guarde senhas aqui. Cada sistema continua com o próprio login.</p>',
    aoSalvar: async (d) => {
      if (item) await api(`/api/sistemas/${item.id}`, { method: 'PUT', body: d });
      else await api('/api/sistemas', { method: 'POST', body: d });
      toast('Sistema salvo.');
      sistemas = await api('/api/sistemas');
      desenharSistemas();
    },
    aoExcluir: item && (async () => {
      if (!await confirmar(`Remover "${item.nome}" da central? O sistema em si não é afetado.`, { botao: 'Remover', perigo: true })) return false;
      await api(`/api/sistemas/${item.id}`, { method: 'DELETE' });
      toast('Removido da central.');
      sistemas = await api('/api/sistemas');
      desenharSistemas();
    }),
  });
}

$('#si-verificar').addEventListener('click', () => verificarSistemas());
$('#si-novo').addEventListener('click', () => editarSistema());
