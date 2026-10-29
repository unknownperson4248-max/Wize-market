import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#090e19"><title>Wize Market — Community marketplace</title><style>'+read('./base.css')+'\n'+read('./app.css')+'</style></head><body>'+read('./body.html')+'<script src="https://accounts.google.com/gsi/client" async defer></script><script>'+read('./app.js')+'</script></body></html>';
writeFileSync(new URL('./index.html',import.meta.url),html);
mkdirSync(new URL('./dist/',import.meta.url),{recursive:true});
writeFileSync(new URL('./dist/worker.mjs',import.meta.url),'const PAGE='+JSON.stringify(html)+';\n'+read('./server/worker.mjs'));
console.log('Built index.html and dist/worker.mjs.');
