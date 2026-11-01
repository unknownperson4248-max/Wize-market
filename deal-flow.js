// Protected deal steps, secure handover, deal proofs, listing tools, badges, trust card and chat safety notes.
let marketRulesCache=null;
async function loadMarketRules(){try{marketRulesCache=(await api('/market-rules')).rules}catch{}return marketRulesCache}
const dealTime=t=>t?new Date(t).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const DEAL_EVENT_LABELS={requested:'Deal requested',accept:'Admin accepted · deal room opened',activate:'Admin accepted · deal room opened',payment_sent:'Buyer reported the payment',payment_received:'Admin confirmed the payment is received',handover_ready:'Buyer is ready for the login details',handover_submitted:'Seller sent login details securely',handover_revealed:'Buyer opened the login details',delivered:'Seller marked the account delivered',buyer_confirmed:'Buyer checked and confirmed the account',auto_confirmed:'Auto-confirmed: no dispute within the check time',dispute:'Dispute raised',resolve_dispute:'Dispute resolved · deal resumed',resolve_redeliver:'Dispute resolved · seller must deliver again',finalize:'Admin completed the deal',cancel:'Deal cancelled',reject:'Admin rejected the request',cancel_requested:'Cancellation requested',cancel_request_rejected:'Cancellation request declined',admin_changed:'Admin changed'};
const CHECKLIST_LABELS={login_checked:'I logged in and the account matches the post (level, items, rank).',email_changed:'I bound my own email / Gmail and removed the seller’s.',password_changed:'I changed every password (game login, Facebook / Google).',links_removed:'I removed the seller’s Facebook / Google / VK / X links.',recovery_changed:'I changed the recovery phone and 2-step verification.'};
const PROTECTED_STEPS=['Accepted','Paid','Secured','Delivered','Checked','Completed'];

