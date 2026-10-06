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

### Conteúdo inicial

Na primeira execução o sistema já vem com:
- os 5 serviços do portfólio do Augusto (consultoria financeira, painéis, automações, aplicativos e treinamentos) e os textos de “Sobre mim”;
- **Vértice 2.0** (aplicativo, destaque) — a versão nova do repositório `Vertice_Final`: login por conta criada pelo administrador,
  dados no servidor sincronizados entre dispositivos, vencimentos, parcelas, visão anual e PWA;
- **Fechamento de folhas e produtividade** — case da cliente **Hessel Domiciliar** (cliente cadastrada com o logo);
- **Trilha de Desenvolvimento (DHO)** e **Portal de Reembolsos** — projetos desenvolvidos na Âmbar Energia (a Âmbar não é cadastrada como cliente).

Os prints em `assets/vitrine/` foram tirados dos próprios sistemas rodando com **dados de demonstração** (nomes e valores fictícios);
dá para trocar por outros a qualquer momento no botão de imagem de cada item.
O link do Vértice publicado não foi preenchido (fica em Portfólio → Vértice → Editar → “Link para acessar”).
Bancos criados antes da troca são atualizados sozinhos para o Vértice 2.0 na próxima inicialização (textos, links e prints),
desde que o item ainda aponte para o repositório antigo.

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
db.js          esquema SQLite, conteúdo inicial do portfólio e senhas (scrypt)
pdf.js         portfólio, propostas, papel timbrado, documentos e tabelas em PDF (pdf-lib)
assets/        fontes, prints e logos usados no conteúdo inicial
public/        telas em HTML/CSS/JS puro
test/          testes (node --test)
```
