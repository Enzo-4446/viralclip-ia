/** Converts technical errors into useful messages without leaking tokens or internals. */
export function friendlyError(error){
 const message=String(error?.message||error||'').toLowerCase();
 if(error?.name==='AbortError'||/abort|cancelled|cancelado/.test(message))return 'Operação interrompida. Nenhum novo vídeo foi enviado. Tente novamente quando desejar.';
 if(/quota|storage full|not enough space|disk full/.test(message))return 'O dispositivo está sem espaço suficiente. Libere armazenamento, feche outras abas e tente novamente.';
 if(/memory|out of bounds|allocation/.test(message))return 'O navegador ficou sem memória para processar este arquivo. Feche outras abas ou divida o vídeo em trechos menores.';
 if(/codec|decoder|encoder|unsupported|not supported|media format/.test(message))return 'Este formato de vídeo ou áudio não é compatível com seu navegador. Tente um arquivo MP4 com vídeo H.264 e áudio AAC, preferencialmente no Chrome atualizado.';
 if(/network|fetch|failed to fetch|connection|timeout/.test(message))return 'A conexão falhou. Verifique a internet e tente novamente. Seus arquivos locais não precisam ser enviados ao servidor para serem cortados.';
 if(/permission|notallowed|denied/.test(message))return 'O navegador bloqueou uma permissão necessária. Confira as permissões do site e tente novamente.';
 return 'Não foi possível concluir o corte. Verifique o intervalo selecionado, tente novamente e, se persistir, use um arquivo MP4 compatível.';
}
