let manageDeals=false,activeDealRoom=null,dealRoomBusy=false,dealListRequest=0,dealStatus='current',dealSearchTimer,cancelDealDraft=null;
function selectedCrosspostGroups(){return [...document.querySelectorAll('#crosspostGroups input:checked')].map(input=>input.value)}
function renderCrosspostGroups(selected=selectedCrosspostGroups()){const root=$('crosspostGroups');root.replaceChildren();for(const g of groups.filter(g=>g.joined)){const label=node('label',undefined,'crosspost-choice'),input=node('input');input.type='checkbox';input.value=g.id;input.checked=selected.includes(g.id);input.disabled=!!editingPost;label.append(input,avatar({name:g.name,picture:g.logo_id?'/group-logo/'+g.id:null}),node('span',g.name));root.append(label)}if(!root.children.length)root.append(node('p','Join a group to share your public listing there.','hint'));$('crosspostField').hidden=!!$('postGroupSelect').value;}
async function startListingDeal(postId){
 const {deal}=await api('/deals',{postId});$('listingModal').hidden=true;manageDeals=false;dealStatus='current';$('dealSearch').value='';navigate('deals');await loadMessages();await loadDeals();
 toast(deal.status==='awaiting_seller'?'Waiting for seller agreement. Then the Admin can accept.':deal.status==='awaiting_admin'?'Request sent. Waiting for Admin Accept.':'Your existing request is in Messages → Deals.');
 document.querySelector('[data-deal-id="'+deal.id+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});
}
const dealLabels={awaiting_final:'Waiting for Admin final confirmation',awaiting_admin:'Waiting for Admin',awaiting_seller:'Waiting for Seller',proposed:'Terms proposed',active:'Active',completed:'Completed',disputed:'Disputed',cancelled:'Cancelled'};
function renderDealFilters(){
 const root=$('dealStatusTabs');root.replaceChildren();
 for(const [value,label]of [['current','Ongoing'],['previous','Previous'],['website','Website total']]){
  const tab=button(label,async()=>{dealStatus=value;await loadDeals()},'deal-filter-tab');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(value===dealStatus));root.append(tab);
 }
}
async function dealActionRequest(d,action){
 if(['cancel','reject'].includes(action)&&!confirm(action==='cancel'?'Cancel this deal? Only the assigned Admin can close it.':'Reject this deal request?'))return;
 await api('/deals/'+d.id+'/action',{action,version:d.version});if(action==='finalize'&&activeDealRoom?.id===d.id)closeDealRoom();await refreshMe();await loadDeals();
 if(activeDealRoom?.id===d.id)await refreshDealRoom();
}
function appendDealActions(root,d){
 const buyer=me.id===d.buyer_id,seller=me.id===d.seller_id,party=buyer||seller,isAdmin=me.id===d.admin_id&&['owner','trusted'].includes(me.role),participant=party||isAdmin;
 const pending=['proposed','awaiting_admin','awaiting_seller'].includes(d.status),open=pending||['active','awaiting_final','disputed'].includes(d.status);
 const add=(label,action,cls='btn secondary')=>root.append(button(label,()=>dealActionRequest(d,action),cls));
 if(d.status==='awaiting_seller'&&seller)add('Agree to deal terms','confirm','btn');
 if(d.status==='proposed'&&party&&!(buyer?d.buyer_ok:d.seller_ok))add('Agree to deal terms','confirm','btn');
 if(['awaiting_admin','proposed'].includes(d.status)&&isAdmin&&d.buyer_ok&&(d.mode==='direct'||d.seller_ok))add('Accept deal','accept','btn');
 if(pending&&isAdmin)add('Reject request','reject');
 if(open&&isAdmin)add('Cancel deal','cancel');
 if(open&&party&&!isAdmin)root.append(button('Request cancellation',()=>openCancelRequest(d),'btn ghost'));
 if(open&&isAdmin&&d.cancel_pending)add('Decline cancellation request','reject_cancel');
 if(d.status==='active'&&party){
  const done=buyer?d.buyer_done:d.seller_done;
  const complete=button(done?'Completion confirmed · waiting':'Confirm completed',()=>dealActionRequest(d,'complete'),'btn secondary');complete.disabled=!!done;root.append(complete);
 }
 if(['active','awaiting_final'].includes(d.status)&&participant)add('Raise dispute','dispute');
 if(isAdmin&&['active','awaiting_final'].includes(d.status)&&!d.cancel_pending&&d.seller_done){if(d.buyer_done)add('Admin final confirmation','finalize','btn');else if(d.mode==='direct'&&seller)root.append(button('Confirm completion again',()=>openDirectFinal(d),'btn'))}if(d.status==='disputed'&&isAdmin)add('Resolve dispute & resume','resolve_dispute','btn');
 if((['active','awaiting_final','disputed'].includes(d.status)||d.status==='cancelled'&&d.room_opened)&&participant)root.append(button('Open deal room',()=>openDealRoom(d.id),'btn'));
 if(d.status==='completed'&&party)root.append(button('Leave a review',()=>openReview(d.id),'btn secondary'));
}
async function loadDeals(){
 $('dealList').dataset.request=String((Number($('dealList').dataset.request)||0)+1);
 if(!me){empty($('dealList'),'Your deal history.','Sign in to view your deals.');return}
 if(!['owner','trusted'].includes(me.role))manageDeals=false;if(dealStatus==='completed'||dealStatus==='cancelled')dealStatus='previous';renderDealFilters();$('dealSearch').hidden=dealStatus==='website';$('dealScopeNote').hidden=true;$('dealCompletedSummary').hidden=true;if(dealStatus==='website'){++dealListRequest;await renderPublicDeals($('dealList'));return}
 const request=++dealListRequest,params=new URLSearchParams({status:dealStatus==='previous'?'previous':'current',q:$('dealSearch').value});
 const data=await api((manageDeals?'/deal-management':'/deals')+'?'+params);if(request!==dealListRequest)return;deals=data.deals.filter(d=>dealStatus==='previous'?['completed','cancelled'].includes(d.status):!['completed','cancelled'].includes(d.status));renderCompletedSummary(data.summary||{total:0,admins:[]});
 const root=$('dealList');root.replaceChildren();renderDealFilters();
 $('dealScopeNote').textContent=manageDeals?(me.role==='owner'?'All marketplace deal statuses and history. Only the assigned Admin can accept, reject or cancel.':'Deals assigned to you and your own listings.'):'Buyer and seller agree to terms. The assigned Admin accepts and controls cancellation.';
 $('myDealsView').setAttribute('aria-pressed',String(!manageDeals));$('manageDealsView').setAttribute('aria-pressed',String(manageDeals));
 if(!deals.length)empty(root,'No matching deals.','Try another status, Post ID or Deal ID.');
 for(const d of deals){
  if(['completed','cancelled'].includes(d.status)){renderPreviousDeal(d,root);continue}
  const card=node('article',undefined,'card deal-card compact-deal');card.dataset.dealId=d.id;
  const top=node('div',undefined,'compact-deal-heading'),people=node('div',undefined,'compact-deal-avatars');people.append(avatar({name:d.buyer_name,picture:d.buyer_picture}),avatar({name:d.seller_name,picture:d.seller_picture}));const copy=node('div');copy.append(node('strong',d.deal_code+' · '+(d.account_title||'Marketplace account')),node('small',d.buyer_name+' ↔ '+d.seller_name));top.append(people,copy,node('span',dealLabels[d.status]||d.status,'pill deal-state'));card.append(top);
  if(['active','awaiting_final','disputed'].includes(d.status))card.append(button('Open chat',()=>openDealRoom(d.id),'btn deal-chat-open'));
  const detail=node('details',undefined,'deal-request-details');detail.append(node('summary',d.status==='awaiting_seller'&&me.id===d.seller_id?'Review & agree to terms':me.id===d.admin_id&&d.status==='awaiting_admin'?'Review & accept request':'Deal details & controls'));detail.append(node('p',d.listing_code+' · '+formatPrice(d.price)+' · Admin: '+d.admin_name,'hint'));card.append(detail);
  if(d.status==='awaiting_seller')detail.append(node('p','Buyer agreed. Seller agreement is required before Admin acceptance.','hint'));
  if(d.status==='awaiting_admin')detail.append(node('p','Waiting for the assigned Admin to accept. Members can request cancellation; the Admin decides.','hint'));
  if(d.status==='awaiting_final')detail.append(node('p','Buyer and seller confirmed. The assigned Admin must give the final confirmation.','hint'));if(d.cancel_pending)detail.append(node('p','Cancellation requested · awaiting Admin decision\n'+(d.cancel_reasons||''),'deal-cancel-notice'));
  const actions=node('div',undefined,'action-row');appendDealActions(actions,d);
  actions.append(button('Status history',async()=>{
   const {events}=await api('/deals/'+d.id+'/history');let history=detail.querySelector('.deal-history');if(!history){history=node('div',undefined,'deal-history');detail.append(history)}
   history.replaceChildren();for(const event of events)history.append(node('p',event.name+' · '+event.action.replaceAll('_',' ')+' · '+new Date(event.created_at).toLocaleString(),'hint'));
  },'btn ghost'));detail.append(actions);root.append(card);
 }
}
$('myDealsView').onclick=async()=>{manageDeals=false;await loadDeals()};$('manageDealsView').onclick=$('dealManagement').onclick=async()=>{manageDeals=true;navigate('deals');await loadDeals()};$('refreshDeals').onclick=()=>void loadDeals().catch(e=>toast(e.message));
$('dealSearch').oninput=()=>{clearTimeout(dealSearchTimer);dealSearchTimer=setTimeout(()=>void loadDeals().catch(e=>toast(e.message)),250)};
function openCancelRequest(d){cancelDealDraft=d;$('dealCancelReason').value='';$('dealCancelModal').hidden=false;$('dealCancelReason').focus()}
function closeCancelRequest(){cancelDealDraft=null;$('dealCancelModal').hidden=true} $('closeDealCancel').onclick=closeCancelRequest;
$('dealCancelForm').onsubmit=async e=>{e.preventDefault();if(!cancelDealDraft)return;const b=e.submitter;b.disabled=true;try{await api('/deals/'+cancelDealDraft.id+'/action',{action:'request_cancel',reason:$('dealCancelReason').value,version:cancelDealDraft.version});closeCancelRequest();await loadDeals();if(activeDealRoom)await refreshDealRoom();toast('Cancellation requested. The deal stays open until the Admin decides.')}catch(error){toast(error.message)}finally{b.disabled=false}};
function renderDealRoomSummary(deal){
 $('dealRoomTitle').textContent=deal.deal_code;const root=$('dealRoomSummary');root.replaceChildren();
 const info=node('div',undefined,'deal-room-info');
 for(const [label,value]of [['Post ID',deal.listing_code],['Account',deal.account_title||deal.title||'Marketplace account'],['Price',formatPrice(deal.price)],['Status',dealLabels[deal.status]||deal.status]]){
  const item=node('div',undefined,'deal-info-item');item.append(node('small',label),node('strong',value));info.append(item);
 }
 const people=node('div',undefined,'deal-participants');
 const participants=[['Buyer',deal.buyer_name],...(deal.mode==='direct'?[['Seller / Admin',deal.seller_name]]:[['Seller',deal.seller_name],['Admin',deal.admin_name]])];
 for(const [role,name]of participants){const key=role==='Buyer'?'buyer':role==='Admin'?'admin':'seller';const person=node('div',undefined,'deal-participant');person.append(avatar({name,picture:deal[key+'_picture']}));if(deal[key+'_verified'])person.append(verifiedMark('member'));person.append(node('span',role,'participant-badge'),node('span',name));people.append(person)}
 const details=node('details',undefined,'deal-room-details');details.append(node('summary',(deal.account_title||'Marketplace account')+' · '+formatPrice(deal.price)),info,people);root.append(details);if(deal.cancel_pending)root.append(node('p','Cancellation request awaiting Admin decision','deal-cancel-notice'));
 const controls=$('dealRoomActions');controls.replaceChildren();const detached=node('div');appendDealActions(detached,deal);
 // Keep lifecycle controls in the room, without another Open room button.
 for(const control of [...detached.children])if(control.textContent!=='Open deal room'&&control.textContent!=='Leave a review')controls.append(control);
}
async function openDealRoom(id){
 const {deal}=await api('/deals/'+id);if(deal.status==='completed'){dealStatus='completed';navigate('deals');await loadMessages();await loadDeals();return}activeDealRoom=deal;renderDealRoomSummary(deal);$('dealRoomModal').hidden=false;document.body.classList.add('deal-room-open');
 delete $('dealRoomMessages').dataset.signature;sizeDealRoomViewport();await refreshDealRoom();$('dealRoomText').focus();
}
async function refreshDealRoom(){
 if(!activeDealRoom||dealRoomBusy)return;dealRoomBusy=true;const id=activeDealRoom.id;
 try{
  const {messages,deal}=await api('/deals/'+id+'/messages');if(activeDealRoom?.id!==id)return;if(deal.status==='completed'){closeDealRoom();void loadDeals().catch(e=>toast(e.message));toast('Deal completed. It is now in Previous deals.');return}
  if(activeDealRoom.version!==deal.version||activeDealRoom.status!==deal.status){activeDealRoom=deal;renderDealRoomSummary(deal)}
  const root=$('dealRoomMessages'),signature=JSON.stringify(messages),nearBottom=root.scrollHeight-root.scrollTop-root.clientHeight<80;
  if(root.dataset.signature!==signature){
   root.replaceChildren();for(const m of [...messages].reverse()){
    const bubble=node('div',undefined,'bubble'+(m.user_id===me.id?' mine':'')),head=node('div',undefined,'bubble-heading');
    const identity=node('span',undefined,'deal-message-name');identity.append(node('strong',m.name));if(m.verified)identity.append(verifiedMark('member'));head.append(avatar({name:m.name,picture:m.picture}),identity,node('span',m.participant_role,'participant-badge'));
    const message=node('p',m.text.replace(/^chat:/,''));message.dir='ltr';
    const time=node('time',new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'message-time');time.dateTime=new Date(m.created_at).toISOString();time.title=new Date(m.created_at).toLocaleString();
    bubble.append(head,message,time);root.append(bubble);
   }
   if(!messages.length)root.append(node('p','Private conversation for this deal.','hint'));if(nearBottom||!root.dataset.signature)root.scrollTop=root.scrollHeight;root.dataset.signature=signature;
  }
  $('dealRoomForm').hidden=!['active','awaiting_final','disputed'].includes(deal.status);
 }finally{dealRoomBusy=false}
}
function sizeDealRoomViewport(){if(!activeDealRoom)return;const v=window.visualViewport;$('dealRoomModal').style.setProperty('--deal-height',(v?.height||window.innerHeight)+'px');$('dealRoomModal').style.setProperty('--deal-top',(v?.offsetTop||0)+'px')}
window.visualViewport?.addEventListener('resize',sizeDealRoomViewport);window.visualViewport?.addEventListener('scroll',sizeDealRoomViewport);window.addEventListener('resize',sizeDealRoomViewport);
function closeDealRoom(){activeDealRoom=null;$('dealRoomModal').hidden=true;document.body.classList.remove('deal-room-open')} $('closeDealRoom').onclick=closeDealRoom;$('dealRoomModal').onclick=e=>{if(e.target===$('dealRoomModal'))closeDealRoom()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDealRoom();closeCancelRequest()}});
$('dealRoomForm').onsubmit=async e=>{e.preventDefault();if(!activeDealRoom)return;const button=e.submitter;button.disabled=true;try{await api('/deals/'+activeDealRoom.id+'/messages',{text:$('dealRoomText').value});$('dealRoomText').value='';await refreshDealRoom()}catch(err){toast(err.message)}finally{button.disabled=false}};
setInterval(()=>{if(activeDealRoom&&!document.hidden)void refreshDealRoom().catch(e=>toast(e.message))},4000);
function renderCompletedSummary(summary){
 const root=$('dealCompletedSummary');root.replaceChildren();const jump=button('Previous deals · '+summary.total+' completed',async()=>{dealStatus='completed';await loadDeals()},'previous-deals-toggle');root.append(jump);
 if(dealStatus==='previous'){const totals=node('div',undefined,'completed-admin-totals');for(const admin of summary.admins){const row=node('div',undefined,'completed-admin-row');row.append(avatar(admin),node('strong',admin.name));if(admin.verified)row.append(verifiedMark('member'));row.append(node('span',admin.completed+' completed'));totals.append(row)}root.append(totals)}
}
function renderPreviousDeal(d,root){
 const row=node('article',undefined,'card previous-deal-row');row.append(node('span',(d.status==='cancelled'?'Cancelled · ':'Completed · ')+d.deal_code+' · '+d.listing_code,'hint'),node('h3',d.account_title||d.title),node('strong',formatPrice(d.price)));
 const people=node('div',undefined,'previous-deal-people');for(const [key,role]of [['buyer','Buyer'],['seller','Seller'],['admin','Admin']]){if(key==='admin'&&d.admin_id===d.seller_id)continue;const person=node('div');person.append(avatar({name:d[key+'_name'],picture:d[key+'_picture']}),node('span',role+': '+d[key+'_name']));if(d[key+'_verified'])person.append(verifiedMark('member'));people.append(person)}row.append(people);
 if(d.completed_at)row.append(node('p','Completed '+new Date(d.completed_at).toLocaleString(),'hint'));if(d.completion_note)row.append(node('p','Admin completion note: '+d.completion_note,'hint'));
 row.append(button('View history',async()=>{const {events}=await api('/deals/'+d.id+'/history');let history=row.querySelector('.deal-history');if(!history){history=node('div',undefined,'deal-history');row.append(history)}history.replaceChildren();for(const event of events)history.append(node('p',event.name+' · '+event.action.replaceAll('_',' ')+' · '+new Date(event.created_at).toLocaleString(),'hint'))},'btn ghost'));if(d.status==='completed'&&[d.buyer_id,d.seller_id].includes(me.id))row.append(button('Leave a review',()=>openReview(d.id),'btn ghost'));root.append(row);
}
let directFinalDraft=null;
function openDirectFinal(d){directFinalDraft=d;$('directFinalForm').reset();$('directFinalNotice').textContent=d.deal_code+': the buyer has not confirmed completion. Your second Admin confirmation will finish this direct deal.';$('directFinalModal').hidden=false}
$('closeDirectFinal').onclick=()=>{$('directFinalModal').hidden=true;directFinalDraft=null};
$('directFinalForm').onsubmit=async e=>{e.preventDefault();if(!directFinalDraft)return;const b=e.submitter;b.disabled=true;try{await api('/deals/'+directFinalDraft.id+'/action',{action:'finalize',version:directFinalDraft.version,doubleConfirm:$('directFinalAck').checked,reason:$('directFinalReason').value});$('directFinalModal').hidden=true;directFinalDraft=null;closeDealRoom();await refreshMe();await loadDeals();toast('Admin final confirmation saved. Deal moved to Previous deals.')}catch(error){toast(error.message)}finally{b.disabled=false}};
function renderProfileHero(p,own){const root=$('profileContent');root.replaceChildren();const hero=node('article',undefined,'gaming-profile social-profile'),cover=node('div',undefined,'gaming-cover'),art=node('img');art.src=p.cover||'/assets/profile-cover.webp';art.alt='Profile banner';art.className='profile-cover-art';cover.append(art);if(own)cover.append(socialAction('Edit cover','camera',()=>openProfileEditor(true),'cover-edit'));const body=node('div',undefined,'gaming-profile-body'),portrait=node('div',undefined,'gaming-portrait');portrait.append(avatar(p));if(own)portrait.append(iconButton('Change profile picture','camera',()=>openProfileEditor(false,true),'portrait-camera'));const identity=node('div',undefined,'profile-identity'),name=node('div',undefined,'profile-name');name.append(node('h1',p.name));if(p.verified)name.append(verifiedMark(p.role));identity.append(name,node('p',p.username?'@'+p.username:own?'Choose your username':'Community member','profile-handle'));const stats=node('div',undefined,'profile-social-stats');for(const [key,label]of [['friends','Friends'],['following','Following'],['deals','Completed deals']]){const stat=button('',()=>key==='deals'?loadProfileTab('deals'):openConnections(p.id,key),'profile-social-stat');stat.append(node('strong',String(p[key]||0)),node('span',label));stats.append(stat)}identity.append(stats);const actions=node('div',undefined,'profile-actions'),menu=[['Edit profile',()=>openProfileEditor()],['Account security',openAccountSecurity]];if(!own){actions.append(friendButton(p,async()=>{await refreshMe();await loadProfileView()}),socialAction('Message','chat',async()=>{const {thread}=await api('/threads',{userId:p.id});navigate('messages');await loadMessages();await openChat('private',thread.id)},'profile-message-button'))}if(!own&&p.contact_blocked){for(const action of actions.querySelectorAll('button'))action.disabled=true;actions.append(node('span','Private contact unavailable','hint'))}const menuToggle=iconButton('Open profile menu','menu',()=>openProfileDrawer(me,menu,menuToggle),'profile-menu-toggle');menuToggle.setAttribute('aria-controls','profileMenuPanel');menuToggle.setAttribute('aria-expanded','false');const publicActions=[['Share profile',()=>shareUrl(p.name,profileUrl(p))]];if(!own)publicActions.push([p.blocked_by_me?'Unblock member':'Block member',()=>blockMember(p,!p.blocked_by_me)]);const shareMenu=moreMenu(publicActions,'Share or block profile');shareMenu.classList.add('profile-share-menu');shareMenu.querySelector('summary').replaceChildren(socialIcon('arrow'));cover.append(menuToggle,shareMenu);body.append(portrait,identity);if(!own)body.append(actions);if(p.bio)body.append(node('p',p.bio,'gaming-bio'));else if(own)body.append(button('Add a bio',()=>openProfileEditor(),'profile-add-bio'));if(p.role==='owner'||p.role==='trusted'){const role=node('span',undefined,'trust-badge');role.append(socialIcon('shield'),node('span',p.role==='owner'?'Owner · Trusted Admin':'Trusted Admin'));body.append(role)}if(p.trusted_seller)body.append(sellerBadge());hero.append(cover,body);root.append(hero);if(own&&p.suspension){const notice=node('section',undefined,'card suspension-notice');notice.append(node('h2','Account temporarily suspended'),node('p',p.suspension.reason),node('p','Posting resumes '+new Date(p.suspension.until_at).toLocaleString(),'hint'),button(p.suspension.appealed?'Review requested':'Request a review',async()=>{await api('/safety/appeal',{});await refreshMe()}));root.append(notice)}renderProfileTabs(own)}
async function openConnections(id,kind){if(!requireLogin())return;$('friendsModal').hidden=false;const root=$('friendsContent');root.replaceChildren(node('h3',kind[0].toUpperCase()+kind.slice(1)),node('p','Loading…','hint'));try{const {people}=await api('/profile/'+encodeURIComponent(id)+'/connections?kind='+kind);root.replaceChildren(node('h3',kind[0].toUpperCase()+kind.slice(1)+' · '+people.length));if(id===me.id)root.append(button('Friend requests',openFriends,'btn secondary'));if(!people.length)root.append(node('p','Nobody here yet.','hint'));for(const p of people){const row=node('div',undefined,'connection-row');const visit=button('',async()=>{$('friendsModal').hidden=true;await showProfile(p.id)},'connection-person');visit.append(avatar(p));const copy=node('span');copy.append(node('strong',p.name));if(p.username)copy.append(node('small','@'+p.username));visit.append(copy);row.append(visit);if(p.id!==me.id)row.append(friendButton(p,()=>openConnections(id,kind)));root.append(row)}}catch(e){root.append(node('p',e.message,'hint'))}}
const pendingDeal=new URLSearchParams(location.search).get('deal');if(pendingDeal){const timer=setInterval(async()=>{if(!me)return;clearInterval(timer);navigate('deals');try{const {deal}=await api('/deals/'+encodeURIComponent(pendingDeal));if(['active','completed','disputed'].includes(deal.status))await openDealRoom(deal.id)}catch(e){toast(e.message)}},500)}

