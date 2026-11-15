import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

// Inter: tipografia de interface usada pelos principais produtos SaaS; carregada pelo Next (sem pedido externo no navegador).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'TendiDesk — Atendimento e CRM',
  description: 'Atendimento inteligente e CRM conversacional para sua equipe.',
  applicationName: 'TendiDesk',
  // iPhone: "Adicionar à Tela de Início" abre como app, com nome e ícone próprios.
  appleWebApp: { capable: true, title: 'TendiDesk', statusBarStyle: 'default' },
  // Favicon declarado aqui: com 'icons' nos metadados, o Next ignora app/icon.png (por isso a aba ficava sem ícone).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Conteúdo até as bordas do iPhone (notch e barra inferior); o espaço seguro é tratado no CSS.
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable}><body>{children}<PwaRegister /></body></html>;
}
