import { isValidCNPJ, isValidCPF, getDocumentType, normalizeDocument } from '../core/utils/document';

describe('document utils', () => {

    // ──────────────────────────────── normalizeDocument ─────────────────────
    describe('normalizeDocument', () => {
        it('removes formatting from CNPJ', () => {
            expect(normalizeDocument('12.345.678/0001-90')).toBe('12345678000190');
        });

        it('removes formatting from CPF', () => {
            expect(normalizeDocument('123.456.789-09')).toBe('12345678909');
        });

        it('returns pure digits unchanged', () => {
            expect(normalizeDocument('12345678000190')).toBe('12345678000190');
        });
    });

    // ──────────────────────────────── isValidCNPJ ───────────────────────────
    describe('isValidCNPJ', () => {
        // CNPJ 11.222.333/0001-81 é matematicamente validado pelo algoritmo brasileiro
        it('validates a known valid CNPJ', () => {
            expect(isValidCNPJ('11222333000181')).toBe(true);
        });

        it('validates formatted CNPJ', () => {
            expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
        });

        it('rejects CNPJ with wrong length', () => {
            expect(isValidCNPJ('1234567800019')).toBe(false);
        });

        it('rejects all-same-digit CNPJ (00000000000000)', () => {
            expect(isValidCNPJ('00000000000000')).toBe(false);
        });

        it('rejects CNPJ with invalid check digits', () => {
            expect(isValidCNPJ('12345678000191')).toBe(false);
        });

        it('rejects empty string', () => {
            expect(isValidCNPJ('')).toBe(false);
        });
    });

    // ──────────────────────────────── isValidCPF ────────────────────────────
    describe('isValidCPF', () => {
        it('validates a known valid CPF', () => {
            expect(isValidCPF('529.982.247-25')).toBe(true);
        });

        it('rejects CPF with wrong length', () => {
            expect(isValidCPF('1234567890')).toBe(false);
        });

        it('rejects all-same-digit CPF (11111111111)', () => {
            expect(isValidCPF('11111111111')).toBe(false);
        });

        it('rejects CPF with invalid check digits', () => {
            expect(isValidCPF('529.982.247-26')).toBe(false);
        });
    });

    // ──────────────────────────────── getDocumentType ───────────────────────
    describe('getDocumentType', () => {
        it('identifies CNPJ (14 digits)', () => {
            expect(getDocumentType('12345678000190')).toBe('cnpj');
        });

        it('identifies CPF (11 digits)', () => {
            expect(getDocumentType('52998224725')).toBe('cpf');
        });

        it('returns invalid for unknown length', () => {
            expect(getDocumentType('12345')).toBe('invalid');
        });

        it('identifies formatted CNPJ', () => {
            expect(getDocumentType('12.345.678/0001-90')).toBe('cnpj');
        });
    });
});