function dealSystemLine(m){const line=node('div',undefined,'deal-system-line');line.append(node('span',(DEAL_EVENT_LABELS[m.text]||String(m.text).replaceAll('_',' '))+(m.name?' · '+m.name:'')),node('time',new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));return line}
function dealRoles(d){const buyer=me?.id===d.buyer_id,seller=me?.id===d.seller_id,isAdmin=me?.id===d.admin_id&&['owner','trusted'].includes(me?.role);return {buyer,seller,isAdmin,participant:buyer||seller||isAdmin}}
function protectedStage(d){if(d.status==='completed')return 6;if(d.status==='cancelled')return -1;if(['proposed','awaiting_admin','awaiting_seller'].includes(d.status))return 0;if(d.buyer_done)return 5;if(d.delivered_at)return 4;if(d.funded_at)return 3;if(d.paid_at)return 2;return 1}
function protectedTimes(d){const rules=marketRulesCache||{holdHours:d.hold_hours??24,autoConfirmHours:d.auto_confirm_hours??72};return {holdUntil:d.hold_until??(d.delivered_at?d.delivered_at+rules.holdHours*3600000:null),autoAt:d.auto_confirm_at??(d.delivered_at?d.delivered_at+rules.autoConfirmHours*3600000:null)}}
function protectedStepText(d){
 const {buyer,seller,isAdmin}=dealRoles(d),{holdUntil,autoAt}=protectedTimes(d),stage=protectedStage(d);
 if(d.status==='disputed')return 'Dispute: '+(d.dispute_reason||'details in the chat')+'. '+(d.admin_id===d.seller_id?'The Owner decides.':'The Admin decides.');
 if(stage===1)return buyer?'Pay only to the number the Admin shares in this room, then tap “I paid”.':isAdmin?'Share your payment number in this room. Confirm when the money arrives.':'Waiting for the buyer to pay the Admin.';
 if(stage===2)return isAdmin?'Buyer says they paid. Check your account, then tap “Payment received”.':'Waiting for the Admin to confirm the payment.';
 if(stage===3)return seller?'Payment is secured with the Admin. Hand over the account with Secure handover, then tap “Mark account delivered”.':buyer?'Payment is secured. Tap “I’m ready” in Secure handover to receive the login.':'Payment secured. Waiting for the seller to hand over the account.';
 if(stage===4)return buyer?'Log in, finish the secure checklist and confirm. Raise a dispute if anything is wrong.':'Waiting for the buyer to check the account'+(autoAt?' (auto-confirms '+dealTime(autoAt)+' without a dispute).':'.');
 if(stage===5)return Date.now()<holdUntil?'Safety hold until '+dealTime(holdUntil)+(isAdmin?'. Then pay the seller and give the final confirmation.':', then the Admin pays the seller and completes the deal.'):isAdmin?'Pay the seller, then give the final confirmation.':'Waiting for the Admin’s final confirmation.';
 if(stage===6)return 'Deal completed.';
 return '';
}
function appendProtectedSteps(root,d,ctx){
 const {buyer,seller,isAdmin,participant}=ctx,owner=me?.role==='owner',live=['active','awaiting_final'].includes(d.status),time=Date.now();
 const step=(label,fn,cls='btn')=>{const b=button(label,fn,cls);b.dataset.dealStep='1';root.append(b);return b};
 if(d.status==='active'&&buyer&&!d.paid_at&&!d.funded_at)step('I paid',()=>openDealStep(d,'mark_paid'));
 if(d.status==='active'&&isAdmin&&!d.funded_at)step('Payment received',()=>openDealStep(d,'confirm_payment'));
 if(d.status==='active'&&seller&&d.funded_at&&!d.delivered_at)step('Mark account delivered',()=>openDealStep(d,'mark_delivered'));
 if(d.status==='active'&&buyer&&d.delivered_at&&!d.buyer_done)step('Check & confirm account',()=>openDealStep(d,'buyer_confirm'));
 if(isAdmin&&live&&d.delivered_at&&!d.cancel_pending){const {holdUntil,autoAt}=protectedTimes(d),opensAt=d.buyer_done?holdUntil:Math.max(holdUntil,autoAt),ready=time>=opensAt;const b=step(ready?'Final confirm & pay seller':'Final confirm opens '+dealTime(opensAt),()=>openDealStep(d,'finalize'));b.disabled=!ready}
 if(live&&participant)step('Raise dispute',()=>openDealStep(d,'dispute'),'btn ghost');
 if(d.status==='disputed'&&(owner||isAdmin&&d.admin_id!==d.seller_id)){step('Resume deal',()=>protectedRequest(d,'resolve_dispute',{}),'btn secondary');step('Seller must deliver again',()=>protectedRequest(d,'resolve_dispute',{redeliver:true}),'btn secondary');if(owner&&!isAdmin)step('Cancel & refund buyer',()=>protectedRequest(d,'cancel',{},'Cancel this disputed deal? Refund the buyer first.'),'btn ghost')}
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
 if(action==='mark_paid')return openStepDialog('I paid',body=>{body.append(node('p','Send money only to the number the Admin gives inside this Deal Room. Never pay outside it.','hint'));field(body,'Transaction ID / sender last digits (optional)',textInput(120,false,'e.g. bKash TrxID 8N7A6B5C'))},'Report payment',body=>send({note:body.querySelector('input').value.trim()}));
 if(action==='confirm_payment')return openStepDialog('Payment received',body=>{body.append(node('p','Confirm only after the money is in your account. The seller hands over the account after this.','hint'));if(d.paid_note)body.append(node('p','Buyer’s note: '+d.paid_note,'deal-step-note'));const trx=field(body,'Transaction ID',textInput(120,true));trx.value=(d.paid_note.match(/[A-Z0-9]{8,12}/i)||[''])[0];const proof=field(body,'Payment screenshot (optional, private)',proofInput());proof.dataset.role='proof'},'Confirm payment',async body=>{const trx=body.querySelector('input:not([type=file])').value.trim();const proofId=await uploadDealProof(d.id,body.querySelector('[data-role=proof]').files[0],'payment');await send({trx,proofId})});
 if(action==='mark_delivered')return openStepDialog('Account delivered',body=>{body.append(node('p','Confirm that the buyer has the account: login sent with Secure handover or bound in-game, and your own links are removed.','hint'));const ack=node('label',undefined,'deal-check');const box=node('input');box.type='checkbox';box.required=true;ack.append(box,node('span','I handed over the account and removed my own login links.'));body.append(ack)},'Mark delivered',()=>send({}));
 if(action==='buyer_confirm')return openStepDialog('Check & confirm account',body=>{body.append(node('p','Tick every step after you do it. '+(marketRulesCache?.holdHours?'A '+marketRulesCache.holdHours+'-hour safety hold still protects you before the seller is paid.':'Raise a dispute instead if anything is wrong.'),'hint'));for(const key of d.checklist_items||Object.keys(CHECKLIST_LABELS)){const label=node('label',undefined,'deal-check');const box=node('input');box.type='checkbox';box.required=true;box.value=key;label.append(box,node('span',CHECKLIST_LABELS[key]||key));body.append(label)}const proof=field(body,'Screenshot of your new linked email (optional, private)',proofInput());proof.dataset.role='proof'},'Confirm account is mine',async body=>{const checklist=[...body.querySelectorAll('input[type=checkbox]:checked')].map(b=>b.value);const proofId=await uploadDealProof(d.id,body.querySelector('[data-role=proof]').files[0],'checklist');await send({checklist,proofId})});
 if(action==='dispute')return openStepDialog('Raise dispute',body=>{body.append(node('p','Explain what went wrong. The payment stays with the Admin until the dispute is decided.','hint'));const reason=node('textarea',undefined,'input');reason.maxLength=500;reason.required=true;field(body,'What happened?',reason)},'Raise dispute',body=>send({reason:body.querySelector('textarea').value.trim()}));
 if(action==='finalize')return openStepDialog('Final confirmation',body=>{body.append(node('p','Pay the seller first, then confirm. This completes the deal and marks the listing sold.','hint'));if(!d.buyer_done)body.append(node('p','The buyer did not confirm, but the check time ended without a dispute. It will be recorded as auto-confirmed.','deal-step-note'));field(body,'Seller payout reference (optional)',textInput(200,false,'e.g. Paid via bKash, TrxID'))},'Complete deal',body=>send({payout:body.querySelector('input').value.trim()}));
}

