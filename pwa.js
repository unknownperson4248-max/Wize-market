let deferredInstall=null;
const installedApp=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const knownInstalled=()=>{try{return localStorage.getItem('wm_app_installed')==='1'}catch{return false}};
function closeInstallHelp(){$('installHelp').hidden=true}
// The same page in the phone's real browser: Chrome on Android (intent link), Safari on iPhone.
function realBrowserUrl(){const url='https://'+location.host+location.pathname+location.search;return onIos()?'x-safari-'+url:'intent://'+location.host+location.pathname+location.search+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(url)+';end'}
// Google blocks login inside apps like Messenger and Facebook, so the login page says so and offers the real browser.
function inAppLoginNote(){
 if(!inAppBrowser()||$('inAppLoginNote')||!$('authGoogle'))return;const browser=onIos()?'Safari':'Chrome',note=node('div',undefined,'in-app-login-note');note.id='inAppLoginNote';
 note.append(node('strong','⚠️ Google login does not work inside Messenger / Facebook'),node('small','Open this page in '+browser+' to use Google, or log in with Email or Number below.'));
 const actions=node('div',undefined,'in-app-login-actions');actions.append(button('Open in '+browser,()=>{location.href=realBrowserUrl()},'btn in-app-open'),button('📋 Copy link',async()=>{try{await navigator.clipboard.writeText(location.origin+'/');toast('Link copied. Paste it in '+browser+'.')}catch{toast(location.origin+'/')}},'btn secondary in-app-copy'));
 note.append(actions);$('authGoogle').prepend(note);
}
const onIos=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const inAppBrowser=()=>/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|MicroMessenger|Line\/|Snapchat|musical_ly|TikTok|Twitter/i.test(navigator.userAgent);
const iosOtherBrowser=()=>/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(navigator.userAgent);
const installHiddenUntil=()=>{try{return Number(localStorage.getItem('wm_install_hide_until')||0)}catch{return 0}};
// The same "Install" bar on every phone. Android: Install installs right away, and once the app is installed the bar never comes back
// (Chrome stops offering it). iPhone cannot install from a website, so Install shows how to add Wize X to the Home Screen.
// Hidden for 3 days after ✕, and on iPhone for 14 days after the guide was shown (Safari cannot tell that the app was added).
function displayInstallOffer(){
 if(installedApp()||knownInstalled()||installHiddenUntil()>Date.now())return;
 $('appInstallBanner').hidden=false;
}
const hideInstallFor=days=>{$('appInstallBanner').hidden=true;try{localStorage.setItem('wm_install_hide_until',String(Date.now()+days*24*3600000))}catch{}};
const IOS_SHARE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/></svg>';
function installStep(icon,html){const li=node('li'),badge=node('span',undefined,'install-step-icon'),text=node('span');if(icon.startsWith('<svg'))badge.innerHTML=icon;else badge.textContent=icon;text.innerHTML=html;li.append(badge,text);return li}
// Simple drawings of the iPhone screens, so each step shows where to tap.
const IOS_PICS={
 share:'<svg viewBox="0 0 280 120" role="img" aria-label="Safari bottom bar with the Share button"><rect x="1" y="1" width="278" height="118" rx="16" fill="#0d1b2c" stroke="#2c4b65"/><rect x="14" y="20" width="252" height="34" rx="17" fill="#1d3249"/><text x="140" y="42" fill="#9fc2e0" font-size="13" text-anchor="middle" font-family="system-ui">{HOST}</text><g fill="none" stroke="#9fc2e0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M34 82l-8 8 8 8"/><path d="M70 82l8 8-8 8"/><rect x="200" y="80" width="18" height="18" rx="3"/><rect x="232" y="80" width="18" height="18" rx="3"/></g><circle cx="140" cy="90" r="20" fill="#2a8de0" opacity=".25"/><circle cx="140" cy="90" r="20" fill="none" stroke="#2a8de0" stroke-width="2.5"/><g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M140 78v15M134 83l6-6 6 6"/><path d="M134 87h-3v14h18V87h-3"/></g></svg>',
 add:'<svg viewBox="0 0 280 120" role="img" aria-label="Share menu with Add to Home Screen"><rect x="1" y="1" width="278" height="118" rx="16" fill="#0d1b2c" stroke="#2c4b65"/><rect x="14" y="12" width="252" height="28" rx="8" fill="#16283c"/><text x="28" y="31" fill="#7f9bb6" font-size="12" font-family="system-ui">Copy</text><rect x="14" y="46" width="252" height="32" rx="8" fill="#2a8de0" opacity=".3" stroke="#2a8de0" stroke-width="2"/><text x="28" y="67" fill="#fff" font-size="13" font-weight="700" font-family="system-ui">Add to Home Screen</text><rect x="238" y="53" width="18" height="18" rx="4" fill="none" stroke="#fff" stroke-width="2"/><path d="M247 57v10M242 62h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="14" y="84" width="252" height="28" rx="8" fill="#16283c"/><text x="28" y="103" fill="#7f9bb6" font-size="12" font-family="system-ui">Add Bookmark</text></svg>',
 confirm:'<svg viewBox="0 0 280 120" role="img" aria-label="Tap Add at the top right"><rect x="1" y="1" width="278" height="118" rx="16" fill="#0d1b2c" stroke="#2c4b65"/><text x="20" y="34" fill="#7f9bb6" font-size="13" font-family="system-ui">Cancel</text><text x="140" y="34" fill="#dbe9f6" font-size="13" font-weight="700" text-anchor="middle" font-family="system-ui">Add to Home Screen</text><rect x="222" y="15" width="46" height="28" rx="14" fill="#2a8de0"/><text x="245" y="34" fill="#fff" font-size="13" font-weight="700" text-anchor="middle" font-family="system-ui">Add</text><rect x="20" y="58" width="44" height="44" rx="11" fill="#5b2bd6"/><text x="42" y="88" fill="#fff" font-size="22" font-weight="800" text-anchor="middle" font-family="system-ui">{LETTER}</text><rect x="76" y="66" width="184" height="28" rx="6" fill="#16283c"/><text x="86" y="85" fill="#dbe9f6" font-size="13" font-family="system-ui">{NAME}</text></svg>',
 home:'<svg viewBox="0 0 280 120" role="img" aria-label="The app icon on the Home Screen"><rect x="1" y="1" width="278" height="118" rx="16" fill="#0d1b2c" stroke="#2c4b65"/><g fill="#22384f"><rect x="30" y="18" width="40" height="40" rx="10"/><rect x="90" y="18" width="40" height="40" rx="10"/><rect x="210" y="18" width="40" height="40" rx="10"/><rect x="30" y="70" width="40" height="40" rx="10"/><rect x="90" y="70" width="40" height="40" rx="10"/><rect x="150" y="70" width="40" height="40" rx="10"/><rect x="210" y="70" width="40" height="40" rx="10"/></g><circle cx="170" cy="38" r="27" fill="#2a8de0" opacity=".3"/><rect x="150" y="18" width="40" height="40" rx="10" fill="#5b2bd6" stroke="#fff" stroke-width="2"/><text x="170" y="46" fill="#fff" font-size="20" font-weight="800" text-anchor="middle" font-family="system-ui">{LETTER}</text></svg>'};
