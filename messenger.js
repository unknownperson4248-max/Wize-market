let privatePeer=null,privateThread=null,peerInfoView='home',blockedRender=0;
function setInboxMode(mode){messengerMode=mode;delete $('chatList').dataset.signature;renderMessengerInbox();void loadMessages().catch(e=>toast(e.message))}
async function blockMember(person,blocked){
 if(!requireLogin())return;
 if(blocked&&!confirm('Block '+person.name+'? This stops private messages, friend requests and new deals. Existing secure deals remain available.'))return;
 await api('/blocks',{userId:person.id,blocked});toast(blocked?'Member blocked.':'Member unblocked.');
 if(active==='messages'){await loadMessages();if(chat)await refreshChat()}
 if(active==='profile')await loadProfileView();if(active==='home')await loadFeed();
}
async function conversationAction(item,action){
 if(action==='delete'&&!confirm('Delete this chat from your inbox and clear its messages for you? Other members keep their own copy.'))return;
 if(action==='block'&&!confirm('Block '+item.name+'? You can unblock it from Messenger options. Existing deals remain available.'))return;
 await api('/chats/action',{kind:item.kind,id:item.id,action});unreadEpoch++;
 if((['delete','archive'].includes(action)||action==='block'&&item.kind==='group')&&chat?.id===item.id)closeConversation();
 delete $('chatList').dataset.signature;await loadMessages();toast({archive:'Chat archived.',unarchive:'Chat moved to All chat.',delete:'Chat deleted from your inbox.',block:'Blocked.',unblock:'Unblocked.',mute:'Chat muted.',unmute:'Chat unmuted.'}[action]);
 await refreshChatUnread();if(chat)await refreshChat();
}
async function renderBlockedMembers(root){
 const request=++blockedRender,{people}=await api('/blocks');if(request!==blockedRender||messengerMode!=='blocked'||!root.isConnected)return;
 const represented=new Set(messengerItems().filter(i=>i.kind==='private').map(i=>i.peerId));
 const extra=people.filter(p=>!represented.has(p.id));if(!extra.length)return;root.append(node('h3','Blocked members'));
 for(const p of extra){const row=node('div',undefined,'blocked-member-row');row.append(avatar(p),node('strong',p.name),button('Unblock',async()=>{await api('/blocks',{userId:p.id,blocked:false});delete root.dataset.signature;await loadMessages()},'btn secondary'));root.append(row)}
}
function bindChatHeaderInfo(action){
 for(const element of [$('chatTitle'),$('chatHeaderAvatar')]){element.onclick=action;element.setAttribute('role','button');element.tabIndex=0;element.style.webkitTapHighlightColor='transparent';element.setAttribute('aria-label','Open chat information');element.onkeydown=element.tagName==='BUTTON'?null:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action()}}}
}
function closePeerInfo(){const panel=$('peerInfoPanel');if(panel)panel.hidden=true;peerInfoView='home'}
function openPeerInfo(){if(chat?.kind!=='private'||!privatePeer)return;peerInfoView='home';renderPeerInfo();$('peerInfoPanel').hidden=false;$('closePeerInfo').focus()}
$('closePeerInfo').onclick=()=>{if(peerInfoView!=='home'){peerInfoView='home';renderPeerInfo()}else{closePeerInfo();$('chatTitle').focus()}};
function currentPrivateItem(){return {kind:'private',id:chat.id,name:privatePeer.name,peerId:privatePeer.id,archived:!!privateThread.preferences?.archived,blocked:!!privateThread.blocked_by_me}}
function renderPeerInfo(){
 if(!privatePeer||!privateThread||chat?.kind!=='private')return;
 const peer=privatePeer,thread=privateThread,root=$('peerInfoBody');root.replaceChildren();
 if(peerInfoView==='search'){
  root.append(node('h2','Search conversation'));const search=node('input',undefined,'input');search.type='search';search.placeholder='Search messages…';search.setAttribute('aria-label','Search this conversation');const results=node('div',undefined,'peer-search-results');search.oninput=()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();if(!q)return;for(const message of [...$('chatMessages').querySelectorAll('.bubble')])if(message.textContent.toLowerCase().includes(q))results.append(message.cloneNode(true));if(!results.children.length)results.append(node('p','No matching recent messages.','hint'))};root.append(search,node('p','Searches the recent messages loaded in this chat.','hint'),results);return;
 }
 if(peerInfoView==='media'){
  root.append(node('h2','Shared media'));const gallery=node('div',undefined,'media-grid');for(const media of $('chatMessages').querySelectorAll('.chat-media'))gallery.append(media.cloneNode(true));if(!gallery.children.length)root.append(node('p','No recent shared media.','hint'));root.append(gallery);return;
 }
 const hero=node('div',undefined,'peer-info-hero');hero.append(avatar(peer));const name=node('div',undefined,'peer-info-name');name.append(node('h2',peer.name));name.append(verifiedMark(peer.role,peer.id,!!peer.verified));hero.append(name);if(peer.username)hero.append(node('p','@'+peer.username,'muted'));root.append(hero);
 const shortcuts=node('div',undefined,'peer-info-shortcuts');shortcuts.append(socialAction('Profile','users',()=>showProfile(peer.id)),socialAction('Search','search',()=>{peerInfoView='search';renderPeerInfo();root.querySelector('input').focus()}),socialAction(thread.preferences?.muted?'Unmute':'Mute','mute',()=>conversationAction(currentPrivateItem(),thread.preferences?.muted?'unmute':'mute')));root.append(shortcuts);
 root.append(node('p','Chat info','info-caption'),button('View media & files',()=>{peerInfoView='media';renderPeerInfo()},'info-row'));
 root.append(node('p','Actions','info-caption'));
 for(const [label,action]of [[thread.preferences?.archived?'Unarchive chat':'Archive chat',thread.preferences?.archived?'unarchive':'archive'],['Delete chat','delete'],[thread.blocked_by_me?'Unblock member':'Block member',thread.blocked_by_me?'unblock':'block']])root.append(button(label,()=>conversationAction(currentPrivateItem(),action),'info-row'));
 root.append(node('p','Blocking private contact does not close or hide existing secure deals.','hint'));decorateInfoRows(root);
}
function renderGroupConversationActions(group){const root=$('groupConversationActions');if(!root)return;root.replaceChildren();const data=groups.find(g=>g.id===group.id)||group,item={kind:'group',id:group.id,name:group.name,admin:group.owner_id===me.id,archived:!!data.chat_archived};root.append(node('p','Actions','info-caption'));for(const [label,action]of [[item.archived?'Unarchive group chat':'Archive group chat',item.archived?'unarchive':'archive'],['🗑️ Delete group chat (clear my messages)','delete'],...(!item.admin?[['Block group','block']]:[])])root.append(button(label,()=>conversationAction(item,action),'info-row'));if(!item.admin)root.append(button('🚪 Leave group',async()=>{if(!confirm('Leave this group? Your messages here will be cleared and you will not get new messages from this group.'))return;await api('/groups/'+item.id+'/leave',{});toast('You left the group.');closeConversation();navigate('messages');await loadMessages()},'info-row danger-row'));decorateInfoRows(root)}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('peerInfoPanel').hidden)closePeerInfo()});
// Messenger-style icons for the chat info pages.
const INFO_ICONS={users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14c2.4.2 4 1.8 4.5 4.5"/>',userPlus:'<circle cx="10" cy="8" r="3.4"/><path d="M3.5 19.5c.6-3.5 3.2-5.3 6.5-5.3s5.9 1.8 6.5 5.3M19 8v6M16 11h6"/>',search:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',bellOff:'<path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H6.5M10 21h4M3 3l18 18"/>',bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15ZM10 21h4"/>',edit:'<path d="m4 20 1-4L16 5l3 3L8 19ZM14 7l3 3"/>',image:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>',tag:'<path d="M3.5 12.5V4.5h8l9 9-8 8Z"/><circle cx="8" cy="9" r="1.5"/>',shield:'<path d="M12 3 5 6v5.5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',archive:'<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V19h14V8.5M10 12.5h4"/>',trash:'<path d="M4.5 6.5h15M9 6.5V4h6v2.5M6.5 6.5 7.5 20h9l1-13.5M10 10.5v6M14 10.5v6"/>',block:'<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/>',leave:'<path d="M14 4H6v16h8M10 12h10M17 8.5 20.5 12 17 15.5"/>',user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.4-6 7-6s6.3 2.2 7 6"/>',nick:'<path d="M4 19 9.5 5h1L16 19M6.3 14h7.4"/><path d="M17 10.5c.6-.9 1.4-1.3 2.4-1.3 1.4 0 2.1.8 2.1 2.2V19M21.5 14.2c-.9-.4-1.7-.5-2.6-.4-1.6.2-2.6 1.1-2.6 2.5 0 1.3.9 2.2 2.2 2.2 1.3 0 2.4-.8 3-2"/>',palette:'<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.9-.8 1.9-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.1c2.2 0 3.7-1.6 3.7-3.7C20.5 6.6 16.7 3.5 12 3.5Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/><circle cx="14.5" cy="7.3" r="1.2"/>',pin:'<path d="M9 3.5h6l-1 5 3.5 3.5v1.5h-11V12L10 8.5Z"/><path d="M12 13.5V21"/>'};
const infoIcon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(INFO_ICONS[name]||INFO_ICONS.users)+'</svg>';
function decorateInfoRows(root){
 for(const i of root.querySelectorAll('i[data-icon]'))if(!i.firstChild)i.innerHTML=infoIcon(i.dataset.icon);
 for(const row of root.querySelectorAll('.info-row')){if(row.querySelector('i[data-icon]'))continue;const text=row.textContent.trim(),clean=text.replace(/^[^\p{L}\p{N}]+/u,'').trim();
  const icon=/pinned/i.test(clean)?'pin':/leave/i.test(clean)?'leave':/delete/i.test(clean)?'trash':/block/i.test(clean)?'block':/archive/i.test(clean)?'archive':/media/i.test(clean)?'image':/mute/i.test(clean)?'bell':/member/i.test(clean)?'users':'user';
  if(clean!==text&&row.childNodes.length===1)row.textContent=clean;const i=document.createElement('i');i.dataset.icon=icon;i.innerHTML=infoIcon(icon);row.prepend(i)}
}
decorateInfoRows($('groupInfoHome'));


