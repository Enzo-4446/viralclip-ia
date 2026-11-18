import { defineConfig } from 'vite';
const version=process.env.GITHUB_SHA||'offline-hd-2';
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [{name:'app-version',generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({version})});}}],
  base: '/viralclip-ia/',
  build: { outDir: 'dist' }
});
