# AR Consultoria · Sistema de gestão e portfólio

Sistema interno da AR Consultoria (consultoria financeira, painéis, ferramentas e aplicativos).
O destaque é o **portfólio em PDF**: o sistema monta a apresentação com os serviços, o Vértice, os cases de clientes
e os outros trabalhos, completa ou personalizada para cada cliente. Junto vêm o funil comercial, as propostas com
PDF timbrado, os projetos e o financeiro da consultoria.

Mesma base do sistema feito para a Hessel Domiciliar: Node.js + SQLite nativo, HTML/CSS/JS puro, PDFs com pdf-lib.
Identidade visual tirada do logo da AR: marinho `#17397d`, azul `#005ea4`, ciano `#20b8d5`, azul-claro `#b3d8eb` e fonte Montserrat
(cores centralizadas em `public/css/estilo.css` e `pdf.js`).

## Telas

**Sistema (`/app`)**
- **Painel**: leads novos, propostas em aberto, recebido e saldo do mês, receitas × despesas dos últimos 6 meses,
  funil comercial, projetos em andamento e agenda (retornos de leads e vencimentos dos próximos 15 dias).
- **Portfólio**: gere o PDF em um clique ou escolha o que entra (serviços, itens, clientes) e para quem ele é (“Preparado para”, na capa).
  - **Aplicativos, sistemas e projetos**: cada item tem nome, tipo, slogan, descrição, recursos (um por linha), público, tecnologias e links,
    e até **2 prints da tela** (principal e secundário). Itens com **destaque** ganham uma página inteira.
    O campo **Cliente atendido** transforma o item em case do cliente; **Desenvolvido na empresa** registra onde o projeto foi feito
    quando não é cliente.
  - **Serviços**: catálogo com resumo, ícone, preço base e ordem (também usado nas propostas).
  - **Capa, sobre mim e contato**: textos, anos de experiência, empresas, habilidades e redes.
- **Central de sistemas**: as 7 ferramentas do catálogo (Vértice, Hessel, Talent Review, Jornada, Orçamento, Trilha DHO e Reembolsos) em cartões,
  com o endereço publicado, link direto para a área de administração e a situação de cada uma (no ar, fora do ar, sem endereço).
  O servidor da AR consulta `<endereço>/healthz` de cada sistema ao abrir a tela, no botão “Verificar agora” e a cada 15 minutos;
  sistemas fora do ar aparecem em vermelho no menu e em um aviso no Painel. **Nenhuma senha é guardada**: o acesso continua
  com o login de cada sistema. Todos veem a central; só o administrador cadastra, edita e remove.
- **Leads**: quadro por etapa (novo → em contato → proposta enviada → ganho/perdido), com arrastar e soltar, valor estimado,
  próximo contato, WhatsApp, “converter em cliente”, “criar proposta” e “portfólio para este lead”.
- **Clientes**: cadastro, importação do Excel, exportação Excel/PDF, logo do cliente e a opção de aparecer em “Clientes atendidos”.
- **Propostas**: número automático (`AR-2026-001`), itens a partir do catálogo, desconto, validade, prazo e condições, PDF timbrado,
  duplicar e **gerar projeto** (marca como aprovada, cria o projeto e lança as parcelas a receber).
- **Projetos**: situação, progresso, prazo, valor e quanto já foi recebido.
- **Financeiro**: receitas e despesas do mês, baixa (recebido/pago), repetição mensal, vencidos, visão anual e por categoria,
  exportação Excel/PDF.
- **Documentos e timbrado**: papel timbrado em branco e documentos (contrato, recibo, carta de apresentação, declaração) em PDF.

**Administração (`/admin`)**: usuários (administrador/operador), dados da empresa e do timbrado, logo, padrões das propostas,
listas de sugestões, auditoria e backup.

## O portfólio em PDF

A4 paisagem, nesta ordem (cada parte pode ser ligada/desligada ao gerar):

1. **Capa** — nome, especialidades, frase, “Preparado para”, logo e uma colagem com os prints dos projetos em destaque.
2. **Sobre mim** — anos de experiência, empresas em que atuou, texto e as 4 principais habilidades.
3. **Serviços** — cartões com ícone, nome e descrição.
4. **Clientes atendidos** — logo do cliente e o que foi entregue (os cases ligados a ele).
5. **Uma página por destaque** — textos, dois prints em moldura de navegador e a faixa de principais recursos.
6. **Outros trabalhos** — itens sem destaque, 3 por página.
7. **Contato** — telefone/WhatsApp, e-mail, Instagram, LinkedIn e link do portfólio online.

