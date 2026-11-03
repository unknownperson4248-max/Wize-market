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
const INFO_ICONS={users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14c2.4.2 4 1.8 4.5 4.5"/>',userPlus:'<circle cx="10" cy="8" r="3.4"/><path d="M3.5 19.5c.6-3.5 3.2-5.3 6.5-5.3s5.9 1.8 6.5 5.3M19 8v6M16 11h6"/>',search:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',bellOff:'<path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H6.5M10 21h4M3 3l18 18"/>',bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15ZM10 21h4"/>',edit:'<path d="m4 20 1-4L16 5l3 3L8 19ZM14 7l3 3"/>',image:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>',tag:'<path d="M3.5 12.5V4.5h8l9 9-8 8Z"/><circle cx="8" cy="9" r="1.5"/>',shield:'<path d="M12 3 5 6v5.5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',archive:'<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V19h14V8.5M10 12.5h4"/>',trash:'<path d="M4.5 6.5h15M9 6.5V4h6v2.5M6.5 6.5 7.5 20h9l1-13.5M10 10.5v6M14 10.5v6"/>',block:'<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/>',leave:'<path d="M14 4H6v16h8M10 12h10M17 8.5 20.5 12 17 15.5"/>',user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.4-6 7-6s6.3 2.2 7 6"/>'};
const infoIcon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(INFO_ICONS[name]||INFO_ICONS.users)+'</svg>';
function decorateInfoRows(root){
 for(const i of root.querySelectorAll('i[data-icon]'))if(!i.firstChild)i.innerHTML=infoIcon(i.dataset.icon);
 for(const row of root.querySelectorAll('.info-row')){if(row.querySelector('i[data-icon]'))continue;const text=row.textContent.trim(),clean=text.replace(/^[^\p{L}\p{N}]+/u,'').trim();
  const icon=/leave/i.test(clean)?'leave':/delete/i.test(clean)?'trash':/block/i.test(clean)?'block':/archive/i.test(clean)?'archive':/media/i.test(clean)?'image':/mute/i.test(clean)?'bell':/member/i.test(clean)?'users':'user';
  if(clean!==text&&row.childNodes.length===1)row.textContent=clean;const i=document.createElement('i');i.dataset.icon=icon;i.innerHTML=infoIcon(icon);row.prepend(i)}
}
decorateInfoRows($('groupInfoHome'));
$('editGroupShortcut').onclick=()=>$('editGroupButton').click();

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
 const admin=!!g.canManage;$('groupRequestsButton').hidden=!admin;$('groupApprovalRow').hidden=!admin;$('groupAdminTools').hidden=!admin;$('editGroupShortcut').hidden=!admin;decorateInfoRows($('groupInfoHome'));if(!admin)return;
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