// Secure handover: encrypted on the server, readable once by the buyer, never by Admin or Owner.
function renderHandoverBox(d){
 const h=d.handover||{},buyer=me?.id===d.buyer_id,seller=me?.id===d.seller_id,box=node('details',undefined,'handover-box');
 if(d.secure_handover===false){const summary=node('summary');summary.append(socialIcon('lock'),node('span','Secure handover'),node('small','Coming soon'));box.append(summary,node('p','Secure handover is being set up by the Owner. Until then, share login details only in this Deal Room and only after the Admin confirms payment. Change every password right after.','hint'));return box}
 box.open=!!(buyer&&(h.waiting||!h.buyer_ready_at&&!d.delivered_at)||seller&&h.buyer_ready_at&&!h.submitted_at);
 const summary=node('summary');summary.append(socialIcon('lock'),node('span','Secure handover'),node('small',h.waiting?'Waiting to open':h.revealed_at?'Opened':h.buyer_ready_at?'Buyer ready':'Not started'));box.append(summary);
 const status=node('ul',undefined,'handover-status'),line=(ok,text)=>status.append(node('li',text,ok?'ok':''));
 line(!!h.buyer_ready_at,h.buyer_ready_at?'Buyer ready · '+dealTime(h.buyer_ready_at):'Buyer has not tapped Ready');
 line(!!h.submitted_at,h.submitted_at?'Seller sent details · '+dealTime(h.submitted_at):'Seller has not sent details');
 line(!!h.revealed_at,h.revealed_at?'Buyer opened them · '+dealTime(h.revealed_at):h.waiting?'Waiting for the buyer to open (one time)':'Not opened');box.append(status);
 const actions=node('div',undefined,'action-row');
 if(buyer&&!h.buyer_ready_at)actions.append(button('I’m ready to receive login',()=>handoverRequest(d,{action:'ready'}),'btn'));
 if(buyer&&h.waiting)actions.append(button('Open login details (one time)',()=>revealHandover(d),'btn'));
 if(seller&&h.buyer_ready_at)actions.append(button(h.submitted_at?'Send details again':'Send login details securely',()=>openHandoverForm(d),'btn'+(h.submitted_at?' secondary':'')));
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
 if(d.proofs?.length){const row=node('div',undefined,'deal-proof-row');for(const proof of d.proofs)row.append(button({payment:'Payment proof',checklist:'Buyer check proof',delivery:'Delivery proof'}[proof.kind]||'Proof',()=>window.open('/api/deals/'+d.id+'/proofs/'+proof.id,'_blank','noopener'),'btn ghost'));box.append(row)}
 if(d.funded_at&&['active','awaiting_final','disputed'].includes(d.status))box.append(renderHandoverBox(d));
 const actions=node('div',undefined,'action-row deal-step-actions');appendProtectedSteps(actions,d,dealRoles(d));if(actions.children.length)box.append(actions);
 return box;
}

