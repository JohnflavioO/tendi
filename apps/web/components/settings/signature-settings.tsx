'use client';

import { useEffect, useState } from 'react';
import { Loader2, PenLine, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { AI_SUFFIX, DEFAULT_SIGNATURE, SIGNATURE_FORMATS, aiSigner, humanSigner, normalizeSignature, type SignatureSettings } from '@/lib/signature';

/**
 * Configuração da assinatura das mensagens no WhatsApp (nome em negrito no topo do balão do cliente).
 * Fica em channel_connections.settings.signature; só dono e administrador alteram (regra do banco).
 */
export function SignatureSettingsCard({ organizationId }: { organizationId: string }) {
  const { role } = useWorkspaceRole(organizationId);
  const canEdit = role === 'owner' || role === 'admin';
  const [connection, setConnection] = useState<{ id: string; settings: Record<string, unknown> } | null | undefined>(undefined);
  const [value, setValue] = useState<SignatureSettings>(DEFAULT_SIGNATURE);
  const [agentName, setAgentName] = useState('Assistente');
  const [myName, setMyName] = useState('Ana Souza');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const [{ data: auth }, { data: conn }, { data: agent }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('channel_connections').select('id,settings').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
        supabase.from('ai_agents').select('name').eq('organization_id', organizationId).maybeSingle(),
      ]);
      setConnection(conn ? { id: conn.id, settings: (conn.settings ?? {}) as Record<string, unknown> } : null);
      setValue(normalizeSignature(conn?.settings));
      if (agent?.name) setAgentName(agent.name);
      if (auth?.user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle();
        if (profile?.full_name) setMyName(profile.full_name);
      }
    })().catch(() => setConnection(null));
  }, [organizationId]);

  async function save() {
    if (!connection) return;
    setSaving(true); setMessage(null);
    const supabase = createClient() as any;
    const settings = { ...connection.settings, signature: value };
    const { error } = await supabase.from('channel_connections').update({ settings }).eq('id', connection.id).eq('organization_id', organizationId);
    setSaving(false);
    if (error) { setMessage({ ok: false, text: 'Não foi possível salvar. Só o dono e os administradores alteram a assinatura.' }); return; }
    setConnection({ ...connection, settings });
    setMessage({ ok: true, text: 'Assinatura salva. Vale para as próximas mensagens.' });
  }

  const human = humanSigner({ name: myName, team: 'Suporte', format: value.format });
  const ai = aiSigner(agentName, value.aiSuffix);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
    <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#E8F4F2] p-3 text-[#004751]"><PenLine size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Assinatura no WhatsApp</h2><p className="text-xs text-slate-400">O cliente vê em negrito, no topo da mensagem, quem respondeu: o atendente ou o agente de IA.</p></div></div>
    {connection === undefined ? <div className="grid h-24 place-items-center"><Loader2 className="animate-spin text-[#2F316B]" /></div>
      : connection === null ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Conecte o WhatsApp em Conexões para configurar a assinatura.</p>
      : <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={value.enabled} disabled={!canEdit} onChange={e => setValue(current => ({ ...current, enabled: e.target.checked }))} className="size-4 accent-[#004751]" />Assinar as mensagens com o nome de quem respondeu</label>
          <fieldset disabled={!canEdit || !value.enabled} className="space-y-2 disabled:opacity-50">
            <legend className="mb-1 text-xs font-semibold text-slate-600">Como mostrar o nome do atendente</legend>
            <div className="grid gap-2 sm:grid-cols-3">{SIGNATURE_FORMATS.map(format => <label key={format.value} className={value.format === format.value ? 'cursor-pointer rounded-xl border border-[#004751] bg-[#F3FAF9] p-3' : 'cursor-pointer rounded-xl border border-slate-200 p-3 hover:bg-slate-50'}><input type="radio" name="signature-format" className="sr-only" checked={value.format === format.value} onChange={() => setValue(current => ({ ...current, format: format.value }))} /><span className="block text-xs font-semibold text-slate-700">{format.label}</span><span className="block text-[11px] text-slate-500">{format.example}</span></label>)}</div>
            <p className="text-[11px] text-slate-400">“Nome e setor” usa o setor escolhido na conversa (ex.: Suporte, Comercial). Sem setor, mostra só o nome.</p>
            <label className="flex items-center gap-3 pt-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={value.aiSuffix} onChange={e => setValue(current => ({ ...current, aiSuffix: e.target.checked }))} className="size-4 accent-[#004751]" />Mostrar &quot;{AI_SUFFIX}&quot; junto do nome da IA</label>
          </fieldset>
          <p className="text-[11px] leading-5 text-slate-400">O nome do atendente vem do perfil dele (cada pessoa pode ajustar o próprio nome na caixa de mensagem do Inbox). O nome da IA ({agentName}) é definido na configuração do agente.</p>
          {canEdit ? <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar assinatura</button> : <p className="text-xs text-slate-500">Só o dono e os administradores alteram a assinatura.</p>}
          {message && <p role="status" className={message.ok ? 'text-xs text-emerald-700' : 'text-xs text-rose-600'}>{message.text}</p>}
        </div>

        <div aria-label="Prévia no WhatsApp do cliente" className="rounded-2xl bg-[#E9E3D9] p-4">
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[#5B6B63]">Como o cliente vê</p>
          <div className="space-y-2">
            <WhatsappBubble signer={value.enabled ? ai : ''} text="Olá! Posso ajudar com o seu pedido." />
            <WhatsappBubble signer={value.enabled ? human : ''} text="Oi, tudo bem? Vou cuidar do seu atendimento." />
          </div>
        </div>
      </div>}
  </section>;
}

function WhatsappBubble({ signer, text }: { signer: string; text: string }) {
  return <div className="ml-auto w-fit max-w-[90%] rounded-lg rounded-tr-none bg-[#D9FDD3] px-3 py-2 text-[13px] leading-5 text-[#111B21] shadow-sm">
    {signer && <p className="font-bold">{signer}:</p>}
    <p>{text}</p>
    <p className="mt-0.5 text-right text-[10px] text-[#667781]">20:30 <span className="text-[#53BDEB]">✓✓</span></p>
  </div>;
}
