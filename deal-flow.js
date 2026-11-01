// Protected deal steps, secure handover, deal proofs, listing tools, badges, trust card and chat safety notes.
let marketRulesCache=null;
async function loadMarketRules(){try{marketRulesCache=(await api('/market-rules')).rules}catch{}return marketRulesCache}
const dealTime=t=>t?new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const DEAL_EVENT_LABELS={requested:'Deal request sent',accept:'Admin accepted the deal',activate:'Admin accepted the deal',payment_sent:'Buyer sent the money',payment_received:'Admin got the money',handover_ready:'Buyer is ready for the login',handover_submitted:'Seller sent the login safely',handover_revealed:'Buyer opened the login',delivered:'Seller gave the ID',buyer_confirmed:'Buyer got the ID',seller_paid:'Deal complete',auto_confirmed:'Buyer did not reply · confirmed automatically',dispute:'Problem reported',resolve_dispute:'Problem solved · deal continues',resolve_redeliver:'Problem solved · seller gives the ID again',finalize:'Deal complete',cancel:'Deal cancelled',reject:'Admin said no',cancel_requested:'Cancel requested',cancel_request_rejected:'Cancel request turned down',admin_changed:'Admin changed'};
const CHECKLIST_LABELS={login_checked:'I logged in and the account matches the post (level, items, rank).',email_changed:'I bound my own email / Gmail and removed the seller’s.',password_changed:'I changed every password (game login, Facebook / Google).',links_removed:'I removed the seller’s Facebook / Google / VK / X links.',recovery_changed:'I changed the recovery phone and 2-step verification.'};
const PROTECTED_STEPS=['Money sent','Money received','ID received','Complete'];

