# Painel administrativo — estado de implantação

## Entregue
- `frontend/admin-panel.js`: painel restrito, verificação no Supabase, listagem de usuários, carteiras, reservas, extrato e auditoria, ajuste de créditos pago/bônus com confirmação e justificativa.
- Supabase `viralclip.ia` (`zltpldhnaqiqkoqdiugp`): esquema privado `viral_private` com `admin_members` e `admin_audit`, funções `viral_admin_is_member`, `viral_admin_overview`, `viral_admin_adjust_wallet`.
- Acesso verificado em cada RPC pelo banco via `auth.uid()` e associação privada, nunca por flags do navegador ou `user_metadata`.
- Ajuste atômico e auditável, bloqueio da carteira, rejeição de saldo negativo e chave idempotente. Limite de R$ 1.000 por componente por ajuste.
- Renderização com `textContent` para evitar injeção HTML.

## Passos antes de liberar o ADM
1. **Identificar o proprietário**: conferir a conta exata do Supabase Auth, depois cadastrar manualmente o UUID autorizado em `viral_private.admin_members`. Nenhum usuário foi autorizado automaticamente.
2. **Validar em sessão real**: acesso negado para usuário comum, acesso permitido para proprietário, ajuste único, repetição idempotente, saldo insuficiente, histórico, concorrência e auditoria.
3. **Publicação manual**: o workflow Pages permanece manual; nenhuma versão nova foi publicada por esta etapa.
4. **Não ativar cobranças**: os endpoints antigos ainda precisam integrar reserva e liquidação verificadas no backend. O painel financeiro não implica cobrança comercial pronta.
5. **Melhorias futuras**: busca paginada de usuários, estorno via serviço com prova de falha, administração de planos, configuração de preços em banco, integração de pagamentos e métricas consolidadas.

## Segurança operacional
- Nunca inserir `service_role` no navegador.
- A tabela privada de membros não é exposta pelo Data API.
- O administrador pode alterar saldos por RPC autenticada, auditada e com limites; o cliente comum não pode.
- Revise os alertas do Supabase Security Advisor sobre funções `SECURITY DEFINER` expostas e ative proteção de senhas vazadas.
