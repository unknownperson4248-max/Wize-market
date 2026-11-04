import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{api,verifyGoogle,listingPrice,hasExternalContact,brandedPage,previewPage,normalizeGameUid,nameProblem,nameSkeleton,cleanAccountName,signInName,loginId} from './worker.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER,created_at INTEGER);');sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const prepare=q=>({values:[],bind(...v){this.values=v;return this},async first(){return sql.prepare(q).get(...this.values)||null},async all(){return {results:sql.prepare(q).all(...this.values)}},async run(){const r=sql.prepare(q).run(...this.values);return {meta:{changes:Number(r.changes)}}}});const db={prepare,async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};const objects=new Map();const env={DB:db,MEDIA:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length}:null}};
const hash=async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');const tokens={};for(const id of ['owner','admin','buyer','seller','outsider']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+1000000,Date.now())}sql.exec("INSERT INTO wm_roles VALUES('owner','owner'),('admin','trusted')");const legacyRules={protectedDeals:false,holdHours:24,autoConfirmHours:72,requireGameUid:false,relistCooldownHours:0,dailyPostsUnverified:1000,activePostsUnverified:1000,dailyPostsVerified:1000,activePostsVerified:5000,dailyNeedPosts:1000,dailyNormalPosts:1000,bumpHours:24,expireDays:0,hideSold:false,nameRules:false,chatWarnings:true,blockDuplicates:false};sql.prepare("INSERT INTO wm_settings(key,value) VALUES('market_rules',?)").run(JSON.stringify(legacyRules));const logoId=crypto.randomUUID();sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(logoId,'admin','image/png',16,Date.now());objects.set(logoId,new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]));
async function call(path,method='GET',data,id,origin='https://test.local'){const req=new Request('https://test.local'+path,{method,headers:{origin,'content-type':'application/json',...(id?{cookie:'wm_session='+tokens[id]}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});const res=await worker.fetch(req,env);let value;try{value=await res.json()}catch{}return {status:res.status,data:value}}
// Members can only make chat groups (no price ranges, not listed for deals); buy-sell groups are for trusted admins.
{const cg=await call('/api/groups','POST',{name:'Member chat',price:5000},'buyer');assert.equal(cg.status,201);assert.equal(cg.data.chatGroup,true);assert.equal(sql.prepare('SELECT count(*) n FROM wm_group_ranges WHERE group_id=?').get(cg.data.id).n,0)}
assert.equal((await call('/api/threads','POST',{},undefined)).status,401);
assert.equal((await call('/api/groups','POST',{name:'CSRF',price:1},'admin','https://evil.local')).status,403);
let r=await call('/api/groups','POST',{name:'ID buy sell',logoId},'admin');assert.equal(r.status,201);const group=r.data.id;const groupRanges=(await call('/api/groups/'+group,'GET',undefined,'admin')).data.ranges;const firstRange=groupRanges[0].id;await call('/api/groups/'+group+'/join','POST',{},'buyer');assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'outsider')).status,403);assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'Hello group'},'buyer')).status,201);
const post={title:'Game ID',details:'Details',price:5000,kind:'Game ID',media:[]};r=await call('/api/posts','POST',post,'seller');assert.equal(r.status,201);const postId=r.data.id;assert.equal((await call('/api/feed')).data.posts.length,0);assert.equal((await call('/api/moderation','POST',{id:postId,status:'approved'},'buyer')).status,403);assert.equal((await call('/api/moderation','POST',{id:postId,status:'approved'},'admin')).status,200);assert.equal((await call('/api/feed?q=5000')).data.posts[0].id,postId);assert.equal((await call('/api/feed')).data.posts[0].email,undefined);
r=await call('/api/posts','POST',{...post,groupId:group,rangeId:firstRange},'buyer');const groupPost=r.data.id;await call('/api/moderation','POST',{id:groupPost,status:'approved'},'admin');assert.equal((await call('/api/feed')).data.posts.length,1);assert.equal((await call('/api/feed?group='+group,'GET',undefined,'buyer')).data.posts.length,1);assert.equal((await call('/api/feed?group='+group,'GET',undefined,'outsider')).status,403);
r=await call('/api/threads','POST',{postId},'buyer');assert.equal(r.status,201);const thread=r.data.thread.id;assert.equal((await call('/api/threads/'+thread+'/messages','GET',undefined,'outsider')).status,404);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Interested'},'buyer')).status,201);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Spam'},'buyer')).status,403);assert.equal((await call('/api/threads/'+thread+'/accept','POST',{},'buyer')).status,403);assert.equal((await call('/api/threads/'+thread+'/accept','POST',{},'seller')).status,200);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Hello'},'seller')).status,201);
await call('/api/follow','POST',{userId:'seller',follow:true},'buyer');assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.followed,1);assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.email,undefined);assert.equal((await call('/api/admin/role','POST',{userId:'buyer',role:'trusted'},'admin')).status,403);
r=await call('/api/deals','POST',{threadId:thread,adminId:'buyer',price:5000,fee:50},'buyer');assert.equal(r.status,400);r=await call('/api/deals','POST',{threadId:thread,adminId:'admin',price:5000,fee:50},'buyer');assert.equal(r.status,201);const deal=r.data.id;assert.equal((await call('/api/deals/'+deal,'GET',undefined,'outsider')).status,404);assert.equal((await call('/api/deals/'+deal+'/action','POST',{action:'activate',version:0},'admin')).status,409);assert.equal((await call('/api/deals/'+deal+'/messages','GET',undefined,'buyer')).status,409);
const action=(action,version,id)=>call('/api/deals/'+deal+'/action','POST',{action,version},id);assert.equal((await action('confirm',0,'buyer')).status,200);assert.equal((await action('confirm',0,'seller')).status,409);assert.equal((await action('confirm',1,'seller')).status,200);assert.equal((await action('activate',2,'admin')).status,200);assert.equal((await call('/api/deals/'+deal+'/messages','POST',{text:'Private room'},'admin')).status,201);assert.equal((await call('/api/deals/'+deal+'/messages','GET',undefined,'outsider')).status,404);assert.equal((await action('complete',3,'buyer')).status,200);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.deals,0);assert.equal((await action('complete',4,'seller')).status,200);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.deals,0);assert.equal((await action('finalize',5,'admin')).status,200);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.deals,1);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.idDeals,1);assert.equal((await action('complete',6,'buyer')).status,409);
// Creation needs only name/logo; price ranges apply to group posts, never chat.
assert.equal((await call('/api/groups','POST',{name:'Missing logo'},'admin')).status,400);
assert.equal((await call('/api/groups','POST',{name:'Foreign logo',logoId},'owner')).status,400);
assert.equal((await call('/api/groups/'+group+'/ranges','POST',{label:'Bad admin',min:0,max:30000},'buyer')).status,403);
assert.equal((await call('/api/posts','POST',{...post,groupId:group},'buyer')).status,201);
assert.equal((await call('/api/posts','POST',{...post,price:6000,groupId:group,rangeId:firstRange},'buyer')).status,201);
assert.equal((await call('/api/feed?group='+group+'&range='+firstRange,'GET',undefined,'buyer')).data.posts.length,1);
assert.equal((await call('/api/feed?group='+group+'&range='+groupRanges[1].id,'GET',undefined,'buyer')).data.posts.length,0);
assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages[0].text,'Hello group');
r=await call('/api/groups/'+group+'/ranges','POST',{label:'৳20k–30k',min:20000,max:30000},'admin');assert.equal(r.status,200);const customRange=r.data.id;
assert.equal((await call('/api/groups/'+group+'/ranges','POST',{id:customRange,label:'৳20k–40k',min:20000,max:40000},'admin')).status,200);
assert.equal((await call('/api/groups/'+group+'/ranges','POST',{id:firstRange,label:'Too small',min:0,max:4000},'admin')).status,400);
assert.equal((await call('/api/posts','POST',{...post,kind:'Community post',price:null,groupId:group,details:'Normal group announcement'},'buyer')).status,201);
assert.equal((await worker.fetch(new Request('https://test.local/media/'+logoId),env)).status,200);
// Only approved public media is public; uploads, group media and moderation remain restricted.
const mediaId=crypto.randomUUID();const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]);objects.set(mediaId,bytes);sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(mediaId,'seller','image/png',16,Date.now());
let rr=await worker.fetch(new Request('https://test.local/media/'+mediaId),env);assert.equal(rr.status,404);
rr=await worker.fetch(new Request('https://test.local/media/'+mediaId,{headers:{cookie:'wm_session='+tokens.seller}}),env);assert.equal(rr.status,200);
rr=await worker.fetch(new Request('https://test.local/media/'+mediaId,{headers:{cookie:'wm_session='+tokens.outsider}}),env);assert.equal(rr.status,404);
assert.equal((await call('/api/posts','POST',{...post,media:[{id:mediaId}]},'outsider')).status,400);
assert.equal((await call('/api/owner/claim','POST',{token:'not-the-private-key'},'buyer')).status,403);
// Verify real RSA signatures, Google audience, expiration and nonce; never trust decoded data alone.
const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',kp.publicKey);jwk.kid='test';const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const claims={aud:'773335158244-nk231eeff13mklslfaeb8450u6645fvj.apps.googleusercontent.com',iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+600,iat:Math.floor(Date.now()/1000),email_verified:true,sub:'sample',nonce:'expected'};async function jwt(payload){const data=b64({alg:'RS256',kid:'test'})+'.'+b64(payload);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(data));return data+'.'+Buffer.from(sig).toString('base64url')}const fetchKeys=async()=>new Response(JSON.stringify({keys:[jwk]}));assert.equal((await verifyGoogle(await jwt(claims),'expected',fetchKeys)).sub,'sample');await assert.rejects(verifyGoogle(await jwt({...claims,aud:'other'}),'expected',fetchKeys));await assert.rejects(verifyGoogle(await jwt({...claims,exp:1}),'expected',fetchKeys));await assert.rejects(verifyGoogle(await jwt(claims),'wrong',fetchKeys));
assert.equal((await call('/api/auth/google','POST',{credential:'forged'})).status,401);
assert.equal((await call('/api/me')).data.user,null);
console.log('PASS: Google signature/audience/expiry/nonce, session auth, CSRF, trusted groups, membership, private chat authorization, request consent, follow, moderated feeds, private deal rooms, version conflicts and dual-party completion counts.');

const autoPost=await call('/api/posts','POST',{...post,price:6707,groupId:group},'buyer');assert.equal(autoPost.status,201);const rangeRow=sql.prepare('SELECT r.min_price,r.max_price FROM wm_posts p JOIN wm_group_ranges r ON r.id=p.range_id WHERE p.id=?').get(autoPost.data.id);assert.equal(rangeRow.min_price,5001);assert.equal(rangeRow.max_price,10000);console.log('PASS: 6707 automatically selects the 5001–10000 range.');
assert.equal((await call('/api/groups/'+group+'/preferences','POST',{muted:true},'buyer')).status,200);assert.equal((await call('/api/groups/'+group+'/preferences','GET',undefined,'buyer')).data.muted,true);assert.equal((await call('/api/groups/'+group+'/preferences','GET',undefined,'admin')).data.muted,false);assert.equal((await call('/api/groups/'+group+'/preferences','GET',undefined,'outsider')).status,403);console.log('PASS: group mute preferences persist per member and reject outsiders.');
// A member can read a shared group photo; unrelated users cannot. R2 may set range on a full response.
await call('/api/groups/'+group+'/join','POST',{},'seller');
await call('/api/groups/'+group+'/messages','POST',{text:'media:image/png:/media/'+mediaId},'seller');
const mediaRequest=id=>new Request('https://test.local/media/'+mediaId,{headers:{cookie:'wm_session='+tokens[id]}});
rr=await worker.fetch(mediaRequest('buyer'),env);assert.equal(rr.status,200);assert.equal(rr.headers.get('content-type'),'image/png');assert.equal((await rr.arrayBuffer()).byteLength,16);
assert.equal((await worker.fetch(mediaRequest('outsider'),env)).status,404);
const r2get=env.MEDIA.get;env.MEDIA.get=async k=>{const o=await r2get(k);return o?{...o,range:{offset:0,length:o.size}}:null};
rr=await worker.fetch(mediaRequest('buyer'),env);assert.equal(rr.status,200);assert.equal(rr.headers.get('content-range'),null);env.MEDIA.get=r2get;
// Even the website owner and other trusted admins cannot read somebody else's personal conversation.
for(const id of ['owner','admin','outsider']){assert.equal((await call('/api/threads/'+thread+'/messages','GET',undefined,id)).status,404);assert.equal((await call('/api/threads','GET',undefined,id)).data.threads.length,0);}
assert.equal((await call('/api/admin/overview')).status,401);assert.equal((await call('/api/admin/overview','GET',undefined,'buyer')).status,403);assert.equal((await call('/api/admin/overview','GET',undefined,'admin')).data.stats.Groups,1);
assert.equal((await call('/api/admin/users','GET',undefined,'admin')).status,403);const adminPeople=await call('/api/admin/users?q=buyer','GET',undefined,'owner');assert.equal(adminPeople.data.users.length,1);assert.equal(adminPeople.data.users[0].email,'buyer@example.com');
assert.equal((await call('/api/admin/settings','POST',{name:'Test Market',welcome:'Welcome players'},'admin')).status,403);assert.equal((await call('/api/admin/settings','POST',{name:'Test Market',welcome:'Welcome players'},'owner')).status,200);assert.deepEqual((await call('/api/site')).data,{name:'Test Market',welcome:'Welcome players'});
assert.equal((await call('/api/admin/role','POST',{userId:'owner',role:'trusted'},'admin')).status,403);assert.equal((await call('/api/admin/role','POST',{userId:'outsider',role:'trusted'},'owner')).status,200);assert.equal((await call('/api/admin/role','POST',{userId:'owner',role:'trusted'},'outsider')).status,403);
console.log('PASS: authenticated R2 group images, full response status, private chats hidden from owner/admin/outsiders, admin role boundaries and persistent website settings.');
// Usernames are case-insensitive and unique at the database boundary; shared links resolve the same profile.
assert.equal((await call('/api/profile/settings','POST',{username:'Rahat_Test'},'buyer')).data.username,'rahat_test');
assert.equal((await call('/api/profile/settings','POST',{username:'RAHAT_TEST'},'seller')).status,409);
assert.equal((await call('/api/profile/settings','POST',{username:'admin'},'seller')).status,400);
assert.equal((await call('/api/people/rahat_test','GET',undefined,'buyer')).data.userId,'buyer');assert.equal((await call('/api/profile/buyer','GET',undefined,'buyer')).data.profile.username,'rahat_test');assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.username,'rahat_test');
assert.equal((await call('/api/feed?q=rahat_test')).data.profiles[0].id,'buyer');
sql.prepare('UPDATE wm_profiles SET updated_at=? WHERE user_id=?').run(Date.now()-8*86400000,'buyer');assert.equal((await call('/api/profile/settings','POST',{username:'new_rahat'},'buyer')).status,200);assert.equal((await call('/api/people/rahat_test','GET',undefined,'buyer')).status,404);
// A safe post goes straight to the public feed. Unsafe/uncertain/error cases stay out.
const safeAI={run:async()=>({response:{decision:'safe',confidence:.99,category:'none'}})};env.AI=safeAI;
let directPost=await call('/api/posts','POST',{...post,title:'Instant publication'},'seller');assert.equal(directPost.data.status,'approved');assert.ok((await call('/api/feed')).data.posts.some(p=>p.id===directPost.data.id));
env.AI={run:async()=>({response:'{"decision":"unsafe","confidence":0.99,"category":"explicit_sexual"}'})};
const beforeSuspension=Date.now();const blockedPost=await call('/api/posts','POST',{...post,title:'Safety fixture'},'buyer');assert.equal(blockedPost.data.status,'rejected');assert.ok(blockedPost.data.suspendedUntil>=beforeSuspension+10800000);assert.equal((await call('/api/posts','POST',post,'buyer')).status,423);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'blocked'},'buyer')).status,423);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.suspension.reason,'Explicit sexual content is not allowed');assert.ok(!(await call('/api/feed')).data.posts.some(p=>p.id===blockedPost.data.id));
assert.equal((await call('/api/safety/appeal','POST',{},'buyer')).status,200);sql.prepare('UPDATE wm_suspensions SET until_at=? WHERE user_id=?').run(Date.now()-1,'buyer');env.AI=safeAI;assert.equal((await call('/api/posts','POST',{...post,title:'After expiry'},'buyer')).data.status,'approved');
env.AI={run:async()=>({response:{decision:'unsafe',confidence:.7,category:'explicit_sexual'}})};assert.equal((await call('/api/posts','POST',post,'seller')).data.status,'pending');assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.suspension,null);
env.AI={run:async()=>{throw Error('Scanner offline')}};assert.equal((await call('/api/posts','POST',post,'seller')).data.status,'pending');assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.suspension,null);env.AI=safeAI;
// Standalone admin credentials and sessions are separate from normal Google sessions.
const adminLogin={username:'control_owner',password:'Test-only!LongRandomPassword83'};
assert.equal((await call('/api/admin/setup','POST',adminLogin,'seller')).status,403);assert.equal((await call('/api/admin/setup','POST',adminLogin,'owner')).status,200);
assert.equal((await call('/api/control/overview','GET',undefined,'owner')).status,401);assert.equal((await call('/api/control/login','POST',{...adminLogin,password:'wrong'})).status,401);
let controlResponse=await worker.fetch(new Request('https://test.local/api/control/login',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json'},body:JSON.stringify(adminLogin)}),env);assert.equal(controlResponse.status,200);const adminCookie=controlResponse.headers.get('set-cookie').split(';')[0];
async function control(path,data){return worker.fetch(new Request('https://test.local/api/control/'+path,{method:data?'POST':'GET',headers:{origin:'https://test.local',cookie:adminCookie,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env)}
assert.equal((await control('overview')).status,200);assert.equal((await control('posts?view=published')).status,200);assert.equal((await control('groups')).status,200);assert.equal((await control('groups/'+group+'/join',{})).status,200);assert.equal((await control('groups/'+group+'/settings',{name:'Edited from independent control room'})).status,200);
assert.equal((await control('setup',{...adminLogin,password:'Replacement!Password999'})).status,403);
assert.equal((await control('setup',{...adminLogin,currentPassword:adminLogin.password,password:'Replacement!Password999'})).status,200);assert.equal((await control('overview')).status,401);
console.log('PASS: unique usernames and share resolution, instant safe posts, safety quarantine, 3-hour suspension/automatic expiry, scanner failure without punishment, independent admin password sessions and revocation.');
// Google owner recovery creates an independent admin session without changing saved credentials.
const existingCredentials=sql.prepare("SELECT value FROM wm_settings WHERE key='admin_credentials'").get().value;
assert.equal((await call('/api/control/owner-access','POST',{})).status,401);
assert.equal((await call('/api/control/owner-access','POST',{},'buyer')).status,403);
let ownerEntry=await worker.fetch(new Request('https://test.local/api/control/owner-access',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json',cookie:'wm_session='+tokens.owner},body:'{}'}),env);assert.equal(ownerEntry.status,200);const recoveredCookie=ownerEntry.headers.get('set-cookie').split(';')[0];
const ownerSession=await worker.fetch(new Request('https://test.local/api/control/session',{headers:{cookie:recoveredCookie}}),env);assert.equal((await ownerSession.json()).user.role,'owner');assert.equal(sql.prepare("SELECT value FROM wm_settings WHERE key='admin_credentials'").get().value,existingCredentials);
assert.equal((await call('/api/control/session')).data.adminId,undefined);assert.equal((await call('/api/control/session','GET',undefined,'owner')).data.adminId,adminLogin.username);
// Resetting a forgotten admin password requires a recent verified owner Google session.
sql.prepare('UPDATE sessions SET created_at=? WHERE user_id=?').run(Date.now()-660000,'owner');const recovery={username:'recovered_owner',password:'Recovered!LongPassword97',recover:true};assert.equal((await call('/api/admin/setup','POST',recovery,'owner')).status,403);assert.equal((await call('/api/admin/setup','POST',recovery,'buyer')).status,403);
sql.prepare('UPDATE sessions SET created_at=? WHERE user_id=?').run(Date.now(),'owner');assert.equal((await call('/api/admin/setup','POST',recovery,'owner')).status,200);assert.equal((await call('/api/control/login','POST',recovery)).status,200);
console.log('PASS: owner-only Google admin entry, private admin ID visibility, fresh-login password recovery, and rejection of non-owner/stale-session resets.');
// Home includes public posts and the viewer's joined-group posts, without leaking to outsiders.
sql.exec('DELETE FROM wm_limits');env.AI=safeAI;
let memberHome=(await call('/api/feed','GET',undefined,'buyer')).data.posts;assert.ok(memberHome.some(p=>p.id===groupPost));assert.ok(!(await call('/api/feed','GET',undefined,'outsider')).data.posts.some(p=>p.id===groupPost));
// Edits are owner-only, versioned, safety-checked, and keep the group/range scope.
let editing=(await call('/api/posts/'+directPost.data.id,'GET',undefined,'seller')).data.post;
assert.equal((await call('/api/posts/'+editing.id,'GET',undefined,'buyer')).status,404);
assert.equal((await call('/api/posts/'+editing.id+'/edit','POST',{...post,title:'Edited listing',version:editing.version},'buyer')).status,404);
assert.equal((await call('/api/posts/'+editing.id+'/edit','POST',{...post,title:'Edited listing',version:editing.version},'seller')).status,200);
assert.equal((await call('/api/posts/'+editing.id+'/edit','POST',{...post,title:'Stale edit',version:editing.version},'seller')).status,409);
assert.equal((await call('/api/feed?q=Edited%20listing')).data.posts[0].title,'Edited listing');
editing=(await call('/api/posts/'+editing.id,'GET',undefined,'seller')).data.post;
assert.equal((await call('/api/posts/'+editing.id+'/delete','POST',{version:editing.version},'buyer')).status,404);
assert.equal((await call('/api/posts/'+editing.id+'/delete','POST',{version:editing.version},'seller')).status,200);
assert.ok(!(await call('/api/feed')).data.posts.some(p=>p.id===editing.id));assert.ok(!(await call('/api/my-posts','GET',undefined,'seller')).data.posts.some(p=>p.id===editing.id));assert.ok(sql.prepare('SELECT deleted_at FROM wm_posts WHERE id=?').get(editing.id).deleted_at);
// Fifty owned, checked images are accepted in order; empty photo posts, 51 photos and foreign assets are rejected.
const fifty=[];for(let i=0;i<51;i++){const id=crypto.randomUUID();objects.set(id,bytes);sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(id,'seller','image/png',16,Date.now());sql.prepare('INSERT INTO wm_media_checks VALUES(?,?,?,?)').run(id,'safe','Test scanner passed',Date.now());fifty.push({id})}
let album=await call('/api/posts','POST',{...post,title:'Fifty image album',media:fifty.slice(0,50),mediaMode:'photos'},'seller');assert.equal(album.status,201);assert.equal(album.data.status,'approved');const savedAlbum=(await call('/api/posts/'+album.data.id,'GET',undefined,'seller')).data.post;assert.equal(savedAlbum.media.length,50);assert.deepEqual(savedAlbum.media.map(a=>a.id),fifty.slice(0,50).map(a=>a.id));
assert.equal((await call('/api/posts','POST',{...post,media:fifty,mediaMode:'photos'},'seller')).status,400);assert.equal((await call('/api/posts','POST',{...post,media:[],mediaMode:'photos'},'seller')).status,400);assert.equal((await call('/api/posts','POST',{...post,media:[fifty[0]],mediaMode:'photos'},'buyer')).status,400);
// Custom profile data survives independently of Google's stored identity and appears on old posts too.
assert.equal((await call('/api/profile/details','POST',{name:'Rahat Custom',bio:'Gaming, trading & community',pictureId:mediaId},'seller')).status,200);const ownProfile=(await call('/api/me','GET',undefined,'seller')).data.user;assert.equal(ownProfile.name,'Rahat Custom');assert.equal(ownProfile.bio,'Gaming, trading & community');assert.ok(ownProfile.picture.startsWith('/avatar/seller'));
assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.name,'Rahat Custom');assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].name,'Rahat Custom');assert.equal((await worker.fetch(new Request('https://test.local/avatar/seller'),env)).status,200);
assert.equal((await call('/api/profile/details','POST',{name:'bad',bio:'x',pictureId:mediaId},'buyer')).status,400);assert.equal((await call('/api/profile/details','POST',{name:'bad',bio:'x'.repeat(501)},'seller')).status,400);
// Removing a listing preserves thread/deal history and denies new listing-based conversations.
const listingVersion=sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(postId).version;assert.equal((await call('/api/posts/'+postId+'/delete','POST',{version:listingVersion},'seller')).status,200);assert.equal((await call('/api/deals/'+deal,'GET',undefined,'buyer')).status,200);assert.equal((await call('/api/threads','POST',{postId},'outsider')).status,404);
console.log('PASS: member Home group visibility, owner edit/delete and stale-edit conflicts, 1–50 photos with ownership/order limits, public custom profiles/avatars, and preserved deal history after removal.');
// Saved posts belong only to the authenticated viewer, and group membership is checked on save and read.
sql.exec('DELETE FROM wm_limits');env.AI=safeAI;
assert.equal((await call('/api/saved')).status,401);assert.equal((await call('/api/saved','POST',{postId:album.data.id,save:true},'buyer')).status,200);assert.equal((await call('/api/saved','GET',undefined,'buyer')).data.posts[0].id,album.data.id);assert.equal((await call('/api/saved?userId=buyer','GET',undefined,'outsider')).data.posts.length,0);assert.equal((await call('/api/profile/buyer','GET',undefined,'buyer')).data.saved,undefined);assert.equal((await call('/api/saved','POST',{postId:groupPost,save:true},'outsider')).status,403);
assert.equal((await call('/api/saved','POST',{postId:groupPost,save:true},'buyer')).status,200);sql.prepare('DELETE FROM wm_group_members WHERE group_id=? AND user_id=?').run(group,'buyer');assert.ok(!(await call('/api/saved','GET',undefined,'buyer')).data.posts.some(p=>p.id===groupPost));await call('/api/groups/'+group+'/join','POST',{},'buyer');
// Likes are idempotent; comments are scoped to the visible post and derive real counts.
assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+album.data.id+'/comments','POST',{text:'Looks great!'},'buyer')).status,201);assert.equal((await call('/api/posts/'+groupPost+'/comments','GET',undefined,'outsider')).status,403);const decorated=(await call('/api/feed?q=Fifty%20image%20album','GET',undefined,'buyer')).data.posts[0];assert.equal(decorated.saved,true);assert.equal(decorated.liked,true);assert.equal(decorated.like_count,1);assert.equal(decorated.comment_count,1);assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:false},'buyer')).data.count,0);assert.equal((await call('/api/saved','POST',{postId:album.data.id,save:false},'buyer')).status,200);
// Reviews require a completed deal and the reviewer must be one of its two parties.
assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:5,comment:'Smooth completed trade'},'outsider')).status,403);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:6,comment:'Invalid rating'},'buyer')).status,400);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:5,comment:'Smooth completed trade'},'buyer')).status,200);const publicReviews=(await call('/api/profile/seller/reviews','GET',undefined,'buyer')).data;assert.equal(publicReviews.summary.count,1);assert.equal(publicReviews.reviews[0].rating,5);assert.equal(publicReviews.reviews[0].price,undefined);assert.equal(publicReviews.reviews[0].email,undefined);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:4,comment:'Updated experience'},'buyer')).status,200);assert.equal((await call('/api/profile/seller/reviews','GET',undefined,'buyer')).data.summary.count,1);
// Shared post links enforce the same group visibility; group listings can start a private deal conversation.
assert.equal((await call('/api/listing/'+album.data.id)).status,200);assert.equal((await call('/api/listing/'+groupPost)).status,401);assert.equal((await call('/api/listing/'+groupPost,'GET',undefined,'outsider')).status,403);assert.equal((await call('/api/listing/'+groupPost,'GET',undefined,'buyer')).status,200);assert.equal((await call('/api/threads','POST',{postId:groupPost},'seller')).status,200);
console.log('PASS: private Saved ownership and group access, real idempotent likes/comments, verified completed-deal public reviews, and scoped shared listings/group deal contact.');
// Blue verification is a distinct owner-managed permission, never inherited from admin access.
sql.exec('DELETE FROM wm_limits');
assert.equal((await call('/api/profile/owner','GET',undefined,'buyer')).data.profile.verified,1);
assert.equal((await call('/api/profile/admin','GET',undefined,'buyer')).data.profile.verified,0);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true})).status,401);
for(const id of ['admin','buyer','seller'])assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true},id)).status,403);
assert.equal((await call('/api/admin/verification','POST',{userId:'missing',verified:true},'owner')).status,404);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:'yes'},'owner')).status,400);
assert.equal((await call('/api/admin/verification','POST',{userId:'owner',verified:false},'owner')).status,403);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true},'owner')).status,200);
assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.verified,1);
assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.verified,1);
assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.role,'member');
assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].verified,1);
assert.equal((await call('/api/admin/verification','POST',{userId:'buyer',verified:true},'seller')).status,403);
assert.equal((await call('/api/admin/role','POST',{userId:'seller',role:'trusted'},'owner')).status,200);
assert.equal((await call('/api/admin/role','POST',{userId:'seller',role:'member'},'owner')).status,200);
assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.verified,1);
// The separate control-room session uses the same owner authorization; Google sessions alone cannot use it.
assert.equal((await call('/api/control/verification','POST',{userId:'seller',verified:false},'owner')).status,401);
const badgeEntry=await call('/api/control/owner-access','POST',{},'owner');assert.equal(badgeEntry.status,200);
const badgeLogin=await worker.fetch(new Request('https://test.local/api/control/owner-access',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens.owner},body:'{}'}),env);
const badgeCookie=badgeLogin.headers.get('set-cookie').split(';')[0];
const badgeRevoke=await worker.fetch(new Request('https://test.local/api/control/verification',{method:'POST',headers:{origin:'https://test.local',cookie:badgeCookie,'content-type':'application/json'},body:JSON.stringify({userId:'seller',verified:false})}),env);assert.equal(badgeRevoke.status,200);
assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.verified,0);assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].verified,0);
assert.equal(sql.prepare('SELECT count(*) n FROM wm_verifications').get().n,0);
console.log('PASS: owner-only blue verification grant/revoke, separate control-room auth, no automatic trusted badge, no role escalation, protected owner badge, and live profile/feed badge state.');
// Inbox requests are incoming only; peer cards expose public identity without leaking chats/emails.
sql.exec('DELETE FROM wm_limits');
const freshRequest=await call('/api/threads','POST',{userId:'buyer'},'outsider');assert.equal(freshRequest.status,201);const requestId=freshRequest.data.thread.id;
assert.ok(!(await call('/api/threads?section=requests','GET',undefined,'buyer')).data.threads.some(t=>t.id===requestId));
assert.equal((await call('/api/threads/'+requestId+'/messages','POST',{text:'Interested in your ID'},'outsider')).status,201);
const requestInbox=(await call('/api/threads?section=requests','GET',undefined,'buyer')).data.threads;
assert.ok(requestInbox.some(t=>t.id===requestId&&t.last_text==='Interested in your ID'));
assert.ok(!(await call('/api/threads?section=requests','GET',undefined,'outsider')).data.threads.some(t=>t.id===requestId));
assert.ok(!(await call('/api/threads?section=chats','GET',undefined,'buyer')).data.threads.some(t=>t.id===requestId));
assert.ok((await call('/api/threads?section=chats','GET',undefined,'outsider')).data.threads.some(t=>t.id===requestId));
const peerCard=(await call('/api/threads/'+requestId+'/messages','GET',undefined,'outsider')).data.peer;assert.equal(peerCard.id,'buyer');assert.equal(peerCard.email,undefined);assert.ok('picture' in peerCard);assert.ok('bio' in peerCard);
assert.equal((await call('/api/threads/'+requestId+'/messages','GET',undefined,'owner')).status,404);
assert.ok(!(await call('/api/threads?section=requests','GET',undefined,'seller')).data.threads.some(t=>t.id===requestId));
assert.equal((await call('/api/threads/'+requestId+'/accept','POST',{},'buyer')).status,200);
assert.ok(!(await call('/api/threads?section=requests','GET',undefined,'buyer')).data.threads.some(t=>t.id===requestId));
assert.ok((await call('/api/threads?section=chats','GET',undefined,'buyer')).data.threads.some(t=>t.id===requestId));
assert.equal((await call('/api/threads?section=invalid','GET',undefined,'buyer')).status,400);
// Public group discovery reveals no message preview until membership is established.
const ownerGroup=(await call('/api/groups','GET',undefined,'admin')).data.groups.find(g=>g.id===group);assert.ok(ownerGroup.last_text);
const unjoinedGroup=(await call('/api/groups','GET',undefined,'seller')).data.groups.find(g=>g.id===group);sql.prepare('DELETE FROM wm_group_members WHERE group_id=? AND user_id=?').run(group,'seller');
assert.equal((await call('/api/groups','GET',undefined,'seller')).data.groups.find(g=>g.id===group).last_text,null);
assert.equal((await call('/api/groups')).data.groups.find(g=>g.id===group).last_text,null);
console.log('PASS: incoming request filtering, accepted chats move to inbox, public peer identity/photo without email, private preview isolation, and group previews restricted to members.');
// Listing prices normalize full, k and Bengali input; game/category filters remain numeric and scoped.
sql.exec('DELETE FROM wm_limits');env.AI=safeAI;
for(const [value,expected]of [['100k',100000],['100000',100000],['৳1,00,000',100000],['১.০০৫k',1005],['6.707k',6707],['0.001K',1]])assert.equal(listingPrice(value),expected);
for(const invalid of ['NaN','1e5','-5','2kk','Infinity','100000001','1.0001k','0x10'])assert.throws(()=>listingPrice(invalid));
const marketDraft={title:'PUBG ID ready',details:'Rare items and account details. Contact through Message Seller.',kind:'Game ID',price:'100k',gameCategory:'pubg-mobile',priceFormat:'compact',media:[],mediaMode:'text'};
const multiGame=await call('/api/posts','POST',marketDraft,'seller');assert.equal(multiGame.status,201);assert.equal(multiGame.data.status,'approved');const multiId=multiGame.data.id;
const storedMarket=sql.prepare('SELECT * FROM wm_posts WHERE id=?').get(multiId);assert.equal(storedMarket.price,100000);assert.equal(storedMarket.price_format,'compact');assert.equal(storedMarket.game_category,'pubg-mobile');
assert.ok((await call('/api/feed?category=pubg-mobile&min=99k&max=100k')).data.posts.some(p=>p.id===multiId));assert.ok(!(await call('/api/feed?category=free-fire')).data.posts.some(p=>p.id===multiId));assert.ok((await call('/api/feed?q=100k')).data.posts.some(p=>p.id===multiId));
assert.equal((await call('/api/feed?min=100k&max=5k')).status,400);assert.equal((await call('/api/feed?category=not-a-game')).status,400);assert.equal((await call('/api/posts','POST',{...marketDraft,gameCategory:'bad'},'seller')).status,400);
const editedMarket=await call('/api/posts/'+multiId+'/edit','POST',{...marketDraft,price:'80k',priceFormat:'full',gameCategory:'cod-mobile',version:0},'seller');assert.equal(editedMarket.status,200);assert.equal(sql.prepare('SELECT price FROM wm_posts WHERE id=?').get(multiId).price,80000);assert.ok((await call('/api/feed?category=cod-mobile&sort=price-high')).data.posts.some(p=>p.id===multiId));
// Contact instructions go pending even when content is safe, without suspending the author.
for(const content of ['WhatsApp me','wa.me/8801712345678','Call me: +880 1712-345678','যোগাযোগ ০১৭১২৩৪৫৬৭৮','hello@example.com'])assert.equal(hasExternalContact(content),true);
assert.equal(hasExternalContact('UID 1234567890, level 80, price 100k'),false);
const contactListing=await call('/api/posts','POST',{...marketDraft,title:'External contact listing',details:'WhatsApp: 01712345678'},'seller');assert.equal(contactListing.data.status,'pending');assert.equal(contactListing.data.suspendedUntil,null);assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.suspension,null);assert.ok(!(await call('/api/feed?q=External%20contact')).data.posts.some(p=>p.id===contactListing.data.id));
assert.ok((await call('/api/admin/posts','GET',undefined,'owner')).data.posts.some(p=>p.id===contactListing.data.id&&p.moderation_reason.includes('External contact')));
// Unique authenticated views and idempotent shares use the original post's visibility rules.
assert.equal((await call('/api/posts/'+multiId+'/view','POST',{})).status,410);

assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:true},'buyer')).data.count,1);
const sharedMarket=(await call('/api/feed?category=cod-mobile','GET',undefined,'buyer')).data.posts;assert.ok(sharedMarket.some(p=>p.id===multiId&&p.shared_by_id==='buyer'&&p.reshared));assert.equal(sharedMarket.filter(p=>p.id===multiId).length,2);
assert.ok((await call('/api/profile/buyer','GET',undefined,'buyer')).data.posts.some(p=>p.id===multiId&&p.shared_by_id==='buyer'));assert.ok((await call('/api/my-posts','GET',undefined,'buyer')).data.posts.some(p=>p.id===multiId&&p.shared_by_id==='buyer'));
assert.equal((await call('/api/posts/'+groupPost+'/share','POST',{share:true},'outsider')).status,403);assert.equal((await call('/api/posts/'+groupPost+'/share','POST',{share:true},'buyer')).status,200);assert.ok(!(await call('/api/feed','GET',undefined,'outsider')).data.posts.some(p=>p.id===groupPost));assert.ok(!(await call('/api/profile/buyer','GET',undefined,'buyer')).data.posts.some(p=>p.id===groupPost));
// Private reports are owner-only, deduplicate open reports and can restrict content without deleting deals.
const reportBody={postId:multiId,reason:'scam',details:'Please check this suspicious listing'};assert.equal((await call('/api/reports','POST',reportBody,'buyer')).status,201);assert.equal((await call('/api/reports','POST',reportBody,'buyer')).status,201);assert.equal(sql.prepare('SELECT count(*) n FROM wm_reports WHERE post_id=?').get(multiId).n,1);
assert.equal((await call('/api/reports','POST',{postId:groupPost,reason:'other',details:'Test'},'outsider')).status,403);assert.equal((await call('/api/admin/reports','GET',undefined,'admin')).status,403);assert.equal((await call('/api/admin/reports','GET',undefined,'buyer')).status,403);
const reportData=(await call('/api/admin/reports','GET',undefined,'owner')).data.reports[0];assert.equal(reportData.post_id,multiId);assert.equal(reportData.reporter_name,'buyer');
assert.equal((await call('/api/admin/report-action','POST',{reportId:reportData.id,action:'restrict'},'owner')).status,200);assert.equal((await call('/api/listing/'+multiId)).status,404);assert.ok(!(await call('/api/my-posts','GET',undefined,'buyer')).data.posts.some(p=>p.id===multiId));assert.ok(sql.prepare('SELECT * FROM wm_posts WHERE id=?').get(multiId));
assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:false},'buyer')).status,200);assert.equal((await call('/api/reports','POST',{reason:'other',details:'Website layout issue'},'buyer')).status,201);
// Seller/blue badges remain separate from privileged admin roles; only owner can edit access.
const badgeSettings={userId:'buyer',verified:true,trustedSeller:true,role:'member'};for(const id of ['buyer','admin','seller'])assert.equal((await call('/api/admin/member-access','POST',badgeSettings,id)).status,403);
assert.equal((await call('/api/admin/member-access','POST',badgeSettings,'owner')).status,200);const buyerBadges=(await call('/api/me','GET',undefined,'buyer')).data.user;assert.equal(buyerBadges.role,'member');assert.equal(buyerBadges.verified,1);assert.equal(buyerBadges.trusted_seller,1);assert.equal((await call('/api/groups','POST',{name:'Badge alone is not access'},'buyer')).data.chatGroup,true);// a badge alone still only makes a chat group
assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,userId:'owner',role:'member'},'owner')).status,403);assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,role:'owner'},'owner')).status,403);
assert.ok((await call('/api/admin/users?q=Rahat','GET',undefined,'owner')).data.users.some(u=>u.name==='Rahat Custom'));assert.equal((await call('/api/admin/users?q=Rahat','GET',undefined,'owner')).data.users[0].email,'buyer@example.com');
assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,verified:false,trustedSeller:false},'owner')).status,200);assert.equal((await call('/api/profile/buyer','GET',undefined,'buyer')).data.profile.trusted_seller,0);
console.log('PASS: full/k/Bengali prices, multi-game filtering/editing, contact details pending without suspension, unique views, scoped/idempotent reposts and profile shares, private owner reports/restrictions, searchable members, and owner-only seller/blue badges without role escalation.');
// Friend requests require recipient consent and expose only the viewer's own requests.
sql.exec('DELETE FROM wm_limits');
assert.equal((await call('/api/friends')).status,401);assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'buyer')).status,400);
assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'seller')).data.state,'outgoing');assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'seller')).data.state,'outgoing');
assert.ok((await call('/api/friends','GET',undefined,'buyer')).data.incoming.some(p=>p.id==='seller'));assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.friend_state,'incoming');assert.equal((await call('/api/profile/buyer','GET',undefined,'seller')).data.profile.friend_state,'outgoing');assert.equal((await call('/api/friends','GET',undefined,'owner')).data.incoming.length,0);
assert.equal((await call('/api/friends/respond','POST',{userId:'seller',accept:true},'outsider')).status,404);assert.equal((await call('/api/friends/request','POST',{userId:'seller'},'buyer')).status,409);
assert.equal((await call('/api/friends/respond','POST',{userId:'seller',accept:true},'buyer')).data.state,'friends');assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.friend_state,'friends');assert.ok((await call('/api/friends','GET',undefined,'buyer')).data.friends.some(p=>p.id==='seller'));
assert.equal((await call('/api/friends/request','POST',{userId:'outsider'},'buyer')).status,200);assert.equal((await call('/api/friends/cancel','POST',{userId:'outsider'},'buyer')).data.state,'none');assert.ok(!(await call('/api/friends','GET',undefined,'outsider')).data.incoming.some(p=>p.id==='buyer'));
assert.ok((await call('/api/feed?q=Rahat','GET',undefined,'buyer')).data.profiles.some(p=>p.id==='seller'&&p.friend_state==='friends'));assert.equal((await call('/api/profile/outsider','GET',undefined,'buyer')).data.profile.picture,'/assets/default-avatar.svg');
// Delete/restore are restricted to the sender (plus a group's own manager); payload/media disappear.
const deleteThread=(await call('/api/threads','POST',{userId:'buyer'},'seller')).data.thread;sql.prepare("UPDATE wm_threads SET status='accepted' WHERE id=?").run(deleteThread.id);
const secretUpload=crypto.randomUUID();sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(secretUpload,'seller','image/png',16,Date.now());objects.set(secretUpload,new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]));
await call('/api/threads/'+deleteThread.id+'/messages','POST',{text:'media:image/png:/media/'+secretUpload},'seller');let msgs=(await call('/api/threads/'+deleteThread.id+'/messages','GET',undefined,'buyer')).data.messages;const messageId=msgs[0].id;
const polishMediaRequest=()=>worker.fetch(new Request('https://test.local/media/'+secretUpload,{headers:{cookie:'wm_session='+tokens.buyer}}),env);assert.equal((await polishMediaRequest()).status,200);
assert.equal((await call('/api/threads/'+deleteThread.id+'/messages/'+messageId+'/delete','POST',{},'buyer')).status,404);assert.equal((await call('/api/threads/'+deleteThread.id+'/messages/'+messageId+'/delete','POST',{},'owner')).status,404);
assert.equal((await call('/api/threads/'+deleteThread.id+'/messages/'+messageId+'/delete','POST',{},'seller')).status,200);assert.equal((await call('/api/threads/'+deleteThread.id+'/messages','GET',undefined,'buyer')).data.messages[0].text,'Message removed');assert.equal((await polishMediaRequest()).status,404);
assert.equal((await call('/api/threads/'+deleteThread.id+'/messages/'+messageId+'/restore','POST',{},'seller')).status,200);assert.equal((await polishMediaRequest()).status,200);
await call('/api/groups/'+group+'/join','POST',{},'buyer');await call('/api/groups/'+group+'/messages','POST',{text:'Group delete test'},'buyer');const groupMessageId=(await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages[0].id;
assert.equal((await call('/api/groups/'+group+'/messages/'+groupMessageId+'/delete','POST',{},'outsider')).status,403);assert.equal((await call('/api/groups/'+group+'/messages/'+groupMessageId+'/delete','POST',{},'admin')).status,200);
// Inbox deletion is personal and reappears on a new message. Public discovery remains available.
assert.equal((await call('/api/chats/hide','POST',{kind:'private',id:deleteThread.id},'outsider')).status,404);assert.equal((await call('/api/chats/hide','POST',{kind:'private',id:deleteThread.id},'buyer')).status,200);assert.ok(!(await call('/api/threads','GET',undefined,'buyer')).data.threads.some(t=>t.id===deleteThread.id));assert.ok((await call('/api/threads','GET',undefined,'seller')).data.threads.some(t=>t.id===deleteThread.id));await call('/api/threads/'+deleteThread.id+'/messages','POST',{text:'New message after hide'},'seller');assert.ok((await call('/api/threads','GET',undefined,'buyer')).data.threads.some(t=>t.id===deleteThread.id));
assert.equal((await call('/api/chats/hide','POST',{kind:'group',id:group},'buyer')).status,200);assert.equal((await call('/api/groups','GET',undefined,'buyer')).data.groups.find(g=>g.id===group).chat_archived,1);assert.ok((await call('/api/groups','GET',undefined,'outsider')).data.groups.some(g=>g.id===group));
// Owner can archive and recover chat history without opening other people's private messages.
assert.equal((await call('/api/admin/chat-history','POST',{action:'archive'},'admin')).status,403);assert.equal((await call('/api/admin/chat-history','POST',{action:'archive'},'owner')).status,200);assert.equal((await call('/api/threads/'+deleteThread.id+'/messages','GET',undefined,'buyer')).data.messages.length,0);assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages.length,0);assert.equal((await polishMediaRequest()).status,404);assert.ok((await call('/api/admin/chat-history','GET',undefined,'owner')).data.archived>0);assert.equal((await call('/api/admin/chat-history','POST',{action:'restore'},'owner')).status,200);assert.ok((await call('/api/threads/'+deleteThread.id+'/messages','GET',undefined,'buyer')).data.messages.length>0);
console.log('PASS: recipient-only friend consent, private request lists, defaults for new profiles, scoped message delete/restore and media revocation, personal chat hide with new-message recovery, public group discovery, and reversible owner-only history archive.');
// Optimized profile uploads are checked once; Save uses the safe cached result.
sql.exec('DELETE FROM wm_limits');let polishPhotoScans=0;env.AI={run:async()=>{polishPhotoScans++;return {response:{decision:'safe',confidence:.99,category:'none'}}}};
const preparedAvatar=await worker.fetch(new Request('https://test.local/api/upload',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens.seller,'content-type':'image/png','x-upload-purpose':'profile'},body:new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4])}),env);assert.equal(preparedAvatar.status,201);const preparedAvatarId=(await preparedAvatar.json()).id;
assert.equal((await call('/api/profile/details','POST',{name:'Rahat Custom',bio:'Updated profile',pictureId:preparedAvatarId},'seller')).status,200);assert.equal(polishPhotoScans,1);
assert.equal((await call('/api/profile/details','POST',{name:'Rahat Custom',bio:'Default profile',removePicture:true,removeCover:true},'seller')).status,200);assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.picture,'/assets/default-avatar.svg');assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.cover,'/assets/profile-cover.webp');env.AI=safeAI;
console.log('PASS: profile preupload safety cache is reused at Save, and explicit default photo/banner reset persists.');
// Listing-based deals: admin consent, stable identity, one request per buyer/listing and isolated inbox.
sql.exec('DELETE FROM wm_limits; DELETE FROM wm_suspensions');env.AI=safeAI;
const ownListing=await call('/api/posts','POST',{...post,title:'Admin own ID',price:'10k'},'owner');assert.equal(ownListing.status,201);
const ownRead=(await call('/api/listing/'+ownListing.data.id,'GET',undefined,'buyer')).data.post;assert.match(ownRead.listing_code,/^ID No - \d+$/);
const inboxBefore=(await call('/api/threads','GET',undefined,'buyer')).data.threads.map(t=>t.id);
let direct=await call('/api/deals','POST',{postId:ownListing.data.id,price:1,adminId:'outsider'},'buyer');assert.equal(direct.status,201);const directId=direct.data.id;assert.equal(direct.data.deal.status,'awaiting_admin');assert.equal(direct.data.deal.mode,'direct');assert.equal(direct.data.deal.admin_id,'owner');assert.equal(direct.data.deal.price,10000);assert.equal(direct.data.deal.listing_code,ownRead.listing_code);assert.match(direct.data.deal.deal_code,/^Deal - \d+$/);
assert.equal((await call('/api/deals','POST',{postId:ownListing.data.id},'buyer')).data.id,directId);
assert.deepEqual((await call('/api/threads','GET',undefined,'buyer')).data.threads.map(t=>t.id),inboxBefore);
assert.equal((await call('/api/threads/'+direct.data.deal.thread_id+'/messages','GET',undefined,'buyer')).status,404);
assert.equal((await call('/api/deals/'+directId+'/messages','GET',undefined,'buyer')).status,409);
assert.equal((await call('/api/deals/'+directId+'/action','POST',{action:'accept',version:0},'buyer')).status,403);
assert.equal((await call('/api/deals/'+directId+'/action','POST',{action:'accept',version:0},'owner')).status,200);
assert.equal((await call('/api/deals/'+directId,'GET',undefined,'buyer')).data.deal.status,'active');
assert.equal((await call('/api/deals/'+directId+'/action','POST',{action:'accept',version:0},'owner')).status,409);
assert.equal((await call('/api/deals/'+directId+'/messages','POST',{text:'Direct room'},'buyer')).status,201);
assert.equal((await call('/api/deals/'+directId+'/messages','GET',undefined,'admin')).status,404);
assert.equal((await call('/api/deals','POST',{postId:ownListing.data.id},'owner')).status,400);
// A single public post is placed in joined groups, preserving its Listing ID and interactions.
await call('/api/groups/'+group+'/join','POST',{},'seller');const secondGroup=(await call('/api/groups','POST',{name:'Second market',logoId},'admin')).data.id;await call('/api/groups/'+secondGroup+'/join','POST',{},'seller');await call('/api/groups/'+secondGroup+'/join','POST',{},'buyer');
const dual=await call('/api/posts','POST',{...post,title:'Shared ID',price:'8.5k',groupIds:[group,secondGroup]},'seller');assert.equal(dual.status,201,JSON.stringify(dual.data));const dualId=dual.data.id;
for(const gid of [group,secondGroup]){const groupFeed=await call('/api/feed?group='+gid,'GET',undefined,'buyer');assert.equal(groupFeed.status,200);// A feed post also sent to groups stays in the feed: group lists show only IDs posted inside the group.
assert.equal(groupFeed.data.posts.filter(p=>p.id===dualId).length,0);const placement=sql.prepare('SELECT range_id FROM wm_post_groups WHERE post_id=? AND group_id=?').get(dualId,gid);assert.ok(placement);assert.ok(!(await call('/api/feed?group='+gid+'&range='+placement.range_id,'GET',undefined,'buyer')).data.posts.some(p=>p.id===dualId))}
assert.ok((await call('/api/feed')).data.posts.some(p=>p.id===dualId));
assert.equal((await call('/api/posts','POST',{...post,groupIds:[group,group]},'seller')).status,400);
assert.equal((await call('/api/posts','POST',{...post,groupIds:[group]},'outsider')).status,403);
let mediated=await call('/api/deals','POST',{postId:dualId},'buyer');assert.equal(mediated.status,201);const mediatedId=mediated.data.id;assert.equal(mediated.data.deal.mode,'mediated');assert.equal(mediated.data.deal.admin_id,'owner');
assert.equal(mediated.data.deal.status,'awaiting_seller');
assert.equal((await call('/api/deals/'+mediatedId+'/action','POST',{action:'accept',version:0},'owner')).status,409);
assert.equal((await call('/api/deals/'+mediatedId+'/action','POST',{action:'confirm',version:0},'seller')).status,200);
assert.equal((await call('/api/deals/'+mediatedId,'GET',undefined,'seller')).data.deal.status,'awaiting_admin');assert.equal((await call('/api/deals/'+mediatedId+'/messages','GET',undefined,'seller')).status,409);
assert.equal((await call('/api/deals/'+mediatedId+'/action','POST',{action:'accept',version:1},'owner')).status,200);
assert.equal((await call('/api/deals/'+mediatedId+'/messages','POST',{text:'Mediated room'},'owner')).status,201);
assert.equal((await call('/api/deal-management','GET',undefined,'buyer')).status,403);assert.ok((await call('/api/deal-management','GET',undefined,'owner')).data.deals.some(d=>d.id===mediatedId));
assert.ok(!(await call('/api/deal-management','GET',undefined,'admin')).data.deals.some(d=>d.id===directId));
const dualBefore=(await call('/api/posts/'+dualId,'GET',undefined,'seller')).data.post;assert.deepEqual(new Set(dualBefore.group_ids),new Set([group,secondGroup]));
assert.equal((await call('/api/posts/'+dualId+'/edit','POST',{...post,title:'Shared ID updated',price:12000,groupIds:[group,secondGroup],version:dualBefore.version},'seller')).status,200);
for(const gid of [group,secondGroup]){const range=sql.prepare('SELECT r.min_price,r.max_price FROM wm_post_groups pg JOIN wm_group_ranges r ON r.id=pg.range_id WHERE pg.post_id=? AND pg.group_id=?').get(dualId,gid);assert.ok(range.min_price<=12000&&(range.max_price===null||range.max_price>=12000))}
assert.equal((await call('/api/deals/'+mediatedId,'GET',undefined,'buyer')).data.deal.price,8500);assert.equal((await call('/api/listing/'+dualId)).data.post.listing_code,mediated.data.deal.listing_code);
const decline=await call('/api/deals','POST',{postId:dualId},'admin');assert.equal(decline.status,201);assert.equal((await call('/api/deals/'+decline.data.id+'/action','POST',{action:'decline',version:0},'owner')).status,200);assert.equal((await call('/api/deals/'+decline.data.id,'GET',undefined,'admin')).data.deal.status,'cancelled');
// Group-only listing can also start a deal; nonmembers are blocked.
const restricted=await call('/api/posts','POST',{...post,groupId:secondGroup},'seller');assert.equal(restricted.status,201);assert.equal((await call('/api/deals','POST',{postId:restricted.data.id},'outsider')).status,403);assert.equal((await call('/api/deals','POST',{postId:restricted.data.id},'buyer')).status,201);
// Friend sender follows immediately; accepting adds to friends and exposes no pending request to visitors.
sql.exec("DELETE FROM wm_friend_requests WHERE pair_key='admin:buyer';DELETE FROM wm_follows WHERE user_id='admin' AND target_id='buyer'");assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'admin')).status,200);assert.ok((await call('/api/profile/admin/connections?kind=following','GET',undefined,'seller')).data.people.some(p=>p.id==='buyer'));assert.ok(!(await call('/api/profile/admin/connections?kind=friends','GET',undefined,'buyer')).data.people.some(p=>p.id==='buyer'));assert.equal((await call('/api/friends/respond','POST',{userId:'admin',accept:true},'buyer')).status,200);assert.ok((await call('/api/profile/admin/connections?kind=friends','GET',undefined,'buyer')).data.people.some(p=>p.id==='buyer'));assert.ok((await call('/api/me','GET',undefined,'admin')).data.user.friends>0);
console.log('PASS: listing/deal IDs, direct and mediated Admin Accept, seller consent, pending room lock, idempotency, separate inbox, metadata scoping, multi-group single-post ranges, preserved deal price, group-only deal access and immediate follow/friend acceptance.');
// The independent control-room session can manage its assigned pending deals.
const panelLogin=await worker.fetch(new Request('https://test.local/api/control/owner-access',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens.owner}}),env);assert.equal(panelLogin.status,200);const panelCookie=panelLogin.headers.get('set-cookie').split(';')[0];const panelRequest=async(path,data)=>worker.fetch(new Request('https://test.local/api/control/'+path,{method:data?'POST':'GET',headers:{origin:'https://test.local',cookie:panelCookie,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env);
const panelDeals=await panelRequest('deals');assert.equal(panelDeals.status,200);assert.ok((await panelDeals.json()).deals.some(d=>d.id===directId));const panelTarget=(await call('/api/deals','POST',{postId:ownListing.data.id},'seller')).data.id;assert.equal((await panelRequest('deals/'+panelTarget+'/action',{action:'accept',version:0})).status,200);assert.equal((await call('/api/deals/'+panelTarget,'GET',undefined,'seller')).data.deal.status,'active');console.log('PASS: control-room metadata and assigned Admin Accept use the separate owner session.');
// Security regression: members can request cancellation but cannot close a deal by API.
const currentDeal=async id=>(await call('/api/deals/'+id,'GET',undefined,'buyer')).data.deal;
const act=async(id,action,user,extra={})=>{const d=(await call('/api/deals/'+id,'GET',undefined,user)).data.deal;return call('/api/deals/'+id+'/action','POST',{action,version:d.version,...extra},user)};
let secured=await currentDeal(mediatedId);assert.equal(secured.status,'active');
for(const id of ['buyer','seller']){for(const action of ['cancel','accept','reject','resolve_dispute','reject_cancel'])assert.equal((await call('/api/deals/'+mediatedId+'/action','POST',{action,version:secured.version},id)).status,403,action+' must be Admin-only')}
assert.equal((await call('/api/deals/'+mediatedId+'/action','POST',{action:'cancel',version:secured.version},'admin')).status,404);
assert.equal((await act(mediatedId,'request_cancel','buyer',{reason:'Please cancel this order'})).status,200);secured=await currentDeal(mediatedId);assert.equal(secured.status,'active');assert.equal(secured.cancel_pending,1);assert.match(secured.cancel_reasons,/Please cancel/);
assert.equal((await act(mediatedId,'request_cancel','buyer',{reason:'Duplicate request'})).status,409);
assert.equal((await act(mediatedId,'request_cancel','seller',{reason:'Seller cancellation request'})).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM wm_deal_cancel_requests WHERE deal_id=? AND resolved_at IS NULL').get(mediatedId).n,2);
assert.equal((await act(mediatedId,'reject_cancel','owner')).status,200);assert.equal((await currentDeal(mediatedId)).status,'active');assert.equal((await currentDeal(mediatedId)).cancel_pending,0);
assert.equal((await act(mediatedId,'complete','owner')).status,403);assert.equal((await act(mediatedId,'complete','buyer')).status,200);assert.equal((await currentDeal(mediatedId)).status,'active');
assert.equal((await act(mediatedId,'dispute','seller')).status,200);secured=await currentDeal(mediatedId);assert.equal(secured.status,'disputed');assert.equal(secured.buyer_done,0);
assert.equal((await act(mediatedId,'complete','buyer')).status,409);assert.equal((await act(mediatedId,'resolve_dispute','owner')).status,200);assert.equal((await currentDeal(mediatedId)).buyer_done,0);
assert.equal((await act(mediatedId,'complete','buyer')).status,200);assert.equal((await act(mediatedId,'complete','seller')).status,200);assert.equal((await currentDeal(mediatedId)).status,'awaiting_final');assert.equal((await act(mediatedId,'finalize','owner')).status,200);assert.equal((await currentDeal(mediatedId)).status,'completed');assert.equal((await act(mediatedId,'cancel','owner')).status,409);assert.equal((await call('/api/deals/'+mediatedId+'/messages','POST',{text:'Should stay closed'},'buyer')).status,409);
// Direct deal cancellation preserves the message history and records the Admin decision.
assert.equal((await act(directId,'request_cancel','buyer',{reason:'Changed my mind'})).status,200);assert.equal((await currentDeal(directId)).status,'active');assert.equal((await act(directId,'cancel','owner')).status,200);assert.equal((await currentDeal(directId)).status,'cancelled');assert.equal((await currentDeal(directId)).cancel_pending,0);assert.equal((await call('/api/deals/'+directId+'/messages','GET',undefined,'buyer')).status,200);assert.equal((await call('/api/deals/'+directId+'/messages','POST',{text:'No more messages'},'buyer')).status,409);
assert.equal(sql.prepare('SELECT resolution FROM wm_deal_cancel_requests WHERE deal_id=?').get(directId).resolution,'approved');
// Exact Post/Deal serial searches, status tabs and owner audit history never expose chat text.
const postSerial=sql.prepare('SELECT number FROM wm_listing_ids WHERE post_id=?').get(dualId).number,dealSerial=sql.prepare('SELECT number FROM wm_deal_ids WHERE deal_id=?').get(mediatedId).number;
const postSearch=(await call('/api/deal-management?status=all&q='+encodeURIComponent('ID No - '+postSerial),'GET',undefined,'owner')).data.deals;assert.ok(postSearch.length);assert.ok(postSearch.every(d=>d.listing_id===dualId));
const dealSearch=(await call('/api/deal-management?status=all&q='+encodeURIComponent('Deal - '+dealSerial),'GET',undefined,'owner')).data.deals;assert.deepEqual(dealSearch.map(d=>d.id),[mediatedId]);
assert.equal((await call('/api/deal-management?status=invalid','GET',undefined,'owner')).status,400);assert.ok((await call('/api/deal-management?status=completed','GET',undefined,'owner')).data.deals.every(d=>d.status==='completed'));
assert.equal((await call('/api/deal-management?status=active','GET',undefined,'buyer')).status,403);assert.equal((await call('/api/deals/'+directId+'/history','GET',undefined,'admin')).status,404);
const independentDirect=await call('/api/deals','POST',{postId:ownListing.data.id},'admin');assert.equal(independentDirect.status,201);
// Owner can inspect all audit events but not a room assigned to a different Admin.
const trustedListing=await call('/api/posts','POST',{...post,title:'Trusted admin account'},'admin');assert.equal(trustedListing.status,201);const trustedDeal=(await call('/api/deals','POST',{postId:trustedListing.data.id},'buyer')).data.id;
assert.equal((await call('/api/deals/'+trustedDeal+'/history','GET',undefined,'owner')).status,200);assert.equal((await call('/api/deals/'+trustedDeal+'/messages','GET',undefined,'owner')).status,404);assert.equal((await call('/api/deals/'+trustedDeal+'/action','POST',{action:'cancel',version:0},'owner')).status,404);
for(const id of [directId,mediatedId,trustedDeal]){const history=(await call('/api/deals/'+id+'/history','GET',undefined,'owner')).data.events;assert.ok(history.every(e=>!e.action.startsWith('chat:')))}
// English, numbers and Bengali are saved/retrieved in the original order.
assert.equal((await call('/api/deals/'+trustedDeal+'/action','POST',{action:'accept',version:0},'admin')).status,200);const orderedText='hi 1234567890 বাংলা ৮৫০০';assert.equal((await call('/api/deals/'+trustedDeal+'/messages','POST',{text:orderedText},'buyer')).status,201);const typedMessage=(await call('/api/deals/'+trustedDeal+'/messages','GET',undefined,'buyer')).data.messages[0];assert.equal(typedMessage.text,'chat:'+orderedText);assert.equal(typedMessage.participant_role,'Buyer');assert.ok(typedMessage.created_at);
console.log('PASS: Admin-only API accept/reject/cancel/resolve, dual-party completion, cancellation approval/rejection, terminal read-only rooms, exact independent serial searches, owner audit privacy, and English/number/Bengali message order.');
// Final completion is an Admin action; direct Seller/Admin completion requires two distinct confirmations.
assert.equal((await act(trustedDeal,'finalize','admin')).status,409);
assert.equal((await act(trustedDeal,'complete','admin')).status,200);let directBeforeFinal=(await call('/api/deals/'+trustedDeal,'GET',undefined,'buyer')).data.deal;assert.equal(directBeforeFinal.status,'active');assert.equal(directBeforeFinal.buyer_done,0);assert.equal(directBeforeFinal.seller_done,1);assert.ok(directBeforeFinal.direct_completion_started_at);
assert.equal((await act(trustedDeal,'finalize','buyer',{doubleConfirm:true,reason:'Spoof'})).status,403);
assert.equal((await act(trustedDeal,'finalize','admin')).status,400);assert.equal((await act(trustedDeal,'finalize','admin',{doubleConfirm:true})).status,400);
assert.equal((await act(trustedDeal,'finalize','admin',{doubleConfirm:true,reason:'Delivered account; buyer has not confirmed'})).status,200);
const finalDirect=(await call('/api/deals/'+trustedDeal,'GET',undefined,'buyer')).data.deal;assert.equal(finalDirect.status,'completed');assert.equal(finalDirect.admin_done,1);assert.equal(finalDirect.buyer_done,0);assert.match(finalDirect.completion_note,/buyer has not confirmed/);assert.ok(finalDirect.completed_at);
assert.ok(!(await call('/api/deals','GET',undefined,'buyer')).data.deals.some(d=>d.id===trustedDeal));const completedHistory=await call('/api/deals?status=completed','GET',undefined,'buyer');assert.ok(completedHistory.data.deals.some(d=>d.id===trustedDeal));assert.ok(completedHistory.data.summary.total>0);assert.ok(completedHistory.data.summary.admins.some(a=>a.id==='admin'&&a.completed>0));assert.equal(finalDirect.cancel_pending,0);
const identityMessage=(await call('/api/deals/'+trustedDeal+'/messages','GET',undefined,'buyer')).data.messages[0];assert.ok(identityMessage.picture);assert.ok('verified' in identityMessage);assert.equal((await call('/api/deals/'+trustedDeal+'/history','GET',undefined,'admin')).data.events[0].action,'finalize_direct_override');
// Guests can browse without a tracking cookie; accounts and private features remain locked.
assert.equal((await call('/api/feed')).status,200);assert.equal((await call('/api/profile/buyer')).status,401);assert.equal((await call('/api/profile/buyer/connections')).status,401);assert.equal((await call('/api/threads')).status,401);assert.equal((await call('/api/deals')).status,401);
const guestMe=await worker.fetch(new Request('https://test.local/api/me'),env);assert.equal(guestMe.headers.get('set-cookie'),null);
assert.equal((await call('/api/posts/'+ownListing.data.id+'/view','POST',{})).status,410);

// One profile save can include username, while both API and DB enforce the seven-day lock.
let username=await call('/api/profile/settings','POST',{username:'qa_outsider'},'outsider');assert.equal(username.status,200);const firstUsernameTime=sql.prepare('SELECT updated_at FROM wm_profiles WHERE user_id=?').get('outsider').updated_at;
assert.equal((await call('/api/profile/settings','POST',{username:'qa_outsider'},'outsider')).status,200);assert.equal(sql.prepare('SELECT updated_at FROM wm_profiles WHERE user_id=?').get('outsider').updated_at,firstUsernameTime);
assert.equal((await call('/api/profile/settings','POST',{username:'qa_outsider_new'},'outsider')).status,409);
const oldName=(await call('/api/me','GET',undefined,'outsider')).data.user.name;assert.equal((await call('/api/profile/details','POST',{name:'Must not partially save',bio:'',username:'qa_outsider_new'},'outsider')).status,409);assert.equal((await call('/api/me','GET',undefined,'outsider')).data.user.name,oldName);
assert.throws(()=>sql.prepare('UPDATE wm_profiles SET username=?,updated_at=? WHERE user_id=?').run('bypass_name',Date.now(),'outsider'),/username_cooldown/);
sql.prepare('UPDATE wm_profiles SET updated_at=? WHERE user_id=?').run(Date.now()-8*86400000,'outsider');assert.equal((await call('/api/profile/details','POST',{name:'Atomic profile',bio:'Saved once',username:'qa_outsider_new'},'outsider')).status,200);const atomicMe=(await call('/api/me','GET',undefined,'outsider')).data.user;assert.equal(atomicMe.name,'Atomic profile');assert.equal(atomicMe.username,'qa_outsider_new');assert.ok(atomicMe.username_next_change_at>Date.now()+6*86400000);
console.log('PASS: final Admin approval, explicit audited direct double-confirmation, completed history and admin totals, avatar/verification identities, public guest browsing/views with private feature gates, and atomic seven-day username cooldown.');
// Not interested is a per-account feed preference, never a global post removal.
assert.ok((await call('/api/feed','GET',undefined,'buyer')).data.posts.some(p=>p.id===dualId));
assert.equal((await call('/api/posts/'+dualId+'/interest','POST',{interested:false},'buyer')).status,200);
assert.ok(!(await call('/api/feed','GET',undefined,'buyer')).data.posts.some(p=>p.id===dualId));assert.ok((await call('/api/feed','GET',undefined,'outsider')).data.posts.some(p=>p.id===dualId));assert.ok((await call('/api/feed')).data.posts.some(p=>p.id===dualId));
assert.ok(!(await call('/api/feed?group='+secondGroup,'GET',undefined,'buyer')).data.posts.some(p=>p.id===dualId));assert.equal((await call('/api/listing/'+dualId,'GET',undefined,'buyer')).status,200);
assert.equal((await call('/api/posts/'+dualId+'/interest','POST',{interested:false})).status,401);assert.equal((await call('/api/posts/'+dualId+'/interest','POST',{interested:false},'seller')).status,400);
assert.equal((await call('/api/posts/'+dualId+'/interest','POST',{interested:'no'},'buyer')).status,400);assert.equal((await call('/api/posts/'+dualId+'/interest','POST',{interested:true},'buyer')).status,200);assert.ok((await call('/api/feed','GET',undefined,'buyer')).data.posts.some(p=>p.id===dualId));
console.log('PASS: Not interested hides every feed copy only for the current member, persists across requests, respects group access and preserves the original listing for other viewers.');

// Owner-only Gmail search and explicit permission overrides do not leak through public identities.
const gmailMember=(await call('/api/admin/users?q=buyer%40example.com','GET',undefined,'owner')).data;
assert.equal(gmailMember.total,1);assert.equal(gmailMember.users[0].email,'buyer@example.com');assert.deepEqual(gmailMember.users[0].permissions,{can_post:1,can_message:1,can_start_deal:1});
assert.equal((await call('/api/admin/users?q=buyer%40example.com','GET',undefined,'buyer')).status,403);
assert.equal((await call('/api/admin/users?q=buyer%40example.com','GET',undefined,'admin')).status,403);
const caps={can_post:false,can_message:false,can_start_deal:false};
const access={userId:'buyer',verified:false,trustedSeller:false,role:'member',permissions:caps};
assert.equal((await call('/api/admin/member-access','POST',access,'buyer')).status,403);
assert.equal((await call('/api/admin/member-access','POST',access,'owner')).status,200);
assert.equal((await call('/api/posts','POST',post,'buyer')).status,403);
assert.equal((await call('/api/posts/'+groupPost+'/edit','POST',{},'buyer')).status,403);
assert.equal((await call('/api/threads','POST',{userId:'seller'},'buyer')).status,403);
assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'Blocked'},'buyer')).status,403);
assert.equal((await call('/api/deals','POST',{postId},'buyer')).status,403);
// A restriction on starting trades does not block private history and safety actions.
assert.equal((await call('/api/deals','GET',undefined,'buyer')).status,200);
assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.email,undefined);
assert.equal((await call('/api/admin/member-access','POST',{...access,userId:'owner',verified:true,role:'owner'},'owner')).status,403);
assert.equal((await call('/api/admin/member-access','POST',{...access,permissions:{...caps,can_post:'yes'}},'owner')).status,400);
assert.equal((await call('/api/admin/member-access','POST',{...access,permissions:{can_post:true,can_message:true,can_start_deal:true}},'owner')).status,200);
const groupIdentity=(await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages[0];
assert.ok('picture' in groupIdentity);assert.ok('verified' in groupIdentity);assert.equal(groupIdentity.email,undefined);
const publicTrades=(await call('/api/deals/public')).data;
assert.equal(publicTrades.total,sql.prepare("SELECT count(*) n FROM wm_deals WHERE status='completed'").get().n);assert.ok(publicTrades.completed.length);
for(const trade of publicTrades.completed){assert.ok(trade.buyer_id&&trade.seller_id);for(const privateKey of ['email','buyer_email','seller_email','price','fee','cancel_reasons','messages','events','completion_note'])assert.equal(trade[privateKey],undefined)}
assert.equal((await call('/api/deals/public?offset=100000')).data.completed.length,0);
const previous=(await call('/api/deals?status=previous','GET',undefined,'buyer')).data.deals;assert.ok(previous.every(d=>['completed','cancelled'].includes(d.status)));
const manifestResponse=await worker.fetch(new Request('https://test.local/manifest.webmanifest'),env),manifest=await manifestResponse.json();assert.equal(manifestResponse.status,200);assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
for(const icon of manifest.icons){const response=await worker.fetch(new Request('https://test.local'+icon.src),env);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10])}
const swResponse=await worker.fetch(new Request('https://test.local/sw.js'),env);assert.equal(swResponse.headers.get('cache-control'),'no-cache');assert.equal(swResponse.headers.get('service-worker-allowed'),'/');
// Execute the actual service-worker fetch handler: API/private media is never intercepted/cached.
const {runInNewContext}=await import('node:vm');const handlers={};runInNewContext(await swResponse.text(),{self:{location:{origin:'https://test.local'},addEventListener:(name,handler)=>handlers[name]=handler},URL});
for(const path of ['/api/me','/api/threads/123/messages','/media/private','/avatar/member']){let intercepted=false;handlers.fetch({request:{url:'https://test.local'+path,method:'GET',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false)}
assert.equal((await worker.fetch(new Request('https://test.local/offline.html'),env)).status,200);
console.log('PASS: owner-only Gmail search and capability editing; backend posting/messaging/new-deal enforcement; safe public completed profiles; previous-deal filter; install manifest/icons and private-data-free service-worker caching.');

// Separate account-scoped archive, deletion and symmetric private blocking.
const peerId='inbox_peer',peerToken=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[peerId]=peerToken;
sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(peerId,peerId,'inbox@example.com','Inbox Peer','',Date.now(),Date.now());sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(peerToken),peerId,Date.now()+1000000,Date.now());
let inboxThread=(await call('/api/threads','POST',{userId:peerId},'buyer')).data.thread;await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'First private message'},'buyer');await call('/api/threads/'+inboxThread.id+'/accept','POST',{},peerId);await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Reply before deletion'},peerId);
const inboxAction=(action,id='buyer',kind='private',chatId=inboxThread.id)=>call('/api/chats/action','POST',{kind,id:chatId,action},id);
assert.equal((await inboxAction('archive')).status,200);assert.equal((await call('/api/threads','GET',undefined,'buyer')).data.threads.find(t=>t.id===inboxThread.id).chat_archived,1);assert.equal((await call('/api/threads','GET',undefined,peerId)).data.threads.find(t=>t.id===inboxThread.id).chat_archived,0);assert.equal((await inboxAction('unarchive')).status,200);
assert.equal((await inboxAction('mute')).status,200);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','GET',undefined,'buyer')).data.thread.preferences.muted,1);
assert.equal((await inboxAction('delete')).status,200);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','GET',undefined,'buyer')).data.messages.length,0);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','GET',undefined,peerId)).data.messages.length,2);
await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Only this new message should return'},peerId);assert.deepEqual((await call('/api/threads/'+inboxThread.id+'/messages','GET',undefined,'buyer')).data.messages.map(m=>m.text),['Only this new message should return']);assert.ok((await call('/api/threads','GET',undefined,'buyer')).data.threads.some(t=>t.id===inboxThread.id));
assert.equal((await inboxAction('archive','outsider')).status,404);assert.equal((await inboxAction('delete','outsider','group',group)).status,404);assert.equal((await call('/api/chats/action','POST',{kind:'deal',id:deal,action:'delete'},'buyer')).status,400);
assert.equal((await call('/api/blocks','POST',{userId:peerId,blocked:true},'buyer')).status,200);assert.equal((await call('/api/blocks','GET',undefined,'buyer')).data.people[0].email,undefined);assert.equal((await call('/api/blocks','GET',undefined,'outsider')).data.people.length,0);
assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Bypass attempt'},peerId)).status,403);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Self bypass'},'buyer')).status,403);assert.equal((await call('/api/threads','POST',{userId:'buyer'},peerId)).status,403);assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},peerId)).status,403);assert.equal((await call('/api/follow','POST',{userId:'buyer',follow:true},peerId)).status,403);
assert.equal((await call('/api/profile/'+peerId,'GET',undefined,'buyer')).data.profile.blocked_by_me,true);
const contactBlockedPost=crypto.randomUUID();sql.prepare("INSERT INTO wm_posts(id,user_id,title,details,price,kind,status,created_at) VALUES(?,?,?,'Details',9000,'Game ID','approved',?)").run(contactBlockedPost,peerId,'Blocked seller listing',Date.now());assert.equal((await call('/api/deals','POST',{postId:contactBlockedPost},'buyer')).status,403);assert.ok(!(await call('/api/feed','GET',undefined,'buyer')).data.posts.some(p=>p.id===contactBlockedPost));assert.ok((await call('/api/feed')).data.posts.some(p=>p.id===contactBlockedPost));
assert.equal((await call('/api/blocks','POST',{userId:'buyer',blocked:true},peerId)).status,200);assert.equal((await call('/api/blocks','POST',{userId:peerId,blocked:false},'buyer')).status,200);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Still blocked by peer'},'buyer')).status,403);assert.equal((await call('/api/blocks','POST',{userId:'buyer',blocked:false},peerId)).status,200);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Unblocked'},'buyer')).status,201);
assert.equal((await call('/api/blocks','POST',{userId:'buyer',blocked:true},'buyer')).status,400);assert.equal((await call('/api/blocks','POST',{userId:peerId,blocked:true})).status,401);
await call('/api/groups/'+group+'/messages','POST',{text:'Group before personal deletion'},'admin');assert.equal((await inboxAction('delete','buyer','group',group)).status,200);assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages.length,0);assert.ok((await call('/api/groups/'+group+'/messages','GET',undefined,'admin')).data.messages.length);
assert.equal((await inboxAction('block','buyer','group',group)).status,200);assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).status,403);assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'Bypass blocked group'},'buyer')).status,403);assert.equal((await call('/api/groups/'+group+'/join','POST',{},'buyer')).status,403);assert.equal((await inboxAction('block','admin','group',group)).status,403);assert.equal((await inboxAction('unblock','buyer','group',group)).status,200);
await call('/api/groups/'+group+'/messages','POST',{text:'Group after personal deletion'},'admin');assert.deepEqual((await call('/api/groups/'+group+'/messages','GET',undefined,'buyer')).data.messages.map(m=>m.text),['Group after personal deletion']);
assert.equal((await call('/api/admin/pwa','GET',undefined,'buyer')).status,403);assert.equal((await call('/api/admin/pwa','POST',{name:'Attack'},'admin')).status,403);
const branding={name:'QA Market App',shortName:'QA Market',description:'Install our community marketplace'};assert.equal((await call('/api/admin/pwa','POST',branding,'owner')).status,200);assert.equal((await (await worker.fetch(new Request('https://test.local/manifest.webmanifest'),env)).json()).name,branding.name);
const iconUploads={};for(const [key,size]of [['icon192Id',192],['icon512Id',512],['iconMaskableId',512]]){const id=crypto.randomUUID(),png=new Uint8Array(32);png.set([137,80,78,71,13,10,26,10]);const v=new DataView(png.buffer);v.setUint32(16,size);v.setUint32(20,size);objects.set(id,png);sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(id,'owner','image/png',png.length,Date.now());iconUploads[key]=id}
assert.equal((await call('/api/admin/pwa','POST',{...branding,icons:iconUploads},'owner')).status,200);const customizedManifest=await (await worker.fetch(new Request('https://test.local/manifest.webmanifest'),env)).json();assert.equal(customizedManifest.icons[0].src,'/app-icon/'+iconUploads.icon192Id+'.png');assert.equal((await worker.fetch(new Request('https://test.local'+customizedManifest.icons[0].src),env)).headers.get('cache-control'),'public,max-age=31536000,immutable');assert.equal((await worker.fetch(new Request('https://test.local/app-icon/'+mediaId+'.png'),env)).status,404);
assert.equal((await call('/api/admin/pwa','POST',{...branding,icons:{...iconUploads,icon192Id:iconUploads.icon512Id}},'owner')).status,400);assert.equal((await call('/api/admin/pwa','POST',{...branding,resetIcons:true},'owner')).status,200);assert.equal((await call('/api/pwa')).data.icons[0].src,'/icons/app-192.png');
const originalMediaGet=env.MEDIA.get;env.MEDIA.get=async key=>{const result=await originalMediaGet(key);if(result)result.httpEtag='"test-image-etag"';return result};const cachedImage=await worker.fetch(new Request('https://test.local/group-logo/'+group),env);assert.ok(cachedImage.headers.get('cache-control').includes('max-age'));assert.equal((await worker.fetch(new Request('https://test.local/group-logo/'+group,{headers:{'if-none-match':'"test-image-etag"'}}),env)).status,304);env.MEDIA.get=originalMediaGet;
console.log('PASS: personal archive/delete/mute isolation, symmetric private block enforcement, blocked group join/post protection, public blocked-feed filtering, private-block metadata, owner-only configurable PWA manifest/icons and conditional image caching.');
// Blocking ordinary contact must not stop the assigned-Admin deal resolution channel.
const retainedThread=crypto.randomUUID(),retainedDeal=crypto.randomUUID();sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,status,created_at,is_deal) VALUES(?,'buyer',? ,?,'accepted',?,1)").run(retainedThread,peerId,'retained:'+retainedThread,Date.now());sql.prepare("INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,admin_id,price,status,buyer_ok,seller_ok,created_at) VALUES(?,?,'buyer',?,'owner',9000,'active',1,1,?)").run(retainedDeal,retainedThread,peerId,Date.now());await call('/api/blocks','POST',{userId:peerId,blocked:true},'buyer');assert.equal((await call('/api/deals/'+retainedDeal+'/messages','POST',{text:'Secure resolution channel'},'buyer')).status,201);assert.equal((await call('/api/deals/'+retainedDeal+'/messages','GET',undefined,peerId)).status,200);assert.equal((await call('/api/deals/'+retainedDeal+'/messages','GET',undefined,'outsider')).status,404);await call('/api/blocks','POST',{userId:peerId,blocked:false},'buyer');
console.log('PASS: private blocks preserve existing secure deal communication and Admin resolution access.');
// Legacy hidden groups recover into archives without touching membership or any message.
const beforeRecovery={members:sql.prepare('SELECT count(*) n FROM wm_group_members').get().n,messages:sql.prepare('SELECT count(*) n FROM wm_group_messages').get().n};
sql.prepare("INSERT INTO wm_chat_hides(user_id,kind,chat_id,last_message_id,created_at) VALUES('buyer','group',?,100000,?) ON CONFLICT(user_id,kind,chat_id) DO UPDATE SET last_message_id=100000").run(group,Date.now());
const groupRecoverySql=readFileSync(new URL('./migrations/015_recover_hidden_group_chats.sql',import.meta.url),'utf8');sql.exec(groupRecoverySql);sql.exec(groupRecoverySql);
assert.equal(sql.prepare("SELECT count(*) n FROM wm_chat_hides WHERE kind='group'").get().n,0);assert.equal((await call('/api/groups','GET',undefined,'buyer')).data.groups.find(g=>g.id===group).chat_archived,1);assert.deepEqual({members:sql.prepare('SELECT count(*) n FROM wm_group_members').get().n,messages:sql.prepare('SELECT count(*) n FROM wm_group_messages').get().n},beforeRecovery);
assert.equal((await inboxAction('unarchive','buyer','group',group)).status,200);assert.equal((await call('/api/groups','GET',undefined,'buyer')).data.groups.find(g=>g.id===group).hidden,0);
await inboxAction('archive');await call('/api/blocks','POST',{userId:peerId,blocked:true},'buyer');const blockedInbox=(await call('/api/threads','GET',undefined,'buyer')).data.threads.find(t=>t.id===inboxThread.id);assert.ok(blockedInbox);assert.equal(blockedInbox.blocked_by_me,1);assert.equal(blockedInbox.chat_archived,0);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','GET',undefined,'buyer')).status,200);assert.equal((await call('/api/threads/'+inboxThread.id+'/messages','POST',{text:'Still blocked'},'buyer')).status,403);await inboxAction('unblock');
const trackingBefore=sql.prepare('SELECT (SELECT count(*) FROM wm_post_views)+(SELECT count(*) FROM wm_guest_post_views) n').get().n;assert.equal((await call('/api/posts/'+postId+'/view','POST',{},'buyer')).status,410);assert.equal(sql.prepare('SELECT (SELECT count(*) FROM wm_post_views)+(SELECT count(*) FROM wm_guest_post_views) n').get().n,trackingBefore);assert.equal((await call('/api/feed')).data.posts[0]?.view_count,undefined);
console.log('PASS: idempotent hidden-group archive recovery preserves membership/messages; blocked chat remains accessible with sending denied; post view tracking and visitor cookies retired.');

