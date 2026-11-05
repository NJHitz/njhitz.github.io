/* Protected tryout intake. Shares recruiting challenge primitives, never Google Forms POST. */
var TryoutRules = (function(){
  var positions=['','P','C','1B','2B','3B','SS','LF','CF','RF','OF','IF','Utility'];
  function validate(req,now){
    function text(key,min,max){var s=String(req[key] || '').trim().replace(/\s+/g,' ');if(s.length<min || s.length>max || /[\x00-\x1f<>]|https?:\/\/|www\./i.test(s) || /^[=+@]/.test(s))throw new Error('Check the '+key+' field.');return s;}
    var name=text('name',2,120),address=text('address',5,300),email=String(req.email || '').trim(),phone=String(req.phone || '').trim();
    if(!/\p{L}/u.test(name) || !/\s/.test(name))throw new Error('Enter the player’s first and last name.');
    if(!ProfileV2Core.isEmail(email) || email.length>250)throw new Error('Enter a valid parent or guardian email.');
    if(!/^[+()\d .-]+$/.test(phone) || !/^(?:1)?\d{10}$/.test(phone.replace(/\D/g,'')))throw new Error('Enter a valid 10-digit phone number.');
    var iso=String(req.birthdate || ''),birth=new Date(iso+'T12:00:00Z'),today=new Date(now),year=today.getUTCFullYear();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(birth.getTime()) || birth.toISOString().slice(0,10)!==iso)throw new Error('Enter a valid birthdate.');
    var age=year-birth.getUTCFullYear()-((today.getUTCMonth()<birth.getUTCMonth() || (today.getUTCMonth()===birth.getUTCMonth() && today.getUTCDate()<birth.getUTCDate()))?1:0);
    if(age<5 || age>22)throw new Error('Check the player’s birthdate (ages 5–22).');
    var grad=Number(req.gradYear);if(!Number.isInteger(grad) || grad<year-2 || grad>year+14)throw new Error('Select a valid graduation year.');
    var pos=['pos1','pos2','pos3'].map(function(k){var p=String(req[k] || '');if(positions.indexOf(p)<0)throw new Error('Select a valid softball position.');return p;});
    if(!pos[0])throw new Error('Select a primary position.');
    if(new Set(pos.filter(Boolean)).size!==pos.filter(Boolean).length)throw new Error('Choose different positions.');
    return {name:name,address:address,email:email,phone:phone,birthdate:iso,gradYear:grad,highschool:text('highschool',0,160),pos1:pos[0],pos2:pos[1],pos3:pos[2]};
  }
  function reserve(store,now,emailHash,phoneHash){
    var clean={};Object.keys(store).forEach(function(k){if(store[k].expires>now)clean[k]=store[k];});
    var h=Math.floor(now/3600000),d=Math.floor(now/86400000);
    var rules=[['h:'+h,30,(h+1)*3600000],['d:'+d,100,(d+1)*86400000],['e:'+emailHash+':'+h,3,(h+1)*3600000],['p:'+phoneHash+':'+h,3,(h+1)*3600000]];
    rules.forEach(function(r){if((clean[r[0]]?.count || 0)>=r[1])throw new Error('Too many registrations. Please try again later.');});
    rules.forEach(function(r){clean[r[0]]={count:(clean[r[0]]?.count || 0)+1,expires:r[2]};});return clean;
  }
  return {validate:validate,reserve:reserve};
})();
function tryoutHash_(s){return recruitingHexV2_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s));}
function tryoutRegisterV2_(req,c){
  if(String(req._gotcha || ''))throw new Error('Registration could not be verified. Please reload and try again.');
  var now=Date.now(),fields=TryoutRules.validate(req,now),ch=req.challenge,props=PropertiesService.getScriptProperties(),secret=props.getProperty('RECRUITING_CHALLENGE_SECRET');
  if(!secret || !RecruitingContactRules.challengeShape(ch,'tryout-registration',now) || !recruitingEqualV2_(ch.signature,recruitingSignV2_(ch,secret)))throw new Error('The security check expired. Please retry.');
  if(!Number.isInteger(req.solution) || req.solution<0 || req.solution>1000000000 || tryoutHash_(ch.nonce+':'+req.solution).slice(0,3)!=='000')throw new Error('The security check failed. Please retry.');
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw new Error('Registration is busy. Please retry.');
  try{
    var sheet=SpreadsheetApp.openById(c.sheetId).getSheetByName('Propective Tryout Form Responses');if(!sheet)throw new Error('Registration service unavailable.');
    var headers=sheet.getRange(1,1,1,14).getValues()[0];
    if(headers[0]!=='Timestamp' || headers[4]!=="Parent or Guardian's Email" || headers[10]!=='Position 3')throw new Error('Registration sheet needs staff attention.');
    var extra=['Registration ID','Notification status','Registration fingerprint'];
    extra.forEach(function(v,i){if(headers[i+11] && headers[i+11]!==v)throw new Error('Registration sheet needs staff attention.');});
    var fingerprint=tryoutHash_(JSON.stringify(fields)),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues():[];
    for(var i=0;i<rows.length;i++){
      if(rows[i][11]===ch.nonce){if(rows[i][13]!==fingerprint)throw new Error('This security check was already used. Please reload.');return {ok:true,accepted:true,requestId:ch.nonce};}
      if(rows[i][13]===fingerprint && now-new Date(rows[i][0]).getTime()<86400000)return {ok:true,accepted:true,requestId:String(rows[i][11])};
    }
    var limits=TryoutRules.reserve(JSON.parse(props.getProperty('TRYOUT_RATE_LIMITS') || '{}'),now,tryoutHash_(fields.email.toLowerCase()).slice(0,20),tryoutHash_(fields.phone.replace(/\D/g,'')).slice(0,20));
    props.setProperty('TRYOUT_RATE_LIMITS',JSON.stringify(limits));
    sheet.getRange(1,12,1,3).setValues([extra]);
    // Escape spreadsheet formulas, including phone numbers beginning with '+'.
    function safe(s){return /^[=+@\-]/.test(String(s))?"'"+s:s;}
    var row=sheet.getLastRow()+1;
    sheet.getRange(row,1,1,14).setValues([[new Date(now),safe(fields.name),safe(fields.address),safe(fields.phone),safe(fields.email),new Date(fields.birthdate+'T12:00:00Z'),'Class of '+fields.gradYear,safe(fields.highschool),fields.pos1,fields.pos2,fields.pos3,ch.nonce,'Pending',fingerprint]]);
    SpreadsheetApp.flush();
    try{
      MailApp.sendEmail({to:'info@njhitz.org',replyTo:fields.email,name:'NJ Hitz Tryout Registration',subject:'NJ Hitz Tryout Registration — '+fields.name,body:'A verified website registration was saved.\n\nPlayer: '+fields.name+'\nGraduation: '+fields.gradYear+'\nPositions: '+[fields.pos1,fields.pos2,fields.pos3].filter(Boolean).join(', ')+'\nParent/guardian email: '+fields.email+'\nPhone: '+fields.phone+'\n\nView the registration:\nhttps://docs.google.com/spreadsheets/d/'+c.sheetId+'/edit#gid=1405838921&range=A'+row+'\n\nRegistration ID: '+ch.nonce});
      sheet.getRange(row,13).setValue('Sent');
    }catch(error){console.warn(JSON.stringify({event:'tryout-notification',status:'pending',requestId:ch.nonce}));}
    return {ok:true,accepted:true,requestId:ch.nonce};
  }finally{lock.releaseLock();}
}
if(typeof module!=='undefined')module.exports=TryoutRules;

