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
 screen:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3"/>',
 speaker:'<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
 speakerOff:'<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 5 6M22 9l-5 6"/>',
 minimize:'<path d="M10 4v6H4M14 20v-6h6M10 10 3 3M14 14l7 7"/>',
 hangup:'<path transform="rotate(135 12 12)" d="M5 4h3.5l2 4.6-2.3 1.5a11 11 0 0 0 5.7 5.7l1.5-2.3 4.6 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'
};
const callSvg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+CALL_SVG[name]+'</svg>';
let callState=null,incomingCall=null,toneCtx=null,toneTimer=null;
function callUi(){
 if($('callScreen'))return;
 const screen=node('div',undefined,'call-screen');screen.id='callScreen';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','Call');
 screen.innerHTML='<video id="callRemoteVideo" class="call-remote-video" autoplay playsinline></video><audio id="callRemoteAudio" autoplay></audio><div id="callGrid" class="call-grid"></div><div class="call-info"><div id="callAvatar" class="call-avatar"></div><h2 id="callName"></h2><div id="callBadge" class="call-badge"></div><p id="callStatus" class="call-status"></p><p id="callTimer" class="call-timer" hidden>0:00</p><p id="callPeople" class="call-people" hidden></p></div><video id="callLocalVideo" class="call-local-video" autoplay playsinline muted></video><div class="call-top"><button type="button" id="callMinimize" class="call-top-btn" aria-label="Minimize call">'+callSvg('minimize')+'</button><button type="button" id="callFlip" class="call-top-btn" aria-label="Switch camera">'+callSvg('flip')+'</button></div><div class="call-controls"><button type="button" id="callCamera" class="call-btn" aria-label="Turn camera off" aria-pressed="false">'+callSvg('video')+'<span>Camera</span></button><button type="button" id="callMute" class="call-btn" aria-label="Mute microphone" aria-pressed="false">'+callSvg('mic')+'<span>Mute</span></button><button type="button" id="callShare" class="call-btn" aria-label="Share screen" aria-pressed="false">'+callSvg('screen')+'<span>Share</span></button><button type="button" id="callSpeaker" class="call-btn" aria-label="Speaker" aria-pressed="false">'+callSvg('speaker')+'<span>Speaker</span></button><button type="button" id="callHangup" class="call-btn hangup" aria-label="End call">'+callSvg('hangup')+'<span>End</span></button></div>';
 const ring=node('div',undefined,'incoming-call');ring.id='incomingCall';ring.hidden=true;ring.setAttribute('role','alertdialog');ring.setAttribute('aria-label','Incoming call');
 ring.innerHTML='<div class="incoming-card"><div id="incomingAvatar" class="call-avatar"></div><strong id="incomingName"></strong><div id="incomingBadge" class="call-badge"></div><p id="incomingKind" class="call-status"></p><div class="incoming-actions"><button type="button" id="declineCall" class="call-round decline" aria-label="Decline">'+callSvg('hangup')+'</button><button type="button" id="acceptCall" class="call-round accept" aria-label="Accept">'+callSvg('phone')+'</button></div><div class="incoming-labels"><span id="incomingNoLabel">Decline</span><span id="incomingYesLabel">Accept</span></div></div>';
 document.body.append(screen,ring);
 $('callHangup').onclick=()=>void endCall('hangup');$('acceptCall').onclick=()=>void acceptCall();$('declineCall').onclick=()=>void declineCall();
 $('callMute').onclick=()=>{const s=callState;if(!s?.local)return;const off=!s.muted;s.muted=off;for(const t of s.local.getAudioTracks())t.enabled=!off;$('callMute').setAttribute('aria-pressed',String(off));$('callMute').innerHTML=callSvg(off?'micOff':'mic')+'<span>'+(off?'Unmute':'Mute')+'</span>'};
 $('callCamera').onclick=()=>{const s=callState;if(!s?.local)return;if(s.kind!=='room')return void toggleCallCamera();const off=!s.cameraOff;s.cameraOff=off;for(const t of s.local.getVideoTracks())t.enabled=!off;$('callCamera').setAttribute('aria-pressed',String(off));$('callCamera').innerHTML=callSvg(off?'camOff':'video')+'<span>'+(off?'Camera on':'Camera')+'</span>';$('callLocalVideo').classList.toggle('off',off)};
 $('callFlip').onclick=()=>void flipCamera();
 $('callShare').onclick=()=>void toggleScreenShare();$('callSpeaker').onclick=()=>void toggleSpeaker();$('callMinimize').onclick=()=>minimizeCall(true);
 screen.addEventListener('click',e=>{if(screen.classList.contains('mini')&&!e.target.closest('#callHangup')){e.preventDefault();minimizeCall(false)}},true);
}
function playTone(kind){stopTone();try{toneCtx=toneCtx||new (window.AudioContext||window.webkitAudioContext)();void toneCtx.resume();const beep=()=>{const t=toneCtx.currentTime,o=toneCtx.createOscillator(),g=toneCtx.createGain();o.frequency.value=kind==='ring'?660:440;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.12,t+0.05);g.gain.exponentialRampToValueAtTime(0.0001,t+(kind==='ring'?0.9:1.2));o.connect(g).connect(toneCtx.destination);o.start(t);o.stop(t+1.3);if(kind==='ring')navigator.vibrate?.([300,150,300])};beep();toneTimer=setInterval(beep,kind==='ring'?1600:3000)}catch{}}
function stopTone(){clearInterval(toneTimer);toneTimer=null;try{navigator.vibrate?.(0)}catch{}}
async function callIce(){try{return await api('/calls/ice')}catch{return {iceServers:[{urls:['stun:stun.cloudflare.com:3478']}],relay:false}}}
// Wait for the connection addresses: until gathering completes, or 0.6 s after the first TURN relay address, or the time limit.
function waitForIce(pc,ms=2500){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();let early=null;const finish=()=>{clearTimeout(early);pc.removeEventListener('icegatheringstatechange',done);pc.removeEventListener('icecandidate',found);resolve()};const done=()=>{if(pc.iceGatheringState==='complete')finish()};const found=e=>{if(!early&&/ typ relay /.test(e.candidate?.candidate||''))early=setTimeout(finish,600)};pc.addEventListener('icegatheringstatechange',done);pc.addEventListener('icecandidate',found);setTimeout(finish,ms)})}
async function callMedia(video,room=false){
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('This browser cannot make calls. Please use Chrome.');
 try{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:video?{facingMode:'user',width:{ideal:room?480:640},height:{ideal:room?360:480},frameRate:{ideal:room?15:24}}:false})}
 catch(e){throw Error(e?.name==='NotAllowedError'?(video?'Allow the camera and microphone for this site, then try again.':'Allow the microphone for this site, then try again.'):'Could not open the '+(video?'camera or microphone.':'microphone.'))}
}
function setCallStatus(text){const el=$('callStatus');if(el){el.textContent=text;el.hidden=!text}}
function showCallScreen(state,status){
 callUi();const p=state.peer;$('callAvatar').replaceChildren(avatar(p));$('callName').textContent=p.name||'Member';$('callBadge').replaceChildren(verifiedMark(p.role||'member',undefined,!!p.verified));setCallStatus(status);$('callTimer').hidden=true;$('callTimer').textContent='0:00';
 const screen=$('callScreen');screen.classList.toggle('video',!!state.video);screen.classList.remove('connected','room');$('callPeople').hidden=true;$('callGrid').replaceChildren();screen.hidden=false;document.body.classList.add('call-open');
 $('callMute').setAttribute('aria-pressed','false');$('callMute').innerHTML=callSvg('mic')+'<span>Mute</span>';$('callLocalVideo').classList.remove('off');
 screen.classList.remove('video','mini','remote-video','remote-screen','local-cam');state.camOn=!!state.video;state.remoteVideo=!!state.video;$('callCamera').hidden=false;$('callShare').hidden=!canShareScreen();resetSpeaker();paintCallVideo(state);
}
function attachLocal(state){if(state.local?.getVideoTracks().length){const v=$('callLocalVideo');v.srcObject=state.local;v.classList.add('mirror');state.facing='user';void v.play().catch(()=>{})}}
function buildPeer(state){
 const pc=new RTCPeerConnection({iceServers:state.ice.iceServers,iceTransportPolicy:state.ice.relay?'relay':'all'});
 for(const track of state.local.getTracks())pc.addTrack(track,state.local);
 // A video line in every call, so the camera or a shared screen can be turned on later without a new offer.
 if(!state.local.getVideoTracks().length&&state.role==='caller')pc.addTransceiver('video',{direction:'sendrecv'});
 state.ctl=pc.createDataChannel('wm-call',{negotiated:true,id:7});state.ctl.onopen=()=>sendCallState(state);
 state.ctl.onmessage=e=>{try{const m=JSON.parse(e.data);if(callState!==state)return;state.remoteVideo=!!m.video||!!m.screen;state.remoteScreen=!!m.screen;paintCallVideo(state)}catch{}};
 pc.ontrack=e=>{const audio=e.track.kind==='audio',el=audio?$('callRemoteAudio'):$('callRemoteVideo'),stream=audio?(e.streams[0]||new MediaStream([e.track])):new MediaStream([e.track]);if(!audio)el.muted=true;el.srcObject=stream;void el.play().catch(()=>{})};
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
  state.pc=buildPeer(state);await state.pc.setLocalDescription(await state.pc.createOffer());await waitForIce(state.pc,state.ice.relay?5000:2500);if(callState!==state)return;
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
 if(!state||callState!==state)return;callState=null;try{state.screen?.stop()}catch{}document.body.classList.remove('call-mini');$('callScreen')?.classList.remove('mini','remote-video','remote-screen','local-cam');clearInterval(state.poll);clearTimeout(state.ringTimeout);clearInterval(state.timer);stopTone();try{state.pc?.close()}catch{}for(const peer of state.peers?.values()||[])try{peer.pc?.close()}catch{}stopMedia(state);
 if($('callScreen')){$('callScreen').hidden=true;$('callScreen').classList.remove('room');$('callGrid').replaceChildren();for(const id of ['callRemoteAudio','callRemoteVideo','callLocalVideo'])$(id).srcObject=null}document.body.classList.remove('call-open');
}
async function endCall(reason='hangup',silent=false){
 const state=callState;if(!state)return;closeCall(state);
 if(state.kind==='room'){if(state.id)try{await api('/rooms/'+state.id+'/leave',{})}catch{}if(!silent)toast('You left the call.');if(['group','deal'].includes(chat?.kind))void refreshChat().catch(()=>{});return}
 if(state.id)try{await api('/calls/'+state.id+'/end',{reason:reason==='failed'?'failed':'hangup'})}catch{}
 if(!silent&&reason==='hangup')toast('Call ended.');if(chat?.kind==='private')void refreshChat().catch(()=>{});
}
async function flipCamera(){
 const s=callState;if(s?.screen)return toast('Stop sharing the screen first.');if(!s?.local?.getVideoTracks().length||!s.pc&&s.kind!=='room')return;try{s.facing=s.facing==='environment'?'user':'environment';const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:s.facing,width:{ideal:s.kind==='room'?480:640},height:{ideal:s.kind==='room'?360:480}}}),track=stream.getVideoTracks()[0],senders=(s.kind==='room'?[...s.peers.values()].map(p=>p.pc):[s.pc]).filter(Boolean).flatMap(pc=>pc.getSenders()).filter(x=>x.track?.kind==='video');if(!track)return;for(const sender of senders)await sender.replaceTrack(track);for(const old of s.local.getVideoTracks()){s.local.removeTrack(old);old.stop()}s.local.addTrack(track);track.enabled=!s.cameraOff;$('callLocalVideo').srcObject=s.local;$('callLocalVideo').classList.toggle('mirror',s.facing==='user')}catch{toast('Could not switch the camera.')}
}
// ---- Messenger-style call tools: camera on/off in any call, screen sharing, speaker, small call window ----
const canShareScreen=()=>!!navigator.mediaDevices?.getDisplayMedia;
function videoSender(s){const t=s?.pc?.getTransceivers().find(x=>x.receiver.track.kind==='video'&&x.direction!=='inactive');return t?.sender||null}
function sendCallState(s){try{if(s?.ctl?.readyState==='open')s.ctl.send(JSON.stringify({video:!!s.camOn,screen:!!s.screen}))}catch{}}
// Shows the other person's video when they send camera or screen, otherwise their photo; and my own small preview.
function paintCallVideo(s){
 const screen=$('callScreen');if(!screen||s.kind==='room')return;
 screen.classList.toggle('remote-video',!!s.remoteVideo);screen.classList.toggle('remote-screen',!!s.remoteScreen);screen.classList.toggle('local-cam',!!(s.camOn||s.screen));
 const local=$('callLocalVideo');if(s.screen){local.srcObject=new MediaStream([s.screen]);local.classList.remove('mirror')}else if(s.camOn&&s.local){local.srcObject=s.local;local.classList.toggle('mirror',(s.facing||'user')==='user')}else local.srcObject=null;
 if(local.srcObject)void local.play().catch(()=>{});
 $('callCamera').setAttribute('aria-pressed',String(!s.camOn));$('callCamera').setAttribute('aria-label',s.camOn?'Turn camera off':'Turn camera on');$('callCamera').innerHTML=callSvg(s.camOn?'video':'camOff')+'<span>'+(s.camOn?'Camera':'Camera off')+'</span>';
 $('callShare').setAttribute('aria-pressed',String(!!s.screen));$('callShare').querySelector('span').textContent=s.screen?'Stop share':'Share';
 $('callFlip').hidden=!s.camOn||!!s.screen;
}
async function toggleCallCamera(){
 const s=callState;if(!s||s.kind==='room'||s.cameraBusy)return;const sender=videoSender(s);if(!sender)return toast('Camera is not available in this call.');s.cameraBusy=true;
 try{
  if(s.camOn){if(!s.screen)await sender.replaceTrack(null);for(const t of s.local.getVideoTracks()){s.local.removeTrack(t);t.stop()}s.camOn=false}
  else{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:s.facing||'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24}}}),track=stream.getVideoTracks()[0];if(!track)throw Error();if(callState!==s){track.stop();return}if(!s.screen)await sender.replaceTrack(track);s.local.addTrack(track);s.facing=s.facing||'user';s.camOn=true}
  paintCallVideo(s);sendCallState(s);
 }catch{toast('Could not open the camera. Allow the camera for this site, then try again.')}finally{s.cameraBusy=false}
}
async function toggleScreenShare(){
 const s=callState;if(!s||s.kind==='room')return;if(!canShareScreen())return toast('Screen sharing works from a computer browser. Phones do not let websites share the screen.');
 if(s.screen)return stopScreenShare(s);const sender=videoSender(s);if(!sender)return toast('Screen sharing is not available in this call.');
 try{const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15}},audio:false}),track=stream.getVideoTracks()[0];if(!track||callState!==s){for(const t of stream.getTracks())t.stop();return}
  track.contentHint='detail';await sender.replaceTrack(track);s.screen=track;track.onended=()=>void stopScreenShare(s);paintCallVideo(s);sendCallState(s);toast('🖥️ Sharing your screen.')
 }catch(e){if(e?.name!=='NotAllowedError')toast('Could not share the screen.')}
}
async function stopScreenShare(s){if(!s?.screen)return;const track=s.screen;s.screen=null;try{await videoSender(s)?.replaceTrack(s.camOn?s.local.getVideoTracks()[0]||null:null)}catch{}track.onended=null;track.stop();if(callState===s){paintCallVideo(s);sendCallState(s)}}
// Speaker: switches between the phone's sound outputs where the browser allows it, otherwise turns the other side's sound off and on.
function callAudioEls(){return [...document.querySelectorAll('#callScreen audio,#callScreen video')].filter(el=>el.id!=='callLocalVideo'&&el.id!=='callRemoteVideo')}
function resetSpeaker(){const b=$('callSpeaker');if(!b)return;b.setAttribute('aria-pressed','false');b.innerHTML=callSvg('speaker')+'<span>Speaker</span>';for(const el of callAudioEls())el.muted=false;if(callState)callState.soundOff=false}
async function toggleSpeaker(){
 const s=callState;if(!s)return;const els=callAudioEls(),b=$('callSpeaker');
 try{if(typeof HTMLMediaElement.prototype.setSinkId==='function'){const outs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput'&&d.deviceId);if(outs.length>1){s.out=((s.out??0)+1)%outs.length;const out=outs[s.out];for(const el of els)await el.setSinkId(out.deviceId).catch(()=>{});b.setAttribute('aria-pressed',String(s.out!==0));b.querySelector('span').textContent=s.out===0?'Speaker':'Output '+(s.out+1);return toast('🔊 '+(out.label||'Sound output '+(s.out+1)))}}}catch{}
 s.soundOff=!s.soundOff;for(const el of els)el.muted=s.soundOff;b.setAttribute('aria-pressed',String(s.soundOff));b.innerHTML=callSvg(s.soundOff?'speakerOff':'speaker')+'<span>'+(s.soundOff?'Sound off':'Speaker')+'</span>';toast(s.soundOff?'🔇 Call sound off. Tap again to hear.':'🔊 Call sound on.');
}
// Small call window: keep talking while using the rest of the site. Tap it to open the call again.
function minimizeCall(on){const screen=$('callScreen');if(!screen||screen.hidden)return;screen.classList.toggle('mini',on);document.body.classList.toggle('call-open',!on);document.body.classList.toggle('call-mini',on);screen.setAttribute('aria-modal',String(!on));screen.setAttribute('aria-label',on?'Call in progress. Tap to open.':'Call')}
// Incoming calls: checked every few seconds while Wize X is open.
async function pollIncoming(){
 if(!me||callState||incomingCall||document.hidden)return;
 try{const {call}=await api('/calls/incoming');if(call&&!callState&&!incomingCall)showIncoming(call)}catch{}
}
function showIncoming(c){
 callUi();incomingCall=c;$('incomingAvatar').replaceChildren(avatar({name:c.name,picture:c.picture,role:c.role,verified:c.verified}));$('incomingName').textContent=c.name||'Member';$('incomingBadge').replaceChildren(verifiedMark(c.role||'member',undefined,!!c.verified));$('incomingKind').textContent=c.room?(c.video?'🎥 ':'📞 ')+(c.kind==='deal'?'Deal call':'Group call')+' · '+(c.chat_name||''):c.video?'🎥 Incoming video call…':'📞 Incoming voice call…';$('incomingNoLabel').textContent=c.room?'Ignore':'Decline';$('incomingYesLabel').textContent=c.room?'Join':'Accept';closeAlerts((c.room?'room-':'call-')+c.id);
 $('incomingCall').hidden=false;document.body.classList.add('call-open');playTone('ring');$('acceptCall').focus();
 c.shownAt=Date.now();c.watch=setInterval(async()=>{if(incomingCall!==c)return clearInterval(c.watch);try{if(c.room){const r=await api('/rooms/'+c.id);if((r.room.status!=='live'||Date.now()-c.shownAt>45000)&&incomingCall===c){dismissedRooms.add(c.id);hideIncoming();if(r.room.status!=='live')toast('📞 The call has ended.')}return}const s=await api('/calls/'+c.id);if(s.status!=='ringing'&&incomingCall===c){hideIncoming();toast('📞 Missed call from '+(c.name||'a member')+'.')}}catch{hideIncoming()}},2500);
}
function hideIncoming(){const c=incomingCall;if(!c)return;clearInterval(c.watch);incomingCall=null;stopTone();if($('incomingCall'))$('incomingCall').hidden=true;if(!callState)document.body.classList.remove('call-open')}
async function acceptCall(){
 const c=incomingCall;if(!c)return;hideIncoming();
 if(c.room){dismissedRooms.add(c.id);return joinRoom({kind:c.kind,id:c.chat_id,video:c.video,title:c.chat_name})}
 const state={role:'callee',video:!!c.video,peer:{id:c.caller_id,name:c.name,picture:c.picture,role:c.role,verified:c.verified},threadId:c.thread_id,id:c.id};callState=state;showCallScreen(state,'Connecting…');
 try{
  state.ice=await callIce();state.local=await callMedia(state.video);if(callState!==state)return stopMedia(state);attachLocal(state);state.pc=buildPeer(state);
  await state.pc.setRemoteDescription({type:'offer',sdp:c.offer});for(const t of state.pc.getTransceivers())if(t.receiver.track.kind==='video'&&!t.sender.track)t.direction='sendrecv';await state.pc.setLocalDescription(await state.pc.createAnswer());await waitForIce(state.pc,state.ice.relay?5000:2500);if(callState!==state)return;
  await api('/calls/'+c.id+'/answer',{answer:state.pc.localDescription.sdp});state.answered=true;state.poll=setInterval(()=>void pollCall(state),2000);
 }catch(e){toast(e.message);await endCall('failed',true)}
}
async function declineCall(){const c=incomingCall;if(!c)return;hideIncoming();if(c.room){dismissedRooms.add(c.id);return}try{await api('/calls/'+c.id+'/decline',{})}catch{}}
$('chatCallAudio').onclick=()=>void(chat?.kind==='private'?startCall(false):startRoomCall(false));$('chatCallVideo').onclick=()=>void(chat?.kind==='private'?startCall(true):startRoomCall(true));
// The chat-unread check (every 4 seconds) also brings a ringing call, so no extra request is needed.
function onIncomingCall(c){if(c&&me&&!callState&&!incomingCall)showIncoming(c)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pollIncoming()});
window.addEventListener('pagehide',()=>{const s=callState;if(s?.id)navigator.sendBeacon?.(s.kind==='room'?'/api/rooms/'+s.id+'/leave':'/api/calls/'+s.id+'/end',new Blob([JSON.stringify({reason:'hangup'})],{type:'application/json'}))});

// ---- Group and deal calls: everyone in the call connects to everyone else (up to 6 people in a group, the 3 deal members in a deal). ----
// The newer person always sends the offer to the people already in the call; offers and answers go through /api/rooms.
const dismissedRooms=new Set();let liveChatCall=null;
const roomOffer=(state,peer)=>{peer.queue=peer.queue.then(()=>makeRoomOffer(state,peer)).catch(()=>{})};
function roomTile(state,peer){
 let tile=$('callGrid').querySelector('[data-peer="'+peer.id+'"]');
 if(!tile){tile=node('div',undefined,'call-tile');tile.dataset.peer=peer.id;const face=node('div',undefined,'call-tile-face');face.append(avatar(peer.person));const media=node(state.video?'video':'audio',undefined,'call-tile-media');media.autoplay=true;media.playsInline=true;const label=node('div',undefined,'call-tile-label');label.append(node('span',peer.person.name||'Member','call-tile-name'),node('small','Connecting…','call-tile-state'));tile.append(face,media,label);$('callGrid').append(tile)}
 return tile;
}
function paintRoom(state){
 if(callState!==state||!$('callGrid'))return;const peers=[...state.peers.values()];$('callGrid').dataset.count=String(Math.max(1,peers.length));
 for(const peer of peers){const tile=roomTile(state,peer),st=peer.pc?.connectionState;tile.querySelector('.call-tile-state').textContent=st==='connected'?'':st==='disconnected'?'Reconnecting…':st==='failed'?'Trying again…':'Connecting…';tile.classList.toggle('connected',st==='connected');const media=tile.querySelector('.call-tile-media');tile.classList.toggle('has-video',!!media.srcObject?.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted))}
 $('callPeople').hidden=false;$('callPeople').textContent=(peers.length+1)+' in call';
 setCallStatus(peers.length?'':state.ring?'Ringing…':'Waiting for others to join…');$('callScreen').classList.toggle('connected',peers.some(p=>p.pc?.connectionState==='connected'));
}
function buildRoomPc(state,peer){
 const pc=new RTCPeerConnection({iceServers:state.ice.iceServers,iceTransportPolicy:state.ice.relay?'relay':'all'});
 for(const track of state.local.getTracks())pc.addTrack(track,state.local);
 pc.ontrack=e=>{if(peer.pc!==pc)return;const stream=e.streams[0]||new MediaStream([e.track]),media=roomTile(state,peer).querySelector('.call-tile-media');if(media.srcObject!==stream){media.srcObject=stream;void media.play().catch(()=>{})}e.track.onunmute=e.track.onmute=()=>paintRoom(state);paintRoom(state)};
 pc.onconnectionstatechange=()=>{if(callState!==state||peer.pc!==pc)return;const st=pc.connectionState;if(st==='connected'){state.ring=false;stopTone();startCallTimer(state);state.everConnected=true;limitRoomVideo(state)}else if(st==='failed'&&peer.offerer&&peer.tries<4)setTimeout(()=>{if(callState===state&&peer.pc===pc)roomOffer(state,peer)},1500);paintRoom(state)};
 return pc;
}
// Every phone sends its video to everyone, so keep each copy small.
function limitRoomVideo(state){const max=state.peers.size>2?250000:450000;for(const peer of state.peers.values())for(const sender of peer.pc?.getSenders()||[]){if(sender.track?.kind!=='video')continue;try{const p=sender.getParameters();if(!p.encodings?.length)p.encodings=[{}];p.encodings[0].maxBitrate=max;void sender.setParameters(p).catch(()=>{})}catch{}}}
async function makeRoomOffer(state,peer){
 if(callState!==state||!state.peers.has(peer.id))return;try{peer.pc?.close()}catch{}
 const pc=buildRoomPc(state,peer);peer.pc=pc;peer.tries++;
 await pc.setLocalDescription(await pc.createOffer());await waitForIce(pc,state.ice.relay?5000:2500);if(callState!==state||peer.pc!==pc)return;
 peer.offeredAt=Date.now();await api('/rooms/'+state.id+'/signal',{to:peer.id,kind:'offer',sdp:pc.localDescription.sdp}).catch(()=>{});
}
async function takeRoomSignal(state,peer,signal){
 if(callState!==state)return;
 if(signal.kind==='offer'){try{peer.pc?.close()}catch{}const pc=buildRoomPc(state,peer);peer.pc=pc;await pc.setRemoteDescription({type:'offer',sdp:signal.sdp});await pc.setLocalDescription(await pc.createAnswer());await waitForIce(pc,state.ice.relay?5000:2500);if(callState!==state||peer.pc!==pc)return;await api('/rooms/'+state.id+'/signal',{to:peer.id,kind:'answer',sdp:pc.localDescription.sdp}).catch(()=>{})}
 else if(signal.kind==='answer'&&peer.pc?.signalingState==='have-local-offer')await peer.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
}
function dropRoomPeer(state,id){const peer=state.peers.get(id);if(!peer)return;try{peer.pc?.close()}catch{}peer.pc=null;state.peers.delete(id);$('callGrid')?.querySelector('[data-peer="'+id+'"]')?.remove()}
function syncRoom(state,data){
 const mine=data.members.find(m=>m.id===me.id);if(mine)state.joinedAt=mine.joined_at;const others=data.members.filter(m=>m.id!==me.id);
 for(const [id,peer] of [...state.peers])if(!others.some(m=>m.id===id&&m.joined_at===peer.joinedAt))dropRoomPeer(state,id);
 for(const m of others)if(!state.peers.has(m.id)){const peer={id:m.id,joinedAt:m.joined_at,person:m,pc:null,tries:0,queue:Promise.resolve(),offerer:m.joined_at<state.joinedAt||m.joined_at===state.joinedAt&&m.id<me.id};state.peers.set(m.id,peer);roomTile(state,peer);if(peer.offerer)roomOffer(state,peer)}
 for(const signal of data.signals||[]){const peer=state.peers.get(signal.from_id);if(peer)peer.queue=peer.queue.then(()=>takeRoomSignal(state,peer,signal)).catch(()=>{})}
 if(others.length){state.aloneSince=0;state.everJoined=true}else if(!state.aloneSince)state.aloneSince=Date.now();
 paintRoom(state);
}
async function pollRoom(state){
 if(callState!==state||!state.id||state.polling)return;state.polling=true;
 try{const r=await api('/rooms/'+state.id);if(callState!==state)return;
  if(r.room.status!=='live'||!r.joined){closeCall(state);toast('Call ended.');if(['group','deal'].includes(chat?.kind))void refreshChat().catch(()=>{});return}
  syncRoom(state,r);
  for(const peer of state.peers.values())if(peer.offerer&&peer.pc?.signalingState==='have-local-offer'&&Date.now()-(peer.offeredAt||Date.now())>12000&&peer.tries<4)roomOffer(state,peer);
  // Nobody came (or everybody left): end after a while instead of waiting forever.
  if(state.aloneSince&&Date.now()-state.aloneSince>(state.everJoined?60000:state.chatKind==='deal'?60000:120000)){toast(state.everJoined?'Everyone left the call.':'No one joined the call.');await endCall('hangup',true);return}
  const settled=state.peers.size>0&&[...state.peers.values()].every(p=>p.pc?.connectionState==='connected'),every=settled?4000:1500;
  if(state.pollMs!==every){clearInterval(state.poll);state.pollMs=every;state.poll=setInterval(()=>void pollRoom(state),every)}
 }catch(e){if(/not found|not in this call|deal room/i.test(e.message)){closeCall(state);toast('Call ended.')}}finally{state.polling=false}
}
function showRoomScreen(state,status){
 callUi();const screen=$('callScreen');screen.classList.add('room');screen.classList.toggle('video',!!state.video);screen.classList.remove('connected');
 const icon=node('div',undefined,'call-room-icon');icon.textContent=state.chatKind==='deal'?'🤝':'👥';$('callAvatar').replaceChildren(icon);$('callName').textContent=state.title;$('callBadge').replaceChildren();setCallStatus(status);
 $('callTimer').hidden=true;$('callTimer').textContent='0:00';$('callPeople').hidden=true;$('callGrid').replaceChildren();screen.hidden=false;document.body.classList.add('call-open');
 $('callCamera').hidden=$('callFlip').hidden=!state.video;$('callMute').setAttribute('aria-pressed','false');$('callMute').innerHTML=callSvg('mic')+'<span>Mute</span>';$('callCamera').innerHTML=callSvg('video')+'<span>Camera</span>';$('callLocalVideo').classList.remove('off');
 screen.classList.remove('mini','remote-video','remote-screen','local-cam');$('callShare').hidden=true;resetSpeaker();
}
async function joinRoom(t){
 if(!requireLogin())return;if(callState)return toast('You are already on a call.');
 const state={kind:'room',chatKind:t.kind,chatId:t.id,video:!!t.video,title:t.title||(t.kind==='deal'?'Deal call':'Group call'),peers:new Map(),id:null,ring:false};callState=state;showRoomScreen(state,'Joining…');
 try{
  state.ice=await callIce();state.local=await callMedia(state.video,true);if(callState!==state)return stopMedia(state);
  const r=await api('/rooms',{kind:t.kind,id:t.id,video:state.video});if(callState!==state){void api('/rooms/'+r.room.id+'/leave',{}).catch(()=>{});return}
  state.id=r.room.id;state.title=r.title||state.title;$('callName').textContent=state.title;closeAlerts('room-'+state.id);dismissedRooms.add(state.id);
  // The call that is already running decides: no camera in a voice call.
  if(!r.room.video&&state.video){for(const track of state.local.getVideoTracks()){track.stop();state.local.removeTrack(track)}state.video=false;$('callScreen').classList.remove('video');$('callCamera').hidden=$('callFlip').hidden=true}
  else if(r.room.video&&!state.video){state.video=true;$('callScreen').classList.add('video')}
  attachLocal(state);state.joinedAt=r.members.find(m=>m.id===me.id)?.joined_at||Date.now();
  state.ring=r.members.length===1&&t.kind==='deal';if(state.ring)playTone('ringback');
  syncRoom(state,{...r,signals:[]});state.pollMs=1500;state.poll=setInterval(()=>void pollRoom(state),1500);
  if(['group','deal'].includes(chat?.kind))void refreshChat().catch(()=>{});
 }catch(e){toast(e.message);const id=state.id;closeCall(state);if(id)void api('/rooms/'+id+'/leave',{}).catch(()=>{})}
}
function startRoomCall(video){
 if(!requireLogin())return;if(callState||incomingCall)return toast('You are already on a call.');if(!['group','deal'].includes(chat?.kind))return;
 const live=liveChatCall&&liveChatCall.kind===chat.kind&&liveChatCall.id===chat.id?liveChatCall.call:null;
 return joinRoom({kind:chat.kind,id:chat.id,video:live?live.video:!!video,title:$('chatTitle').textContent});
}
// "📞 Voice call · 3 people · Join" bar in a group or deal chat while a call is running there.
function paintLiveCall(c,data){
 if(c.kind==='deal'){const open=['active','awaiting_final','disputed'].includes(data.deal?.status);$('chatCallAudio').hidden=$('chatCallVideo').hidden=!open}
 const call=['group','deal'].includes(c.kind)?data.call||null:null;liveChatCall=call?{kind:c.kind,id:c.id,call}:null;
 if(call&&$('roomBanner')?.dataset.room===call.id)hideRoomBanner();
 let bar=$('liveCallBar');if(!call||call.joined||callState?.id===call.id){if(bar)bar.hidden=true;return}
 if(!bar){bar=node('div',undefined,'live-call-bar');bar.id='liveCallBar';$('chatMessages').before(bar)}
 const faces=node('div',undefined,'live-call-faces');for(const m of call.members.slice(0,3))faces.append(avatar(m));
 bar.replaceChildren(faces,node('span',(call.video?'🎥 Video':'📞 Voice')+' call · '+call.count+(call.count===1?' person':' people'),'live-call-text'),button('Join',()=>void joinRoom({kind:c.kind,id:c.id,video:call.video,title:$('chatTitle').textContent}),'btn live-call-join'));bar.hidden=false;
}
// A group or deal call started where I am a member: the deal rings like a call, a group shows a small bar on top.
function onRoomInvite(r){
 paintAlertsCard();if(!r||!me||callState||incomingCall||dismissedRooms.has(r.id))return;
 if(r.kind==='deal')return showIncoming({...r,room:true});
 if(chat?.kind==='group'&&chat.id===r.chat_id&&!document.hidden)return;
 const bar=$('roomBanner');if(bar&&!bar.hidden&&bar.dataset.room===r.id)return;showRoomBanner(r);
}
function hideRoomBanner(){const bar=$('roomBanner');if(bar){clearTimeout(bar.timer);bar.hidden=true}}
function showRoomBanner(r){
 let bar=$('roomBanner');if(!bar){bar=node('div',undefined,'room-banner');bar.id='roomBanner';bar.setAttribute('role','alert');document.body.append(bar)}
 const who=node('div',undefined,'room-banner-who'),copy=node('div');who.append(avatar({name:r.name,picture:r.picture}));copy.append(node('strong',(r.video?'🎥 ':'📞 ')+(r.name||'Member')),node('small','Group call · '+(r.chat_name||'Group')));who.append(copy);
 bar.replaceChildren(who,button('Join',()=>{dismissedRooms.add(r.id);hideRoomBanner();void joinRoom({kind:r.kind,id:r.chat_id,video:r.video,title:r.chat_name})},'btn room-banner-join'),button('✕',()=>{dismissedRooms.add(r.id);hideRoomBanner()},'btn ghost room-banner-close'));
 bar.lastChild.setAttribute('aria-label','Ignore');bar.dataset.room=r.id;bar.hidden=false;clearTimeout(bar.timer);bar.timer=setTimeout(()=>{dismissedRooms.add(r.id);hideRoomBanner()},45000);
 try{navigator.vibrate?.([200,120,200])}catch{}playTone('ringback');setTimeout(()=>{if(!callState&&!incomingCall)stopTone()},2600);
}

