import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Inter: tipografia de interface usada pelos principais produtos SaaS; carregada pelo Next (sem pedido externo no navegador).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = { title: 'Tendi — Atendimento e CRM', description: 'Atendimento inteligente e CRM conversacional para sua equipe.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable}><body>{children}</body></html>;
}