// Public account search exposes discovery fields, never email or session information.
let discovery=await call('/api/accounts/search?q=Inbox%20Peer');assert.equal(discovery.status,200);assert.equal(discovery.data.people[0].id,peerId);for(const key of ['email','google_sub','token_hash','expires_at'])assert.equal(discovery.data.people[0][key],undefined);
assert.equal((await call('/api/accounts/search?q=inbox%40example.com')).data.people.length,0);assert.ok((await call('/api/accounts/search')).data.people.length);
const searchableUsername=sql.prepare('SELECT username,user_id FROM wm_profiles LIMIT 1').get();assert.ok((await call('/api/accounts/search?q='+encodeURIComponent('@'+searchableUsername.username))).data.people.some(p=>p.id===searchableUsername.user_id));
await call('/api/blocks','POST',{userId:peerId,blocked:true},'buyer');assert.equal((await call('/api/accounts/search?q=Inbox%20Peer','GET',undefined,'buyer')).data.people.length,0);assert.equal((await call('/api/accounts/search?q=Inbox%20Peer')).data.people[0].id,peerId);await call('/api/blocks','POST',{userId:peerId,blocked:false},'buyer');
assert.equal((await call('/api/account/security')).status,401);assert.equal((await call('/api/account/security','POST',{action:'logout_others'})).status,401);const securityData=(await call('/api/account/security?userId=owner','GET',undefined,'buyer')).data;assert.equal(securityData.email,'buyer@example.com');assert.equal(securityData.provider,'Google');assert.ok(securityData.activeSessions>=1);assert.equal(securityData.currentSession.token_hash,undefined);
const anotherLogin=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(anotherLogin),'buyer',Date.now()+1000000,Date.now());sql.prepare('INSERT INTO wm_admin_sessions VALUES(?,?,?)').run(await hash('secondary-admin-session'),'buyer',Date.now()+1000000);const outsiderSessionsBefore=sql.prepare("SELECT count(*) n FROM sessions WHERE user_id='outsider'").get().n;
assert.equal((await call('/api/account/security','POST',{action:'bad'},'buyer')).status,400);assert.equal((await call('/api/account/security','POST',{action:'logout_others',userId:'outsider'},'buyer')).status,200);assert.ok(sql.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(await hash(tokens.buyer)));assert.equal(sql.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(await hash(anotherLogin)),undefined);assert.equal(sql.prepare("SELECT count(*) n FROM sessions WHERE user_id='outsider'").get().n,outsiderSessionsBefore);assert.equal(sql.prepare("SELECT count(*) n FROM wm_admin_sessions WHERE user_id='buyer'").get().n,0);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.id,'buyer');
console.log('PASS: public account/name/username search privacy and block scoping; account security only exposes the current member and revokes only their other sessions while retaining the current login.');

// Custom games preserve original listing identity and retry keys cannot publish a duplicate.
const previousAi=env.AI;env.AI={run:async()=>({response:JSON.stringify({decision:'safe',confidence:.99,category:'none'})})};const customKey=crypto.randomUUID(),customPayload={title:'Custom arena account',details:'Account details for our game',kind:'Game ID',price:'8.5k',gameCategory:'custom',customGameName:'Arena Legends',media:[],clientKey:customKey};
const customCreated=await call('/api/posts','POST',customPayload,peerId);assert.equal(customCreated.status,201);const customSerial=sql.prepare('SELECT number FROM wm_listing_ids WHERE post_id=?').get(customCreated.data.id).number;const customRetry=await call('/api/posts','POST',customPayload,peerId);assert.equal(customRetry.data.id,customCreated.data.id);assert.equal(customRetry.data.reused,true);assert.equal(sql.prepare('SELECT count(*) n FROM wm_posts WHERE id=?').get(customCreated.data.id).n,1);assert.equal(sql.prepare('SELECT number FROM wm_listing_ids WHERE post_id=?').get(customCreated.data.id).number,customSerial);
const customRead=(await call('/api/listing/'+customCreated.data.id)).data.post;assert.equal(customRead.custom_game_name,'Arena Legends');assert.equal(customRead.price,8500);assert.equal((await call('/api/posts','POST',{...customPayload,clientKey:crypto.randomUUID(),customGameName:''},peerId)).status,400);assert.equal((await call('/api/posts','POST',{...customPayload,clientKey:crypto.randomUUID(),customGameName:'WhatsApp 01712345678'},peerId)).status,400);
assert.equal((await call('/api/posts/'+customCreated.data.id+'/edit','POST',{...customPayload,version:0,customGameName:'New Arena'},peerId)).status,200);assert.equal((await call('/api/listing/'+customCreated.data.id)).data.post.custom_game_name,'New Arena');assert.equal(sql.prepare('SELECT number FROM wm_listing_ids WHERE post_id=?').get(customCreated.data.id).number,customSerial);env.AI=previousAi;
assert.equal((await call('/api/profile/buyer/completed-deals')).status,401);const profileHistory=(await call('/api/profile/buyer/completed-deals','GET',undefined,'outsider')).data;assert.equal(profileHistory.total,sql.prepare("SELECT count(*) n FROM wm_deals WHERE status='completed' AND (buyer_id='buyer' OR seller_id='buyer')").get().n);assert.ok(profileHistory.deals.length);for(const item of profileHistory.deals){assert.ok(item.buyer_id==='buyer'||item.seller_id==='buyer');for(const field of ['price','fee','messages','events','completion_note','email'])assert.equal(item[field],undefined)}
console.log('PASS: custom game create/edit validation, publish retry idempotency and serial preservation, and authenticated profile completion summaries without private deal data.');
sql.prepare('INSERT INTO wm_post_comments(id,post_id,user_id,text,created_at) VALUES(?,?,?,?,?)').run('verified-comment-fixture',customCreated.data.id,peerId,'Readable post comment',Date.now());const readableComments=await call('/api/posts/'+customCreated.data.id+'/comments','GET',undefined,'buyer');assert.equal(readableComments.status,200);assert.ok(readableComments.data.comments.some(c=>c.text==='Readable post comment'&&'verified' in c));

