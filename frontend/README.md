# Frontend ViralClip IA

Deploy no Cloudflare Pages: diretório raiz `frontend`, comando `npm ci && npm run build` (após gerar package-lock.json), saída `dist`.

Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`.

O site requer um backend FFmpeg separado com CORS restrito ao domínio de produção. Não exponha o backend antigo sem autenticação.
