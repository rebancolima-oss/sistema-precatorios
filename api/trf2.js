// api/trf2.js - VERSÃO SIMPLIFICADA
exports.handler = async function(event, context) {
    // CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Responde OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Responde GET com status da API
    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'API TRF2 - Consulta de precatórios',
                tribunal: 'TRF2 - 1ª Região',
                status: 'online',
                data: new Date().toISOString()
            })
        };
    }

    // Apenas POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Use POST' })
        };
    }

    try {
        // Parse do body
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

        console.log(`📝 TRF2 - Consultando documento: ${documento}`);

        // ===== CONSULTA DIRETA AO DATJUD =====
        const API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        const endpoint = 'https://api-publica.datajud.cnj.jus.br/api_publica_trf2/_search';

        // Payload simplificado
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

        console.log('📤 Enviando requisição para DataJud TRF2...');

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `APIKey ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`📥 Status DataJud TRF2: ${response.status}`);

        // Se a resposta não for OK
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro DataJud TRF2:', errorText);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: `Erro no DataJud TRF2: ${response.status}`,
                    detalhe: errorText.substring(0, 200)
                })
            };
        }

        // Parse da resposta
        const data = await response.json();
        console.log(`✅ DataJud TRF2 respondeu! Hits: ${data.hits?.total?.value || 0}`);

        // Processa os resultados
        const processos = [];
        if (data.hits && data.hits.hits) {
            data.hits.hits.forEach(hit => {
                const source = hit._source || {};
                
                // Determina se é precatório
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

        // Retorna sucesso
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                tribunal: 'TRF2 - 1ª Região',
                total: processos.length,
                processos: processos
            })
        };

    } catch (error) {
        console.error('❌ ERRO TRF2:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Erro interno TRF2',
                mensagem: error.message
            })
        };
    }
};

// ===== FUNÇÕES AUXILIARES =====

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
