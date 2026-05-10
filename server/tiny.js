const https = require('https');

const TOKEN = (process.env.TINY_TOKEN || '').trim();

function tinyGet(endpoint, params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ token: TOKEN, formato: 'json', ...params }).toString();
    const options = {
      hostname: 'api.tiny.com.br',
      path: `/api2/${endpoint}.php/?${qs}`,
      method: 'GET',
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Resposta inválida do Tiny')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function dateStr(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

async function buscarPedidos(dias = 30) {
  const hoje = new Date();
  const ini = new Date(hoje - dias * 86400000);
  let todos = [], pagina = 1, continua = true;

  while (continua) {
    const r = await tinyGet('pedidos.pesquisa', {
      dataInicial: dateStr(ini),
      dataFinal: dateStr(hoje),
      pagina
    }).catch(() => null);
    if (!r) break;
    const lista = r.retorno?.pedidos || [];
    const arr = Array.isArray(lista) ? lista.map(x => x.pedido) : (lista.pedido ? [lista.pedido] : []);
    todos = todos.concat(arr.filter(Boolean));
    continua = arr.length >= 100;
    pagina++;
    if (pagina > 10) break;
  }
  return todos;
}

async function buscarPedidoDetalhe(id) {
  const r = await tinyGet('pedido.obter', { id }).catch(() => null);
  return r?.retorno?.pedido || null;
}

async function buscarClientes(pagina = 1) {
  const r = await tinyGet('contatos.pesquisa', { pagina }).catch(() => null);
  return r?.retorno?.contatos || [];
}

// Analisa os pedidos e extrai métricas estruturadas
function analisarPedidos(pedidos) {
  const hoje = new Date();
  let faturamento = 0;
  const porCanal = { ecommerce: 0, distribuidor: 0, barbearia: 0, outros: 0 };
  const porEstado = {}, porCidade = {}, porVendedor = {};
  const clientes = {}, produtos = {};

  pedidos.forEach(p => {
    const v = parseFloat(p.valor || 0);
    faturamento += v;

    // Canal
    const canal = canalDe(p);
    porCanal[canal] = (porCanal[canal] || 0) + v;

    // Estado e cidade
    const estado = p.uf || p.estado || 'Desconhecido';
    const cidade = p.cidade || 'Desconhecida';
    porEstado[estado] = (porEstado[estado] || 0) + v;
    const cidadeKey = `${cidade} - ${estado}`;
    if (!porCidade[cidadeKey]) porCidade[cidadeKey] = { total: 0, pedidos: 0, estado };
    porCidade[cidadeKey].total += v;
    porCidade[cidadeKey].pedidos++;

    // Vendedor
    const vendedor = p.vendedor || p.nome_vendedor || 'Sem vendedor';
    if (!porVendedor[vendedor]) porVendedor[vendedor] = { total: 0, pedidos: 0 };
    porVendedor[vendedor].total += v;
    porVendedor[vendedor].pedidos++;

    // Clientes
    const nomeCliente = p.cliente || p.nome_fantasia || 'Desconhecido';
    if (!clientes[nomeCliente]) clientes[nomeCliente] = { total: 0, pedidos: 0, canal, ultima: null, cidade, estado };
    clientes[nomeCliente].total += v;
    clientes[nomeCliente].pedidos++;
    const dt = p.data_pedido ? new Date(p.data_pedido.split('/').reverse().join('-')) : null;
    if (dt && (!clientes[nomeCliente].ultima || dt > clientes[nomeCliente].ultima)) clientes[nomeCliente].ultima = dt;

    // Produtos
    const itens = p.itens?.item ? (Array.isArray(p.itens.item) ? p.itens.item : [p.itens.item]) : [];
    itens.forEach(it => {
      const k = it.descricao || it.nome || 'Produto';
      if (!produtos[k]) produtos[k] = { qtd: 0, receita: 0, canal };
      produtos[k].qtd += parseInt(it.quantidade || 1);
      produtos[k].receita += parseFloat(it.valor_unitario || 0) * parseInt(it.quantidade || 1);
    });
  });

  const ticket = pedidos.length ? faturamento / pedidos.length : 0;
  const novos = Object.values(clientes).filter(c => c.pedidos === 1).length;
  const recorrentes = Object.values(clientes).filter(c => c.pedidos > 1).length;
  const churn = Object.entries(clientes)
    .filter(([_, c]) => c.ultima && (hoje - c.ultima) / 86400000 > 45 && c.pedidos > 1)
    .map(([nome, c]) => ({ nome, ...c }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  return {
    faturamento, ticket, pedidosTotal: pedidos.length,
    porCanal, porEstado, porCidade, porVendedor,
    clientes, produtos, novos, recorrentes, churn,
    topCidades: Object.entries(porCidade).sort((a,b) => b[1].total - a[1].total).slice(0, 20),
    topEstados: Object.entries(porEstado).sort((a,b) => b[1] - a[1]),
    topVendedores: Object.entries(porVendedor).sort((a,b) => b[1].total - a[1].total),
    topProdutos: Object.entries(produtos).map(([n,d]) => ({nome:n,...d})).sort((a,b) => b.receita - a.receita).slice(0,10),
  };
}

function canalDe(p) {
  if (p.numero_ecommerce) return 'ecommerce';
  const nome = (p.cliente || p.nome_fantasia || p.nome_cliente || '').toLowerCase();
  const ehBarbearia = /\b(barbearia|barber|cabeleireiro|cabelereiro)\b/.test(nome)
    || /\b(ltda|me|eireli)\b/.test(nome);
  if (ehBarbearia) return 'barbearia';
  if (parseFloat(p.valor || 0) > 5000) return 'distribuidor';
  return 'outros';
}

async function enriquecerComItens(pedidos) {
  const top20 = [...pedidos]
    .sort((a, b) => parseFloat(b.valor || 0) - parseFloat(a.valor || 0))
    .slice(0, 20);
  await Promise.all(top20.map(async (p) => {
    if (!p.id) return;
    const detalhe = await buscarPedidoDetalhe(p.id);
    if (detalhe?.itens) p.itens = detalhe.itens;
  }));
  return pedidos;
}

module.exports = { buscarPedidos, buscarPedidoDetalhe, buscarClientes, analisarPedidos, enriquecerComItens };