let dealListPolling=false;setInterval(async()=>{if(dealListPolling||document.hidden||!me||!(active==='messages'&&messengerMode==='deals')||activeDealRoom||dealStatus!=='current')return;dealListPolling=true;try{await loadDeals()}catch{}finally{dealListPolling=false}},8000);

function hiddenGuestPosts(){try{const ids=JSON.parse(localStorage.getItem('wm_hidden_public_posts')||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(-500):[]}catch{return []}}
async function hideListingForViewer(p){
 if(me)await api('/posts/'+p.id+'/interest',{interested:false});else{const ids=hiddenGuestPosts();if(!ids.includes(p.id))ids.push(p.id);try{localStorage.setItem('wm_hidden_public_posts',JSON.stringify(ids.slice(-500)))}catch{toast('Your browser could not remember this preference.')}}
 for(const post of document.querySelectorAll('[data-post-id="'+p.id+'"]'))post.remove();feed=feed.filter(post=>post.id!==p.id);$('feedStatus').textContent=feed.length+(feed.length===1?' post':' posts');toast('Post hidden from your feed.');
}
let profileMenuTrigger=null;
function openProfileDrawer(person,items,trigger){
 profileMenuTrigger=trigger;const identity=$('profileMenuIdentity');identity.replaceChildren(avatar(person));const copy=node('div');copy.append(node('strong',person.name));if(person.username)copy.append(node('small','@'+person.username));identity.append(copy);if(person.verified)identity.append(verifiedMark(person.role));
 const root=$('profileMenuItems');root.replaceChildren();for(const [label,action]of items)root.append(button(label,async()=>{closeProfileDrawer(false);await action()},'profile-drawer-item'));
 trigger.setAttribute('aria-expanded','true');$('profileMenuModal').hidden=false;document.body.classList.add('profile-menu-open');$('closeProfileMenu').focus();
}
function closeProfileDrawer(restore=true){$('profileMenuModal').hidden=true;document.body.classList.remove('profile-menu-open');profileMenuTrigger?.setAttribute('aria-expanded','false');if(restore&&profileMenuTrigger?.isConnected)profileMenuTrigger.focus();profileMenuTrigger=null}
$('closeProfileMenu').onclick=()=>closeProfileDrawer();$('profileMenuModal').onclick=e=>{if(e.target===$('profileMenuModal'))closeProfileDrawer()};
document.addEventListener('keydown',e=>{if($('profileMenuModal').hidden)return;if(e.key==='Escape'){e.preventDefault();closeProfileDrawer();return}if(e.key==='Tab'){const controls=[...$('profileMenuPanel').querySelectorAll('button:not([disabled]),a[href]')],first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
