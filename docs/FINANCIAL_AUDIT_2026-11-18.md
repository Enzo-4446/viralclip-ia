# Auditoria da carteira — 18/11/2026

## Conclusões verificadas
- O Supabase de produção contém as tabelas de carteiras, reservas, extrato e esquema privado de auditoria.
- Browser roles `anon` e `authenticated` **não podem** executar `viral_reserve_export`, `viral_finish_export` nem `viral_credit_payment_service`.
- O cliente foi atualizado para impedir reserva e liquidação até existir entrega confiável pelo backend.
- Criado `viral_private.credit_events` com unicidade `(source,external_id)` e `viral_credit_payment_service` exclusiva de `service_role`. Não há integração Mercado Pago; nenhuma origem é confiável sem validação no backend.
- Índices únicos por reserva para eventos `reserve` e `refund` impedem duplicação acidental no extrato.
- Estorno `viral_refund_export_service` só atua em reservas `reserved`; repetição e reserva `completed` não geram segundo estorno.
- Ajustes ADM possuem autorização via associação privada, auditoria e bloqueio da linha da carteira.
- Testes SQL executados em transações revertidas: crédito único, replay idempotente, replay divergente rejeitado, estorno repetido e impossibilidade de estornar exportação concluída.
- Após testes, conferidos: 0 reservas, 0 entradas no extrato, 0 eventos de crédito, R$ 0,00 em saldo pago e bônus. Nenhuma movimentação de teste persistiu.

## Lacunas que bloqueiam cobrança
1. Não há vínculo seguro entre reserva, processamento real, arquivo final, entrega e conclusão. Não habilitar RPC de reserva no navegador.
2. O backend Render ainda não implementa a reserva e liquidação exclusivamente pelo servidor. Não configurar `COMMERCIAL_ENFORCEMENT=strict` sem completar rotas novas: isso bloquearia exportações antigas.
3. Não há validação de webhook Mercado Pago, assinatura, valor, moeda, titular, idempotência de evento e conciliação com pedido interno. Deixar por último, como solicitado.
4. Testes SQL transacionais não substituem testes end-to-end em produção, testes de concorrência real, falha de rede e falha de entrega.
5. Não atribuir privilégios ADM automaticamente; vincular proprietário apenas após confirmar a conta exata.

## Regras para a etapa de servidor
- Identificar usuário autenticado no backend.
- Validar duração real do arquivo e segmentos pelo servidor, nunca confiar em durações enviadas pelo navegador.
- Reservar créditos de forma transacional com chave idempotente vinculada à solicitação e à geração.
- Armazenar status e artefato final com vínculo de propriedade; entregar apenas arquivo gerado e pago/gratuito autorizado.
- Liquidar somente após renderização válida e disponibilidade de download. Falha comprovada deve invalidar a entrega antes de devolver créditos.
- Evitar dupla liquidação e dupla devolução em concorrência, retry, timeout e crash.
- Nunca enviar service_role ao frontend.