// ---- Call alerts when Wize X is closed (Web Push). The alert says who is calling; tapping it opens the call. ----
Object.assign(socialGlyphs,{bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'});
const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&location.protocol==='https:';
const onIphone=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
function keyBytes(s){const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function phoneSubscription(create){const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub&&create){const {key}=await api('/push/key');sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)})}return sub}
async function enableCallAlerts(){
 if(!requireLogin())return false;
 if(!pushSupported()){toast(onIphone()?'On iPhone: tap Share → Add to Home Screen, open Wize X from the Home Screen, then turn on call alerts.':'This browser cannot show call alerts. Please use Chrome.');return false}
 const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(permission!=='granted'){toast('Call alerts are blocked. Allow notifications for Wize X in the browser settings.');paintAlertsCard();return false}
 try{const sub=await phoneSubscription(true);await api('/push/subscribe',sub.toJSON());toast('🔔 Call alerts are on for this phone.');paintAlertsCard();return true}
 catch(e){toast('Could not turn on call alerts: '+(e.message||'try again'));return false}
}
async function syncCallAlerts(){if(!me||!pushSupported()||Notification.permission!=='granted')return;try{const sub=await phoneSubscription(false);if(sub)await api('/push/subscribe',sub.toJSON())}catch{}}
async function stopCallAlertsForThisPhone(){try{if(!pushSupported())return;const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub)await api('/push/unsubscribe',{endpoint:sub.endpoint})}catch{}}
function closeAlerts(tag){try{void navigator.serviceWorker?.getRegistration().then(reg=>reg?.getNotifications({tag})).then(list=>{for(const n of list||[])n.close()}).catch(()=>{})}catch{}}
// "Turn on call alerts" card at the top of Messages, until alerts are on (hidden for 7 days with ✕).
function paintAlertsCard(){
 const inbox=$('messengerInbox');if(!inbox)return;let card=$('callAlertsCard');
 let hidden=false;try{hidden=Number(localStorage.getItem('wm_alerts_hide')||0)>Date.now()}catch{}
 const mode=!me||hidden?null:pushSupported()?(Notification.permission==='default'?'ask':Notification.permission==='denied'?'blocked':null):onIphone()?'iphone':null;
 if(!mode){if(card)card.hidden=true;return}
 if(!card){card=node('div',undefined,'call-alerts-card');card.id='callAlertsCard';(inbox.querySelector('.messenger-tabs')||inbox.firstChild)?.before(card)}
 if(card.dataset.mode===mode&&!card.hidden)return;card.dataset.mode=mode;
 const text=node('div');text.append(node('strong','🔔 Call alerts'),node('small',mode==='ask'?'Know when someone calls you, even when Wize X is closed.':mode==='blocked'?'Notifications are blocked. Allow them for Wize X in your browser settings.':'On iPhone, add Wize X to the Home Screen first, then open it from there.'));
 const close=button('✕',()=>{try{localStorage.setItem('wm_alerts_hide',String(Date.now()+7*24*HOUR_MS))}catch{}card.hidden=true},'btn ghost call-alerts-close');close.setAttribute('aria-label','Hide');
 card.replaceChildren(text,...(mode==='ask'?[button('Turn on',()=>void enableCallAlerts(),'btn call-alerts-on')]:mode==='iphone'?[button('How?',()=>showInstallGuide(),'btn call-alerts-on')]:[]),close);card.hidden=false;
}
const HOUR_MS=3600000;
// Opening Wize X from an alert: ?call=… (ringing personal call), ?room=… (group/deal call), ?thread=… (missed call → that chat).
async function openFromAlert(params){
 const callId=params.get('call'),roomId=params.get('room'),threadId=params.get('thread');if(!callId&&!roomId&&!threadId)return;
 if(location.search)history.replaceState(history.state,'',location.pathname+location.hash);if(!me)return;
 try{
  if(threadId){navigate('messages');await openChat('private',threadId);return}
  if(callId){if(incomingCall?.id===callId||callState?.id===callId)return;const {call}=await api('/calls/incoming');if(call?.id===callId)return onIncomingCall(call);navigate('messages');return toast('📞 This call has ended.')}
  if(roomId&&callState?.id!==roomId&&incomingCall?.id!==roomId){const r=await api('/rooms/'+roomId);if(r.room.status!=='live')return toast('📞 This call has ended.');if(r.joined||callState||incomingCall)return;const starter=r.members[0]||{};hideRoomBanner();showIncoming({room:true,id:r.room.id,kind:r.room.kind,chat_id:r.room.chat_id,chat_name:r.title,video:r.room.video,name:starter.name,picture:starter.picture,role:starter.role,verified:starter.verified})}
 }catch(e){toast(e.message)}
}
{let waited=0;const ready=setInterval(()=>{waited+=250;if(document.body.classList.contains('auth-pending')&&waited<10000)return;clearInterval(ready);void openFromAlert(new URLSearchParams(location.search));void syncCallAlerts();paintAlertsCard()},250)}
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='wize-open')void openFromAlert(new URL(e.data.url,location.origin).searchParams)});

