const nodemailer = require('nodemailer');
const axios = require('axios');

// ── WhatsApp via Evolution API ──────────────────────────
async function enviarWhatsApp(mensagem, numero) {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const dest = numero || process.env.WHATSAPP_NUMBER;

  if (!url || !key || !dest) {
    console.log('[WhatsApp] Não configurado — pulando envio');
    return false;
  }

  try {
    await axios.post(`${url}/message/sendText/cuiido`, {
      number: dest,
      textMessage: { text: mensagem },
    }, {
      headers: { apikey: key, 'Content-Type': 'application/json' }
    });
    console.log(`[WhatsApp] Mensagem enviada para ${dest}`);
    return true;
  } catch (e) {
    console.error('[WhatsApp] Erro:', e.message);
    return false;
  }
}

// ── Email via Gmail ─────────────────────────────────────
async function enviarEmail(assunto, corpo, destinatario) {
  const from = process.env.EMAIL_FROM;
  const pass = process.env.EMAIL_PASS;
  const to = destinatario || process.env.EMAIL_TO;

  if (!from || !pass || !to) {
    console.log('[Email] Não configurado — pulando envio');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass },
  });

  try {
    await transporter.sendMail({
      from: `Cuiido Agent <${from}>`,
      to,
      subject: assunto,
      html: corpo.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
      text: corpo,
    });
    console.log(`[Email] Enviado para ${to}`);
    return true;
  } catch (e) {
    console.error('[Email] Erro:', e.message);
    return false;
  }
}

// ── Alerta de churn ─────────────────────────────────────
async function alertaChurn(clientes) {
  if (!clientes.length) return;

  const lista = clientes.slice(0, 5).map(c =>
    `• ${c.nome} — ${c.pedidos} pedidos, último há ${Math.round((new Date() - c.ultima) / 86400000)} dias`
  ).join('\n');

  const msg = `⚠️ *Cuiido — Alerta de Churn*\n\n${clientes.length} clientes sem comprar há mais de 45 dias:\n\n${lista}\n\nAcesse o painel para ver todos.`;

  await enviarWhatsApp(msg);
  await enviarEmail(
    `⚠️ Cuiido: ${clientes.length} clientes em risco de churn`,
    msg
  );
}

// ── Relatório diário ────────────────────────────────────
async function relatorioDiario(relatorio) {
  const msg = `📊 *Relatório Diário Cuiido*\n\n${relatorio}`;
  await enviarWhatsApp(msg);
  await enviarEmail('📊 Cuiido — Relatório Diário', relatorio);
}

module.exports = { enviarWhatsApp, enviarEmail, alertaChurn, relatorioDiario };