function installPicStep(icon,html,pic){const li=installStep(icon,html),fig=node('div',undefined,'install-step-pic'),safe=v=>String(v).replace(/[<>&"]/g,''),name=safe(($('installHelpTitle')?.textContent||'').replace(/^Install\s+/i,'').trim()||'WIZE MARKET');fig.innerHTML=IOS_PICS[pic].replaceAll('{HOST}',safe(location.host)).replaceAll('{NAME}',name.slice(0,22)).replaceAll('{LETTER}',name.charAt(0).toUpperCase());li.append(fig);return li}
// Step-by-step guide: iPhone (Safari / other browsers), apps like Facebook that open links inside, and Android browsers.
function showInstallGuide(){
 const box=$('installInstructions'),ios=onIos(),list=node('ol',undefined,'install-step-list'),browser=ios?'Safari':'Chrome',name=($('installHelpTitle')?.textContent||'').replace(/^Install\s+/i,'').trim().replace(/[<>&"]/g,'')||'WIZE MARKET';
 if(inAppBrowser()){
  box.replaceChildren(node('p','This page is open inside another app (Facebook, Messenger…). Apps can only be added from '+browser+':','hint'));
  list.append(installStep('•••','Tap <b>•••</b> at the top and choose <b>Open in '+browser+'</b> (or <b>Open in browser</b>).'),installStep('🔗','Or copy the link and paste it into '+browser+'.'));
  box.append(list,button('📋 Copy link',async()=>{try{await navigator.clipboard.writeText(location.origin+'/');toast('Link copied. Paste it in '+browser+'.')}catch{toast(location.origin+'/')}},'btn secondary install-copy'));
 }else if(ios){
  box.replaceChildren(node('p','iPhone does not allow one-tap install for websites. It takes 3 taps:','hint'));
  list.append(installPicStep(IOS_SHARE,'Tap the <b>Share</b> button at the bottom of Safari. On newer iPhones, tap <b>•••</b> first, then <b>Share</b>.','share'),installPicStep('➕','Scroll down and tap <b>Add to Home Screen</b>.','add'),installPicStep('✅','Tap <b>Add</b> at the top right.','confirm'),installPicStep('📱','Open <b>'+name+'</b> from the Home Screen. Call alerts work only from there.','home'));
  box.append(list);if(iosOtherBrowser())box.append(node('p','No "Add to Home Screen"? Open this page in Safari and try again.','hint'));
 }else{
  box.replaceChildren(node('p','Install from the browser menu:','hint'));
  list.append(installStep('⋮','Tap the browser menu <b>⋮</b> at the top right.'),installStep('📲','Tap <b>Install app</b> or <b>Add to Home screen</b>.'),installStep('✅','Tap <b>Install</b>. Then open <b>'+name+'</b> from the Home Screen.'));box.append(list);
 }
 $('installHelp').hidden=false;$('closeInstallHelp').focus();
}
async function installMarketApp(){
 if(installedApp())return toast('WizeNex is already open as an app.');
 if(deferredInstall&&!inAppBrowser()){
  const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();
  const result=await prompt.userChoice;
  if(result.outcome==='accepted'){$('appInstallBanner').hidden=true;try{localStorage.setItem('wm_app_installed','1')}catch{}}
  return;
 }
 if(onIos()&&(inAppBrowser()||iosOtherBrowser())){openInSafariForInstall();return}
 showInstallGuide();if(onIos())hideInstallFor(14);
}
// iPhone can add apps to the Home Screen only from Safari: jump to Safari, which then opens the guide by itself.
function openInSafariForInstall(){const url='https://'+location.host+location.pathname+location.search+'#install';location.href='x-safari-'+url;setTimeout(()=>{if(document.visibilityState==='visible')showInstallGuide()},1500)}
// Opened from the Install button in another browser: show the picture guide right away.
if(location.hash==='#install'&&onIos()&&!installedApp()){history.replaceState(history.state,'',location.pathname+location.search);setTimeout(()=>{if(!inAppBrowser()&&!iosOtherBrowser()){showInstallGuide();hideInstallFor(14)}},600)}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();deferredInstall=event;
 // If Chrome offers installation again, an old saved install flag may be stale after uninstall.
 if(knownInstalled()){try{localStorage.removeItem('wm_app_installed')}catch{}}
 displayInstallOffer();
});
window.addEventListener('appinstalled',()=>{deferredInstall=null;try{localStorage.setItem('wm_app_installed','1')}catch{}$('appInstallBanner').hidden=true;closeInstallHelp();toast('WizeNex installed.')});
$('installApp').onclick=()=>void installMarketApp().catch(e=>toast(e.message));
$('dismissInstall').onclick=()=>hideInstallFor(3);
$('closeInstallHelp').onclick=closeInstallHelp;
$('installHelp').onclick=e=>{if(e.target===$('installHelp'))closeInstallHelp()};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeInstallHelp()});
$('appInstallBanner').hidden=true;
// Opening the installed app once remembers it for this browser too, so the banner never comes back.
if(installedApp()){try{localStorage.setItem('wm_app_installed','1')}catch{}}
// Android/Chrome only offers installation when the app is not installed yet: wait for that signal. iPhone has no signal, so show it once.
if(onIos())displayInstallOffer();
inAppLoginNote();
// Ask Chrome whether WizeNex is installed on this phone. Installed: no Install bar. Not installed (or uninstalled later): show it right away,
// without waiting for Chrome's own install signal. Tapping Install uses Chrome's one-tap install when ready, otherwise shows the ⋮ → Install app steps.
if(!onIos()&&!installedApp()){
 const decide=installed=>{if(installed){try{localStorage.setItem('wm_app_installed','1')}catch{}$('appInstallBanner').hidden=true;return}try{localStorage.removeItem('wm_app_installed')}catch{}displayInstallOffer()};
 if(navigator.getInstalledRelatedApps)void navigator.getInstalledRelatedApps().then(apps=>decide(apps.length>0)).catch(()=>{if(!knownInstalled())displayInstallOffer()});
 else if(!knownInstalled())displayInstallOffer();
}

if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});

