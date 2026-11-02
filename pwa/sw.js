// Only public installation assets are cached. Chats, profiles, API and media never enter Cache Storage.
const CACHE='wize-install-v3';
const PUBLIC_ASSETS=['/offline.html','/icons/app-192.png','/icons/app-512.png','/icons/app-maskable-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC_ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wize-install-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;
 }
 if(PUBLIC_ASSETS.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(request)));
});

// Call alerts (Web Push). The push carries no data, so the phone asks Wize X what to show: a ringing call, a group/deal call or a missed call.
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let item=null;try{const r=await fetch('/api/push/pending',{credentials:'include',cache:'no-store'});if(r.ok)item=((await r.json()).events||[])[0]||null}catch{}
 if(!item)return self.registration.showNotification('Wize X',{body:'Open Wize X to see your calls.',tag:'wize-alert',icon:'/icons/app-192.png',badge:'/icons/app-192.png'});
 const ringing=item.kind!=='missed';
 await self.registration.showNotification(item.title,{body:item.body,tag:(item.kind==='room'?'room-':'call-')+item.ref_id,renotify:true,requireInteraction:ringing,vibrate:ringing?[600,300,600,300,600,300,600]:[200],icon:'/icons/app-192.png',badge:'/icons/app-192.png',timestamp:item.created_at,data:{url:item.url,kind:item.kind,ref:item.ref_id},actions:item.kind==='call'?[{action:'decline',title:'Decline'},{action:'answer',title:'Answer'}]:item.kind==='room'?[{action:'answer',title:'Join'}]:[]});
})())});
self.addEventListener('notificationclick',event=>{const n=event.notification,d=n.data||{};n.close();event.waitUntil((async()=>{
 if(event.action==='decline'&&d.kind==='call'){try{await fetch('/api/calls/'+d.ref+'/decline',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'})}catch{}return}
 const url=new URL(d.url||'/#messages',self.location.origin).href,open=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const c of open)if(new URL(c.url).origin===self.location.origin&&'focus' in c){await c.focus();c.postMessage({type:'wize-open',url});return}
 await self.clients.openWindow(url);
})())});