// ---- Back button: every screen opened on top (photo, post, comments, profile, deal room, dialogs, chat info) gets one history step,
// so the phone's back button closes only the top screen, then the chat, then goes to the previous page. One press = one visible step. ----
const BACK_LAYERS={photoViewer:'closePhotoViewer',photoEditor:'photoEditorCancel',profileCropModal:'cancelCrop',dealStepModal:'closeDealStep',listingAdminModal:'closeListingAdmin',memberActionModal:'closeMemberActions',reportModal:'closeReport',verificationModal:'closeVerification',needDealModal:'closeNeedDeal',reviewModal:'closeReview',dealCancelModal:'closeDealCancel',directFinalModal:'closeDirectFinal',deletePostModal:'cancelDeletePost',adminSetupModal:'closeAdminSetup',accountSecurityModal:'closeAccountSecurity',profileCompletedModal:'closeProfileCompleted',profileEditModal:'closeProfileEditor',commentsModal:'closeComments',listingModal:()=>backFromListing(),profileModal:'closeProfile',friendsModal:'closeFriends',groupCreateModal:'closeGroupCreate',profileMenuModal:'closeProfileMenu',dealRoomModal:'closeDealRoom',peerInfoPanel:'closePeerInfo',groupSettingsPanel:'closeGroupSettings',groupPostComposer:'closeGroupPost',dealForm:'closeDealForm',loginModal:'closeLogin',installHelp:()=>closeInstallHelp(),priceFilterPopover:()=>setPriceFilterOpen(false),groupTools:()=>{if(!$('groupTools').hidden)$('idRangeToggle').click()},createPostMenu:()=>closeCreateMenu()};
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
new MutationObserver(rafBatch(records=>{
 backStack=backStack.filter(layerOpen);
 for(const r of records){const id=r.target.id;if(id&&id in BACK_LAYERS&&!openQueue.includes(id)&&!backStack.includes(id)&&layerOpen(id))openQueue.push(id)}
 syncHistory();
})).observe(document.body,{attributes:true,attributeFilter:['hidden'],subtree:true});
// Links to a page (#messages, #privacy) switch the page in place.
document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(!a||e.defaultPrevented)return;const t=a.getAttribute('href').slice(1);if(HISTORY_TABS.includes(t)){e.preventDefault();navigate(t)}});
window.addEventListener('popstate',e=>{
 lastPopAt=Date.now();const s=e.state,kind=hops.length&&Date.now()-hopsAt<2500?hops.shift():(hops=[],'user');
 if(kind!=='user'){syncHistory();return}
 if(incomingCall)return hop('forward');// answer or decline first
 if(callState&&!$('callScreen')?.classList.contains('mini')){minimizeCall(true);return hop('forward')}// back makes the call small; it keeps running
 backStack=backStack.filter(layerOpen);
 const at=s?.layer?backStack.indexOf(s.layer):-1;
 if(backStack.length-1>at){const top=backStack.pop();closeLayer(top);
  if(top!=='createPostMenu'&&layerOpen(top)){backStack.push(top);history.pushState(layerState(top),'');return}// it only went back one view inside (photo page → post, group info, chat info)
  if(staleEntry(s))hop('quiet');return}
 if(chatIsOpen()&&!s?.chat&&!s?.inChat){closeConversation();if(staleEntry(s))hop('quiet');return}
 if(staleEntry(s))return hop('user');
 const hashTab=location.hash.slice(1),tab=s?.tab||(HISTORY_TABS.includes(hashTab)?hashTab:null);
 if(!tab)return;
 if(tab!==active||(s?.profileId||null)!==(profileViewId||null))return navigate(tab,{fromHistory:true,profileId:s?.profileId});
 hop('user');// this step showed the same page again: go one more step back
});