let activeMemberAction=null,memberActionTrigger=null;
function renderMessageAuthor(message,kind){
 const person={id:message.user_id,name:message.name,picture:message.picture,verified:message.verified,role:message.role},interactive=kind==='group'&&message.user_id!==me.id;
 const author=node(interactive?'button':'div',undefined,'message-author'+(interactive?' group-member-trigger':''));if(interactive){author.type='button';author.setAttribute('aria-label','Member options for '+message.name);author.onclick=()=>openMemberActions(person,author)}
 author.append(avatar(person),node('strong',message.name),verifiedMark(message.role||'member',undefined,!!message.verified));return author;
}
function closeMemberActions(){const modal=$('memberActionModal');if(!modal)return;modal.hidden=true;activeMemberAction=null;if(memberActionTrigger?.isConnected)memberActionTrigger.focus();memberActionTrigger=null}
async function openMemberActions(person,trigger){
 activeMemberAction=person;memberActionTrigger=trigger;$('memberActionName').textContent=person.name;$('memberActionIdentity').replaceChildren(avatar(person));
 const root=$('memberActionButtons');root.replaceChildren();root.append(button('View profile',async()=>{closeMemberActions();await showProfile(person.id)},'member-context-option'),button('Message',async()=>{closeMemberActions();const {thread}=await api('/threads',{userId:person.id});navigate('messages');await loadMessages();await openChat('private',thread.id)},'member-context-option'),button('Block',async()=>{const blocked=!!activeMemberAction?.blocked_by_me;closeMemberActions();await blockMember(person,!blocked)},'member-context-option'));
 $('memberActionModal').hidden=false;root.firstChild.focus();
 try{const {profile}=await api('/profile/'+encodeURIComponent(person.id));if(activeMemberAction?.id!==person.id)return;activeMemberAction={...person,blocked_by_me:profile.blocked_by_me};root.children[1].disabled=!!profile.contact_blocked;root.lastChild.textContent=profile.blocked_by_me?'Unblock':'Block'}catch{}
}
$('closeMemberActions').onclick=closeMemberActions;$('memberActionModal').onclick=e=>{if(e.target===$('memberActionModal'))closeMemberActions()};
document.addEventListener('keydown',e=>{if($('memberActionModal').hidden)return;if(e.key==='Escape'){e.preventDefault();closeMemberActions()}if(e.key==='Tab'){const controls=[...$('memberActionModal').querySelectorAll('button:not([disabled])')],first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
function renderChatBlockState(thread,peer){
 const root=$('chatBlockNotice');root.replaceChildren();root.hidden=!thread.blocked;if(!thread.blocked)return;
 root.append(node('p',thread.blocked_by_me?'You blocked '+(peer?.name||'this member')+'.':'Messaging is unavailable.'));
 if(thread.blocked_by_me)root.append(button('Unblock',()=>conversationAction({kind:'private',id:thread.id,name:peer?.name||'this member'},'unblock'),'btn secondary unblock-chat'));
}
$('closePrivacyPage').onclick=()=>navigate('home');

// ---- Group invite link, join approval and admin-only group settings ----
function openGroupInviteDialog(g){
 openStepDialog('Join group',body=>{const head=node('div',undefined,'group-invite-head');head.append(avatar({name:g.name,picture:g.logo}),node('strong',g.name),node('small',g.members+' members'));body.append(head,node('p',g.joinApproval?'The group admin approves new members. You can chat after your request is accepted.':'You will join right away and can start chatting.','hint'))},
  g.joinApproval?'Ask to join':'Join group',async()=>{const r=await api('/groups/'+encodeURIComponent(g.id)+'/join',g.code?{code:g.code}:{});if(r.pending){toast('✅ Request sent. The group admin will check it.');return}navigate('messages');await loadMessages();await openChat('group',g.id);toast('You joined '+g.name+'.')});
}
function paintGroupAdminRows(g){
 const admin=!!g.canManage;$('groupRequestsButton').hidden=!admin;$('groupApprovalRow').hidden=!admin;$('groupAdminTools').hidden=!admin;$('groupCustomize').hidden=!admin;decorateInfoRows($('groupInfoHome'));if(!admin)return;
 $('groupApprovalToggle').checked=!!g.joinApproval;const n=Number(g.requests||0);$('groupRequestsCount').textContent=String(n);$('groupRequestsCount').hidden=!n;
}
async function openGroupRequests(){
 if(chat?.kind!=='group')return;showGroupInfoView('requests');const root=$('groupRequestList');root.replaceChildren(node('p','Loading…','muted'));
 try{const {requests}=await api('/groups/'+chat.id+'/requests');root.replaceChildren();if(!requests.length){root.append(node('p','No more requests to join.','invite-empty'));return}
  for(const r of requests){const row=node('div',undefined,'person group-request-row'),who=node('div',undefined,'group-request-who');who.append(node('span',r.name),node('small',new Date(r.created_at).toLocaleString()));const actions=node('div',undefined,'group-request-actions');
   const answer=async approve=>{for(const b of actions.querySelectorAll('button'))b.disabled=true;try{await api('/groups/'+chat.id+'/requests/'+encodeURIComponent(r.id),{approve});row.remove();toast(approve?r.name+' joined the group.':'Request declined.');if(groupDetail?.group){groupDetail.group.requests=Math.max(0,(groupDetail.group.requests||1)-1);paintGroupAdminRows(groupDetail.group)}if(!root.children.length)root.append(node('p','No one is waiting to join.','muted'))}catch(e){toast(e.message);for(const b of actions.querySelectorAll('button'))b.disabled=false}};
   actions.append(button('Approve',()=>void answer(true),'btn'),button('Decline',()=>void answer(false),'btn secondary'));row.append(avatar(r),who,actions);root.append(row)}
 }catch(e){root.replaceChildren(node('p',e.message,'muted'))}
}
$('groupRequestsButton').onclick=()=>void openInvitesPage();
$('groupApprovalToggle').onchange=async e=>{const on=e.target.checked;e.target.disabled=true;try{await api('/groups/'+chat.id+'/settings',{joinApproval:on});if(groupDetail?.group)groupDetail.group.joinApproval=on;toast(on?'New members now need your approval.':'Anyone with the invite link can join.')}catch(err){e.target.checked=!on;toast(err.message)}finally{e.target.disabled=false}};

// ---- Chat extras like Messenger: nicknames, chat colour and quick emoji, pinned messages ----
const CHAT_COLORS=['#0a7cff','#a033ff','#ff5ca1','#ff7f50','#13b06b','#f5b400','#e8453c','#5e6ad2'],CHAT_EMOJIS=['👍','❤️','😂','🔥','😮','😢','🙏','🎮','💯','😎'];
let chatExtras={key:'',nicknames:{},theme:null,pins:[],can:{}};
const extrasKey=c=>c&&['private','group'].includes(c.kind)?c.kind+'/'+c.id:'';
async function loadChatExtras(c=chat){const key=extrasKey(c);if(!key){chatExtras={key:'',nicknames:{},theme:null,pins:[],can:{}};applyChatExtras();return chatExtras}
 try{const x=await api('/chat-extras/'+key);if(extrasKey(chat)!==key)return chatExtras;const changed=JSON.stringify([x.nicknames,x.theme])!==JSON.stringify([chatExtras.key===key?chatExtras.nicknames:null,chatExtras.key===key?chatExtras.theme:null]);chatExtras={key,...x};applyChatExtras();if(changed){$('chatMessages').dataset.signature='';void refreshChat().catch(()=>{})}}catch{}return chatExtras}
const nicknameFor=(id,name)=>chatExtras.key===extrasKey(chat)&&chatExtras.nicknames?.[id]||name;
function applyChatExtras(){
 const panel=$('chatPanel'),t=chatExtras.key&&chatExtras.key===extrasKey(chat)?chatExtras.theme:null;
 if(t){panel.style.setProperty('--chat-accent',t.color);panel.dataset.chatTheme='1'}else{panel.style.removeProperty('--chat-accent');delete panel.dataset.chatTheme}
 const msgs=$('chatMessages');if(t?.background){msgs.style.setProperty('--chat-bg','url("'+t.background+'")');msgs.classList.add('has-chat-bg')}else{msgs.style.removeProperty('--chat-bg');msgs.classList.remove('has-chat-bg')}
 let quick=$('chatQuickEmoji');if(!quick){quick=button('',()=>sendQuickEmoji(),'composer-icon chat-quick-emoji');quick.id='chatQuickEmoji';quick.type='button';$('chatSendButton').after(quick)}
 const emoji=t?.emoji||'👍';quick.textContent=emoji;quick.setAttribute('aria-label','Send '+emoji);quick.hidden=!chatExtras.key;
 if(chat?.kind==='private'&&privatePeer){const nick=nicknameFor(privatePeer.id,'');if(nick)$('chatTitle').textContent=nick}
}
function sendQuickEmoji(){const input=$('messageText');if(!input||!chat)return;const t=chatExtras.theme;input.value=(t?.emoji||'👍');$('chatForm').requestSubmit()}
// Names in the chat use the nickname when one is set.
{const base=renderMessageAuthor;renderMessageAuthor=function(message,kind){const nick=nicknameFor(message.user_id,'');return base(nick?{...message,name:nick}:message,kind)}}
{const base=openChat;openChat=async function(...args){const r=await base.apply(this,args);void loadChatExtras();return r}}
function chatPinOption(c,m){if(!['private','group'].includes(c.kind)||m.deleted_at||!chatExtras.can?.pin||chatExtras.key!==extrasKey(c))return null;const pin=chatExtras.pins.find(p=>p.id===m.id),pinned=!!pin;
 if(c.kind==='private'){if(pinned)return ['📌 Unpin message',async()=>{try{await api('/chat-extras/'+extrasKey(c)+'/pin',{messageId:m.id,pinned:false,...(pin.only_me?{scope:'me'}:{})});await loadChatExtras(c);toast('Message unpinned.')}catch(e){toast(e.message)}}];return ['📌 Pin message',()=>openPinChoice(c,m)]}
 return [pinned?'📌 Unpin message':'📌 Pin message',async()=>{try{await api('/chat-extras/'+extrasKey(c)+'/pin',{messageId:m.id,pinned:!pinned});await loadChatExtras(c);toast(pinned?'Message unpinned.':'📌 Message pinned. See it in chat info.')}catch(e){toast(e.message)}}]}
// Info page views shared by group and personal chats.
async function chatMembersForExtras(){if(chat?.kind==='private')return [{id:me.id,name:me.name,picture:me.picture},{id:privatePeer.id,name:privatePeer.name,picture:privatePeer.picture}];return (await api('/groups/'+chat.id+'/members')).members}
async function renderNicknamesView(root){
 root.replaceChildren(node('p','Loading…','muted'));await loadChatExtras();const people=await chatMembersForExtras();root.replaceChildren();
 root.append(node('p',chat.kind==='group'?(chatExtras.can.nicknameOthers?'As the group admin you can set a nickname for anyone.':'You can set your own nickname in this group.'):'Nicknames are seen by both of you in this chat.','hint'));
 for(const p of people){const mine=p.id===me.id,allowed=mine||chatExtras.can.nicknameOthers,nick=chatExtras.nicknames[p.id]||'';const row=button('',()=>{if(!allowed)return toast('Only the group admin can change this nickname.');editNickname(p,root)},'info-row nickname-row');row.disabled=false;
  const who=node('span',undefined,'nickname-who');who.append(node('strong',nick||p.name),node('small',nick?p.name:(allowed?'Set nickname':'No nickname')));row.append(avatar(p),who);root.append(row)}
}
function editNickname(p,root){openStepDialog('Nickname',body=>{const input=node('input',undefined,'input');input.maxLength=40;input.value=chatExtras.nicknames[p.id]||'';input.placeholder=p.name;field(body,'Nickname for '+(p.id===me.id?'you':p.name),input);body.append(node('p','Leave it empty to remove the nickname.','hint'))},'Save',async body=>{await api('/chat-extras/'+extrasKey(chat)+'/nickname',{userId:p.id,nickname:body.querySelector('input').value});await loadChatExtras();await renderNicknamesView(root);toast('Nickname saved.')})}
async function renderCustomizeView(root){
 await loadChatExtras();root.replaceChildren();const can=chatExtras.can.theme,current=chatExtras.theme||{color:CHAT_COLORS[0],emoji:'👍'},pick={...current};
 if(!can)root.append(node('p','Only the group admin can change the colour and emoji.','hint'));
 root.append(node('p','Chat colour','info-caption'));const colors=node('div',undefined,'chat-color-grid');for(const c of CHAT_COLORS){const b=button('',()=>{pick.color=c;for(const x of colors.children)x.setAttribute('aria-pressed',String(x.dataset.color===c))},'chat-color-swatch');b.dataset.color=c;b.style.background=c;b.setAttribute('aria-label','Colour '+c);b.setAttribute('aria-pressed',String(c===current.color));b.disabled=!can;colors.append(b)}root.append(colors);
 root.append(node('p','Quick emoji','info-caption'));const emojis=node('div',undefined,'chat-emoji-grid');for(const e of CHAT_EMOJIS){const b=button(e,()=>{pick.emoji=e;for(const x of emojis.children)x.setAttribute('aria-pressed',String(x.textContent===e))},'chat-emoji-choice');b.setAttribute('aria-pressed',String(e===current.emoji));b.disabled=!can;emojis.append(b)}root.append(emojis);
 root.append(node('p','Background photo','info-caption'));const bgBox=node('div',undefined,'chat-bg-preview');const paintBg=()=>{bgBox.style.backgroundImage=pick.background?'linear-gradient(#0006,#0006),url("'+pick.background+'")':'';bgBox.textContent=pick.background?'':'No background photo'};paintBg();root.append(bgBox);
 if(can){const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;file.onchange=async()=>{const f=file.files[0];if(!f)return;if(f.size>8*1024*1024)return toast('Choose a photo below 8 MB.');bgBox.textContent='Uploading…';try{const r=await fetch('/api/upload',{method:'POST',credentials:'same-origin',headers:{'content-type':f.type,'x-upload-purpose':'profile'},body:f}),d=await r.json();if(!r.ok)throw Error(d.error||'Upload failed');pick.backgroundId=d.id;pick.background=d.url||('/media/'+d.id);paintBg()}catch(e){toast(e.message);paintBg()}};
  const row=node('div',undefined,'chat-bg-actions');row.append(button('🖼️ Choose from gallery',()=>file.click(),'btn secondary'),button('Remove',()=>{pick.backgroundId=null;pick.background='';paintBg()},'btn ghost'),file);root.append(row)}
 if(can)root.append(button('Save',async()=>{try{const payload={color:pick.color,emoji:pick.emoji};if(pick.backgroundId!==undefined)payload.backgroundId=pick.backgroundId;await api('/chat-extras/'+extrasKey(chat)+'/theme',payload);await loadChatExtras();toast('Chat updated.')}catch(e){toast(e.message)}},'btn chat-customize-save'));
}
async function renderPinsView(root){
 root.replaceChildren(node('p','Loading…','muted'));await loadChatExtras();root.replaceChildren();
 if(!chatExtras.pins.length){root.append(node('p',chatExtras.can.pin?'No pinned messages. Tap ⋮ on a message and choose Pin message.':'No pinned messages yet.','muted'));return}
 for(const p of chatExtras.pins){const row=node('div',undefined,'pinned-message'),head=node('div',undefined,'pinned-head');head.append(node('strong',nicknameFor(p.user_id,p.name||'Member')),node('small',new Date(p.created_at).toLocaleString()));const text=String(p.text||'').startsWith('media:')?(typeof inboxPreview==='function'?inboxPreview(p.text):'Photo or file'):p.text;row.append(head,node('p',text));if(p.only_me)row.append(node('span','🔒 Only you','pin-only-me'));
  if(chatExtras.can.pin)row.append(button('Unpin',async()=>{try{await api('/chat-extras/'+extrasKey(chat)+'/pin',{messageId:p.id,pinned:false,...(p.only_me?{scope:'me'}:{})});await renderPinsView(root)}catch(e){toast(e.message)}},'btn secondary pinned-unpin'));root.append(row)}
}
function openGroupExtras(kind){const root=$('groupInfoExtras');root.dataset.title={nicknames:'Nicknames',customize:'Customize',pins:'Pinned messages'}[kind];showGroupInfoView('extras');void (kind==='nicknames'?renderNicknamesView:kind==='customize'?renderCustomizeView:renderPinsView)(root).catch(e=>toast(e.message))}
$('groupNicknames').onclick=()=>openGroupExtras('nicknames');$('groupCustomize').onclick=()=>openGroupExtras('customize');$('groupPinsRow').onclick=()=>openGroupExtras('pins');
decorateInfoRows($('groupInfoHome'));
// Personal chat info: the same views, plus Nicknames and Customize shortcuts.
{const base=renderPeerInfo;renderPeerInfo=function(){
 if(['nicknames','customize','pins'].includes(peerInfoView)){const root=$('peerInfoBody');root.replaceChildren();root.append(node('h2',{nicknames:'Nicknames',customize:'Customize',pins:'Pinned messages'}[peerInfoView]));const box=node('div');root.append(box);void (peerInfoView==='nicknames'?renderNicknamesView:peerInfoView==='customize'?renderCustomizeView:renderPinsView)(box).catch(e=>toast(e.message));return}
 base();const root=$('peerInfoBody'),shortcuts=root.querySelector('.peer-info-shortcuts');if(!shortcuts)return;const go=view=>()=>{peerInfoView=view;renderPeerInfo()};
 const nick=button('',go('nicknames'));nick.innerHTML='<i data-icon="nick"></i><span>Nicknames</span>';const custom=button('',go('customize'));custom.innerHTML='<i data-icon="palette"></i><span>Customize</span>';
 shortcuts.children[0]?.after(nick);shortcuts.querySelector('button:nth-child(3)')?.after(custom);
 const media=[...root.querySelectorAll('.info-row')].find(b=>/media/i.test(b.textContent));const pins=button('Pinned messages',go('pins'),'info-row');media?.after(pins);decorateInfoRows(root);
 const title=root.querySelector('.peer-info-name h2'),nickname=nicknameFor(privatePeer.id,'');if(title&&nickname){title.textContent=nickname;title.after(node('small',privatePeer.name,'muted'))}
}}

// ---- Chat header: active status, price range under the group name, pinned message bar ----
function presenceText(seen){if(!seen)return '';const m=Math.floor((Date.now()-seen)/60000);if(m<3)return 'Active now';if(m<60)return 'Active '+m+'m ago';const h=Math.floor(m/60);if(h<24)return 'Active '+h+'h ago';return ''}
function onChatData(c,data){
 if(c.kind!=='private')return;const text=presenceText(data.peer_seen_at),online=text==='Active now';let el=$('chatPresence');
 if(!el){el=node('span',undefined,'chat-presence');el.id='chatPresence';$('chatSubtitle').after(el)}el.textContent=text;el.hidden=!text;el.classList.toggle('online',online);$('chatHeaderAvatar').classList.toggle('is-online',online);
}
const shortTaka=n=>n===null||n===undefined?'':'৳'+(n>=1000?(Math.round(n/100)/10).toString().replace(/\.0$/,'')+'k':String(n));
async function paintGroupRangeLabel(c=chat){
 if(c?.kind!=='group')return;try{const d=await api('/groups/'+c.id);if(chat?.id!==c.id)return;const ranges=d.ranges||[],b=$('idRangeToggle');
  let label='All prices';if(ranges.length){const min=Math.min(...ranges.map(r=>r.min_price||0)),open=ranges.some(r=>r.max_price===null),max=Math.max(...ranges.map(r=>r.max_price||0));label=shortTaka(min)+' – '+(open?shortTaka(Math.max(max,min))+'+':shortTaka(max))}
  b.innerHTML='<span class="range-coin" aria-hidden="true">৳</span><span>'+label.replace(/[<>&]/g,'')+'</span><span class="range-caret" aria-hidden="true">▾</span>';b.classList.add('chat-range-chip');b.setAttribute('aria-label','Price range '+label+'. Show ID ranges');
 }catch{}
}
{const base=openChat;openChat=async function(...args){const r=await base.apply(this,args);void paintGroupRangeLabel();return r}}
function paintPinnedBar(){
 const bar=$('chatPinnedBar');if(!bar)return;const pins=chatExtras.key&&chatExtras.key===extrasKey(chat)?chatExtras.pins:[];bar.hidden=!pins.length;if(!pins.length)return;
 const p=pins[0],text=String(p.text||'').startsWith('media:')?'📷 Photo or file':String(p.text||'');$('chatPinnedText').textContent=nicknameFor(p.user_id,p.name||'')+': '+text;$('chatPinnedCount').textContent=pins.length>1?String(pins.length):'';
 bar.onclick=()=>{const bubble=document.querySelector('#chatMessages .bubble[data-message-id="'+p.id+'"]');if(bubble){bubble.scrollIntoView({block:'center',behavior:'smooth'});bubble.classList.remove('flash');void bubble.offsetWidth;bubble.classList.add('flash');return}
  if(chat.kind==='group'){$('groupSettings').click();setTimeout(()=>openGroupExtras('pins'),400)}else{openPeerInfo();peerInfoView='pins';renderPeerInfo()}};
}
{const base=applyChatExtras;applyChatExtras=function(){base();paintPinnedBar()}}

// ---- Hold a message: reactions and actions (Copy, Pin, Delete for me / everyone, Report), like Messenger ----
const QUICK_REACTIONS=['❤️','😆','😮','😢','😡','👍'],MORE_REACTIONS=['😂','🔥','🙏','👏','💯','🎮'];let extrasLoadedAt=0;
function messagePlainText(m){const t=String(m?.text||'');if(t.startsWith('media:'))return '';if(typeof isCallNote==='function'&&isCallNote(t))return '';return t}
function closeMessageSheet(){$('messageSheet')?.remove();for(const b of document.querySelectorAll('.bubble.held,.bubble.held-source'))b.classList.remove('held','held-source')}
function openMessageSheet(bubble){
 closeMessageSheet();const m=bubble._message,c=bubble._chat;if(!m||!c)return;navigator.vibrate?.(15);
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay||e.target.classList.contains('held-copy'))closeMessageSheet()};
 {let r=bubble.getBoundingClientRect();const room=innerHeight-190;if(r.bottom>room||r.top<130){const box=$('chatMessages');box.scrollTop+=r.bottom>room?Math.min(r.bottom-room,r.top-130):r.top-130;r=bubble.getBoundingClientRect()}const copy=bubble.cloneNode(true);copy.classList.add('held-copy');copy.removeAttribute('hidden');copy.querySelector('.reaction-pill')?.remove();bubble.classList.add('held-source');const top=Math.max(130,Math.min(innerHeight-190-r.height,r.top));Object.assign(copy.style,bubble.classList.contains('mine')?{position:'fixed',right:(innerWidth-r.right)+'px',top:top+'px',minWidth:r.width+'px',maxWidth:'80vw',margin:'0'}:{position:'fixed',left:r.left+'px',top:top+'px',minWidth:r.width+'px',maxWidth:'80vw',margin:'0'});overlay.append(copy);bubble._heldTop=top}
 const canReact=['private','group'].includes(c.kind)&&!m.deleted_at;
 if(canReact){const bar=node('div',undefined,'reaction-bar'),mine=(chatExtras.reactions||[]).find(r=>r.message_id===m.id&&r.mine)?.emoji;
  const react=async emoji=>{closeMessageSheet();try{await api('/chat-extras/'+extrasKey(c)+'/react',{messageId:m.id,emoji:emoji===mine?'':emoji});await loadChatExtras(c);paintMessageExtras()}catch(e){toast(e.message)}};
  for(const e of QUICK_REACTIONS){const b=button(e,()=>void react(e),'reaction-choice'+(e===mine?' active':''));b.setAttribute('aria-label','React '+e);bar.append(b)}
  const more=button('+',()=>{more.remove();for(const e of MORE_REACTIONS){const b=button(e,()=>void react(e),'reaction-choice'+(e===mine?' active':''));bar.append(b)}},'reaction-choice more');more.setAttribute('aria-label','More reactions');bar.append(more);
  bar.style.top=Math.max(64,(bubble._heldTop||bubble.getBoundingClientRect().top)-62)+'px';overlay.append(bar)}
 const sheet=node('div',undefined,'message-actions'),opts=bubble._options||[],find=re=>opts.find(o=>re.test(o[0]));
 const add=(icon,label,fn,cls='')=>{const b=button('',()=>{closeMessageSheet();fn()},'message-action '+cls);b.innerHTML='<span class="ma-icon">'+icon+'</span><span>'+label+'</span>';sheet.append(b)};
 const text=messagePlainText(m);if(text&&!m.deleted_at)add('⧉','Copy',async()=>{try{await navigator.clipboard.writeText(text);toast('Copied.')}catch{toast('Could not copy.')}});
 const pin=find(/pin message/i);if(pin)add('📌',/unpin/i.test(pin[0])?'Unpin':'Pin',pin[1]);
 const everyone=find(/^delete message/i),restore=find(/restore message/i);
 if(['private','group'].includes(c.kind))add('🗑','Delete',()=>openDeleteChoice(c,m,everyone),'danger');else if(everyone)add('🗑','Delete',everyone[1],'danger');
 if(restore)add('↺','Restore',restore[1]);const report=find(/report/i);if(report)add('⚠','Report',report[1]);
 if(!sheet.children.length&&!canReact)return closeMessageSheet();overlay.append(sheet);document.body.append(overlay);
}
function openDeleteChoice(c,m,everyone){
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const box=node('div',undefined,'delete-choice');
 box.append(node('strong','Delete message?'));
 box.append(button('Delete for me',async()=>{closeMessageSheet();try{await api('/chat-extras/'+extrasKey(c)+'/hide',{messageId:m.id});await loadChatExtras(c);paintMessageExtras();toast('Deleted for you.')}catch(e){toast(e.message)}},'btn secondary'));
 if(everyone)box.append(button('Delete for everyone',async()=>{closeMessageSheet();try{await everyone[1]()}catch(e){toast(e.message)}},'btn danger-btn'));
 box.append(button('Cancel',closeMessageSheet,'btn ghost'));overlay.append(box);document.body.append(overlay);
}
// Hold for half a second (or right-click on a computer) to open the menu.
(()=>{const root=$('chatMessages');let timer=null,start=null;
 const cancel=()=>{clearTimeout(timer);timer=null;start=null};
 root.addEventListener('pointerdown',e=>{const b=e.target.closest('.bubble');if(!b||e.target.closest('a,button,video,audio,input,details,.listing-card,.post-card')||e.button>0)return;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;openMessageSheet(b)},480)});
 root.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)cancel()});for(const t of ['pointerup','pointercancel','pointerleave'])root.addEventListener(t,cancel);root.addEventListener('scroll',cancel,{passive:true});
 root.addEventListener('contextmenu',e=>{const b=e.target.closest('.bubble');if(!b)return;e.preventDefault();cancel();openMessageSheet(b)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMessageSheet()})})();
