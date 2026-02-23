import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de admin: exige header X-Admin-Key ou Authorization: Bearer <key>
 * igual a process.env.ADMIN_API_KEY. Se ADMIN_API_KEY não estiver configurada,
 * considera admin desabilitado (401). Se a chave não bater, 401.
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
    const expected = process.env.ADMIN_API_KEY?.trim();
    if (!expected) {
        res.status(401).json({ error: 'Administração desabilitada: ADMIN_API_KEY não configurada.', code: 'ADMIN_DISABLED' });
        return;
    }
    const headerKey = (req.headers['x-admin-key'] as string)?.trim();
    const bearer = (req.headers.authorization as string)?.trim();
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
    const provided = headerKey || token;
    if (!provided || provided !== expected) {
        res.status(401).json({ error: 'Chave de administração inválida.', code: 'ADMIN_UNAUTHORIZED' });
        return;
    }
    next();
}
