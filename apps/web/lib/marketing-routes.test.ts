import { describe, expect, it } from 'vitest';
import { isPublicMarketingPath } from './marketing-routes';

describe('rotas públicas de marketing', () => {
  it.each(['/', '/privacidade', '/termos', '/sitemap.xml', '/robots.txt', '/opengraph-image', '/_next/static/app.js', '/_next/image'])('permite %s sem autenticação', path => {
    expect(isPublicMarketingPath(path)).toBe(true);
  });
  it.each(['/inbox', '/admin', '/login', '/register', '/crm'])('não classifica %s como rota pública de marketing', path => {
    expect(isPublicMarketingPath(path)).toBe(false);
  });
});