function dealSystemLine(m){const line=node('div',undefined,'deal-system-line');line.append(node('span',(DEAL_EVENT_LABELS[m.text]||String(m.text).replaceAll('_',' '))+(m.name?' · '+m.name:'')),node('time',new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));return line}
function dealRoles(d){const buyer=me?.id===d.buyer_id,seller=me?.id===d.seller_id,isAdmin=me?.id===d.admin_id&&['owner','trusted'].includes(me?.role);return {buyer,seller,isAdmin,participant:buyer||seller||isAdmin}}
function protectedStage(d){if(d.status==='completed')return 4;if(d.status==='cancelled')return -1;if(['proposed','awaiting_admin','awaiting_seller'].includes(d.status))return 0;if(d.buyer_done)return 3;if(d.funded_at)return 2;if(d.paid_at)return 1;return 0}
function protectedTimes(d){const rules=marketRulesCache||{holdHours:d.hold_hours??0,autoConfirmHours:d.auto_confirm_hours??72},start=d.delivered_at||d.funded_at||0;return {holdUntil:d.hold_until??(d.buyer_done_at?d.buyer_done_at+rules.holdHours*3600000:start?start+rules.holdHours*3600000:null),autoAt:d.auto_confirm_at??(start?start+rules.autoConfirmHours*3600000:null)}}
function protectedStepText(d){
 const {buyer,seller,isAdmin}=dealRoles(d),{holdUntil,autoAt}=protectedTimes(d),stage=protectedStage(d),direct=d.admin_id===d.seller_id;
 if(d.status==='disputed')return '⚠️ Problem reported: '+(d.dispute_reason||'see the chat')+'. '+(direct?'The Owner will check it.':'The Admin will check it.');
 if(['proposed','awaiting_admin','awaiting_seller'].includes(d.status))return '⏳ Pending: waiting for the '+(d.status==='awaiting_seller'?'seller':'Admin')+' to accept.';
 if(stage===0)return buyer?'💳 Send the money to the Admin’s number in this chat. Then tap “Money sent” and add the screenshot.':isAdmin?'💳 Give your bKash / Nagad number in this chat. Tap “Money received” when the money comes.':'⏳ Waiting for the buyer to send the money.';
 if(stage===1)return isAdmin?'🧾 The buyer sent the money. Check your account, then tap “Money received”.':'⏳ Waiting for the Admin to get the money.';
 if(stage===2)return seller?'🔑 The Admin has the money. Give the ID to the buyer now.':buyer?'🔒 Your money is safe with the Admin. When you get the ID, change its password and email, then tap “I got the ID”.':'⏳ Waiting for the buyer to get the ID'+(autoAt?' (if the buyer does not reply, you can complete after '+dealTime(autoAt)+').':'.');
 if(stage===3)return isAdmin?'🎉 The buyer got the ID. Pay the seller'+(Date.now()<holdUntil?' after '+dealTime(holdUntil):'')+', then tap “Complete deal”.':seller?'💸 The buyer got the ID. The Admin will pay you and complete the deal.':'🎉 Done on your side. The Admin will complete the deal.';
 if(stage===4)return '✅ Deal complete.';
 return '';
}
function appendProtectedSteps(root,d,ctx){
 const {buyer,isAdmin,participant}=ctx,owner=me?.role==='owner',live=['active','awaiting_final'].includes(d.status),time=Date.now(),direct=d.admin_id===d.seller_id;
 const step=(label,fn,cls='btn')=>{const b=button(label,fn,cls);b.dataset.dealStep='1';root.append(b);return b};
 if(d.status==='active'&&buyer&&!d.paid_at&&!d.funded_at)step('💳 Money sent',()=>openDealStep(d,'mark_paid'));
 if(d.status==='active'&&isAdmin&&!d.funded_at)step('✅ Money received',()=>openDealStep(d,'confirm_payment'));
 if(d.status==='active'&&buyer&&d.funded_at&&!d.buyer_done)step('✅ I got the ID',()=>openDealStep(d,'buyer_confirm'));
 if(isAdmin&&live&&d.funded_at&&!d.cancel_pending&&!(direct&&d.buyer_done)){const {holdUntil,autoAt}=protectedTimes(d),opensAt=d.buyer_done?holdUntil:Math.max(holdUntil||0,autoAt||0),ready=time>=opensAt;if(d.buyer_done||!direct||ready){const b=step(ready?'🎉 Complete deal':'🎉 Complete deal (after the buyer gets the ID)',()=>openDealStep(d,'finalize'),ready?'btn':'btn secondary');b.disabled=!ready}}
 if(live&&participant)step('⚠️ Report a problem',()=>openDealStep(d,'dispute'),'btn ghost');
 if(d.status==='disputed'&&(owner||isAdmin&&!direct)){step('▶️ Continue deal',()=>protectedRequest(d,'resolve_dispute',{}),'btn secondary');if(owner&&!isAdmin)step('✖️ Cancel deal & refund buyer',()=>protectedRequest(d,'cancel',{},'Cancel this deal? Send the money back to the buyer first.'),'btn ghost')}
}
async function afterDealChange(d){try{await refreshMe()}catch{}if(activeDealRoom?.id===d.id)await refreshDealRoom();await loadDeals().catch(()=>{})}
async function protectedRequest(d,action,extra={},confirmText){if(confirmText&&!confirm(confirmText))return;await api('/deals/'+d.id+'/action',{action,version:d.version,...extra});await afterDealChange(d)}

