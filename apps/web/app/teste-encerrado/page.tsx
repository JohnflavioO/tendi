import { redirect } from 'next/navigation';

// A tela de teste encerrado virou a página de assinatura (escolha do plano e pagamento).
export default function TrialEndedPage() {
  redirect('/assinatura');
}