function completedProfile(d,key){const p={id:d[key+'_id'],name:d[key+'_name']||'Admin',picture:d[key+'_picture']};const visit=button('',()=>showProfile(p.id),'completed-profile');visit.append(avatar(p),node('span',p.name));if(d[key+'_verified'])visit.append(verifiedMark('member'));return visit}
async function renderPublicDeals(root,offset=0){
 const request=String((Number(root.dataset.request)||0)+1);root.dataset.request=request;
 const data=await api('/deals/public?offset='+offset);if(root.dataset.request!==request)return;
 if(!offset){root.replaceChildren();const intro=node('div',undefined,'public-deal-intro');intro.append(node('strong',data.total.toLocaleString()+' completed deals'),node('p','Trades completed with final Admin confirmation.','hint'));root.append(intro)}
 root.querySelector('.load-public-deals')?.remove();
 for(const d of data.completed){const row=node('article',undefined,'public-deal-row');row.append(node('small',d.deal_code,'hint'));const people=node('div',undefined,'public-deal-people');people.append(completedProfile(d,'buyer'),node('span','↔','trade-between'),completedProfile(d,'seller'));row.append(people);if(d.admin_id){const admin=node('div',undefined,'public-deal-admin');admin.append(node('small','Admin'),completedProfile(d,'admin'));row.append(admin)}if(d.completed_at)row.append(node('time',new Date(d.completed_at).toLocaleDateString(),'hint'));root.append(row)}
 if(!data.total)root.append(node('p','Completed trades will appear here.','hint'));
 if(data.nextOffset!==null)root.append(button('Show more',()=>renderPublicDeals(root,data.nextOffset),'btn secondary load-public-deals'));
}
async function loadFeatures(){}

