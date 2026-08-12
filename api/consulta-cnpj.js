// api/consulta-cnpj.js - Consulta CNPJ via APIs gratuitas
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
                message: 'API de consulta de CNPJ',
                fontes: ['CNQuest (gratuito 100/mês)', 'Receita Federal']
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
        const { cnpj } = JSON.parse(event.body);

        if (!cnpj) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'CNPJ é obrigatório' })
            };
        }

        const cnpjLimpo = cnpj.replace(/\D/g, '');
        if (cnpjLimpo.length !== 14) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'CNPJ inválido (deve ter 14 dígitos)' })
            };
        }

        console.log(`🔍 Consultando CNPJ: ${cnpjLimpo}`);

        // ===== TENTA SCRAPING DA RECEITA FEDERAL =====
        try {
            const receitaData = await consultarReceitaCNPJ(cnpjLimpo);
            if (receitaData) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        fonte: 'Receita Federal',
                        dados: receitaData
                    })
                };
            }
        } catch (error) {
            console.error('❌ Erro na Receita Federal:', error.message);
        }

        // ===== FONTE: Dados simulados (fallback) =====
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                fonte: 'Dados Públicos (simulado)',
                dados: {
                    cnpj: cnpjLimpo,
                    nome: 'Nome não encontrado nas bases públicas',
                    situacao: 'Consulta apenas via DataJud',
                    mensagem: 'Para dados completos, utilize um CNPJ com processos'
                },
                aviso: 'Os dados cadastrais podem não estar disponíveis via APIs gratuitas'
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

// ===== FUNÇÃO PARA SCRAPING DA RECEITA FEDERAL (CNPJ) =====
async function consultarReceitaCNPJ(cnpj) {
    try {
        const url = 'https://www.receita.fazenda.gov.br/PessoaJuridica/CNPJ/cnpjreva/cnpjreva_solicitacao2.asp';
        const payload = new URLSearchParams({
            'cnpj': cnpj,
            'txtTexto_cnpj': 'Consultar'
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: payload
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        if (html.includes(cnpj)) {
            return {
                cnpj: cnpj,
                dados: extrairDadosReceitaCNPJ(html)
            };
        }

        return null;
    } catch (error) {
        console.error('Erro no scraping da Receita:', error);
        return null;
    }
}

function extrairDadosReceitaCNPJ(html) {
    const dados = {};

    // Nome Empresarial
    const nomeMatch = html.match(/Nome Empresarial.*?<[^>]*>(.*?)</);
    if (nomeMatch) dados.nome = nomeMatch[1].trim();

    // Situação
    const sitMatch = html.match(/Situação.*?<[^>]*>(.*?)</);
    if (sitMatch) dados.situacao = sitMatch[1].trim();

    // Atividade Principal
    const cnaeMatch = html.match(/Atividade Principal.*?<[^>]*>(.*?)</);
    if (cnaeMatch) dados.atividade = cnaeMatch[1].trim();

    return dados;
}
