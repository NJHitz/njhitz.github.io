const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const core=require('../backend/profile-v2/Core.js');
function harness(){
 const props={RECRUITING_CHALLENGE_SECRET:'test-secret'},rows=[],mail=[];let exists=false;
 const sheet={getLastRow:()=>rows.length,setFrozenRows(){},getRange:(r,c,n=1,m=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),setValues:vals=>vals.forEach((v,i)=>{rows[r+i-1]??=[];v.forEach((x,j)=>rows[r+i-1][c+j-1]=x);}),setValue:v=>rows[r-1][c-1]=v})};
 const ctx={ProfileV2Core:core,Date,Number,Set,JSON,Error,console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:m=>mail.push(m)},SpreadsheetApp:{openById:()=>({getSheetByName:()=>exists?sheet:null,insertSheet:()=>{exists=true;return sheet;}}),flush(){}},configV2_:()=>({sheetId:'test'})};
 vm.createContext(ctx);for(const f of ['RecruitingContact','TryoutRegistration','SiteContact'])vm.runInContext(fs.readFileSync('backend/profile-v2/'+f+'.js','utf8'),ctx);
 function request(){const issuedAt=Date.now()-4000,ch={slug:'website-contact',nonce:crypto.randomUUID(),issuedAt,expiresAt:issuedAt+600000,difficulty:3};ch.signature=ctx.recruitingSignV2_(ch,props.RECRUITING_CHALLENGE_SECRET);let solution=0;while(!crypto.createHash('sha256').update(ch.nonce+':'+solution).digest('hex').startsWith('000'))solution++;return {name:'Coach Example',email:'coach@example.test',phone:'9735551234',message:'Please contact me about your program.',challenge:ch,solution,to:'injected@example.test',subject:'Injected'};}
 return {ctx,rows,mail,request};
}
test('fixed staff recipient, private saved message and confirmed receipt; duplicate retries do not resend',()=>{
 const h=harness(),r=h.request();const result=h.ctx.siteContactSendV2_(r,{sheetId:'test'});assert.equal(result.accepted,true);assert.equal(result.sent,true);assert.equal(h.rows.length,2);assert.equal(h.mail[0].to,'info@njhitz.org');assert.equal(h.mail[0].replyTo,r.email);assert.equal(h.mail[0].subject,'NJ HITZ Website — Contact Form');assert.equal(h.rows[1][6],'Sent');
 h.ctx.siteContactSendV2_(r,{sheetId:'test'});h.ctx.siteContactSendV2_(h.request(),{sheetId:'test'});assert.equal(h.mail.length,1);assert.equal(h.rows.length,2);assert.throws(()=>h.ctx.siteContactSendV2_({...r,message:'A changed message payload.'},{sheetId:'test'}),/already used/);
 assert.doesNotMatch(JSON.stringify(result),/coach@|program/);
});
test('invalid proof, forged signature, honeypot and invalid sender cannot save or mail',()=>{
 const h=harness();for(const change of [r=>r._gotcha='bot',r=>r.email='bad\r\nBcc: evil@example.test',r=>r.solution=-1,r=>r.challenge.signature='x'.repeat(43),r=>r.challenge.slug='tryout-registration',r=>r.challenge.expiresAt=0]){const r=h.request();change(r);assert.throws(()=>h.ctx.siteContactSendV2_(r,{sheetId:'test'}));}assert.equal(h.rows.length,0);assert.equal(h.mail.length,0);
});
test('mail failures and depleted quotas retain pending message; existing trigger retries it once',()=>{
 const h=harness();h.ctx.MailApp.getRemainingDailyQuota=()=>0;const r=h.request(),result=h.ctx.siteContactSendV2_(r,{sheetId:'test'});assert.equal(result.accepted,true);assert.equal(result.sent,false);assert.equal(h.rows[1][6],'Pending');assert.equal(h.mail.length,0);
 h.ctx.MailApp.getRemainingDailyQuota=()=>100;h.ctx.MailApp.sendEmail=()=>{throw Error('provider failure');};h.ctx.retrySiteContactNotificationsV2_();assert.equal(h.rows[1][6],'Pending');h.ctx.MailApp.sendEmail=m=>h.mail.push(m);h.ctx.retrySiteContactNotificationsV2_();h.ctx.retrySiteContactNotificationsV2_();assert.equal(h.rows[1][6],'Sent');assert.equal(h.mail.length,1);
});
test('contact quotas apply before new row or send; different sender cannot bypass phone limit',()=>{
 const h=harness();for(let i=0;i<3;i++){const r=h.request();r.message+=' '+i;h.ctx.siteContactSendV2_(r,{sheetId:'test'});}const r=h.request();r.email='other@example.test';assert.throws(()=>h.ctx.siteContactSendV2_(r,{sheetId:'test'}),/Too many/);assert.equal(h.rows.length,4);assert.equal(h.mail.length,3);
});
test('homepage has no Formspree path or CAPTCHA placeholder and preserves accessible progress',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/formspree\.io|grecaptcha|YOUR_RECAPTCHA_SITE_KEY/);assert.match(html,/data.accepted!==true/);assert.match(html,/data.sent\?/);assert.match(html,/aria-busy/);assert.match(html,/if\(sending\)return/);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(!match[1].trim().startsWith('{'))assert.doesNotThrow(()=>new vm.Script(match[1]));}
});