// Reactions under messages, and messages I deleted for myself stay hidden.
function paintMessageExtras(){
 const same=chatExtras.key&&chatExtras.key===extrasKey(chat),hidden=new Set(same?chatExtras.hidden||[]:[]),by=new Map();if(same)for(const r of chatExtras.reactions||[]){if(!by.has(r.message_id))by.set(r.message_id,[]);by.get(r.message_id).push(r)}
 for(const b of document.querySelectorAll('#chatMessages .bubble[data-message-id]')){const id=Number(b.dataset.messageId);b.hidden=hidden.has(id);b.querySelector('.reaction-pill')?.remove();const list=by.get(id);if(!list?.length)continue;
  const pill=node('button',undefined,'reaction-pill'+(list.some(r=>r.mine)?' mine':''));pill.type='button';const total=list.reduce((n,r)=>n+r.total,0);pill.textContent=list.sort((a,z)=>z.total-a.total).slice(0,3).map(r=>r.emoji).join('')+(total>1?' '+total:'');pill.setAttribute('aria-label',total+' reactions');pill.onclick=()=>openMessageSheet(b);b.append(pill)}
}
{const base=refreshChat;refreshChat=async function(...args){const r=await base.apply(this,args);if(Date.now()-extrasLoadedAt>10000&&extrasKey(chat)){extrasLoadedAt=Date.now();void loadChatExtras().then(paintMessageExtras)}paintMessageExtras();return r}}

