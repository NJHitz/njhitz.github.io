const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('../backend/profile-v2/Core.js'),rules=require('../backend/profile-v2/RecruitingContact.js');
function harness(email='private-player@example.test'){
 const props={RECRUITING_CHALLENGE_SECRET:'test-only-server-secret'},sent=[];let locked=false;
 const ctx={ProfileV2Core:core,Date,Number,JSON,Error,encodeURIComponent,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k] || null,setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>locked=false})},CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:e=>sent.push(e)},SpreadsheetApp:{openById:()=>({})},loadV2_:()=>({state:{published:{playerName:'Example Player',playerEmail:email}}}),slugV2_:s=>{assert.match(s,/^[a-z0-9-]+$/);return s;}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../backend/profile-v2/RecruitingContact.js'),'utf8'),ctx);
 function request(){const now=Date.now()-4000,c={slug:'example-player-31',nonce:crypto.randomUUID(),issuedAt:now,expiresAt:now+600000,difficulty:3};c.signature=ctx.recruitingSignV2_(c,props.RECRUITING_CHALLENGE_SECRET);let solution=0;while(!crypto.createHash('sha256').update(c.nonce+':'+solution).digest('hex').startsWith('000'))solution++;return {slug:c.slug,challenge:c,solution,name:'Coach Example',email:'coach@example.test',phone:'(555) 123-4567',message:'I would like to discuss recruiting opportunities.',to:'attacker@example.test',subject:'Injected subject'};}
 return {ctx,props,sent,request,isLocked:()=>locked};
}
test('recipient email stays out of public JSON even with the old public-contact opt-in enabled',()=>{
 const s=core.empty('id','example-player-31',{playerEmail:'private@example.test',playerPhone:'5551234567',contactDisplayOptIn:'Yes'});const p=core.publicProfile(s);assert.equal(p.playerEmail,undefined);assert.equal(p.recruitingContactAvailable,true);assert.equal(p.playerPhone,'5551234567');assert.equal(core.view(s,{uid:'admin',admin:true}).published.playerEmail,'private@example.test');
 assert.throws(()=>core.clean({playerEmail:'bad\r\nBcc: attacker@example.test'}),/valid recruiting/);
 for(const bad of ['one,two@example.test','one;two@example.test','Person <one@example.test>'])assert.equal(core.isEmail(bad),false);
});
test('relay picks the approved server-side recipient, fixes the subject and sets Reply-To to the validated sender',()=>{
 const h=harness(),r=h.request();assert.equal(h.ctx.recruitingSendV2_(r,{sheetId:'test'}).ok,true);assert.equal(h.sent.length,1);assert.equal(h.sent[0].to,'private-player@example.test');assert.equal(h.sent[0].replyTo,'coach@example.test');assert.equal(h.sent[0].subject,'NJ Hitz Recruiting Message');assert.match(h.sent[0].body,/Coach Example/);assert.match(h.sent[0].body,/555/);assert.doesNotMatch(h.sent[0].body,/private-player/);assert.equal(h.isLocked(),false);
 h.ctx.recruitingSendV2_(r,{sheetId:'test'});assert.equal(h.sent.length,1,'retrying the same accepted nonce does not send twice');
});
test('honeypot, forged/expired/wrong-player challenges, invalid proof and bad sender data cannot send',()=>{
 const h=harness();assert.equal(h.ctx.recruitingSendV2_({_gotcha:'spam'},{}).ok,true);assert.equal(h.sent.length,0);
 for(const mutate of [r=>r.challenge.signature='A'.repeat(43),r=>r.challenge.expiresAt=0,r=>r.slug='different-player',r=>r.challenge.difficulty=0,r=>r.solution=-1,r=>r.email='bad\nBcc: evil@example.test',r=>r.phone='bad',r=>r.message='short']){const r=h.request();mutate(r);assert.throws(()=>h.ctx.recruitingSendV2_(r,{sheetId:'test'}));}assert.equal(h.sent.length,0);
});
test('missing destination and provider failures return errors without exposing the destination',()=>{
 const missing=harness('');assert.throws(()=>missing.ctx.recruitingSendV2_(missing.request(),{sheetId:'test'}),/not available/);assert.equal(missing.sent.length,0);
 const h=harness();h.ctx.MailApp.sendEmail=()=>{throw Error('provider error for private-player@example.test');};assert.throws(()=>h.ctx.recruitingSendV2_(h.request(),{sheetId:'test'}),e=>/could not be sent/.test(e.message)&&!e.message.includes('private-player'));assert.equal(h.isLocked(),false);
});
test('per-sender, per-player and global limits are enforced before sending',()=>{
 let store={buckets:{},used:{}},now=1800000000000;
 for(let i=0;i<3;i++)store=rules.reserve(store,now,'player','sender','nonce'+i).store;
 assert.throws(()=>rules.reserve(store,now,'other','sender','next'),/send limit/);
 store={buckets:{},used:{}};for(let i=0;i<5;i++)store=rules.reserve(store,now+i*60000,'player','sender'+i,'nonce'+i).store;
 assert.throws(()=>rules.reserve(store,now+6*60000,'player','another','next'),/send limit/);
 store={buckets:{},used:{}};for(let i=0;i<20;i++)store=rules.reserve(store,now+Math.floor(i/3)*60000,'player'+i,'sender'+i,'nonce'+i).store;
 assert.throws(()=>rules.reserve(store,now+10*60000,'other','other','next'),/send limit/);
});
test('approved contact changes still follow the existing draft and moderation workflow',()=>{
 let s=core.empty('id','example-player-31',{playerEmail:'old@example.test'});s.access.parent=true;const parent={uid:'parent',email:'parent@example.test',verified:true},staff={uid:'staff',email:'staff@example.test',verified:true,admin:true};let n=0;
 const act=(actor,action,data={})=>{const e=core.command(s,actor,{action,version:s.version,...data},'2026-10-30T00:00:00Z','contact'+(++n));s=core.apply(s,e);};
 act(parent,'save',{base:0,fields:{playerEmail:'new@example.test'}});assert.equal(s.published.playerEmail,'old@example.test');act(parent,'submit');assert.equal(s.published.playerEmail,'old@example.test');act(staff,'review',{id:'contact2',decision:'approved'});assert.equal(s.published.playerEmail,'new@example.test');assert.equal(core.publicProfile(s).playerEmail,undefined);
});
test('public modal sends only sender fields, player slug and spam proof, never a recipient address or subject',async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',dataset:{},listeners:{},addEventListener(k,f){this.listeners[k]=f;},setAttribute(){},removeAttribute(){},focus(){},showModal(){this.open=true;},querySelectorAll:()=>[]});return nodes.get(id);};
 const form=get('recruiting-form');form.elements={name:get('name'),email:get('email'),phone:get('phone'),message:get('message'),_gotcha:get('hp')};form.reportValidity=()=>true;form.reset=()=>{};
 const open=get('open'),posts=[],now=Date.now()-4000;
 const challenge={slug:'example-player-31',nonce:crypto.randomUUID(),issuedAt:now,expiresAt:now+600000,difficulty:3,signature:'test'};
 const context={window:{NJHitzProfileV2:{enabled:true,endpoint:'https://script.google.com/macros/s/example/exec'}},document:{getElementById:get,querySelectorAll:()=>[open],activeElement:get('focus')},location:{href:'https://njhitz.org/player-profile?player=example-player-31'},URL,AbortController,AbortSignal,TextEncoder,crypto:crypto.webcrypto,Date,DOMException,setTimeout,fetch:async(url,options)=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})};}return {ok:true,json:async()=>({ok:true,challenge})};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../scripts/recruiting-contact.js'),'utf8'),context);context.window.NJHitzRecruitingContact.setPlayer({name:'Example Player',available:true});open.listeners.click();await new Promise(r=>setImmediate(r));
 form.elements.name.value='Coach Example';form.elements.email.value='coach@example.test';form.elements.phone.value='5551234567';form.elements.message.value='Recruiting opportunity for your player.';
 await form.listeners.submit({preventDefault(){}});assert.equal(posts.length,1);assert.equal(posts[0].action,'recruitingContact');assert.equal(posts[0].to,undefined);assert.equal(posts[0].subject,undefined);assert.equal(posts[0].email,'coach@example.test');assert.match(get('recruiting-status').textContent,/has been sent/);
});
