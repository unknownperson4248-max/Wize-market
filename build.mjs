import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#090e19"><title>Wize Market — Community marketplace</title><style>'+read('./base.css')+'\n'+read('./app.css')+'\n'+read('./design.css')+'</style></head><body class="auth-pending">'+read('./body.html')+'<script src="https://accounts.google.com/gsi/client" async defer></script><script>'+read('./app.js')+'\n'+read('./design.js')+'</script></body></html>';
writeFileSync(new URL('./index.html',import.meta.url),html);
mkdirSync(new URL('./dist/',import.meta.url),{recursive:true});
const adminHtml='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Wize Market — Control Room</title><style>'+read('./base.css')+read('./app.css')+read('./admin.css')+'</style></head><body>'+read('./admin.html')+'<script>'+read('./admin.js')+'</script></body></html>';
writeFileSync(new URL('./dist/worker.mjs',import.meta.url),'const PROFILE_COVER='+JSON.stringify(read('./assets/profile-cover.webp.base64').trim())+';\nconst PAGE='+JSON.stringify(html)+';\nconst ADMIN_PAGE='+JSON.stringify(adminHtml)+';\n'+read('./server/worker.mjs'));
console.log('Built index.html and dist/worker.mjs.');