// ---- Animated mute bell: a line falls across the bell when muted ----
const MUTE_BELL='<svg viewBox="0 0 24 24" class="mute-bell" aria-hidden="true"><g class="bell"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 21h4"/></g><path class="slash" d="M4 4l16 16"/></svg>';
function paintMuteButton(btn,muted,animate){if(!btn)return;let i=btn.querySelector('i.mute-wrap');if(!i){const old=btn.querySelector('i[data-icon],svg');i=document.createElement('i');i.className='mute-wrap';i.innerHTML=MUTE_BELL;if(old)old.replaceWith(i);else btn.prepend(i)}
 const was=btn.classList.contains('is-muted');btn.classList.toggle('is-muted',!!muted);if(animate&&was!==!!muted){btn.classList.remove('bell-ring');void btn.offsetWidth;btn.classList.add('bell-ring')}}
new MutationObserver(()=>{paintMuteButton($('muteGroup'),/unmute/i.test($('muteGroupLabel').textContent),!$('groupSettingsPanel').hidden);if(groupDetail?.group&&!$('groupSettingsPanel').hidden)renderGroupConversationActions(groupDetail.group)}).observe($('muteGroupLabel'),{childList:true,characterData:true,subtree:true});
paintMuteButton($('muteGroup'),false,false);
{let lastPeerMuted=null;const base=renderPeerInfo;renderPeerInfo=function(){base();const btn=[...$('peerInfoBody').querySelectorAll('.peer-info-shortcuts>button')].find(b=>/^(un)?mute$/i.test(b.textContent.trim()));if(!btn)return;const muted=/unmute/i.test(btn.textContent),changed=lastPeerMuted!==null&&lastPeerMuted!==muted;
 // draw the old state first, then animate to the new one
 paintMuteButton(btn,changed?lastPeerMuted:muted,false);if(changed)requestAnimationFrame(()=>requestAnimationFrame(()=>paintMuteButton(btn,muted,true)));lastPeerMuted=muted}}


// ---- Sell an ID inside the group (only this group sees it): title, ID, price, photos or videos ----
function openGroupIdPost(){
 if(chat?.kind!=='group')return;const groupId=chat.id;closeChatTools?.();
 openStepDialog('🏷️ Sell ID in this group',body=>{
  body.append(node('p','Only members of this group can see this post.','hint'));
  // Game: Free Fire, eFootball or your own game name (Custom). Free Fire can also say Male or Female.
  const game=node('select',undefined,'input');game.dataset.role='game';for(const [v,l]of [['free-fire','Free Fire'],['efootball','eFootball'],['custom','Custom game (type the name)']])game.append(new Option(l,v));field(body,'Game',game);
  const custom=node('input',undefined,'input');custom.dataset.role='custom-game';custom.maxLength=60;custom.placeholder='Game name, for example PUBG Mobile';field(body,'Game name',custom);
  const gender=node('div',undefined,'id-gender-box');gender.innerHTML='<span class="id-gender-label">ID type <small>(optional)</small></span><div class="id-gender-chips"><button type="button" class="id-gender-chip" data-gender="male" aria-pressed="false">👦 Male</button><button type="button" class="id-gender-chip" data-gender="female" aria-pressed="false">👧 Female</button></div>';body.append(gender);
  gender.addEventListener('click',e=>{const b=e.target.closest('[data-gender]');if(!b)return;const on=b.getAttribute('aria-pressed')!=='true';for(const x of gender.querySelectorAll('[data-gender]'))x.setAttribute('aria-pressed',String(on&&x===b))});
  const syncGame=()=>{const c=game.value==='custom';custom.required=c;for(const el of [custom,custom.previousElementSibling])if(el)el.style.display=c?'':'none';gender.style.display=game.value==='free-fire'?'':'none'};game.onchange=syncGame;syncGame();
  const details=node('textarea',undefined,'input');details.rows=4;details.maxLength=2000;details.placeholder='ID details: level, rank, skins, guns, evo items…';field(body,'ID details',details).required=true;
  const price=node('input',undefined,'input');price.maxLength=12;price.inputMode='decimal';price.placeholder='Example: 5000 or 5k';field(body,'Price (৳)',price).required=true;
  const files=node('input',undefined,'input');files.type='file';files.multiple=true;files.accept='image/jpeg,image/png,image/webp,video/mp4,video/webm';field(body,'Photos or video',files);
 },'Post',async body=>{
  const details=body.querySelector('textarea').value.trim(),price=body.querySelector('input[inputmode=decimal]').value.trim(),list=[...body.querySelector('input[type=file]').files].slice(0,10);
  if(!details||!price)throw Error('Write the ID details and the price.');if(list.some(f=>f.size>(f.type.startsWith('video/')?50:8)*1024*1024))throw Error('Photos up to 8 MB and videos up to 50 MB.');
  const gameValue=body.querySelector('[data-role=game]')?.value||'free-fire',customName=(body.querySelector('[data-role=custom-game]')?.value||'').trim(),idGender=gameValue==='free-fire'?body.querySelector('.id-gender-chip[aria-pressed="true"]')?.dataset.gender||null:null;
  if(gameValue==='custom'&&!customName)throw Error('Write the game name.');
  const title=(details.split('\n').map(x=>x.trim()).find(Boolean)||(gameValue==='custom'?customName:gameValue==='efootball'?'eFootball':'Free Fire')+' ID').slice(0,100);
  const status=body.closest('form').querySelector('.deal-step-status'),media=[];
  for(const [i,f] of list.entries()){status.textContent='Uploading '+(i+1)+' of '+list.length+'…';const r=await fetch('/api/upload',{method:'POST',credentials:'same-origin',headers:{'content-type':f.type,'x-upload-purpose':'post'},body:f}),d=await r.json();if(!r.ok)throw Error(d.error||'Upload failed');media.push(d)}
  status.textContent='Posting…';const result=await api('/posts',{title,details,price,kind:'Game ID',postIntent:'sell',gameCategory:gameValue,customGameName:gameValue==='custom'?customName:'',idGender,groupId,media,clientKey:crypto.randomUUID()});
  toast(result.status==='approved'?'✅ Posted in the group.':'⏳ Saved. It appears after the safety check.');if(chat?.id===groupId&&typeof loadGroupPosts==='function')void loadGroupPosts().catch(()=>{});
 });
}
$('chatGroupPost').onclick=()=>openGroupIdPost();$('groupPostButton').onclick=()=>openGroupIdPost();
{const base=openChat;openChat=async function(kind,...rest){$('chatGroupPost').hidden=kind!=='group';return base.call(this,kind,...rest)}}

// ---- Group info like Messenger: ⋮ menu, Invites & requests next to members, Actions and Privacy & support ----
INFO_ICONS.userCheck='<path d="m2.5 12 2.5 2.5 4.5-5"/><circle cx="15" cy="8" r="3.4"/><path d="M9.5 19.5c.6-3.5 2.9-5.3 5.5-5.3s4.9 1.8 5.5 5.3"/>';
INFO_ICONS.speaker='<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>';
INFO_ICONS.shieldStar='<path d="M12 3 5 6v5.5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5V6Z"/><path d="m12 8.5 1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3Z"/>';
INFO_ICONS.minus='<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>';INFO_ICONS.warn='<path d="M12 3.5 2.5 20h19Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".6"/>';
$('infoMembersRow').after($('groupRequestsButton'));$('groupRequestsButton').querySelector('i').innerHTML='';decorateInfoRows($('groupInfoHome'));
function infoRowWith(icon,label,sub,fn,cls=''){const b=button('',fn,'info-row '+cls);const i=document.createElement('i');i.dataset.icon=icon;i.innerHTML=infoIcon(icon);const t=node('span',undefined,'info-row-text');t.append(node('span',label));if(sub)t.append(node('small',sub));b.append(i,t);return b}
renderGroupConversationActions=function(group){
 const root=$('groupConversationActions');if(!root)return;root.replaceChildren();const data=groups.find(g=>g.id===group.id)||group,admin=group.owner_id===me.id,canManage=!!group.canManage,archived=!!data.chat_archived,item={kind:'group',id:group.id,name:group.name,admin,archived};
 root.append(node('p','Actions','info-caption'));
 root.append(infoRowWith('bellOff',(groupMuted?'Unmute ':'Mute ')+group.name,'',()=>$('muteGroup').click(),'ellipsis-row'));
 root.append(infoRowWith('speaker','Notifications & sounds',groupMuted?'Muted until you change it':'On',()=>$('muteGroup').click()));
 root.append(infoRowWith('archive',archived?'Unarchive chat':'Archive chat','',()=>conversationAction(item,archived?'unarchive':'archive')));
 root.append(node('p','Privacy & support','info-caption'));
 root.append(infoRowWith('minus','Block a member','',()=>void openBlockMemberList(group)));
 paintPermissionRow(group);
 root.append(infoRowWith('warn','Report','Give feedback and report conversation',()=>{openReport(null,'other');$('reportContext').textContent='Report the group “'+group.name+'”. Only the website owner sees your report.';$('reportDetails')&&($('reportDetails').value='Group: '+group.name+' ('+group.id+')\n')}));
 if(!admin)root.append(infoRowWith('block','Block group','',()=>conversationAction(item,'block')));
 root.append(infoRowWith('trash','Delete chat','Clears your copy of the messages',()=>conversationAction(item,'delete')));
 root.append(infoRowWith('leave','Leave group','',()=>void leaveGroupFlow(item),'danger-row'));
};
async function openBlockMemberList(group){
 const root=$('groupInfoExtras');root.dataset.title='Block a member';showGroupInfoView('extras');root.replaceChildren(node('p','Loading…','muted'));
 try{const {members}=await api('/groups/'+group.id+'/members');root.replaceChildren(node('p','Blocked people cannot message you privately, and you do not see their messages.','hint'));
  for(const m of members.filter(x=>x.id!==me.id)){const row=button('',async()=>{if(!confirm('Block '+m.name+'?'))return;try{await blockMember({id:m.id,name:m.name},true)}catch(e){toast(e.message)}},'info-row nickname-row');row.append(avatar(m),node('span',m.name));root.append(row)}
  if(root.children.length===1)root.append(node('p','No other members yet.','muted'))}catch(e){root.replaceChildren(node('p',e.message,'muted'))}
}
// ⋮ menu at the top of group info
$('groupInfoMenu').onclick=e=>{e.stopPropagation();document.querySelector('.group-info-popover')?.remove();const g=groupDetail?.group;if(!g)return;const menu=node('div',undefined,'group-info-popover');menu.setAttribute('role','menu');const add=(label,fn)=>{const b=button(label,()=>{menu.remove();fn()});b.setAttribute('role','menuitem');menu.append(b)};
 if(g.canManage){add('Change group photo',()=>{$('editGroupButton').click();setTimeout(()=>$('editGroupLogo')?.click(),200)});add('Change name',()=>{$('editGroupButton').click();setTimeout(()=>$('editGroupName')?.focus(),200)})}
 add('Delete conversation',()=>conversationAction({kind:'group',id:g.id,name:g.name,admin:g.owner_id===me.id},'delete'));
 add('Leave group',()=>void leaveGroupFlow(g));
 add('Report technical problem',()=>openReport(null,'website-issue'));$('groupSettingsPanel').append(menu);setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0)};