### Ferramentas do portfólio (catálogo)

As ferramentas desenvolvidas ficam em `catalogo.js`, que alimenta o portfólio e a Central de sistemas:

| Ferramenta | Tipo | Onde |
|---|---|---|
| **Vértice** (pessoa física e Vértice Empresas) | Aplicativo | AR Consultoria |
| **Fechamento de folhas e produtividade** | Sistema web | Case da cliente **Hessel Domiciliar** (cadastrada com o logo) |
| **Talent Review** | E-book interativo | Versão neutra no visual da AR |
| **Jornada do Colaborador** (Primeiras Conexões, Avaliação de Experiência e Entrevista de Desligamento) | Sistema web | Desenvolvido na Âmbar Energia |
| **Orçamento de Pessoal** | Sistema web | Desenvolvido na Âmbar Energia |
| **Trilha de Desenvolvimento (DHO)** | Sistema web | Desenvolvido na Âmbar Energia |
| **Portal de Reembolsos** | Sistema web | Desenvolvido na Âmbar Energia |

A Âmbar não é cadastrada como cliente. Também entram os 5 serviços do portfólio e os textos de “Sobre mim”.

Os prints em `assets/vitrine/` foram tirados das próprias ferramentas rodando com **dados fictícios** (nenhum dado real e
nenhuma foto de pessoas); os do Vértice vêm do guia oficial do app. Dá para trocar por outros no botão de imagem de cada item.

**Para atualizar o portfólio** quando uma ferramenta mudar: edite `catalogo.js` (e os prints em `assets/vitrine/`) e aumente
`CATALOGO_VERSAO`. Na próxima inicialização, cada banco aplica a versão nova uma única vez: textos, recursos, prints e o
cliente do case são atualizados, e ferramentas novas são incluídas. Fica como está o que é do usuário: ordem, destaque,
“aparece no portfólio”, link publicado e o endereço cadastrado na Central de sistemas. Os itens são reencontrados pela
chave do catálogo ou, em bancos antigos, pelo repositório ou pelo nome — nada é duplicado.

Os links publicados não foram preenchidos (Portfólio → item → Editar → “Link para acessar”; e Central de sistemas → Editar).

## Como rodar

Requisito: **Node.js 22.13+** (usa o SQLite nativo do Node, sem banco externo).

```bash
npm install
npm start         # http://localhost:3000
npm test
```

Primeiro acesso: usuário **`admin`**, senha **`ar-admin`** (o painel avisa até que seja trocada).

| Variável | Para quê | Padrão |
|---|---|---|
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Administrador criado no primeiro início | `admin` / `ar-admin` (obrigatório definir em produção) |
| `PORT` | Porta HTTP | `3000` |
| `DATA_DIR` | Pasta do banco (`arconsultoria.db`), do logo e dos prints do portfólio | `./data` |
| `SESSION_SECRET` | Chave dos cookies de sessão | gerada e salva em `data/` |
| `NODE_ENV=production` | Cookies só via HTTPS | – |

## Publicação

- **Render**: em render.com → *New → Blueprint* → este repositório (o `render.yaml` já cria o serviço com disco permanente);
  informe `ADMIN_PASSWORD` quando pedir.
- **Docker**: `docker build -t ar-consultoria . && docker run -d -p 3000:3000 -v ar-dados:/data -e ADMIN_PASSWORD=... ar-consultoria`
  (com um proxy HTTPS na frente).

## Estrutura

```
server.js      API (login, portfólio, leads, clientes, propostas, projetos, financeiro, documentos, admin) + arquivos estáticos
db.js          esquema SQLite, aplicação do catálogo e senhas (scrypt)
catalogo.js    ferramentas desenvolvidas: textos, prints e dados da Central de sistemas
pdf.js         portfólio, propostas, papel timbrado, documentos e tabelas em PDF (pdf-lib)
assets/        fontes, prints e logos usados no conteúdo inicial
public/        telas em HTML/CSS/JS puro
test/          testes (node --test)
```
