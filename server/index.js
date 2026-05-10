require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const { buscarPedidos, analisarPedidos } = require('./tiny');
const { perguntarAgente, gerarRelatorio, analisarExpansao, limparHistorico } = require('./agent');
const { buscarDadosCidade, cruzarComVendas } = require('./geo');
const { alertaChurn, relatorioDiario } = require('./notifications');

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve o painel HTML ─────────────────────────────────
app.use(express.static(path.join(__dirname, '../dashboard')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// ── Health check ────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Cuiido Agent rodando!', version: '2.0.0' });
});

// ── Dados brutos do Tiny ────────────────────────────────
app.get('/pedidos', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias || '30');
    const pedidos = await buscarPedidos(dias);
    res.json({ ok: true, pedidos });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Análise processada ──────────────────────────────────
app.get('/analise', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias || '30');
    const pedidos = await buscarPedidos(dias);
    const analise = analisarPedidos(pedidos);
    res.json({ ok: true, analise, total: pedidos.length });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Agente: pergunta em linguagem natural ───────────────
app.post('/agente/perguntar', async (req, res) => {
  try {
    const { pergunta, dias = 30, sessionId = 'default' } = req.body;
    if (!pergunta) return res.status(400).json({ ok: false, msg: 'Informe a pergunta' });

    const pedidos = await buscarPedidos(dias);
    const analise = analisarPedidos(pedidos);
    const resposta = await perguntarAgente(pergunta, analise, sessionId);

    res.json({ ok: true, resposta });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Limpar histórico de conversa ────────────────────────
app.post('/agente/limpar', (req, res) => {
  const { sessionId = 'default' } = req.body;
  limparHistorico(sessionId);
  res.json({ ok: true, msg: 'Histórico limpo' });
});

// ── Relatório gerado pelo agente ────────────────────────
app.get('/agente/relatorio', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias || '30');
    const pedidos = await buscarPedidos(dias);
    const analise = analisarPedidos(pedidos);
    const relatorio = await gerarRelatorio(analise, dias);
    res.json({ ok: true, relatorio });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Análise de potencial por cidade ────────────────────
app.get('/agente/expansao', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias || '90');
    const pedidos = await buscarPedidos(dias);
    const analise = analisarPedidos(pedidos);

    // Busca dados geográficos das top cidades
    const dadosGeo = {};
    for (const [cidadeKey] of analise.topCidades.slice(0, 10)) {
      const [cidade, uf] = cidadeKey.split(' - ');
      const geo = await buscarDadosCidade(cidade, uf);
      if (geo) dadosGeo[cidadeKey] = geo;
    }

    const cidadesComPotencial = cruzarComVendas(analise.topCidades, dadosGeo);
    const analiseExpansao = await analisarExpansao(cidadesComPotencial);

    res.json({ ok: true, cidades: cidadesComPotencial, analise: analiseExpansao });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Enviar relatório manual por WhatsApp/email ──────────
app.post('/agente/enviar-relatorio', async (req, res) => {
  try {
    const dias = parseInt(req.body.dias || '7');
    const pedidos = await buscarPedidos(dias);
    const analise = analisarPedidos(pedidos);
    const relatorio = await gerarRelatorio(analise, dias);
    await relatorioDiario(relatorio);
    res.json({ ok: true, msg: 'Relatório enviado!' });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── CRON: relatório diário às 8h ────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Gerando relatório diário...');
  try {
    const pedidos = await buscarPedidos(7);
    const analise = analisarPedidos(pedidos);
    const relatorio = await gerarRelatorio(analise, 7);
    await relatorioDiario(relatorio);
    console.log('[CRON] Relatório enviado com sucesso');
  } catch (e) {
    console.error('[CRON] Erro:', e.message);
  }
}, { timezone: 'America/Sao_Paulo' });

// ── CRON: alerta de churn às 9h nas segundas ───────────
cron.schedule('0 9 * * 1', async () => {
  console.log('[CRON] Verificando churn...');
  try {
    const pedidos = await buscarPedidos(90);
    const analise = analisarPedidos(pedidos);
    if (analise.churn.length > 0) {
      await alertaChurn(analise.churn);
      console.log(`[CRON] Alerta de churn enviado: ${analise.churn.length} clientes`);
    }
  } catch (e) {
    console.error('[CRON] Erro churn:', e.message);
  }
}, { timezone: 'America/Sao_Paulo' });

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Cuiido Agent v2.0 rodando em http://localhost:${PORT}`);
  console.log(`   Painel:    http://localhost:${PORT}`);
  console.log(`   Agente:    POST http://localhost:${PORT}/agente/perguntar`);
  console.log(`   Expansão:  GET  http://localhost:${PORT}/agente/expansao`);
  console.log(`   Relatório: GET  http://localhost:${PORT}/agente/relatorio`);
});
