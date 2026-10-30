var ProfileV2Core = typeof require === 'function' ? require('./Core.js') : ProfileV2Core;
/* Public recruiting relay: no client-supplied recipients and no recipient addresses in responses. */
var RecruitingContactRules = (function(){
  function validate(req){
    var name=String(req.name || '').trim(),email=String(req.email || '').trim(),phone=String(req.phone || '').trim(),message=String(req.message || '').trim();
    if(name.length<2 || name.length>120 || /[\r\n]/.test(name))throw new Error('Enter your name (2–120 characters).');
    if(!ProfileV2Core.isEmail(email))throw new Error('Enter a valid sender email address.');
    if(phone.length>40 || !/^[+()\d .-]+$/.test(phone) || phone.replace(/\D/g,'').length<10 || phone.replace(/\D/g,'').length>15)throw new Error('Enter a valid phone number.');
    if(message.length<10 || message.length>5000)throw new Error('Enter a message of 10–5,000 characters.');
    return {name:name,email:email,phone:phone,message:message};
  }
  function canonical(c){return [c.slug,c.nonce,c.issuedAt,c.expiresAt,c.difficulty].join('|');}
  function challengeShape(c,slug,now){
    return c && c.slug===slug && /^[a-f0-9-]{36}$/.test(c.nonce || '') && c.difficulty===3 && Number.isInteger(c.issuedAt) && Number.isInteger(c.expiresAt) && c.expiresAt-c.issuedAt===600000 && c.issuedAt<=now && c.expiresAt>now && now-c.issuedAt>=3000 && typeof c.signature==='string' && /^[A-Za-z0-9_-]{43}$/.test(c.signature);
  }
  function reserve(input,now,slug,senderHash,nonce){
    var store={buckets:{},used:{}};
    Object.keys(input.buckets || {}).forEach(function(k){if(input.buckets[k].expires>now)store.buckets[k]=input.buckets[k];});
    Object.keys(input.used || {}).forEach(function(k){if(input.used[k]>now)store.used[k]=input.used[k];});
    if(store.used[nonce])return {duplicate:true,store:store};
    var hour=Math.floor(now/3600000),day=Math.floor(now/86400000),minute=Math.floor(now/60000);
    var limits=[['m:'+minute,3,(minute+2)*60000],['h:'+hour,20,(hour+1)*3600000+60000],['d:'+day,100,(day+1)*86400000+60000],['p:'+slug+':'+hour,5,(hour+1)*3600000+60000],['s:'+senderHash+':'+hour,3,(hour+1)*3600000+60000]];
    limits.forEach(function(l){if((store.buckets[l[0]]?.count || 0)>=l[1])throw new Error('The contact form has reached its send limit. Please try again later.');});
    limits.forEach(function(l){var entry=store.buckets[l[0]] || {count:0,expires:l[2]};entry.count++;store.buckets[l[0]]=entry;});
    store.used[nonce]=now+600000;
    return {duplicate:false,store:store};
  }
  return {validate:validate,canonical:canonical,challengeShape:challengeShape,reserve:reserve};
})();
function recruitingHexV2_(bytes){return bytes.map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');}
function recruitingSignV2_(challenge,secret){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(RecruitingContactRules.canonical(challenge),secret)).replace(/=+$/,'');}
function recruitingEqualV2_(a,b){if(typeof a!=='string' || a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function recruitingChallengeV2_(slug){
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error('Contact service busy.');
  try{
    var props=PropertiesService.getScriptProperties(),secret=props.getProperty('RECRUITING_CHALLENGE_SECRET');
    if(!secret){secret=Utilities.getUuid()+Utilities.getUuid();props.setProperty('RECRUITING_CHALLENGE_SECRET',secret);}
    var now=Date.now(),cache=CacheService.getScriptCache(),key='recruiting-challenges:'+Math.floor(now/60000),count=Number(cache.get(key) || 0);
    if(count>=120)throw new Error('Please try again shortly.');cache.put(key,String(count+1),120);
    var challenge={slug:slug,nonce:Utilities.getUuid(),issuedAt:now,expiresAt:now+600000,difficulty:3};challenge.signature=recruitingSignV2_(challenge,secret);return challenge;
  }finally{lock.releaseLock();}
}
function recruitingSendV2_(req,c){
  // Match the existing site's honeypot behavior without sending a message.
  if(String(req._gotcha || ''))return {ok:true};
  var slug=slugV2_(req.slug),fields=RecruitingContactRules.validate(req),challenge=req.challenge,now=Date.now();
  var props=PropertiesService.getScriptProperties(),secret=props.getProperty('RECRUITING_CHALLENGE_SECRET');
  if(!secret || !RecruitingContactRules.challengeShape(challenge,slug,now) || !recruitingEqualV2_(challenge.signature,recruitingSignV2_(challenge,secret)))throw new Error('The contact form expired. Close and reopen it, then try again.');
  if(!Number.isInteger(req.solution) || req.solution<0 || req.solution>1000000000 || recruitingHexV2_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,challenge.nonce+':'+req.solution)).slice(0,3)!=='000')throw new Error('The spam check could not be verified. Reopen the form and try again.');
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('Contact service busy. Please retry.');
  try{
    var limits=JSON.parse(props.getProperty('RECRUITING_SEND_LIMITS') || '{"buckets":{},"used":{}}');
    var hash=recruitingHexV2_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,fields.email.toLowerCase())).slice(0,24);
    var reserved=RecruitingContactRules.reserve(limits,now,recruitingHexV2_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,slug)).slice(0,16),hash,challenge.nonce);
    if(reserved.duplicate)return {ok:true};
    var state;try{state=loadV2_(SpreadsheetApp.openById(c.sheetId),slug).state;}catch(error){throw new Error('Recruiting contact is not available for this player.');}
    var recipient=String(state.published.playerEmail || '').trim();
    if(!ProfileV2Core.isEmail(recipient))throw new Error('Recruiting contact is not available for this player.');
    if(MailApp.getRemainingDailyQuota()<1)throw new Error('The contact service has reached its daily limit. Please try again later.');
    props.setProperty('RECRUITING_SEND_LIMITS',JSON.stringify(reserved.store));
    try{
      MailApp.sendEmail({to:recipient,replyTo:fields.email,name:'NJ Hitz Recruiting',subject:'NJ Hitz Recruiting Message',body:'Recruiting message for '+String(state.published.playerName || slug)+'\nProfile: https://njhitz.org/player-profile?player='+encodeURIComponent(slug)+'\n\nSender: '+fields.name+'\nEmail: '+fields.email+'\nPhone: '+fields.phone+'\n\nMessage:\n'+fields.message+'\n\nSent through NJ Hitz. Reply to this email to contact the sender.'});
    }catch(error){delete reserved.store.used[challenge.nonce];props.setProperty('RECRUITING_SEND_LIMITS',JSON.stringify(reserved.store));throw new Error('Your message could not be sent. Please try again later.');}
    return {ok:true};
  }finally{lock.releaseLock();}
}
if(typeof module!=='undefined')module.exports=RecruitingContactRules;
