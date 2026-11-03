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
  g.joinApproval?'Ask to join':'Join group',async()=>{const r=await api('/groups/'+encodeURIComponent(g.id)+'/join',{});if(r.pending){toast('✅ Request sent. The group admin will check it.');return}navigate('messages');await loadMessages();await openChat('group',g.id);toast('You joined '+g.name+'.')});
}
function paintGroupAdminRows(g){
 const admin=!!g.canManage;$('groupRequestsButton').hidden=!admin;$('groupApprovalRow').hidden=!admin;$('groupAdminTools').hidden=!admin;$('groupCustomize').hidden=!admin;decorateInfoRows($('groupInfoHome'));if(!admin)return;
 $('groupApprovalToggle').checked=!!g.joinApproval;const n=Number(g.requests||0);$('groupRequestsCount').textContent=String(n);$('groupRequestsCount').hidden=!n;
}
async function openGroupRequests(){
 if(chat?.kind!=='group')return;showGroupInfoView('requests');const root=$('groupRequestList');root.replaceChildren(node('p','Loading…','muted'));
 try{const {requests}=await api('/groups/'+chat.id+'/requests');root.replaceChildren();if(!requests.length){root.append(node('p','No one is waiting to join.','muted'));return}
  for(const r of requests){const row=node('div',undefined,'person group-request-row'),who=node('div',undefined,'group-request-who');who.append(node('span',r.name),node('small',new Date(r.created_at).toLocaleString()));const actions=node('div',undefined,'group-request-actions');
   const answer=async approve=>{for(const b of actions.querySelectorAll('button'))b.disabled=true;try{await api('/groups/'+chat.id+'/requests/'+encodeURIComponent(r.id),{approve});row.remove();toast(approve?r.name+' joined the group.':'Request declined.');if(groupDetail?.group){groupDetail.group.requests=Math.max(0,(groupDetail.group.requests||1)-1);paintGroupAdminRows(groupDetail.group)}if(!root.children.length)root.append(node('p','No one is waiting to join.','muted'))}catch(e){toast(e.message);for(const b of actions.querySelectorAll('button'))b.disabled=false}};
   actions.append(button('Approve',()=>void answer(true),'btn'),button('Decline',()=>void answer(false),'btn secondary'));row.append(avatar(r),who,actions);root.append(row)}
 }catch(e){root.replaceChildren(node('p',e.message,'muted'))}
}
$('groupRequestsButton').onclick=()=>void openGroupRequests();
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
 let quick=$('chatQuickEmoji');if(!quick){quick=button('',()=>sendQuickEmoji(),'composer-icon chat-quick-emoji');quick.id='chatQuickEmoji';quick.type='button';$('chatSendButton').after(quick)}
 const emoji=t?.emoji||'👍';quick.textContent=emoji;quick.setAttribute('aria-label','Send '+emoji);quick.hidden=!chatExtras.key;
 if(chat?.kind==='private'&&privatePeer){const nick=nicknameFor(privatePeer.id,'');if(nick)$('chatTitle').textContent=nick}
}
function sendQuickEmoji(){const input=$('messageText');if(!input||!chat)return;const t=chatExtras.theme;input.value=(t?.emoji||'👍');$('chatForm').requestSubmit()}
// Names in the chat use the nickname when one is set.
{const base=renderMessageAuthor;renderMessageAuthor=function(message,kind){const nick=nicknameFor(message.user_id,'');return base(nick?{...message,name:nick}:message,kind)}}
{const base=openChat;openChat=async function(...args){const r=await base.apply(this,args);void loadChatExtras();return r}}
function chatPinOption(c,m){if(!['private','group'].includes(c.kind)||m.deleted_at||!chatExtras.can?.pin||chatExtras.key!==extrasKey(c))return null;const pinned=chatExtras.pins.some(p=>p.id===m.id);
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
 if(can)root.append(button('Save',async()=>{try{await api('/chat-extras/'+extrasKey(chat)+'/theme',pick);await loadChatExtras();toast('Chat updated.')}catch(e){toast(e.message)}},'btn chat-customize-save'));
}
async function renderPinsView(root){
 root.replaceChildren(node('p','Loading…','muted'));await loadChatExtras();root.replaceChildren();
 if(!chatExtras.pins.length){root.append(node('p',chatExtras.can.pin?'No pinned messages. Tap ⋮ on a message and choose Pin message.':'No pinned messages yet.','muted'));return}
 for(const p of chatExtras.pins){const row=node('div',undefined,'pinned-message'),head=node('div',undefined,'pinned-head');head.append(node('strong',nicknameFor(p.user_id,p.name||'Member')),node('small',new Date(p.created_at).toLocaleString()));const text=String(p.text||'').startsWith('media:')?(typeof inboxPreview==='function'?inboxPreview(p.text):'Photo or file'):p.text;row.append(head,node('p',text));
  if(chatExtras.can.pin)row.append(button('Unpin',async()=>{try{await api('/chat-extras/'+extrasKey(chat)+'/pin',{messageId:p.id,pinned:false});await renderPinsView(root)}catch(e){toast(e.message)}},'btn secondary pinned-unpin'));root.append(row)}
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