{
// Need Post: the author is the buyer, regardless of the personal thread's historical orientation.
sql.exec('DELETE FROM wm_limits; DELETE FROM wm_user_blocks; DELETE FROM wm_member_permissions; DELETE FROM wm_suspensions;');env.AI=safeAI;
const needPayload={postIntent:'need',title:'Looking for an account',kind:'Community post',media:[]};
const needCreated=await call('/api/posts','POST',needPayload,'buyer');assert.equal(needCreated.status,201);assert.equal(needCreated.data.status,'approved');const needId=needCreated.data.id;
const needRead=(await call('/api/listing/'+needId)).data.post;assert.equal(needRead.post_intent,'need');assert.equal(needRead.price,null);assert.equal(needRead.details,'');assert.equal(needRead.description,'');assert.deepEqual(needRead.media,[]);assert.ok(/^ID No - \d+$/.test(needRead.listing_code));
assert.equal((await call('/api/posts','POST',{...needPayload,title:''},'buyer')).status,400);
assert.equal((await call('/api/posts','POST',{...needPayload,postIntent:'forged'},'buyer')).status,400);
assert.equal((await call('/api/posts','POST',{...needPayload,description:'x'.repeat(5001)},'buyer')).status,400);
const withBudget=await call('/api/posts','POST',{...needPayload,title:'Another wanted account',price:'8.5k',gameCategory:'custom',customGameName:'Test Arena',details:'Wanted',description:'A long description is kept separately.'},'buyer');assert.equal(withBudget.status,201);assert.equal((await call('/api/listing/'+withBudget.data.id)).data.post.description,'A long description is kept separately.');
assert.equal((await call('/api/posts/'+needId+'/edit','POST',{...needPayload,postIntent:'sell',version:0},'buyer')).status,400);
assert.equal((await call('/api/posts/'+needId+'/edit','POST',{...needPayload,version:0,description:'Updated requirement'},'buyer')).status,200);
const needChat=await call('/api/threads','POST',{postId:needId},'seller');assert.ok([200,201].includes(needChat.status));const nt=needChat.data.thread.id;
sql.prepare("UPDATE wm_threads SET status='accepted' WHERE id=?").run(nt);
const sellerContext=await call('/api/threads/'+nt+'/messages','GET',undefined,'seller');assert.ok(sellerContext.data.thread.need_posts.some(p=>p.id===needId&&p.user_id==='buyer'));
assert.equal((await call('/api/deals','POST',{postId:needId},'seller')).status,400);
assert.equal((await call('/api/deals','POST',{postId:needId,threadId:nt,price:8000,adminId:'admin'},'buyer')).status,403);
assert.equal((await call('/api/deals','POST',{postId:needId,threadId:nt,price:8000,adminId:'admin'},'outsider')).status,404);
const unrelatedNeed=await call('/api/posts','POST',{...needPayload,title:'Not discussed in chat'},'buyer');assert.equal((await call('/api/deals','POST',{postId:unrelatedNeed.data.id,threadId:nt,price:8000,adminId:'admin'},'seller')).status,403);
const nd=await call('/api/deals','POST',{postId:needId,threadId:nt,price:8000,fee:80,adminId:'admin'},'seller');assert.equal(nd.status,201);assert.equal(nd.data.deal.buyer_id,'buyer');assert.equal(nd.data.deal.seller_id,'seller');assert.equal(nd.data.deal.post_id,needId);assert.equal(nd.data.deal.buyer_ok,0);assert.equal(nd.data.deal.seller_ok,1);assert.ok(/^Deal - \d+$/.test(nd.data.deal.deal_code));const needDealId=nd.data.id;
const ndRetry=await call('/api/deals','POST',{postId:needId,threadId:nt,price:8000,fee:80,adminId:'admin'},'seller');assert.equal(ndRetry.data.id,needDealId);assert.equal(sql.prepare("SELECT count(*) n FROM wm_deal_events WHERE deal_id=? AND action='requested'").get(needDealId).n,1);
assert.equal((await call('/api/deals/'+needDealId+'/action','POST',{action:'accept',version:0},'admin')).status,409);assert.equal((await call('/api/deals/'+needDealId+'/action','POST',{action:'confirm',version:0},'buyer')).status,200);assert.equal((await call('/api/deals/'+needDealId+'/action','POST',{action:'accept',version:1},'seller')).status,403);assert.equal((await call('/api/deals/'+needDealId+'/action','POST',{action:'accept',version:1},'admin')).status,200);assert.equal((await call('/api/deals/'+needDealId+'/messages','GET',undefined,'outsider')).status,404);
// A trusted seller still uses direct Admin acceptance after the Need buyer agrees.
const directNeedChat=await call('/api/threads','POST',{postId:needId},'admin');const dnt=directNeedChat.data.thread.id;sql.prepare("UPDATE wm_threads SET status='accepted' WHERE id=?").run(dnt);const dnd=await call('/api/deals','POST',{postId:needId,threadId:dnt,price:9000},'admin');assert.equal(dnd.status,201);assert.equal(dnd.data.deal.mode,'direct');assert.equal(dnd.data.deal.admin_id,'admin');assert.equal(dnd.data.deal.buyer_ok,0);
// Prevent bypass via the old thread-only endpoint even if the Need author first initiated the chat.
const onlyNeedChat=await call('/api/threads','POST',{postId:needId},peerId);sql.prepare("UPDATE wm_threads SET status='accepted' WHERE id=?").run(onlyNeedChat.data.thread.id);const legacyNeedAttempt=await call('/api/deals','POST',{threadId:onlyNeedChat.data.thread.id,price:1,fee:0,adminId:'admin'},'buyer');assert.ok([400,403].includes(legacyNeedAttempt.status));const legacyNeedThread=crypto.randomUUID();sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,status,created_at) VALUES(?,?,?,?,?,'accepted',?)").run(legacyNeedThread,peerId,'buyer',needId,'legacy-need-only',Date.now());assert.equal((await call('/api/deals','POST',{threadId:legacyNeedThread,price:1,fee:0,adminId:'admin'},peerId)).status,403);
console.log('PASS: title-only Need Post, optional budget/category/description/photos, immutable post intent, independent serials, seller-only proposal including API bypass attempts, correct buyer/seller orientation and unchanged Admin consent.');

// Notifications are account scoped, event-idempotent, transactional and persisted in D1.
sql.exec('DELETE FROM wm_limits; DELETE FROM wm_notifications; DELETE FROM wm_notification_preferences; DELETE FROM wm_friend_requests;');
assert.equal((await call('/api/notifications')).status,401);assert.equal((await call('/api/notifications/read','POST',{all:true})).status,401);
const defaultNotices=(await call('/api/notifications','GET',undefined,'buyer')).data;assert.equal(defaultNotices.unread,0);assert.ok(Object.values(defaultNotices.preferences).every(Boolean));
assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'seller')).status,200);assert.equal((await call('/api/friends/request','POST',{userId:'buyer'},'seller')).status,200);let buyerNotices=(await call('/api/notifications','GET',undefined,'buyer')).data;assert.equal(buyerNotices.unread,1);assert.equal(buyerNotices.notifications[0].kind,'friend_request');assert.equal(buyerNotices.notifications[0].target_id,'seller');assert.equal(buyerNotices.notifications[0].actor_name,sql.prepare("SELECT name FROM wm_public_users WHERE id='seller'").get().name);assert.equal(buyerNotices.notifications[0].email,undefined);
assert.equal((await call('/api/friends/respond','POST',{userId:'seller',accept:true},'buyer')).status,200);let sellerNotices=(await call('/api/notifications','GET',undefined,'seller')).data;assert.equal(sellerNotices.notifications.filter(n=>n.kind==='friend_accepted').length,1);
const privateNoteId=buyerNotices.notifications[0].id;await call('/api/notifications/read','POST',{ids:[privateNoteId]},'outsider');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,1);await call('/api/notifications/read','POST',{ids:[privateNoteId]},'buyer');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,0);assert.ok((await call('/api/notifications','GET',undefined,'buyer')).data.notifications[0].read_at);
const mutedPref=await call('/api/notifications/preferences','POST',{category:'private_messages',enabled:false},'buyer');assert.equal(mutedPref.status,200);await call('/api/threads/'+nt+'/messages','POST',{text:'Muted private event'},'seller');buyerNotices=(await call('/api/notifications','GET',undefined,'buyer')).data;assert.equal(buyerNotices.unread,0);assert.equal(buyerNotices.notifications[0].alert_enabled,0);assert.equal(buyerNotices.preferences.private_messages,false);assert.equal((await call('/api/notifications?summary=1','GET',undefined,'seller')).data.preferences.private_messages,true);
await call('/api/notifications/preferences','POST',{category:'private_messages',enabled:true},'buyer');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,0);await call('/api/threads/'+nt+'/messages','POST',{text:'Unmuted private event'},'seller');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,1);
await call('/api/notifications/preferences','POST',{category:'private_messages',enabled:false},'buyer');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,0);await call('/api/notifications/preferences','POST',{category:'private_messages',enabled:true},'buyer');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,0);
assert.equal((await call('/api/notifications/preferences','POST',{category:'forged',enabled:true},'buyer')).status,400);assert.equal((await call('/api/notifications/read','POST',{ids:['x']},'buyer')).status,400);assert.equal((await call('/api/notifications/preferences','POST',{category:'deal_updates',enabled:false},'buyer','https://evil.local')).status,403);
// One request notification even after first message and repeated open-chat calls.
const freshRequest=await call('/api/threads','POST',{userId:'outsider'},peerId);assert.equal(freshRequest.status,201);const requestId=freshRequest.data.thread.id;await call('/api/threads/'+requestId+'/messages','POST',{text:'New request'},peerId);await call('/api/threads','POST',{userId:'outsider'},peerId);assert.equal(sql.prepare("SELECT count(*) n FROM wm_notifications WHERE user_id='outsider' AND target_id=? AND category='message_requests'").get(requestId).n,1);
// Group self/outsider exclusion and existing per-chat mute are respected.
await call('/api/groups/'+group+'/preferences','POST',{muted:false},'buyer');const beforeGroup=(await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread;await call('/api/groups/'+group+'/messages','POST',{text:'Group notification'},'seller');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,beforeGroup+1);assert.equal(sql.prepare("SELECT count(*) n FROM wm_notifications WHERE user_id='seller' AND category='group_messages' AND actor_id='seller'").get().n,0);assert.equal(sql.prepare("SELECT count(*) n FROM wm_notifications WHERE user_id=? AND category='group_messages'").get(peerId).n,0);
await call('/api/groups/'+group+'/preferences','POST',{muted:true},'buyer');await call('/api/groups/'+group+'/messages','POST',{text:'Muted group event'},'seller');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,beforeGroup+1);assert.equal((await call('/api/notifications','GET',undefined,'buyer')).data.notifications[0].alert_enabled,0);
// Deal requests and Admin accept/reject/status updates use unique audit event IDs.
await call('/api/deals/'+dnd.data.id+'/action','POST',{action:'reject',version:0},'admin');buyerNotices=(await call('/api/notifications','GET',undefined,'buyer')).data;assert.equal(buyerNotices.notifications[0].title,'Admin rejected the deal');assert.equal(buyerNotices.notifications[0].target_id,dnd.data.id);const notifBeforeFailed=sql.prepare('SELECT count(*) n FROM wm_notifications').get().n;await call('/api/deals/'+dnd.data.id+'/action','POST',{action:'accept',version:0},'admin');assert.equal(sql.prepare('SELECT count(*) n FROM wm_notifications').get().n,notifBeforeFailed);
const eventsBeforeRollback=sql.prepare('SELECT count(*) n FROM wm_notifications').get().n;sql.exec('BEGIN');sql.prepare('INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES(?,?,?,?)').run(nt,'seller','Rollback notification',Date.now());sql.exec('ROLLBACK');assert.equal(sql.prepare('SELECT count(*) n FROM wm_notifications').get().n,eventsBeforeRollback);
await call('/api/notifications/read','POST',{all:true},'buyer');assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,0);assert.equal(sql.prepare("SELECT count(*) n FROM wm_notifications WHERE user_id='buyer' AND read_at IS NULL").get().n,0);
// Count and pagination remain accurate beyond 99; history is not discarded by mute.
for(let i=0;i<105;i++)sql.prepare('INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES(?,?,?,?)').run(nt,'seller','Pagination event '+i,Date.now());const page1=(await call('/api/notifications','GET',undefined,'buyer')).data;assert.equal(page1.unread,105);assert.equal(page1.notifications.length,30);assert.ok(page1.next);const page2=(await call('/api/notifications?before='+page1.next,'GET',undefined,'buyer')).data;assert.equal(page2.notifications.length,30);assert.ok(page2.notifications.every(n=>n.id<page1.next));assert.equal((await call('/api/notifications?summary=1','GET',undefined,'buyer')).data.unread,105);
console.log('PASS: notification defaults, friend/request deduplication, read state isolation, category and per-chat mute history, future-only unmute, private/group/deal delivery, rollback atomicity, CSRF, persisted count >99 and cursor pagination.');

}

// Apply the real additive migration to the preceding schema and preserve all references/counters.
{
 const beforeSchema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').split('\nCREATE TABLE wm_thread_posts')[0].replace(",post_intent TEXT NOT NULL DEFAULT 'sell' CHECK(post_intent IN ('sell','need')),description TEXT NOT NULL DEFAULT ''",'');assert.ok(!beforeSchema.includes('post_intent'));
 const migrationDb=new DatabaseSync(':memory:');migrationDb.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER,created_at INTEGER);'+beforeSchema);
 migrationDb.exec("INSERT INTO users(id,name) VALUES('legacy-buyer','Legacy Buyer'),('legacy-seller','Legacy Seller'); INSERT INTO wm_posts(id,user_id,title,details,price,kind,status,created_at) VALUES('legacy-post','legacy-seller','Existing account','Keep description',5000,'Game ID','approved',1); INSERT INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,status,created_at,is_deal) VALUES('legacy-thread','legacy-buyer','legacy-seller','legacy-post','legacy-pair','accepted',1,1); INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,price,status,post_id,created_at) VALUES('legacy-deal','legacy-thread','legacy-buyer','legacy-seller',5000,'completed','legacy-post',1); INSERT INTO wm_groups(id,owner_id,name,created_at) VALUES('legacy-group','legacy-seller','Old group',1); INSERT INTO wm_group_members VALUES('legacy-group','legacy-buyer'); INSERT INTO wm_settings VALUES('mute:legacy-buyer:legacy-group','1');");
 const beforeNumbers=JSON.stringify({listing:migrationDb.prepare('SELECT * FROM wm_listing_ids').all(),deal:migrationDb.prepare('SELECT * FROM wm_deal_ids').all()});migrationDb.exec(readFileSync(new URL('./migrations/017_need_posts_notifications.sql',import.meta.url),'utf8'));
 assert.equal(migrationDb.prepare('SELECT post_intent FROM wm_posts').get().post_intent,'sell');assert.equal(migrationDb.prepare('SELECT description FROM wm_posts').get().description,'');assert.equal(migrationDb.prepare('SELECT post_id FROM wm_deals').get().post_id,'legacy-post');assert.equal(migrationDb.prepare('SELECT thread_id FROM wm_deals').get().thread_id,'legacy-thread');assert.equal(migrationDb.prepare('SELECT muted FROM wm_chat_preferences').get().muted,1);assert.equal(migrationDb.prepare('SELECT count(*) n FROM wm_notifications').get().n,0);assert.equal(JSON.stringify({listing:migrationDb.prepare('SELECT * FROM wm_listing_ids').all(),deal:migrationDb.prepare('SELECT * FROM wm_deal_ids').all()}),beforeNumbers);migrationDb.close();
 console.log('PASS: migration 017 preserves existing posts/deals/thread references, serial counters and legacy group mute, with no historical notification flood.');
}

// Website metadata shares the owner-controlled app settings and escapes HTML.
assert.equal(brandedPage('<head><title>Old</title></head>',{name:'Wize & "Book" <safe>',description:'A "description" <script>'}),'<head><meta name="description" content="A &quot;description&quot; &lt;script&gt;"><title>Wize &amp; &quot;Book&quot; &lt;safe&gt;</title></head>');
console.log('PASS: website/app metadata uses saved branding with HTML escaping.');

