import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Tendi — Atendimento e CRM', description: 'Atendimento inteligente e CRM conversacional para sua equipe.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