// Only admins can send: the box says so for everyone else.
function paintComposerPermission(){const g=groupDetail?.group,blocked=chat?.kind==='group'&&g&&g.id===chat.id&&g.adminsOnly&&!g.canManage;let note=$('adminsOnlyNote');if(!note){note=node('div','🔒 Only admins can send messages in this group.','admins-only-note');note.id='adminsOnlyNote';$('chatForm').before(note)}note.hidden=!blocked;$('chatForm').classList.toggle('composer-locked',!!blocked)}
{const base=openChat;openChat=async function(kind,id,...rest){const r=await base.call(this,kind,id,...rest);if(kind==='group'){try{groupDetail=await api('/groups/'+id)}catch{}}paintComposerPermission();return r}}

function openPinChoice(c,m){
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const box=node('div',undefined,'delete-choice');box.append(node('strong','Pin this message'));
 const pin=async scope=>{closeMessageSheet();try{await api('/chat-extras/'+extrasKey(c)+'/pin',{messageId:m.id,pinned:true,...(scope==='me'?{scope:'me'}:{})});await loadChatExtras(c);toast(scope==='me'?'📌 Pinned. Only you can see it.':'📌 Pinned for both of you.')}catch(e){toast(e.message)}};
 box.append(button('👥 Pin for both of us',()=>void pin('both'),'btn'),button('🔒 Pin only for me',()=>void pin('me'),'btn secondary'),button('Cancel',closeMessageSheet,'btn ghost'));overlay.append(box);document.body.append(overlay);
}

// ---- Members list: admins first, then members, with photos; admins can make others admin ----
function renderGroupMembersList(members,g){
 const root=$('groupMembers');const prevQ=root.querySelector('.member-search input')?.value||'';root.replaceChildren();
 const search=node('label',undefined,'member-search');const q=node('input',undefined,'input');q.type='search';q.placeholder='Search members by name';q.setAttribute('aria-label','Search members');q.value=prevQ;search.append(node('span','🔍','member-search-icon'),q);root.append(search);
 const list=node('div',undefined,'member-search-results');root.append(list);
 const paint=()=>{const term=q.value.trim().toLowerCase();const match=m=>!term||[m.name,nicknameFor(m.id,m.name)].some(x=>String(x||'').toLowerCase().includes(term));const shown=members.filter(match);renderMemberGroups(list,shown,g,term)};q.oninput=paint;paint();
}
function renderMemberGroups(root,members,g,term){
 root.replaceChildren();const admins=members.filter(m=>m.is_admin||m.id===g.owner_id),rest=members.filter(m=>!(m.is_admin||m.id===g.owner_id));
 if(term&&!members.length){root.append(node('p','No member named "'+term+'".','muted'));return}
 const row=m=>{const b=button('',()=>openMemberAdminSheet(m,g),'member-row');const who=node('span',undefined,'member-row-text');const name=node('strong',nicknameFor(m.id,m.name));who.append(name,node('small',m.id===g.owner_id?'Group creator · Admin':m.is_admin?'Admin':m.role==='owner'?'Website owner':m.role==='trusted'?'Trusted admin':'Member'));b.append(avatar(m),who);if(m.is_admin||m.id===g.owner_id)b.append(node('span','Admin','admin-chip'));return b};
 root.append(node('p','Admins · '+admins.length,'info-caption'));for(const m of admins)root.append(row(m));
 root.append(node('p','Members · '+rest.length,'info-caption'));for(const m of rest)root.append(row(m));if(!rest.length&&!term)root.append(node('p','No other members yet.','muted'));
}
function openMemberAdminSheet(m,g){
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const box=node('div',undefined,'delete-choice');const head=node('div',undefined,'member-sheet-head');head.append(avatar(m),node('strong',m.name));box.append(head);
 box.append(button('👤 View profile',()=>{closeMessageSheet();showProfile(m.id)},'btn secondary'));
 const canManage=!!g.canManage,creator=g.owner_id===me.id||me.role==='owner';
 if(canManage&&m.id!==g.owner_id&&m.id!==me.id){if(!m.is_admin)box.append(button('⭐ Make admin',()=>void setGroupAdmin(m,g,true),'btn'));else if(creator)box.append(button('Remove as admin',()=>void setGroupAdmin(m,g,false),'btn danger-btn'));if(m.role!=='owner'&&(!m.is_admin||creator))box.append(button('🚫 Remove from group',()=>void kickGroupMember(m,g),'btn danger-btn kick-btn'))}
 box.append(button('Cancel',closeMessageSheet,'btn ghost'));overlay.append(box);document.body.append(overlay);
}
async function kickGroupMember(m,g){if(!confirm('Remove '+m.name+' from '+(g.name||'this group')+'? They can only come back with an invite link.'))return;closeMessageSheet();try{await api('/groups/'+g.id+'/members/remove',{userId:m.id});toast(m.name+' was removed from the group.');const {members}=await api('/groups/'+g.id+'/members');renderGroupMembersList(members,g)}catch(e){toast(e.message)}}
async function setGroupAdmin(m,g,admin){closeMessageSheet();try{await api('/groups/'+g.id+'/admins',{userId:m.id,admin});toast(admin?m.name+' is now an admin.':m.name+' is no longer an admin.');const {members}=await api('/groups/'+g.id+'/members');renderGroupMembersList(members,g)}catch(e){toast(e.message)}}

// ---- @mentions: type @ for the member list, @everyone for admins, @ badges, jump button and popup ----
let mentionMembers=null,mentionMembersFor='',pendingMentions=new Map(),mentionEveryone=false,mentionGroups=new Map();
async function membersForMentions(){if(chat?.kind!=='group')return [];if(mentionMembersFor!==chat.id){mentionMembersFor=chat.id;mentionMembers=null;try{mentionMembers=(await api('/groups/'+chat.id+'/members')).members}catch{mentionMembers=[]}}return mentionMembers||[]}
function closeMentionPicker(){$('mentionPicker')?.remove()}
async function updateMentionPicker(){
 const input=$('messageText');if(chat?.kind!=='group'||!input)return closeMentionPicker();const before=input.value.slice(0,input.selectionStart??input.value.length),m=before.match(/(^|\s)@([^\s@]{0,30})$/);if(!m)return closeMentionPicker();
 const q=m[2].toLowerCase(),people=(await membersForMentions()).filter(p=>p.id!==me.id&&(nicknameFor(p.id,p.name)+' '+p.name).toLowerCase().includes(q)).slice(0,30);
 let box=$('mentionPicker');if(!box){box=node('div',undefined,'mention-picker');box.id='mentionPicker';box.setAttribute('role','listbox');$('chatForm').before(box)}box.replaceChildren();
 const pick=(label,id)=>{const start=before.length-m[2].length-1,after=input.value.slice(before.length);input.value=input.value.slice(0,start)+'@'+label+' '+after;const pos=start+label.length+2;input.setSelectionRange(pos,pos);if(id==='everyone')mentionEveryone=true;else pendingMentions.set(label,id);closeMentionPicker();input.focus();input.dispatchEvent(new Event('input',{bubbles:true}))};
 if('everyone'.startsWith(q)){const row=button('',()=>pick('everyone','everyone'),'mention-row everyone');row.innerHTML='<span class="mention-all">@</span><span><strong>everyone</strong><small>Notify all members</small></span>';box.append(row)}
 for(const p of people){const label=nicknameFor(p.id,p.name),row=button('',()=>pick(label,p.id),'mention-row');const t=node('span');t.append(node('strong',label));if(p.is_admin)t.append(node('small','Admin'));row.append(avatar(p),t);box.append(row)}
 if(!box.children.length)closeMentionPicker();
}
$('messageText')?.addEventListener('input',()=>void updateMentionPicker());$('messageText')?.addEventListener('keydown',e=>{if(e.key==='Escape')closeMentionPicker()});
document.addEventListener('click',e=>{if(!e.target.closest('#mentionPicker,#messageText'))closeMentionPicker()});
// Send the people named in the message along with it.
{const base=api;api=async function(path,data,method){if(data&&typeof data.text==='string'&&/^\/groups\/[^/]+\/messages$/.test(path)&&(pendingMentions.size||mentionEveryone)){const ids=[...pendingMentions].filter(([label])=>data.text.includes('@'+label)).map(([,id])=>id);data={...data,...(ids.length?{mentions:ids}:{}),...(mentionEveryone&&/@everyone\b/.test(data.text)?{everyone:true}:{})};pendingMentions=new Map();mentionEveryone=false}return base(path,data,method)}}
{const base=openChat;openChat=async function(...a){pendingMentions=new Map();mentionEveryone=false;closeMentionPicker();return base.apply(this,a)}}
// Mentions in messages are highlighted.
function highlightMentions(){if(chat?.kind!=='group')return;const names=[...new Set([...(mentionMembers||[]).flatMap(p=>[p.name,nicknameFor(p.id,p.name)]),'everyone'])].filter(Boolean).sort((a,b)=>b.length-a.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));if(!names.length)return;const re=new RegExp('@('+names.join('|')+')','g');
 for(const b of document.querySelectorAll('#chatMessages .bubble[data-message-id]')){if(b.dataset.mentionsDone)continue;b.dataset.mentionsDone='1';const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.message-author,time,.reaction-pill,.mention')?NodeFilter.FILTER_REJECT:n.nodeValue.includes('@')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});const list=[];while(walker.nextNode())list.push(walker.currentNode);
  for(const t of list){const parts=t.nodeValue.split(re);if(parts.length<2)continue;const frag=document.createDocumentFragment();parts.forEach((part,i)=>{if(i%2){const s=node('span','@'+part,'mention'+(part===me?.name||part===nicknameFor(me?.id,'')||part==='everyone'?' me':'')+(part==='everyone'?' everyone':''));frag.append(s)}else if(part)frag.append(document.createTextNode(part))});t.replaceWith(frag)}}}
