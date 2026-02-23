import { maskDocument, formatDocument, formatCurrency, formatDate } from '../core/utils/format';

describe('format utils', () => {

    // ──────────────────────────────── maskDocument ──────────────────────────
    describe('maskDocument', () => {
        it('masks CNPJ correctly (security requirement)', () => {
            const masked = maskDocument('12345678000190');
            expect(masked).toBe('12.345.678/****-**');
            expect(masked).not.toContain('0001'); // hiddes last digits
        });

        it('masks CPF correctly', () => {
            // CPF: 529.982.247-25 → digits[3..5] = '982' → '***.982.***-**'
            const masked = maskDocument('52998224725');
            expect(masked).toBe('***.982.***-**');
            expect(masked).not.toContain('52998224725'); // full CPF digits never exposed
            expect(masked).not.toContain('24725'); // last digits are hidden
        });

        it('returns *** for unrecognized length', () => {
            expect(maskDocument('12345')).toBe('***');
        });

        it('masks formatted CNPJ', () => {
            expect(maskDocument('12.345.678/0001-90')).toBe('12.345.678/****-**');
        });
    });

    // ──────────────────────────────── formatDocument ────────────────────────
    describe('formatDocument', () => {
        it('formats CNPJ digits to visual format', () => {
            expect(formatDocument('12345678000190')).toBe('12.345.678/0001-90');
        });

        it('formats CPF digits to visual format', () => {
            expect(formatDocument('52998224725')).toBe('529.982.247-25');
        });

        it('returns original string if not recognizable', () => {
            expect(formatDocument('12345')).toBe('12345');
        });
    });

    // ──────────────────────────────── formatCurrency ────────────────────────
    describe('formatCurrency', () => {
        it('formats 1500 as R$ 1.500,00', () => {
            const result = formatCurrency(1500);
            expect(result).toContain('1.500');
            expect(result).toContain('R$');
        });

        it('formats small value correctly', () => {
            const result = formatCurrency(29.90);
            expect(result).toContain('29,90');
        });

        it('formats zero value', () => {
            const result = formatCurrency(0);
            expect(result).toContain('0,00');
        });
    });

    // ──────────────────────────────── formatDate ────────────────────────────
    describe('formatDate', () => {
        it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
            expect(formatDate('2024-01-15')).toBe('15/01/2024');
        });

        it('handles month boundary correctly', () => {
            expect(formatDate('2024-12-31')).toBe('31/12/2024');
        });
    });
});