async function loadPwaBranding(){try{const config=await api('/pwa');document.title=config.name;document.querySelectorAll('[data-app-name],.app-wordmark,#loginBrand').forEach(element=>element.textContent=config.name);if(globalThis.wmSiteContent?.login?.brand)$('loginBrand').textContent=globalThis.wmSiteContent.login.brand;document.querySelectorAll('[data-app-description]').forEach(element=>element.textContent=config.description);let description=document.querySelector('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.append(description)}description.content=config.description;$('appInstallBanner').setAttribute('aria-label','Install '+config.name);$('appInstallBanner').querySelector('strong').textContent=config.name;$('appInstallBanner').querySelector('img').src=config.icons[0].src;document.querySelector('link[rel="apple-touch-icon"]').href=config.icons[0].src;$('installHelpTitle').textContent='Install '+config.name;await loadAppearance()}catch{}}
void loadPwaBranding();

// Hide the bottom menu while scrolling down a page, show it again when scrolling up.
(()=>{let lastY=window.scrollY,ticking=false;const pages=['home','profile','friends','search'];
 const update=()=>{ticking=false;const y=Math.max(0,window.scrollY),diff=y-lastY;if(!pages.includes(typeof active==='string'?active:'')||y<60){document.body.classList.remove('nav-hidden')}else if(diff>8){document.body.classList.add('nav-hidden')}else if(diff<-8){document.body.classList.remove('nav-hidden')}if(Math.abs(diff)>8||y<60)lastY=y};
 window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true});
 window.addEventListener('hashchange',()=>document.body.classList.remove('nav-hidden'))})();

// Swipe from the left or right screen edge to go back (iPhone Home Screen app has no back button).
(()=>{const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(!standalone&&!ios)return;// Android and desktop already have their own back
 const EDGE=28,GO=72;let start=null,side=null,cue=null;
 const blocked=t=>t.closest?.('input,textarea,select,[contenteditable],#cropPreviewFrame,.photo-editor-frame,.call-screen,.album-stage,video');
 const showCue=(dx)=>{if(!cue){cue=document.createElement('div');cue.className='swipe-back-cue';cue.setAttribute('aria-hidden','true');cue.textContent='‹';document.body.append(cue)}cue.classList.toggle('right',side==='right');const p=Math.min(1,dx/GO);cue.style.opacity=String(.25+p*.75);cue.style.transform='translateY(-50%) translateX('+(side==='left'?1:-1)*Math.min(dx,GO)*.6+'px) scale('+(.7+p*.3)+')';cue.classList.toggle('ready',p>=1)};
 const hideCue=()=>{cue?.remove();cue=null};
 document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0],w=innerWidth;side=t.clientX<=EDGE?'left':t.clientX>=w-EDGE?'right':null;if(!side||(!standalone&&side==='left')||blocked(e.target)){start=null;return}start={x:t.clientX,y:t.clientY}},{passive:true});
 document.addEventListener('touchmove',e=>{if(!start)return;const t=e.touches[0],dx=(side==='left'?t.clientX-start.x:start.x-t.clientX),dy=Math.abs(t.clientY-start.y);if(dy>40&&dy>dx){start=null;hideCue();return}if(dx>8)showCue(dx)},{passive:true});
 document.addEventListener('touchend',e=>{if(!start)return;const t=e.changedTouches[0],dx=(side==='left'?t.clientX-start.x:start.x-t.clientX),dy=Math.abs(t.clientY-start.y);start=null;hideCue();if(dx>=GO&&dy<dx*.7)history.back()},{passive:true});
 document.addEventListener('touchcancel',()=>{start=null;hideCue()},{passive:true})})();

