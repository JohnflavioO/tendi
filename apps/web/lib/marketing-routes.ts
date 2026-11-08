export function isPublicMarketingPath(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/privacidade' ||
    pathname === '/termos' ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/opengraph-image' ||
    pathname.startsWith('/_next/');
}