// One small dialog serves every step form, created on first use in the existing modal style.
function stepDialog(){
 let modal=document.getElementById('dealStepModal');if(modal)return modal;
 modal=node('div',undefined,'modal deal-step-modal');modal.id='dealStepModal';modal.hidden=true;
 const form=node('form',undefined,'dialog card deal-step-form'),head=node('div',undefined,'page-heading'),close=node('button','×','btn ghost');close.type='button';close.id='closeDealStep';close.setAttribute('aria-label','Close');close.onclick=()=>closeStepDialog();
 head.append(node('h2','Deal step'),close);form.append(head,node('div',undefined,'deal-step-body'),node('p','','hint deal-step-status'));const submit=node('button','Confirm','btn');submit.type='submit';form.append(submit);modal.append(form);
 modal.onclick=e=>{if(e.target===modal)closeStepDialog()};document.body.append(modal);return modal;
}
function closeStepDialog(){const modal=document.getElementById('dealStepModal');if(!modal)return;modal.hidden=true;modal.querySelector('.deal-step-body').replaceChildren();modal.querySelector('form').onsubmit=null}
function openStepDialog(title,build,submitLabel,onSubmit){
 const modal=stepDialog(),form=modal.querySelector('form'),body=modal.querySelector('.deal-step-body'),status=modal.querySelector('.deal-step-status'),submit=form.querySelector('[type=submit]');
 form.querySelector('h2').textContent=title;body.replaceChildren();status.textContent='';build(body);submit.textContent=submitLabel;submit.hidden=!onSubmit;submit.disabled=false;
 form.onsubmit=async e=>{e.preventDefault();if(!onSubmit)return closeStepDialog();submit.disabled=true;status.textContent='Saving…';try{await onSubmit(body);closeStepDialog()}catch(error){status.textContent=error.message;submit.disabled=false}};
 modal.hidden=false;body.querySelector('input,textarea,select')?.focus();
}
function field(body,label,input){const id='step-'+Math.random().toString(36).slice(2);input.id=id;const l=node('label',label);l.htmlFor=id;body.append(l,input);return input}
function textInput(max,required=false,placeholder=''){const i=node('input',undefined,'input');i.maxLength=max;i.required=required;i.placeholder=placeholder;i.autocomplete='off';return i}
function proofInput(){const i=node('input',undefined,'input');i.type='file';i.accept='image/png,image/jpeg,image/webp,image/*';return i}
async function uploadDealProof(dealId,file,kind){
 if(!file)return null;let prepared=file;try{prepared=await preparePostPhoto(file)}catch{}
 if(!['image/jpeg','image/png','image/webp'].includes(prepared.type)||prepared.size>6*1024*1024)throw Error('Attach a JPG, PNG or WebP screenshot under 6 MB.');
 const response=await fetch('/api/deals/'+dealId+'/proof',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':prepared.type,'x-proof-kind':kind},body:prepared}),data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Screenshot upload failed');return data.id;
}
function openDealStep(d,action){
 const send=async extra=>{await api('/deals/'+d.id+'/action',{action,version:d.version,...extra});await afterDealChange(d)};
 const confirmBox=(body,text)=>{const label=node('label',undefined,'deal-check'),box=node('input');box.type='checkbox';box.required=true;label.append(box,node('span',text));body.append(label)};
 if(action==='mark_paid')return openStepDialog('💳 Money sent',body=>{body.append(node('p','Send money only to the Admin’s number in this chat. Then add the payment screenshot (bKash / Nagad / Rocket).','hint'));const proof=field(body,'Payment screenshot',proofInput());proof.required=true;proof.dataset.role='proof'},'Send',async body=>{const file=body.querySelector('[data-role=proof]').files[0];if(!file)throw Error('Add the payment screenshot.');const proofId=await uploadDealProof(d.id,file,'payment');await send({proofId})});
 if(action==='confirm_payment')return openStepDialog('✅ Money received',body=>{body.append(node('p','Tap only when the money is really in your account. Then the seller gives the ID.','hint'));if(d.proofs?.some(p=>p.kind==='payment'))body.append(button('🧾 See the buyer’s screenshot',()=>window.open('/api/deals/'+d.id+'/proofs/'+d.proofs.find(p=>p.kind==='payment').id,'_blank','noopener'),'btn ghost'));confirmBox(body,'I got '+formatPrice(d.price)+' in my account.')},'Money received',()=>send({}));
 if(action==='buyer_confirm')return openStepDialog('✅ I got the ID',body=>{body.append(node('p','Log in first. Change the password, add your own email and remove the seller’s links. Then confirm.','hint'));confirmBox(body,'I got the ID and changed its login.');const proof=field(body,'Screenshot (optional, only you, the Admin and the Owner can see it)',proofInput());proof.dataset.role='proof'},'I got the ID',async body=>{const proofId=await uploadDealProof(d.id,body.querySelector('[data-role=proof]').files[0],'checklist');await send({received:true,proofId})});
 if(action==='dispute')return openStepDialog('⚠️ Report a problem',body=>{body.append(node('p','Tell us what went wrong. The money stays with the Admin until it is solved.','hint'));const reason=node('textarea',undefined,'input');reason.maxLength=500;reason.required=true;field(body,'What is the problem?',reason)},'Report',body=>send({reason:body.querySelector('textarea').value.trim()}));
 if(action==='finalize')return openStepDialog('🎉 Complete deal',body=>{body.append(node('p',d.buyer_done?(d.admin_id===d.seller_id?'Complete this deal?':'Pay the seller first. Then complete the deal.'):'The buyer did not reply in time. Complete the deal?','hint'));field(body,'Note (optional)',textInput(200,false,'e.g. Paid by bKash'))},'Complete deal',body=>send({payout:body.querySelector('input').value.trim()}));
}

