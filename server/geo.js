const axios = require('axios');

// Busca dados de população e PIB do IBGE
async function buscarDadosCidade(nomeCidade, uf) {
  try {
    // Busca município pelo nome
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios`;
    const { data: municipios } = await axios.get(url);
    const municipio = municipios.find(m =>
      normalizar(m.nome) === normalizar(nomeCidade) &&
      (!uf || m.microrregiao.mesorregiao.UF.sigla === uf.toUpperCase())
    );
    if (!municipio) return null;

    const codIbge = municipio.id;

    // Busca estimativa de população
    let populacao = null;
    try {
      const popUrl = `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2021/variaveis/9324?localidades=N6[${codIbge}]`;
      const { data: popData } = await axios.get(popUrl);
      populacao = parseInt(popData?.[0]?.resultados?.[0]?.series?.[0]?.serie?.['2021'] || 0);
    } catch {}

    return {
      nome: municipio.nome,
      uf: municipio.microrregiao.mesorregiao.UF.sigla,
      codIbge,
      populacao,
      regiao: municipio.microrregiao.mesorregiao.UF.regiao.nome,
    };
  } catch (e) {
    return null;
  }
}

// Estima o potencial de mercado de uma cidade para barbearias/cosméticos
function calcularPotencial(populacao) {
  if (!populacao) return null;

  // Estimativas baseadas em dados do setor de beleza masculino no Brasil
  // ~30% da população é homem adulto (15-65 anos)
  // ~60% desses frequentam barbearia regularmente
  // Ticket médio barbearia: R$ 35/mês
  // Cuiido foca em fornecimento para barbearias, não consumidor final
  // ~1 barbearia a cada 500 homens adultos = market size estimado

  const homensAdultos = Math.round(populacao * 0.30);
  const frequentadores = Math.round(homensAdultos * 0.60);
  const barbeariasEstimadas = Math.round(homensAdultos / 500);
  const potencialMensalBRL = barbeariasEstimadas * 350; // ticket médio por barbearia/mês para fornecedor

  let classificacao = 'Pequeno';
  if (barbeariasEstimadas > 500) classificacao = 'Grande';
  else if (barbeariasEstimadas > 100) classificacao = 'Médio';
  else if (barbeariasEstimadas > 30) classificacao = 'Relevante';

  return {
    populacao,
    homensAdultos,
    barbeariasEstimadas,
    potencialMensalBRL,
    classificacao,
  };
}

// Cruza cidades onde a Cuiido já vende com potencial estimado
function cruzarComVendas(topCidades, dadosGeo) {
  return topCidades.map(([cidadeKey, vendas]) => {
    const geo = dadosGeo[cidadeKey];
    const potencial = geo ? calcularPotencial(geo.populacao) : null;
    const penetracao = potencial ? Math.min(100, (vendas.total / potencial.potencialMensalBRL * 100)).toFixed(1) : null;
    return {
      cidade: cidadeKey,
      vendas: vendas.total,
      pedidos: vendas.pedidos,
      geo,
      potencial,
      penetracao,
      oportunidade: potencial ? potencial.potencialMensalBRL - vendas.total : null,
    };
  });
}

function normalizar(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

module.exports = { buscarDadosCidade, calcularPotencial, cruzarComVendas };