/* Reuse the already-installed ten-minute notification retry trigger. */
function retryTryoutNotificationsV2_(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))return;
  try{
    var c=configV2_(),sheet=SpreadsheetApp.openById(c.sheetId).getSheetByName('Propective Tryout Form Responses');
    if(!sheet || sheet.getLastRow()<2 || sheet.getRange(1,13).getValue()!=='Notification status')return;
    var rows=sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues(),count=0;
    rows.forEach(function(r,i){
      if(r[12]!=='Pending' || !r[11] || count>=5)return;count++;
      try{
        MailApp.sendEmail({to:'info@njhitz.org',replyTo:String(r[4]),name:'NJ Hitz Tryout Registration',subject:'NJ Hitz Tryout Registration — '+String(r[1]),body:'A verified website registration was saved.\n\nPlayer: '+r[1]+'\nGraduation: '+r[6]+'\nPositions: '+r.slice(8,11).filter(Boolean).join(', ')+'\nParent/guardian email: '+r[4]+'\nPhone: '+r[3]+'\n\nView the registration:\nhttps://docs.google.com/spreadsheets/d/'+c.sheetId+'/edit#gid=1405838921&range=A'+(i+2)+'\n\nRegistration ID: '+r[11]});
        sheet.getRange(i+2,13).setValue('Sent');
      }catch(error){console.warn(JSON.stringify({event:'tryout-notification',status:'pending',requestId:String(r[11])}));}
    });
  }finally{lock.releaseLock();}
}
