# VIRAL IA — implantação comercial
Status: fase 1 (fundação). Nenhuma cobrança está ativa. Alterações são feitas na main com backup em backup-main-2026-11-18-pre-commercial, commit 5484dbaeb5bea191d23932038cc9349fb2c65c0c.

## Auditoria inicial
Frontend Vite, Supabase JS, Mediabunny, fflate e editor local; backend Python/Render. Há processamento e armazenamento em Supabase Storage já implementados. A arquitetura atual **não é exclusivamente local**: existem opções de processamento remoto e uploads de clipes. Não declarar política de zero upload até remover esses fluxos e testar. O repositório é público: nunca adicionar segredos.

## Regras comerciais
Preço R$0,10 por bloco iniciado de 30 segundos de cada clipe exportado; R$0,20 para 60 segundos. Cinco clipes gratuitos, cada um de até 60 segundos. Pacotes R$10, R$20, R$30, R$40, R$50, R$99,90; último concede bônus de R$25. Valores monetários em centavos inteiros. O arquivo frontend/commercial-pricing.js calcula apenas estimativas e **não autoriza débito**.

## Segurança e dados
Criar no Supabase: profiles, wallets, wallet_ledger, export_reservations, store_orders, payment_events, admin_audit. Usar RLS deny-by-default, políticas por auth.uid(), saldo atualizado somente por função SQL SECURITY DEFINER com search_path fixo e validação de papel. Nunca confiar em email informado no cliente para admin; vincular UID autenticado à permissão admin após verificação. Webhook Mercado Pago: verificar assinatura, consultar API, garantir idempotência por payment_id e transação SQL. Reserva de exportação com chave idempotente; confirmar débito após sucesso; estornar falha/cancelamento. Considerar que processamento local não prova criptograficamente o resultado ao servidor; limitar fraude e abusos por usuário/dispositivo.

## Privacidade e expiração
Migrar resultados para IndexedDB/OPFS local com expires_at=created_at+30 minutos. Limpar ao abrir, ao retornar à aba e periodicamente enquanto aberta. Não prometer exclusão exata com navegador fechado. Não apagar arquivos baixados nem enviados ao Drive. Migrar/desativar o fluxo atual de Supabase Storage com plano de retenção, sem apagar dados existentes inadvertidamente.

## Entregas sequenciais
1. Backup e testes existentes, inventário de dependências e fluxos de upload.
2. Editor acessível com seleção manual, zoom, waveform, exportação e mensagens amigáveis.
3. Migrações Supabase, RLS, carteira, cinco cortes grátis e reservas transacionais.
4. Loja, Pix Mercado Pago, carrinho, Webhooks idempotentes e testes sandbox.
5. Painel admin (UID autorizado), relatórios, crédito manual auditado, bloqueio, senha provisória.
6. Google Drive OAuth por usuário, upload direto, música licenciada e legendas opcionais.
7. Auditoria, testes cross-browser, implantação controlada, documentação de transferência.

## Transferência para comprador
Exportar repositório e histórico, migrações SQL, Edge Functions, configurações de ambiente (sem valores secretos), inventário de licenças, domínio, DNS, hospedagem, backups e runbook. Migrar dados pessoais com base legal e autorização adequada. Comprador cria suas próprias credenciais Mercado Pago, Google OAuth, Supabase e hospedagem. Validar restauração e revogar acessos anteriores. Não transferir senhas ou tokens pessoais.

## Iteração 3 — 2026-11-18
- Upload automático de resultados removido dos caminhos de geração local e remoto no frontend. O caminho remoto ainda envia a **fonte** ao Render quando escolhido; a importação de YouTube também depende de serviços externos. Não anunciar processamento totalmente local.
- URLs temporárias dos resultados são rastreadas e revogadas depois de 30 minutos enquanto a página está ativa, com verificação ao retornar à aba. Isto **não** elimina vídeos antigos do Supabase Storage, nem garante limpeza com navegador fechado; dados locais de origem continuam sob controle do usuário.
- Gravação de voz oculta na interface, mas código legado ainda exige refatoração.
- GitHub Pages alterado para publicação somente por workflow_dispatch; novo workflow validate.yml executa testes e build em push sem publicação.
- Migração para Google Drive por usuário, carteiras e pagamentos ainda não implementados. Não ativar créditos antes de RLS, transações e testes de pagamento.
- Confirmar resultado do GitHub Actions antes de executar manualmente deploy; backup original permanece disponível.

## Iteração 4 — carteira transacional (código preparado, não implantado)
- SQL revisável em docs/viral-wallet-schema.sql: carteiras por auth.uid(), ledger imutável para usuários, reservas idempotentes por request_key, cálculo de preço no Postgres, bloqueio FOR UPDATE e estorno de reserva cancelada.
- RPCs viral_reserve_export e viral_finish_export; frontend/wallet-client.js fornece cliente e testes de contrato, mas NÃO está ligado ao botão Gerar.
- O projeto Supabase referenciado pelo frontend (zltpldhnaqiqkoqdiugp) não apareceu entre os projetos acessíveis na conexão Supabase atual. **Não executar o SQL em outro projeto.** É necessário conectar a conta/projeto correto ou fornecer autorização de acesso.
- Nenhum saldo real foi criado, nenhuma cobrança foi ativada. Fluxo de sucesso declarado pelo navegador ainda requer estratégia antifraude antes de habilitar pagamentos.
- A base de dados existente deve ser inspecionada, com backup, antes de aplicar migração; executar RLS/advisors e testes com usuários distintos após implantação.

## Iteração 5 — 2026-11-18: Supabase de produção verificado
- Conexão correta: Supabase `PROJETO AGRO BURU`, projeto `viralclip.ia`, ref `zltpldhnaqiqkoqdiugp`. A nota anterior sobre projeto indisponível está superada.
- Migrações aplicadas no projeto correto: `viral_wallet_secure_reservations`, `viral_wallet_server_only_refunds`, `viral_wallet_refund_lock_order`.
- Tabelas criadas com RLS: `viral_wallets`, `viral_export_reservations`, `viral_wallet_ledger`. Authenticated tem SELECT apenas; sem INSERT/UPDATE/DELETE direto. Anon não executa RPCs. Estorno apenas service_role.
- SQL original e patch de segurança versionados em `docs/viral-wallet-schema.sql` e `docs/viral-wallet-security-patch.sql`. Aplicar ambos, nesta ordem, ao inicializar outro projeto.
- O navegador pode ser adulterado. Como o FFmpeg local roda integralmente no cliente, **não existe garantia criptográfica de impedir geração fora da carteira** nem de verificar falha real para estorno automático. Para monetização antifraude é necessário backend confiável de geração ou outro protocolo de entrega controlada, e estorno validado no servidor. O frontend permanece com `VITE_COMMERCIAL_WALLET_ENABLED` desativado por padrão, sem cobrar nem bloquear exportações atuais.
- Supabase security advisors reportam dois SECURITY DEFINER intencionalmente executáveis por usuários autenticados, com validação de auth.uid(), e aviso de proteção de senhas vazadas desativada. Revisão adicional antes do lançamento.
