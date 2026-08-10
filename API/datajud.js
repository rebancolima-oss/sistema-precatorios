// api/datajud.js
// ============================================================
//  VERSÃO QUE FUNCIONA NA VERCEL
// ============================================================

export default async function handler(req, res) {
    // ===== CORS =====
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // ===== PREFLIGHT =====
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ===== TESTE GET =====
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            message: '🚀 API do DataJud está funcionando!',
            metodo: 'GET',
            versao: '1.0.0'
        });
    }

    // ===== APENAS POST =====
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    try {
        const { documento, tribunal } = req.body;

        console.log('📝 Documento:', documento);
        console.log('🏛️ Tribunal:', tribunal);

        if (!documento || !tribunal) {
            return res.status(400).json({ error: 'Documento e tribunal são obrigatórios' });
        }

        // ===== ENDPOINTS =====
        const ENDPOINTS = {
            trf1: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search',
            trf2: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf2/_search',
            trf3: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search',
            trf4: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf4/_search',
            trf5: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf5/_search',
            trf6: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf6/_search'
        };

        const API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
        const endpoint = ENDPOINTS[tribunal];

        if (!endpoint) {
            return res.status(400).json({ error: 'Tribunal inválido' });
        }

        // ===== PAYLOAD =====
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

        if (documento.length === 14) {
            payload.query.bool.should.push(
                { match: { "partes.cnpj": documento } },
                { match: { "cnpj": documento } }
            );
        }

        // ===== CHAMA DATJUD =====
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
                error: `Erro no DataJud: ${response.status}`,
                detalhe: errorText.substring(0, 200)
            });
        }

        const data = await response.json();

        // ===== PROCESSA RESULTADOS =====
        const processos = [];

        if (data.hits && data.hits.hits) {
            data.hits.hits.forEach(hit => {
                const source = hit._source || {};
                processos.push({
                    numero: source.numeroProcesso || 'N/A',
                    classe: source.classe?.nome || source.classe || 'N/A',
                    assunto: source.assunto?.nome || source.assunto || 'N/A',
                    dataAjuizamento: source.dataAjuizamento || 'N/A',
                    orgao: source.orgaoJulgador?.nome || source.orgaoJulgador || 'N/A',
                    valor: source.valorAcao || source.valor || 'N/A',
                    status: source.status || 'N/A',
                    tipo: source.tipo || 'Precatório/RPV',
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
            total: processos.length,
            processos: processos
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        return res.status(500).json({
            error: 'Erro interno',
            mensagem: error.message
        });
    }
}