// Tapping a phone notification for a deal step, a deal @mention or a notice opens the right place.
{const base=openFromAlert;openFromAlert=async function(params){const deal=params.get('deal'),notices=params.get('notices');
 if(!deal&&!notices)return base(params);if(location.search)history.replaceState(history.state,'',location.pathname+location.hash);if(!me)return;
 try{if(notices){if(typeof openNotices==='function')await openNotices();return}
  navigate('deals');await loadDeals();const {deal:d}=await api('/deals/'+deal);if(['open','admin_proposed','awaiting_admin','active','awaiting_final','disputed'].includes(d.status)&&typeof openDealRoom==='function')await openDealRoom(deal)}catch(e){toast(e.message)}}}

// Ask once (gently) to turn on phone notifications: messages, @mentions, deal steps, calls and notices.
setTimeout(()=>{try{if(!me||!('Notification' in window)||!('PushManager' in window)||Notification.permission!=='default')return;if(Number(localStorage.getItem('wm_notify_ask')||0)>Date.now())return}catch{return}
 const bar=node('div',undefined,'notify-ask');bar.append(node('span','🔔 Get notifications on your phone for messages, mentions and deals.'),button('Turn on',async()=>{bar.remove();try{await enableCallAlerts()}catch(e){toast(e.message)}},'btn'),button('Later',()=>{bar.remove();try{localStorage.setItem('wm_notify_ask',String(Date.now()+3*86400000))}catch{}},'btn ghost'));document.body.append(bar)},6000);
