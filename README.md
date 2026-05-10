# Cuiido — Agente Comercial Inteligente

## Visão Geral

O Cuiido Agent é um agente de IA comercial que:
- Busca dados de vendas em tempo real do Tiny ERP
- Responde perguntas em linguagem natural sobre vendas
- Mostra performance por vendedor, estado e cidade
- Cruza dados de vendas com potencial econômico de cada cidade
- Sugere ações comerciais concretas
- Envia relatórios e alertas por WhatsApp/email

---

## Estrutura do Projeto

```
cuiido-agent/
├── README.md               ← este arquivo
├── .env.example            ← variáveis de ambiente necessárias
├── package.json            ← dependências Node.js
│
├── server/
│   ├── index.js            ← servidor principal (Express)
│   ├── tiny.js             ← integração com API Tiny ERP
│   ├── agent.js            ← lógica do agente (Claude AI)
│   ├── geo.js              ← análise geográfica e potencial de cidades
│   └── notifications.js    ← WhatsApp / email
│
├── prompts/
│   ├── system.md           ← prompt do sistema do agente
│   ├── analysis.md         ← prompt para análise comercial
│   └── geo_potential.md    ← prompt para potencial por cidade
│
└── dashboard/
    └── index.html          ← painel visual (serve via Express)
```

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Servidor | Node.js + Express |
| IA / Agente | Claude claude-sonnet-4-20250514 (Anthropic API) |
| Dados de vendas | Tiny ERP API v2 |
| Dados geográficos | IBGE API (população, PIB por cidade) |
| Notificações | Evolution API (WhatsApp) + Nodemailer (email) |
| Deploy | Railway.app (recomendado) ou Render.com |

---

## Deploy Rápido (Railway)

1. Crie conta em railway.app
2. Novo projeto → "Deploy from GitHub"
3. Suba esta pasta no GitHub
4. Configure as variáveis do `.env`
5. Railway detecta o `package.json` e faz deploy automático

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```
TINY_TOKEN=seu_token_aqui
ANTHROPIC_API_KEY=sk-ant-...
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_chave
WHATSAPP_NUMBER=5531999999999
EMAIL_FROM=seuemail@gmail.com
EMAIL_PASS=sua_senha_app
EMAIL_TO=destinatario@email.com
PORT=3001
```
