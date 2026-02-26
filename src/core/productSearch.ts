/**
 * Busca flexível de produtos por texto: normaliza tokens (ex.: "CP-II" e "cp 2" compatíveis)
 * para melhorar a experiência quando o usuário digita "cimento cp 2", "50kg", etc.
 */

/**
 * Normaliza texto para tokens de busca: minúsculas, hífens/barras viram espaço, split por espaços.
 * Ex.: "Cimento CP-II 50kg" -> ["cimento", "cp", "ii", "50kg"]; "cp 2" -> ["cp", "2"].
 */
export function searchTokens(s: string): string[] {
    const t = (s || '')
        .toLowerCase()
        .replace(/[-/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return t ? t.split(' ').filter(Boolean) : [];
}

/**
 * Verifica se o produto (nome + sku) atende à busca.
 * Cada token da busca deve aparecer no texto do produto; "2" equivale a "ii" (ex.: CP-II).
 */
export function productMatchesSearch(busca: string, nome: string, sku: string): boolean {
    if (!busca || !busca.trim()) return true;
    const tokens = searchTokens(busca);
    const productText = searchTokens([nome, sku].filter(Boolean).join(' ')).join(' ');
    const productTokens = new Set(searchTokens([nome, sku].filter(Boolean).join(' ')));
    for (const t of tokens) {
        const inProduct = productTokens.has(t) || productText.includes(t);
        const twoMatchesIi = t === '2' && (productTokens.has('ii') || productText.includes('ii'));
        if (!inProduct && !twoMatchesIi) return false;
    }
    return true;
}