// Per-conversation unread counters are based on real incoming messages, not event totals.
{
 sql.exec('DELETE FROM wm_limits');
 for(const id of ['countBuyer','countSeller','countOther']){const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+1000000,Date.now())}
 const target='countBuyer',sender='countSeller',other='countOther',conversation=crypto.randomUUID(),countGroup=crypto.randomUUID();
 sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,status,created_at) VALUES(?,?,?,?,'accepted',?)").run(conversation,sender,target,'counts-'+conversation,Date.now());
 sql.prepare('INSERT INTO wm_groups(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(countGroup,'admin','Unread test group',Date.now());
 for(const id of [target,sender,'admin'])sql.prepare('INSERT INTO wm_group_members VALUES(?,?)').run(countGroup,id);
 const unread=async(id=target)=>(await call('/api/chat-unread','GET',undefined,id)).data;
 const send=async(text,id=sender)=>call('/api/threads/'+conversation+'/messages','POST',{text},id);
 const count=(data,kind,id)=>data.chats.find(c=>c.kind===kind&&c.id===id)?.unread||0;
 const read=async(kind,id,messageId,as=target)=>call('/api/chats/read','POST',{kind,id,messageId},as);
 assert.equal((await call('/api/chat-unread')).status,401);assert.equal((await unread()).total,0);
 const incoming=[];for(let i=0;i<3;i++){assert.equal((await send('Incoming '+i)).status,201);incoming.push(sql.prepare('SELECT max(id) id FROM wm_messages WHERE thread_id=?').get(conversation).id)}
 await send('My own reply',target);assert.equal(count(await unread(),'private',conversation),3);assert.equal(count(await unread(sender),'private',conversation),1);assert.equal(count(await unread(other),'private',conversation),0);
 // An event created after the displayed snapshot must survive marking that snapshot read.
 await send('Arrived during read');const newest=sql.prepare('SELECT max(id) id FROM wm_messages WHERE thread_id=?').get(conversation).id;
 assert.equal((await read('private',conversation,incoming.at(-1))).status,200);assert.equal(count(await unread(),'private',conversation),1);
 await read('private',conversation,incoming[0]);assert.equal(count(await unread(),'private',conversation),1);assert.equal(sql.prepare("SELECT last_read_id FROM wm_chat_reads WHERE user_id=? AND kind='private' AND chat_id=?").get(target,conversation).last_read_id,incoming.at(-1));
 assert.equal((await read('private',conversation,newest,other)).status,404);assert.equal((await read('group',countGroup,1,other)).status,403);assert.equal((await read('private',conversation,-1)).status,400);assert.equal((await call('/api/chats/read','POST',{kind:'private',id:conversation,messageId:newest},target,'https://evil.local')).status,403);
 await read('private',conversation,newest);assert.equal(count(await unread(),'private',conversation),0);
 for(let i=0;i<105;i++)sql.prepare('INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES(?,?,?,?)').run(conversation,sender,'Count above 99 '+i,Date.now());
 assert.equal(count(await unread(),'private',conversation),105);
 await call('/api/chats/action','POST',{kind:'private',id:conversation,action:'mute'},target);
 let summary=await unread();assert.equal(count(summary,'private',conversation),105);assert.equal(summary.total,0);assert.equal(summary.chats[0].muted,1);assert.equal((await unread(sender)).total,1);
 await call('/api/chats/action','POST',{kind:'private',id:conversation,action:'unmute'},target);assert.equal((await unread()).total,105);
 // Per-group mute suppresses only the global green badge, retaining a grey chat count.
 for(const text of ['Group one','Group two'])assert.equal((await call('/api/groups/'+countGroup+'/messages','POST',{text},sender)).status,201);
 assert.equal(count(await unread(),'group',countGroup),2);assert.equal(count(await unread(sender),'group',countGroup),0);
 await call('/api/groups/'+countGroup+'/preferences','POST',{muted:true},target);summary=await unread();assert.equal(count(summary,'group',countGroup),2);assert.equal(summary.total,105);
 await call('/api/groups/'+countGroup+'/preferences','POST',{muted:false},target);assert.equal((await unread()).total,107);
 const lastGroup=sql.prepare('SELECT max(id) id FROM wm_group_messages WHERE group_id=?').get(countGroup).id;
 assert.equal((await read('private',conversation,lastGroup)).status,404);
 assert.equal((await read('group',countGroup,lastGroup)).status,200);assert.equal(count(await unread(),'group',countGroup),0);
 sql.prepare('INSERT INTO wm_group_members VALUES(?,?)').run(countGroup,other);assert.equal(count(await unread(other),'group',countGroup),0);
 await call('/api/groups/'+countGroup+'/messages','POST',{text:'After joining'},sender);assert.equal(count(await unread(other),'group',countGroup),1);
 // Empty request threads never count as messages. Sending the request increments once.
 const request=(await call('/api/threads','POST',{userId:target},other)).data.thread.id;
 assert.equal((await unread()).requests,0);assert.equal(count(await unread(),'private',request),0);
 await call('/api/threads/'+request+'/messages','POST',{text:'A real request'},other);assert.equal((await unread()).requests,1);assert.equal(count(await unread(),'private',request),1);
 await call('/api/threads','POST',{userId:target},other);assert.equal((await unread()).requests,1);
 const requestMessage=sql.prepare('SELECT max(id) id FROM wm_messages WHERE thread_id=?').get(request).id;await read('private',request,requestMessage);assert.equal((await unread()).requests,0);
 // Deletion is viewer-scoped and blocks do not disclose or count blocked conversations.
 await call('/api/chats/action','POST',{kind:'private',id:conversation,action:'delete'},target);assert.equal(count(await unread(),'private',conversation),0);await send('After clearing my history');assert.equal(count(await unread(),'private',conversation),1);
 await call('/api/blocks','POST',{userId:sender,blocked:true},target);assert.equal(count(await unread(),'private',conversation),0);await call('/api/blocks','POST',{userId:sender,blocked:false},target);assert.equal(count(await unread(),'private',conversation),1);
 console.log('PASS: real per-chat incoming counts, requests, >99, persistent monotonic read cursors, in-flight message safety, user isolation/CSRF, private/group mute, join baselines, deletions and blocks.');
}
// Migration 018 preserves messages and saved mute, carrying unread legacy events forward.
{
 const before=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').split('-- Message counts use per-member read cursors')[0];
 const migrated=new DatabaseSync(':memory:');migrated.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER,created_at INTEGER);'+before);
 migrated.exec("INSERT INTO users(id,name) VALUES('m-buyer','Migration Buyer'),('m-seller','Migration Seller'); INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,status,created_at) VALUES('m-thread','m-seller','m-buyer','m-pair','accepted',1); INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES('m-thread','m-seller','Already read',1); UPDATE wm_notifications SET read_at=2; INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES('m-thread','m-seller','Still unread',3); INSERT INTO wm_chat_preferences(user_id,kind,chat_id,muted,updated_at) VALUES('m-buyer','private','m-thread',1,1);");
 const messages=JSON.stringify(migrated.prepare('SELECT * FROM wm_messages').all());migrated.exec(readFileSync(new URL('./migrations/018_chat_unread.sql',import.meta.url),'utf8'));
 assert.equal(JSON.stringify(migrated.prepare('SELECT * FROM wm_messages').all()),messages);assert.equal(migrated.prepare("SELECT last_read_id FROM wm_chat_reads WHERE user_id='m-buyer'").get().last_read_id,1);assert.equal(migrated.prepare('SELECT muted FROM wm_chat_preferences').get().muted,1);migrated.close();
 console.log('PASS: migration 018 retains prior messages, unread legacy history and saved conversation mutes.');
}
// Friends, listing availability, voice attachments and owner appearance settings.
{
 for(const id of ['social-buyer','social-seller','social-other']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+600000,Date.now())}tokens.owner=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(tokens.owner),'owner',Date.now()+600000,Date.now());
 const b='social-buyer',s='social-seller',o='social-other',a='owner';
 assert.equal((await call('/api/friends/count')).status,401);assert.ok((await call('/api/friends/suggestions','GET',undefined,b)).data.people.some(p=>p.id===s));
 assert.equal((await call('/api/friends/request','POST',{userId:b},s)).status,200);assert.equal((await call('/api/friends/request','POST',{userId:b},s)).status,200);assert.equal((await call('/api/friends/count','GET',undefined,b)).data.count,1);assert.equal((await call('/api/friends/count','GET',undefined,o)).data.count,0);
 assert.equal((await call('/api/friends/respond','POST',{userId:s,accept:true},o)).status,404);assert.equal((await call('/api/friends/respond','POST',{userId:s,accept:true},b)).status,200);assert.equal((await call('/api/friends/count','GET',undefined,b)).data.count,0);assert.ok(!(await call('/api/friends/suggestions','GET',undefined,b)).data.people.some(p=>p.id===s));
 await call('/api/blocks','POST',{userId:o,blocked:true},b);assert.ok(!(await call('/api/friends/suggestions','GET',undefined,b)).data.people.some(p=>p.id===o));
 const sale=(await call('/api/posts','POST',{...post,title:'Available gaming account'},s)).data.id;let version=sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(sale).version;
 assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'sold',version},o)).status,404);assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'sold',version},a)).status,404);assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'sold',version},s,'https://evil.local')).status,403);
 assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'sold',version},s)).status,200);assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'available',version},s)).status,409);assert.equal((await call('/api/posts/'+sale+'/availability','POST',{availability:'available',version:version+1},s)).status,200);
 const needPost=(await call('/api/posts','POST',{title:'Need a game account',kind:'Game ID',postIntent:'need',media:[]},b)).data.id;assert.equal((await call('/api/posts/'+needPost+'/availability','POST',{availability:'sold',version:0},b)).status,400);
 const chatId=crypto.randomUUID(),dealId=crypto.randomUUID();sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,status,created_at) VALUES(?,?,?,?,?,'accepted',?)").run(chatId,b,s,sale,'social-test',Date.now());sql.prepare("INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,admin_id,price,buyer_ok,seller_ok,buyer_done,seller_done,status,created_at) VALUES(?,?,?,?,?,5000,1,1,1,1,'awaiting_final',?)").run(dealId,chatId,b,s,a,Date.now());
 assert.equal(sql.prepare('SELECT availability FROM wm_posts WHERE id=?').get(sale).availability,'available');assert.equal((await call('/api/deals/'+dealId+'/action','POST',{action:'finalize',version:0},a)).status,200);assert.equal(sql.prepare('SELECT availability FROM wm_posts WHERE id=?').get(sale).availability,'sold');
 const voice=new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,1,2,3,4]);const upload=await worker.fetch(new Request('https://test.local/api/upload',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens[s],'content-type':'audio/webm'},body:voice}),env);assert.equal(upload.status,201);const audio=await upload.json();
 assert.equal((await call('/api/threads/'+chatId+'/messages','POST',{text:'media:'+audio.type+':'+audio.url},s)).status,201);assert.equal((await worker.fetch(new Request('https://test.local'+audio.url,{headers:{cookie:'wm_session='+tokens[b]}}),env)).status,200);assert.equal((await worker.fetch(new Request('https://test.local'+audio.url,{headers:{cookie:'wm_session='+tokens[o]}}),env)).status,404);assert.equal((await call('/api/threads/'+chatId+'/messages','POST',{text:'media:'+audio.type+':'+audio.url},b)).status,404);assert.equal((await call('/api/posts','POST',{...post,media:[{id:audio.id}]},s)).status,400);
 const badAudio=await worker.fetch(new Request('https://test.local/api/upload',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens[s],'content-type':'audio/ogg'},body:voice}),env);assert.equal(badAudio.status,415);
 const appearance=(await call('/api/appearance')).data;assert.equal((await call('/api/admin/appearance','POST',appearance,b)).status,403);const customized={...appearance,navOrder:['friends','home','post','messages','profile'],navLabels:{...appearance.navLabels,friends:'My friends'},metaTitle:'Wize Gaming',feedTitle:'Game accounts',density:'compact'};
 assert.equal((await call('/api/admin/appearance','POST',customized,a)).status,200);assert.deepEqual((await call('/api/appearance')).data,customized);assert.equal((await call('/api/admin/appearance','POST',{...customized,navOrder:['home','home','post','friends','profile']},a)).status,400);assert.equal((await call('/api/admin/appearance','POST',{...customized,navLabels:{...customized.navLabels,post:'x'.repeat(17)}},a)).status,400);
 console.log('PASS: Friends counts/deduplication/consent/block isolation; owner-only versioned Available/Sold; automatic sold on Admin completion; validated private voice uploads; owner-only navigation order/labels/SEO.');
}
// Migration 019 preserves listing data and backfills completed Sell IDs only.
{
 const before=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').split('CREATE TRIGGER IF NOT EXISTS wm_deal_auto_sold')[0].replace(",availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','sold'))",'');
 const migrated=new DatabaseSync(':memory:');migrated.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,picture TEXT);'+before);migrated.exec("INSERT INTO users(id,name) VALUES('s','Seller'),('b','Buyer'),('a','Admin'); INSERT INTO wm_posts(id,user_id,title,details,kind,status,created_at) VALUES('listing','s','Existing title','Existing details','Game ID','approved',1); INSERT INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,created_at) VALUES('chat','b','s','listing','pair',1); INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,admin_id,price,status,created_at) VALUES('deal','chat','b','s','a',1,'completed',1);");migrated.exec(readFileSync(new URL('./migrations/019_friends_composer_sold.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare("SELECT availability FROM wm_posts WHERE id='listing'").get().availability,'sold');assert.equal(migrated.prepare("SELECT details FROM wm_posts WHERE id='listing'").get().details,'Existing details');assert.equal(migrated.prepare('SELECT count(*) n FROM wm_deals').get().n,1);migrated.close();console.log('PASS: migration 019 preserves posts/deals while marking completed Sell IDs sold.');
}
// Shared-group Admin suggestions and changing a pending mediator require fresh consent.
{
 for(const id of ['blue-buyer','blue-seller','blue-admin','blue-unrelated','blue-other']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());tokens[id]=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(tokens[id]),id,Date.now()+600000,Date.now())}sql.prepare("INSERT INTO wm_roles VALUES('blue-admin','trusted'),('blue-unrelated','trusted')").run();
 const b='blue-buyer',s='blue-seller',a='blue-admin',other='blue-other';const common=crypto.randomUUID(),notCommon=crypto.randomUUID();sql.prepare('INSERT INTO wm_groups(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(common,a,'Our shared group',Date.now());sql.prepare('INSERT INTO wm_groups(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(notCommon,'blue-unrelated','Buyer only group',Date.now());for(const [g,id]of [[common,b],[common,s],[common,a],[notCommon,b]])sql.prepare('INSERT INTO wm_group_members VALUES(?,?)').run(g,id);
 const sale=(await call('/api/posts','POST',{...post,title:'Blue recommendation test'},s)).data.id;sql.prepare("UPDATE wm_posts SET status='approved' WHERE id=?").run(sale);
 assert.equal((await call('/api/deal-admins?postId='+sale)).status,401);let recommendations=(await call('/api/deal-admins?postId='+sale,'GET',undefined,b)).data;assert.equal(recommendations.mode,'mediated');assert.deepEqual(recommendations.recommended.map(u=>u.id),[a]);assert.equal(recommendations.recommended[0].groups[0].name,'Our shared group');assert.equal(recommendations.owner.id,'owner');assert.equal(recommendations.owner.email,undefined);
 const unrelated=(await call('/api/deal-admins?postId='+sale,'GET',undefined,other)).data;assert.equal(unrelated.recommended.length,0);assert.equal(unrelated.owner.id,'owner');
 assert.equal((await call('/api/deals','POST',{postId:sale,adminId:b},b)).status,400);assert.equal((await call('/api/deals','POST',{postId:sale,adminId:other},b)).status,400);
 const created=await call('/api/deals','POST',{postId:sale,adminId:a},b);assert.equal(created.status,201);const d=created.data.deal;assert.equal(d.admin_id,a);assert.equal(d.status,'awaiting_seller');assert.equal(d.buyer_ok,1);assert.equal(d.seller_ok,0);
 assert.equal((await call('/api/deal-admins?dealId='+d.id,'GET',undefined,other)).status,404);assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'change_admin',adminId:'owner',version:0},a)).status,403);
 assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'change_admin',adminId:'owner',version:0},s)).status,200);let changed=(await call('/api/deals/'+d.id,'GET',undefined,b)).data.deal;assert.equal(changed.admin_id,'owner');assert.equal(changed.status,'proposed');assert.equal(changed.seller_ok,1);assert.equal(changed.buyer_ok,0);
 assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'accept',version:1},'owner')).status,409);assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'confirm',version:1},b)).status,200);assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'accept',version:2},'owner')).status,200);assert.equal((await call('/api/deals/'+d.id+'/action','POST',{action:'change_admin',adminId:a,version:3},b)).status,409);
 const history=(await call('/api/deals/'+d.id+'/history','GET',undefined,b)).data.events;assert.ok(history.some(e=>e.action==='admin_changed'));
 const trustedPost=(await call('/api/posts','POST',{...post,title:'Admin listing'},a)).data.id;sql.prepare("UPDATE wm_posts SET status='approved' WHERE id=?").run(trustedPost);const direct=(await call('/api/deal-admins?postId='+trustedPost,'GET',undefined,b)).data;assert.equal(direct.mode,'direct');assert.equal(direct.sellerAdmin.id,a);
 const beforeDelete=(await call('/api/posts/'+sale,'GET',undefined,s)).data.post;assert.equal((await call('/api/posts/'+sale+'/delete','POST',{version:beforeDelete.version},other)).status,404);assert.equal((await call('/api/posts/'+sale+'/delete','POST',{version:beforeDelete.version},s)).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM wm_deals WHERE id=?').get(d.id).n,1);
 console.log('PASS: shared-group Admin suggestions, private participant scope, Owner fallback, explicit mediator selection, pending Admin changes reset consent, active deal guards and owner-only soft delete preserve deals.');
}
// A post reference belongs to the actual private message, including reused threads.
{
 const previousAI=env.AI;env.AI={run:async()=>({response:{decision:'safe',category:'none',confidence:1}})};
 for(const id of ['ref-buyer','ref-seller','ref-other','ref-admin']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());tokens[id]=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(tokens[id]),id,Date.now()+600000,Date.now())}sql.prepare("INSERT INTO wm_roles VALUES('ref-admin','trusted')").run();
 const b='ref-buyer',s='ref-seller',other='ref-other';const first=(await call('/api/posts','POST',{...post,title:'First referenced ID'},s)).data.id,second=(await call('/api/posts','POST',{...post,title:'Second referenced ID'},s)).data.id,unlinked=(await call('/api/posts','POST',{...post,title:'Unlinked ID'},s)).data.id;
 const thread=(await call('/api/threads','POST',{postId:first},b)).data.thread.id;
 assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Is this ID available?',postId:first},b)).status,201);assert.equal(sql.prepare('SELECT count(*) n FROM wm_messages WHERE thread_id=?').get(thread).n,1);
 const reused=(await call('/api/threads','POST',{postId:second},b)).data.thread.id;assert.equal(reused,thread);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Second one',postId:second},b)).status,403);await call('/api/threads/'+thread+'/accept','POST',{},s);
 assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'What about this second ID?',postId:second},b)).status,201);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Ordinary reply'},s)).status,201);
 let messages=(await call('/api/threads/'+thread+'/messages','GET',undefined,s)).data.messages;assert.equal(messages[0].post,undefined);assert.equal(messages[1].post.id,second);assert.equal(messages[1].post.title,'Second referenced ID');assert.equal(messages[2].post.id,first);assert.match(messages[2].post.listing_code,/ID No - /);assert.equal(messages[2].post.email,undefined);
 assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Forged reference',postId:unlinked},b)).status,403);assert.equal((await call('/api/threads/'+thread+'/messages','GET',undefined,other)).status,404);
 const referencedMessage=messages[1].id;await call('/api/threads/'+thread+'/messages/'+referencedMessage+'/delete','POST',{},b);messages=(await call('/api/threads/'+thread+'/messages','GET',undefined,s)).data.messages;assert.equal(messages.find(m=>m.id===referencedMessage).post,undefined);await call('/api/threads/'+thread+'/messages/'+referencedMessage+'/restore','POST',{},b);
 sql.prepare('UPDATE wm_posts SET deleted_at=? WHERE id=?').run(Date.now(),second);messages=(await call('/api/threads/'+thread+'/messages','GET',undefined,s)).data.messages;assert.equal(messages.find(m=>m.id===referencedMessage).post.unavailable,true);assert.equal(messages.find(m=>m.id===referencedMessage).post.title,undefined);
 // Group destinations can be added, changed and cleared with the same versioned post.
 const g1=crypto.randomUUID(),g2=crypto.randomUUID(),foreign=crypto.randomUUID();for(const [id,name]of [[g1,'First edit group'],[g2,'Second edit group'],[foreign,'Unjoined group']]){sql.prepare('INSERT INTO wm_groups(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(id,'ref-admin',name,Date.now());sql.prepare('INSERT INTO wm_group_ranges(id,group_id,label,min_price,max_price,created_at) VALUES(?,?,?,0,100000,?)').run(crypto.randomUUID(),id,'All prices',Date.now())}for(const g of [g1,g2])sql.prepare('INSERT INTO wm_group_members VALUES(?,?)').run(g,s);
 const current=async()=> (await call('/api/posts/'+first,'GET',undefined,s)).data.post;let before=await current();assert.equal((await call('/api/posts/'+first+'/edit','POST',{...post,title:'First referenced ID',groupId:null,groupIds:[g1,g2],version:before.version},s)).status,200);let edited=await current();assert.deepEqual(new Set(edited.group_ids),new Set([g1,g2]));assert.equal(edited.group_id,null);
 assert.equal((await call('/api/posts/'+first+'/edit','POST',{...post,title:'First referenced ID',groupId:null,groupIds:[g2],version:edited.version},s)).status,200);edited=await current();assert.deepEqual(edited.group_ids,[g2]);
 assert.equal((await call('/api/posts/'+first+'/edit','POST',{...post,title:'First referenced ID',groupId:null,groupIds:[],version:edited.version},s)).status,200);edited=await current();assert.equal(edited.group_ids.length,0);
 assert.equal((await call('/api/posts/'+first+'/edit','POST',{...post,groupIds:[foreign],version:edited.version},s)).status,403);assert.equal((await current()).version,edited.version);
 // Simulate a concurrent revision while moderation is running; no group writes may leak.
 let raced=false;env.AI={run:async()=>{if(!raced){raced=true;sql.prepare('UPDATE wm_posts SET version=version+1 WHERE id=?').run(first)}return {response:{decision:'safe',category:'none',confidence:1}}}};
 assert.equal((await call('/api/posts/'+first+'/edit','POST',{...post,groupIds:[g1],version:edited.version},s)).status,409);assert.equal((await current()).group_ids.length,0);env.AI={run:async()=>({response:{decision:'safe',category:'none',confidence:1}})};
 const legacy=(await call('/api/posts','POST',{...post,title:'Private group original',groupId:g1},s)).data.id;let lp=(await call('/api/posts/'+legacy,'GET',undefined,s)).data.post;assert.equal((await call('/api/posts/'+legacy+'/edit','POST',{...post,title:lp.title,version:lp.version},s)).status,200);lp=(await call('/api/posts/'+legacy,'GET',undefined,s)).data.post;assert.equal(lp.group_id,g1);
 sql.prepare('INSERT INTO wm_thread_posts(thread_id,post_id,created_at) VALUES(?,?,?)').run(thread,legacy,Date.now());assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Private group reference',postId:legacy},s)).status,403);
 assert.equal((await call('/api/posts/'+legacy+'/edit','POST',{...post,title:lp.title,groupId:null,groupIds:[],version:lp.version},s)).status,200);lp=(await call('/api/posts/'+legacy,'GET',undefined,s)).data.post;assert.equal(lp.group_id,null);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Now public reference',postId:legacy},s)).status,201);
 env.AI=previousAI;console.log('PASS: durable per-message Post ID/cards across reused chats; request consent, access and group privacy; mutable Public/Public+Group destinations, legacy privacy, range placement and atomic version-race guards.');
}
// Migration 020 keeps existing message text, read cursors and thread records.
{
 const before=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').replace('archived_at INTEGER,post_id TEXT REFERENCES wm_posts(id));','archived_at INTEGER);');const migrated=new DatabaseSync(':memory:');migrated.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);'+before);migrated.exec("INSERT INTO users(id,name) VALUES('b','Buyer'),('s','Seller');INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,created_at) VALUES('t','b','s','b:s',1);INSERT INTO wm_messages(thread_id,user_id,text,created_at) VALUES('t','b','Keep original message',1);INSERT INTO wm_chat_reads VALUES('s','private','t',1,1);");migrated.exec(readFileSync(new URL('./migrations/020_message_post_references.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare('SELECT text FROM wm_messages').get().text,'Keep original message');assert.equal(migrated.prepare('SELECT post_id FROM wm_messages').get().post_id,null);assert.equal(migrated.prepare('SELECT last_read_id FROM wm_chat_reads').get().last_read_id,1);migrated.close();console.log('PASS: migration 020 preserves existing messages and read state.');
}
// Protected deal steps, secure handover, listing rules, safe names, trust card and share previews (migration 021).
{
 const previousAI=env.AI;env.AI=safeAI;sql.exec('DELETE FROM wm_limits; DELETE FROM wm_suspensions');env.WM_DATA_KEY='test-data-key-0123456789abcdef0123456789abcdef';
 for(const id of ['pseller','pbuyer','newbie','vip']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+1000000,Date.now())}
 sql.prepare('INSERT INTO wm_verifications(user_id,granted_by,created_at) VALUES(?,?,?)').run('vip','owner',Date.now());
 const strict={...legacyRules,protectedDeals:true,requireGameUid:true,relistCooldownHours:24,dailyPostsUnverified:1,activePostsUnverified:3,dailyPostsVerified:10,activePostsVerified:30,dailyNeedPosts:3,expireDays:30,hideSold:true,nameRules:true,blockDuplicates:true};
 assert.equal((await call('/api/admin/market-rules','POST',strict,'admin')).status,403);
 assert.equal((await call('/api/admin/market-rules','POST',{...strict,holdHours:-1},'owner')).status,400);
 assert.equal((await call('/api/admin/market-rules','POST',{...strict,hideSold:'yes'},'owner')).status,400);
 assert.equal((await call('/api/admin/market-rules','POST',strict,'owner')).status,200);assert.equal((await call('/api/market-rules')).data.rules.protectedDeals,true);
 // Game UID: required, private, normalized (Bangla digits, spaces, dashes) and one active listing per UID.
 assert.equal(normalizeGameUid(' ১২৩-৪৫৬ ৭৮৯ '),'123456789');assert.throws(()=>normalizeGameUid('12'));
 const listing={title:'FF level 70 ID',details:'Evo guns and rare bundles',price:5000,kind:'Game ID',media:[],gameCategory:'free-fire'};
 let r;
 assert.equal((await call('/api/posts/precheck','POST',{...listing,postIntent:'sell',gameUid:'১২৩ ৪৫৬ ৭৮৯'},'pseller')).status,200);
 r=await call('/api/posts','POST',{...listing,gameUid:'123-456-789'},'pseller');assert.equal(r.status,201);const pListing=r.data.id;
 const stored=sql.prepare('SELECT uid_hash game_uid_hash,uid_enc game_uid_enc,uid_hint game_uid_hint FROM wm_post_uids WHERE post_id=?').get(pListing);assert.deepEqual({...sql.prepare('SELECT game_uid_hash,game_uid_enc,game_uid_hint FROM wm_posts WHERE id=?').get(pListing)},{game_uid_hash:null,game_uid_enc:null,game_uid_hint:''});assert.match(stored.game_uid_hash,/^[a-f0-9]{64}$/);assert.ok(stored.game_uid_enc.startsWith('v1.')&&!stored.game_uid_enc.includes('123456789'));assert.equal(stored.game_uid_hint,'789');
 const publicCopy=(await call('/api/listing/'+pListing,'GET',undefined,'buyer')).data.post;assert.equal(publicCopy.game_uid_hash,undefined);assert.equal(publicCopy.game_uid_enc,undefined);assert.equal(publicCopy.game_uid_hint,undefined);assert.equal(publicCopy.has_game_uid,true);
 const guestCopy=(await call('/api/feed')).data.posts.find(p=>p.id===pListing);assert.ok(guestCopy);assert.equal(guestCopy.game_uid_hint,undefined);assert.equal(guestCopy.game_uid_hash,undefined);
 assert.equal((await call('/api/my-posts','GET',undefined,'pseller')).data.posts.find(p=>p.id===pListing).game_uid_hint,'789');
 r=await call('/api/posts','POST',{...listing,title:'Second ID',gameUid:'99887766'},'pseller');assert.equal(r.status,429);assert.match(r.data.error,/Verified members can post more/);
 assert.equal((await call('/api/posts/precheck','POST',{...listing,postIntent:'sell',gameUid:'99887766'},'pseller')).status,429);
 assert.equal((await call('/api/posts','POST',{postIntent:'need',title:'Need FF ID under 5k',details:'',kind:'Community post',media:[]},'pseller')).status,201);
 r=await call('/api/posts','POST',{...listing,gameUid:'123456789'},'vip');assert.equal(r.status,409);assert.match(r.data.error,/already listed by another member/);
 r=await call('/api/posts','POST',{...listing,gameCategory:'efootball',gameUid:'123456789'},'vip');assert.equal(r.status,201);const vipListing=r.data.id;
 r=await call('/api/posts','POST',{...listing,title:'Same again',gameCategory:'efootball',gameUid:'123 456 789'},'vip');assert.equal(r.status,409);assert.match(r.data.error,/You already posted this game ID/);
 // Active Sell Post limit for unverified members (daily limit aged out in between).
 for(let i=0;i<3;i++){assert.equal((await call('/api/posts','POST',{...listing,title:'Newbie '+i,gameUid:'5550000'+i},'newbie')).status,201);sql.prepare("UPDATE wm_posts SET created_at=created_at-2*86400000 WHERE user_id='newbie'").run()}
 r=await call('/api/posts','POST',{...listing,title:'Newbie 4',gameUid:'55500009'},'newbie');assert.equal(r.status,429);assert.match(r.data.error,/Active Sell Post limit reached: 3/);
 // Bump: once per interval, needs a UID on game listings, moves the post up without changing its content version.
 r=await call('/api/posts/'+vipListing+'/bump','POST',{},'vip');assert.equal(r.status,429);
 assert.equal((await call('/api/posts/'+vipListing+'/bump','POST',{},'newbie')).status,404);
 sql.prepare('UPDATE wm_posts SET created_at=created_at-25*3600000 WHERE id=?').run(vipListing);const vipVersion=sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(vipListing).version;
  assert.equal((await call('/api/posts/'+vipListing+'/bump','POST',{},'vip')).status,200);assert.equal(sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(vipListing).version,vipVersion);
 assert.equal((await call('/api/feed?limit=30')).data.posts[0].id,vipListing);
 // Expired listings leave the feed but stay on the owner's profile until renewed.
 sql.prepare('UPDATE wm_posts SET created_at=created_at-31*86400000,bumped_at=NULL,renewed_at=NULL WHERE id=?').run(vipListing);
 assert.equal((await call('/api/feed?limit=30')).data.posts.some(p=>p.id===vipListing),false);assert.ok((await call('/api/my-posts','GET',undefined,'vip')).data.posts.some(p=>p.id===vipListing));
 assert.equal((await call('/api/posts/'+vipListing+'/bump','POST',{},'vip')).status,200);assert.equal((await call('/api/feed?limit=30')).data.posts[0].id,vipListing);
 // Sold listings leave the feed and the UID cannot be relisted during the cooldown.
 const vipPost=(await call('/api/posts/'+vipListing,'GET',undefined,'vip')).data.post;sql.prepare("UPDATE wm_post_uids SET uid_hash='efootball-uid-hash' WHERE post_id=?").run(vipListing);
 assert.equal((await call('/api/posts/'+vipListing+'/availability','POST',{availability:'sold',version:vipPost.version},'vip')).status,200);
 assert.equal((await call('/api/feed?limit=30')).data.posts.some(p=>p.id===vipListing),false);assert.ok(sql.prepare("SELECT until_at FROM wm_uid_cooldowns WHERE uid_hash='efootball-uid-hash'").get().until_at>Date.now());
 const deletable=(await call('/api/posts','POST',{...listing,title:'To delete',gameCategory:'custom',customGameName:'Clash Arena',gameUid:'CA-7788'},'vip'));assert.equal(deletable.status,201);
 assert.equal((await call('/api/posts/'+deletable.data.id+'/delete','POST',{version:0},'vip')).status,200);
 r=await call('/api/posts','POST',{...listing,title:'Relist',gameCategory:'custom',customGameName:'clash arena',gameUid:'ca7788'},'vip');assert.equal(r.status,409);assert.match(r.data.error,/sold or removed recently/);
 // Protected deal: payment report, Admin payment confirmation with private proof, handover, delivery, checklist, hold, final.
 const picks=(await call('/api/deal-admins?postId='+pListing,'GET',undefined,'pbuyer')).data;assert.equal(picks.mode,'mediated');assert.ok(picks.owner&&picks.allAdmins.some(x=>x.id==='admin'&&Number.isInteger(x.deals_done)));assert.ok(picks.allAdmins.every(x=>!['pbuyer','pseller'].includes(x.id)));assert.ok(Array.isArray(picks.myGroupAdmins));
 r=await call('/api/deals','POST',{postId:pListing,adminId:'admin'},'pbuyer');assert.equal(r.status,201);const pd=r.data.id;assert.equal(r.data.deal.flow,1);
 // Deal popup alerts: the seller hears about the new request; the Admin only after the buyer and the seller agree on that Admin; the requester does not; guests get 401.
 assert.ok((await call('/api/deal-alerts','GET',undefined,'pseller')).data.alerts.some(a=>a.deal_id===pd&&a.title==='New deal request'&&/^Deal - \d+$/.test(a.deal_code)));
 assert.equal((await call('/api/deal-alerts','GET',undefined,'admin')).data.alerts.some(a=>a.deal_id===pd),false);
 assert.equal((await call('/api/deal-alerts','GET',undefined,'pbuyer')).data.alerts.some(a=>a.deal_id===pd),false);assert.equal((await call('/api/deal-alerts')).status,401);
 const sellerAlert=(await call('/api/deal-alerts','GET',undefined,'pseller')).data.alerts.find(a=>a.deal_id===pd);assert.equal((await call('/api/notifications/read','POST',{ids:[sellerAlert.id]},'pseller')).status,200);assert.equal((await call('/api/deal-alerts','GET',undefined,'pseller')).data.alerts.some(a=>a.id===sellerAlert.id),false);
 const deal=async(who='pbuyer')=>(await call('/api/deals/'+pd,'GET',undefined,who)).data.deal;
 const act=async(who,action,extra={})=>call('/api/deals/'+pd+'/action','POST',{action,version:(await deal()).version,...extra},who);
 assert.equal((await act('admin','accept')).status,409);
 // The seller suggests another Admin: the buyer must agree again; nobody's Admin hears about it before both agree.
 assert.equal((await act('pseller','change_admin',{adminId:'owner'})).status,200);let pending=await deal();assert.equal(pending.admin_id,'owner');assert.equal(pending.buyer_ok,0);assert.equal(pending.seller_ok,1);assert.equal(pending.admin_role,'owner');
 assert.ok((await call('/api/deal-alerts','GET',undefined,'pbuyer')).data.alerts.some(a=>a.deal_id===pd&&a.title==='Another Admin was suggested'));assert.equal((await call('/api/deal-alerts','GET',undefined,'owner')).data.alerts.some(a=>a.deal_id===pd),false);
 assert.equal((await act('owner','accept')).status,409);
 assert.equal((await act('pbuyer','change_admin',{adminId:'admin'})).status,200);pending=await deal();assert.deepEqual([pending.admin_id,pending.buyer_ok,pending.seller_ok,pending.status],['admin',1,0,'proposed']);
 assert.equal((await act('pseller','confirm')).status,200);
 assert.ok((await call('/api/deal-alerts','GET',undefined,'admin')).data.alerts.some(a=>a.deal_id===pd&&a.title==='New deal request'));assert.ok((await call('/api/deal-alerts','GET',undefined,'pbuyer')).data.alerts.some(a=>a.deal_id===pd&&a.title==='Both agreed on the Admin'));
 assert.equal((await act('admin','accept')).status,200);
 let current=await deal();assert.equal(current.status,'active');assert.equal(current.secure_handover,true);assert.equal(current.game_uid,'123456789');assert.equal(current.handover.waiting,false);assert.deepEqual(current.checklist_items.length,5);
 assert.equal((await call('/api/deals/'+pd,'GET',undefined,'outsider')).status,404);assert.equal((await call('/api/deals/'+pd,'GET',undefined,'owner')).status,404);
 assert.equal((await act('pseller','mark_delivered')).status,409);assert.equal((await act('pbuyer','confirm_payment',{})).status,403);
 assert.equal((await act('pbuyer','complete')).status,409);
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]);
 const proofFor=(dealId,who,kind)=>worker.fetch(new Request('https://test.local/api/deals/'+dealId+'/proof',{method:'POST',headers:{origin:'https://test.local','content-type':'image/png','x-proof-kind':kind,cookie:'wm_session='+tokens[who]},body:png}),env),proofReq=(who,kind)=>proofFor(pd,who,kind);
 assert.equal((await act('pbuyer','mark_paid',{note:'sent'})).status,400);
 assert.equal((await proofReq('admin','payment')).status,403);const proofRes=await proofReq('pbuyer','payment');assert.equal(proofRes.status,201);const proofId=(await proofRes.json()).id;
 assert.equal((await act('pbuyer','mark_paid',{proofId:crypto.randomUUID()})).status,400);
 assert.equal((await act('pbuyer','mark_paid',{proofId})).status,200);assert.equal((await act('pbuyer','mark_paid',{proofId})).status,409);
 assert.equal((await call('/api/deals/'+pd+'/handover','POST',{action:'ready'},'pbuyer')).status,409);
 assert.ok((await call('/api/deal-alerts','GET',undefined,'admin')).data.alerts.some(a=>a.deal_id===pd&&a.title==='Buyer sent the money'));
 assert.equal((await act('admin','confirm_payment')).status,200);
 current=await deal();assert.ok(current.activity_at>0);assert.ok(current.funded_at);assert.equal(current.payment_trx,'');assert.equal(current.payment_proof_id,proofId);assert.equal(current.proofs.length,1);
 const proofUrl='https://test.local/api/deals/'+pd+'/proofs/'+proofId;assert.equal((await deal('pseller')).proofs.length,0);assert.equal((await worker.fetch(new Request(proofUrl,{headers:{cookie:'wm_session='+tokens.pseller}}),env)).status,404);
 for(const who of ['pbuyer','admin','owner']){const view=await worker.fetch(new Request(proofUrl,{headers:{cookie:'wm_session='+tokens[who]}}),env);assert.equal(view.status,200,who);assert.equal(view.headers.get('cache-control'),'private,no-store')}
 assert.equal((await worker.fetch(new Request(proofUrl,{headers:{cookie:'wm_session='+tokens.outsider}}),env)).status,404);assert.equal((await worker.fetch(new Request('https://test.local/media/'+proofId),env)).status,404);
 const handover=(who,data)=>call('/api/deals/'+pd+'/handover',data?'POST':'GET',data,who);
 assert.equal((await handover('pseller',{action:'submit',method:'Facebook',login:'fb@example.com',password:'Secret#1'})).status,409);
 assert.equal((await handover('pseller',{action:'ready'})).status,403);assert.equal((await handover('pbuyer',{action:'ready'})).status,200);
 assert.equal((await handover('pseller',{action:'submit',method:'Facebook'})).status,400);
 assert.equal((await handover('pseller',{action:'submit',method:'Facebook',login:'fb@example.com',password:'Secret#1'})).status,200);
 const sealedRow=sql.prepare('SELECT payload FROM wm_deal_handover WHERE deal_id=?').get(pd);assert.ok(sealedRow.payload.startsWith('v1.')&&!sealedRow.payload.includes('Secret')&&!sealedRow.payload.includes('fb@'));
 assert.equal((await handover('admin',{action:'reveal'})).status,403);const adminView=await handover('admin');assert.equal(adminView.data.handover.waiting,true);assert.equal(JSON.stringify(adminView.data).includes('Secret'),false);
 assert.equal((await handover('owner')).status,200);assert.equal((await handover('outsider')).status,404);assert.equal((await handover('owner',{action:'reveal'})).status,404);
 const revealed=await handover('pbuyer',{action:'reveal'});assert.equal(revealed.status,200);assert.equal(revealed.data.details.password,'Secret#1');assert.equal(revealed.data.details.login,'fb@example.com');
 assert.equal((await handover('pbuyer',{action:'reveal'})).status,409);assert.equal(sql.prepare('SELECT payload FROM wm_deal_handover WHERE deal_id=?').get(pd).payload,null);assert.ok((await handover('pseller')).data.handover.revealed_at);
 assert.equal((await act('pseller','mark_delivered')).status,200);
 assert.equal((await act('pbuyer','buyer_confirm',{checklist:['login_checked']})).status,400);
 const checklistRes=await proofReq('pbuyer','checklist');assert.equal(checklistRes.status,201);const checklistProof=(await checklistRes.json()).id;
 assert.equal((await act('pbuyer','buyer_confirm',{checklist:current.checklist_items,proofId:checklistProof})).status,200);
 const checklistUrl='https://test.local/api/deals/'+pd+'/proofs/'+checklistProof;
 assert.equal((await worker.fetch(new Request(checklistUrl,{headers:{cookie:'wm_session='+tokens.pseller}}),env)).status,404);assert.equal((await deal('pseller')).proofs.some(p=>p.kind==='checklist'),false);
 for(const who of ['pbuyer','admin','owner'])assert.equal((await worker.fetch(new Request(checklistUrl,{headers:{cookie:'wm_session='+tokens[who]}}),env)).status,200,who);assert.ok((await deal('admin')).proofs.some(p=>p.kind==='checklist'));
 current=await deal();assert.equal(current.status,'awaiting_final');assert.ok(current.hold_until>Date.now());
 r=await act('admin','finalize');assert.equal(r.status,409);assert.match(r.data.error,/Safety hold/);
 sql.prepare('UPDATE wm_deals SET delivered_at=delivered_at-25*3600000,buyer_done_at=buyer_done_at-25*3600000 WHERE id=?').run(pd);
 assert.equal((await act('pseller','finalize')).status,403);assert.equal((await act('admin','finalize',{payout:'Paid seller via bKash 7X9'})).status,200);
 const done=sql.prepare('SELECT status,payout_note,admin_done FROM wm_deals WHERE id=?').get(pd);assert.equal(done.status,'completed');assert.equal(done.payout_note,'Paid seller via bKash 7X9');
 assert.ok(sql.prepare('SELECT cleared_at FROM wm_deal_handover WHERE deal_id=?').get(pd).cleared_at>0);assert.equal(sql.prepare('SELECT availability FROM wm_posts WHERE id=?').get(pListing).availability,'sold');
 assert.ok(sql.prepare('SELECT until_at FROM wm_uid_cooldowns WHERE uid_hash=?').get(stored.game_uid_hash).until_at>Date.now());
 const room=(await call('/api/deals/'+pd+'/messages','GET',undefined,'pbuyer')).data,steps=room.messages.filter(m=>m.system).map(m=>m.text);
 for(const step of ['requested','accept','payment_sent','payment_received','handover_ready','handover_submitted','handover_revealed','delivered','buyer_confirmed','finalize'])assert.ok(steps.includes(step),step);
 assert.equal(JSON.stringify(room).includes('Secret#1'),false);
 // Admin-owned listing: the buyer stays protected; no one-sided completion before the buyer's check window ends.
 r=await call('/api/posts','POST',{...listing,title:'Admin own protected ID',gameUid:'777000111'},'admin');assert.equal(r.status,201);const adminListing=r.data.id;
 r=await call('/api/deals','POST',{postId:adminListing},'newbie');assert.equal(r.status,201);const ad=r.data.id;assert.equal(r.data.deal.mode,'direct');
 const adeal=async()=>(await call('/api/deals/'+ad,'GET',undefined,'newbie')).data.deal;const aact=async(who,action,extra={})=>call('/api/deals/'+ad+'/action','POST',{action,version:(await adeal()).version,...extra},who);
 assert.equal((await aact('admin','accept')).status,200);const adProof=await proofFor(ad,'newbie','payment');assert.equal(adProof.status,201);assert.equal((await aact('newbie','mark_paid',{proofId:(await adProof.json()).id})).status,200);r=await aact('admin','cancel');assert.equal(r.status,403);assert.match(r.data.error,/only the Owner can cancel/);assert.equal((await aact('admin','confirm_payment',{trx:'NG55'})).status,200);assert.equal((await aact('admin','mark_delivered')).status,200);
 sql.prepare('UPDATE wm_deals SET delivered_at=delivered_at-25*3600000 WHERE id=?').run(ad);
 r=await aact('admin','finalize',{doubleConfirm:true,reason:'Buyer is silent'});assert.equal(r.status,409);assert.match(r.data.error,/auto-confirms/);
 r=await aact('admin','dispute',{reason:'Buyer says the account was recovered'});assert.equal(r.status,200);
 assert.equal((await aact('admin','resolve_dispute')).status,403);
 r=await call('/api/deals/'+ad+'/action','POST',{action:'resolve_dispute',redeliver:true,version:(await adeal()).version},'owner');assert.equal(r.status,200);
 current=await adeal();assert.equal(current.status,'active');assert.equal(current.delivered_at,null);assert.equal(current.dispute_reason,'Buyer says the account was recovered');
 assert.equal((await call('/api/deals/'+ad+'/action','POST',{action:'finalize',version:current.version},'owner')).status,404);
 assert.equal((await aact('admin','mark_delivered')).status,200);sql.prepare('UPDATE wm_deals SET delivered_at=delivered_at-73*3600000 WHERE id=?').run(ad);
 assert.equal((await aact('admin','finalize')).status,200);assert.equal(sql.prepare('SELECT status,buyer_done FROM wm_deals WHERE id=?').get(ad).status,'completed');
 assert.equal(sql.prepare("SELECT user_id FROM wm_deal_events WHERE deal_id=? AND action='auto_confirmed'").get(ad).user_id,'newbie');
 // Existing (flow 0) deals keep their original rules.
 assert.equal(sql.prepare('SELECT count(*) n FROM wm_deals WHERE flow=0').get().n>0,true);
 // Safe display names and usernames (Bangla names stay intact; emoji, symbols and badge words are blocked).
 assert.equal(nameSkeleton('Аdm1n'),'admin');assert.equal(cleanAccountName('Rahat ✅✔️ 🔵'),'Rahat');assert.equal(cleanAccountName('✅✅'),'Member');assert.equal(nameProblem('মোঃ রাহাত হাসান'),null);assert.ok(nameProblem('Official Store'));
 assert.equal((await call('/api/profile/details','POST',{name:'Rahat ✅',bio:''},'newbie')).status,400);
 assert.equal((await call('/api/profile/details','POST',{name:'Rahat Adm1n',bio:''},'newbie')).status,400);
 assert.equal((await call('/api/profile/details','POST',{name:'রাহাত ইসলাম',bio:''},'newbie')).status,200);assert.equal((await call('/api/me','GET',undefined,'newbie')).data.user.name,'রাহাত ইসলাম');
 assert.equal((await call('/api/profile/settings','POST',{username:'verified_seller'},'newbie')).status,400);assert.equal((await call('/api/username?value=real_admin','GET',undefined,'newbie')).data.available,false);
 // Trust card: role, verification date and deal record from the database.
 const trust=(await call('/api/profile/admin/trust','GET',undefined,'buyer')).data.trust;assert.equal(trust.role,'trusted');assert.ok(trust.completed_admin>=1);assert.ok(trust.disputed>=1);
 const vipTrust=(await call('/api/profile/vip/trust','GET',undefined,'buyer')).data.trust;assert.equal(vipTrust.verified,true);assert.ok(vipTrust.verified_at>0);assert.equal((await call('/api/profile/vip/trust')).status,401);
 // Share previews for public posts only, HTML-escaped.
 sql.prepare("UPDATE wm_posts SET title=? WHERE id=?").run('FF <script> "ID"',pListing);sql.prepare("UPDATE wm_posts SET availability='available' WHERE id=?").run(pListing);
 const preview=await previewPage(env,new Request('https://test.local/post/'+pListing),'/post/'+pListing,'<html><head><title>Wize</title></head></html>');
 assert.match(preview,/<meta property="og:title" content="FF &lt;script&gt; &quot;ID&quot; · ৳5,000">/);assert.match(preview,/<title>FF &lt;script&gt; &quot;ID&quot; · Wize<\/title>/);assert.equal(preview.includes('<script>'),false);
 assert.equal(await previewPage(env,new Request('https://test.local/post/'+crypto.randomUUID()),'/post/'+crypto.randomUUID(),'<head>'),'<head>');
 // An edit cannot turn a post into a game ID listing without a UID.
 r=await call('/api/posts','POST',{title:'Chat about bundles',details:'General talk',price:null,kind:'Community post',media:[],gameCategory:'community'},'vip');assert.equal(r.status,201);const chatPost=r.data.id;
 r=await call('/api/posts/'+chatPost+'/edit','POST',{title:'Now selling',details:'Game ID',price:5000,kind:'Game ID',media:[],gameCategory:'free-fire',version:0},'vip');assert.equal(r.status,200);assert.equal((await call('/api/market-rules')).data.rules.requireGameUid,false);
 // Renewing an expired post or re-opening a sold one cannot create a second live listing for the same UID.
 r=await call('/api/posts','POST',{...listing,title:'Old expired ID',gameUid:'31313131'},'vip');assert.equal(r.status,201);const expiredPost=r.data.id;sql.prepare('UPDATE wm_posts SET created_at=created_at-31*86400000 WHERE id=?').run(expiredPost);
 assert.equal((await call('/api/posts','POST',{...listing,title:'Same UID new owner',gameUid:'31313131'},'pbuyer')).status,201);
 r=await call('/api/posts/'+expiredPost+'/bump','POST',{},'vip');assert.equal(r.status,409);assert.match(r.data.error,/another active post/);
 r=await call('/api/posts','POST',{...listing,title:'Sold then reopened',gameUid:'42424242'},'vip');assert.equal(r.status,201);const reopened=r.data.id;
 assert.equal((await call('/api/posts/'+reopened+'/availability','POST',{availability:'sold',version:0},'vip')).status,200);sql.prepare('DELETE FROM wm_uid_cooldowns WHERE uid_hash=(SELECT uid_hash FROM wm_post_uids WHERE post_id=?)').run(reopened);
 assert.equal((await call('/api/posts','POST',{...listing,title:'Relisted by owner',gameUid:'42424242'},'owner')).status,201);
 r=await call('/api/posts/'+reopened+'/availability','POST',{availability:'available',version:1},'vip');assert.equal(r.status,409);assert.match(r.data.error,/another active post/);
 // A cancel that loses a version race leaves the handover and the buyer's cancellation request untouched.
 r=await call('/api/posts','POST',{...listing,title:'Race test ID',gameUid:'64646464'},'vip');assert.equal(r.status,201);const racePost=r.data.id;
 r=await call('/api/deals','POST',{postId:racePost,adminId:'admin'},'pbuyer');const rd=r.data.id;const rdeal=async()=>(await call('/api/deals/'+rd,'GET',undefined,'pbuyer')).data.deal;const ract=async(who,action,extra={})=>call('/api/deals/'+rd+'/action','POST',{action,version:(await rdeal()).version,...extra},who);
 assert.equal((await ract('vip','confirm')).status,200);assert.equal((await ract('admin','accept')).status,200);assert.equal((await ract('admin','confirm_payment',{trx:'RACE1'})).status,200);
 assert.equal((await call('/api/deals/'+rd+'/handover','POST',{action:'ready'},'pbuyer')).status,200);assert.equal((await call('/api/deals/'+rd+'/handover','POST',{action:'submit',method:'Google',login:'race@example.com',password:'p'},'vip')).status,200);
 assert.equal((await ract('pbuyer','request_cancel',{reason:'Changed my mind'})).status,200);
 const realBatch=db.batch;db.batch=async stmts=>{db.batch=realBatch;sql.prepare('UPDATE wm_deals SET version=version+1 WHERE id=?').run(rd);return realBatch(stmts)};
 assert.equal((await ract('admin','cancel')).status,409);db.batch=realBatch;
 assert.ok(sql.prepare('SELECT payload FROM wm_deal_handover WHERE deal_id=?').get(rd).payload);assert.equal(sql.prepare('SELECT resolved_at FROM wm_deal_cancel_requests WHERE deal_id=?').get(rd).resolved_at,null);assert.equal((await rdeal()).status,'active');
 // Simple finish: seller hands over, buyer confirms, seller confirms the money from the Admin -> completed.
 assert.equal((await ract('vip','seller_paid')).status,409);assert.equal((await ract('admin','reject_cancel')).status,200);assert.equal((await ract('vip','mark_delivered')).status,200);
 r=await ract('vip','seller_paid');assert.equal(r.status,409);assert.match(r.data.error,/auto-confirms/);
 assert.equal((await ract('pbuyer','buyer_confirm',{})).status,400);assert.equal((await ract('pbuyer','buyer_confirm',{received:true})).status,200);assert.equal((await rdeal()).status,'awaiting_final');
 assert.equal((await ract('pbuyer','seller_paid')).status,403);assert.equal((await ract('admin','seller_paid')).status,403);assert.equal((await ract('vip','seller_paid')).status,200);
 assert.equal((await rdeal()).status,'completed');assert.ok(sql.prepare('SELECT cleared_at FROM wm_deal_handover WHERE deal_id=?').get(rd).cleared_at>0);assert.ok(sql.prepare("SELECT 1 FROM wm_deal_events WHERE deal_id=? AND action='seller_paid'").get(rd));
 // Simplest path: money sent -> money received -> buyer got the ID -> Admin completes (seller's "ID given" is optional).
 r=await call('/api/posts','POST',{...listing,title:'Admin completes ID',gameUid:'95959595'},'vip');assert.equal(r.status,201);const simple=(await call('/api/deals','POST',{postId:r.data.id,adminId:'admin'},'buyer')).data.id;
 const sdeal=async()=>(await call('/api/deals/'+simple,'GET',undefined,'buyer')).data.deal,sact=async(who,action,extra={})=>call('/api/deals/'+simple+'/action','POST',{action,version:(await sdeal()).version,...extra},who);
 assert.equal((await sact('vip','confirm')).status,200);assert.equal((await sact('admin','accept')).status,200);assert.equal((await sact('buyer','buyer_confirm',{received:true})).status,409);
 const sProof=await proofFor(simple,'buyer','payment');assert.equal((await sact('buyer','mark_paid',{proofId:(await sProof.json()).id})).status,200);assert.equal((await sact('admin','confirm_payment')).status,200);
 assert.equal((await sact('admin','finalize')).status,409);assert.equal((await sact('buyer','buyer_confirm',{received:true})).status,200);
 sql.prepare('UPDATE wm_deals SET buyer_done_at=buyer_done_at-25*3600000 WHERE id=?').run(simple);assert.equal((await sact('admin','finalize')).status,200);assert.equal((await sdeal()).status,'completed');
 r=await call('/api/posts','POST',{...listing,title:'Admin quick ID',gameUid:'87878787'},'admin');assert.equal(r.status,201);const quick=(await call('/api/deals','POST',{postId:r.data.id},'buyer')).data.id;
 const qdeal=async()=>(await call('/api/deals/'+quick,'GET',undefined,'buyer')).data.deal,qact=async(who,action,extra={})=>call('/api/deals/'+quick+'/action','POST',{action,version:(await qdeal()).version,...extra},who);
 assert.equal((await qact('admin','accept')).status,200);const qProof=await proofFor(quick,'buyer','payment');assert.equal((await qact('buyer','mark_paid',{proofId:(await qProof.json()).id})).status,200);
 assert.equal((await qact('admin','confirm_payment')).status,200);assert.equal((await qact('admin','mark_delivered')).status,200);assert.equal((await qact('buyer','buyer_confirm',{received:true})).status,200);assert.equal((await qdeal()).status,'completed');
 // Google sign-in names: emoji removed, badge words replaced unless it is the Owner.
 assert.equal(await signInName(db,{name:'Wize Official ✅ Admin',sub:'pbuyer'}),'Member');assert.equal(await signInName(db,{name:'Rahat 🔥',sub:'pbuyer'}),'Rahat');assert.equal(await signInName(db,{name:'Rahat Wize',sub:'owner'}),'Rahat Wize');
 // Phone / email + password accounts: normalised logins, hashed passwords, generic errors, throttling, working session.
 assert.equal(loginId('phone','০১৭১২-৩৪৫ ৬৭৮'),'8801712345678');assert.equal(loginId('phone','+880 1712 345678'),'8801712345678');assert.equal(loginId('email',' Rafi@Example.COM '),'rafi@example.com');assert.throws(()=>loginId('phone','12345'));
 const authCall=async(path,data)=>worker.fetch(new Request('https://test.local/api/auth/'+path,{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','cf-connecting-ip':'198.51.100.'+Math.floor(Math.random()*200)},body:JSON.stringify(data)}),env);
 assert.equal((await authCall('signup',{method:'phone',login:'01712345678',password:'short',name:'Rafi Hasan'})).status,400);
 assert.equal((await authCall('signup',{method:'phone',login:'01712345678',password:'goodpass123',name:'Rafi ✅ Admin'})).status,400);
 let signup=await authCall('signup',{method:'phone',login:'+8801712345678',password:'goodpass123',name:'Rafi Hasan'});assert.equal(signup.status,201);assert.match(signup.headers.get('set-cookie'),/^wm_session=[a-f0-9]{64}; HttpOnly; Secure; SameSite=Lax/);assert.equal((await signup.json()).user.name,'Rafi Hasan');
 const stored2=sql.prepare("SELECT c.login,c.kind,c.password_hash,u.google_sub FROM wm_credentials c JOIN users u ON u.id=c.user_id WHERE c.login='8801712345678'").get();assert.equal(stored2.kind,'phone');assert.match(stored2.password_hash,/^[a-f0-9]{64}$/);assert.ok(!stored2.password_hash.includes('goodpass'));assert.match(stored2.google_sub,/^password:/);
 assert.equal((await authCall('signup',{method:'phone',login:'01712345678',password:'another123',name:'Someone'})).status,409);
 assert.equal((await authCall('signin',{login:'01712345678',password:'wrongpass1'})).status,401);assert.equal((await authCall('signin',{login:'01999999999',password:'whatever1'})).status,401);
 const signin=await authCall('signin',{login:'০১৭১২৩৪৫৬৭৮',password:'goodpass123'});assert.equal(signin.status,200);const sessionCookie=signin.headers.get('set-cookie').split(';')[0];
 const meNow=await worker.fetch(new Request('https://test.local/api/me',{headers:{cookie:sessionCookie}}),env);assert.equal((await meNow.json()).user.name,'Rafi Hasan');
 assert.equal((await authCall('signup',{method:'email',login:'Mim@Example.com',password:'mimpass123',name:'মিম আক্তার'})).status,201);assert.equal((await authCall('signin',{login:'mim@example.com',password:'mimpass123'})).status,200);
 const throttled=[];for(let i=0;i<6;i++)throttled.push((await authCall('signin',{login:'mim@example.com',password:'nope-'+i})).status);assert.ok(throttled.includes(429),throttled.join(','));
 assert.equal((await worker.fetch(new Request('https://test.local/api/auth/signin',{method:'POST',headers:{origin:'https://evil.local','content-type':'application/json'},body:JSON.stringify({login:'mim@example.com',password:'mimpass123'})}),env)).status,403);
 // Owner-assisted password reset: request -> Owner makes a one-time link -> member sets a new password.
 assert.equal((await authCall('forgot',{method:'phone',login:'01712345678'})).status,200);assert.equal((await authCall('forgot',{method:'email',login:'nobody@example.com'})).status,200);
 assert.equal((await call('/api/admin/reset-requests','GET',undefined,'admin')).status,403);
 const resetRequests=(await call('/api/admin/reset-requests','GET',undefined,'owner')).data.requests,rafiRequest=resetRequests.find(x=>x.login==='8801712345678');
 assert.ok(rafiRequest&&rafiRequest.user_id&&rafiRequest.has_password&&rafiRequest.name==='Rafi Hasan');assert.ok(resetRequests.some(x=>x.login==='nobody@example.com'&&!x.user_id));
 assert.equal((await call('/api/admin/password-accounts?q=rafi','GET',undefined,'owner')).data.accounts[0].login,'8801712345678');assert.equal((await call('/api/admin/password-accounts?q=1712345','GET',undefined,'owner')).data.accounts.length,1);
 assert.equal((await call('/api/admin/reset-link','POST',{userId:'buyer'},'owner')).status,404);assert.equal((await call('/api/admin/reset-link','POST',{userId:rafiRequest.user_id},'admin')).status,403);
 const resetLink=(await call('/api/admin/reset-link','POST',{userId:rafiRequest.user_id},'owner')).data;assert.match(resetLink.link,/^https:\/\/test\.local\/#reset=[a-f0-9]{64}$/);assert.equal(resetLink.login,'8801712345678');
 const resetToken=resetLink.link.split('#reset=')[1];assert.equal(sql.prepare('SELECT count(*) n FROM wm_password_resets WHERE token_hash=?').get(resetToken).n,0);assert.equal(sql.prepare('SELECT count(*) n FROM wm_password_resets WHERE token_hash=?').get(await hash(resetToken)).n,1);
 assert.equal((await call('/api/admin/reset-requests','GET',undefined,'owner')).data.requests.some(x=>x.user_id===rafiRequest.user_id),false);
 assert.equal((await authCall('reset',{token:resetToken,password:'short'})).status,400);assert.equal((await authCall('reset',{token:'f'.repeat(64),password:'brandnew123'})).status,410);
 const resetDone=await authCall('reset',{token:resetToken,password:'brandnew123'});assert.equal(resetDone.status,200);assert.match(resetDone.headers.get('set-cookie'),/^wm_session=[a-f0-9]{64}/);
 assert.equal((await authCall('reset',{token:resetToken,password:'another123'})).status,410);
 assert.equal((await (await worker.fetch(new Request('https://test.local/api/me',{headers:{cookie:sessionCookie}}),env)).json()).user,null);
 assert.equal((await authCall('signin',{login:'01712345678',password:'goodpass123'})).status,401);assert.equal((await authCall('signin',{login:'01712345678',password:'brandnew123'})).status,200);
 const olderToken=(await call('/api/admin/reset-link','POST',{userId:rafiRequest.user_id},'owner')).data.link.split('#reset=')[1];
 const staleToken=(await call('/api/admin/reset-link','POST',{userId:rafiRequest.user_id},'owner')).data.link.split('#reset=')[1];assert.equal((await authCall('reset',{token:olderToken,password:'brandnew789'})).status,410);sql.prepare('UPDATE wm_password_resets SET expires_at=? WHERE token_hash=?').run(Date.now()-1,await hash(staleToken));assert.equal((await authCall('reset',{token:staleToken,password:'brandnew456'})).status,410);
 // Verification needs the NID photo, a WhatsApp number and the live location; only the Owner sees them.
 const nidUpload=await worker.fetch(new Request('https://test.local/api/private-evidence',{method:'POST',headers:{origin:'https://test.local','content-type':'image/png','x-evidence-kind':'verification',cookie:'wm_session='+tokens.newbie},body:png}),env);assert.equal(nidUpload.status,201);const nidId=(await nidUpload.json()).id;
 assert.equal((await call('/api/verification','POST',{kind:'seller',documentId:nidId},'newbie')).status,400);
 assert.equal((await call('/api/verification','POST',{kind:'seller',whatsapp:'01811111111',location:{lat:123,lng:90.4,accuracy:20},documentId:nidId},'newbie')).status,400);
 // Live location is no longer asked: NID photo + WhatsApp number are enough.
 assert.equal((await call('/api/verification','POST',{kind:'seller',whatsapp:'০১৮১১-১১১১১১',documentId:nidId},'newbie')).status,201);
 const verificationRow=(await call('/api/admin/verifications','GET',undefined,'owner')).data.requests.find(v=>v.user_id==='newbie');assert.equal(verificationRow.whatsapp,'8801811111111');assert.equal(verificationRow.location_lat,null);assert.equal(verificationRow.location_at,null);
 const ownView=(await call('/api/verification','GET',undefined,'newbie')).data.requests[0];assert.equal(ownView.location_lat,undefined);assert.equal(ownView.whatsapp,undefined);assert.equal((await call('/api/admin/verifications','GET',undefined,'admin')).status,403);
 // Groups: add one of my published IDs to a group I joined; leaving clears my copy and my membership.
 assert.equal((await call('/api/groups/'+group+'/join','POST',{},'vip')).status,200);assert.equal((await call('/api/groups/'+group+'/join','POST',{},'owner')).status,200);
 r=await call('/api/posts','POST',{...listing,title:'Group share ID',price:7000,gameUid:'21212121'},'owner');assert.equal(r.status,201);const sharedId=r.data.id;
 r=await call('/api/groups/'+group+'/share-post','POST',{postId:sharedId},'owner');assert.equal(r.status,200);assert.equal(r.data.added,true);assert.equal((await call('/api/groups/'+group+'/share-post','POST',{postId:sharedId},'owner')).data.added,false);
 // Feed IDs added to a group are kept as placements but the group list shows only IDs posted inside the group.
 assert.ok(!(await call('/api/feed?group='+group,'GET',undefined,'vip')).data.posts.some(p=>p.id===sharedId));
 assert.equal((await call('/api/groups/'+group+'/share-post','POST',{postId:sharedId},'outsider')).status>=400,true);assert.equal((await call('/api/groups/'+group+'/share-post','POST',{postId:pListing},'vip')).status,404);
 assert.equal((await call('/api/groups/'+group+'/leave','POST',{},'admin')).status,403);
 assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'before leaving'},'vip')).status,201);assert.equal((await call('/api/groups/'+group+'/leave','POST',{},'vip')).status,200);
 assert.equal(sql.prepare('SELECT count(*) n FROM wm_group_members WHERE group_id=? AND user_id=?').get(group,'vip').n,0);assert.ok((await call('/api/groups/'+group+'/messages','GET',undefined,'vip')).status>=400);
 assert.equal((await call('/api/groups/'+group+'/join','POST',{},'vip')).status,200);assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'vip')).data.messages.some(m=>m.text==='before leaving'),false);
 // Same post again is blocked with a Boost hint (spaces, symbols and letter case do not matter); a changed price is a new post.
 r=await call('/api/posts','POST',{...listing,title:'Dup check ID',details:'Level 70, 5 rare bundles',price:5500,gameUid:'73737301'},'owner');assert.equal(r.status,201);const dupFirst=r.data.id;
 r=await call('/api/posts/precheck','POST',{postIntent:'sell',kind:'Game ID',price:'5500',gameCategory:'free-fire',gameUid:'73737302',title:'  dup CHECK id!! ',details:'Level 70 , 5 rare bundles.'},'owner');assert.equal(r.status,409);assert.match(r.data.error,/Boost/);assert.match(r.data.error,/ID No - \d+/);
 assert.equal((await call('/api/posts','POST',{...listing,title:'Dup check ID',details:'Level 70, 5 rare bundles',price:5500,gameUid:'73737302'},'owner')).status,409);
 assert.equal((await call('/api/posts','POST',{...listing,title:'Dup check ID',details:'Level 70, 5 rare bundles',price:5600,gameUid:'73737303'},'owner')).status,201);
 // Boost wait: the answer says how long is left and gives the next boost time for the countdown.
 sql.prepare('UPDATE wm_posts SET created_at=created_at-25*3600000 WHERE id=?').run(dupFirst);r=await call('/api/posts/'+dupFirst+'/bump','POST',{},'owner');assert.equal(r.status,200);assert.equal(r.data.next_boost_at-r.data.bumped_at,legacyRules.bumpHours*3600000);
 r=await call('/api/posts/'+dupFirst+'/bump','POST',{},'owner');assert.equal(r.status,429);assert.match(r.data.error,/again in 2[34]h\./);
 // Feed shows one member after another: the same member appears twice in a row only when nobody else is left on the page.
 const mixed=(await call('/api/feed?limit=30','GET',undefined,'vip')).data.posts,who=p=>p.shared_by_id||p.user_id;assert.ok(new Set(mixed.map(who)).size>1);
 for(let i=0;i+1<mixed.length;i++)if(who(mixed[i])===who(mixed[i+1]))assert.ok(mixed.slice(i).every(p=>who(p)===who(mixed[i])),'feed mixes members');
 // Profile links: only the Owner and Admins can add them; web addresses are checked; saving without links keeps them.
 r=await call('/api/profile/details','POST',{name:'owner',bio:'',links:[{label:'My Facebook page',url:'facebook.com/wize'},{label:'',url:'https://www.youtube.com/@wize'}]},'owner');assert.equal(r.status,200);
 assert.deepEqual((await call('/api/profile/owner','GET',undefined,'vip')).data.profile.links,[{label:'My Facebook page',url:'https://facebook.com/wize'},{label:'youtube.com',url:'https://www.youtube.com/@wize'}]);
 assert.equal((await call('/api/profile/details','POST',{name:'vip',bio:'',links:[{label:'x',url:'https://x.com/a'}]},'vip')).status,403);assert.deepEqual((await call('/api/profile/vip','GET',undefined,'owner')).data.profile.links,[]);
 for(const bad of ['javascript:alert(1)','https://user:pw@evil.com','localhost','']) assert.equal((await call('/api/profile/details','POST',{name:'owner',bio:'',links:[{label:'bad',url:bad}]},'owner')).status,400,bad);
 assert.equal((await call('/api/profile/details','POST',{name:'owner',bio:'',links:Array.from({length:6},(_,i)=>({label:'l'+i,url:'https://a.com/'+i}))},'owner')).status,400);
 assert.equal((await call('/api/profile/details','POST',{name:'owner',bio:'hello'},'owner')).status,200);assert.equal((await call('/api/profile/owner','GET',undefined,'vip')).data.profile.links.length,2);
 sql.prepare("UPDATE wm_profile_details SET links=? WHERE user_id='vip'").run(JSON.stringify([{label:'old',url:'https://old.example.com'}]));assert.deepEqual((await call('/api/profile/vip','GET',undefined,'owner')).data.profile.links,[]);
 // Normal Posts: no price or game, their own daily limit (Sell limits do not count them), no deals, and they stay Normal when edited.
 assert.equal((await call('/api/admin/market-rules','POST',{...strict,dailyNormalPosts:2},'owner')).status,200);
 r=await call('/api/posts','POST',{postIntent:'normal',title:'Scammer alert: fake bKash screenshot',kind:'Game ID',price:'5000',gameCategory:'free-fire',media:[]},'newbie');assert.equal(r.status,201);const normalId=r.data.id;
 assert.deepEqual({...sql.prepare('SELECT post_intent,kind,price,game_category,details FROM wm_posts WHERE id=?').get(normalId)},{post_intent:'sell',kind:'Community post',price:null,game_category:'community',details:''});
 assert.equal((await call('/api/posts','POST',{postIntent:'normal',title:'Fun post two',details:'GG everyone',media:[]},'newbie')).status,201);
 r=await call('/api/posts','POST',{postIntent:'normal',title:'Fun post three',media:[]},'newbie');assert.equal(r.status,429);assert.match(r.data.error,/Normal Post limit reached: 2 new posts/);
 assert.equal((await call('/api/posts/precheck','POST',{postIntent:'normal',kind:'Community post',title:'Fun post four'},'newbie')).status,429);
 assert.equal((await call('/api/posts','POST',{postIntent:'normal',title:'Owner notice one',media:[]},'owner')).status,201);
 assert.ok((await call('/api/deals','POST',{postId:normalId,adminId:'owner'},'buyer')).status>=400);
 r=await call('/api/posts/'+normalId+'/edit','POST',{postIntent:'normal',title:'Scammer alert (updated)',details:'Check the TrxID before you send an ID',kind:'Game ID',price:'9000',gameCategory:'free-fire',media:[],version:sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(normalId).version},'newbie');assert.equal(r.status,200);
 assert.deepEqual({...sql.prepare('SELECT kind,price,title FROM wm_posts WHERE id=?').get(normalId)},{kind:'Community post',price:null,title:'Scammer alert (updated)'});
 assert.equal((await call('/api/posts/'+normalId+'/edit','POST',{postIntent:'need',title:'x',media:[],version:sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(normalId).version},'newbie')).status,400);
 // Texts & templates: public read with defaults, Owner-only save, checked links/lengths, custom verification questions.
 r=await call('/api/site-content');assert.equal(r.status,200);assert.equal(r.data.content.poweredBy,'Powered by @Rahat Wize');assert.equal(r.data.content.templates.normal.heading,'Share something with the community');assert.deepEqual(r.data.content.verification.questions,[]);assert.deepEqual(r.data.content.login,{brand:'',title:'',registerTitle:''});assert.deepEqual(r.data.content.profile,{memberLabel:'',emptyTitle:'',emptyText:''});assert.deepEqual(r.data.content.sectionOrder,[]);assert.equal(r.data.defaults.footerText,'© 2026 Buy Sell This Site. All rights reserved.');
 const content={...r.data.content,footerText:'© 2026 Wize X',noticeOn:true,noticeText:'Boost is free this week',noticeLink:'https://wizefftopup.com',templates:{...r.data.content.templates,sell:{heading:'Sell your ID',titleHint:'FF Level 80 ID',details:'Level:\nEvo guns:\nLogin:',tip:'Add clear photos'}},verification:{...r.data.content.verification,questions:[{label:'Your Facebook profile link',required:true},{label:'How long have you been selling?',required:false}]}};
 assert.equal((await call('/api/admin/site-content','POST',content,'admin')).status,403);
 assert.equal((await call('/api/admin/site-content','POST',{...content,noticeLink:'javascript:alert(1)'},'owner')).status,400);
 assert.equal((await call('/api/admin/site-content','POST',{...content,verification:{...content.verification,questions:Array.from({length:7},()=>({label:'q',required:false}))}},'owner')).status,400);
 assert.equal((await call('/api/admin/site-content','POST',{...content,footerText:'x'.repeat(201)},'owner')).status,400);
 assert.equal((await call('/api/admin/site-content','POST',{...content,login:{brand:'x'.repeat(41)}},'owner')).status,400);
 assert.equal((await call('/api/admin/site-content','POST',{...content,login:{brand:'WIZE X',title:'Welcome to Wize X!',registerTitle:'Join Wize X'}},'owner')).status,200);assert.deepEqual((await call('/api/site-content')).data.content.login,{brand:'WIZE X',title:'Welcome to Wize X!',registerTitle:'Join Wize X'});
 assert.equal((await call('/api/admin/site-content','POST',{...content,sectionOrder:['footer','nope']},'owner')).status,400);assert.equal((await call('/api/admin/site-content','POST',{...content,sectionOrder:['footer','footer']},'owner')).status,400);
 r=await call('/api/admin/site-content','POST',{...content,login:{brand:'WIZE X',title:'Welcome to Wize X!',registerTitle:'Join Wize X'},sectionOrder:['sell','login'],profile:{memberLabel:'Wize member',emptyTitle:'Nothing here',emptyText:'Posts show here'}},'owner');assert.equal(r.status,200);
 r=await call('/api/site-content');assert.deepEqual(r.data.content.sectionOrder,['sell','login']);assert.deepEqual(r.data.content.profile,{memberLabel:'Wize member',emptyTitle:'Nothing here',emptyText:'Posts show here'});
 // Admin Panel post search: by ID number (12 or "ID No - 12"), title or member, across both tabs.
 const searchCode=sql.prepare('SELECT number FROM wm_listing_ids WHERE post_id=?').get(normalId).number;
 for(const q of [String(searchCode),'ID No - '+searchCode,'id no '+searchCode])assert.ok((await call('/api/admin/posts?view=published&q='+encodeURIComponent(q),'GET',undefined,'owner')).data.posts.some(p=>p.id===normalId),q);
 r=await call('/api/admin/posts?view=restricted&q='+encodeURIComponent('Scammer alert (updated)'),'GET',undefined,'owner');assert.ok(r.data.posts.some(p=>p.id===normalId&&p.listing_code==='ID No - '+searchCode));
 assert.equal((await call('/api/admin/posts?q=zzzz-nothing','GET',undefined,'owner')).data.posts.length,0);assert.equal((await call('/api/admin/posts?q=1','GET',undefined,'vip')).status,403);
 assert.equal((await call('/api/admin/site-content','POST',content,'owner')).status,200);
 r=await call('/api/site-content');assert.equal(r.data.content.footerText,'© 2026 Wize X');assert.equal(r.data.content.noticeOn,true);assert.equal(r.data.content.templates.sell.details,'Level:\nEvo guns:\nLogin:');assert.equal(r.data.content.templates.need.heading,'What are you looking for?');assert.equal(r.data.content.verification.questions[0].required,true);
 const nid2=await worker.fetch(new Request('https://test.local/api/private-evidence',{method:'POST',headers:{origin:'https://test.local','content-type':'image/png','x-evidence-kind':'verification',cookie:'wm_session='+tokens.pbuyer},body:png}),env);assert.equal(nid2.status,201);const nid2Id=(await nid2.json()).id;
 const place={lat:23.7,lng:90.4,accuracy:25};
 r=await call('/api/verification','POST',{kind:'seller',whatsapp:'01922222222',location:place,documentId:nid2Id,answers:['',' 2 years ']},'pbuyer');assert.equal(r.status,400);assert.match(r.data.error,/Please answer: Your Facebook profile link/);
 assert.equal((await call('/api/verification','POST',{kind:'seller',whatsapp:'01922222222',location:place,documentId:nid2Id,answers:['https://facebook.com/pbuyer',' 2 years ']},'pbuyer')).status,201);
 const answered=(await call('/api/admin/verifications','GET',undefined,'owner')).data.requests.find(v=>v.user_id==='pbuyer');assert.deepEqual(JSON.parse(answered.answers),[{q:'Your Facebook profile link',a:'https://facebook.com/pbuyer'},{q:'How long have you been selling?',a:'2 years'}]);
 // Approving gives the blue tick (never the Admin role); a second review of the same application changes nothing; rejecting gives nothing.
 assert.equal((await call('/api/profile/pbuyer','GET',undefined,'owner')).data.profile.verified,0);
 assert.equal((await call('/api/admin/verification-action','POST',{id:answered.id,action:'approve'},'admin')).status,403);
 r=await call('/api/admin/verification-action','POST',{id:answered.id,action:'approve'},'owner');assert.equal(r.status,200);assert.equal(r.data.verified,true);
 assert.equal((await call('/api/profile/pbuyer','GET',undefined,'owner')).data.profile.verified,1);assert.equal((await call('/api/profile/pbuyer','GET',undefined,'owner')).data.profile.role,'member');
 r=await call('/api/admin/verification-action','POST',{id:answered.id,action:'reject'},'owner');assert.equal(r.data.reviewed,0);assert.equal(sql.prepare('SELECT status FROM wm_verification_requests WHERE id=?').get(answered.id).status,'approved');
 r=await call('/api/admin/verification-action','POST',{id:verificationRow.id,action:'reject'},'owner');assert.equal(r.data.verified,false);assert.equal(sql.prepare("SELECT count(*) n FROM wm_verifications WHERE user_id='newbie'").get().n,0);
 // Profiles show the groups an Owner/Admin made (name, logo link, member count, joined flag); members have none.
 const adminGroups=(await call('/api/profile/admin','GET',undefined,'newbie')).data.profile.groups;const shown=adminGroups.find(g=>g.id===group);assert.ok(shown);assert.equal(shown.name,sql.prepare('SELECT name FROM wm_groups WHERE id=?').get(group).name);assert.match(shown.logo,/^\/group-logo\//);assert.equal(shown.members,sql.prepare('SELECT count(*) n FROM wm_group_members WHERE group_id=?').get(group).n);assert.equal(shown.joined,sql.prepare('SELECT count(*) n FROM wm_group_members WHERE group_id=? AND user_id=?').get(group,'newbie').n);
 assert.equal((await call('/api/profile/admin','GET',undefined,'admin')).data.profile.groups.find(g=>g.id===group).joined,1);assert.deepEqual((await call('/api/profile/newbie','GET',undefined,'owner')).data.profile.groups,[]);
 // Admin picker: "Your Admins" lists the Admins this member already did (accepted) deals with; the full Admin list is always there.
 sql.prepare("UPDATE wm_posts SET created_at=created_at-86400000-60000 WHERE user_id='vip'").run();sql.prepare("DELETE FROM wm_limits WHERE key='publish:vip'").run();r=await call('/api/posts','POST',{...listing,title:'Picker check ID',details:'For the Admin picker',price:6100,gameUid:'73737311'},'vip');assert.equal(r.status,201);const pickerPost=r.data.id;
 // Deal box: only Admins of groups the buyer or the seller joined (seller-only groups are not named); with none, the client shows only the Owner.
 const expectRelated=sql.prepare("SELECT DISTINCT g.owner_id id FROM wm_group_members m JOIN wm_groups g ON g.id=m.group_id JOIN wm_roles r ON r.user_id=g.owner_id AND r.role IN ('owner','trusted') WHERE m.user_id IN ('pbuyer','vip') AND g.owner_id NOT IN ('pbuyer','vip') ORDER BY 1").all().map(x=>x.id);
 let pk=(await call('/api/deal-admins?postId='+pickerPost,'GET',undefined,'pbuyer')).data;assert.equal(pk.mode,'mediated');assert.equal(pk.iAm,'buyer');assert.equal(pk.owner.id,'owner');assert.deepEqual(pk.relatedAdmins.map(a=>a.id).sort(),expectRelated);assert.equal(pk.recommendOwner,false);assert.ok(expectRelated.includes('admin'));
 const sellerSide=pk.relatedAdmins.find(a=>a.id==='admin');assert.equal(sellerSide.theirs,1);if(!sellerSide.mine)assert.equal(sellerSide.my_groups,null);assert.ok(Number.isInteger(sellerSide.deals_done));
 sql.prepare("DELETE FROM wm_group_members WHERE user_id IN ('pbuyer','vip')").run();pk=(await call('/api/deal-admins?postId='+pickerPost,'GET',undefined,'pbuyer')).data;assert.deepEqual(pk.relatedAdmins,[]);assert.equal(pk.recommendOwner,true);// new members: the Owner is recommended on top
assert.equal(pk.owner.id,'owner');
 // Maintenance: Owner-only switch; while on, visitors get a sorry page and members get 503 from the API; the Owner and the Admin Panel keep working.
 assert.equal((await call('/api/admin/maintenance','POST',{on:true},'admin')).status,403);assert.equal((await call('/api/admin/maintenance','POST',{on:'yes'},'owner')).status,400);
 r=await call('/api/admin/maintenance','POST',{on:true,message:'Back at 10 PM <b>soon</b>'},'owner');assert.equal(r.status,200);assert.equal(r.data.on,true);
 assert.deepEqual((await call('/api/maintenance')).data,{on:true,message:'Back at 10 PM <b>soon</b>'});
 r=await call('/api/feed?limit=1','GET',undefined,'vip');assert.equal(r.status,503);assert.equal(r.data.maintenance,true);assert.equal((await call('/api/feed?limit=1')).status,503);
 assert.equal((await call('/api/feed?limit=1','GET',undefined,'owner')).status,200);assert.equal((await panelRequest('maintenance')).status,200);
 const closedPage=await worker.fetch(new Request('https://test.local/'),env);assert.equal(closedPage.status,503);const closedHtml=await closedPage.text();assert.match(closedHtml,/Back at 10 PM &lt;b&gt;soon&lt;\/b&gt;/);assert.ok(!closedHtml.includes('<b>soon'));
 r=await call('/api/admin/maintenance','POST',{on:false},'owner');assert.equal(r.status,200);assert.equal((await call('/api/feed?limit=1','GET',undefined,'vip')).status,200);assert.deepEqual((await call('/api/maintenance')).data,{on:false,message:''});
 // Chat reports: a member reports another member's message; the Owner restricts chat for a chosen time (1 hour – 30 days) and can remove the message.
 let th=(await call('/api/threads','POST',{userId:'pbuyer'},'newbie')).data.thread;
 if(th.status!=='accepted'){assert.equal((await call('/api/threads/'+th.id+'/messages','POST',{text:'hello'},'newbie')).status,201);assert.equal((await call('/api/threads/'+th.id+'/accept','POST',{},'pbuyer')).status,200)}
 for(const t of ['bad word one','bad word two gali'])assert.equal((await call('/api/threads/'+th.id+'/messages','POST',{text:t},'pbuyer')).status,201);
 let msgs=(await call('/api/threads/'+th.id+'/messages','GET',undefined,'newbie')).data.messages;const bad=msgs.find(m=>m.text==='bad word two gali'),mine=msgs.find(m=>m.user_id==='newbie');
 assert.equal((await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:bad.id,reason:'abuse'},'outsider')).status,404);
 if(mine)assert.equal((await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:mine.id,reason:'abuse'},'newbie')).status,400);
 assert.equal((await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:bad.id,reason:'rude'},'newbie')).status,400);
 r=await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:bad.id,reason:'abuse',details:'He insulted me'},'newbie');assert.equal(r.status,201);assert.equal(r.data.already,false);
 assert.equal((await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:bad.id,reason:'abuse'},'newbie')).data.already,true);
 assert.equal((await call('/api/admin/message-reports','GET',undefined,'admin')).status,403);
 r=await call('/api/admin/message-reports','GET',undefined,'owner');const rep=r.data.reports.find(x=>x.message_id===bad.id);assert.equal(rep.target_id,'pbuyer');assert.equal(rep.reporter_id,'newbie');assert.equal(rep.message_text,'bad word two gali');assert.equal(rep.context.at(-1).text,'bad word one');assert.equal(rep.details,'He insulted me');assert.deepEqual(r.data.hours,[1,3,6,12,24,72,168,336,720]);
 assert.equal((await call('/api/admin/message-report-action','POST',{id:rep.id,action:'restrict',hours:5},'owner')).status,400);assert.equal((await call('/api/admin/message-report-action','POST',{id:rep.id,action:'restrict',hours:24},'admin')).status,403);
 r=await call('/api/admin/message-report-action','POST',{id:rep.id,action:'restrict',hours:24,deleteMessage:true},'owner');assert.equal(r.status,200);assert.equal(r.data.action,'Restricted 1 day · message removed');
 assert.equal((await call('/api/admin/message-report-action','POST',{id:rep.id,action:'dismiss'},'owner')).status,404);
 r=await call('/api/threads/'+th.id+'/messages','POST',{text:'again'},'pbuyer');assert.equal(r.status,403);assert.match(r.data.error,/cannot send messages or call until .* \(BD time\)/);
 assert.equal((await call('/api/threads/'+th.id+'/messages','GET',undefined,'newbie')).data.messages.some(m=>m.id===bad.id),false);assert.equal((await call('/api/threads/'+th.id+'/messages/'+bad.id+'/restore','POST',{},'pbuyer')).status,404);
 await call('/api/groups/'+group+'/join','POST',{},'pbuyer');assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'still here'},'pbuyer')).status,403);
 assert.ok((await call('/api/admin/message-reports','GET',undefined,'owner')).data.restricted.some(x=>x.user_id==='pbuyer'&&x.until_at>Date.now()+23*3600000));
 assert.equal((await call('/api/admin/chat-restriction','POST',{userId:'pbuyer'},'owner')).status,200);assert.equal((await call('/api/threads/'+th.id+'/messages','POST',{text:'sorry'},'pbuyer')).status,201);
 assert.equal((await call('/api/threads/'+th.id+'/messages','POST',{text:'call:audio:120'},'pbuyer')).status,400);
 // Calls: STUN servers, ring, busy, answer, end with a call note in the chat; decline; missed after 45 seconds; no calls in unaccepted chats or while restricted.
 r=await call('/api/calls/ice','GET',undefined,'newbie');assert.equal(r.status,200);assert.ok(r.data.iceServers[0].urls.some(u=>u.startsWith('stun:')));assert.equal(r.data.relay,false);assert.equal((await call('/api/calls/ice')).status,401);
 {const realFetch=globalThis.fetch,seen=[];env.TURN_KEY_ID='key1';env.TURN_KEY_API_TOKEN='token1';
  globalThis.fetch=async(url,init)=>{seen.push({url:String(url),auth:init.headers.authorization,ttl:JSON.parse(init.body).ttl});return new Response(JSON.stringify({iceServers:[{urls:['stun:stun.cloudflare.com:3478','stun:stun.cloudflare.com:53']},{urls:['turn:turn.cloudflare.com:3478?transport=udp','turn:turn.cloudflare.com:53?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'u1',credential:'c1'}]}),{status:201})};
  try{let t=await call('/api/calls/ice','GET',undefined,'pbuyer');assert.equal(t.status,200);assert.equal(t.data.relay,true);const urls=t.data.iceServers.flatMap(x=>x.urls);assert.ok(urls.includes('turns:turn.cloudflare.com:443?transport=tcp'));assert.ok(!urls.some(v=>/:53(\?|$)/.test(v)),'port 53 is dropped');assert.match(seen[0].url,/\/keys\/key1\/credentials\/generate-ice-servers$/);assert.equal(seen[0].auth,'Bearer token1');assert.equal(seen[0].ttl,14400);
   globalThis.fetch=async url=>String(url).endsWith('generate-ice-servers')?new Response('{}',{status:404}):new Response(JSON.stringify({iceServers:{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'u2',credential:'c2'}}),{status:201});
   t=await call('/api/calls/ice','GET',undefined,'pbuyer');assert.equal(t.data.relay,true,'falls back to the older TURN endpoint');
   globalThis.fetch=async()=>new Response(JSON.stringify({iceServers:[{urls:['stun:stun.cloudflare.com:3478']}]}),{status:201});
   t=await call('/api/calls/ice','GET',undefined,'pbuyer');assert.equal(t.data.relay,false,'no relay-only mode without a TURN login');
   globalThis.fetch=async()=>{throw new Error('network down')};t=await call('/api/calls/ice','GET',undefined,'pbuyer');assert.equal(t.status,200);assert.equal(t.data.relay,false);
   let limited=false;for(let i=0;i<13;i++)if((await call('/api/calls/ice','GET',undefined,'pbuyer')).status===429)limited=true;assert.ok(limited,'ICE logins are rate limited');
  }finally{globalThis.fetch=realFetch;delete env.TURN_KEY_ID;delete env.TURN_KEY_API_TOKEN;await env.DB.prepare("DELETE FROM wm_limits WHERE key LIKE 'ice:%'").run()}}
 const offer='v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
 assert.equal((await call('/api/calls','POST',{threadId:th.id,offer:'hello'},'newbie')).status,400);
 r=await call('/api/calls','POST',{threadId:th.id,video:false,offer},'newbie');assert.equal(r.status,201);const callId=r.data.id;
 r=await call('/api/calls','POST',{threadId:th.id,video:false,offer},'pbuyer');assert.equal(r.status,409);assert.match(r.data.error,/Busy/);
 assert.equal((await call('/api/chat-unread','GET',undefined,'pbuyer')).data.incoming_call.id,callId);assert.equal((await call('/api/chat-unread','GET',undefined,'newbie')).data.incoming_call,null);r=await call('/api/calls/incoming','GET',undefined,'pbuyer');assert.equal(r.data.call.id,callId);assert.equal(r.data.call.offer,offer);assert.equal(r.data.call.video,false);assert.equal(r.data.call.caller_id,'newbie');
 assert.equal((await call('/api/calls/incoming','GET',undefined,'outsider')).data.call,null);assert.equal((await call('/api/calls/'+callId,'GET',undefined,'outsider')).status,404);
 assert.equal((await call('/api/calls/'+callId+'/answer','POST',{answer:offer},'newbie')).status,403);assert.equal((await call('/api/calls/'+callId+'/answer','POST',{answer:offer},'pbuyer')).status,200);
 r=await call('/api/calls/'+callId,'GET',undefined,'newbie');assert.equal(r.data.status,'active');assert.equal(r.data.answer,offer);assert.equal((await call('/api/calls/'+callId,'GET',undefined,'pbuyer')).data.answer,null);
 sql.prepare('UPDATE wm_calls SET answered_at=answered_at-65000 WHERE id=?').run(callId);assert.equal((await call('/api/calls/'+callId+'/end','POST',{},'pbuyer')).status,200);
 assert.equal((await call('/api/calls/'+callId,'GET',undefined,'newbie')).data.status,'ended');assert.equal(sql.prepare('SELECT offer FROM wm_calls WHERE id=?').get(callId).offer,'');
 r=await call('/api/calls','POST',{threadId:th.id,video:true,offer},'pbuyer');assert.equal(r.status,201);assert.equal((await call('/api/calls/'+r.data.id+'/decline','POST',{},'newbie')).status,200);
 r=await call('/api/calls','POST',{threadId:th.id,video:false,offer},'newbie');const ringing=r.data.id;sql.prepare('UPDATE wm_calls SET created_at=created_at-50000 WHERE id=?').run(ringing);assert.equal((await call('/api/calls/incoming','GET',undefined,'pbuyer')).data.call,null);assert.equal((await call('/api/calls/'+ringing,'GET',undefined,'newbie')).data.status,'missed');
 const notes=(await call('/api/threads/'+th.id+'/messages','GET',undefined,'pbuyer')).data.messages.filter(m=>m.text.startsWith('call:')).map(m=>m.text);assert.ok(notes.some(t=>/^call:audio:6\d$/.test(t)),notes.join());assert.ok(notes.includes('call:video:declined'));assert.ok(notes.includes('call:audio:missed'));
 assert.equal((await call('/api/message-reports','POST',{kind:'private',chatId:th.id,messageId:(await call('/api/threads/'+th.id+'/messages','GET',undefined,'newbie')).data.messages.find(m=>m.text==='call:video:declined').id,reason:'spam'},'newbie')).status,400);
 const th2=(await call('/api/threads','POST',{userId:'vip'},'newbie')).data.thread;if(th2.status!=='accepted')assert.equal((await call('/api/calls','POST',{threadId:th2.id,offer},'newbie')).status,403);
 sql.prepare('INSERT INTO wm_chat_restrictions(user_id,until_at,reason,created_at) VALUES(?,?,?,?)').run('newbie',Date.now()+3600000,'test',Date.now());assert.equal((await call('/api/calls','POST',{threadId:th.id,offer},'newbie')).status,403);sql.prepare("DELETE FROM wm_chat_restrictions WHERE user_id='newbie'").run();
 delete env.WM_DATA_KEY;assert.equal((await adeal()).secure_handover,false);env.AI=previousAI;
 console.log('PASS: protected deals (payment proof, one-time encrypted handover, delivery, checklist, safety hold, auto-confirm, Owner dispute decisions), private game UIDs with one active listing, post limits, bump/expiry/sold feed rules, safe names, trust card and share previews.');
}
// Migration 021 keeps every existing deal and post, and existing deals stay on their original flow.
{
 const current=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
 const before=current.replace(",flow INTEGER NOT NULL DEFAULT 0,paid_at INTEGER,paid_note TEXT NOT NULL DEFAULT '',funded_at INTEGER,funded_by TEXT REFERENCES users(id),payment_trx TEXT NOT NULL DEFAULT '',payment_proof_id TEXT,delivered_at INTEGER,checklist TEXT NOT NULL DEFAULT '',checklist_proof_id TEXT,buyer_done_at INTEGER,payout_note TEXT NOT NULL DEFAULT '',dispute_reason TEXT NOT NULL DEFAULT '',disputed_by TEXT REFERENCES users(id));",");").replace(",game_uid_hash TEXT,game_uid_enc TEXT,game_uid_hint TEXT NOT NULL DEFAULT '',bumped_at INTEGER,renewed_at INTEGER,media_updated_at INTEGER);",");").replace(",whatsapp TEXT NOT NULL DEFAULT '',location_lat REAL,location_lng REAL,location_accuracy REAL,location_at INTEGER,answers TEXT NOT NULL DEFAULT '[]');",");").split('-- Protected deals, secure handover, deal proofs and listing rules (migration 021).')[0];
 assert.notEqual(before,current);assert.equal(before.includes('game_uid_hash'),false);assert.equal(before.includes('paid_note'),false);
 const migrated=new DatabaseSync(':memory:');migrated.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);'+before);
 migrated.exec("INSERT INTO users(id,name) VALUES('b','Buyer'),('s','Seller'),('a','Admin');INSERT INTO wm_posts(id,user_id,title,details,price,kind,status,created_at) VALUES('p','s','Old ID','Old details',4000,'Game ID','approved',5);INSERT INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,created_at,is_deal) VALUES('t','b','s','p','deal:b:p',1,1);INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,admin_id,price,status,created_at,post_id,buyer_done) VALUES('d','t','b','s','a',4000,'active',2,'p',1);");
 migrated.exec(readFileSync(new URL('./migrations/021_protected_deals_listing_rules.sql',import.meta.url),'utf8'));
 const oldDeal=migrated.prepare('SELECT * FROM wm_deals').get();assert.equal(oldDeal.flow,0);assert.equal(oldDeal.status,'active');assert.equal(oldDeal.buyer_done,1);assert.equal(oldDeal.price,4000);
 const oldPost=migrated.prepare('SELECT * FROM wm_posts').get();assert.equal(oldPost.title,'Old ID');assert.equal(oldPost.game_uid_hash,null);assert.equal(oldPost.game_uid_hint,'');
 assert.equal(migrated.prepare('SELECT number FROM wm_deal_ids').get().number,1);
 migrated.exec("UPDATE wm_posts SET game_uid_hash='h1',game_uid_enc='v1.x',game_uid_hint='789' WHERE id='p'");
 const m022=readFileSync(new URL('./migrations/022_private_post_uids.sql',import.meta.url),'utf8');migrated.exec(m022);migrated.exec(m022);
 assert.deepEqual({...migrated.prepare('SELECT post_id,uid_hash,uid_enc,uid_hint FROM wm_post_uids').get()},{post_id:'p',uid_hash:'h1',uid_enc:'v1.x',uid_hint:'789'});
 assert.deepEqual({...migrated.prepare('SELECT game_uid_hash,game_uid_enc,game_uid_hint,title FROM wm_posts').get()},{game_uid_hash:null,game_uid_enc:null,game_uid_hint:'',title:'Old ID'});
 migrated.exec("UPDATE wm_deals SET status='completed',completed_at=10 WHERE id='d'");assert.equal(migrated.prepare("SELECT uid_hash FROM wm_uid_cooldowns").get().uid_hash,'h1');
 migrated.exec(readFileSync(new URL('./migrations/023_deal_notification_titles.sql',import.meta.url),'utf8'));migrated.exec("INSERT INTO wm_deal_events(deal_id,user_id,action,created_at) VALUES('d','b','payment_sent',11)");
 assert.deepEqual(migrated.prepare("SELECT user_id,title FROM wm_notifications WHERE target_id='d' ORDER BY user_id").all().map(r=>r.user_id+':'+r.title),['a:Buyer sent the money','s:Buyer sent the money']);
 migrated.exec(readFileSync(new URL('./migrations/024_password_sign_in.sql',import.meta.url),'utf8'));migrated.exec("INSERT INTO wm_credentials(user_id,login,kind,password_hash,salt,created_at,updated_at) VALUES('b','8801711111111','phone','h','s',1,1)");assert.equal(migrated.prepare('SELECT count(*) n FROM users').get().n,3);
 migrated.exec(readFileSync(new URL('./migrations/025_password_reset_requests.sql',import.meta.url),'utf8'));migrated.exec(readFileSync(new URL('./migrations/026_verification_whatsapp_location.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare("SELECT count(*) n FROM pragma_table_info('wm_verification_requests') WHERE name IN ('whatsapp','location_lat','location_lng','location_accuracy','location_at')").get().n,5);assert.equal(migrated.prepare("SELECT count(*) n FROM wm_credentials").get().n,1);
 migrated.exec(readFileSync(new URL('./migrations/028_verification_answers.sql',import.meta.url),'utf8'));migrated.exec(readFileSync(new URL('./migrations/029_admin_agreement_alerts.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='wm_notify_deal_event'").get().n,1);assert.equal(migrated.prepare("SELECT count(*) n FROM pragma_table_info('wm_verification_requests') WHERE name='answers'").get().n,1);
 migrated.exec(readFileSync(new URL('./migrations/030_chat_reports_calls.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('wm_message_reports','wm_chat_restrictions','wm_calls')").get().n,3);
 for(let i=0;i<2;i++)migrated.exec(readFileSync(new URL('./migrations/031_call_rooms_push.sql',import.meta.url),'utf8'));assert.equal(migrated.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('wm_call_rooms','wm_call_room_members','wm_call_signals','wm_push_subscriptions','wm_push_events')").get().n,5);assert.equal(migrated.prepare('SELECT count(*) n FROM users').get().n,3);
 const m027=new DatabaseSync(':memory:');m027.exec("CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE wm_profile_details(user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT,bio TEXT NOT NULL DEFAULT '',picture_id TEXT,updated_at INTEGER NOT NULL,cover_id TEXT);INSERT INTO users VALUES('a');INSERT INTO wm_profile_details(user_id,display_name,bio,updated_at) VALUES('a','A','Hi',1)");m027.exec(readFileSync(new URL('./migrations/027_profile_links.sql',import.meta.url),'utf8'));assert.deepEqual({...m027.prepare('SELECT display_name,bio,links FROM wm_profile_details').get()},{display_name:'A',bio:'Hi',links:'[]'});m027.close();
 migrated.close();console.log('PASS: migrations 021 and 022 add protected-deal and listing-rule data without changing existing deals, posts or counters, and keep game UIDs out of wm_posts.');
}
// Group and deal calls (call rooms) and call alerts when Wize X is closed (Web Push).
{
 const mk=async id=>{sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+1000000,Date.now())};
 for(const id of ['rc1','rc2','rc3','rc4','rc5','rc6','rc7','rdb','rds','rda'])await mk(id);sql.prepare("INSERT INTO wm_roles VALUES('rda','trusted')").run();
 for(const id of ['rc1','rc2','rc3','rc4','rc5','rc6','rc7','rdb'])assert.equal((await call('/api/groups/'+group+'/join','POST',{},id)).status<300,true);
 const sdp='v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
 const realFetch=globalThis.fetch,pushes=[];let pushStatus=201;globalThis.fetch=async(url,init)=>{pushes.push({url:String(url),headers:init.headers});return new Response(null,{status:pushStatus})};
 try{
  // Call alerts: VAPID key, only real push services, one phone per member.
  let r=await call('/api/push/key','GET',undefined,'rc2');assert.equal(r.status,200);const key=r.data.key;assert.equal(Buffer.from(key,'base64url').length,65);assert.equal((await call('/api/push/key','GET',undefined,'rc3')).data.key,key);assert.equal((await call('/api/push/key')).status,401);
  assert.equal((await call('/api/push/subscribe','POST',{endpoint:'https://evil.example/push/1',keys:{p256dh:'x',auth:'y'}},'rc2')).status,400);
  const phone='https://fcm.googleapis.com/fcm/send/rc2-phone';assert.equal((await call('/api/push/subscribe','POST',{endpoint:phone,keys:{p256dh:'p',auth:'a'}},'rc2')).status,200);
  assert.equal(sql.prepare('SELECT user_id FROM wm_push_subscriptions WHERE endpoint=?').get(phone).user_id,'rc2');
  // Group call: members only, invite in Wize X, alert to phones, join, offers and answers, cap of 6, busy, leave, call note.
  assert.equal((await call('/api/rooms','POST',{kind:'group',id:group},'outsider')).status,403);
  sql.prepare('INSERT INTO wm_member_permissions(user_id,can_post,can_message,can_start_deal,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run('rc7',1,0,1,'owner',Date.now());assert.equal((await call('/api/rooms','POST',{kind:'group',id:group},'rc7')).status,403);
  r=await call('/api/rooms','POST',{kind:'group',id:group,video:false},'rc1');assert.equal(r.status,201);const room=r.data.room.id;assert.deepEqual(r.data.members.map(m=>m.id),['rc1']);assert.equal(r.data.room.video,false);
  const alert=pushes.find(x=>x.url===phone);assert.ok(alert,'group members get a call alert');assert.equal(alert.headers.urgency,'high');assert.equal(alert.headers.ttl,'45');
  const [jwt,k]=alert.headers.authorization.slice('vapid t='.length).split(', k=');assert.equal(k,key);const [h,c,sg]=jwt.split('.');assert.equal(JSON.parse(Buffer.from(c,'base64url')).aud,'https://fcm.googleapis.com');
  const pub=await crypto.subtle.importKey('raw',Buffer.from(key,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(sg,'base64url'),new TextEncoder().encode(h+'.'+c)),'VAPID signature is valid');
  r=await call('/api/push/pending','GET',undefined,'rc2');assert.equal(r.data.events[0].kind,'room');assert.match(r.data.events[0].url,new RegExp('room='+room));assert.equal((await call('/api/push/pending','GET',undefined,'outsider')).data.events.length,0);
  assert.equal((await call('/api/chat-unread','GET',undefined,'rc2')).data.room_invite.id,room);assert.equal((await call('/api/chat-unread','GET',undefined,'rc1')).data.room_invite,null);assert.equal((await call('/api/chat-unread','GET',undefined,'outsider')).data.room_invite,null);
  r=await call('/api/groups/'+group+'/messages','GET',undefined,'rc2');assert.equal(r.data.call.id,room);assert.equal(r.data.call.joined,false);assert.equal(r.data.call.count,1);
  r=await call('/api/rooms','POST',{kind:'group',id:group},'rc2');assert.equal(r.status,200);assert.equal(r.data.room.id,room);assert.deepEqual(r.data.members.map(m=>m.id),['rc1','rc2']);assert.ok(r.data.room.answered_at);
  assert.equal((await call('/api/chat-unread','GET',undefined,'rc2')).data.room_invite,null,'no ring after joining');
  assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc1',kind:'offer',sdp:'hello'},'rc2')).status,400);assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc5',kind:'offer',sdp},'rc2')).status,409);
  assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc1',kind:'offer',sdp},'rc2')).status,200);assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc1',kind:'offer',sdp},'outsider')).status,409);
  r=await call('/api/rooms/'+room,'GET',undefined,'rc1');assert.equal(r.data.joined,true);assert.deepEqual(r.data.signals.map(x=>x.from_id+':'+x.kind),['rc2:offer']);assert.equal((await call('/api/rooms/'+room,'GET',undefined,'rc1')).data.signals.length,0,'signals are picked up once');
  assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc2',kind:'answer',sdp},'rc1')).status,200);assert.deepEqual((await call('/api/rooms/'+room,'GET',undefined,'rc2')).data.signals.map(x=>x.from_id+':'+x.kind),['rc1:answer']);
  assert.equal((await call('/api/rooms/'+room,'GET',undefined,'outsider')).status,403);r=await call('/api/rooms/'+room,'GET',undefined,'rc3');assert.equal(r.data.joined,false);assert.equal(r.data.signals.length,0);
  for(const id of ['rc3','rc4','rdb','rc5'])assert.equal((await call('/api/rooms','POST',{kind:'group',id:group},id)).status,200,id);
  r=await call('/api/rooms','POST',{kind:'group',id:group},'rc6');assert.equal(r.status,409);assert.match(r.data.error,/full/);
  // Deal call: only the buyer, seller and Admin of an open deal; busy while in another call; deal calls work for restricted members.
  const dealThread=crypto.randomUUID(),deal=crypto.randomUUID();sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,status,created_at,is_deal) VALUES(?,'rdb','rds',?,'accepted',?,1)").run(dealThread,'room:'+dealThread,Date.now());sql.prepare("INSERT INTO wm_deals(id,thread_id,buyer_id,seller_id,admin_id,price,status,buyer_ok,seller_ok,created_at) VALUES(?,?,'rdb','rds','rda',9000,'active',1,1,?)").run(deal,dealThread,Date.now());
  assert.equal((await call('/api/deals/'+deal+'/messages','POST',{text:'call:video:300'},'rdb')).status,400,'no fake call notes in deal chats');
  r=await call('/api/rooms','POST',{kind:'deal',id:deal},'rdb');assert.equal(r.status,409);assert.match(r.data.error,/another call/);
  sql.prepare('INSERT INTO wm_chat_restrictions(user_id,until_at,reason,created_at) VALUES(?,?,?,?)').run('rds',Date.now()+3600000,'test',Date.now());
  assert.equal((await call('/api/rooms','POST',{kind:'deal',id:deal},'outsider')).status,404);assert.equal((await call('/api/rooms','POST',{kind:'deal',id:deal},'owner')).status,404);
  r=await call('/api/rooms','POST',{kind:'deal',id:deal,video:true},'rds');assert.equal(r.status,201);const dealRoom=r.data.room.id;assert.equal(r.data.room.video,true);assert.match(r.data.title,/^Deal - /);
  assert.equal((await call('/api/chat-unread','GET',undefined,'rda')).data.room_invite.kind,'deal');assert.equal((await call('/api/chat-unread','GET',undefined,'rdb')).data.room_invite.id,dealRoom);
  assert.equal((await call('/api/deals/'+deal+'/messages','GET',undefined,'rda')).data.call.id,dealRoom);
  assert.equal((await call('/api/rooms','POST',{kind:'group',id:group},'rds')).status,403,'restricted members cannot start or join group calls');
  assert.equal((await call('/api/rooms/'+room+'/leave','POST',{},'rdb')).status,200);assert.equal((await call('/api/rooms','POST',{kind:'deal',id:deal},'rdb')).status,200);assert.equal((await call('/api/rooms','POST',{kind:'deal',id:deal},'rda')).status,200);
  assert.deepEqual((await call('/api/rooms/'+dealRoom,'GET',undefined,'rda')).data.members.map(m=>m.id),['rds','rdb','rda']);
  for(const id of ['rds','rdb','rda'])assert.equal((await call('/api/rooms/'+dealRoom+'/leave','POST',{},id)).status,200);
  assert.equal(sql.prepare('SELECT status FROM wm_call_rooms WHERE id=?').get(dealRoom).status,'ended');assert.ok((await call('/api/deals/'+deal+'/messages','GET',undefined,'rdb')).data.messages.some(m=>/^chat:call:video:\d+$/.test(m.text)),'deal call note');
  sql.prepare("UPDATE wm_deals SET status='completed' WHERE id=?").run(deal);assert.equal((await call('/api/rooms','POST',{kind:'deal',id:deal},'rdb')).status,409);
  // Everybody leaves the group call: it ends with a note; the ringing alert is gone.
  for(const id of ['rc1','rc2','rc3','rc4','rc5'])assert.equal((await call('/api/rooms/'+room+'/leave','POST',{},id)).status,200);
  assert.equal(sql.prepare('SELECT status FROM wm_call_rooms WHERE id=?').get(room).status,'ended');assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'rc2')).data.call,null);
  assert.ok((await call('/api/groups/'+group+'/messages','GET',undefined,'rc2')).data.messages.some(m=>m.user_id==='rc1'&&/^call:audio:\d+$/.test(m.text)),'group call note');assert.equal((await call('/api/push/pending','GET',undefined,'rc2')).data.events.filter(e=>e.kind==='room').length,0);
  assert.equal((await call('/api/rooms/'+room+'/signal','POST',{to:'rc1',kind:'offer',sdp},'rc2')).status,409);
  // A call nobody joins, and a phone that stopped answering for 30 s, ends as a missed call.
  r=await call('/api/rooms','POST',{kind:'group',id:group},'rc3');const lonely=r.data.room.id;sql.prepare('UPDATE wm_call_room_members SET seen_at=seen_at-40000 WHERE room_id=?').run(lonely);
  assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'rc4')).data.call,null);assert.ok((await call('/api/groups/'+group+'/messages','GET',undefined,'rc4')).data.messages.some(m=>m.user_id==='rc3'&&m.text==='call:audio:missed'));
  // At most 5 new group/deal calls per member every 10 minutes.
  sql.prepare("UPDATE wm_call_rooms SET created_at=? WHERE started_by='rc3'").run(Date.now()-1000);for(let i=0;i<4;i++)sql.prepare("INSERT INTO wm_call_rooms(id,kind,chat_id,video,started_by,status,created_at,ended_at) VALUES(?,'group',?,0,'rc3','ended',?,?)").run(crypto.randomUUID(),group,Date.now(),Date.now());
  r=await call('/api/rooms','POST',{kind:'group',id:group},'rc3');assert.equal(r.status,429);assert.match(r.data.error,/many calls/);
  // Personal call alert: ringing alert, then "Missed call" when the caller gives up; a phone the push service dropped (410) is removed.
  const pt=crypto.randomUUID();sql.prepare("INSERT INTO wm_threads(id,buyer_id,seller_id,pair_key,status,created_at) VALUES(?,'rc1','rc2',?,'accepted',?)").run(pt,'rc1:rc2',Date.now());
  pushes.length=0;r=await call('/api/calls','POST',{threadId:pt,video:true,offer:sdp},'rc1');assert.equal(r.status,201);const pc=r.data.id;assert.equal(pushes.filter(x=>x.url===phone).length,1);
  r=await call('/api/push/pending','GET',undefined,'rc2');assert.equal(r.data.events[0].kind,'call');assert.match(r.data.events[0].title,/rc1/);assert.match(r.data.events[0].url,new RegExp('call='+pc));
  assert.equal((await call('/api/calls/'+pc+'/end','POST',{},'rc1')).status,200);r=await call('/api/push/pending','GET',undefined,'rc2');assert.deepEqual(r.data.events.map(e=>e.kind),['missed']);assert.match(r.data.events[0].url,new RegExp('thread='+pt));
  pushStatus=410;r=await call('/api/calls','POST',{threadId:pt,offer:sdp},'rc1');assert.equal(r.status,201);assert.equal(sql.prepare('SELECT count(*) n FROM wm_push_subscriptions WHERE endpoint=?').get(phone).n,0,'expired phones are removed');await call('/api/calls/'+r.data.id+'/end','POST',{},'rc1');pushStatus=201;
  assert.equal((await call('/api/push/subscribe','POST',{endpoint:phone,keys:{}},'rc2')).status,200);assert.equal((await call('/api/push/unsubscribe','POST',{endpoint:phone},'rc2')).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM wm_push_subscriptions WHERE endpoint=?').get(phone).n,0);
 }finally{globalThis.fetch=realFetch;sql.prepare("DELETE FROM wm_chat_restrictions WHERE user_id='rds'").run()}
 console.log('PASS: group calls (members only, ring in Wize X, offers/answers picked up once, 6-person cap, busy, leave, call notes), deal calls (buyer/seller/Admin of an open deal), and call alerts (VAPID-signed Web Push, ringing and missed alerts, expired phones removed).');
}
// One site address: http → https and the workers.dev address → the real domain; local and test addresses stay as they are.
{
 const go=(u,method='GET')=>worker.fetch(new Request(u,{method}),env);
 let r=await go('http://buysell.rahatwize.com/post/abc?x=1');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://buysell.rahatwize.com/post/abc?x=1');
 r=await go('https://wize-market-preview-2026.rahatwize.workers.dev/u/rahat');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://buysell.rahatwize.com/u/rahat');
 r=await go('http://wize-market-preview-2026.rahatwize.workers.dev/');assert.equal(r.headers.get('location'),'https://buysell.rahatwize.com/');
 r=await go('https://wize-market-preview-2026.rahatwize.workers.dev/api/me','POST');assert.equal(r.status,308);
 assert.notEqual((await go('https://buysell.rahatwize.com/api/market-rules')).status,301);assert.notEqual((await go('https://test.local/api/market-rules')).status,301);assert.notEqual((await go('http://127.0.0.1:8787/api/market-rules')).status,301);
 console.log('PASS: one site address (http → https, workers.dev → buysell.rahatwize.com); local and test addresses untouched.');
}
{
 // Group invite link with join approval: only the group admin changes settings and answers requests.
 const g=(await call('/api/groups','POST',{name:'Approval group',logoId},'admin')).data.id;
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{joinApproval:true},'admin')).status,200);
 assert.equal((await call('/api/groups/'+g+'/join','POST',{},'seller')).data.joined,undefined);
 let pv=(await call('/api/groups/'+g+'/preview','GET',undefined,'seller')).data;assert.equal(pv.pending,true);assert.equal(pv.member,false);assert.equal(pv.group.joinApproval,true);
 assert.equal((await call('/api/groups/'+g+'/messages','GET',undefined,'seller')).status,403);
 const out=(await call('/api/groups/'+g+'/join','POST',{},'outsider')).data;assert.equal(out.pending,true);
 assert.equal((await call('/api/groups/'+g+'/requests','GET',undefined,'seller')).status,403);
 const detail=(await call('/api/groups/'+g,'GET',undefined,'admin')).data.group;assert.equal(detail.requests,2);assert.equal(detail.joinApproval,true);
 const list=(await call('/api/groups/'+g+'/requests','GET',undefined,'admin')).data.requests;assert.deepEqual(list.map(x=>x.id).sort(),['outsider','seller']);
 assert.equal((await call('/api/groups/'+g+'/requests/seller','POST',{approve:true},'admin')).status,200);
 assert.equal((await call('/api/groups/'+g+'/requests/outsider','POST',{approve:false},'admin')).status,200);
 assert.equal((await call('/api/groups/'+g+'/requests/outsider','POST',{approve:true},'admin')).status,404);
 assert.equal((await call('/api/groups/'+g+'/messages','GET',undefined,'seller')).status,200);
 assert.equal((await call('/api/groups/'+g+'/messages','GET',undefined,'outsider')).status,403);
 // a member cannot change group settings, ranges or answer requests
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{joinApproval:false},'seller')).status,403);
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{name:'Taken over'},'seller')).status,403);
 assert.equal((await call('/api/groups/'+g+'/ranges','POST',{label:'x',min:0,max:5},'seller')).status,403);
 assert.equal((await call('/api/groups/'+g+'/requests/outsider','POST',{approve:true},'seller')).status,403);
 // turning approval off lets the link join straight away again
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{joinApproval:false},'admin')).status,200);
 assert.equal((await call('/api/groups/'+g+'/join','POST',{},'outsider')).data.joined,true);
 assert.equal((await call('/api/groups/'+g+'/messages','GET',undefined,'outsider')).status,200);
 console.log('PASS: group invite link joins directly or waits for admin approval; only the group admin changes settings and answers join requests.');
}
{
 // Chat extras: nicknames, colour/emoji and pins. Group: own nickname for members; the rest is for the group admin only.
 const g=(await call('/api/groups','POST',{name:'Extras group',logoId},'admin')).data.id;await call('/api/groups/'+g+'/join','POST',{},'buyer');
 const base='/api/chat-extras/group/'+g;
 assert.equal((await call(base+'/nickname','POST',{userId:'buyer',nickname:'Boss buyer'},'buyer')).status,200);
 assert.equal((await call(base+'/nickname','POST',{userId:'admin',nickname:'Hacked'},'buyer')).status,403);
 assert.equal((await call(base+'/nickname','POST',{userId:'buyer',nickname:'Call 01711111111'},'buyer')).status,400);
 assert.equal((await call(base+'/nickname','POST',{userId:'admin',nickname:'Group Boss'},'admin')).status,200);
 assert.equal((await call(base+'/nickname','POST',{userId:'outsider',nickname:'x'},'admin')).status,404);
 assert.equal((await call(base+'/theme','POST',{color:'#a033ff',emoji:'🔥'},'buyer')).status,403);
 assert.equal((await call(base+'/theme','POST',{color:'#123456',emoji:'🔥'},'admin')).status,400);
 assert.equal((await call(base+'/theme','POST',{color:'#a033ff',emoji:'🔥'},'admin')).status,200);
 await call('/api/groups/'+g+'/messages','POST',{text:'Pin me'},'buyer');const mid=(await call('/api/groups/'+g+'/messages','GET',undefined,'admin')).data.messages.find(m=>m.text==='Pin me')?.id;assert.ok(Number.isInteger(mid));
 assert.equal((await call(base+'/pin','POST',{messageId:mid,pinned:true},'buyer')).status,403);
 assert.equal((await call(base+'/pin','POST',{messageId:mid,pinned:true},'admin')).status,200);
 assert.equal((await call(base+'/pin','POST',{messageId:999999,pinned:true},'admin')).status,404);
 let x=(await call(base,'GET',undefined,'buyer')).data;assert.equal(x.nicknames.buyer,'Boss buyer');assert.equal(x.nicknames.admin,'Group Boss');assert.equal(x.theme.color,'#a033ff');assert.equal(x.theme.emoji,'🔥');assert.equal(x.theme.background,'');assert.equal(x.pins.length,1);assert.equal(x.pins[0].text,'Pin me');assert.equal(x.can.theme,false);
 assert.equal((await call(base,'GET',undefined,'outsider')).status,403);
 assert.equal((await call(base+'/nickname','POST',{userId:'buyer',nickname:''},'buyer')).status,200);
 assert.equal((await call(base+'/pin','POST',{messageId:mid,pinned:false},'admin')).status,200);
 x=(await call(base,'GET',undefined,'admin')).data;assert.equal(x.nicknames.buyer,undefined);assert.equal(x.pins.length,0);assert.equal(x.can.theme,true);
 // personal chat: both people can change everything; others cannot see it
 const t=(await call('/api/threads','POST',{userId:'seller'},'outsider')).data.thread.id;const pbase='/api/chat-extras/private/'+t;
 assert.equal((await call(pbase+'/nickname','POST',{userId:'seller',nickname:'Bhai'},'outsider')).status,200);
 assert.equal((await call(pbase+'/theme','POST',{color:'#13b06b',emoji:'❤️'},'seller')).status,200);
 assert.equal((await call(pbase,'GET',undefined,'buyer')).status,404);
 x=(await call(pbase,'GET',undefined,'seller')).data;assert.equal(x.nicknames.seller,'Bhai');assert.equal(x.theme.emoji,'❤️');assert.equal(x.can.pin,true);
 console.log('PASS: chat nicknames, colour and emoji, pinned messages (personal: both people; group: own nickname, admin for the rest).');
}
{
 // Reactions and "delete for me" on group and personal messages.
 const g=(await call('/api/groups','POST',{name:'React group',logoId},'admin')).data.id;await call('/api/groups/'+g+'/join','POST',{},'buyer');
 await call('/api/groups/'+g+'/messages','POST',{text:'React to me'},'buyer');const mid=(await call('/api/groups/'+g+'/messages','GET',undefined,'admin')).data.messages.find(m=>m.text==='React to me').id;const base='/api/chat-extras/group/'+g;
 assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:'❤️'},'admin')).status,200);assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:'❤️'},'buyer')).status,200);
 assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:'<script>'},'buyer')).status,400);assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:'👍'},'outsider')).status,403);
 let x=(await call(base,'GET',undefined,'admin')).data;let r=x.reactions.find(z=>z.message_id===mid&&z.emoji==='❤️');assert.equal(r.total,2);assert.equal(r.mine,1);
 assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:'😆'},'buyer')).status,200);assert.equal((await call(base+'/react','POST',{messageId:mid,emoji:''},'admin')).status,200);
 x=(await call(base,'GET',undefined,'admin')).data;assert.equal(x.reactions.filter(z=>z.message_id===mid).map(z=>z.emoji+z.total).join(),'😆1');
 assert.equal((await call(base+'/hide','POST',{messageId:mid},'buyer')).status,200);assert.deepEqual((await call(base,'GET',undefined,'buyer')).data.hidden,[mid]);assert.deepEqual((await call(base,'GET',undefined,'admin')).data.hidden,[]);
 assert.ok((await call('/api/groups/'+g+'/messages','GET',undefined,'admin')).data.messages.some(m=>m.id===mid));
 assert.equal((await call(base+'/hide','POST',{messageId:999999},'buyer')).status,404);
 console.log('PASS: message reactions (one per person, change or remove) and delete-for-me that leaves the message for everyone else.');
}
{
 // Chat background photo: only the people in the chat can load it.
 const t=(await call('/api/threads','POST',{userId:'buyer'},'seller')).data.thread.id,bg=crypto.randomUUID();
 sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(bg,'seller','image/png',16,Date.now());objects.set(bg,new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]));sql.prepare('INSERT INTO wm_media_checks VALUES(?,?,?,?)').run(bg,'safe','Test scanner passed',Date.now());
 const base='/api/chat-extras/private/'+t;assert.equal((await call(base+'/theme','POST',{color:'#0a7cff',emoji:'👍',backgroundId:bg},'seller')).status,200);
 assert.equal((await call(base,'GET',undefined,'buyer')).data.theme.background,'/media/'+bg);
 const media=async who=>(await worker.fetch(new Request('https://test.local/media/'+bg,{headers:who?{cookie:'wm_session='+tokens[who]}:{}}),env)).status;
 assert.equal(await media('buyer'),200);assert.equal(await media('outsider'),404);assert.equal(await media(),404);
 const other=crypto.randomUUID();sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(other,'outsider','image/png',16,Date.now());assert.equal((await call(base+'/theme','POST',{color:'#0a7cff',emoji:'👍',backgroundId:other},'seller')).status,404);
 assert.equal((await call(base+'/theme','POST',{color:'#0a7cff',emoji:'👍',backgroundId:null},'buyer')).status,200);assert.equal((await call(base,'GET',undefined,'seller')).data.theme.background,'');
 console.log('PASS: chat background photo (own safe image, visible only to the people in the chat, removable).');
}
{
 // Message permissions: only admins can send when the admin turns it on.
 const g=(await call('/api/groups','POST',{name:'Admins only',logoId},'admin')).data.id;await call('/api/groups/'+g+'/join','POST',{},'buyer');
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{adminsOnly:true},'buyer')).status,403);
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{adminsOnly:true},'admin')).status,200);assert.equal((await call('/api/groups/'+g,'GET',undefined,'buyer')).data.group.adminsOnly,true);
 assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'hello'},'buyer')).status,403);assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'Rules'},'admin')).status,201);
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{adminsOnly:false},'admin')).status,200);assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'hello'},'buyer')).status,201);
 console.log('PASS: group message permissions (everyone or only the group admin).');
}
{
 // Group co-admins and members list; pins only I can see in personal chats.
 const g=(await call('/api/groups','POST',{name:'Co-admin group',logoId},'admin')).data.id;for(const who of ['buyer','seller'])await call('/api/groups/'+g+'/join','POST',{},who);
 assert.equal((await call('/api/groups/'+g+'/admins','POST',{userId:'seller',admin:true},'buyer')).status,403);
 assert.equal((await call('/api/groups/'+g+'/admins','POST',{userId:'buyer',admin:true},'admin')).status,200);
 let list=(await call('/api/groups/'+g+'/members','GET',undefined,'seller')).data.members;assert.equal(list[0].id,'admin');assert.equal(list[0].creator,true);assert.equal(list[1].id,'buyer');assert.equal(list[1].is_admin,true);assert.equal(list[2].is_admin,false);
 assert.equal((await call('/api/groups/'+g+'/settings','POST',{adminsOnly:true},'buyer')).status,200);assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'co-admin talks'},'buyer')).status,201);assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'member'},'seller')).status,403);
 assert.equal((await call('/api/groups/'+g+'/admins','POST',{userId:'buyer',admin:false},'buyer')).status,403);assert.equal((await call('/api/groups/'+g+'/admins','POST',{userId:'admin',admin:false},'buyer')).status,409);
 assert.equal((await call('/api/groups/'+g+'/admins','POST',{userId:'buyer',admin:false},'admin')).status,200);assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'not admin now'},'buyer')).status,403);
 const gm=(await call('/api/groups/'+g+'/messages','GET',undefined,'admin')).data.messages[0].id;assert.equal((await call('/api/chat-extras/group/'+g+'/pin','POST',{messageId:gm,pinned:true,scope:'me'},'seller')).status,403);
 const t=(await call('/api/threads','POST',{userId:'seller'},'buyer')).data.thread.id;await call('/api/threads/'+t+'/messages','POST',{text:'pin for me'},'buyer');const pm=(await call('/api/threads/'+t+'/messages','GET',undefined,'buyer')).data.messages[0].id;
 assert.equal((await call('/api/chat-extras/private/'+t+'/pin','POST',{messageId:pm,pinned:true,scope:'me'},'buyer')).status,200);
 const mine=(await call('/api/chat-extras/private/'+t,'GET',undefined,'buyer')).data;assert.equal(mine.pins.length,1);assert.equal(mine.pins[0].only_me,1);assert.equal(mine.can.pinForMe,true);
 assert.equal((await call('/api/chat-extras/private/'+t,'GET',undefined,'seller')).data.pins.length,0);
 assert.equal((await call('/api/chat-extras/private/'+t+'/pin','POST',{messageId:pm,pinned:true},'seller')).status,200);assert.equal((await call('/api/chat-extras/private/'+t,'GET',undefined,'buyer')).data.pins.length,1);assert.equal((await call('/api/chat-extras/private/'+t,'GET',undefined,'seller')).data.pins[0].only_me,0);
 console.log('PASS: group co-admins (add/remove, admins first in members), personal-chat pins only for me or for both.');
}
{
 // @mentions and @everyone: alerts even when muted; only admins mention everyone.
 const g=(await call('/api/groups','POST',{name:'Mention group',logoId},'admin')).data.id;for(const who of ['buyer','seller'])await call('/api/groups/'+g+'/join','POST',{},who);
 await call('/api/groups/'+g+'/preferences','POST',{muted:true},'seller');
 let r=await call('/api/groups/'+g+'/messages','POST',{text:'@seller dekho',mentions:['seller','outsider','buyer']},'buyer');assert.equal(r.status,201);assert.equal(r.data.mentioned,1);
 let u=(await call('/api/chat-unread','GET',undefined,'seller')).data;assert.equal(u.mentions.find(m=>m.group_id===g).total,1);assert.equal(u.mention_popup.group_id,g);assert.equal(u.mention_popup.text,'@seller dekho');
 assert.equal((await call('/api/chat-unread','GET',undefined,'buyer')).data.mentions.filter(m=>m.group_id===g).length,0);
 r=await call('/api/groups/'+g+'/messages','POST',{text:'@everyone meeting',everyone:true},'buyer');assert.equal(r.status,201);assert.equal(r.data.mentioned,2);
 let x=(await call('/api/chat-extras/group/'+g,'GET',undefined,'seller')).data;assert.equal(x.mentions.length,2);
 assert.equal((await call('/api/chat-extras/group/'+g+'/mention-seen','POST',{messageId:x.mentions[0]},'seller')).status,200);assert.equal((await call('/api/chat-extras/group/'+g,'GET',undefined,'seller')).data.mentions.length,1);
 assert.equal((await call('/api/chat-extras/group/'+g+'/mention-seen','POST',{},'seller')).status,200);assert.equal((await call('/api/chat-unread','GET',undefined,'seller')).data.mentions.length,0);
 assert.ok(sql.prepare("SELECT count(*) n FROM wm_notifications WHERE user_id='seller' AND kind='group_mention' AND alert_enabled=1").get().n>=2);
 console.log('PASS: @mentions and @everyone (members only, @everyone by any member, alerts while muted, seen tracking).');
}
{
 // Invite links: /j/<code>, off switch and reset.
 const g=(await call('/api/groups','POST',{name:'Invite group',logoId},'admin')).data.id;
 assert.equal((await call('/api/groups/'+g+'/invite','GET',undefined,'buyer')).status,403);// not a member
 let inv=(await call('/api/groups/'+g+'/invite','GET',undefined,'admin')).data;assert.match(inv.code,/^[A-Za-z0-9]{10}$/);assert.equal(inv.url,'https://test.local/j/'+inv.code);assert.equal(inv.enabled,true);
 assert.equal((await call('/api/invites/'+inv.code,'GET',undefined,'buyer')).data.group.id,g);
 assert.equal((await call('/api/groups/'+g+'/join','POST',{code:'WRONGCODE1'},'buyer')).status,403);
 const old=inv.code;inv=(await call('/api/groups/'+g+'/invite','POST',{action:'reset'},'admin')).data;assert.notEqual(inv.code,old);
 assert.equal((await call('/api/invites/'+old,'GET',undefined,'buyer')).status,404);assert.equal((await call('/api/groups/'+g+'/join','POST',{code:old},'buyer')).status,403);
 await call('/api/groups/'+g+'/invite','POST',{action:'off'},'admin');assert.equal((await call('/api/invites/'+inv.code,'GET',undefined,'buyer')).status,404);assert.equal((await call('/api/groups/'+g+'/join','POST',{code:inv.code},'buyer')).status,403);
 await call('/api/groups/'+g+'/invite','POST',{action:'on'},'admin');assert.equal((await call('/api/groups/'+g+'/join','POST',{code:inv.code},'buyer')).data.joined,true);
 assert.equal((await call('/api/groups/'+g+'/invite','GET',undefined,'buyer')).data.canManage,false);assert.equal((await call('/api/groups/'+g+'/invite','POST',{action:'reset'},'buyer')).status,403);
 console.log('PASS: group invite links (/j/code, wrong or reset codes refused, link off and on).');
}
{
 // Price ranges: change order, delete only when empty.
 const g=(await call('/api/groups','POST',{name:'Range group',logoId},'admin')).data.id;const a=(await call('/api/groups/'+g+'/ranges','POST',{label:'A',min:0,max:5000},'admin')).data.id,b=(await call('/api/groups/'+g+'/ranges','POST',{label:'B',min:5001,max:null},'admin')).data.id;
 let list=(await call('/api/groups/'+g,'GET',undefined,'admin')).data.ranges.map(r=>r.id);assert.ok(list.indexOf(a)<list.indexOf(b));
 assert.equal((await call('/api/groups/'+g+'/ranges/order','POST',{ids:[b,a,...list.filter(x=>x!==a&&x!==b)]},'admin')).status,200);list=(await call('/api/groups/'+g,'GET',undefined,'admin')).data.ranges.map(r=>r.id);assert.equal(list[0],b);
 await call('/api/groups/'+g+'/join','POST',{},'buyer');assert.equal((await call('/api/groups/'+g+'/ranges/order','POST',{ids:[a,b]},'buyer')).status,403);
 const r=await call('/api/posts','POST',{title:'Range ID',details:'Range ID details',price:9000,kind:'Game ID',media:[],groupId:g},'admin');assert.equal(r.status,201);
 const used=sql.prepare('SELECT range_id FROM wm_posts WHERE id=?').get(r.data.id).range_id;assert.ok(used);assert.equal((await call('/api/groups/'+g+'/ranges/'+used+'/delete','POST',{},'admin')).status,409);assert.equal((await call('/api/groups/'+g+'/ranges/'+a+'/delete','POST',{},'buyer')).status,403);
 const empty=a===used?b:a;assert.equal((await call('/api/groups/'+g+'/ranges/'+empty+'/delete','POST',{},'admin')).status,200);assert.ok(!(await call('/api/groups/'+g,'GET',undefined,'admin')).data.ranges.some(x=>x.id===empty));
 console.log('PASS: price ranges can be reordered and deleted when empty (group admin only).');
}
{
 // Each site has its own address: WizeNex sends workers.dev to wizenex.com; "none" keeps workers.dev open.
 const go=async site=>(await worker.fetch(new Request('https://wizenex.rahatwize.workers.dev/u/test'),{...env,SITE_HOST:site}));
 let r=await go('wizenex.com');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://wizenex.com/u/test');
 r=await go('none');assert.notEqual(r.status,301);
 console.log('PASS: per-site address (SITE_HOST) for WizeNex.');
}
{
 // Admin deal limits: the Owner sets the most taka a trusted Admin can handle; the Owner is always first and has no limit.
 assert.equal((await call('/api/admin/deal-limit','POST',{userId:'admin',maxAmount:5000},'admin')).status,403);
 assert.equal((await call('/api/admin/deal-limit','POST',{userId:'buyer',maxAmount:5000},'owner')).status,409);
 assert.equal((await call('/api/admin/deal-limit','POST',{userId:'admin',maxAmount:'5k'},'owner')).data.maxAmount,5000);
 const list=(await call('/api/admin/users?q=','GET',undefined,'owner')).data.users;assert.equal(list.find(x=>x.id==='admin').deal_limit,5000);
 sql.prepare("DELETE FROM wm_limits").run();sql.prepare("UPDATE wm_posts SET availability='sold',created_at=created_at-3*86400000 WHERE user_id='seller'").run();
 const pr=await call('/api/posts','POST',{title:'Limit ID',details:'Limit ID details',price:9000,kind:'Game ID',media:[]},'seller');assert.equal(pr.status,201,JSON.stringify(pr.data));
 const picks=(await call('/api/deal-admins?postId='+pr.data.id,'GET',undefined,'buyer')).data;
 if(picks.mode==='mediated'){assert.ok(picks.allAdmins.some(a=>a.role==='owner'));assert.ok(!picks.allAdmins.some(a=>a.id==='admin'))}
 const r=await call('/api/deals','POST',{postId:pr.data.id,adminId:'admin'},'buyer');assert.equal(r.status,409);assert.match(r.data.error,/up to ৳5,000/);
 assert.equal((await call('/api/admin/deal-limit','POST',{userId:'admin',maxAmount:null},'owner')).data.maxAmount,null);
 console.log('PASS: Admin deal limits (set by the Owner, enforced when choosing an Admin; the Owner is recommended on top only for new members).');
}
{
 // Members create chat groups (photo optional) and add friends or people they chat with.
 const maker='buyer',friend='seller',stranger='cg_stranger';sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(stranger,stranger,stranger+'@example.com',stranger,'',Date.now(),Date.now());tokens[stranger]=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(tokens[stranger]),stranger,Date.now()+1000000,Date.now());
 sql.prepare("DELETE FROM wm_user_blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?)").run(maker,friend,friend,maker);sql.prepare("INSERT OR IGNORE INTO wm_threads(id,buyer_id,seller_id,post_id,pair_key,status,created_at,is_deal) VALUES(?,?,?,NULL,?,'accepted',?,0)").run(crypto.randomUUID(),maker,friend,'chat-group-test:'+maker+':'+friend,Date.now());
 const r=await call('/api/groups','POST',{name:'Friends chat'},maker);assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.chatGroup,true);const g=r.data.id;
 let a=await call('/api/groups/'+g+'/add-members','POST',{userIds:[friend,stranger]},maker);assert.ok(a.data.added.includes(friend));assert.ok(!a.data.added.includes(stranger));
 assert.equal((await call('/api/groups/'+g+'/add-members','POST',{userIds:[stranger]},friend)).status,403);
 assert.equal((await call('/api/groups/'+g+'/messages','POST',{text:'hello group'},friend)).status,201);assert.equal((await call('/api/groups/'+g+'/messages','GET',undefined,friend)).status,200);
 assert.equal((await call('/api/groups/'+g+'/join','POST',{},stranger)).status,403);
 const inv=(await call('/api/groups/'+g+'/invite','GET',undefined,maker)).data;assert.equal((await call('/api/groups/'+g+'/join','POST',{code:inv.code},stranger)).data.joined,true);
 console.log('PASS: member chat groups (create, add friends or chat contacts, join only with the invite link).');
}
{
 // Videos longer than 2 minutes are refused.
 const box=(type,body)=>{const b=new Uint8Array(8+body.length);new DataView(b.buffer).setUint32(0,b.length);b.set(new TextEncoder().encode(type),4);b.set(body,8);return b};
 const mp4=secs=>{const mv=new Uint8Array(100);const dv=new DataView(mv.buffer);dv.setUint32(12,1000);dv.setUint32(16,secs*1000);const ftyp=box('ftyp',new TextEncoder().encode('isom0000isom')),moov=box('moov',box('mvhd',mv)),all=new Uint8Array(ftyp.length+moov.length+64);all.set(ftyp);all.set(moov,ftyp.length);return all};
 const send=async bytes=>(await worker.fetch(new Request('https://test.local/api/upload',{method:'POST',headers:{origin:'https://test.local','content-type':'video/mp4',cookie:'wm_session='+tokens.buyer},body:bytes}),env)).status;
 assert.equal(await send(mp4(150)),413);assert.equal(await send(mp4(60)),201);assert.equal(await send(mp4(120)),201);
 console.log('PASS: videos are limited to 2 minutes (MP4 length read from the header).');
}
{
 const post={title:'Ban test',details:'Details',price:5000,kind:'Game ID',media:[]};
 assert.equal((await call('/api/admin/suspend','POST',{userId:'outsider',hours:2},'admin')).status,403);
 assert.equal((await call('/api/admin/suspend','POST',{userId:'owner',forever:true},'owner')).status,403);
 assert.equal((await call('/api/admin/suspend','POST',{userId:'outsider',hours:0},'owner')).status,400);
 const timed=await call('/api/admin/suspend','POST',{userId:'outsider',hours:48,reason:'Scam report'},'owner');assert.equal(timed.status,200);assert.ok(Math.abs(timed.data.until-Date.now()-48*3600000)<60000);
 assert.equal((await call('/api/posts','POST',post,'outsider')).status,423);
 let list=(await call('/api/admin/users?q=outsider','GET',undefined,'owner')).data.users;assert.equal(list[0].suspension.reason,'Scam report');
 const ban=await call('/api/admin/suspend','POST',{userId:'outsider',forever:true},'owner');assert.equal(ban.status,200);assert.ok(ban.data.until>Date.now()+1e12);
 const blocked=await call('/api/posts','POST',post,'outsider');assert.equal(blocked.status,423);assert.match(blocked.data.error,/banned/);
 assert.equal((await call('/api/me','GET',undefined,'outsider')).status,200);
 assert.equal((await call('/api/admin/restore','POST',{userId:'outsider'},'owner')).status,200);
 list=(await call('/api/admin/users?q=outsider','GET',undefined,'owner')).data.users;assert.equal(list[0].suspension,null);
 console.log('PASS: owner can suspend a member for hours/days or ban them with no end date; owner cannot be suspended; restore lifts it.');
}
