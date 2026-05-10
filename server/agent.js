const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Carrega o prompt do sistema
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/system.md'), 'utf-8'
);

// Histórico de conversa por sessão (em memória)
const sessoes = {};

function getHistorico(sessionId) {
  if (!sessoes[sessionId]) sessoes[sessionId] = [];
  return sessoes[sessionId];
}

function limparHistorico(sessionId) {
  sessoes[sessionId] = [];
}

// Pergunta ao agente em linguagem natural
async function perguntarAgente(pergunta, contexto, sessionId = 'default') {
  const historico = getHistorico(sessionId);

  // Contexto dos dados como parte da mensagem
  const mensagemCompleta = contexto
    ? `[DADOS ATUAIS DO TINY ERP]\n${JSON.stringify(contexto, null, 2)}\n\n[PERGUNTA]\n${pergunta}`
    : pergunta;

  historico.push({ role: 'user', content: mensagemCompleta });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: historico,
  });

  const resposta = response.content[0].text;
  historico.push({ role: 'assistant', content: resposta });

  // Mantém histórico com no máximo 20 mensagens
  if (historico.length > 20) sessoes[sessionId] = historico.slice(-20);

  return resposta;
}

// Gera relatório completo do período
async function gerarRelatorio(analise, periodo) {
  const prompt = `Com base nos dados de vendas dos últimos ${periodo} dias, gere um relatório executivo completo no seguinte formato:

1. **Resumo executivo** (3-4 linhas)
2. **Destaques positivos** (o que está indo bem)
3. **Pontos de atenção** (o que precisa de ação)
4. **Top oportunidades comerciais** (cidades ou segmentos para atacar)
5. **Ações recomendadas para esta semana** (lista objetiva)

Dados: ${JSON.stringify(analise, null, 2)}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// Analisa potencial de expansão por cidade
async function analisarExpansao(cidadesComPotencial) {
  const prompt = `Analise estas cidades onde a Cuiido já vende vs o potencial estimado de mercado. 
Identifique: (1) onde estamos abaixo do potencial e devemos intensificar, (2) cidades adjacentes para prospectar, (3) estratégia comercial recomendada.

Dados: ${JSON.stringify(cidadesComPotencial, null, 2)}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { perguntarAgente, gerarRelatorio, analisarExpansao, limparHistorico };
