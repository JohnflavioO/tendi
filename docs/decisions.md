# Decisões técnicas

## 2026-11-08 — Fase 0A

- Marca do produto: **Tendi**.
- O frontend será a única aplicação desta fase com deploy na Vercel.
- `NEXT_PUBLIC_DATA_MODE` controla a fonte de dados; o padrão é `mock`.
- O backend será Fastify (em vez de NestJS) pela menor sobrecarga e adequação a endpoints de webhook e fila; contratos compartilhados seguem em Zod.
- O realtime é consumido por interface, permitindo trocar o mock por Socket.IO futuramente.
- Não iniciar backend, worker, bancos, Redis, n8n, integração Meta ou IA nesta fase.
- Repositório informado como vazio foi encontrado público e com `main` não protegida. Manter a implementação em branch e registrar a necessidade de tornar privado e proteger `main` nas configurações do GitHub.
