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
 await api('/chats/action',{kind:item.kind,id:item.id,action});
 if((['delete','archive'].includes(action)||action==='block'&&item.kind==='group')&&chat?.id===item.id)closeConversation();
 delete $('chatList').dataset.signature;await loadMessages();toast({archive:'Chat archived.',unarchive:'Chat moved to All chat.',delete:'Chat deleted from your inbox.',block:'Blocked.',unblock:'Unblocked.',mute:'Chat muted.',unmute:'Chat unmuted.'}[action]);
 if(chat)await refreshChat();
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
 const hero=node('div',undefined,'peer-info-hero');hero.append(avatar(peer));const name=node('div',undefined,'peer-info-name');name.append(node('h2',peer.name));if(peer.verified)name.append(verifiedMark(peer.role));hero.append(name);if(peer.username)hero.append(node('p','@'+peer.username,'muted'));root.append(hero);
 const shortcuts=node('div',undefined,'peer-info-shortcuts');shortcuts.append(socialAction('Profile','users',()=>showProfile(peer.id)),socialAction('Search','search',()=>{peerInfoView='search';renderPeerInfo();root.querySelector('input').focus()}));root.append(shortcuts);
 root.append(node('p','Chat info','info-caption'),button('View media & files',()=>{peerInfoView='media';renderPeerInfo()},'info-row'));
 root.append(node('p','Actions','info-caption'));
 for(const [label,action]of [[thread.preferences?.muted?'Unmute messages':'Mute messages',thread.preferences?.muted?'unmute':'mute'],[thread.preferences?.archived?'Unarchive chat':'Archive chat',thread.preferences?.archived?'unarchive':'archive'],['Delete chat','delete'],[thread.blocked_by_me?'Unblock member':'Block member',thread.blocked_by_me?'unblock':'block']])root.append(button(label,()=>conversationAction(currentPrivateItem(),action),'info-row'));
 root.append(node('p','Blocking private contact does not close or hide existing secure deals.','hint'));
}
function renderGroupConversationActions(group){const root=$('groupConversationActions');if(!root)return;root.replaceChildren();const data=groups.find(g=>g.id===group.id)||group,item={kind:'group',id:group.id,name:group.name,admin:group.owner_id===me.id,archived:!!data.chat_archived};root.append(node('p','Actions','info-caption'));for(const [label,action]of [[item.archived?'Unarchive group chat':'Archive group chat',item.archived?'unarchive':'archive'],['Delete group chat','delete'],...(!item.admin?[['Block group','block']]:[])])root.append(button(label,()=>conversationAction(item,action),'info-row'))}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('peerInfoPanel').hidden)closePeerInfo()});

let activeMemberAction=null,memberActionTrigger=null;
function renderMessageAuthor(message,kind){
 const person={id:message.user_id,name:message.name,picture:message.picture,verified:message.verified},interactive=kind==='group'&&message.user_id!==me.id;
 const author=node(interactive?'button':'div',undefined,'message-author'+(interactive?' group-member-trigger':''));if(interactive){author.type='button';author.setAttribute('aria-label','Member options for '+message.name);author.onclick=()=>openMemberActions(person,author)}
 author.append(avatar(person),node('strong',message.name));if(message.verified)author.append(verifiedMark('member'));return author;
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
