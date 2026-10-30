const $ = id => document.getElementById(id);
const config = window.NJHitzProfileV2 || {};
const slug = new URL(location.href).searchParams.get('player') || '';
if (/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) $('back-profile').href = 'player-profile-v2?player=' + encodeURIComponent(slug);
let auth, sdk, model, busy = false, generation = 0, gcCapture = null;
const fieldSpecs = [
  ['bio','Player bio',5000,true],['schoolName','School',160],['gradYear','Graduation year',4],
  ['gpa','Reported GPA',30],['intendedMajor','Intended major',250],['honors','Honors and activities',3500,true],
  ['academics','Courses and academic interests',5000,true],['height','Height',40],['cityState','City and state',160],
  ['primaryPosition','Primary position',20],['positions','Other positions (comma-separated)',120],['batsThrows','Bats / throws (R/R, L/R, etc.)',20],
  ['playerEmail','Public recruiting email',250],['playerPhone','Public recruiting phone',60],
  ['contactDisplayOptIn','Display recruiting contact publicly?',3,false,'select'],
  ['homeToFirst','Home-to-first time',40],['firstToThird','First-to-third time',40],
  ['overhandVelo','Overhand velocity (mph)',40],['exitVelo','Exit velocity (mph)',40],
  ['highlightVideoUrl','Existing highlight video URL',1000],['recruitingProfileUrl','External recruiting profile URL',1000],
  ['additionalLinks','Additional links (one HTTPS URL per line)',3000,true]
];
function text(tag, value, cls) { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; }
function message(value, error = false) { $('message').textContent = value; $('message').className = error ? 'error' : 'success'; }
function controls(disabled) { document.querySelectorAll('main button').forEach(button => {button.disabled = disabled || button.dataset.disabled === 'true';}); }
const activities=[];
function beginActivity(label) {
  const activity={label};activities.push(activity);
  function update(){
    const indicator=$('operation-progress');
    if(indicator){indicator.hidden=!activities.length;$('operation-label').textContent=activities.at(-1)?.label || '';}
    document.querySelector('main')?.setAttribute('aria-busy',String(activities.length>0));
    controls(busy || activities.length>0);
  }
  update();let finished=false;
  return ()=>{if(finished)return;finished=true;activities.splice(activities.indexOf(activity),1);update();};
}
async function run(work) {
  if (busy || activities.length) return;
  busy = true; const finish=beginActivity('Working… Please wait.');
  try { await work(); } catch (error) { message(error.message || 'Please try again.', true); }
  finally { busy = false; finish(); controls(activities.length>0); }
}
async function request(action, data = {}) {
  const labels={read:'Loading profile…',save:'Saving draft…',submit:'Submitting changes for staff review…',uploadVideo:'Uploading video… Keep this page open.',stageSeason:'Importing season statistics…',removeStagedSeason:'Removing draft season…',stageStatRemoval:'Saving statistics removal request…',cancelStatRemoval:'Undoing removal request…',review:'Applying staff review…',claim:'Requesting profile access…',grant:'Granting profile access…',denyClaim:'Updating access request…',revoke:'Revoking profile access…',removeVideo:'Removing clip…'};
  const finish=beginActivity(labels[action] || 'Working… Please wait.');
  try {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) throw new Error('Sign in with a verified account first.');
  const identity = generation;
  const token = await user.getIdToken();
  const response = await fetch(config.endpoint, {method:'POST', credentials:'omit', redirect:'follow',
    headers:{'Content-Type':'text/plain;charset=UTF-8'}, cache:'no-store', signal:AbortSignal.timeout(action === 'uploadVideo' ? 120000 : 25000),
    body:JSON.stringify({...data, action, slug, idToken:token})});
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'Request failed.');
  if (identity !== generation) throw new Error('Account changed. Reload the profile.');
  model = result.profile;
  render();
  controls(busy || activities.length>0);
  return result;
  } finally { finish(); }
}
function fields() {
  const out = {};
  fieldSpecs.forEach(([key]) => {out[key] = $('field-' + key).value;});
  return out;
}
function renderFields() {
  const currentDraft = model.draft && model.draft.base === model.publishedVersion ? model.draft.fields : {};
  const values = {...model.published, ...currentDraft};
  $('profile-fields').replaceChildren();
  fieldSpecs.forEach(([key,label,max,multi,kind]) => {
    const wrap = document.createElement('div');
    const lab = text('label',label);lab.htmlFor = 'field-' + key;
    const input = document.createElement(kind === 'select' ? 'select' : multi ? 'textarea' : 'input');
    input.id = 'field-' + key;input.name = key;
    if (kind === 'select') ['No','Yes'].forEach(value => {const option = text('option',value);option.value = value;input.append(option);});
    else input.maxLength = max;
    input.value = values[key] || (kind === 'select' ? 'No' : '');
    wrap.append(lab,input);$('profile-fields').append(wrap);
  });
}
function actionButton(label, work) {
  const b = text('button',label); b.type = 'button';b.addEventListener('click',()=>run(work));return b;
}
function render() {
  const canEdit = !!model.canEdit;
  $('claim-card').hidden = canEdit;
  $('editor-card').hidden = !canEdit;
  $('staff-card').hidden = !model.isAdmin;
  const claimStatus = model.claim?.status;
  $('claim-form').hidden = claimStatus === 'pending';
  $('claim-status').textContent = claimStatus === 'pending' ? 'Your access request is awaiting staff review.' : claimStatus === 'rejected' ? 'Staff could not approve the previous request. Contact your coach, or submit a new request with clarification.' : 'Request access below. Signing in alone does not grant access to a player.';
  if (canEdit) {
    $('player-label').textContent = model.published.playerName || 'Player profile';
    $('draft-status').textContent = model.draft ? 'Saved draft · ' + model.draft.savedAt : 'Showing published information';
    if (model.draft && model.draft.base !== model.publishedVersion) $('draft-status').textContent = 'Published information changed. Showing current published values; the older draft has not been applied. Reapply your intended changes and save a new draft.';
    $('gc-tools').hidden = !model.statsDrafts;
    $('gc-seasons').replaceChildren();
    const staged=Object.values(model.statsDrafts || {});
    [...staged.map(s=>({...s,stageLabel:'Draft import'})),...(model.seasons || []).map(s=>({...s,stageLabel:'Published'}))].forEach(season=>{
      const row=text('div','','review');row.append(text('h4',season.teamName+' · '+season.season),text('p',season.playerName+' · '+season.stageLabel+' · Season ends '+season.seasonEndDate));
      row.append(seasonPreview(season));
      if(season.stageLabel==='Published' && model.statRemovals)row.append(statRemovalControl(season.key));
      if(season.stageLabel==='Draft import')row.append(actionButton('Remove draft season',()=>request('removeStagedSeason',{version:model.version,key:season.key})));
      $('gc-seasons').append(row);
    });
    (model.legacyStats || []).forEach(legacy=>{
      const row=text('div','','review');row.append(text('h4',legacy.label),seasonPreview(legacy),statRemovalControl(legacy.key));$('gc-seasons').append(row);
    });
    Object.values(model.statRemovals || {}).filter(target=>!(model.seasons || []).some(s=>s.key===target.key) && !(model.legacyStats || []).some(s=>s.key===target.key)).forEach(target=>{
      const row=text('div','','review');row.append(text('h4',target.label),text('p','This published row changed or was already removed. Undo this older request before submitting.'),statRemovalControl(target.key));$('gc-seasons').append(row);
    });
    $('media-tools').hidden = !Array.isArray(model.videos);
    renderFields();
    $('video-list').replaceChildren();
    (model.videos || []).forEach(video=>{
      const row=text('div','','review');row.append(text('h4',video.title),text('p',video.category+' · '+video.status));
      if (model.isAdmin || video.status === 'approved') {
        const link=text('a','Preview in Google Drive');link.href='https://drive.google.com/file/d/'+encodeURIComponent(video.driveFileId)+'/view';link.target='_blank';link.rel='noopener noreferrer';row.append(link);
      }
      if ((model.isAdmin || video.uid === auth.currentUser.uid) && ['draft','rejected'].includes(video.status)) row.append(actionButton('Remove clip',()=>request('removeVideo',{version:model.version,id:video.id})));
      $('video-list').append(row);
    });
    $('submission-history').replaceChildren();
    if (!model.submissions.length) $('submission-history').append(text('p','No submissions yet.'));
    model.submissions.forEach(r => $('submission-history').append(text('p',r.at + ' · ' + r.status + (r.note ? ' · Staff note: ' + r.note : ''))));
  }
  if (!model.isAdmin) return;
  $('staff-claims').replaceChildren();$('staff-reviews').replaceChildren();
  Object.values(model.claims).filter(c=>c.status === 'pending').forEach(claim => {
    const item = text('div','', 'review');item.append(text('h3','Access request'),text('p',claim.email),text('p',claim.note || 'No relationship note.'));
    const label = document.createElement('label'), confirm = document.createElement('input');confirm.type='checkbox';
    label.append(confirm,document.createTextNode('I checked the roster and confirmed this person’s relationship to the player.'));item.append(label);
    item.append(actionButton('Grant access',async()=>{if(!confirm.checked) throw new Error('Confirm the relationship first.');await request('grant',{version:model.version,uid:claim.uid,confirmRelationship:true});message('Access granted.');}),
      actionButton('Decline request',()=>request('denyClaim',{version:model.version,uid:claim.uid})));
    $('staff-claims').append(item);
  });
  Object.keys(model.access).forEach(uid=>{
    const row = text('div','', 'review');row.append(text('p','Active family access: ' + (model.claims[uid]?.email || uid)));
    row.append(actionButton('Revoke access',()=>request('revoke',{version:model.version,uid})));$('staff-claims').append(row);
  });
  model.submissions.filter(r=>r.status === 'pending').forEach(revision => {
    const item = text('div','','review');item.append(text('h3','Profile submission · ' + revision.at));
    if (revision.base !== model.publishedVersion) item.append(text('p','This submission is stale. Request a fresh draft before approval.'));
    Object.keys(revision.fields).filter(key=>String(model.published[key] || '') !== revision.fields[key]).forEach(key=>{
      item.append(text('h4',fieldSpecs.find(f=>f[0] === key)?.[1] || key));
      const diff = text('div','','diff');diff.append(text('p','Published\n' + (model.published[key] || '(empty)')),text('p','Proposed\n' + (revision.fields[key] || '(empty)')));item.append(diff);
    });
    (revision.statRemovals || []).forEach(target=>{
      item.append(text('h4','Remove statistics: '+target.label),seasonPreview(target),text('p','Approval will remove this row from the v2 profile.'));
    });
    (revision.seasonStats || []).forEach(season=>{
      item.append(text('h4','GameChanger: '+season.teamName+' · '+season.season),text('p','Source player: '+season.playerName+' #'+season.jerseyNumber+' · Season end: '+season.seasonEndDate));
      const source=text('a','Check player on GameChanger ↗');source.href=season.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';item.append(source,seasonPreview(season));
      item.append(text('p','Compare the player identity and full-season totals with GameChanger before approving. This import is family supplied.'));
    });
    (revision.videoIds || []).forEach(id=>{
      const video=(model.videos || []).find(v=>v.id===id);
      if (!video) return;
      item.append(text('h4','Video: '+video.title),text('p',video.category+(video.caption?' · '+video.caption:'')));
      const preview=text('a','Review video in Google Drive');preview.href='https://drive.google.com/file/d/'+encodeURIComponent(video.driveFileId)+'/view';preview.target='_blank';preview.rel='noopener noreferrer';item.append(preview);
    });
    const note = document.createElement('textarea');note.maxLength=2000;note.setAttribute('aria-label','Review note for ' + revision.id);note.placeholder='Review note. Required when requesting corrections.';item.append(note);
    const approve = actionButton('Approve and publish',()=>request('review',{version:model.version,id:revision.id,decision:'approved',note:note.value}));
    approve.disabled = revision.base !== model.publishedVersion;
    approve.dataset.disabled = String(approve.disabled);
    item.append(approve,actionButton('Request corrections',()=>request('review',{version:model.version,id:revision.id,decision:'rejected',note:note.value})));$('staff-reviews').append(item);
  });
}
function statRemovalControl(key){
  const marked=!!model.statRemovals?.[key];
  const wrap=document.createElement('div');
  if(marked)wrap.append(text('p','Marked for removal · Submit for review to send this request.','state'));
  wrap.append(actionButton(marked?'Undo removal request':'Mark for removal',async()=>{
    // Preserve any text edits before re-rendering the profile response.
    await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});
    await request(marked?'cancelStatRemoval':'stageStatRemoval',{version:model.version,base:model.publishedVersion,key});
    message(marked?'Removal request undone.':'Marked for removal. Choose Submit for review when ready; the published row remains visible until staff approval.');
  }));return wrap;
}
function seasonPreview(season){
  const block=text('div');
  const names={avg:'AVG',obp:'OBP',slg:'SLG',ops:'OPS',singles:'1B',doubles:'2B',triples:'3B',hr:'HR',rbi:'RBI',runs:'R',ip:'IP',bf:'BF',k:'K',bb:'BB',era:'ERA',whip:'WHIP'};
  [['Batting',season.batting],['Pitching',season.pitching]].forEach(([label,values])=>{if(values)block.append(text('p',label+': '+Object.entries(values).map(([key,value])=>(names[key] || key)+' '+(value===''?'—':value)).join(' · ')));});
  return block;
}
async function start() {
  if (!config.enabled || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.endpoint || '') || !config.firebase?.apiKey || !config.firebase?.projectId) return;
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {$('setup').textContent='Open this page from a player’s v2 profile link.';return;}
  const appSDK = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
  sdk = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
  auth = sdk.getAuth(appSDK.initializeApp(config.firebase));
  await sdk.setPersistence(auth,sdk.inMemoryPersistence);
  $('setup').hidden = true;$('auth-card').hidden = false;
  $('google-signin').addEventListener('click',()=>run(()=>sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider())));
  $('auth-form').addEventListener('submit',e=>{e.preventDefault();run(()=>sdk.signInWithEmailAndPassword(auth,$('email').value,$('password').value));});
  $('create-account').addEventListener('click',()=>run(async()=>{if(!$('auth-form').reportValidity())return;const result=await sdk.createUserWithEmailAndPassword(auth,$('email').value,$('password').value);await sdk.sendEmailVerification(result.user);message('Check your email to verify your account, then reload your profile.');}));
  $('reset-password').addEventListener('click',()=>run(async()=>{if(!$('email').reportValidity())return;await sdk.sendPasswordResetEmail(auth,$('email').value);message('If an account exists, check your email for reset instructions.');}));
  $('verify-email').addEventListener('click',()=>run(async()=>{await sdk.sendEmailVerification(auth.currentUser);message('Verification email sent.');}));
  $('signout').addEventListener('click',()=>run(()=>sdk.signOut(auth)));
  $('refresh-profile').addEventListener('click',()=>run(async()=>{await auth.currentUser.reload();if(!auth.currentUser.emailVerified)throw new Error('Verify your email first.');$('verify-email').hidden=true;await request('read');message('Profile reloaded.');}));
  $('claim-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{await request('claim',{version:model.version,note:$('claim-note').value});message('Access request submitted for staff review.');});});
  $('profile-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});message('Draft saved. Your public profile has not changed.');});});
  $('submit-review').addEventListener('click',()=>run(async()=>{
    if (!$('profile-form').reportValidity()) return;
    await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});
    try {
      const result = await request('submit',{version:model.version});
      if (result.notificationPending) { message('Submitted for review. The staff email is queued for retry. Your public profile has not changed.'); return; }
    } catch (error) {
      throw new Error('Your draft was saved, but submission failed. ' + (error.message || 'Please try again.'));
    }
    message('Changes saved and submitted for review. Your public profile will change after staff approval.');
  }));
  $('gc-url').addEventListener('input',()=>{
    gcCapture=null;$('gc-capture-status').textContent='';
    try{const source=GCStatsV2.parseUrl($('gc-url').value);$('gc-identity').textContent='Team ID: '+source.teamId+' · Player GUID: '+source.playerId;$('gc-open').href=source.url;$('gc-open').hidden=false;}
    catch{$('gc-identity').textContent='';$('gc-open').hidden=true;}
  });
  window.addEventListener('message',event=>{
    if(event.source!==window || event.origin!==location.origin || event.data?.type!=='NJHITZ_GC_SEASON_CAPTURE' || !model?.canEdit)return;
    try {
      const season=GCStatsV2.validateSeason(event.data.season,model.published.playerName);
      gcCapture=season;$('gc-url').value=season.sourceUrl;$('gc-team').value=season.teamName;$('gc-season').value=season.season;$('gc-end').value=season.seasonEndDate;$('gc-file').value='';$('gc-confirm').checked=false;
      $('gc-capture-status').textContent='Received '+season.playerName+' · '+season.teamName+' · '+season.season+'. Check the source and confirm before importing.';
    }catch(error){message('Capture rejected: '+error.message,true);}
  });
  $('gc-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!$('gc-confirm').checked)throw new Error('Confirm the source player and full-season totals first.');
    const metadata={sourceUrl:$('gc-url').value,teamName:$('gc-team').value,season:$('gc-season').value,seasonEndDate:$('gc-end').value,fullSeasonConfirmed:true};
    let season;
    const file=$('gc-file').files[0];
    if(file){if(file.size>2000000)throw new Error('Choose a CSV up to 2 MB.');season=GCStatsV2.fromCsv(await file.text(),metadata,model.published.playerName,model.published.jerseyNumber);}
    else if(gcCapture){
      if(GCStatsV2.parseUrl(metadata.sourceUrl).url!==gcCapture.sourceUrl)throw new Error('The source URL changed. Capture this player again.');
      season=GCStatsV2.validateSeason({...gcCapture,...metadata},model.published.playerName);
    }else throw new Error('Choose the authorized GameChanger CSV or send a helper capture. The player URL alone cannot access restricted stats.');
    await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});
    await request('stageSeason',{version:model.version,base:model.publishedVersion,season});
    gcCapture=null;$('gc-file').value='';$('gc-confirm').checked=false;message('Season imported into your private draft. Choose Submit for review to send it to staff.');
  });});
  $('video-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const file=$('video-file').files[0];
    if (!file || file.size > 25*1024*1024 || !file.size) throw new Error('Choose a video up to 25 MB.');
    const extension=file.name.split('.').pop().toLowerCase();
    const mimeType={mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'}[extension];
    if (!mimeType) throw new Error('Use an MP4, MOV, or WebM video.');
    const title=$('video-title').value.trim(),category=$('video-category').value,caption=$('video-caption').value;
    if(!title)throw new Error('Enter a clip title.');
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('The video could not be read.'));reader.readAsDataURL(file);});
    message('Saving profile draft and uploading private clip. Keep this page open.');
    await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});
    await request('uploadVideo',{version:model.version,title,category,caption,mimeType,base64});
    $('video-form').reset();message('Private clip uploaded. Choose Submit for review when your changes and clips are ready.');
  });});
  sdk.onAuthStateChanged(auth,async user=>{
    gcCapture=null;$('gc-form').reset();$('gc-capture-status').textContent='';$('gc-identity').textContent='';$('gc-open').hidden=true;
    generation++;model=null;['claim-card','editor-card','staff-card'].forEach(id=>$(id).hidden=true);
    $('profile-fields').replaceChildren();$('submission-history').replaceChildren();$('staff-claims').replaceChildren();$('staff-reviews').replaceChildren();$('password').value='';
    $('auth-card').hidden=!!user;$('account-card').hidden=!user;
    if(!user){$('account-label').textContent='';message('');return;}
    $('account-label').textContent='Signed in as ' + user.email;
    $('verify-email').hidden=user.emailVerified;
    if(!user.emailVerified){message('Verify your email, then choose Reload profile.');return;}
    try{await request('read');message('');}catch(error){message(error.message,true);}
  });
}
start().catch(error=>message('Profile management could not start. ' + error.message,true));
