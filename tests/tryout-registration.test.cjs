const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const now=Date.UTC(2026,10,5,16);
const valid={name:'Jane Doe',address:'123 Main Street, Mount Olive, NJ',email:'parent@example.com',phone:'(973) 555-1234',birthdate:'2012-03-15',gradYear:'2030',highschool:'Mount Olive High School',pos1:'P',pos2:'SS',pos3:''};
function harness(){
 const context={module:{exports:{}},ProfileV2Core:{isEmail:s=>/^[^\s@<>;,\r\n]+@[^\s@]+\.[^\s@]+$/.test(s)},Date:class extends Date{static now(){return now;}},Set,console};
 vm.createContext(context);vm.runInContext(fs.readFileSync('backend/profile-v2/TryoutRegistration.js','utf8'),context);return context;
}
test('accepts real fields and multiline postal address',()=>{const r=harness().module.exports;assert.equal(r.validate({...valid,address:'123 Main Street\nMount Olive NJ'},now).address,'123 Main Street Mount Olive NJ');});
test('blocks screenshot-style invalid dates years positions and formula injection',()=>{const r=harness().module.exports;for(const change of [{birthdate:'1970-05-31'},{birthdate:'2012-02-31'},{gradYear:'equIRYJX'},{pos1:'vZjutmAMAeWUqrhHhCJ'},{name:'=IMPORTXML(test)'},{email:'bad\r\nBcc:example@test.com'},{pos2:'P'}])assert.throws(()=>r.validate({...valid,...change},now));});
test('rate limits repeated identity and prunes expired buckets',()=>{const r=harness().module.exports;let s={old:{count:99,expires:1}};for(let i=0;i<3;i++)s=r.reserve(s,now,'sender','phone');assert.equal(s.old,undefined);assert.throws(()=>r.reserve(s,now,'sender','phone'));assert.doesNotThrow(()=>r.reserve(s,now+3600000,'sender','phone'));});
test('global rate buckets remain below property size at maximum volume',()=>{const r=harness().module.exports;let s={};for(let i=0;i<30;i++)s=r.reserve(s,now,('e'+i).padEnd(20,'0'),('p'+i).padEnd(20,'0'));assert.ok(JSON.stringify(s).length<8500);assert.throws(()=>r.reserve(s,now,'another','another'));});
test('rejects missing challenge, forged signature, wrong purpose and honeypot before sheet or mail',()=>{
 const c=harness();c.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'secret'})};c.RecruitingContactRules={challengeShape:()=>false};
 for(const change of [{},{_gotcha:'bot'},{challenge:{slug:'wrong'}}])assert.throws(()=>c.tryoutRegisterV2_({...valid,...change},{sheetId:'test'}));
});
test('website uses confirmed backend receipt and has no Google Forms bypass',()=>{const html=fs.readFileSync('tryouts.html','utf8'),js=fs.readFileSync('scripts/tryout-registration.js','utf8');assert.doesNotMatch(html,/formResponse|GOOGLE_FORM_ACTION/);assert.match(js,/result.accepted!==true/);assert.doesNotMatch(js,/no-cors/);assert.match(html,/id="website"/);assert.match(html,/<select id="pos1"/);});
function serviceHarness(){
 const c=harness(),data=[['Timestamp',"Player 's Name","Player's Address","Parent or Guardian's Phone","Parent or Guardian's Email","Player's Birthdate","Player's Age & Grad Year","High School (optional)",'Position 1','Position 2','Position 3']],props={RECRUITING_CHALLENGE_SECRET:'unit-test-secret'},mail=[];
 c.Utilities={DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=>crypto.randomUUID(),computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')};
 c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})};
 c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 c.MailApp={sendEmail:msg=>mail.push(msg)};
 const sheet={getLastRow:()=>data.length,getRange:(r,col,n=1,m=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r+i-1]?.[col+j-1]??'')),setValues:values=>values.forEach((v,i)=>{data[r+i-1]??=[];v.forEach((x,j)=>data[r+i-1][col+j-1]=x);}),setValue:v=>{data[r-1][col-1]=v;},getValue:()=>data[r-1]?.[col-1]})};
 c.SpreadsheetApp={openById:()=>({getSheetByName:()=>sheet}),flush(){}};
 vm.runInContext(fs.readFileSync('backend/profile-v2/RecruitingContact.js','utf8'),c);
 function request(){const ch={slug:'tryout-registration',nonce:crypto.randomUUID(),issuedAt:now-5000,expiresAt:now-5000+600000,difficulty:3};ch.signature=c.recruitingSignV2_(ch,props.RECRUITING_CHALLENGE_SECRET);let solution=0;while(!crypto.createHash('sha256').update(ch.nonce+':'+solution).digest('hex').startsWith('000'))solution++;return {...valid,challenge:ch,solution};}
 return {c,data,mail,request};
}
test('valid registration saves once and mails only staff; retries deduplicate and changed replay fails',()=>{
 const h=serviceHarness(),req=h.request();assert.equal(h.c.tryoutRegisterV2_(req,{sheetId:'test'}).accepted,true);assert.equal(h.data.length,2);assert.equal(h.mail.length,1);assert.equal(h.mail[0].to,'info@njhitz.org');assert.equal(h.mail[0].replyTo,valid.email);assert.equal(h.data[1][12],'Sent');
 h.c.tryoutRegisterV2_(req,{sheetId:'test'});h.c.tryoutRegisterV2_(h.request(),{sheetId:'test'});assert.equal(h.data.length,2);assert.equal(h.mail.length,1);
 assert.throws(()=>h.c.tryoutRegisterV2_({...req,name:'Different Player'},{sheetId:'test'}),/already used/);
});
test('forged and invalid work tokens cannot write; mail failure retains registration pending retry',()=>{
 const h=serviceHarness(),req=h.request();assert.throws(()=>h.c.tryoutRegisterV2_({...req,challenge:{...req.challenge,signature:'x'.repeat(43)}},{sheetId:'test'}));assert.throws(()=>h.c.tryoutRegisterV2_({...req,solution:-1},{sheetId:'test'}));assert.equal(h.data.length,1);
 h.c.MailApp.sendEmail=()=>{throw Error('provider failure');};assert.equal(h.c.tryoutRegisterV2_(req,{sheetId:'test'}).accepted,true);assert.equal(h.data[1][12],'Pending');
 h.c.configV2_=()=>({sheetId:'test'});h.c.MailApp.sendEmail=msg=>h.mail.push(msg);h.c.retryTryoutNotificationsV2_();assert.equal(h.data[1][12],'Sent');assert.equal(h.mail.length,1);
});