// Secure handover: encrypted on the server, readable once by the buyer, never by Admin or Owner.
function renderHandoverBox(d){
 const h=d.handover||{},buyer=me?.id===d.buyer_id,seller=me?.id===d.seller_id,box=node('details',undefined,'handover-box');
 if(d.secure_handover===false){const summary=node('summary');summary.append(socialIcon('lock'),node('span','Secure handover'),node('small','Coming soon'));box.append(summary,node('p','Secure handover is being set up by the Owner. Until then, share login details only in this Deal Room and only after the Admin confirms payment. Change every password right after.','hint'));return box}
 box.open=!!(buyer&&(h.waiting||!h.buyer_ready_at&&!d.delivered_at)||seller&&h.buyer_ready_at&&!h.submitted_at);
 const summary=node('summary');summary.append(socialIcon('lock'),node('span','Send login safely'),node('small',h.waiting?'Waiting to open':h.revealed_at?'Opened':h.buyer_ready_at?'Buyer ready':'Not started'));box.append(summary);
 const status=node('ul',undefined,'handover-status'),line=(ok,text)=>status.append(node('li',text,ok?'ok':''));
 line(!!h.buyer_ready_at,h.buyer_ready_at?'Buyer ready · '+dealTime(h.buyer_ready_at):'Buyer has not tapped Ready');
 line(!!h.submitted_at,h.submitted_at?'Seller sent details · '+dealTime(h.submitted_at):'Seller has not sent details');
 line(!!h.revealed_at,h.revealed_at?'Buyer opened them · '+dealTime(h.revealed_at):h.waiting?'Waiting for the buyer to open (one time)':'Not opened');box.append(status);
 const actions=node('div',undefined,'action-row');
 if(buyer&&!h.buyer_ready_at)actions.append(button('I am ready for the login',()=>handoverRequest(d,{action:'ready'}),'btn'));
 if(buyer&&h.waiting)actions.append(button('Open the login (one time)',()=>revealHandover(d),'btn'));
 if(seller&&h.buyer_ready_at)actions.append(button(h.submitted_at?'Send again':'Send the login safely',()=>openHandoverForm(d),'btn'+(h.submitted_at?' secondary':'')));
 if(actions.children.length)box.append(actions);
 box.append(node('p',buyer?'Shown to you once, then deleted from the server. Copy it, then change the password and linked email right away.':seller?'Only the buyer can open this, once. The Admin and Owner cannot read it. Never send passwords in the chat.':'You see only the status. Login details are never shown to the Admin or Owner.','hint'));
 return box;
}
async function handoverRequest(d,data){await api('/deals/'+d.id+'/handover',data);await afterDealChange(d)}
function openHandoverForm(d){
 openStepDialog('Send login details',body=>{
  body.append(node('p','Encrypted and shown to the buyer once. Send only after the buyer is ready.','hint'));
  const method=node('select',undefined,'input');for(const m of ['Facebook','Google / Gmail','VK','X / Twitter','Huawei','Konami ID / Email','Game guest + bind code','Other'])method.append(new Option(m,m));field(body,'Login method',method);
  field(body,'Login ID / email / phone',textInput(200,false)).dataset.role='login';
  const password=textInput(200,false);password.type='password';password.autocomplete='new-password';field(body,'Password',password).dataset.role='password';
  const show=node('label',undefined,'deal-check');const toggle=node('input');toggle.type='checkbox';toggle.onchange=()=>password.type=toggle.checked?'text':'password';show.append(toggle,node('span','Show password'));body.append(show);
  const note=node('textarea',undefined,'input');note.maxLength=600;field(body,'Login code or note (optional)',note);
 },'Send securely',async body=>{
  const value=role=>body.querySelector('[data-role='+role+']').value.trim();
  await api('/deals/'+d.id+'/handover',{action:'submit',method:body.querySelector('select').value,login:value('login'),password:body.querySelector('[data-role=password]').value,note:body.querySelector('textarea').value.trim()});
  await afterDealChange(d);toast('Login details sent securely. The buyer can open them once.');
 });
}
async function revealHandover(d){
 if(!confirm('Open the login details now? They are shown only once and then deleted.'))return;
 const {details}=await api('/deals/'+d.id+'/handover',{action:'reveal'});
 openStepDialog('Login details',body=>{
  body.append(node('p','Copy these now. They will not be shown again. Change the password and linked email immediately.','deal-step-note'));
  for(const [label,value]of [['Login method',details.method],['Login ID',details.login],['Password',details.password],['Code / note',details.note]]){if(!value)continue;const row=node('div',undefined,'secret-row');row.append(node('small',label),node('code',value),button('Copy',async()=>{await navigator.clipboard.writeText(value);toast(label+' copied')},'btn ghost'));body.append(row)}
 },'Done',async()=>{});
 await afterDealChange(d);
}
function renderDealProgress(d){
 const box=node('section',undefined,'deal-progress'),stage=protectedStage(d),steps=node('ol',undefined,'deal-steps');box.setAttribute('aria-label','Deal progress');
 PROTECTED_STEPS.forEach((label,i)=>{const li=node('li',undefined,'deal-step'+(stage>=i+1?' done':stage===i?' current':''));li.append(node('span',undefined,'deal-step-dot'),node('small',label));steps.append(li)});
 box.append(steps,node('p',protectedStepText(d),'deal-next-step'));
 const facts=[];if(d.game_uid)facts.push(['Game UID',d.game_uid]);if(d.paid_note)facts.push(['Buyer payment note',d.paid_note]);if(d.payment_trx)facts.push(['Payment TrxID',d.payment_trx]);if(d.payout_note)facts.push(['Seller payout',d.payout_note]);
 if(facts.length){const list=node('dl',undefined,'deal-facts');for(const [k,v]of facts)list.append(node('dt',k),node('dd',v));box.append(list)}
 if(d.proofs?.length){const row=node('div',undefined,'deal-proof-row');for(const proof of d.proofs)row.append(button({payment:'🧾 Payment screenshot',checklist:'🖼️ Buyer’s screenshot',delivery:'🖼️ Seller’s screenshot'}[proof.kind]||'Screenshot',()=>window.open('/api/deals/'+d.id+'/proofs/'+proof.id,'_blank','noopener'),'btn ghost'));box.append(row)}
 // Secure handover appears only once the money is with the Admin, until the ID is handed over (and only if the Owner set it up).
 if(d.secure_handover!==false&&d.funded_at&&['active','disputed'].includes(d.status)&&(!d.buyer_done||d.handover?.waiting))box.append(renderHandoverBox(d));
 const actions=node('div',undefined,'action-row deal-step-actions');appendProtectedSteps(actions,d,dealRoles(d));if(actions.children.length)box.append(actions);
 return box;
}

