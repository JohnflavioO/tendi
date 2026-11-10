import type { Metadata } from 'next';
import { Clock3 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Teste gratuito encerrado · Tendi',
  robots: { index: false },
};

export default function TrialEndedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6 text-slate-800">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Clock3 size={28}/></span>
        <h1 className="mt-5 text-2xl font-bold text-[#25275B]">Seu teste gratuito terminou</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          O período de teste do seu workspace chegou ao fim. Suas conversas, contatos e configurações continuam guardados.
          Fale com a nossa equipe para ativar a assinatura e voltar a usar o Tendi.
        </p>
        <a
          href="mailto:suporte@tendi.app?subject=Quero%20assinar%20o%20Tendi"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#003943]"
        >
          Falar com o suporte
        </a>
        <form action="/auth/signout" method="post">
          <button className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Sair da conta
          </button>
        </form>
      </div>
    </main>
  );
}
