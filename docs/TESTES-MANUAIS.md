# VIRAL IA — Plano de testes manuais

Não declarar compatibilidade universal. Testar somente vídeos para os quais existe autorização.

| Teste | Navegador | Rede | Vídeo | Resultado | Tempo | Cortes |
|---|---|---|---|---|---|---|
| Curto (2 min) | Chrome | Casa | | | | |
| Longo (1 h) | Edge | Casa | | | | |
| Shorts | Firefox | 4G | | | | |
| Privado (erro esperado) | Chrome | Casa | | | | |
| Restrição etária (erro esperado) | Chrome | Casa | | | | |
| Helper ausente | Safari | Casa | N/A | | | |
| URL inválida | Chrome | Casa | N/A | | | |

Repetir até completar pelo menos dez vídeos de canais distintos e registrar erros 403/429 e bloqueios de rede local. Confirmar que não há requisições do backend Render para baixar YouTube no fluxo do helper.

## Segurança
- Rejeitar origens desconhecidas e chamadas sem token.
- Rejeitar URLs não HTTPS, hostnames falsos e playlists.
- Rejeitar 51 cortes, duração de 181 s, gap de 601 s.
- Testar desconexão do helper, cancelamento e arquivo incompleto.
- Confirmar que não são registrados cookies, senhas nem tokens.
