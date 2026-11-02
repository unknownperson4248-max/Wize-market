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
// Step-by-step guide: iPhone (Safari / other browsers), apps like Facebook that open links inside, and Android browsers.
function showInstallGuide(){
 const box=$('installInstructions'),ios=onIos(),list=node('ol',undefined,'install-step-list'),browser=ios?'Safari':'Chrome',name=($('installHelpTitle')?.textContent||'').replace(/^Install\s+/i,'').trim().replace(/[<>&"]/g,'')||'WIZE MARKET';
 if(inAppBrowser()){
  box.replaceChildren(node('p','This page is open inside another app (Facebook, Messenger…). Apps can only be added from '+browser+':','hint'));
  list.append(installStep('•••','Tap <b>•••</b> at the top and choose <b>Open in '+browser+'</b> (or <b>Open in browser</b>).'),installStep('🔗','Or copy the link and paste it into '+browser+'.'));
  box.append(list,button('📋 Copy link',async()=>{try{await navigator.clipboard.writeText(location.origin+'/');toast('Link copied. Paste it in '+browser+'.')}catch{toast(location.origin+'/')}},'btn secondary install-copy'));
 }else if(ios){
  box.replaceChildren(node('p','iPhone does not allow one-tap install for websites. It takes 3 taps:','hint'));
  list.append(installStep(IOS_SHARE,iosOtherBrowser()?'Tap the <b>Share</b> button at the top of the browser.':'Tap the <b>Share</b> button at the bottom of Safari. On newer iPhones, tap <b>•••</b> first, then <b>Share</b>.'),installStep('➕','Scroll down and tap <b>Add to Home Screen</b>.'),installStep('✅','Tap <b>Add</b> at the top right.'),installStep('📱','Open <b>'+name+'</b> from the Home Screen. Call alerts work only from there.'));
  box.append(list);if(iosOtherBrowser())box.append(node('p','No "Add to Home Screen"? Open this page in Safari and try again.','hint'));
 }else{
  box.replaceChildren(node('p','Install from the browser menu:','hint'));
  list.append(installStep('⋮','Tap the browser menu <b>⋮</b> at the top right.'),installStep('📲','Tap <b>Install app</b> or <b>Add to Home screen</b>.'),installStep('✅','Tap <b>Install</b>. Then open <b>'+name+'</b> from the Home Screen.'));box.append(list);
 }
 $('installHelp').hidden=false;$('closeInstallHelp').focus();
}
async function installMarketApp(){
 if(installedApp())return toast('WIZE MARKET is already open as an app.');
 if(deferredInstall&&!inAppBrowser()){
  const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();
  const result=await prompt.userChoice;
  if(result.outcome==='accepted'){$('appInstallBanner').hidden=true;try{localStorage.setItem('wm_app_installed','1')}catch{}}
  return;
 }
 showInstallGuide();if(onIos())hideInstallFor(14);
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();deferredInstall=event;
 // If Chrome offers installation again, an old saved install flag may be stale after uninstall.
 if(knownInstalled()){try{localStorage.removeItem('wm_app_installed')}catch{}}
 displayInstallOffer();
});
window.addEventListener('appinstalled',()=>{deferredInstall=null;try{localStorage.setItem('wm_app_installed','1')}catch{}$('appInstallBanner').hidden=true;closeInstallHelp();toast('WIZE MARKET installed.')});
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
if(navigator.getInstalledRelatedApps)void navigator.getInstalledRelatedApps().then(apps=>{if(apps.length){try{localStorage.setItem('wm_app_installed','1')}catch{}$('appInstallBanner').hidden=true}}).catch(()=>{});

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
