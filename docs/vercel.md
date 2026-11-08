# Deploy do frontend na Vercel — Tendi

## Monorepo e configuração

- Repositório: `JohnFlavioO/tendi`
- Root Directory: `apps/web`
- Framework: Next.js
- Node.js: 22.x
- Package manager: pnpm 10.17.1 (executado explicitamente via npx no build da Vercel)
- Workspace e lockfile: ficam na raiz do monorepo.

A configuração de instalação e build no projeto Vercel é:

```bash
# Install Command (executado a partir de apps/web)
cd ../.. && rm -rf node_modules/.pnpm && npx --yes pnpm@10.17.1 install --no-frozen-lockfile

# Build Command
cd ../.. && npx --yes pnpm@10.17.1 --filter @tendi/web build
```

O cache antigo `node_modules/.pnpm` é removido durante a instalação para evitar reutilizar metadados incompatíveis. O uso explícito do pnpm evita depender da versão global pré-instalada no ambiente de build.

Habilite **Include source files outside of the Root Directory**, pois `packages/shared` e os manifests do workspace estão na raiz.

A branch `main` é a produção. Pull requests devem ser validados em Preview antes do merge.

## Variáveis de ambiente

| Variável | Preview | Production | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `mock` | `mock` | Fonte de dados enquanto a integração real não estiver validada. |
| `NEXT_PUBLIC_API_URL` | vazio | vazio | URL base da API quando a etapa de backend estiver pronta. |
| `NEXT_PUBLIC_APP_NAME` | `Tendi` | `Tendi` | Nome exibido no frontend. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Tendi | URL do projeto Tendi | Endpoint público do Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable | Chave publishable | Chave pública; nunca usar service role no navegador. |

Não cadastre segredos no frontend. Service role, tokens Meta e credenciais de serviços ficam exclusivamente no backend.

## Troca para API (futura etapa)

Após a API estar publicada e validada, configure por ambiente:

- `NEXT_PUBLIC_DATA_MODE=api`
- `NEXT_PUBLIC_API_URL=https://api.[DOMINIO]`
- `NEXT_PUBLIC_APP_NAME=Tendi`

O webhook da Meta deverá apontar diretamente para a API de backend, não para a Vercel.


## Verificação contínua

O workflow `.github/workflows/quality.yml` executa em Pull Requests para `main`:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- Build de `@tendi/web` sem variáveis públicas do Supabase.
- Build de `@tendi/web` com valores públicos de teste do Supabase.

O repositório ainda não contém `pnpm-lock.yaml`; por isso, enquanto o lockfile não for versionado, o workflow instala com `pnpm install --no-frozen-lockfile`. A instalação não deve ser considerada reproduzível até a inclusão e validação do lockfile.
