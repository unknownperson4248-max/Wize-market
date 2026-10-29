import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{api,verifyGoogle,listingPrice,hasExternalContact} from './worker.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT,name TEXT,picture TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER,created_at INTEGER);');sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const prepare=q=>({values:[],bind(...v){this.values=v;return this},async first(){return sql.prepare(q).get(...this.values)||null},async all(){return {results:sql.prepare(q).all(...this.values)}},async run(){const r=sql.prepare(q).run(...this.values);return {meta:{changes:Number(r.changes)}}}});const db={prepare,async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};const objects=new Map();const env={DB:db,MEDIA:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:objects.get(k),size:objects.get(k).length}:null}};
const hash=async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');const tokens={};for(const id of ['owner','admin','buyer','seller','outsider']){sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.com',id,'',Date.now(),Date.now());const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');tokens[id]=token;sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await hash(token),id,Date.now()+1000000,Date.now())}sql.exec("INSERT INTO wm_roles VALUES('owner','owner'),('admin','trusted')");const logoId=crypto.randomUUID();sql.prepare('INSERT INTO wm_uploads VALUES(?,?,?,?,?)').run(logoId,'admin','image/png',16,Date.now());objects.set(logoId,new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]));
async function call(path,method='GET',data,id,origin='https://test.local'){const req=new Request('https://test.local'+path,{method,headers:{origin,'content-type':'application/json',...(id?{cookie:'wm_session='+tokens[id]}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});const res=await worker.fetch(req,env);let value;try{value=await res.json()}catch{}return {status:res.status,data:value}}
assert.equal((await call('/api/groups','POST',{name:'Not allowed',price:5000},'buyer')).status,403);
assert.equal((await call('/api/threads','POST',{},undefined)).status,401);
assert.equal((await call('/api/groups','POST',{name:'CSRF',price:1},'admin','https://evil.local')).status,403);
let r=await call('/api/groups','POST',{name:'ID buy sell',logoId},'admin');assert.equal(r.status,201);const group=r.data.id;const groupRanges=(await call('/api/groups/'+group,'GET',undefined,'admin')).data.ranges;const firstRange=groupRanges[0].id;await call('/api/groups/'+group+'/join','POST',{},'buyer');assert.equal((await call('/api/groups/'+group+'/messages','GET',undefined,'outsider')).status,403);assert.equal((await call('/api/groups/'+group+'/messages','POST',{text:'Hello group'},'buyer')).status,201);
const post={title:'Game ID',details:'Details',price:5000,kind:'Game ID',media:[]};r=await call('/api/posts','POST',post,'seller');assert.equal(r.status,201);const postId=r.data.id;assert.equal((await call('/api/feed')).data.posts.length,0);assert.equal((await call('/api/moderation','POST',{id:postId,status:'approved'},'buyer')).status,403);assert.equal((await call('/api/moderation','POST',{id:postId,status:'approved'},'admin')).status,200);assert.equal((await call('/api/feed?q=5000')).data.posts[0].id,postId);assert.equal((await call('/api/feed')).data.posts[0].email,undefined);
r=await call('/api/posts','POST',{...post,groupId:group,rangeId:firstRange},'buyer');const groupPost=r.data.id;await call('/api/moderation','POST',{id:groupPost,status:'approved'},'admin');assert.equal((await call('/api/feed')).data.posts.length,1);assert.equal((await call('/api/feed?group='+group,'GET',undefined,'buyer')).data.posts.length,1);assert.equal((await call('/api/feed?group='+group,'GET',undefined,'outsider')).status,403);
r=await call('/api/threads','POST',{postId},'buyer');assert.equal(r.status,201);const thread=r.data.thread.id;assert.equal((await call('/api/threads/'+thread+'/messages','GET',undefined,'outsider')).status,404);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Interested'},'buyer')).status,201);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Spam'},'buyer')).status,403);assert.equal((await call('/api/threads/'+thread+'/accept','POST',{},'buyer')).status,403);assert.equal((await call('/api/threads/'+thread+'/accept','POST',{},'seller')).status,200);assert.equal((await call('/api/threads/'+thread+'/messages','POST',{text:'Hello'},'seller')).status,201);
await call('/api/follow','POST',{userId:'seller',follow:true},'buyer');assert.equal((await call('/api/profile/seller','GET',undefined,'buyer')).data.profile.followed,1);assert.equal((await call('/api/profile/seller')).data.profile.email,undefined);assert.equal((await call('/api/admin/role','POST',{userId:'buyer',role:'trusted'},'admin')).status,403);
r=await call('/api/deals','POST',{threadId:thread,adminId:'buyer',price:5000,fee:50},'buyer');assert.equal(r.status,400);r=await call('/api/deals','POST',{threadId:thread,adminId:'admin',price:5000,fee:50},'buyer');assert.equal(r.status,201);const deal=r.data.id;assert.equal((await call('/api/deals/'+deal,'GET',undefined,'outsider')).status,404);assert.equal((await call('/api/deals/'+deal+'/action','POST',{action:'activate',version:0},'admin')).status,403);assert.equal((await call('/api/deals/'+deal+'/messages','GET',undefined,'buyer')).status,409);
const action=(action,version,id)=>call('/api/deals/'+deal+'/action','POST',{action,version},id);assert.equal((await action('confirm',0,'buyer')).status,200);assert.equal((await action('confirm',0,'seller')).status,409);assert.equal((await action('confirm',1,'seller')).status,200);assert.equal((await action('activate',2,'admin')).status,200);assert.equal((await call('/api/deals/'+deal+'/messages','POST',{text:'Private room'},'admin')).status,201);assert.equal((await call('/api/deals/'+deal+'/messages','GET',undefined,'outsider')).status,404);assert.equal((await action('complete',3,'buyer')).status,200);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.deals,0);assert.equal((await action('complete',4,'seller')).status,200);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.deals,1);assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.idDeals,1);assert.equal((await action('complete',5,'buyer')).status,403);
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
assert.equal((await call('/api/admin/users','GET',undefined,'admin')).status,403);const adminPeople=await call('/api/admin/users?q=buyer','GET',undefined,'owner');assert.equal(adminPeople.data.users.length,1);assert.equal(adminPeople.data.users[0].email,undefined);
assert.equal((await call('/api/admin/settings','POST',{name:'Test Market',welcome:'Welcome players'},'admin')).status,403);assert.equal((await call('/api/admin/settings','POST',{name:'Test Market',welcome:'Welcome players'},'owner')).status,200);assert.deepEqual((await call('/api/site')).data,{name:'Test Market',welcome:'Welcome players'});
assert.equal((await call('/api/admin/role','POST',{userId:'owner',role:'trusted'},'admin')).status,403);assert.equal((await call('/api/admin/role','POST',{userId:'outsider',role:'trusted'},'owner')).status,200);assert.equal((await call('/api/admin/role','POST',{userId:'owner',role:'trusted'},'outsider')).status,403);
console.log('PASS: authenticated R2 group images, full response status, private chats hidden from owner/admin/outsiders, admin role boundaries and persistent website settings.');
// Usernames are case-insensitive and unique at the database boundary; shared links resolve the same profile.
assert.equal((await call('/api/profile/settings','POST',{username:'Rahat_Test'},'buyer')).data.username,'rahat_test');
assert.equal((await call('/api/profile/settings','POST',{username:'RAHAT_TEST'},'seller')).status,409);
assert.equal((await call('/api/profile/settings','POST',{username:'admin'},'seller')).status,400);
assert.equal((await call('/api/people/rahat_test')).data.userId,'buyer');assert.equal((await call('/api/profile/buyer')).data.profile.username,'rahat_test');assert.equal((await call('/api/me','GET',undefined,'buyer')).data.user.username,'rahat_test');
assert.equal((await call('/api/feed?q=rahat_test')).data.profiles[0].id,'buyer');
assert.equal((await call('/api/profile/settings','POST',{username:'new_rahat'},'buyer')).status,200);assert.equal((await call('/api/people/rahat_test')).status,404);
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
assert.equal((await call('/api/profile/seller')).data.profile.name,'Rahat Custom');assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].name,'Rahat Custom');assert.equal((await worker.fetch(new Request('https://test.local/avatar/seller'),env)).status,200);
assert.equal((await call('/api/profile/details','POST',{name:'bad',bio:'x',pictureId:mediaId},'buyer')).status,400);assert.equal((await call('/api/profile/details','POST',{name:'bad',bio:'x'.repeat(501)},'seller')).status,400);
// Removing a listing preserves thread/deal history and denies new listing-based conversations.
const listingVersion=sql.prepare('SELECT version FROM wm_posts WHERE id=?').get(postId).version;assert.equal((await call('/api/posts/'+postId+'/delete','POST',{version:listingVersion},'seller')).status,200);assert.equal((await call('/api/deals/'+deal,'GET',undefined,'buyer')).status,200);assert.equal((await call('/api/threads','POST',{postId},'outsider')).status,404);
console.log('PASS: member Home group visibility, owner edit/delete and stale-edit conflicts, 1–50 photos with ownership/order limits, public custom profiles/avatars, and preserved deal history after removal.');
// Saved posts belong only to the authenticated viewer, and group membership is checked on save and read.
sql.exec('DELETE FROM wm_limits');env.AI=safeAI;
assert.equal((await call('/api/saved')).status,401);assert.equal((await call('/api/saved','POST',{postId:album.data.id,save:true},'buyer')).status,200);assert.equal((await call('/api/saved','GET',undefined,'buyer')).data.posts[0].id,album.data.id);assert.equal((await call('/api/saved?userId=buyer','GET',undefined,'outsider')).data.posts.length,0);assert.equal((await call('/api/profile/buyer')).data.saved,undefined);assert.equal((await call('/api/saved','POST',{postId:groupPost,save:true},'outsider')).status,403);
assert.equal((await call('/api/saved','POST',{postId:groupPost,save:true},'buyer')).status,200);sql.prepare('DELETE FROM wm_group_members WHERE group_id=? AND user_id=?').run(group,'buyer');assert.ok(!(await call('/api/saved','GET',undefined,'buyer')).data.posts.some(p=>p.id===groupPost));await call('/api/groups/'+group+'/join','POST',{},'buyer');
// Likes are idempotent; comments are scoped to the visible post and derive real counts.
assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+album.data.id+'/comments','POST',{text:'Looks great!'},'buyer')).status,201);assert.equal((await call('/api/posts/'+groupPost+'/comments','GET',undefined,'outsider')).status,403);const decorated=(await call('/api/feed?q=Fifty%20image%20album','GET',undefined,'buyer')).data.posts[0];assert.equal(decorated.saved,true);assert.equal(decorated.liked,true);assert.equal(decorated.like_count,1);assert.equal(decorated.comment_count,1);assert.equal((await call('/api/posts/'+album.data.id+'/like','POST',{like:false},'buyer')).data.count,0);assert.equal((await call('/api/saved','POST',{postId:album.data.id,save:false},'buyer')).status,200);
// Reviews require a completed deal and the reviewer must be one of its two parties.
assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:5,comment:'Smooth completed trade'},'outsider')).status,403);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:6,comment:'Invalid rating'},'buyer')).status,400);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:5,comment:'Smooth completed trade'},'buyer')).status,200);const publicReviews=(await call('/api/profile/seller/reviews')).data;assert.equal(publicReviews.summary.count,1);assert.equal(publicReviews.reviews[0].rating,5);assert.equal(publicReviews.reviews[0].price,undefined);assert.equal(publicReviews.reviews[0].email,undefined);assert.equal((await call('/api/reviews','POST',{dealId:deal,rating:4,comment:'Updated experience'},'buyer')).status,200);assert.equal((await call('/api/profile/seller/reviews')).data.summary.count,1);
// Shared post links enforce the same group visibility; group listings can start a private deal conversation.
assert.equal((await call('/api/listing/'+album.data.id)).status,200);assert.equal((await call('/api/listing/'+groupPost)).status,401);assert.equal((await call('/api/listing/'+groupPost,'GET',undefined,'outsider')).status,403);assert.equal((await call('/api/listing/'+groupPost,'GET',undefined,'buyer')).status,200);assert.equal((await call('/api/threads','POST',{postId:groupPost},'seller')).status,200);
console.log('PASS: private Saved ownership and group access, real idempotent likes/comments, verified completed-deal public reviews, and scoped shared listings/group deal contact.');
// Blue verification is a distinct owner-managed permission, never inherited from admin access.
sql.exec('DELETE FROM wm_limits');
assert.equal((await call('/api/profile/owner')).data.profile.verified,1);
assert.equal((await call('/api/profile/admin')).data.profile.verified,0);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true})).status,401);
for(const id of ['admin','buyer','seller'])assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true},id)).status,403);
assert.equal((await call('/api/admin/verification','POST',{userId:'missing',verified:true},'owner')).status,404);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:'yes'},'owner')).status,400);
assert.equal((await call('/api/admin/verification','POST',{userId:'owner',verified:false},'owner')).status,403);
assert.equal((await call('/api/admin/verification','POST',{userId:'seller',verified:true},'owner')).status,200);
assert.equal((await call('/api/profile/seller')).data.profile.verified,1);
assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.verified,1);
assert.equal((await call('/api/me','GET',undefined,'seller')).data.user.role,'member');
assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].verified,1);
assert.equal((await call('/api/admin/verification','POST',{userId:'buyer',verified:true},'seller')).status,403);
assert.equal((await call('/api/admin/role','POST',{userId:'seller',role:'trusted'},'owner')).status,200);
assert.equal((await call('/api/admin/role','POST',{userId:'seller',role:'member'},'owner')).status,200);
assert.equal((await call('/api/profile/seller')).data.profile.verified,1);
// The separate control-room session uses the same owner authorization; Google sessions alone cannot use it.
assert.equal((await call('/api/control/verification','POST',{userId:'seller',verified:false},'owner')).status,401);
const badgeEntry=await call('/api/control/owner-access','POST',{},'owner');assert.equal(badgeEntry.status,200);
const badgeLogin=await worker.fetch(new Request('https://test.local/api/control/owner-access',{method:'POST',headers:{origin:'https://test.local',cookie:'wm_session='+tokens.owner},body:'{}'}),env);
const badgeCookie=badgeLogin.headers.get('set-cookie').split(';')[0];
const badgeRevoke=await worker.fetch(new Request('https://test.local/api/control/verification',{method:'POST',headers:{origin:'https://test.local',cookie:badgeCookie,'content-type':'application/json'},body:JSON.stringify({userId:'seller',verified:false})}),env);assert.equal(badgeRevoke.status,200);
assert.equal((await call('/api/profile/seller')).data.profile.verified,0);assert.equal((await call('/api/feed?q=Fifty%20image%20album')).data.posts[0].verified,0);
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
assert.equal((await call('/api/posts/'+multiId+'/view','POST',{})).status,401);assert.equal((await call('/api/posts/'+multiId+'/view','POST',{},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+multiId+'/view','POST',{},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+multiId+'/view','POST',{},'outsider')).data.count,2);
assert.equal((await call('/api/posts/'+groupPost+'/view','POST',{},'outsider')).status,403);
assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:true},'buyer')).data.count,1);assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:true},'buyer')).data.count,1);
const sharedMarket=(await call('/api/feed?category=cod-mobile','GET',undefined,'buyer')).data.posts;assert.ok(sharedMarket.some(p=>p.id===multiId&&p.shared_by_id==='buyer'&&p.reshared));assert.equal(sharedMarket.filter(p=>p.id===multiId).length,2);
assert.ok((await call('/api/profile/buyer')).data.posts.some(p=>p.id===multiId&&p.shared_by_id==='buyer'));assert.ok((await call('/api/my-posts','GET',undefined,'buyer')).data.posts.some(p=>p.id===multiId&&p.shared_by_id==='buyer'));
assert.equal((await call('/api/posts/'+groupPost+'/share','POST',{share:true},'outsider')).status,403);assert.equal((await call('/api/posts/'+groupPost+'/share','POST',{share:true},'buyer')).status,200);assert.ok(!(await call('/api/feed','GET',undefined,'outsider')).data.posts.some(p=>p.id===groupPost));assert.ok(!(await call('/api/profile/buyer')).data.posts.some(p=>p.id===groupPost));
// Private reports are owner-only, deduplicate open reports and can restrict content without deleting deals.
const reportBody={postId:multiId,reason:'scam',details:'Please check this suspicious listing'};assert.equal((await call('/api/reports','POST',reportBody,'buyer')).status,201);assert.equal((await call('/api/reports','POST',reportBody,'buyer')).status,201);assert.equal(sql.prepare('SELECT count(*) n FROM wm_reports WHERE post_id=?').get(multiId).n,1);
assert.equal((await call('/api/reports','POST',{postId:groupPost,reason:'other',details:'Test'},'outsider')).status,403);assert.equal((await call('/api/admin/reports','GET',undefined,'admin')).status,403);assert.equal((await call('/api/admin/reports','GET',undefined,'buyer')).status,403);
const reportData=(await call('/api/admin/reports','GET',undefined,'owner')).data.reports[0];assert.equal(reportData.post_id,multiId);assert.equal(reportData.reporter_name,'buyer');
assert.equal((await call('/api/admin/report-action','POST',{reportId:reportData.id,action:'restrict'},'owner')).status,200);assert.equal((await call('/api/listing/'+multiId)).status,404);assert.ok(!(await call('/api/my-posts','GET',undefined,'buyer')).data.posts.some(p=>p.id===multiId));assert.ok(sql.prepare('SELECT * FROM wm_posts WHERE id=?').get(multiId));
assert.equal((await call('/api/posts/'+multiId+'/share','POST',{share:false},'buyer')).status,200);assert.equal((await call('/api/reports','POST',{reason:'other',details:'Website layout issue'},'buyer')).status,201);
// Seller/blue badges remain separate from privileged admin roles; only owner can edit access.
const badgeSettings={userId:'buyer',verified:true,trustedSeller:true,role:'member'};for(const id of ['buyer','admin','seller'])assert.equal((await call('/api/admin/member-access','POST',badgeSettings,id)).status,403);
assert.equal((await call('/api/admin/member-access','POST',badgeSettings,'owner')).status,200);const buyerBadges=(await call('/api/me','GET',undefined,'buyer')).data.user;assert.equal(buyerBadges.role,'member');assert.equal(buyerBadges.verified,1);assert.equal(buyerBadges.trusted_seller,1);assert.equal((await call('/api/groups','POST',{name:'Badge alone is not access'},'buyer')).status,403);
assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,userId:'owner',role:'member'},'owner')).status,403);assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,role:'owner'},'owner')).status,403);
assert.ok((await call('/api/admin/users?q=Rahat','GET',undefined,'owner')).data.users.some(u=>u.name==='Rahat Custom'));assert.equal((await call('/api/admin/users?q=Rahat','GET',undefined,'owner')).data.users[0].email,undefined);
assert.equal((await call('/api/admin/member-access','POST',{...badgeSettings,verified:false,trustedSeller:false},'owner')).status,200);assert.equal((await call('/api/profile/buyer')).data.profile.trusted_seller,0);
console.log('PASS: full/k/Bengali prices, multi-game filtering/editing, contact details pending without suspension, unique views, scoped/idempotent reposts and profile shares, private owner reports/restrictions, searchable members, and owner-only seller/blue badges without role escalation.');
