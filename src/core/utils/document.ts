/**
 * Validates and normalizes a Brazilian CPF or CNPJ document.
 * Strips all non-numeric characters.
 */
export function normalizeDocument(doc: string): string {
    return doc.replace(/\D/g, '');
}

/**
 * Checks if a CNPJ string (digits only) is structurally valid.
 * Validates length and check digits algorithm.
 */
export function isValidCNPJ(cnpj: string): boolean {
    const normalized = normalizeDocument(cnpj);

    if (normalized.length !== 14) return false;
    if (/^(\d)\1+$/.test(normalized)) return false; // All same digits

    const calcDigit = (nums: string, weights: number[]): number => {
        const sum = nums
            .split('')
            .reduce((acc, n, i) => acc + parseInt(n) * weights[i], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const d1 = calcDigit(normalized.slice(0, 12), weights1);
    const d2 = calcDigit(normalized.slice(0, 13), weights2);

    return d1 === parseInt(normalized[12]) && d2 === parseInt(normalized[13]);
}

/**
 * Checks if a CPF string (digits only) is structurally valid.
 */
export function isValidCPF(cpf: string): boolean {
    const normalized = normalizeDocument(cpf);

    if (normalized.length !== 11) return false;
    if (/^(\d)\1+$/.test(normalized)) return false;

    const calcDigit = (nums: string, length: number): number => {
        let sum = 0;
        for (let i = 0; i < length; i++) {
            sum += parseInt(nums[i]) * (length + 1 - i);
        }
        const remainder = (sum * 10) % 11;
        return remainder >= 10 ? 0 : remainder;
    };

    const d1 = calcDigit(normalized, 9);
    const d2 = calcDigit(normalized, 10);

    return d1 === parseInt(normalized[9]) && d2 === parseInt(normalized[10]);
}

/**
 * Determines if a document string is a CPF or CNPJ.
 */
export function getDocumentType(doc: string): 'cpf' | 'cnpj' | 'invalid' {
    const digits = normalizeDocument(doc);
    if (digits.length === 11) return 'cpf';
    if (digits.length === 14) return 'cnpj';
    return 'invalid';
}