// Listing tools: private game UID field, bump/renew, Updated and Expired labels.
function sellGameListing(p){return p.post_intent!=='need'&&p.kind==='Game ID'&&p.price>0&&p.game_category!=='community'}
function listingExpiredForOwner(p){const days=marketRulesCache?.expireDays;return !!days&&Math.max(p.created_at||0,p.bumped_at||0,p.renewed_at||0)<Date.now()-days*86400000}
function syncGameUidField(){
 const field=$('gameUidField');if(!field)return;const sell=postIntent!=='need';field.hidden=!sell;const input=$('postGameUid');if(!sell){input.value='';return}
 const saved=editingPost?.hasGameUid;input.placeholder=saved?'Saved (ends with '+(editingPost.gameUidHint||'•••')+'). Leave empty to keep it':'e.g. 1234567890';
 $('postGameUidHint').textContent=saved?'Your saved game UID stays private. Enter a new one only if it changed.':'Private: shown only inside your Deal Room. One active post per game ID'+(marketRulesCache?.requireGameUid===false?'.':'. Required for game ID Sell Posts.');
}
function listingOwnerMenu(p){
 if(p.user_id!==me?.id||p.status!=='approved'||p.availability==='sold')return [];
 const expired=listingExpiredForOwner(p);
 return [[expired?'Renew post':'Bump post',async()=>{if(sellGameListing(p)&&!p.has_game_uid&&marketRulesCache?.requireGameUid!==false){toast('Add the game UID to this post first (Edit post).');return editPost(p.id)}await api('/posts/'+p.id+'/bump',{});toast(expired?'Post renewed for '+(marketRulesCache?.expireDays||30)+' days.':'Post moved to the top of the feed.');if(active==='profile')await loadProfileView();else if(active==='home')await loadFeed()}]];
}
function appendListingLabels(root,p){
 const labels=node('div',undefined,'listing-labels');
 if(p.media_updated_at)labels.append(node('span','Updated','listing-label updated'));
 if(p.user_id===me?.id&&p.status==='approved'&&p.availability!=='sold'&&listingExpiredForOwner(p))labels.append(node('span','Expired · Renew to show in feed','listing-label expired'));
 if(p.user_id===me?.id&&sellGameListing(p)&&!p.has_game_uid&&marketRulesCache?.requireGameUid!==false){const add=button('Add game UID',()=>editPost(p.id),'listing-label add-uid');labels.append(add)}
 if(labels.children.length)root.append(labels);
}
async function precheckPost(payload,editId){await api('/posts/precheck',{postIntent:payload.postIntent,kind:payload.kind,price:payload.price,gameCategory:payload.gameCategory,customGameName:payload.customGameName,gameUid:payload.gameUid,...(editId?{editId}:{})})}

// Badges come only from database flags. Tapping one opens the member's trust card.
function openTrustCard(userId){
 openStepDialog('Trust card',body=>{body.append(node('p','Loading…','hint'));void api('/profile/'+encodeURIComponent(userId)+'/trust').then(({trust:t})=>{
  body.replaceChildren();const head=node('div',undefined,'trust-head');head.append(avatar(t),node('strong',t.name));body.append(head);
  const badge=t.role==='owner'?'Website Owner':t.role==='trusted'?'Trusted Admin':t.verified?'Verified Member':'Member';
  const list=node('dl',undefined,'deal-facts');
  for(const [k,v]of [['Badge',badge],['Verified by Wize Market',t.role==='owner'?'Owner account':t.verified_at?new Date(t.verified_at).toLocaleDateString():'Not verified'],['Member since',new Date(t.created_at).toLocaleDateString()],['Completed deals',String(t.completed_party)],...(t.role!=='member'?[['Deals handled as Admin',String(t.completed_admin)]]:[]),['Deals with a dispute',t.total?t.disputed+' of '+t.total:'0']])list.append(node('dt',k),node('dd',v));
  body.append(list,node('p','Badges are given only by the website owner and cannot be bought or typed into a name.','hint'));
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
 if(!note){note=node('p','Payments outside a Wize Market Deal Room are not protected. Start a deal and pay only through the Admin.','chat-safety-note');note.id='chatSafetyNote';note.setAttribute('role','status');$('chatForm').prepend(note)}
 note.hidden=false;
}
$('messageText')?.addEventListener('input',syncChatSafetyNote);
void loadMarketRules().then(()=>{try{syncGameUidField()}catch{}});

$('closeTermsPage')?.addEventListener('click',()=>navigate('home'));