// Listing tools: Boost (free bump / renew) next to Share, Updated and Expired labels.
function listingExpiredForOwner(p){const days=marketRulesCache?.expireDays;return !!days&&Math.max(p.created_at||0,p.bumped_at||0,p.renewed_at||0)<Date.now()-days*86400000}
function boostButton(p){
 if(p.user_id!==me?.id||p.status!=='approved'||p.availability==='sold')return null;
 const expired=listingExpiredForOwner(p),b=iconButton(expired?'Renew post':'Boost post to the top of the feed','bolt',async()=>{
  try{await api('/posts/'+p.id+'/bump',{});toast(expired?'🚀 Post renewed and back in the feed.':'🚀 Boosted! Your post is now at the top of the feed.');if(active==='profile')await loadProfileView();else if(active==='home')await loadFeed()}catch(error){toast(error.message)}
 },'reaction-button boost-button');b.append(node('span',expired?'Renew':'Boost','boost-label'));return b;
}
function appendListingLabels(root,p){
 const labels=node('div',undefined,'listing-labels');
 if(p.media_updated_at)labels.append(node('span','Updated','listing-label updated'));
 if(p.user_id===me?.id&&p.status==='approved'&&p.availability!=='sold'&&listingExpiredForOwner(p))labels.append(node('span','Expired · tap Renew to show it in the feed','listing-label expired'));
 if(labels.children.length)root.append(labels);
}
async function precheckPost(payload,editId){await api('/posts/precheck',{postIntent:payload.postIntent,kind:payload.kind,price:payload.price,gameCategory:payload.gameCategory,customGameName:payload.customGameName,gameUid:payload.gameUid,...(editId?{editId}:{})})}

