# Publicação no GitHub Pages

1. O repositório privado pode exigir plano GitHub pago para Pages. Se o Pages não estiver disponível, não torne o código público sem revisar segredos e riscos.
2. Em Settings > Secrets and variables > Actions > Variables, configure:
   - VITE_SUPABASE_URL = https://zltpldhnaqiqkoqdiugp.supabase.co
   - VITE_SUPABASE_PUBLISHABLE_KEY = chave **publishable** (nunca secret/service_role)
   - VITE_API_URL = URL HTTPS do servidor FFmpeg autenticado (quando existir)
3. Em Settings > Pages > Build and deployment, selecione Source: GitHub Actions.
4. Execute Actions > Deploy ViralClip IA frontend > Run workflow.
5. O endereço previsto é https://enzo-4446.github.io/viralclip-ia/ (somente após deploy concluído).
6. Em Supabase Authentication > URL Configuration, adicione o endereço do Pages às Redirect URLs e configure o Site URL conforme necessário.
7. GitHub Pages é hospedagem estática: não executa Python, Docker, FFmpeg ou tarefas em segundo plano.
8. O backend ainda não está implantado. Até lá, login pode funcionar mas gerar clipes não funcionará.
