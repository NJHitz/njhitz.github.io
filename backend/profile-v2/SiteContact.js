/* Fixed-recipient website contact inbox. No public reads, arbitrary destinations or email copies. */
function setupSiteContactV2(){siteContactSheet_(SpreadsheetApp.openById(configV2_().sheetId));console.info('Website contact inbox ready. No email sent.');}
function verifySiteContactSenderV2(){
  if(GmailApp.getAliases().map(function(a){return a.toLowerCase();}).indexOf('info@njhitz.org')<0)throw new Error('info@njhitz.org is not an available Gmail sending alias.');
  console.info('Website sender verified: info@njhitz.org.');
}
function siteContactSheet_(book){
  var sheet=book.getSheetByName('WebsiteContactMessages'),headers=['Received at','Message ID','Name','Email','Phone','Message','Notification status','Fingerprint'];
  if(!sheet){sheet=book.insertSheet('WebsiteContactMessages');sheet.getRange(1,1,1,8).setValues([headers]);sheet.setFrozenRows(1);}
  var actual=sheet.getRange(1,1,1,8).getValues()[0];
  if(actual.join('|')!==headers.join('|'))throw new Error('Contact inbox needs staff attention.');
  return sheet;
}
function siteContactMail_(sheet,row,r){
  if(MailApp.getRemainingDailyQuota()<1)return false;
  try{
    verifySiteContactSenderV2();
    GmailApp.sendEmail('info@njhitz.org','NJ HITZ Website — Contact Form','New website contact message\n\nName: '+r[2]+'\nEmail: '+r[3]+'\nPhone: '+r[4]+'\n\nMessage:\n'+r[5]+'\n\nMessage ID: '+r[1]+'\nReply to this email to contact the sender.',{from:'info@njhitz.org',replyTo:String(r[3]),name:'NJ Hitz Website'});
    sheet.getRange(row,7).setValue('Sent');return true;
  }catch(error){console.warn(JSON.stringify({event:'site-contact-mail',status:'pending',requestId:String(r[1])}));return false;}
}
function siteContactSendV2_(req,c){
  if(String(req._gotcha || ''))throw new Error('Your message could not be verified. Please reopen the form.');
  var f=RecruitingContactRules.validate(req),now=Date.now(),ch=req.challenge,props=PropertiesService.getScriptProperties(),secret=props.getProperty('RECRUITING_CHALLENGE_SECRET');
  if(!secret || !RecruitingContactRules.challengeShape(ch,'website-contact',now) || !recruitingEqualV2_(ch.signature,recruitingSignV2_(ch,secret)))throw new Error('The security check expired. Please try again.');
  if(!Number.isInteger(req.solution) || req.solution<0 || req.solution>1000000000 || tryoutHash_(ch.nonce+':'+req.solution).slice(0,3)!=='000')throw new Error('The security check failed. Please try again.');
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw new Error('Contact service busy. Please retry.');
  try{
    var sheet=siteContactSheet_(SpreadsheetApp.openById(c.sheetId)),fingerprint=tryoutHash_(JSON.stringify(f)),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues():[];
    for(var i=0;i<rows.length;i++){
      if(rows[i][1]===ch.nonce){if(rows[i][7]!==fingerprint)throw new Error('This security check was already used. Reopen the form.');return {ok:true,accepted:true,sent:rows[i][6]==='Sent',requestId:String(rows[i][1])};}
      if(rows[i][7]===fingerprint && now-new Date(rows[i][0]).getTime()<86400000)return {ok:true,accepted:true,sent:rows[i][6]==='Sent',requestId:String(rows[i][1])};
    }
    // Separate contact budgets; reuse the proven bounded rate-limit rules.
    var limits=TryoutRules.reserve(JSON.parse(props.getProperty('SITE_CONTACT_RATE_LIMITS') || '{}'),now,tryoutHash_(f.email.toLowerCase()).slice(0,20),tryoutHash_(f.phone.replace(/\D/g,'')).slice(0,20));
    props.setProperty('SITE_CONTACT_RATE_LIMITS',JSON.stringify(limits));
    function safe(s){return /^[=+@\-]/.test(s)?"'"+s:s;}
    var row=sheet.getLastRow()+1,r=[new Date(now),ch.nonce,f.name,f.email,f.phone,f.message,'Pending',fingerprint];
    sheet.getRange(row,1,1,8).setValues([r.map(function(v){return typeof v==='string'?safe(v):v;})]);SpreadsheetApp.flush();
    return {ok:true,accepted:true,sent:siteContactMail_(sheet,row,r),requestId:ch.nonce};
  }finally{lock.releaseLock();}
}
function retrySiteContactNotificationsV2_(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))return;
  try{
    var sheet=SpreadsheetApp.openById(configV2_().sheetId).getSheetByName('WebsiteContactMessages');
    if(!sheet || sheet.getLastRow()<2)return;
    var rows=sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues(),count=0;
    rows.forEach(function(r,i){if(r[6]==='Pending' && count<5){count++;siteContactMail_(sheet,i+2,r);}});
  }finally{lock.releaseLock();}
}
