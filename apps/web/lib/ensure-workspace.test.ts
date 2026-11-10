import { describe, expect, it, vi } from 'vitest';
import { pendingWorkspaceFromUser, provisionPendingWorkspace } from './ensure-workspace';

const signupUser = { user_metadata: { full_name: 'Maria', organization_name: '  Aurora Studio ', plan_code: 'tendi_start' } };

describe('cadastro pendente de workspace', () => {
  it('lê empresa e plano guardados no cadastro', () => {
    expect(pendingWorkspaceFromUser(signupUser)).toEqual({ organizationName: 'Aurora Studio', planCode: 'tendi_start' });
  });

  it.each([
    null,
    undefined,
    {},
    { user_metadata: null },
    { user_metadata: { organization_name: 'Aurora' } },
    { user_metadata: { plan_code: 'tendi_start' } },
    { user_metadata: { organization_name: 'A', plan_code: 'tendi_start' } },
    { user_metadata: { organization_name: 42, plan_code: 'tendi_start' } },
  ])('ignora conta sem dados de cadastro público (%j)', user => {
    expect(pendingWorkspaceFromUser(user as never)).toBeNull();
  });
});

describe('criação do workspace pendente', () => {
  it('chama a função do banco com os dados do cadastro', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await expect(provisionPendingWorkspace({ rpc }, signupUser)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('provision_customer_workspace', {
      p_organization_name: 'Aurora Studio',
      p_plan_code: 'tendi_start',
    });
  });

  it('não chama o banco para contas convidadas ou admins', async () => {
    const rpc = vi.fn();
    await expect(provisionPendingWorkspace({ rpc }, { user_metadata: {} })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propaga o erro do banco', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'O plano selecionado não está disponível.' } });
    await expect(provisionPendingWorkspace({ rpc }, signupUser)).rejects.toThrow('O plano selecionado não está disponível.');
  });
});
