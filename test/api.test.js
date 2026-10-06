// Testes da API: login, portfólio em PDF, proposta → projeto → financeiro e permissões.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-teste-'));
process.env.ADMIN_PASSWORD = 'senha-de-teste';
const { app, numero, somarMeses } = require('../server');

let servidor, base, cookie = '';
before(() => new Promise((ok) => { servidor = app.listen(0, () => { base = `http://localhost:${servidor.address().port}`; ok(); }); }));
after(() => { servidor.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

async function req(metodo, url, corpo) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, tipo, dados: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}

test('números em formato brasileiro e soma de meses', () => {
  assert.strictEqual(numero('1.500,50'), 1500.5);
  assert.strictEqual(numero('R$ 75,90'), 75.9);
  assert.strictEqual(numero('1500.5'), 1500.5);
  assert.strictEqual(numero(''), null);
  assert.strictEqual(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(somarMeses('2026-11-15', 3), '2027-02-15');
});

test('rotas exigem login', async () => {
  assert.strictEqual((await req('GET', '/api/clientes')).status, 401);
  assert.strictEqual((await req('POST', '/api/portfolio/pdf', {})).status, 401);
});

test('login', async () => {
  assert.strictEqual((await req('POST', '/api/login', { login: 'admin', senha: 'errada' })).status, 401);
  const r = await req('POST', '/api/login', { login: 'admin', senha: 'senha-de-teste' });
  assert.strictEqual(r.status, 200);
  assert.ok(cookie.startsWith('sess_ar='));
});

test('conteúdo inicial do portfólio: Vértice, case da Hessel e projetos da Âmbar (sem a Âmbar como cliente)', async () => {
  const vitrine = (await req('GET', '/api/vitrine')).dados;
  const nomes = vitrine.map((v) => v.nome);
  assert.ok(nomes.includes('Vértice'));
  assert.ok(nomes.includes('Trilha de Desenvolvimento (DHO)'));
  assert.ok(nomes.includes('Portal de Reembolsos'));
  assert.strictEqual(vitrine.find((v) => v.nome === 'Fechamento de folhas e produtividade').cliente, 'Hessel Domiciliar');
  assert.strictEqual(vitrine.find((v) => v.nome === 'Portal de Reembolsos').realizado_em, 'Âmbar Energia');
  const clientes = (await req('GET', '/api/clientes')).dados.map((c) => c.nome);
  assert.deepStrictEqual(clientes, ['Hessel Domiciliar']);
  const img = await req('GET', `/api/vitrine/${vitrine.find((v) => v.nome === 'Vértice').id}/imagem/1`);
  assert.strictEqual(img.status, 200);
});

test('gera o portfólio em PDF (completo e personalizado)', async () => {
  const completo = await req('POST', '/api/portfolio/pdf', {});
  assert.strictEqual(completo.status, 200);
  assert.strictEqual(completo.tipo, 'application/pdf');
  assert.strictEqual(completo.dados.subarray(0, 4).toString(), '%PDF');
  const servicos = (await req('GET', '/api/servicos')).dados;
  const parcial = await req('POST', '/api/portfolio/pdf', { para: 'Cliente Teste', servicos: [servicos[0].id], itens: [], clientes: [], sobre: false });
  assert.strictEqual(parcial.status, 200);
  assert.ok(parcial.dados.length < completo.dados.length);
});

test('lead → proposta → projeto com parcelas no financeiro', async () => {
  const lead = (await req('POST', '/api/leads', { nome: 'Carla', empresa: 'Padaria Bom Grão', valor_estimado: '4.500,00' })).dados;
  const prop = (await req('POST', '/api/propostas', {
    titulo: 'Painel de vendas', lead_id: lead.id, status: 'enviada', desconto: '100',
    itens: [{ descricao: 'Dashboard', qtd: 1, valor: '3.000,00' }, { descricao: 'Treinamento', qtd: 2, valor: 250 }],
  })).dados;
  assert.match(prop.numero, /^AR-\d{4}-001$/);
  let lista = (await req('GET', '/api/propostas')).dados;
  assert.strictEqual(lista[0].total, 3400);
  assert.strictEqual((await req('GET', '/api/leads')).dados.find((l) => l.id === lead.id).status, 'proposta');

  const pdf = await req('GET', `/api/propostas/${prop.id}/pdf`);
  assert.strictEqual(pdf.tipo, 'application/pdf');

  const pj = await req('POST', `/api/propostas/${prop.id}/projeto`, { parcelas: 3, primeiro_vencimento: '2026-10-10' });
  assert.strictEqual(pj.status, 200);
  assert.strictEqual((await req('POST', `/api/propostas/${prop.id}/projeto`, { parcelas: 3 })).status, 409);
  lista = (await req('GET', '/api/propostas')).dados;
  assert.strictEqual(lista[0].status, 'aprovada');
  assert.strictEqual((await req('GET', '/api/leads')).dados.find((l) => l.id === lead.id).status, 'ganho');

  const out = (await req('GET', '/api/lancamentos?mes=2026-10')).dados;
  const dez = (await req('GET', '/api/lancamentos?mes=2026-12')).dados;
  assert.strictEqual(out.length, 1);
  assert.strictEqual(dez.length, 1);
  assert.strictEqual(out[0].valor + (await req('GET', '/api/lancamentos?mes=2026-11')).dados[0].valor + dez[0].valor, 3400);

  await req('POST', `/api/lancamentos/${out[0].id}/baixa`, { pago: true, data: '2026-10-10' });
  const resumo = (await req('GET', '/api/financeiro/resumo?mes=2026-10')).dados.mes;
  assert.strictEqual(resumo.recebido, out[0].valor);
  assert.strictEqual(resumo.a_receber, 0);
});

test('cliente com histórico é inativado, não excluído', async () => {
  const c = (await req('POST', '/api/clientes', { nome: 'Cliente Com Proposta' })).dados;
  await req('POST', '/api/propostas', { titulo: 'X', cliente_id: c.id });
  const r = await req('DELETE', `/api/clientes/${c.id}`);
  assert.deepStrictEqual(r.dados, { inativado: true });
});

test('operador não acessa a administração', async () => {
  await req('POST', '/api/admin/usuarios', { nome: 'Operador', login: 'op', senha: 'operador-123', perfil: 'operador' });
  await req('POST', '/api/logout');
  await req('POST', '/api/login', { login: 'op', senha: 'operador-123' });
  assert.strictEqual((await req('GET', '/api/admin/usuarios')).status, 403);
  assert.strictEqual((await req('PUT', '/api/portfolio/config', { portfolio_anos: '11+' })).status, 200);
});
