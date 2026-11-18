# VIRAL IA — Helper Local (versão de desenvolvimento)

Este helper é um protótipo técnico. Não é um instalador de um clique e ainda não substitui o Render para uploads. Não promete baixar qualquer vídeo.

## Instalação para testes no computador

Requer Python 3.11+, FFmpeg e ffprobe instalados no PATH.

```bash
cd helper
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python helper.py
```

O terminal mostra um PIN de seis dígitos por dez minutos. Abra https://enzo-4446.github.io/viralclip-ia/ em Chrome ou Edge, cole o link e insira o PIN no painel **Importação pelo seu computador**. O helper aceita apenas a origem do site oficial. A saída fica em `~/ViralIA/<job-id>/cortes/`.

A página HTTPS acessando HTTP localhost depende de permissões e políticas do navegador. Se o navegador bloquear, utilize o upload de MP4.

## Limitações e cuidados

- A API do YouTube não garante download de conteúdo; restrições de acesso continuam possíveis.
- Sem leitura de cookies, sem CAPTCHA, sem proxy e sem rotação de IP.
- O pareamento dura somente enquanto o processo estiver aberto; o token fica na sessão da aba.
- O cancelamento é cooperativo; um subprocesso FFmpeg em andamento pode demorar até concluir seu trecho.
- A versão atual ainda precisa de empacotamento PyInstaller por sistema, assinatura de executáveis, persistência segura de auditoria no Supabase e testes de integração reais antes de distribuição pública.
- Não exponha a porta do helper na rede.
