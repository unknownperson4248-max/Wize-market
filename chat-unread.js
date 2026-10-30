// Source-message counts and read cursors persist in D1. No notification tray or sound.
let unreadUser=null,unreadEpoch=0,unreadBusy=false,unreadAgain=false;
let chatUnreadCounts=new Map();
const chatReadMarks=new Map(),chatReadPending=new Map();
const unreadKey=(kind,id)=>kind+':'+id;
function unreadFor(kind,id){return chatUnreadCounts.get(unreadKey(kind,id))||{unread:0,muted:false,request:false}}
function paintChatUnread(){
 let total=0,requests=0,activeRequests=0;
 for(const item of chatUnreadCounts.values()){if(!item.muted)total+=item.unread;if(item.request){requests+=item.unread;if(!item.muted)activeRequests+=item.unread}}
 for(const nav of document.querySelectorAll('[data-tab="messages"]')){
  let badge=nav.querySelector('.nav-unread');if(!badge){badge=node('span',undefined,'nav-unread');badge.setAttribute('aria-hidden','true');nav.firstElementChild.append(badge)}
  badge.hidden=!total;badge.textContent=total>99?'99+':String(total);nav.classList.toggle('has-unread',total>0);nav.setAttribute('aria-label',total?'Messages, '+total+' unread messages':'Messages');
 }
 for(const wrap of document.querySelectorAll('.chat-list-item[data-chat-kind]')){
  const item=unreadFor(wrap.dataset.chatKind,wrap.dataset.chatId),badge=wrap.querySelector('.chat-unread'),muted=wrap.querySelector('.chat-muted-icon');
  wrap.classList.toggle('has-unread',item.unread>0);wrap.classList.toggle('muted-chat',!!item.muted);
  if(badge){badge.hidden=!item.unread;badge.textContent=item.unread>99?'99+':String(item.unread);badge.setAttribute('aria-label',item.unread+' unread messages'+(item.muted?', muted':''))}
  if(muted)muted.hidden=!item.muted;
 }
 $('requestCount').hidden=!requests;$('requestCount').textContent=requests>99?'99+':String(requests);$('requestCount').classList.toggle('muted-count',!activeRequests);
}
function syncUnreadSession(){
 const id=me?.id||null;if(unreadUser!==id){unreadUser=id;unreadEpoch++;chatUnreadCounts.clear();chatReadMarks.clear();chatReadPending.clear();paintChatUnread()}
 if(id)void refreshChatUnread().catch(()=>{});
}
async function refreshChatUnread(){
 if(!me||document.hidden)return;if(unreadBusy)return
 const userId=me.id,epoch=unreadEpoch;unreadBusy=true;
 try{const data=await api('/chat-unread');if(me?.id!==userId||unreadEpoch!==epoch){unreadAgain=true;return}chatUnreadCounts=new Map(data.chats.map(item=>[unreadKey(item.kind,item.id),item]));paintChatUnread()}
 finally{unreadBusy=false;if(unreadAgain){unreadAgain=false;void refreshChatUnread().catch(()=>{})}}
}
async function readChatThrough(kind,id,messageId){
 if(!me||document.hidden||!['private','group'].includes(kind)||!messageId)return;
 const userId=me.id,key=unreadKey(kind,id);if(Math.max(chatReadMarks.get(key)||0,chatReadPending.get(key)||0)>=messageId)return;
 chatReadPending.set(key,messageId);
 try{await api('/chats/read',{kind,id,messageId});if(me?.id!==userId)return;chatReadMarks.set(key,Math.max(messageId,chatReadMarks.get(key)||0));unreadEpoch++;chatUnreadCounts.delete(key);paintChatUnread();await refreshChatUnread()}
 catch{/* A failed read is retried with the next visible conversation poll. */}
 finally{if(me?.id===userId&&chatReadPending.get(key)===messageId)chatReadPending.delete(key)}
}
setInterval(()=>{if(me&&!document.hidden)void refreshChatUnread().catch(()=>{})},4000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&me){void refreshChatUnread().catch(()=>{});if(chat)void refreshChat().catch(()=>{})}});
window.addEventListener('focus',()=>{if(me)void refreshChatUnread().catch(()=>{})});
syncUnreadSession();
