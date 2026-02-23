/**
 * Entry point para a Vercel Serverless Function.
 * Re-exporta o app Express para que a Vercel o execute como função serverless.
 */
import { app } from '../src/mock/server';

export default app;