// Floating @ button: jumps to the messages that mention me.
function paintMentionJump(){let b=$('mentionJump');const list=chat?.kind==='group'&&chatExtras.key===extrasKey(chat)?chatExtras.mentions||[]:[];if(!b){b=button('@',()=>void jumpToMention(),'mention-jump');b.id='mentionJump';b.setAttribute('aria-label','Go to the message that mentions you');$('chatForm').before(b)}b.hidden=!list.length;b.dataset.count=list.length>1?String(list.length):''}
async function jumpToMention(){const id=(chatExtras.mentions||[])[0];if(!id)return;const bubble=document.querySelector('#chatMessages .bubble[data-message-id="'+id+'"]');if(bubble){bubble.scrollIntoView({block:'center',behavior:'smooth'});bubble.classList.remove('flash');void bubble.offsetWidth;bubble.classList.add('flash')}else toast('That message is older than the loaded chat.');
 chatExtras.mentions=chatExtras.mentions.slice(1);paintMentionJump();try{await api('/chat-extras/'+extrasKey(chat)+'/mention-seen',{messageId:id});mentionGroups.delete(chat.id);paintMentionBadges()}catch{}}
{const base=paintMessageExtras;paintMessageExtras=function(){base();void membersForMentions().then(highlightMentions);paintMentionJump();let prev=null,prevBubble=null;for(const b of document.querySelectorAll('#chatMessages>*')){if(!b.classList.contains('bubble')||b.hidden){if(!b.hidden)prev=null;continue}const m=b._message,same=prev&&m&&prev.user_id===m.user_id;b.classList.toggle('cont',!!same);if(same)prevBubble?.classList.add('has-next');b.classList.remove('has-next');prev=m;prevBubble=b}}}
// @ badge on groups in the chat list, even when the group is muted.
function paintMentionBadges(){for(const row of document.querySelectorAll('.chat-row[data-chat-key^="group:"]')){const id=row.dataset.chatKey.slice(6),n=mentionGroups.get(id);row.classList.toggle('has-mention',!!n)}}
new MutationObserver(rafBatch(()=>paintMentionBadges())).observe(document.body,{childList:true,subtree:true});
// Popup at the top when someone mentions me.
function onMentions(data){mentionGroups=new Map((data.mentions||[]).map(m=>[m.group_id,m.total]));paintMentionBadges();const m=data.mention_popup;if(!m)return;const key='wm_mention_popped';let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]')}catch{}if(seen.includes(m.message_id))return;seen=[...seen.slice(-50),m.message_id];try{localStorage.setItem(key,JSON.stringify(seen))}catch{}
 if(chat?.kind==='group'&&chat.id===m.group_id&&!document.hidden){void loadChatExtras();return}showMentionPopup(m)}
function showMentionPopup(m){$('mentionPopup')?.remove();const pop=button('',async()=>{pop.remove();navigate('messages');await loadMessages();await openChat('group',m.group_id);await loadChatExtras();setTimeout(()=>void jumpToMention(),600)},'mention-popup');pop.id='mentionPopup';
 pop.innerHTML='<span class="mention-popup-icon">'+(m.everyone?'📣':'@')+'</span><span class="mention-popup-copy"><b></b><small></small></span>';pop.querySelector('b').textContent=(m.everyone?m.name+' mentioned everyone':m.name+' mentioned you')+' · '+m.group_name;pop.querySelector('small').textContent=m.text||'';document.body.append(pop);navigator.vibrate?.([60,40,60]);setTimeout(()=>pop.classList.add('leaving'),6500);setTimeout(()=>pop.remove(),7000)}
// Opened from a phone alert: /?group=…&message=…
(()=>{const q=new URLSearchParams(location.search),g=q.get('group');if(!g)return;let tries=0;const t=setInterval(async()=>{if(++tries>40)return clearInterval(t);if(!me)return;clearInterval(t);history.replaceState(null,'',location.pathname+'#messages');try{navigate('messages');await loadMessages();await openChat('group',g);await loadChatExtras();setTimeout(()=>void jumpToMention(),600)}catch{}},500)})();


// ---- Invite links: https://<site>/j/<code> opens the website straight into the group ----
let pendingInviteCode=(location.pathname.match(/^\/j\/([A-Za-z0-9]{6,32})$/)||[])[1]||null;
{const base=acceptGroupInvite;acceptGroupInvite=async function(){if(!pendingInviteCode)return base();if(!me){showLogin();return}const code=pendingInviteCode;pendingInviteCode=null;history.replaceState(null,'','/#messages');
 try{const info=await api('/invites/'+code);if(info.member){navigate('messages');await loadMessages();await openChat('group',info.group.id);return}if(info.pending)return toast('⏳ Your request to join '+info.group.name+' is waiting for the group admin.');openGroupInviteDialog(info.group)}catch(e){toast(e.message)}}}
async function groupInviteLink(id){return api('/groups/'+id+'/invite')}
$('inviteGroup').onclick=async()=>{try{const inv=await groupInviteLink(chat.id),name=groupDetail?.group?.name||'Group';if(navigator.share)await navigator.share({title:name,text:'Join '+name,url:inv.url});else{await navigator.clipboard.writeText(inv.url);toast('Invite link copied.')}}catch(e){if(e.name!=='AbortError')toast(e.message||'Could not share the invite link.')}};
async function openInvitesPage(){
 if(chat?.kind!=='group')return;showGroupInfoView('requests');$('groupInfoTitle').textContent='Invites & requests';let box=$('groupInviteBox');if(!box){box=node('div',undefined,'invite-box');box.id='groupInviteBox';$('groupRequestList').before(box)}box.replaceChildren(node('p','Loading…','muted'));
 try{const inv=await groupInviteLink(chat.id);box.replaceChildren();
  const head=node('label',undefined,'invite-link-row');const copy=node('span',undefined,'invite-link-copy');copy.append(node('strong','Invite link'),node('small',inv.enabled?inv.url:'Invite link is off'));const sw=node('input');sw.type='checkbox';sw.setAttribute('role','switch');sw.checked=inv.enabled;sw.disabled=!inv.canManage;sw.className='wm-switch';head.append(copy,sw);box.append(head);
  box.append(node('p',inv.enabled?'Anyone can open the group with this link'+(inv.joinApproval?' and ask to join. An admin approves each request.':' and join right away.'):'Nobody can join with the link while it is off.','invite-hint'));
  sw.onchange=async()=>{try{await api('/groups/'+chat.id+'/invite',{action:sw.checked?'on':'off'});await openInvitesPage()}catch(e){toast(e.message);sw.checked=!sw.checked}};
  const actions=node('div',undefined,'invite-actions');if(inv.enabled){actions.append(infoRowWith('copy','Copy','',async()=>{try{await navigator.clipboard.writeText(inv.url);toast('Invite link copied.')}catch{toast(inv.url)}}));if(navigator.share)actions.append(infoRowWith('share','Share','',()=>void navigator.share({title:groupDetail?.group?.name,url:inv.url}).catch(()=>{})))}
  if(inv.canManage){
   const appr=node('label',undefined,'invite-link-row');const t=node('span',undefined,'invite-link-copy');t.append(node('strong','Admin approval'),node('small','Require an admin to approve all requests to join the group.'));const s2=node('input');s2.type='checkbox';s2.setAttribute('role','switch');s2.className='wm-switch';s2.checked=inv.joinApproval;s2.onchange=async()=>{try{await api('/groups/'+chat.id+'/settings',{joinApproval:s2.checked});if(groupDetail?.group)groupDetail.group.joinApproval=s2.checked;$('groupApprovalToggle').checked=s2.checked;toast(s2.checked?'New members now need approval.':'Anyone with the link can join.')}catch(e){toast(e.message);s2.checked=!s2.checked}};appr.append(t,s2);actions.append(appr)}
  box.append(actions);if(inv.canManage){box.append(node('p','Requests to join','info-caption'));await openGroupRequests();showGroupInfoView('requests');$('groupInfoTitle').textContent='Invites & requests'}else $('groupRequestList').replaceChildren();
 }catch(e){box.replaceChildren(node('p',e.message,'muted'))}
}
INFO_ICONS.link='<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>';INFO_ICONS.copy='<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';INFO_ICONS.share='<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>';INFO_ICONS.reset='<path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 16.5"/>';

// Message permissions live in Admin tools (admins only).
function paintPermissionRow(group){$('groupPermissionRow')?.remove();if(!group.canManage)return;const canManage=true,root={append:el=>{el.id='groupPermissionRow';$('groupAdminTools').append(el)}};
root.append(infoRowWith('shieldStar','Message permissions',group.adminsOnly?'Only admins can send messages':'Everyone can send messages',()=>{if(!canManage)return toast(group.adminsOnly?'Only the group admin can send messages here.':'Everyone in this group can send messages.');openStepDialog('Message permissions',body=>{for(const [v,l] of [['all','Everyone can send messages'],['admins','Only admins can send messages']]){const lab=node('label',undefined,'report-reason'),r=node('input');r.type='radio';r.name='msg-perm';r.value=v;r.checked=(v==='admins')===!!group.adminsOnly;lab.append(r,node('span',l));body.append(lab)}},'Save',async body=>{const on=body.querySelector('input:checked')?.value==='admins';await api('/groups/'+group.id+'/settings',{adminsOnly:on});group.adminsOnly=on;if(groupDetail?.group)groupDetail.group.adminsOnly=on;renderGroupConversationActions(group);paintComposerPermission();toast(on?'Only admins can send messages now.':'Everyone can send messages now.')})}));}
{const base=showGroupInfoView;showGroupInfoView=function(view){base(view);$('groupInfoMenu').hidden=view!=='home';document.querySelector('.group-info-popover')?.remove()}}

// ---- While typing, the message box grows and the side buttons fold into ›, like Messenger ----
(()=>{const form=$('chatForm'),input=$('messageText');if(!form||!input)return;const expand=button('›',()=>{form.classList.remove('typing');form.classList.add('tools-open');input.focus()},'composer-icon composer-expand');expand.type='button';expand.setAttribute('aria-label','Show chat tools');$('chatPlusButton').before(expand);
 const sync=()=>{const typing=input.value.trim().length>0;if(!typing)form.classList.remove('tools-open');form.classList.toggle('typing',typing&&!form.classList.contains('tools-open'))};
 input.addEventListener('input',sync);form.addEventListener('submit',()=>setTimeout(sync,0));new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['value']});setInterval(()=>{if(!input.value&&form.classList.contains('typing'))sync()},800)})();

// ---- Price ranges editor: price under each name, move up/down, edit, delete ----
const rangeText=r=>shortTaka(r.min_price||0)+(r.max_price===null||r.max_price===undefined?' and up':' – '+shortTaka(r.max_price));
function renderRangeEditor(root,group,ranges){
 root.replaceChildren();if(!ranges.length){root.append(node('p','No price ranges yet. Add one above.','muted'));return}root.append(node('p','Your ranges · '+ranges.length,'info-caption'));
 const move=async(i,dir)=>{const ids=ranges.map(r=>r.id),j=i+dir;if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];try{await api('/groups/'+group.id+'/ranges/order',{ids});groupDetail=await api('/groups/'+group.id);renderGroupTools();void paintGroupRangeLabel()}catch(e){toast(e.message)}};
 ranges.forEach((r,i)=>{const row=node('div',undefined,'range-card'),copy=node('div',undefined,'range-card-copy');copy.append(node('strong',r.label),node('small',rangeText(r)));
  const tools=node('div',undefined,'range-card-tools');const up=button('↑',()=>void move(i,-1),'range-tool');up.disabled=i===0;up.setAttribute('aria-label','Move '+r.label+' up');const down=button('↓',()=>void move(i,1),'range-tool');down.disabled=i===ranges.length-1;down.setAttribute('aria-label','Move '+r.label+' down');
  const edit=button('✎',()=>fillRangeForm(r),'range-tool');edit.setAttribute('aria-label','Edit '+r.label);const del=button('🗑',async()=>{if(!confirm('Delete the range “'+r.label+'”?'))return;try{await api('/groups/'+group.id+'/ranges/'+r.id+'/delete',{});groupDetail=await api('/groups/'+group.id);renderGroupTools();void paintGroupRangeLabel();toast('Range deleted.')}catch(e){toast(e.message)}},'range-tool danger');del.setAttribute('aria-label','Delete '+r.label);
  tools.append(up,down,edit,del);row.append(copy,tools);root.append(row)});
}