// Badges come only from database flags. Tapping one opens the member's trust card.
function openTrustCard(userId){
 openStepDialog('Member info',body=>{body.append(node('p','Loading…','hint'));void api('/profile/'+encodeURIComponent(userId)+'/trust').then(({trust:t})=>{
  body.replaceChildren();const head=node('div',undefined,'trust-head');head.append(avatar(t),node('strong',t.name));body.append(head);
  const badge=t.role==='owner'?'Owner':t.role==='trusted'?'Admin':t.verified?'Verified member':'Not verified yet';
  const list=node('dl',undefined,'deal-facts');
  for(const [k,v]of [['Badge',badge],['Verified by Wize Market',t.role==='owner'?'Owner account':t.verified_at?new Date(t.verified_at).toLocaleDateString():'Not verified'],['Member since',new Date(t.created_at).toLocaleDateString()],['Completed deals',String(t.completed_party)],...(t.role!=='member'?[['Deals handled as Admin',String(t.completed_admin)]]:[]),['Deals with a problem',t.total?t.disputed+' of '+t.total:'0']])list.append(node('dt',k),node('dd',v));
  body.append(list,node('p','Only the Owner gives badges. Nobody can buy them or type them into a name.','hint'));
 }).catch(e=>{body.replaceChildren(node('p',e.message,'hint'))})},'Close',null);
}

// Private chats: warn (never block) when someone shares a phone number, payment app or outside link.
function offPlatformRisk(value){
 const v=String(value).normalize('NFKC').toLowerCase().replace(/[০-৯]/g,c=>String(c.charCodeAt(0)-2534));
 return /(?:\+?88[\s.-]*)?01[3-9](?:[\s().-]*\d){8}/.test(v)||/(?:bkash|b-kash|বিকাশ|nagad|নগদ|rocket|রকেট|upay|whats\s*app|হোয়াটসঅ্যাপ|telegram|টেলিগ্রাম|imo\b|wa\.me|t\.me\/|https?:\/\/|www\.)/i.test(v);
}
function syncChatSafetyNote(){
 const input=$('messageText');if(!input)return;let note=$('chatSafetyNote');
 const show=marketRulesCache?.chatWarnings!==false&&typeof composerContext==='function'&&composerContext()?.kind==='private'&&offPlatformRisk(input.value);
 if(!show){if(note)note.hidden=true;return}
 if(!note){note=node('p','⚠️ Sending money outside a deal is not safe. Start a deal and pay only the Admin.','chat-safety-note');note.id='chatSafetyNote';note.setAttribute('role','status');$('chatForm').prepend(note)}
 note.hidden=false;
}
$('messageText')?.addEventListener('input',syncChatSafetyNote);
void loadMarketRules();

$('closeTermsPage')?.addEventListener('click',()=>navigate('home'));

