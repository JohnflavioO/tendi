import { LEGAL_PROSE } from '@/components/marketing/legal-prose';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/brand';

export const metadata = {
  title: 'Exclusão de dados | TendiDesk',
  description: 'Como pedir a exclusão dos seus dados no TendiDesk, inclusive os recebidos pelo Instagram e pelo Messenger.',
};

const subject = encodeURIComponent('Exclusão de dados');

export default function DataDeletionPage() {
  return <article className="mx-auto max-w-3xl px-5 py-16 md:px-6 md:py-24">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Privacidade</p>
    <h1 className="mt-4 text-4xl font-bold text-[#25275B]">Exclusão de dados</h1>
    <p className="mt-5 text-sm leading-7 text-slate-500">Veja como apagar os dados tratados pelo TendiDesk, inclusive os recebidos pelo Instagram e pelo Messenger. Mais detalhes na <Link href="/privacidade" className="font-semibold text-[#3E3A8C] underline">Política de Privacidade</Link>.</p>

    <div className={LEGAL_PROSE}>
      <h2>Se você é uma empresa que usa o TendiDesk</h2>
      <h3>Desconectar o Instagram ou o Messenger</h3>
      <ol>
        <li>No TendiDesk, abra <strong>Conexões</strong> e clique em <strong>Desconectar</strong> no Instagram ou no Messenger. O token de acesso da Meta é apagado na hora.</li>
        <li>Se quiser, remova também o app no Facebook: <strong>Configurações e privacidade → Configurações → Integrações comerciais</strong>, escolha o TendiDesk e clique em <strong>Remover</strong>.</li>
      </ol>
      <h3>Apagar a conta e todos os dados</h3>
      <p>Envie um e-mail para <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>{SUPPORT_EMAIL}</a> a partir do e-mail do dono da conta, com o assunto <strong>“Exclusão de dados”</strong> e o nome da empresa. Apagamos a conta, a equipe, os contatos, as conversas (de todos os canais), o CRM, a agenda e as conexões.</p>

      <h2>Se você conversou com uma empresa pelo TendiDesk</h2>
      <p>Seus dados (nome, contato e mensagens) pertencem à empresa com quem você conversou. Você pode pedir a exclusão diretamente a ela, ou escrever para <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>{SUPPORT_EMAIL}</a> informando:</p>
      <ul>
        <li>o nome da empresa com quem conversou;</li>
        <li>o canal usado (WhatsApp, Instagram, Messenger ou chat do site);</li>
        <li>o seu telefone, e-mail ou nome de usuário no Instagram/Facebook, para localizarmos a conversa.</li>
      </ul>
      <p>Encaminhamos o pedido à empresa responsável e, quando cabível, apagamos o contato e as mensagens.</p>

      <h2>Prazo e confirmação</h2>
      <p>Confirmamos o recebimento e concluímos a exclusão em até <strong>15 dias</strong>. Podemos manter apenas o que a lei exige guardar (por exemplo, registros fiscais), pelo prazo legal, sem uso para outra finalidade.</p>
    </div>
  </article>;
}