// ---- ID posts inside a group: a compact card (no likes or comments). Swipe it right to reply in the chat ----
const groupPostsByCode=new Map();let replyToPost=null;
function renderGroupIdCard(p,root){
 groupPostsByCode.set(p.listing_code,p);const card=node('article',undefined,'gid-card'+(p.availability==='sold'?' sold':''));card.dataset.postId=p.id;
 const head=node('div',undefined,'gid-head'),who=node('div',undefined,'gid-who');who.append(node('strong',nicknameFor(p.user_id,p.name)),node('small',(p.listing_code||'ID')+' · '+ago(p.created_at)));head.append(avatar(p),who);
 const price=node('div',undefined,'gid-price');price.append(node('strong',shortTaka(p.price)),node('small',p.availability==='sold'?'SOLD':'BDT'));head.append(price);card.append(head);
 const media=(p.media||[]).filter(m=>m&&m.url);if(media.length){const strip=node('div',undefined,'gid-media'+(media.length===1?' single':''));media.slice(0,4).forEach((m,i)=>{const cell=button('',()=>openGallery(p,i),'gid-thumb');cell.setAttribute('aria-label','Open photo '+(i+1));if(m.type?.startsWith('video/')){cell.append(node('span','▶','gid-play'));const v=node('video');v.src=m.url+'#t=0.5';v.muted=true;v.preload='metadata';v.playsInline=true;cell.prepend(v)}else{const img=node('img');img.alt='';img.loading='lazy';setMediaImage(img,m.url);cell.append(img)}if(i===3&&media.length>4)cell.append(node('span','+'+(media.length-4),'gid-more'));strip.append(cell)});card.append(strip)}
 const details=node('p',p.details||p.title,'gid-details');card.append(details);
 const actions=node('div',undefined,'gid-actions');if(p.user_id!==me?.id)actions.append(button('💬 Message',()=>contactListing(p),'gid-btn primary'),button('🤝 Deal',()=>contactListing(p,true),'gid-btn'));actions.append(button('↩ Reply',()=>startPostReply(p),'gid-btn'),button('⋯',()=>void openListing(p.id).catch(e=>toast(e.message)),'gid-btn more'));card.append(actions);
 // swipe right to reply
 let sx=null,sy=null,dx=0;card.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;dx=0},{passive:true});
 card.addEventListener('touchmove',e=>{if(sx===null)return;const t=e.touches[0];dx=t.clientX-sx;if(Math.abs(t.clientY-sy)>Math.abs(dx)){sx=null;card.style.transform='';return}if(dx>0){card.style.transform='translateX('+Math.min(dx,90)+'px)';card.classList.toggle('reply-ready',dx>70)}},{passive:true});
 card.addEventListener('touchend',()=>{if(sx!==null&&dx>70)startPostReply(p);sx=null;card.style.transform='';card.classList.remove('reply-ready')},{passive:true});
 root.append(card);
}
function startPostReply(p){replyToPost=p;let bar=$('postReplyBar');if(!bar){bar=node('div',undefined,'post-reply-bar');bar.id='postReplyBar';$('chatForm').before(bar)}bar.replaceChildren();const copy=node('div',undefined,'post-reply-copy');copy.append(node('strong','↩ Replying to '+(p.listing_code||'ID')),node('small',(p.title||'')+' · '+shortTaka(p.price)));bar.append(copy,button('✕',()=>clearPostReply(),'post-reply-close'));bar.hidden=false;
 if(selectedGroupRange!=='chat'){selectedGroupRange='chat';$('groupTools').hidden=true;$('groupListings').hidden=true;renderGroupTools?.()}$('messageText').focus();navigator.vibrate?.(10)}
function clearPostReply(){replyToPost=null;$('postReplyBar')?.remove()}
{const base=api;api=async function(path,data,method){if(replyToPost&&data&&typeof data.text==='string'&&/^\/groups\/[^/]+\/messages$/.test(path)&&!data.text.startsWith('media:')){const p=replyToPost;data={...data,text:'↩ '+(p.listing_code||'ID')+' · '+String(p.title||'').slice(0,60)+' · '+shortTaka(p.price)+'\n'+data.text};clearPostReply()}return base(path,data,method)}}
{const base=openChat;openChat=async function(...a){clearPostReply();return base.apply(this,a)}}
// Replies show the quoted ID on top; tap it to open the ID.
function paintPostQuotes(){for(const b of document.querySelectorAll('#chatMessages .bubble[data-message-id]')){if(b.dataset.quoteDone)continue;b.dataset.quoteDone='1';const text=b._message?.text||'';if(!text.startsWith('↩ '))continue;const first=text.split('\n')[0],code=(first.match(/^↩ (ID No - \d+)/)||[])[1];
  const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(n.nodeValue.includes(first)){const quote=button(first.slice(2),()=>{const p=groupPostsByCode.get(code);if(p)void openListing(p.id).catch(e=>toast(e.message));else toast('Open ID ranges to see this ID.')},'post-quote');n.nodeValue=n.nodeValue.replace(first+'\n','').replace(first,'');n.parentElement.before(quote);break}}}}
{const base=paintMessageExtras;paintMessageExtras=function(){base();paintPostQuotes()}}

// 🔗 Link under the group name: every member sees the one fixed group link, with Copy and Share.
(()=>{const b=$('inviteGroup');b.innerHTML='<i data-icon="link"></i>Link';decorateInfoRows($('groupInfoHome'));
 b.onclick=async()=>{if(chat?.kind!=='group')return;try{const inv=await groupInviteLink(chat.id);const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const box=node('div',undefined,'delete-choice link-sheet');
  box.append(node('strong','🔗 Group link'));if(!inv.enabled){box.append(node('p','The group admin turned the invite link off.','hint'))}else{const url=node('div',inv.url,'link-sheet-url');box.append(url,node('p','Anyone with this link can open '+(groupDetail?.group?.name||'the group')+(inv.joinApproval?' and ask to join.':' and join.'),'hint'));
   box.append(button('⧉ Copy link',async()=>{try{await navigator.clipboard.writeText(inv.url);toast('Link copied.')}catch{toast(inv.url)}closeMessageSheet()},'btn'));if(navigator.share)box.append(button('↗ Share',()=>{closeMessageSheet();void navigator.share({title:groupDetail?.group?.name,url:inv.url}).catch(()=>{})},'btn secondary'))}
  box.append(button('Close',closeMessageSheet,'btn ghost'));overlay.append(box);document.body.append(overlay)}catch(e){toast(e.message)}}})();

// ---- Chat bubbles: photo beside every message from others (name and blue tick on the first one), like Messenger ----
function paintBubbleAvatars(){for(const b of document.querySelectorAll('#chatMessages>.bubble[data-message-id]:not(.mine)')){if(b.querySelector(':scope>.bubble-avatar'))continue;const m=b._message;if(!m)continue;const a=avatar({id:m.user_id,name:m.name,picture:m.picture,role:m.role,verified:m.verified});a.classList.add('bubble-avatar');a.setAttribute('aria-hidden','true');b.prepend(a)}}
{const base=paintMessageExtras;paintMessageExtras=function(){base();paintBubbleAvatars()}}

// ---- Chat list: hold a chat (or right-click) for a menu like Messenger instead of ⋮ ----
const pinnedChats=()=>{try{return JSON.parse(localStorage.getItem('wm_pinned_chats')||'[]')}catch{return []}};
function setPinnedChats(list){try{localStorage.setItem('wm_pinned_chats',JSON.stringify(list.slice(0,10)))}catch{}}
function orderPinnedChats(){const list=$('chatList');if(!list)return;const pins=pinnedChats();for(const it of list.querySelectorAll(':scope>.chat-list-item')){const key=it.querySelector('.chat-row')?.dataset.chatKey;it.classList.toggle('pinned-chat',!!key&&pins.includes(key))}
 const items=[...list.querySelectorAll(':scope>.chat-list-item.pinned-chat')].sort((a,b)=>pins.indexOf(a.querySelector('.chat-row').dataset.chatKey)-pins.indexOf(b.querySelector('.chat-row').dataset.chatKey));let anchor=list.querySelector(':scope>.chat-list-item');for(const it of items){if(it!==anchor)list.insertBefore(it,anchor);else anchor=it.nextElementSibling;anchor=it.nextElementSibling}}
new MutationObserver(rafBatch(()=>{if(!orderPinnedChats.busy){orderPinnedChats.busy=true;try{orderPinnedChats()}finally{setTimeout(()=>{orderPinnedChats.busy=false},0)}}})).observe(document.body,{childList:true,subtree:true});
const SHEET_ICONS={users:INFO_ICONS.users,pin:'<path d="M9 3.5h6l-1 5 3.5 3.5v1.5h-11V12L10 8.5Z"/><path d="M12 13.5V21"/>',archive:INFO_ICONS.archive,mute:INFO_ICONS.bellOff,bell:INFO_ICONS.bell,leave:INFO_ICONS.leave,trash:INFO_ICONS.trash,block:INFO_ICONS.block,user:INFO_ICONS.user,open:'<path d="M4 6h16v10H8l-4 4Z"/>'};
function openChatRowSheet(item){
 closeMessageSheet();const row=item.querySelector('.chat-row'),key=row?.dataset.chatKey||'',[kind,id]=[key.split(':')[0],key.slice(key.indexOf(':')+1)],name=row?.querySelector('.inbox-person-name strong')?.textContent||'Chat',menuButtons=[...item.querySelectorAll('details.social-menu button')];if(!kind||kind==='deal')return;navigator.vibrate?.(12);
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const sheet=node('div',undefined,'chat-sheet');sheet.append(node('span',undefined,'chat-sheet-grip'));const head=node('div',undefined,'chat-sheet-head');head.append(row.querySelector('.avatar').cloneNode(true),node('strong',name));sheet.append(head);
 const add=(icon,label,fn,danger=false)=>{const b=button('',()=>{closeMessageSheet();void fn()},'chat-sheet-row'+(danger?' danger':''));b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+SHEET_ICONS[icon]+'</svg><span></span>';b.querySelector('span').textContent=label;sheet.append(b)};
 const pins=pinnedChats(),pinned=pins.includes(key);add('pin',pinned?'Unpin':'Pin',()=>{setPinnedChats(pinned?pins.filter(k=>k!==key):[key,...pins]);orderPinnedChats();toast(pinned?'Chat unpinned.':'📌 Chat pinned to the top.')});
 const arch=menuButtons.find(b=>/archive/i.test(b.textContent));if(arch)add('archive',arch.textContent.trim().replace(/ chat$/i,''),()=>arch.click());
 if(kind==='private'){add('users','Create group chat with '+name.split(' ')[0],()=>openCreateGroupChat({kind,id,name,avatar:row.querySelector('.avatar')}))}
 const muted=!!row.querySelector('.chat-muted-icon:not([hidden])');add(muted?'bell':'mute',muted?'Unmute':'Mute',()=>conversationAction({kind,id,name},muted?'unmute':'mute'));
 if(kind==='group'){const g=(typeof groups!=='undefined'?groups:[]).find(x=>x.id===id);if(g)add('leave','Leave group',()=>void leaveGroupFlow(g),true)}
 const block=menuButtons.find(b=>/block/i.test(b.textContent));if(block)add('block',block.textContent.trim(),()=>block.click(),true);
 const del=menuButtons.find(b=>/delete/i.test(b.textContent));if(del)add('trash','Delete',()=>del.click(),true);
 overlay.append(sheet);document.body.append(overlay);
}
(()=>{const list=$('chatList');if(!list)return;let timer=null,start=null,fired=false;const cancel=()=>{clearTimeout(timer);timer=null;start=null};
 list.addEventListener('pointerdown',e=>{const it=e.target.closest('.chat-list-item');if(!it||e.button>0||e.target.closest('details'))return;fired=false;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;fired=true;openChatRowSheet(it)},480)});
 list.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)cancel()});for(const t of ['pointerup','pointercancel','pointerleave'])list.addEventListener(t,cancel);
 list.addEventListener('click',e=>{if(fired){e.preventDefault();e.stopPropagation();fired=false}},true);
 list.addEventListener('contextmenu',e=>{const it=e.target.closest('.chat-list-item');if(!it)return;e.preventDefault();cancel();openChatRowSheet(it)})})();

