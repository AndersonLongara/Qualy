/**
 * Masks a CPF/CNPJ for logging purposes.
 * Security requirement per ARCHITECTURE.md section 2.
 * Example: maskDocument('12345678000190') returns '12.345.678/****-**'
 */
export function maskDocument(doc: string): string {
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 14) {
        // CNPJ: 12.345.678/****-**
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`;
    }
    if (digits.length === 11) {
        // CPF: ***.123.***-**
        return `***.${digits.slice(3, 6)}.***-**`;
    }
    return '***';
}

/**
 * Formats a raw numeric document string as Brazilian CNPJ or CPF.
 * @example formatDocument('12345678000190') => '12.345.678/0001-90'
 */
export function formatDocument(doc: string): string {
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 14) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
    }
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
    }
    return doc;
}

/**
 * Formats a monetary value to Brazilian Real currency string.
 * @example formatCurrency(1500) => 'R$ 1.500,00'
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

/**
 * Formats a date string (YYYY-MM-DD) to Brazilian format (DD/MM/YYYY).
 */
export function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}
