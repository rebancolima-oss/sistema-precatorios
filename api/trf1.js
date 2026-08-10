// api/trf1.js - Consulta TRF1 (Brasília/DF)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            message: 'API TRF1 - Consulta de precatórios',
            tribunal: 'TRF1 - 1ª Região',
            status: 'online'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    try {
        const { documento, tipo = 'CPF' } = req.body;

        if (!documento) {
            return res.status(400).json({ error: 'Documento é obrigatório' });
        }

        const API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        const endpoint = 'https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search';

        const payload = {
            query: {
                bool: {
                    should: [
                        { match: { "partes.cpfOuCnpj": documento } },
                        { match: { "partes.cpfCnpj": documento } },
                        { match: { "cpfParte": documento } },
                        { match: { "partes.cpf": documento } },
                        { match: { "cpf": documento } }
                    ],
                    minimum_should_match: 1
                }
            },
            size: 50
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
            return res.status(response.status).json({
                error: `Erro no DataJud TRF1: ${response.status}`,
                detalhe: errorText.substring(0, 200)
            });
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
                    valor: source.valorAcao || source.valor || 'N/A',
                    status: source.status || 'N/A',
                    tipo: isPrecatorio ? 'Precatório' : 'RPV',
                    partes: (source.partes || []).map(p => ({
                        nome: p.nome || p.nomeCompleto || 'N/A',
                        tipo: p.tipo || 'N/A',
                        documento: p.cpfOuCnpj || p.cpfCnpj || p.cpf || ''
                    })),
                    movimentacoes: (source.movimentacoes || []).slice(0, 5).map(m => ({
                        data: m.data || 'N/A',
                        descricao: m.descricao || m.texto || 'N/A'
                    }))
                });
            });
        }

        return res.status(200).json({
            success: true,
            tribunal: 'TRF1 - 1ª Região',
            total: processos.length,
            processos: processos
        });

    } catch (error) {
        console.error('❌ Erro TRF1:', error);
        return res.status(500).json({
            error: 'Erro interno TRF1',
            mensagem: error.message
        });
    }
}

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
