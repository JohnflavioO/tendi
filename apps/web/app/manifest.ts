import type { MetadataRoute } from 'next';

/** Manifesto do app instalável (PWA): ícone na tela inicial, abre sem a barra do navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/inbox',
    name: 'TendiDesk',
    short_name: 'TendiDesk',
    description: 'Atendimento no WhatsApp, CRM e Agente de IA para a sua equipe.',
    lang: 'pt-BR',
    start_url: '/inbox?origem=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F6FB',
    theme_color: '#2F316B',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Inbox', url: '/inbox', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Agenda', url: '/agenda', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'CRM', url: '/crm', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
