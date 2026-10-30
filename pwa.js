let deferredInstall=null;
const installedApp=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function closeInstallHelp(){$('installHelp').hidden=true}
async function installMarketApp(){
 if(installedApp())return toast('WIZE MARKET is already open as an app.');
 if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')$('appInstallBanner').hidden=true;return}
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 $('installInstructions').textContent=ios?'Open this website in Safari. Tap Share, then Add to Home Screen and confirm Add.':'Open your browser menu (⋮), then choose Install app or Add to Home screen. If this is an in-app browser, open the website in Chrome first.';
 $('installHelp').hidden=false;$('closeInstallHelp').focus();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;if(!installedApp())$('appInstallBanner').hidden=false});
window.addEventListener('appinstalled',()=>{deferredInstall=null;$('appInstallBanner').hidden=true;closeInstallHelp();toast('WIZE MARKET installed.')});
$('installApp').onclick=()=>void installMarketApp().catch(e=>toast(e.message));
$('dismissInstall').onclick=()=>{$('appInstallBanner').hidden=true;try{sessionStorage.setItem('wm_install_dismissed','1')}catch{}};
$('closeInstallHelp').onclick=closeInstallHelp;$('installHelp').onclick=e=>{if(e.target===$('installHelp'))closeInstallHelp()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeInstallHelp()});
try{$('appInstallBanner').hidden=installedApp()||sessionStorage.getItem('wm_install_dismissed')==='1'}catch{$('appInstallBanner').hidden=installedApp()}
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
let featureView='deals',featuresRequest=0;
async function loadFeatures(){const request=++featuresRequest;const root=$('featureContent');root.replaceChildren();if(featureView==='deals'){await renderPublicDeals(root);return}const {groups:directory}=await api('/groups');if(request!==featuresRequest)return;root.append(node('h2','Community groups'));for(const g of directory){const row=button('',async()=>{if(!requireLogin())return;await api('/groups/'+g.id+'/join',{});navigate('messages');await loadMessages();await openChat('group',g.id)},'chat-row');row.append(avatar({name:g.name,picture:g.logo_id?'/group-logo/'+g.id:null}),node('strong',g.name),node('small',g.joined?'Open group':'Join group'));root.append(row)}if(!directory.length)root.append(node('p','No community groups yet.','hint'))}
$('featureDeals').onclick=()=>{featureView='deals';void loadFeatures().catch(e=>toast(e.message))};$('featureGroups').onclick=()=>{featureView='groups';void loadFeatures().catch(e=>toast(e.message))};$('featureInstall').onclick=()=>void installMarketApp().catch(e=>toast(e.message));