// Start a deal straight from a private chat: show every available ID of the other member (photo, ID No, price).
async function startDealFromChat(peer){
 const {posts}=await api('/profile/'+encodeURIComponent(peer.id));
 const sellable=posts.filter(p=>p.user_id===peer.id&&!p.shared_by_id&&p.post_intent!=='need'&&p.status==='approved'&&p.availability!=='sold'&&p.price>0);
 if(!sellable.length)return toast(peer.name+' has no ID for sale right now.');
 openStepDialog('🤝 '+peer.name+'’s IDs',body=>{
  body.append(node('p','Choose the ID you want to buy. Then pick an Admin for the deal.','hint'));
  for(const p of sellable.slice(0,30)){
   const card=node('div',undefined,'deal-id-pick'),photo=p.media?.find(m=>String(m.type||'').startsWith('image/'));
   if(photo){const img=node('img');img.alt='';setMediaImage(img,photo.url);void loadMediaImage(img);card.append(img)}else card.append(node('div',undefined,'deal-id-thumb'));
   const copy=node('div');copy.append(node('small',p.listing_code||'ID','hint'),node('strong',p.title),node('span',formatPrice(p.price,p.price_format)+' BDT','deal-id-price'));card.append(copy);
   card.append(button('🤝 Start deal for this ID',async()=>{closeStepDialog();await startListingDeal(p.id)},'btn'));body.append(card);
  }
 },'Close',null);
}

// Deal popup: new requests, each deal step and deal messages, plus a count on the Deals tab.
let dealAlertSeen=(()=>{try{return Number(sessionStorage.getItem('wm_deal_alert_seen'))||0}catch{return 0}})(),dealAlertBusy=false,dealPopupTimer,lastDealAlerts=[];
async function markDealAlertsRead(alerts){const ids=alerts.map(a=>a.id);if(ids.length)try{await api('/notifications/read',{ids})}catch{}}
function paintDealAlertCount(count){
 for(const target of [$('dealChatsTab'),document.querySelector('#mobileNav [data-tab="messages"]'),document.querySelector('#desktopNav [data-tab="messages"]')]){if(!target)continue;let dot=target.querySelector('.deal-alert-count');if(!count){dot?.remove();continue}if(!dot){dot=node('span',undefined,'deal-alert-count');target.append(dot)}dot.textContent=count>9?'9+':String(count);dot.title=count+' deal update'+(count===1?'':'s')}
}
function hideDealPopup(){clearTimeout(dealPopupTimer);document.getElementById('dealPopup')?.remove()}
function showDealPopup(alert,more){
 if(activeDealRoom?.id===alert.deal_id)return;hideDealPopup();const card=node('div',undefined,'deal-popup');card.id='dealPopup';card.setAttribute('role','status');
 const copy=node('div',undefined,'deal-popup-copy');copy.append(node('strong','🔔 '+alert.title),node('span',(alert.deal_code||'Deal')+' · '+(alert.account||'')+(alert.actor_name?' · '+alert.actor_name:'')+(more>1?' · +'+(more-1)+' more':'')));
 const open=button('Open',async()=>{hideDealPopup();const ids=(await api('/deal-alerts')).alerts.filter(a=>a.deal_id===alert.deal_id).map(a=>a.id);if(ids.length)await api('/notifications/read',{ids});paintDealAlertCount(0);void pollDealAlerts();if(['active','awaiting_final','disputed'].includes(alert.status))await openDealRoom(alert.deal_id);else navigate('deals')},'btn');
 const close=button('×',async()=>{hideDealPopup();await markDealAlertsRead(lastDealAlerts.filter(a=>a.deal_id===alert.deal_id));void pollDealAlerts()},'btn ghost deal-popup-close');close.setAttribute('aria-label','Dismiss');
 card.append(copy,open,close);document.body.append(card);dealPopupTimer=setTimeout(hideDealPopup,12000);
}
async function pollDealAlerts(){
 if(!me||document.hidden||dealAlertBusy)return;dealAlertBusy=true;
 try{
  const {alerts}=await api('/deal-alerts');let pending=alerts;lastDealAlerts=alerts;
  // Looking at the Deals list counts as seeing every deal update.
  if(active==='messages'&&messengerMode==='deals'&&alerts.length){await markDealAlertsRead(alerts);paintDealAlertCount(0);dealAlertSeen=Math.max(dealAlertSeen,...alerts.map(a=>a.id));return}
  // Updates for the deal room that is already open are read on the spot.
  const here=activeDealRoom?alerts.filter(a=>a.deal_id===activeDealRoom.id):[];if(here.length){await api('/notifications/read',{ids:here.map(a=>a.id)});pending=alerts.filter(a=>a.deal_id!==activeDealRoom.id)}
  paintDealAlertCount(pending.length);const fresh=pending.filter(a=>a.id>dealAlertSeen);
  if(alerts.length){dealAlertSeen=Math.max(dealAlertSeen,...alerts.map(a=>a.id));try{sessionStorage.setItem('wm_deal_alert_seen',String(dealAlertSeen))}catch{}}
  if(fresh.length)showDealPopup(fresh[0],fresh.length);
 }catch{}finally{dealAlertBusy=false}
}
setInterval(()=>void pollDealAlerts(),12000);setTimeout(()=>void pollDealAlerts(),2500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pollDealAlerts()});

