import { LEGAL_PROSE } from '@/components/marketing/legal-prose';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/brand';

export const metadata = {
  title: 'Política de Privacidade | TendiDesk',
  description: 'Como o TendiDesk trata dados de empresas, equipes e clientes atendidos pelo WhatsApp, Instagram, Messenger e chat do site.',
};

const UPDATED_AT = '15 de novembro de 2026';

export default function PrivacyPage() {
  return <article className="mx-auto max-w-3xl px-5 py-16 md:px-6 md:py-24">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#CB0A9F]">Atualizada em {UPDATED_AT}</p>
    <h1 className="mt-4 text-4xl font-bold text-[#25275B]">Política de Privacidade</h1>
    <p className="mt-5 text-sm leading-7 text-slate-500">Esta política explica quais dados o TendiDesk trata, para quê, com quem compartilha e como você pode pedir acesso, correção ou exclusão, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD).</p>

    <div className={LEGAL_PROSE}>
      <h2>1. Quem somos e papéis</h2>
      <p>O TendiDesk é uma plataforma de atendimento e CRM para empresas. Para os dados de cadastro das empresas clientes e das pessoas da equipe, o TendiDesk é o <strong>controlador</strong>. Para os dados dos clientes finais atendidos por cada empresa (contatos e conversas), a empresa cliente é a <strong>controladora</strong> e o TendiDesk atua como <strong>operador</strong>, tratando esses dados apenas para prestar o serviço contratado.</p>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li><strong>Conta e equipe:</strong> nome, e-mail, telefone, empresa, papel na equipe e registros de acesso.</li>
        <li><strong>Assinatura:</strong> plano, situação do pagamento e dados de cobrança. Os dados de cartão são tratados pelo processador de pagamentos, não pelo TendiDesk.</li>
        <li><strong>Contatos e conversas:</strong> nome, telefone, e-mail, etiquetas, mensagens, áudios, imagens e documentos trocados nos canais que a empresa conecta, além de oportunidades no CRM e compromissos na agenda.</li>
        <li><strong>Chat do site:</strong> nome, telefone e e-mail informados pelo visitante, e as mensagens enviadas pelo widget.</li>
        <li><strong>Dados técnicos:</strong> endereço IP, navegador e registros de erro, para segurança e funcionamento.</li>
      </ul>

      <h2>3. Instagram e Messenger (Meta)</h2>
      <p>Quando uma empresa conecta sua conta profissional do Instagram ou sua Página do Facebook ao TendiDesk, usando o login da Meta, tratamos:</p>
      <ul>
        <li>o identificador da Página do Facebook e da conta do Instagram e o nome de usuário da conta;</li>
        <li>o token de acesso da Página, guardado de forma criptografada e usado apenas para receber e enviar mensagens em nome da empresa;</li>
        <li>as mensagens recebidas e enviadas pela conta (texto e anexos) e o identificador de cada pessoa que escreve, fornecido pela Meta para aquela conta.</li>
      </ul>
      <p>Esses dados são usados <strong>somente</strong> para mostrar as conversas no Inbox da empresa, permitir que a equipe e o agente de IA respondam e manter o histórico do atendimento. Não usamos dados da Meta para publicidade, não os vendemos e não os compartilhamos com terceiros além do necessário para prestar o serviço. Não publicamos conteúdo nem lemos comentários, curtidas ou seguidores.</p>
      <p>A empresa pode desconectar o Instagram ou o Messenger a qualquer momento em <em>Conexões</em> no TendiDesk, ou remover o app nas configurações de <em>Integrações comerciais</em> do Facebook. Ao desconectar, o token de acesso é apagado.</p>

      <h2>4. Agente de IA</h2>
      <p>Se a empresa ativar o agente de IA, as mensagens da conversa e as informações que a empresa cadastrou sobre o próprio negócio são enviadas a um provedor de inteligência artificial para gerar a resposta. O provedor processa os dados apenas para devolver a resposta e não os usa para treinar seus modelos, conforme os termos de uso da API contratada.</p>

      <h2>5. Para que usamos os dados</h2>
      <ul>
        <li>prestar o serviço: Inbox, CRM, agenda, equipe, chat do site e agente de IA;</li>
        <li>cobrança e gestão da assinatura;</li>
        <li>suporte, segurança, prevenção de fraude e melhoria do serviço;</li>
        <li>cumprimento de obrigações legais e regulatórias.</li>
      </ul>
      <p>As bases legais são a execução do contrato, o cumprimento de obrigação legal e o legítimo interesse, e, quando aplicável, o consentimento.</p>

      <h2>6. Com quem compartilhamos</h2>
      <p>Somente com fornecedores necessários ao serviço, que tratam os dados conforme nossas instruções: hospedagem e banco de dados em nuvem, envio de e-mails, processamento de pagamentos, provedores de inteligência artificial (quando o agente está ativo) e os próprios canais conectados pela empresa (WhatsApp e Meta). Alguns desses fornecedores podem armazenar dados fora do Brasil, com as garantias previstas na LGPD. Também podemos compartilhar dados quando exigido por lei ou ordem de autoridade.</p>

      <h2>7. Por quanto tempo guardamos</h2>
      <p>Mantemos os dados enquanto a conta da empresa estiver ativa. Depois do cancelamento, os dados são excluídos ou anonimizados, exceto o que precisarmos guardar para cumprir obrigações legais (por exemplo, registros fiscais e de acesso pelo prazo exigido em lei).</p>

      <h2>8. Segurança</h2>
      <p>Usamos conexão criptografada (HTTPS), controle de acesso por empresa e por papel na equipe, e guardamos tokens de acesso de forma criptografada. Cada empresa só acessa os próprios dados.</p>

      <h2>9. Seus direitos e exclusão de dados</h2>
      <p>Você pode pedir confirmação de tratamento, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, e revogar consentimentos. Se você é cliente de uma empresa que usa o TendiDesk, também pode fazer o pedido diretamente a essa empresa.</p>
      <p>Veja o passo a passo em <Link href="/exclusao-de-dados">Exclusão de dados</Link> ou escreva para <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Respondemos em até 15 dias.</p>

      <h2>10. Cookies</h2>
      <p>Usamos cookies essenciais para manter você conectado e para a segurança da plataforma. Não usamos cookies de publicidade.</p>

      <h2>11. Alterações e contato</h2>
      <p>Podemos atualizar esta política. A data da última atualização aparece no topo. Dúvidas sobre privacidade: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </div>
  </article>;
}
