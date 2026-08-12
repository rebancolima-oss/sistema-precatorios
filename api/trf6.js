// api/trf6.js - VERSÃO CORRIGIDA
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
                message: 'API TRF6 - Consulta de precatórios',
                tribunal: 'TRF6 - 6ª Região',
                status: 'online'
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
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Body inválido' })
            };
        }

        const { documento, tipo = 'CPF' } = body;

        if (!documento) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Documento é obrigatório' })
            };
        }

        console.log(`📝 TRF6 - Consultando: ${documento}`);

        const API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        const endpoint = 'https://api-publica.datajud.cnj.jus.br/api_publica_trf6/_search';

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

        console.log(`🌐 TRF6 - Chamando DataJud...`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `APIKey ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`📥 TRF6 - Status DataJud: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ TRF6 - Erro DataJud: ${response.status}`, errorText);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    tribunal: 'TRF6 - 6ª Região',
                    total: 0,
                    processos: [],
                    aviso: `DataJud TRF6 indisponível no momento (${response.status})`
                })
            };
        }

        const data = await response.json();
        console.log(`✅ TRF6 - DataJud respondeu! Hits: ${data.hits?.total?.value || 0}`);

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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                tribunal: 'TRF6 - 6ª Região',
                total: processos.length,
                processos: processos
            })
        };

    } catch (error) {
        console.error('❌ ERRO TRF6:', error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                tribunal: 'TRF6 - 6ª Região',
                total: 0,
                processos: [],
                aviso: 'Erro interno no TRF6, tente novamente mais tarde'
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