// ---- Post photos: dots under the album that follow the photo counter ----
function paintAlbumDots(root=document){for(const album of root.querySelectorAll('.listing-album')){const counter=album.querySelector('.album-counter');if(!counter)continue;const m=(counter.textContent||'').match(/(\d+)\s*\/\s*(\d+)/);if(!m)continue;const [cur,total]=[Number(m[1]),Number(m[2])];if(total<2)continue;let dots=album.querySelector(':scope>.album-dots');if(!dots){dots=node('div',undefined,'album-dots');dots.setAttribute('aria-hidden','true');album.querySelector('.album-stage').after(dots)}
 const n=Math.min(total,8);if(dots.children.length!==n){dots.replaceChildren(...Array.from({length:n},()=>document.createElement('span')))}const on=total<=8?cur-1:Math.round((cur-1)/(total-1)*(n-1));[...dots.children].forEach((d,i)=>d.classList.toggle('on',i===on))}}
new MutationObserver(rafBatch(recs=>{for(const r of recs){const a=r.target.closest?.('.listing-album')||r.target.parentElement?.closest?.('.listing-album');if(a){paintAlbumDots(a.parentElement||document);return}}if(recs.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.listing-album')||n.querySelector?.('.listing-album')))))paintAlbumDots()})).observe(document.body,{childList:true,subtree:true,characterData:true});

// ---- Navigation icons: outline when idle, filled when open, your photo for Profile ----
const NAV_ICONS={
 home:['<path d="M3.5 10.2 12 3.5l8.5 6.7V20a1 1 0 0 1-1 1h-5v-6.5h-5V21h-5a1 1 0 0 1-1-1Z"/>','<path d="M11.4 3a1 1 0 0 1 1.2 0l8.5 6.7c.24.19.4.48.4.8V20a1.5 1.5 0 0 1-1.5 1.5h-4.8v-6.8H9.3v6.8H4.5A1.5 1.5 0 0 1 3 20v-9.5c0-.32.15-.61.4-.8Z" class="fill"/>'],
 friends:['<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.6-3.7 3.1-5.6 6.2-5.6s5.6 1.9 6.2 5.6"/><path d="M16 4.9a3.1 3.1 0 0 1 0 6.1M17.6 14.6c2 .5 3.3 2.2 3.7 5.4"/>','<circle cx="9" cy="8" r="3.6" class="fill"/><path d="M2.5 20.5c.5-4 3.2-6.2 6.5-6.2s6 2.2 6.5 6.2Z" class="fill"/><path d="M16 4.9a3.1 3.1 0 0 1 0 6.1M17.6 14.6c2 .5 3.3 2.2 3.7 5.4"/>'],
 messages:['<path d="M12 3.2c5 0 8.8 3.6 8.8 8.2s-3.8 8.2-8.8 8.2c-1 0-2-.15-2.9-.43L4.6 20.8l1.2-3.9A7.9 7.9 0 0 1 3.2 11.4C3.2 6.8 7 3.2 12 3.2Z"/><path d="m7.5 13.2 3-3.2 2.4 2 3.6-3.4"/>','<path d="M12 3c5.1 0 9 3.7 9 8.4s-3.9 8.4-9 8.4c-1 0-2-.15-3-.45L4.3 21.2l1.3-4.2A8 8 0 0 1 3 11.4C3 6.7 6.9 3 12 3Z" class="fill"/><path d="m7.5 13.2 3-3.2 2.4 2 3.6-3.4" class="cut"/>'],
 profile:['<circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5c.7-4.2 3.6-6.4 7.5-6.4s6.8 2.2 7.5 6.4"/>','<circle cx="12" cy="8.2" r="4.2" class="fill"/><path d="M4.2 20.8c.7-4.5 3.7-6.9 7.8-6.9s7.1 2.4 7.8 6.9Z" class="fill"/>']};
function upgradeNavIcons(){for(const nav of [$('mobileNav'),$('desktopNav')]){if(!nav)continue;for(const b of nav.querySelectorAll('button[data-tab]')){const tab=b.dataset.tab,icons=NAV_ICONS[tab],holder=b.querySelector(':scope>span');if(!holder)continue;
  if(tab==='profile'&&me?.picture&&!/default-avatar/.test(me.picture)){if(holder.dataset.photo!==me.picture){holder.dataset.photo=me.picture;holder.querySelectorAll(':scope>.nav-ico').forEach(x=>x.remove());const old=holder.querySelector(':scope>.nav-photo')||holder.querySelector(':scope>svg');holder.dataset.upgraded='1';const img=node('img',undefined,'nav-photo');img.src=me.picture;img.alt='';img.loading='lazy';if(old)old.replaceWith(img);else holder.prepend(img)}continue}
  if(!icons||holder.dataset.upgraded==='1')continue;const svg=holder.querySelector('svg');if(!svg)continue;holder.dataset.upgraded='1';const wrap=document.createElement('i');wrap.className='nav-ico';wrap.innerHTML='<svg viewBox="0 0 24 24" class="ni-line" aria-hidden="true">'+icons[0]+'</svg><svg viewBox="0 0 24 24" class="ni-fill" aria-hidden="true">'+icons[1]+'</svg>';svg.replaceWith(wrap)}}}
new MutationObserver(rafBatch(()=>upgradeNavIcons())).observe(document.body,{childList:true,subtree:true});upgradeNavIcons();
document.addEventListener('click',e=>{const b=e.target.closest?.('#mobileNav button[data-tab]');if(!b)return;b.classList.remove('nav-pop');void b.offsetWidth;b.classList.add('nav-pop')});


// ---- Create a group chat with someone, add more people, name and photo ----
async function groupCandidates(){const [f,t]=await Promise.all([api('/friends').catch(()=>({friends:[]})),api('/threads?section=chats').catch(()=>({threads:[]}))]);const map=new Map();
 for(const p of f.friends||[])map.set(p.id,{id:p.id,name:p.name,picture:p.picture,verified:p.verified});
 for(const th of t.threads||[]){if(th.is_deal||th.status!=='accepted')continue;const out=th.buyer_id===me.id,id=out?th.seller_id:th.buyer_id;if(!map.has(id))map.set(id,{id,name:out?th.seller_name:th.buyer_name,picture:out?th.seller_picture:th.buyer_picture})}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name))}
async function openCreateGroupChat(seed){
 let people=[];try{people=await groupCandidates()}catch(e){return toast(e.message)}let threadPeer=null;if(seed?.kind==='private'){try{const d=await api('/threads/'+seed.id+'/messages');threadPeer=d.peer?.id||null}catch{}}
 const picked=new Set(threadPeer?[threadPeer]:[]);
 const page=node('div',undefined,'create-group-page');page.id='createGroupPage';page.setAttribute('role','dialog');page.setAttribute('aria-label','New group');
 const head=node('div',undefined,'cg-head');head.append(button('✕',()=>page.remove(),'cg-close'),node('strong','New group'));const create=button('Create',()=>void submit(),'cg-create');head.append(create);
 const photo=node('label',undefined,'cg-photo');const img=node('div',undefined,'cg-photo-preview');img.textContent='📷';const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;file.onchange=()=>{const f=file.files[0];if(f){img.textContent='';img.style.backgroundImage='url("'+URL.createObjectURL(f)+'")'}};photo.append(img,file,node('small','Group photo'));
 const name=node('input',undefined,'input cg-name');name.maxLength=80;name.placeholder='Group name';name.value=seed?.name?(seed.name.split(' ')[0]+', '+(me.name||'').split(' ')[0]):'';
 const chips=node('div',undefined,'cg-chips');const search=node('input',undefined,'input cg-search');search.type='search';search.placeholder='🔍 Search friends and chats';const list=node('div',undefined,'cg-list');
 const paint=()=>{chips.replaceChildren();for(const id of picked){const p=people.find(x=>x.id===id);if(!p)continue;const c=button('',()=>{picked.delete(id);paint()},'cg-chip');c.append(avatar(p),node('span',p.name.split(' ')[0]),node('b','✕'));chips.append(c)}
  const q=search.value.trim().toLowerCase();list.replaceChildren(node('p','+ Add members','info-caption'));for(const p of people.filter(x=>!q||x.name.toLowerCase().includes(q))){const row=button('',()=>{picked.has(p.id)?picked.delete(p.id):picked.add(p.id);paint()},'cg-row'+(picked.has(p.id)?' on':''));row.append(avatar(p),node('span',p.name),node('i',picked.has(p.id)?'✓':'','cg-check'));list.append(row)}if(!people.length)list.append(node('p','Add friends or start chats first, then make a group with them.','hint'));create.disabled=!picked.size};
 search.oninput=paint;page.append(head,photo,name,chips,search,list);document.body.append(page);paint();name.focus();
 async function submit(){if(!picked.size)return toast('Choose at least one person.');const groupName=name.value.trim()||'New group';create.disabled=true;create.textContent='…';
  try{let logoId;const f=file.files[0];if(f){const r=await fetch('/api/upload',{method:'POST',credentials:'same-origin',headers:{'content-type':f.type,'x-upload-purpose':'profile'},body:f}),d=await r.json();if(!r.ok)throw Error(d.error||'Upload failed');logoId=d.id}
   const g=await api('/groups',{name:groupName,...(logoId?{logoId}:{})});const r=await api('/groups/'+g.id+'/add-members',{userIds:[...picked]});page.remove();toast('👥 Group created'+(r.added?.length?' with '+r.added.length+' '+(r.added.length===1?'person':'people'):'')+'.');navigate('messages');await loadMessages();await openChat('group',g.id)
  }catch(e){toast(e.message);create.disabled=false;create.textContent='Create'}}
}

// Leave group. The creator first picks one of the group admins to take over the group.
async function leaveGroupFlow(item){
 const g=groupDetail?.group?.id===item.id?groupDetail.group:item,creator=g.owner_id===me.id;
 const done=async newOwnerId=>{await api('/groups/'+item.id+'/leave',newOwnerId?{newOwnerId}:{});toast('You left the group.');closeConversation();navigate('messages');await loadMessages()};
 if(!creator){if(!confirm('Leave this group? Your messages here will be cleared and you will not get new messages from this group.'))return;try{await done()}catch(e){toast(e.message)}return}
 let members=[];try{members=(await api('/groups/'+item.id+'/members')).members||[]}catch(e){return toast(e.message)}
 const admins=members.filter(m=>m.is_admin&&m.id!==me.id);
 if(!admins.length)return toast('You made this group. Make another member admin first (Members → Make admin), then leave and hand the group to them.');
 const overlay=node('div',undefined,'message-sheet');overlay.id='messageSheet';overlay.onclick=e=>{if(e.target===overlay)closeMessageSheet()};const box=node('div',undefined,'delete-choice');
 box.append(node('strong','Who will own the group?'),node('p','You made this group. Choose an admin to take over, then you leave.','hint'));
 for(const m of admins){const b=button('',async()=>{if(!confirm(m.name+' will own the group and you will leave. Continue?'))return;closeMessageSheet();try{await done(m.id)}catch(e){toast(e.message)}},'member-row');const who=node('span',undefined,'member-row-text');who.append(node('strong',m.name),node('small','Admin'));b.append(avatar(m),who);box.append(b)}
 box.append(button('Cancel',closeMessageSheet,'btn ghost'));overlay.append(box);document.body.append(overlay);
}
