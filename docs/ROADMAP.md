# Roadmap realista

## Fase 1 — Motor de renderização
- [x] API de upload e corte manual
- [x] Marca d'água móvel incorporada ao vídeo
- [x] Interface responsiva inicial
- [ ] Teste integrado de renderização com vídeo de referência
- [ ] Processamento em fila, persistência e autenticação

## Fase 2 — Seleção inteligente
- [ ] Transcrição com timestamps
- [ ] Detecção de cortes de cena e picos de áudio
- [ ] Ranking multimodal de trechos e revisão humana
- [ ] Auto-reframe de pessoas/objetos com proteção de áreas importantes

## Fase 3 — Integração e distribuição
- [ ] Supabase Auth, tabelas com RLS e jobs por usuário
- [ ] Armazenamento privado e links temporários
- [ ] Radar de lives via YouTube Data API
- [ ] Ingestão contínua apenas de transmissões próprias/licenciadas
- [ ] Exportação para Fotos/Arquivos no iPad e integração de compartilhamento

## Restrições
A API pública do YouTube não disponibiliza livremente downloads de vídeos de terceiros nem dados completos de retenção. A seleção inteligente estima interesse e não garante visualizações ou monetização. Marca d'água não impede toda remoção.
