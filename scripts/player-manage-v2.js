const $ = id => document.getElementById(id);
const config = window.NJHitzProfileV2 || {};
const slug = new URL(location.href).searchParams.get('player') || '';
if (/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) $('back-profile').href = 'player-profile?player=' + encodeURIComponent(slug);
let auth, sdk, model, busy = false, generation = 0, gcCapture = null, videoOptimization = null;
let tableEdits=[];
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
  const labels={stageStatLabels:'Saving season labels…',stageVideoChanges:'Saving video changes…',read:'Loading profile…',save:'Saving draft…',submit:'Submitting changes for staff review…',uploadVideo:'Uploading video… Keep this page open.',stageSeason:'Importing season statistics…',removeStagedSeason:'Removing draft season…',stageStatRemoval:'Saving statistics removal request…',cancelStatRemoval:'Undoing removal request…',review:'Applying staff review…',claim:'Requesting profile access…',grant:'Granting profile access…',denyClaim:'Updating access request…',revoke:'Revoking profile access…',removeVideo:'Removing clip…'};
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
    tableEdits=[];
    renderStatsTable();
    $('media-tools').hidden = !Array.isArray(model.videos);
    renderFields();
    renderVideoTable();
    renderSubmissionTable();
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
    (revision.statLabels || []).forEach(c=>item.append(text('p','Rename statistics: '+c.previousLabel+' → '+c.teamName+' · '+c.season+' (ends '+c.seasonEndDate+')')));
    (revision.videoChanges || []).forEach(c=>item.append(text('p',c.remove?'Remove video: '+c.previousTitle:'Rename video: '+c.previousTitle+' → '+c.title)));
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
function displayDate(value){return value?new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'—';}
function legacyDate(label){const year=String(label || '').match(/20\d{2}/)?.[0] || '0000';const month=/fall/i.test(label)?'11':/summer/i.test(label)?'08':/spring/i.test(label)?'05':/winter/i.test(label)?'02':'01';return year+'-'+month+'-28';}
function table(hostId,caption,headers){
  const host=$(hostId);host.replaceChildren();const wrap=text('div','','table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',caption+'; rows stack into cards on small screens');
  const el=document.createElement('table');el.className='manage-table '+hostId+'-table';el.setAttribute('role','table');el.append(text('caption',caption));const head=document.createElement('thead'),row=document.createElement('tr');
  headers.forEach(h=>{const cell=text('th',h);cell.scope='col';row.append(cell);});head.setAttribute('role','rowgroup');row.setAttribute('role','row');head.append(row);const body=document.createElement('tbody');body.setAttribute('role','rowgroup');el.append(head,body);wrap.append(el);host.append(wrap);return {host,body};
}
function cell(row,content,label=''){row.setAttribute('role','row');const td=document.createElement('td');td.dataset.label=label;td.setAttribute('role','cell');if(typeof content==='string')td.textContent=content;else if(content)td.append(content);row.append(td);return td;}
function editInput(value,label,max=160,type='text'){const input=document.createElement('input');input.type=type;input.value=value || '';input.maxLength=max;input.setAttribute('aria-label',label);return input;}
function rowButton(label,work,danger=false){const b=actionButton(label,work);b.className=danger?'danger':'secondary';return b;}
function iconButton(icon,label,work,danger=false){
  const b=rowButton('',work,danger);b.classList?.add('icon-action');if(!b.classList)b.className+=' icon-action';b.title=label;b.setAttribute('aria-label',label);
  const paths={save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',undo:'<path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12"/>'};
  b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[icon]+'</svg>';
  return b;
}
function selectionToolbar(host,entries,label,remove,undo){
  const bar=text('div','','table-toolbar'),all=document.createElement('input');all.type='checkbox';all.setAttribute('aria-label','Select all '+label);const lab=text('label','Select all');lab.prepend(all);const count=text('span','0 selected','selection-count');count.setAttribute('aria-live','polite');
  const removeButton=rowButton('Remove selected',()=>remove(entries.filter(e=>e.box.checked).map(e=>e.item)),true);
  const undoButton=undo?rowButton('Undo selected',()=>undo(entries.filter(e=>e.box.checked).map(e=>e.item))):null;
  const update=()=>{const n=entries.filter(e=>e.box.checked).length;count.textContent=n+' selected';all.checked=!!entries.length && n===entries.length;all.indeterminate=n>0 && n<entries.length;[removeButton,undoButton].filter(Boolean).forEach(b=>{b.dataset.disabled=String(!n);b.disabled=!n || busy;});};
  all.addEventListener('change',()=>{entries.forEach(e=>e.box.checked=all.checked);update();});entries.forEach(e=>e.box.addEventListener('change',update));
  bar.append(lab,count,removeButton);if(undoButton)bar.append(undoButton);host.prepend(bar);update();
}
function selectionBox(label){const b=document.createElement('input');b.type='checkbox';b.setAttribute('aria-label','Select '+label);return b;}
async function saveAllDraft(){
  // Snapshot all inline edits before any response re-renders the tables.
  const edits=tableEdits.map(read=>read()).filter(Boolean);
  await request('save',{version:model.version,base:model.publishedVersion,fields:fields()});
  for(const edit of edits)await request(edit.action,{...edit,version:model.version,base:model.publishedVersion});
}
async function removeStats(rows,undo=false){
  if(!rows.length)throw new Error('Select at least one statistics row.');
  await saveAllDraft();let done=0;
  try{for(const row of rows){
    if(undo){if(model.statRemovals?.[row.key])await request('cancelStatRemoval',{version:model.version,key:row.key});}
    else {
      if(model.statsDrafts?.[row.key])await request('removeStagedSeason',{version:model.version,key:row.key});
      if((model.seasons || []).some(s=>s.key===row.key) || (model.legacyStats || []).some(s=>s.key===row.key)){
        if(!model.statRemovals?.[row.key])await request('stageStatRemoval',{version:model.version,base:model.publishedVersion,key:row.key});
      }
    }done++;
  }}catch(error){throw new Error(done+' of '+rows.length+' rows processed. '+error.message);}
  message(undo?'Selected removal requests undone.':'Selected statistics removed from the draft or marked for removal. Submit for review to update published rows.');
}
function renderStatsTable(){
  const merged=new Map((model.seasons || []).map(s=>[s.key,{...s,state:'Published'}]));
  (model.legacyStats || []).forEach(s=>merged.set(s.key,{...s,state:'Legacy'}));
  Object.values(model.statsDrafts || {}).forEach(s=>merged.set(s.key,{...s,state:merged.has(s.key)?'Draft update':'Draft import'}));
  Object.values(model.statRemovals || {}).forEach(s=>{if(!merged.has(s.key))merged.set(s.key,{...s,teamName:s.label,season:'Changed row',state:'Removal request'});});
  const rows=[...merged.values()].map(s=>({...s,...model.statLabels?.[s.key]})).sort((a,b)=>String(b.seasonEndDate || legacyDate(b.season)).localeCompare(String(a.seasonEndDate || legacyDate(a.season))) || String(a.teamName).localeCompare(String(b.teamName)));
  const {host,body}=table('gc-seasons','Season statistics — newest first',['Select','Team','Season','Season end','Statistics','Status','Actions']);const entries=[];
  if(!rows.length){const row=document.createElement('tr');const td=cell(row,'No season statistics yet.');td.colSpan=7;body.append(row);return;}
  rows.forEach(s=>{
    const row=document.createElement('tr'),marked=!!model.statRemovals?.[s.key],box=selectionBox(s.teamName+' '+s.season);entries.push({box,item:s});cell(row,box,'Select');
    const team=editInput(s.teamName,'Team name for '+s.season),season=editInput(s.season,'Season for '+s.teamName,80),end=editInput(s.seasonEndDate || legacyDate(s.season),'Season end for '+s.teamName,10,'date');
    [team,season,end].forEach(input=>input.disabled=marked);cell(row,team,'Team');cell(row,season,'Season');cell(row,end,'Season end');
    const details=document.createElement('details');details.append(text('summary',[s.batting?'Batting':'',s.pitching?'Pitching':''].filter(Boolean).join(' & ') || 'Statistics'),seasonPreview(s));cell(row,details,'Statistics');
    cell(row,marked?'Marked for removal':model.statLabels?.[s.key]?'Draft label edit':s.state,'Status');if(marked)row.className='marked';
    tableEdits.push(()=>{
      if(marked || (team.value.trim()===s.teamName && season.value.trim()===s.season && end.value===(s.seasonEndDate || legacyDate(s.season))))return null;
      if(!team.value.trim() || !season.value.trim() || !end.validity.valid || !/^20\d{2}-\d{2}-\d{2}$/.test(end.value))throw new Error('Enter a team, season and valid season end date.');
      if(model.statsDrafts?.[s.key])return {action:'stageSeason',season:{...s,teamName:team.value.trim(),season:season.value.trim(),seasonEndDate:end.value}};
      return {action:'stageStatLabels',key:s.key,teamName:team.value.trim(),season:season.value.trim(),seasonEndDate:end.value};
    });
    const actions=text('div','','row-actions');if(!marked)actions.append(iconButton('save','Save season labels',async()=>{await saveAllDraft();message('Labels saved in your private draft. Submit for review when ready.');}));
    actions.append(iconButton(marked?'undo':'trash',marked?'Undo statistics removal':'Remove statistics row',()=>removeStats([s],marked),!marked));cell(row,actions,'Actions');body.append(row);
  });selectionToolbar(host,entries,'statistics rows',rows=>removeStats(rows),rows=>removeStats(rows,true));
}
async function changeVideos(rows,undo=false){
  if(!rows.length)throw new Error('Select at least one editable clip.');await saveAllDraft();
  await request('stageVideoChanges',{version:model.version,base:model.publishedVersion,changes:rows.map(v=>undo?{id:v.id,undo:true}:{id:v.id,remove:true})});
  message(undo?'Selected video edits undone.':'Selected clips marked for removal. Submit for review to apply these changes.');
}
function renderVideoTable(){
  const {host,body}=table('video-list','Uploaded video footage',['Select','Title','Category','Status','Uploaded','Actions']);const entries=[];
  const videos=[...(model.videos || [])].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  if(!videos.length){const row=document.createElement('tr');cell(row,'No uploaded clips yet.').colSpan=6;body.append(row);return;}
  videos.forEach(v=>{
    const row=document.createElement('tr'),change=model.videoChanges?.[v.id],locked=v.status==='pending' || model.submissions.some(r=>r.status==='pending' && (r.videoChanges || []).some(c=>c.id===v.id));
    const editable=!locked && (v.status==='approved' || model.isAdmin || v.uid===auth.currentUser.uid);const box=selectionBox(v.title);box.disabled=!editable;if(editable)entries.push({box,item:v});cell(row,box,'Select');
    const title=editInput(change?.title || v.title,'Clip title: '+v.title,120);title.disabled=!editable || change?.remove;cell(row,title,'Title');cell(row,v.category,'Category');cell(row,change?.remove?'Marked for removal':change?'Draft rename':v.status,'Status');cell(row,displayDate(v.at),'Uploaded');
    if(change?.remove)row.className='marked';
    if(editable)tableEdits.push(()=>{if(change?.remove || title.value.trim()===(change?.title || v.title))return null;if(!title.value.trim())throw new Error('Enter a clip title.');return {action:'stageVideoChanges',changes:[{id:v.id,title:title.value.trim()}]};});
    const actions=text('div','','row-actions');
    if(model.isAdmin || v.status==='approved'){const link=text('a','');link.className='icon-action preview-action';link.title='Preview video in Google Drive';link.setAttribute('aria-label','Preview video in Google Drive');link.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z"/></svg>';link.href='https://drive.google.com/file/d/'+encodeURIComponent(v.driveFileId)+'/view';link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
    if(editable){if(!change?.remove)actions.append(iconButton('save','Save video title',async()=>{await saveAllDraft();message('Video title saved in your private draft. Submit for review when ready.');}));actions.append(iconButton(change?.remove?'undo':'trash',change?.remove?'Undo video removal':'Remove video',()=>changeVideos([v],!!change?.remove),!change?.remove));}
    cell(row,actions,'Actions');body.append(row);
  });selectionToolbar(host,entries,'editable videos',rows=>changeVideos(rows),rows=>changeVideos(rows,true));
  host.append(text('p','Video renames and removals require submission and staff approval. Removal hides the clip from the profile; the original Drive file is retained. Clips awaiting review are locked.','muted'));
}
function submissionSummary(r){
  const summary=r.summary,parts=[];
  if(summary?.fields?.length)parts.push('Profile: '+summary.fields.map(k=>fieldSpecs.find(f=>f[0]===k)?.[1] || k).join(', '));
  const count=(n,label)=>{if(n)parts.push(n+' '+label);};
  count(summary?.seasons ?? r.seasonStats?.length,'season imports/updates');count(summary?.statLabels ?? r.statLabels?.length,'season label edits');count(summary?.statRemovals ?? r.statRemovals?.length,'statistics removals');count(summary?.videoUploads ?? r.videoIds?.length,'video uploads');count(summary?.videoRenames ?? r.videoChanges?.filter(c=>!c.remove).length,'video renames');count(summary?.videoRemovals ?? r.videoChanges?.filter(c=>c.remove).length,'video removals');
  if(!summary?.fields)parts.push('Historical entry: text-change summary unavailable');
  return parts.join(' · ') || 'No content changes';
}
function renderSubmissionTable(){
  const {body}=table('submission-history','Submission audit',['Submitted','Status','Changes','Reviewed','Staff note']);
  if(!model.submissions.length){const row=document.createElement('tr');cell(row,'No submissions yet.').colSpan=5;body.append(row);return;}
  [...model.submissions].sort((a,b)=>String(b.at).localeCompare(String(a.at))).forEach(r=>{const row=document.createElement('tr');cell(row,displayDate(r.at),'Submitted');cell(row,r.status,'Status');cell(row,submissionSummary(r),'Changes');cell(row,displayDate(r.reviewedAt),'Reviewed');cell(row,r.note || '—','Staff note');body.append(row);});
}
function statRemovalControl(key){
  const marked=!!model.statRemovals?.[key];
  const wrap=document.createElement('div');
  if(marked)wrap.append(text('p','Marked for removal · Submit for review to send this request.','state'));
  wrap.append(actionButton(marked?'Undo removal request':'Mark for removal',async()=>{
    // Preserve any text edits before re-rendering the profile response.
    await saveAllDraft();
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
async function persistProfileSignIn(auth,sdk){
  try { await sdk.setPersistence(auth,sdk.browserLocalPersistence); }
  catch(error){ await sdk.setPersistence(auth,sdk.browserSessionPersistence); }
}
async function start() {
  if (!config.enabled || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.endpoint || '') || !config.firebase?.apiKey || !config.firebase?.projectId) return;
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {$('setup').textContent='Open this page from a player’s v2 profile link.';return;}
  const appSDK = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
  sdk = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
  auth = sdk.getAuth(appSDK.initializeApp(config.firebase));
  await persistProfileSignIn(auth,sdk);
  $('setup').hidden = true;$('auth-card').hidden = false;
  $('google-signin').addEventListener('click',()=>run(()=>sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider())));
  $('auth-form').addEventListener('submit',e=>{e.preventDefault();run(()=>sdk.signInWithEmailAndPassword(auth,$('email').value,$('password').value));});
  $('create-account').addEventListener('click',()=>run(async()=>{if(!$('auth-form').reportValidity())return;const result=await sdk.createUserWithEmailAndPassword(auth,$('email').value,$('password').value);await sdk.sendEmailVerification(result.user);message('Check your email to verify your account, then reload your profile.');}));
  $('reset-password').addEventListener('click',()=>run(async()=>{if(!$('email').reportValidity())return;await sdk.sendPasswordResetEmail(auth,$('email').value);message('If an account exists, check your email for reset instructions.');}));
  $('verify-email').addEventListener('click',()=>run(async()=>{await sdk.sendEmailVerification(auth.currentUser);message('Verification email sent.');}));
  $('signout').addEventListener('click',()=>run(()=>sdk.signOut(auth)));
  $('refresh-profile').addEventListener('click',()=>run(async()=>{await auth.currentUser.reload();if(!auth.currentUser.emailVerified)throw new Error('Verify your email first.');$('verify-email').hidden=true;await request('read');message('Profile reloaded.');}));
  $('claim-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{await request('claim',{version:model.version,note:$('claim-note').value});message('Access request submitted for staff review.');});});
  $('profile-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{await saveAllDraft();message('Draft saved. Your public profile has not changed.');});});
  $('submit-review').addEventListener('click',()=>run(async()=>{
    if (!$('profile-form').reportValidity()) return;
    await saveAllDraft();
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
    await saveAllDraft();
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
    const identity=generation;
    const controller=new AbortController();videoOptimization=controller;
    const finishOptimization=beginActivity('Preparing video for web playback…');
    const optimizationUI=$('video-optimization'),cancel=$('cancel-video-optimization');
    optimizationUI.hidden=false;cancel.disabled=false;
    let optimized;
    try {
      const {optimizeVideo}=await import('./video-optimizer.mjs?v=20261030-web2');
      optimized=await optimizeVideo(file,{signal:controller.signal,onProgress:({phase,percent})=>{
        $('video-optimization-status').textContent=phase;
        const progress=$('video-optimization-progress');
        if(Number.isFinite(percent)){progress.value=percent;}else progress.removeAttribute('value');
        $('operation-label').textContent=phase+(Number.isFinite(percent)?' '+percent+'%':'');
      }});
      if(identity!==generation || !auth.currentUser)throw new Error('Account changed. Nothing was uploaded.');
    } finally {
      videoOptimization=null;optimizationUI.hidden=true;finishOptimization();
    }
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('The video could not be read.'));reader.readAsDataURL(optimized);});
    if(identity!==generation)throw new Error('Account changed. Nothing was uploaded.');
    message('Saving profile draft and uploading private clip. Keep this page open.');
    await saveAllDraft();
    if(identity!==generation)throw new Error('Account changed. Nothing was uploaded.');
    await request('uploadVideo',{version:model.version,title,category,caption,mimeType:'video/mp4',base64});
    $('video-form').reset();message('Private clip uploaded. Choose Submit for review when your changes and clips are ready.');
  });});
  $('cancel-video-optimization').addEventListener('click',()=>videoOptimization?.abort());
  sdk.onAuthStateChanged(auth,async user=>{
    videoOptimization?.abort();
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
