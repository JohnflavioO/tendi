import { describe, expect, it, vi } from 'vitest';
import { connectIntegration, disconnectIntegration, readIntegration, setIntegrationEnabled, testLookup, UPGRADE_MESSAGE } from './boleto-integration';
import { createBoletoService } from './boleto-server';
import { AsaasError } from './boleto-asaas';
import type { BoletoProvider } from './boleto';

// Banco em memória com só o que a tela de Integrações usa.
type Row = Record<string, any>;
function fakeDb(planCode = 'tendi_pro') {
  const t: Record<string, Row[]> = {
    organizations: [{ id: 'org1', plan_code: planCode }],
    subscription_plans: [{ code: 'tendi_pro', boleto_second_copy_enabled: true }, { code: 'tendi_start', boleto_second_copy_enabled: false }],
    billing_integrations: [],
  };
  const vault = new Map<string, string>();
  let n = 0;
  const from = (table: string) => {
    let mode = 'select'; let payload: any; const preds: Array<(r: Row) => boolean> = [];
    const run = () => {
      const rows = t[table]!;
      if (mode === 'upsert') {
        const existing = rows.find(r => r.organization_id === payload.organization_id && r.provider === payload.provider);
        const row = existing ? Object.assign(existing, payload) : { id: `int-${++n}`, ...payload };
        if (!existing) rows.push(row);
        return { data: [row], error: null };
      }
      const matched = rows.filter(r => preds.every(p => p(r)));
      if (mode === 'update') { matched.forEach(r => Object.assign(r, payload)); return { data: matched, error: null }; }
      if (mode === 'delete') { t[table] = rows.filter(r => !matched.includes(r)); return { data: null, error: null }; }
      return { data: matched, error: null };
    };
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (c: string, v: any) => { preds.push(r => r[c] === v); return q; },
      upsert: (row: Row) => { mode = 'upsert'; payload = row; return q; },
      update: (patch: Row) => { mode = 'update'; payload = patch; return q; },
      delete: () => { mode = 'delete'; return q; },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: null }; },
      single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: null }; },
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  };
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === 'set_billing_secret') { if (args.p_value) vault.set(args.p_integration_id, args.p_value); else vault.delete(args.p_integration_id); return { data: null, error: null }; }
    if (name === 'get_billing_secret') return { data: vault.get(args.p_integration_id) ?? null, error: null };
    return { data: null, error: { message: 'rpc desconhecida' } };
  });
  return { db: { from, rpc } as any, t, vault, rpc };
}

const KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDA';
function provider(over: Partial<BoletoProvider> = {}): BoletoProvider {
  return {
    id: 'asaas', label: 'Asaas',
    verify: vi.fn(async () => ({ environment: 'production' as const, accountLabel: 'Escola Alfa' })),
    findOpenBoletos: vi.fn(async () => [{ id: 'p1', amount: 100, dueDate: '2026-11-20', overdue: false, description: null, digitableLine: '1', pdfUrl: 'u', invoiceUrl: null }]),
    ...over,
  };
}

describe('integração de cobrança (tela Integrações)', () => {
  it('plano Start: mostra o convite para o Pro e não deixa conectar', async () => {
    const { db, vault } = fakeDb('tendi_start');
    expect((await readIntegration(db, 'org1')).body).toMatchObject({ planAllowed: false, integration: null });
    const result = await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => provider());
    expect(result).toEqual({ status: 403, body: { error: UPGRADE_MESSAGE } });
    expect(vault.size).toBe(0);
  });

  it('recusa texto que não é chave do Asaas sem chamar o provedor', async () => {
    const { db } = fakeDb();
    const p = provider();
    expect((await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: 'minha senha' }, () => p)).status).toBe(400);
    expect(p.verify).not.toHaveBeenCalled();
  });

  it('chave recusada pelo Asaas: nada é salvo', async () => {
    const { db, t, vault } = fakeDb();
    const p = provider({ verify: async () => { throw new AsaasError('x', 401); } });
    const result = await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => p);
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain('recusou a chave');
    expect(t.billing_integrations).toHaveLength(0);
    expect(vault.size).toBe(0);
  });

  it('conecta: a chave vai para o Vault e a tabela guarda só os 4 últimos caracteres', async () => {
    const { db, t, vault } = fakeDb();
    const result = await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: `  ${KEY}  ` }, () => provider());
    expect(result.status).toBe(200);
    const row = t.billing_integrations[0]!;
    expect(row).toMatchObject({ status: 'connected', key_hint: KEY.slice(-4), account_label: 'Escola Alfa', is_enabled: true });
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(vault.get(row.id)).toBe(KEY);
  });

  it('a Duda só enxerga a integração ligada de empresa Pro', async () => {
    const { db } = fakeDb();
    await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => provider());
    expect(await createBoletoService(db).available('org1')).toBe(true);
    await setIntegrationEnabled(db, 'org1', false);
    expect(await createBoletoService(db).available('org1')).toBe(false);
    const start = fakeDb('tendi_start');
    expect(await createBoletoService(start.db).available('org1')).toBe(false);
  });

  it('teste da tela: devolve o resumo com o documento mascarado', async () => {
    const { db } = fakeDb();
    await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => provider());
    expect((await testLookup(db, 'org1', '123', () => provider())).status).toBe(400);
    const result = await testLookup(db, 'org1', '529.982.247-25', () => provider());
    expect(result.body).toMatchObject({ document: 'CPF final 47-25', count: 1, boletos: [{ amount: 100, hasDigitableLine: true, hasPdf: true }] });
  });

  it('chave revogada no teste: marca a integração para a Duda parar', async () => {
    const { db, t } = fakeDb();
    await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => provider());
    const result = await testLookup(db, 'org1', '52998224725', () => provider({ findOpenBoletos: async () => { throw new AsaasError('x', 401); } }));
    expect(result.status).toBe(502);
    expect(t.billing_integrations[0]).toMatchObject({ status: 'error' });
    expect(await createBoletoService(db).available('org1')).toBe(false);
  });

  it('desconectar apaga a linha e a chave', async () => {
    const { db, t, vault } = fakeDb();
    await connectIntegration(db, 'org1', { provider: 'asaas', apiKey: KEY }, () => provider());
    expect((await disconnectIntegration(db, 'org1')).status).toBe(200);
    expect(t.billing_integrations).toHaveLength(0);
    expect(vault.size).toBe(0);
  });
});
