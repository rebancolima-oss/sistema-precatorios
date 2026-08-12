// api/consulta-cpf.js - Consulta CPF via APIs gratuitas
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
                message: 'API de consulta de CPF',
                fontes: ['Receita Federal', 'ConsultaCPF (gratuito)']
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
        const { cpf } = JSON.parse(event.body);

        if (!cpf) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'CPF é obrigatório' })
            };
        }

        const cpfLimpo = cpf.replace(/\D/g, '');
        if (cpfLimpo.length !== 11) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'CPF inválido (deve ter 11 dígitos)' })
            };
        }

        console.log(`🔍 Consultando CPF: ${cpfLimpo}`);

        // ===== TENTA SCRAPING DA RECEITA FEDERAL =====
        try {
            const receitaData = await consultarReceitaCPF(cpfLimpo);
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
                    cpf: cpfLimpo,
                    nome: 'Nome não encontrado nas bases públicas',
                    situacao: 'Consulta apenas via DataJud',
                    mensagem: 'Para dados completos, utilize um CPF com processos'
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

// ===== FUNÇÃO PARA SCRAPING DA RECEITA FEDERAL =====
async function consultarReceitaCPF(cpf) {
    try {
        const url = 'https://www2.receita.fazenda.gov.br/Sistemas/ATSPO/consSintegra.asp';
        const payload = new URLSearchParams({
            'nm_cpfcnpj': cpf,
            'btnConsultar': 'Consultar'
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

        if (html.includes('Situação')) {
            return {
                cpf: cpf,
                dados: extrairDadosReceita(html)
            };
        }

        return null;
    } catch (error) {
        console.error('Erro no scraping da Receita:', error);
        return null;
    }
}

function extrairDadosReceita(html) {
    const dados = {};

    // Nome
    const nomeMatch = html.match(/<b>Nome<\/b>.*?<[^>]*>(.*?)</);
    if (nomeMatch) dados.nome = nomeMatch[1].trim();

    // Situação
    const sitMatch = html.match(/Situação.*?<[^>]*>(.*?)</);
    if (sitMatch) dados.situacao = sitMatch[1].trim();

    return dados;
}
