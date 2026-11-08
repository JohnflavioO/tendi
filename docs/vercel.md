# Deploy do frontend na Vercel — Tendi

## Conectar o repositório

1. Importe `JohnflavioO/tendi` no painel da Vercel.
2. Configure **Root Directory** como `apps/web`.
3. Framework preset: **Next.js**.
4. Configure o comando de instalação como `pnpm install --frozen-lockfile` (a Vercel pode instalar pela raiz do monorepo; mantenha o lockfile na raiz).
5. Build command: `pnpm --filter @tendi/web build`.
6. A branch `main` é a produção; branches e PRs geram Preview Deployments.

> Observação: o Root Directory pode precisar de **Include source files outside of the Root Directory** habilitado, pois o workspace e `packages/shared` ficam na raiz do monorepo.

## Variáveis de ambiente

| Variável | Preview | Production | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `mock` | `mock` | Fonte de dados. Use `api` somente após a Etapa B. |
| `NEXT_PUBLIC_API_URL` | vazio ou URL de ambiente de teste | vazio até a Etapa B | URL base da API quando DATA_MODE=api. |
| `NEXT_PUBLIC_APP_NAME` | `Tendi` | `Tendi` | Nome exibido no frontend. |

Não cadastre segredos no frontend. Tokens, segredos Meta e credenciais de serviços ficam exclusivamente no backend.

## Troca para API (futura Etapa B)

Após a API estar publicada e validada na VPS, configure em Preview e Production conforme o ambiente:

- `NEXT_PUBLIC_DATA_MODE=api`
- `NEXT_PUBLIC_API_URL=https://api.[DOMINIO]`
- `NEXT_PUBLIC_APP_NAME=Tendi`

Faça redeploy. O webhook da Meta deverá apontar diretamente para a API na VPS, nunca para a Vercel.
