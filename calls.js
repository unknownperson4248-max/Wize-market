// Chat reports (⋮ → Report message) and voice / video calls in personal chats.

// ---- Call notes in the chat ("📞 Voice call · 3:05", "Missed video call") ----
function isCallNote(text){return /^call:(audio|video):(\d{1,5}|missed|declined|failed)$/.test(String(text||''))}
function formatCallTime(seconds){const s=Math.max(0,Math.round(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');return h?h+':'+String(m).padStart(2,'0')+':'+r:m+':'+r}
function callNoteText(video,value){const kind=video?'video call':'voice call',icon=video?'🎥 ':'📞 ';if(/^\d+$/.test(value))return icon+(video?'Video call':'Voice call')+' · '+formatCallTime(Number(value));if(value==='missed')return icon+'Missed '+kind;if(value==='declined')return icon+(video?'Video call':'Voice call')+' declined';return icon+'Call failed'}

// ---- Report a chat message (abusive words, scam, spam) ----
function openMessageReport(c,m){
 if(!requireLogin())return;let reason='abuse';
 openStepDialog('🚩 Report message',body=>{
  const preview=node('div',undefined,'report-message-preview');preview.append(node('strong',m.name||'Member'),node('p',String(m.text||'').startsWith('media:')?inboxPreview(m.text):m.text));body.append(node('p','The Owner will see this message and decide. The member is not told who reported.','hint'),preview);
  const options=node('div',undefined,'report-reasons');options.setAttribute('role','radiogroup');options.setAttribute('aria-label','Reason');
  for(const [value,label] of [['abuse','🤬 Abusive words / gali'],['scam','⚠️ Scam or fraud'],['spam','📢 Spam'],['other','❓ Other']]){const l=node('label',undefined,'report-reason'),input=node('input');input.type='radio';input.name='message-report-reason';input.value=value;input.checked=value===reason;input.onchange=()=>{reason=value};l.append(input,node('span',label));options.append(l)}
  body.append(options);const details=node('textarea',undefined,'input');details.maxLength=500;details.rows=3;details.placeholder='More details (optional)';field(body,'Details',details);
 },'Send report',async body=>{
  const details=body.querySelector('textarea').value.trim(),result=await api('/message-reports',{kind:c.kind,chatId:c.id,messageId:m.id,reason,details});
  toast(result.already?'You already reported this message.':'🚩 Reported. The Owner will check it.');
 });
}

// ---- Voice and video calls (WebRTC). The offer and the answer go through the server; then the phones talk to each other. ----
const CALL_SVG={
 phone:'<path d="M5 4h3.5l2 4.6-2.3 1.5a11 11 0 0 0 5.7 5.7l1.5-2.3 4.6 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
 video:'<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5Z"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
 micOff:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3 3l18 18"/>',
 camOff:'<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5ZM2 2l20 20"/>',
 flip:'<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><path d="M9.3 13a2.7 2.7 0 0 0 5 1.4M14.7 12a2.7 2.7 0 0 0-5-1.4"/>',
 hangup:'<path transform="rotate(135 12 12)" d="M5 4h3.5l2 4.6-2.3 1.5a11 11 0 0 0 5.7 5.7l1.5-2.3 4.6 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'
};
const callSvg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+CALL_SVG[name]+'</svg>';
let callState=null,incomingCall=null,toneCtx=null,toneTimer=null;
function callUi(){
 if($('callScreen'))return;
 const screen=node('div',undefined,'call-screen');screen.id='callScreen';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','Call');
 screen.innerHTML='<video id="callRemoteVideo" class="call-remote-video" autoplay playsinline></video><audio id="callRemoteAudio" autoplay></audio><div class="call-info"><div id="callAvatar" class="call-avatar"></div><h2 id="callName"></h2><div id="callBadge" class="call-badge"></div><p id="callStatus" class="call-status"></p><p id="callTimer" class="call-timer" hidden>0:00</p></div><video id="callLocalVideo" class="call-local-video" autoplay playsinline muted></video><div class="call-controls"><button type="button" id="callMute" class="call-btn" aria-label="Mute microphone" aria-pressed="false">'+callSvg('mic')+'<span>Mute</span></button><button type="button" id="callCamera" class="call-btn" aria-label="Turn camera off" aria-pressed="false">'+callSvg('video')+'<span>Camera</span></button><button type="button" id="callFlip" class="call-btn" aria-label="Switch camera">'+callSvg('flip')+'<span>Flip</span></button><button type="button" id="callHangup" class="call-btn hangup" aria-label="End call">'+callSvg('hangup')+'<span>End</span></button></div>';
 const ring=node('div',undefined,'incoming-call');ring.id='incomingCall';ring.hidden=true;ring.setAttribute('role','alertdialog');ring.setAttribute('aria-label','Incoming call');
 ring.innerHTML='<div class="incoming-card"><div id="incomingAvatar" class="call-avatar"></div><strong id="incomingName"></strong><div id="incomingBadge" class="call-badge"></div><p id="incomingKind" class="call-status"></p><div class="incoming-actions"><button type="button" id="declineCall" class="call-round decline" aria-label="Decline">'+callSvg('hangup')+'</button><button type="button" id="acceptCall" class="call-round accept" aria-label="Accept">'+callSvg('phone')+'</button></div><div class="incoming-labels"><span>Decline</span><span>Accept</span></div></div>';
 document.body.append(screen,ring);
 $('callHangup').onclick=()=>void endCall('hangup');$('acceptCall').onclick=()=>void acceptCall();$('declineCall').onclick=()=>void declineCall();
 $('callMute').onclick=()=>{const s=callState;if(!s?.local)return;const off=!s.muted;s.muted=off;for(const t of s.local.getAudioTracks())t.enabled=!off;$('callMute').setAttribute('aria-pressed',String(off));$('callMute').innerHTML=callSvg(off?'micOff':'mic')+'<span>'+(off?'Unmute':'Mute')+'</span>'};
 $('callCamera').onclick=()=>{const s=callState;if(!s?.local)return;const off=!s.cameraOff;s.cameraOff=off;for(const t of s.local.getVideoTracks())t.enabled=!off;$('callCamera').setAttribute('aria-pressed',String(off));$('callCamera').innerHTML=callSvg(off?'camOff':'video')+'<span>'+(off?'Camera on':'Camera')+'</span>';$('callLocalVideo').classList.toggle('off',off)};
 $('callFlip').onclick=()=>void flipCamera();
}
function playTone(kind){stopTone();try{toneCtx=toneCtx||new (window.AudioContext||window.webkitAudioContext)();void toneCtx.resume();const beep=()=>{const t=toneCtx.currentTime,o=toneCtx.createOscillator(),g=toneCtx.createGain();o.frequency.value=kind==='ring'?660:440;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.12,t+0.05);g.gain.exponentialRampToValueAtTime(0.0001,t+(kind==='ring'?0.9:1.2));o.connect(g).connect(toneCtx.destination);o.start(t);o.stop(t+1.3);if(kind==='ring')navigator.vibrate?.([300,150,300])};beep();toneTimer=setInterval(beep,kind==='ring'?1600:3000)}catch{}}
function stopTone(){clearInterval(toneTimer);toneTimer=null;try{navigator.vibrate?.(0)}catch{}}
async function callIce(){try{return await api('/calls/ice')}catch{return {iceServers:[{urls:['stun:stun.cloudflare.com:3478']}],relay:false}}}
function waitForIce(pc,ms=2500){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const done=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',done);resolve()}};pc.addEventListener('icegatheringstatechange',done);setTimeout(resolve,ms)})}
async function callMedia(video){
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('This browser cannot make calls. Please use Chrome.');
 try{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:video?{facingMode:'user',width:{ideal:640},height:{ideal:480}}:false})}
 catch(e){throw Error(e?.name==='NotAllowedError'?(video?'Allow the camera and microphone for this site, then try again.':'Allow the microphone for this site, then try again.'):'Could not open the '+(video?'camera or microphone.':'microphone.'))}
}
function setCallStatus(text){const el=$('callStatus');if(el){el.textContent=text;el.hidden=!text}}
function showCallScreen(state,status){
 callUi();const p=state.peer;$('callAvatar').replaceChildren(avatar(p));$('callName').textContent=p.name||'Member';$('callBadge').replaceChildren(verifiedMark(p.role||'member',undefined,!!p.verified));setCallStatus(status);$('callTimer').hidden=true;$('callTimer').textContent='0:00';
 const screen=$('callScreen');screen.classList.toggle('video',!!state.video);screen.classList.remove('connected');screen.hidden=false;document.body.classList.add('call-open');
 $('callCamera').hidden=$('callFlip').hidden=!state.video;$('callMute').setAttribute('aria-pressed','false');$('callMute').innerHTML=callSvg('mic')+'<span>Mute</span>';$('callCamera').innerHTML=callSvg('video')+'<span>Camera</span>';$('callLocalVideo').classList.remove('off');
}
function attachLocal(state){if(state.video){const v=$('callLocalVideo');v.srcObject=state.local;v.classList.add('mirror');state.facing='user';void v.play().catch(()=>{})}}
function buildPeer(state){
 const pc=new RTCPeerConnection({iceServers:state.ice.iceServers,iceTransportPolicy:state.ice.relay?'relay':'all'});
 for(const track of state.local.getTracks())pc.addTrack(track,state.local);
 pc.ontrack=e=>{const stream=e.streams[0],el=state.video?$('callRemoteVideo'):$('callRemoteAudio');if(stream&&el.srcObject!==stream){el.srcObject=stream;void el.play().catch(()=>{})}};
 pc.onconnectionstatechange=()=>{if(callState!==state)return;const s=pc.connectionState;if(s==='connected'){stopTone();setCallStatus('');$('callScreen').classList.add('connected');startCallTimer(state);if(state.poll){clearInterval(state.poll);state.poll=setInterval(()=>void pollCall(state),4000)}}else if(s==='disconnected')setCallStatus('Reconnecting…');else if(s==='failed'){toast('📵 Call failed. The internet connection could not reach the other phone.');void endCall('failed',true)}};
 return pc;
}
function startCallTimer(state){if(state.timer)return;state.startedAt=Date.now();$('callTimer').hidden=false;state.timer=setInterval(()=>{$('callTimer').textContent=formatCallTime((Date.now()-state.startedAt)/1000)},1000)}
function stopMedia(state){for(const t of state?.local?.getTracks()||[])t.stop()}
async function startCall(video){
 if(!requireLogin())return;if(callState||incomingCall)return toast('You are already on a call.');
 if(chat?.kind!=='private'||!privatePeer)return toast('Open a personal chat to call.');
 if(privateThread&&(privateThread.status!=='accepted'||privateThread.blocked))return toast('You can call after the chat request is accepted.');
 const state={role:'caller',video:!!video,peer:privatePeer,threadId:chat.id,id:null};callState=state;showCallScreen(state,video?'Starting video call…':'Calling…');
 try{
  state.ice=await callIce();state.local=await callMedia(video);if(callState!==state)return stopMedia(state);attachLocal(state);
  state.pc=buildPeer(state);await state.pc.setLocalDescription(await state.pc.createOffer());await waitForIce(state.pc);if(callState!==state)return;
  const {id}=await api('/calls',{threadId:state.threadId,video:!!video,offer:state.pc.localDescription.sdp});state.id=id;if(callState!==state){void api('/calls/'+id+'/end',{reason:'hangup'}).catch(()=>{});return}
  setCallStatus('Ringing…');playTone('ringback');state.poll=setInterval(()=>void pollCall(state),1500);
  state.ringTimeout=setTimeout(()=>{if(callState===state&&!state.answered){toast('No answer.');void endCall('missed',true)}},45000);
 }catch(e){toast(e.message);await endCall('error',true)}
}
async function pollCall(state){
 if(callState!==state||!state.id||state.polling)return;state.polling=true;
 try{const c=await api('/calls/'+state.id);if(callState!==state)return;
  if(state.role==='caller'&&c.status==='active'&&c.answer&&!state.answered){state.answered=true;clearTimeout(state.ringTimeout);stopTone();setCallStatus('Connecting…');await state.pc.setRemoteDescription({type:'answer',sdp:c.answer})}
  if(['ended','declined','missed','failed'].includes(c.status)){closeCall(state);toast(c.status==='declined'?'📵 Call declined.':c.status==='missed'?'No answer.':c.status==='failed'?'📵 Call failed.':'Call ended.');if(chat?.kind==='private')void refreshChat().catch(()=>{})}
 }catch(e){if(/not found/i.test(e.message)){closeCall(state)}}finally{state.polling=false}
}
function closeCall(state){
 if(!state||callState!==state)return;callState=null;clearInterval(state.poll);clearTimeout(state.ringTimeout);clearInterval(state.timer);stopTone();try{state.pc?.close()}catch{}stopMedia(state);
 if($('callScreen')){$('callScreen').hidden=true;for(const id of ['callRemoteAudio','callRemoteVideo','callLocalVideo'])$(id).srcObject=null}document.body.classList.remove('call-open');
}
async function endCall(reason='hangup',silent=false){
 const state=callState;if(!state)return;closeCall(state);
 if(state.id)try{await api('/calls/'+state.id+'/end',{reason:reason==='failed'?'failed':'hangup'})}catch{}
 if(!silent&&reason==='hangup')toast('Call ended.');if(chat?.kind==='private')void refreshChat().catch(()=>{});
}
async function flipCamera(){
 const s=callState;if(!s?.video||!s.pc)return;try{s.facing=s.facing==='environment'?'user':'environment';const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:s.facing,width:{ideal:640},height:{ideal:480}}}),track=stream.getVideoTracks()[0],sender=s.pc.getSenders().find(x=>x.track?.kind==='video');if(!track||!sender)return;await sender.replaceTrack(track);for(const old of s.local.getVideoTracks()){s.local.removeTrack(old);old.stop()}s.local.addTrack(track);track.enabled=!s.cameraOff;$('callLocalVideo').srcObject=s.local;$('callLocalVideo').classList.toggle('mirror',s.facing==='user')}catch{toast('Could not switch the camera.')}
}
// Incoming calls: checked every few seconds while Wize X is open.
async function pollIncoming(){
 if(!me||callState||incomingCall||document.hidden)return;
 try{const {call}=await api('/calls/incoming');if(call&&!callState&&!incomingCall)showIncoming(call)}catch{}
}
function showIncoming(c){
 callUi();incomingCall=c;$('incomingAvatar').replaceChildren(avatar({name:c.name,picture:c.picture,role:c.role,verified:c.verified}));$('incomingName').textContent=c.name||'Member';$('incomingBadge').replaceChildren(verifiedMark(c.role||'member',undefined,!!c.verified));$('incomingKind').textContent=c.video?'🎥 Incoming video call…':'📞 Incoming voice call…';
 $('incomingCall').hidden=false;document.body.classList.add('call-open');playTone('ring');$('acceptCall').focus();
 c.watch=setInterval(async()=>{if(incomingCall!==c)return clearInterval(c.watch);try{const s=await api('/calls/'+c.id);if(s.status!=='ringing'&&incomingCall===c){hideIncoming();toast('📞 Missed call from '+(c.name||'a member')+'.')}}catch{hideIncoming()}},2500);
}
function hideIncoming(){const c=incomingCall;if(!c)return;clearInterval(c.watch);incomingCall=null;stopTone();if($('incomingCall'))$('incomingCall').hidden=true;if(!callState)document.body.classList.remove('call-open')}
async function acceptCall(){
 const c=incomingCall;if(!c)return;hideIncoming();
 const state={role:'callee',video:!!c.video,peer:{id:c.caller_id,name:c.name,picture:c.picture,role:c.role,verified:c.verified},threadId:c.thread_id,id:c.id};callState=state;showCallScreen(state,'Connecting…');
 try{
  state.ice=await callIce();state.local=await callMedia(state.video);if(callState!==state)return stopMedia(state);attachLocal(state);state.pc=buildPeer(state);
  await state.pc.setRemoteDescription({type:'offer',sdp:c.offer});await state.pc.setLocalDescription(await state.pc.createAnswer());await waitForIce(state.pc);if(callState!==state)return;
  await api('/calls/'+c.id+'/answer',{answer:state.pc.localDescription.sdp});state.answered=true;state.poll=setInterval(()=>void pollCall(state),2000);
 }catch(e){toast(e.message);await endCall('failed',true)}
}
async function declineCall(){const c=incomingCall;if(!c)return;hideIncoming();try{await api('/calls/'+c.id+'/decline',{})}catch{}}
$('chatCallAudio').onclick=()=>void startCall(false);$('chatCallVideo').onclick=()=>void startCall(true);
// The chat-unread check (every 4 seconds) also brings a ringing call, so no extra request is needed.
function onIncomingCall(c){if(c&&me&&!callState&&!incomingCall)showIncoming(c)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pollIncoming()});
window.addEventListener('pagehide',()=>{const s=callState;if(s?.id)navigator.sendBeacon?.('/api/calls/'+s.id+'/end',new Blob([JSON.stringify({reason:'hangup'})],{type:'application/json'}))});

