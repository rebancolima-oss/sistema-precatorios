// api/datajud.js - API Intermediária para DataJud
// Esta função roda como Serverless na Vercel

module.exports = async (req, res) => {
    // ===== CORS HEADERS =====
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // ===== PREFLIGHT =====
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ===== APENAS POST =====
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    try {
        // ===== PARÂMETROS =====
        const { documento, tribunal } = req.body;

        console.log('📝 Documento:', documento);
        console.log('🏛️ Tribunal:', tribunal);

        // ===== VALIDAÇÕES =====
        if (!documento) {
            return res.status(400).json({ error: 'Documento é obrigatório' });
        }

        if (!tribunal) {
            return res.status(400).json({ error: 'Tribunal é obrigatório' });
        }

        // ===== MAPEAMENTO DOS ENDPOINTS =====
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

        console.log('🌐 Endpoint:', endpoint);

        // ===== MONTA O PAYLOAD =====
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

        // Se for CNPJ (14 dígitos), adiciona busca específica
        if (documento.length === 14) {
            payload.query.bool.should.push(
                { match: { "partes.cnpj": documento } },
                { match: { "cnpj": documento } }
            );
        }

        console.log('📤 Payload:', JSON.stringify(payload, null, 2));

        // ===== CHAMA A API DO DATJUD =====
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `APIKey ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('📥 Status do DataJud:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro do DataJud:', errorText);
            return res.status(response.status).json({
                error: `Erro ao consultar DataJud: ${response.status}`,
                detalhe: errorText.substring(0, 200)
            });
        }

        const data = await response.json();
        console.log('✅ Resposta do DataJud recebida!');

        // ===== PROCESSA OS RESULTADOS =====
        const processos = processarResultados(data, documento);

        // ===== RETORNA PARA O FRONTEND =====
        return res.status(200).json({
            success: true,
            total: processos.length,
            processos: processos
        });

    } catch (error) {
        console.error('❌ ERRO NA API:', error);
        return res.status(500).json({
            error: 'Erro interno na API',
            mensagem: error.message
        });
    }
};

// =============================================================
//  FUNÇÕES AUXILIARES
// =============================================================

function processarResultados(data, documento) {
    const processos = [];

    if (!data.hits || !data.hits.hits || data.hits.hits.length === 0) {
        return processos;
    }

    data.hits.hits.forEach(hit => {
        const source = hit._source || {};

        // Verifica se o documento está no processo
        const temDocumento = verificarDocumentoNoProcesso(source, documento);
        if (!temDocumento) return;

        // Identifica se é precatório
        const isPrecatorio = verificarPrecatorio(source);

        const processo = {
            numero: source.numeroProcesso || 'N/A',
            classe: source.classe?.nome || source.classe || 'N/A',
            assunto: source.assunto?.nome || source.assunto || 'N/A',
            dataAjuizamento: source.dataAjuizamento || 'N/A',
            orgao: source.orgaoJulgador?.nome || source.orgaoJulgador || 'N/A',
            valor: formatarValor(source.valorAcao || source.valor || 0),
            status: source.status || 'N/A',
            tipo: isPrecatorio ? 'Precatório' : 'RPV',
            partes: [],
            movimentacoes: []
        };

        // Extrai partes
        if (source.partes && Array.isArray(source.partes)) {
            source.partes.forEach(parte => {
                processo.partes.push({
                    nome: parte.nome || parte.nomeCompleto || 'N/A',
                    tipo: parte.tipo || parte.tipoParte || 'N/A',
                    documento: parte.cpfOuCnpj || parte.cpfCnpj || parte.cpf || parte.cnpj || ''
                });
            });
        }

        // Extrai movimentações recentes
        if (source.movimentacoes && Array.isArray(source.movimentacoes)) {
            processo.movimentacoes = source.movimentacoes.slice(0, 5).map(mov => ({
                data: mov.data || mov.dataMovimentacao || 'N/A',
                descricao: mov.descricao || mov.texto || 'N/A'
            }));
        }

        processos.push(processo);
    });

    return processos;
}

function verificarDocumentoNoProcesso(source, documento) {
    const campos = ['cpfOuCnpj', 'cpfCnpj', 'cpfParte', 'cpf', 'cnpj'];
    for (const campo of campos) {
        if (source[campo] && String(source[campo]).includes(documento)) return true;
    }
    if (source.partes) {
        for (const parte of source.partes) {
            const docParte = parte.cpfOuCnpj || parte.cpfCnpj || parte.cpf || parte.cnpj || '';
            if (String(docParte).includes(documento)) return true;
        }
    }
    return false;
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

function formatarValor(valor) {
    if (!valor || valor === 'N/A') return 'N/A';
    const num = parseFloat(valor);
    if (isNaN(num)) return String(valor);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(num);
}