// Phone / email + password Sign in and Sign up (Google sign-in stays in the same window).
let authMode='signin';
function setAuthMode(mode){
 authMode=mode==='signup'?'signup':'signin';const signup=authMode==='signup';
 $('authSignInTab').setAttribute('aria-selected',String(!signup));$('authSignUpTab').setAttribute('aria-selected',String(signup));
 $('authNameField').hidden=!signup;$('authSubmit').textContent=signup?'Create account':'Sign in';$('authPassword').autocomplete=signup?'new-password':'current-password';$('authStatus').textContent='';
 $('loginTitle').textContent=signup?'Create your account':'Welcome back';
}
function syncAuthMethod(){const phone=document.querySelector('input[name=authMethod]:checked')?.value!=='email',input=$('authLogin');$('authLoginLabel').textContent=phone?'Phone number':'Email';input.type=phone?'tel':'email';input.inputMode=phone?'tel':'email';input.placeholder=phone?'01XXXXXXXXX':'you@example.com'}
function openAuth(mode){setAuthMode(mode);showLogin()}
$('authSignInTab').onclick=()=>setAuthMode('signin');$('authSignUpTab').onclick=()=>setAuthMode('signup');
for(const radio of document.querySelectorAll('input[name=authMethod]'))radio.onchange=syncAuthMethod;
$('guestSignIn').onclick=()=>openAuth('signin');$('guestSignUp').onclick=()=>openAuth('signup');
$('authForm').onsubmit=async e=>{
 e.preventDefault();const submit=$('authSubmit'),status=$('authStatus');submit.disabled=true;status.textContent=authMode==='signup'?'Creating your account…':'Signing in…';
 try{
  const method=document.querySelector('input[name=authMethod]:checked')?.value==='email'?'email':'phone',login=$('authLogin').value.trim(),password=$('authPassword').value;
  if(!login)throw Error(method==='phone'?'Enter your phone number.':'Enter your email.');if(password.length<8)throw Error('Password must have at least 8 characters.');
  const data=authMode==='signup'?{method,login,password,name:$('authName').value.trim()}:{login,password};if(authMode==='signup'&&!data.name)throw Error('Enter your name.');
  const response=await fetch('/api/auth/'+authMode,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Could not sign in. Try again.');
  $('authPassword').value='';status.textContent='';await refreshMe();closeLogin();if(afterLoginTab){const next=afterLoginTab;afterLoginTab=null;navigate(next)}await loadPage();await acceptGroupInvite();await openSharedProfile();await handleAdminEntry();
  toast(authMode==='signup'?'🎉 Account created. Welcome!':'✅ Signed in.');
 }catch(error){status.textContent=error.message}finally{submit.disabled=false}
};
syncAuthMethod();