// ---- Back button: every screen opened on top (photo, post, comments, profile, deal room, dialogs, chat info) gets one history step,
// so the phone's back button closes only the top screen, then the chat, then goes to the previous page. One press = one visible step. ----
const BACK_LAYERS={photoViewer:'closePhotoViewer',photoEditor:'photoEditorCancel',profileCropModal:'cancelCrop',dealStepModal:'closeDealStep',listingAdminModal:'closeListingAdmin',memberActionModal:'closeMemberActions',reportModal:'closeReport',verificationModal:'closeVerification',needDealModal:'closeNeedDeal',reviewModal:'closeReview',dealCancelModal:'closeDealCancel',directFinalModal:'closeDirectFinal',deletePostModal:'cancelDeletePost',adminSetupModal:'closeAdminSetup',accountSecurityModal:'closeAccountSecurity',profileCompletedModal:'closeProfileCompleted',profileEditModal:'closeProfileEditor',commentsModal:'closeComments',listingModal:'closeListing',profileModal:'closeProfile',friendsModal:'closeFriends',groupCreateModal:'closeGroupCreate',profileMenuModal:'closeProfileMenu',dealRoomModal:'closeDealRoom',peerInfoPanel:'closePeerInfo',groupSettingsPanel:'closeGroupSettings',groupPostComposer:'closeGroupPost',dealForm:'closeDealForm',loginModal:'closeLogin',installHelp:()=>closeInstallHelp(),priceFilterPopover:()=>setPriceFilterOpen(false),groupTools:()=>{if(!$('groupTools').hidden)$('idRangeToggle').click()},createPostMenu:()=>closeCreateMenu()};
const HISTORY_TABS=['home','messages','post','friends','profile','privacy','search','deals'];
let backStack=[],openQueue=[],hops=[],hopsAt=0;
const chatIsOpen=()=>document.body.classList.contains('chat-open');
const layerOpen=id=>{const el=document.getElementById(id);return !!el&&el.isConnected&&!el.closest('[hidden]')};
// A history step is stale when the screen it stands for is already closed.
const staleEntry=s=>!!s&&(!!(s.layer&&!layerOpen(s.layer))||!!((s.chat||s.inChat)&&!chatIsOpen()));
const layerState=id=>({...(history.state?.tab?{tab:history.state.tab,profileId:history.state.profileId}:{}),...(chatIsOpen()?{inChat:true}:{}),layer:id});
// Our own history moves: 'quiet' = drop a stale step without changing the screen, 'user' = treat like another back press, 'forward' = undo a back press.
function hop(kind){hops.push(kind);hopsAt=Date.now();if(kind==='forward')history.forward();else history.back()}
function closeLayer(id){const how=BACK_LAYERS[id];if(typeof how==='function')return how();const button=document.getElementById(how);if(button)button.click();else{const el=document.getElementById(id);if(el)el.hidden=true}}
function syncHistory(){
 backStack=backStack.filter(layerOpen);openQueue=openQueue.filter(id=>layerOpen(id)&&!backStack.includes(id));
 if(hops.length){if(Date.now()-hopsAt<2500)return;hops=[]}// wait until our own back/forward move has landed
 if(staleEntry(history.state)){if(!openQueue.length)return hop('quiet');const id=openQueue.shift();backStack.push(id);history.replaceState(layerState(id),'')}
 for(const id of openQueue.splice(0)){backStack.push(id);history.pushState(layerState(id),'')}
}
new MutationObserver(records=>{
 backStack=backStack.filter(layerOpen);
 for(const r of records){const id=r.target.id;if(id&&id in BACK_LAYERS&&!openQueue.includes(id)&&!backStack.includes(id)&&layerOpen(id))openQueue.push(id)}
 syncHistory();
}).observe(document.body,{attributes:true,attributeFilter:['hidden'],subtree:true});
// Links to a page (#messages, #privacy) switch the page in place.
document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(!a||e.defaultPrevented)return;const t=a.getAttribute('href').slice(1);if(HISTORY_TABS.includes(t)){e.preventDefault();navigate(t)}});
window.addEventListener('popstate',e=>{
 lastPopAt=Date.now();const s=e.state,kind=hops.length&&Date.now()-hopsAt<2500?hops.shift():(hops=[],'user');
 if(kind!=='user'){syncHistory();return}
 if(callState||incomingCall)return hop('forward');// the call screen stays until the call ends
 backStack=backStack.filter(layerOpen);
 const at=s?.layer?backStack.indexOf(s.layer):-1;
 if(backStack.length-1>at){const top=backStack.pop();closeLayer(top);
  if(typeof BACK_LAYERS[top]==='string'&&layerOpen(top)){backStack.push(top);history.pushState(layerState(top),'');return}// it only went back one view inside (group info, chat info)
  if(staleEntry(s))hop('quiet');return}
 if(chatIsOpen()&&!s?.chat&&!s?.inChat){closeConversation();if(staleEntry(s))hop('quiet');return}
 if(staleEntry(s))return hop('user');
 const hashTab=location.hash.slice(1),tab=s?.tab||(HISTORY_TABS.includes(hashTab)?hashTab:null);
 if(!tab)return;
 if(tab!==active||(s?.profileId||null)!==(profileViewId||null))return navigate(tab,{fromHistory:true,profileId:s?.profileId});
 hop('user');// this step showed the same page again: go one more step back
});
