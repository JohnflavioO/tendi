'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, Building2, Check, Clock3, Loader2, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTrialDays } from '@/lib/use-trial-days';
import { rememberPendingSignupEmail } from '@/lib/pending-signup';
import { trialDaysLabel } from '@/lib/trial';

type Plan = {
  code: string;
  name: string;
  description: string;
  max_attendants: number;
  max_teams: number | null;
  ai_enabled: boolean;
  boleto_second_copy_enabled: boolean;
  monthly_price: number | null;
  ai_monthly_replies: number | null;
};

export default function RegisterPage() {
  const router = useRouter();
  const trialLabel = trialDaysLabel(useTrialDays());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planCode, setPlanCode] = useState('tendi_start');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadPlans() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('subscription_plans')
        .select('code,name,description,max_attendants,max_teams,ai_enabled,boleto_second_copy_enabled,monthly_price,ai_monthly_replies')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (queryError) setError('Não foi possível carregar os planos. Tente novamente em instantes.');
      const available = (data ?? []) as Plan[];
      setPlans(available);
      // Veio de "Começar teste grátis" de um plano no site: já deixa esse plano escolhido.
      const requested = new URLSearchParams(window.location.search).get('plano');
      if (requested && available.some(plan => plan.code === requested)) setPlanCode(requested);
      else if (available.length && !available.some(plan => plan.code === planCode)) setPlanCode(available[0].code);
      setLoadingPlans(false);
    }
    void loadPlans();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (fullName.trim().length < 3) throw new Error('Informe seu nome completo.');
      if (organizationName.trim().length < 2) throw new Error('Informe o nome da empresa.');
      if (!plans.some(plan => plan.code === planCode)) throw new Error('Selecione um plano disponível.');

      const supabase = createClient() as any;
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            organization_name: organizationName.trim(),
            plan_code: planCode,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signupError) throw signupError;

      if (data.session) {
        const { error: provisionError } = await supabase.rpc('provision_customer_workspace', {
          p_organization_name: organizationName.trim(),
          p_plan_code: planCode,
        });
        if (provisionError) throw provisionError;
        router.replace('/inbox?welcome=1');
        router.refresh();
        return;
      }

      // O Supabase não revela se o e-mail já existe: devolve um usuário sem identidades e não envia nada.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('Este e-mail já possui cadastro. Entre com sua senha ou use outro e-mail.');
      }

      // Sem sessão, falta confirmar o e-mail: leva para a tela própria de confirmação.
      rememberPendingSignupEmail(email.trim().toLowerCase());
      router.replace('/register/confirmar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F7FB] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/login" className="flex items-center gap-3">
            <img src="/brand/tendidesk-logo.png" alt="TendiDesk" width="1291" height="640" className="h-11 w-auto object-contain" />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-[#004751] hover:underline">Já tenho uma conta</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[.9fr_1.1fr] lg:py-16">
        <section className="flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#CB0A9F]">Comece gratuitamente</p>
          <h1 className="mt-3 max-w-lg text-4xl font-bold leading-tight text-[#25275B] sm:text-5xl">Seu atendimento organizado começa aqui.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-500">Crie seu ambiente, escolha o plano e experimente o TendiDesk por {trialLabel}. Sem cartão de crédito e sem cobrança automática.</p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-600"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Clock3 size={18}/></span>{trialLabel} de teste gratuito</div>
            <div className="flex items-center gap-3 text-sm text-slate-600"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Bot size={18}/></span>Agente de IA que responde no WhatsApp nos dois planos</div>
            <div className="flex items-center gap-3 text-sm text-slate-600"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Users size={18}/></span>Comece com sua equipe e amplie quando precisar</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7">
            <p className="text-sm font-semibold text-[#004751]">Cadastro da empresa</p>
            <h2 className="mt-2 text-2xl font-bold text-[#25275B]">Crie sua conta TendiDesk</h2>
            <p className="mt-2 text-sm text-slate-500">Preencha os dados para preparar seu ambiente de atendimento.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-slate-700">Seu nome completo</label>
              <input id="fullName" required minLength={3} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="Ex.: Maria Silva"/>
            </div>
            <div>
              <label htmlFor="organizationName" className="mb-2 block text-sm font-medium text-slate-700">Nome da empresa ou operação</label>
              <input id="organizationName" required minLength={2} maxLength={100} autoComplete="organization" value={organizationName} onChange={e => setOrganizationName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="Ex.: Aurora Studio"/>
            </div>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">E-mail de acesso</label>
              <input id="email" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="voce@empresa.com"/>
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Crie uma senha</label>
              <input id="password" required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="Mínimo de 8 caracteres"/>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between"><label className="text-sm font-semibold text-slate-700">Escolha seu plano</label><span className="text-xs text-slate-400">Pode mudar depois</span></div>
              {loadingPlans ? <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 className="animate-spin" size={16}/> Carregando planos...</div> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {plans.map(plan => <button key={plan.code} type="button" onClick={() => setPlanCode(plan.code)} className={`rounded-xl border p-4 text-left transition ${planCode === plan.code ? 'border-[#004751] bg-[#004751]/[.04] ring-2 ring-[#004751]/10' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-center justify-between"><span className="font-bold text-[#25275B]">{plan.name}</span>{planCode === plan.code && <Check className="text-[#00856A]" size={17}/>}</div>
                    {plan.monthly_price ? <p className="mt-1 text-sm font-semibold text-[#25275B]">{Number(plan.monthly_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<span className="text-xs font-normal text-slate-400">/mês após o teste</span></p> : null}
                    <p className="mt-2 text-xs leading-5 text-slate-500">Até {plan.max_attendants} usuários{plan.max_teams ? ` · ${plan.max_teams} setores` : ''}</p>
                    <p className="mt-1 text-xs text-slate-500">{plan.ai_monthly_replies ? `IA no WhatsApp: ${Number(plan.ai_monthly_replies).toLocaleString('pt-BR')} respostas/mês` : 'Atendimento com IA'}</p>
                  </button>)}
                </div>
              )}
            </div>

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button disabled={submitting || loadingPlans || plans.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3.5 font-semibold text-white transition hover:bg-[#003943] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <Loader2 className="animate-spin" size={18}/> : <>Criar conta e iniciar teste grátis <ArrowRight size={18}/></>}
            </button>
            <p className="text-center text-xs leading-5 text-slate-400">Ao continuar, você concorda em receber comunicações essenciais sobre sua conta. Nenhum cartão será solicitado e nenhuma cobrança será realizada durante o cadastro.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