// Keep the feed filters right under the "My feed" heading while scrolling.
(()=>{const h=document.querySelector('#page-home .feed-heading');if(!h||!window.ResizeObserver)return;const set=()=>document.documentElement.style.setProperty('--feed-head-h',Math.round(h.getBoundingClientRect().height)+'px');new ResizeObserver(set).observe(h);set()})();

// Videos can be at most 2 minutes: checked as soon as a video is picked, before any upload starts.
// Large phone videos are then made smaller on the phone (same resolution up to 1080p, lower bitrate) with the browser's own video encoder.
(()=>{const MAX=120,TARGET_BPS=1800000,SHORT=720,MEDIABUNNY='https://cdn.jsdelivr.net/npm/mediabunny@1.62.0/dist/bundles/mediabunny.min.mjs';
 const length=f=>new Promise(res=>{const v=document.createElement('video');v.preload='metadata';v.muted=true;const url=URL.createObjectURL(f);const done=d=>{URL.revokeObjectURL(url);res(d)};v.onloadedmetadata=()=>done(isFinite(v.duration)?v.duration:null);v.onerror=()=>done(null);setTimeout(()=>done(null),8000);v.src=url});
 let progressBox=null;const progress=(text,pct)=>{if(!progressBox){progressBox=document.createElement('div');progressBox.className='video-optimize';progressBox.setAttribute('role','status');progressBox.innerHTML='<strong></strong><div class="vo-bar"><i></i></div><small>Keep this page open. The video is saved in 720p.</small>';document.body.append(progressBox)}progressBox.querySelector('strong').textContent=text;progressBox.querySelector('i').style.width=Math.round((pct||0)*100)+'%'};
 const hideProgress=()=>{progressBox?.remove();progressBox=null};
 async function shrink(file,secs){
  if(!secs||!window.VideoEncoder)return file;// this phone cannot encode
  try{const mb=await import(MEDIABUNNY);const input=new mb.Input({source:new mb.BlobSource(file),formats:mb.ALL_FORMATS});const track=await input.getPrimaryVideoTrack();if(!track)return file;
   const w=track.displayWidth,h=track.displayHeight,big=Math.min(w,h)>SHORT;
   if(!big&&file.size*8/secs<=TARGET_BPS*1.4)return file;// already 720p or smaller and light
   const cap=big?(w>=h?{height:SHORT}:{width:SHORT}):{};// 720p: the short side becomes 720, shape kept
   const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()});
   const conversion=await mb.Conversion.init({input,output,video:{codec:'avc',bitrate:TARGET_BPS,forceTranscode:true,...cap}});// sound is copied as it is
   if(!conversion.isValid||conversion.discardedTracks?.length)return file;// never drop the sound or any track
   conversion.onProgress=p=>progress('🎬 Optimizing video… '+Math.round(p*100)+'%',p);progress('🎬 Optimizing video… 0%',0);await conversion.execute();
   const buf=output.target.buffer;if(!buf||buf.byteLength<50000)return file;
   // Check the result before using it: same length, and the sound is still there.
   const check=new mb.Input({source:new mb.BufferSource(buf),formats:mb.ALL_FORMATS}),hadAudio=!!(await input.getPrimaryAudioTrack()),[dur,audio,vid]=await Promise.all([check.computeDuration(),check.getPrimaryAudioTrack(),check.getPrimaryVideoTrack()]);
   if(!vid||(hadAudio&&!audio)||Math.abs(dur-secs)>1.5)return file;
   const out=new File([buf],file.name.replace(/\.[^.]+$/,'')+'.mp4',{type:'video/mp4'});return out.size<file.size*0.9?out:file}catch(e){console.warn('Video optimize skipped',e);return file}finally{hideProgress()}}
 document.addEventListener('change',async e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='file'||input.dataset.videoChecked==='1')return;const all=[...(input.files||[])],vids=all.filter(f=>f.type.startsWith('video/'));if(!vids.length)return;
  e.stopImmediatePropagation();const lens=await Promise.all(vids.map(length)),tooLong=lens.findIndex(d=>d!==null&&d>MAX+1);
  if(tooLong>=0){const m=Math.floor(lens[tooLong]/60),s=String(Math.round(lens[tooLong]%60)).padStart(2,'0');toast('🎬 Video is '+m+':'+s+' long. Videos can be at most 2 minutes — trim it and try again.');input.value='';return}
  let changed=false;const files=[];for(const f of all){const i=vids.indexOf(f);if(i<0){files.push(f);continue}const small=await shrink(f,lens[i]);if(small!==f){changed=true;toast('🎬 Video optimized: '+(f.size/1048576).toFixed(0)+' MB → '+(small.size/1048576).toFixed(1)+' MB')}files.push(small)}
  if(changed&&window.DataTransfer){try{const dt=new DataTransfer();for(const f of files)dt.items.add(f);input.files=dt.files}catch{}}
  input.dataset.videoChecked='1';input.dispatchEvent(new Event('change',{bubbles:true}));delete input.dataset.videoChecked},true)})();

// Hide the launch animation once the app is ready (at least 1.3 s so it can play, at most 3.5 s).
(()=>{const splash=document.getElementById('appSplash');if(!splash)return;if(!matchMedia('(display-mode: standalone)').matches){splash.remove();return}
 // Status bar in the same colour as the launch screen while it shows, so the top does not change colour.
 const theme=document.querySelector('meta[name="theme-color"]'),oldTheme=theme?.content;if(theme)theme.content='#0a0412';
 const started=performance.now();let gone=false;const hide=()=>{if(gone)return;gone=true;setTimeout(()=>{splash.classList.add('done');if(theme&&oldTheme)theme.content=oldTheme;setTimeout(()=>splash.remove(),600)},Math.max(0,1300-(performance.now()-started)))};
 const ready=()=>!document.body.classList.contains('auth-pending');if(ready())hide();else{const watch=new MutationObserver(()=>{if(ready()){watch.disconnect();hide()}});watch.observe(document.body,{attributes:true,attributeFilter:['class']})}
 setTimeout(hide,3500)})();
