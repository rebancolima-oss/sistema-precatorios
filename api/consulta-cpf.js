// api/consulta.js - API ÚNICA para todos os TRFs
exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'API de consulta de precatórios',
                version: '1.0.0',
                tribunais: ['TRF1', 'TRF2', 'TRF3', 'TRF4', 'TRF5', 'TRF6']
            })
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Use POST' })
        };
    }

    try {
        const { documento, tribunal, tipo = 'CPF' } = JSON.parse(event.body);

        if (!documento) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Documento é obrigatório' })
            };
        }

        if (!tribunal) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Tribunal é obrigatório' })
            };
        }

        const API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        
        const endpoints = {
            trf1: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search',
            trf2: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf2/_search',
            trf3: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search',
            trf4: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf4/_search',
            trf5: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf5/_search',
            trf6: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf6/_search'
        };

        const endpoint = endpoints[tribunal];
        if (!endpoint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Tribunal inválido' })
            };
        }

        const payload = {
            query: {
                bool: {
                    should: [
                        { match: { "partes.cpfOuCnpj": documento } },
                        { match: { "partes.cpfCnpj": documento } },
                        { match: { "cpfParte": documento } }
                    ],
                    minimum_should_match: 1
                }
            },
            size: 20
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `APIKey ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    tribunal: `${tribunal.toUpperCase()} - ${tribunal.replace('trf', '').toUpperCase()}ª Região`,
                    total: 0,
                    processos: [],
                    aviso: `DataJud ${tribunal.toUpperCase()} indisponível (${response.status})`
                })
            };
        }

        const data = await response.json();
        const processos = [];

        if (data.hits && data.hits.hits) {
            data.hits.hits.forEach(hit => {
                const source = hit._source || {};
                const isPrecatorio = verificarPrecatorio(source);
                processos.push({
                    numero: source.numeroProcesso || 'N/A',
                    classe: source.classe?.nome || source.classe || 'N/A',
                    assunto: source.assunto?.nome || source.assunto || 'N/A',
                    dataAjuizamento: source.dataAjuizamento || 'N/A',
                    orgao: source.orgaoJulgador?.nome || source.orgaoJulgador || 'N/A',
                    valor: formatarValor(source.valorAcao || source.valor || 0),
                    status: source.status || 'N/A',
                    tipo: isPrecatorio ? 'Precatório' : 'RPV',
                    partes: (source.partes || []).map(p => ({
                        nome: p.nome || p.nomeCompleto || 'N/A',
                        tipo: p.tipo || 'N/A',
                        documento: p.cpfOuCnpj || p.cpfCnpj || p.cpf || ''
                    })),
                    movimentacoes: (source.movimentacoes || []).slice(0, 3).map(m => ({
                        data: m.data || 'N/A',
                        descricao: m.descricao || m.texto || 'N/A'
                    }))
                });
            });
        }

        const nomeTribunal = {
            trf1: 'TRF1 - 1ª Região',
            trf2: 'TRF2 - 2ª Região',
            trf3: 'TRF3 - 3ª Região',
            trf4: 'TRF4 - 4ª Região',
            trf5: 'TRF5 - 5ª Região',
            trf6: 'TRF6 - 6ª Região'
        }[tribunal] || tribunal.toUpperCase();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                tribunal: nomeTribunal,
                total: processos.length,
                processos: processos
            })
        };

    } catch (error) {
        console.error('❌ ERRO:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Erro interno',
                mensagem: error.message
            })
        };
    }
};

function verificarPrecatorio(source) {
    const termos = ['precatório', 'precatorio', 'requisição de pequeno valor', 'rpv'];
    const campos = [
        source.assunto?.nome || source.assunto || '',
        source.classe?.nome || source.classe || '',
        source.tipo || '',
        source.natureza || ''
    ];
    const texto = campos.join(' ').toLowerCase();
    return termos.some(t => texto.includes(t));
}

function formatarValor(valor) {
    if (!valor || valor === 'N/A' || valor === 0) return 'N/A';
    const num = parseFloat(valor);
    if (isNaN(num)) return String(valor);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(num);
}
