/* Deploy in a NEW Apps Script project. Do not paste over the legacy intake service. */
function configV2_() {
  var p = PropertiesService.getScriptProperties();
  var c = {sheetId:p.getProperty('SPREADSHEET_ID'), apiKey:p.getProperty('FIREBASE_API_KEY'),
    project:p.getProperty('FIREBASE_PROJECT_ID'), admins:(p.getProperty('ADMIN_EMAILS') || '').toLowerCase().split(',').map(function(e){return e.trim();}).filter(Boolean)};
  if (!c.sheetId || !c.apiKey || !c.project || !c.admins.length) throw new Error('Profile management is not configured.');
  return c;
}
function jsonV2_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function slugV2_(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) throw new Error('Invalid player link.');
  return slug;
}
function actorV2_(token, c) {
  if (typeof token !== 'string' || token.length > 12000 || token.split('.').length !== 3) throw new Error('Please sign in again.');
  // Firebase performs token validation; never trust a locally decoded token alone.
  var response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(c.apiKey), {
    method:'post', contentType:'application/json', payload:JSON.stringify({idToken:token}), muteHttpExceptions:true
  });
  if (response.getResponseCode() !== 200) throw new Error('Please sign in again.');
  var users = JSON.parse(response.getContentText()).users || [];
  if (users.length !== 1 || users[0].disabled || users[0].emailVerified !== true) throw new Error('Verify your email before continuing.');
  var claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1])).getDataAsString());
  var u = users[0], now = Math.floor(Date.now()/1000);
  if (claims.aud !== c.project || claims.iss !== 'https://securetoken.google.com/' + c.project ||
      claims.sub !== u.localId || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60 ||
      (u.validSince && claims.auth_time < Number(u.validSince))) throw new Error('Please sign in again.');
  var email = String(u.email || '').toLowerCase();
  return {uid:u.localId, email:email, verified:true, admin:c.admins.indexOf(email) !== -1};
}
var HEADERS_V2_ = {
  playerName:'Player Name', jerseyNumber:'Jersey Number', teamName:'Team', slug:'Player Slug',
  primaryPosition:'Primary Position', positions:'Other Positions Played (select all that apply)',
  batsThrows:'Bats / Throws', gradYear:'High School Graduation Year', height:'Height', cityState:'City & State',
  schoolName:'Current School Name', gpa:'Current GPA', honors:'Academic Honors / Awards',
  intendedMajor:'Intended College Major (if known)', academics:'Academic Summary',
  contactDisplayOptIn:'Display Contact Information on Website?', playerEmail:'Player Email', playerPhone:'Player Phone',
  bio:'Player Bio (for website / college coaches)', homeToFirst:'Home-to-1st Time', firstToThird:'1st-to-3rd Time',
  overhandVelo:'Overhand Throwing Velocity (mph)', exitVelo:'Exit Velocity (mph)',
  highlightVideoUrl:'Highlight Video URL', recruitingProfileUrl:'Recruiting Profile URL', additionalLinks:'Any Additional Links',
  offSeason:'Offensive Stats - Season Label', avg:'Batting Average (AVG)', obp:'On-Base Percentage (OBP)',
  slg:'Slugging Percentage (SLG)', ops:'OPS', hr:'Home Runs (HR)', rbi:'Runs Batted In (RBI)',
  statsNote:'Stats Notes (where stats are from, any clarifications)', pitSeason:'Pitching Stats - Season Label',
  era:'ERA', ip:'Innings Pitched (IP)', k:'Strikeouts (K)', bb:'Walks (BB)', whip:'WHIP'
};
function loadV2_(book, slug) {
  var source = book.getSheetByName('Profiles_2026');
  if (!source) throw new Error('Profile source is unavailable.');
  var rows = source.getDataRange().getDisplayValues(), headers = rows.shift();
  var slugCol = headers.indexOf('Player Slug'), statusCol = headers.indexOf('Status');
  if (slugCol < 0 || statusCol < 0) throw new Error('Profile headers need configuration.');
  var matches = rows.filter(function(r){return r[slugCol] === slug && r[statusCol] === 'Active';});
  if (matches.length !== 1) throw new Error('Profile unavailable. Staff can check its status or duplicate entries.');
  var profile = {};
  Object.keys(HEADERS_V2_).forEach(function(key){
    var index = headers.indexOf(HEADERS_V2_[key]);
    profile[key] = index < 0 ? '' : matches[0][index];
  });
  // One immutable seed per player decouples subsequent revisions from legacy form resubmissions.
  var log = book.getSheetByName('ProfileV2Events');
  if (!log) throw new Error('Run setupProfileV2 before enabling the portal.');
  var events = log.getLastRow() > 1 ? log.getRange(2,1,log.getLastRow()-1,1).getValues().map(function(r){return JSON.parse(r[0]);}).filter(function(e){return e.slug === slug;}) : [];
  var seed = events.find(function(e){return e.type === 'seed';});
  var state = ProfileV2Core.empty(seed ? seed.playerId : '', slug, seed ? seed.payload : profile);
  events.filter(function(e){return e.type !== 'seed';}).forEach(function(event){state = ProfileV2Core.apply(state,event);});
  return {state:state, log:log, seeded:!!seed};
}
function doGet(e) {
  try {
    var c = configV2_(), slug = slugV2_(e.parameter.slug);
    var loaded = loadV2_(SpreadsheetApp.openById(c.sheetId), slug);
    return jsonV2_({ok:true, player:ProfileV2Core.publicProfile(loaded.state)});
  } catch (error) { return jsonV2_({ok:false, error:'Profile unavailable.'}); }
}
function doPost(e) {
  var lock;
  try {
    if (!e.postData || e.postData.contents.length > 45000) throw new Error('Invalid request size.');
    var req = JSON.parse(e.postData.contents), c = configV2_();
    var actor = actorV2_(req.idToken,c), slug = slugV2_(req.slug);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error('Service busy. Please retry.');
    var loaded = loadV2_(SpreadsheetApp.openById(c.sheetId),slug), state = loaded.state;
    if (req.action === 'read') return jsonV2_({ok:true, profile:ProfileV2Core.view(state,actor)});
    var event = ProfileV2Core.command(state,actor,req,new Date().toISOString(),Utilities.getUuid());
    var rows = [];
    if (!loaded.seeded) {
      state.playerId = Utilities.getUuid(); event.playerId = state.playerId;
      rows.push([JSON.stringify({type:'seed',slug:slug,playerId:state.playerId,payload:state.published})]);
    }
    rows.push([JSON.stringify(event)]);
    if (rows.some(function(r){return r[0].length > 45000;})) throw new Error('Profile record is too large.');
    // A single write persists the seed + authorized event. Existing sheets are never written.
    loaded.log.getRange(loaded.log.getLastRow()+1,1,rows.length,1).setValues(rows);
    SpreadsheetApp.flush();
    state = ProfileV2Core.apply(state,event);
    return jsonV2_({ok:true, profile:ProfileV2Core.view(state,actor)});
  } catch (error) {
    // Do not log requests, tokens or profile data.
    return jsonV2_({ok:false,error:error.message || 'Request failed.'});
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function setupProfileV2() {
  var c = configV2_(), lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var book = SpreadsheetApp.openById(c.sheetId);
    if (!book.getSheetByName('Profiles_2026')) throw new Error('Missing Profiles_2026 source.');
    if (!book.getSheetByName('ProfileV2Events')) {
      var sheet = book.insertSheet('ProfileV2Events');
      sheet.getRange(1,1).setValue('Event JSON'); sheet.setFrozenRows(1);
    }
  } finally { lock.releaseLock(); }
}
