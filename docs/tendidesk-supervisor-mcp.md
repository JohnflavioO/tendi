# TendiDesk Supervisor — MCP remoto

## Escopo do piloto

- Organização fixa: Tendi (slug `tendi`).
- ID: `637a9d9f-f621-4462-8445-dc3d2fd48304`.
- Acesso somente de leitura.
- Nenhuma ferramenta recebe `organization_id` como argumento.
- O agente não recebe o corpo das mensagens, telefones ou e-mails dos contatos.

## Variáveis de ambiente

Configurar no ambiente de deploy do TendiDesk, sem gravar valores no repositório:

- `TENDI_MCP_TOKEN`: segredo aleatório forte, com pelo menos 32 bytes.
- `TENDI_MCP_ORGANIZATION_ID`: `637a9d9f-f621-4462-8445-dc3d2fd48304`.
- `SUPABASE_SERVICE_ROLE_KEY`: chave de serviço do projeto Supabase Tendi.
- `NEXT_PUBLIC_SUPABASE_URL`: URL do mesmo projeto Supabase.

A rota falha fechada se a variável de organização não corresponder ao ID fixado no código. O token é validado como Bearer antes de o handler MCP processar a requisição.

## Ferramentas expostas

1. `resumo_operacional`: indicadores agregados por período (1–30 dias).
2. `listar_pendencias`: conversas abertas cuja última mensagem foi recebida (inbound), com limite máximo de 50; sem texto da mensagem ou dados de contato sensíveis.
3. `analisar_distribuicao`: conversas abertas/fechadas por atendente.
4. `analisar_canais`: volume de conversas por canal e status.

Todas as consultas usam o ID fixo da organização e são executadas no servidor.

## Conexão no Nod

Depois do deploy com as variáveis configuradas, adicionar um servidor MCP remoto via Streamable HTTP:

- URL: `https://<domínio-do-tendidesk>/api/mcp`
- Autenticação: Bearer token
- Token: valor de `TENDI_MCP_TOKEN`

Não colocar o token em mensagens ou no repositório. Rotacionar o segredo no ambiente de deploy e no Nod se houver suspeita de exposição.

## Validação antes de produção

- Executar typecheck, lint, testes e build.
- Testar chamada sem token (deve retornar 401).
- Testar inicialização MCP e listagem das quatro ferramentas.
- Testar cada ferramenta e confirmar que somente a organização Tendi é consultada.
- Não aplicar migrations nem alterar RLS para este piloto.
