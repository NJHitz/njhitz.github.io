const $ = id => document.getElementById(id);
const config = window.NJHitzProfileV2 || {};
const slug = new URL(location.href).searchParams.get('player') || '';
if (/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) $('back-profile').href = 'player-profile-v2?player=' + encodeURIComponent(slug);
let auth, sdk, model, busy = false, generation = 0;
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
async function run(work) {
  if (busy) return;
  busy = true; controls(true);
  try { await work(); } catch (error) { message(error.message || 'Please try again.', true); }
  finally { busy = false; controls(false); }
}
async function request(action, data = {}) {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) throw new Error('Sign in with a verified account first.');
  const identity = generation;
  const token = await user.getIdToken();
  const response = await fetch(config.endpoint, {method:'POST', credentials:'omit', redirect:'follow',
    headers:{'Content-Type':'text/plain;charset=UTF-8'}, cache:'no-store', signal:AbortSignal.timeout(25000),
    body:JSON.stringify({...data, action, slug, idToken:token})});
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'Request failed.');
  if (identity !== generation) throw new Error('Account changed. Reload the profile.');
  model = result.profile;
  render();
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
    renderFields();
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
    const note = document.createElement('textarea');note.maxLength=2000;note.setAttribute('aria-label','Review note for ' + revision.id);note.placeholder='Review note. Required when requesting corrections.';item.append(note);
    const approve = actionButton('Approve and publish',()=>request('review',{version:model.version,id:revision.id,decision:'approved',note:note.value}));
    approve.disabled = revision.base !== model.publishedVersion;
    approve.dataset.disabled = String(approve.disabled);
    item.append(approve,actionButton('Request corrections',()=>request('review',{version:model.version,id:revision.id,decision:'rejected',note:note.value})));$('staff-reviews').append(item);
  });
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
    if(!model.draft)throw new Error('Save a draft first.');
    if(JSON.stringify(fields()) !== JSON.stringify({...fields(),...model.draft.fields}))throw new Error('You have unsaved changes. Save the draft first.');
    await request('submit',{version:model.version});message('Saved draft submitted for review.');
  }));
  sdk.onAuthStateChanged(auth,async user=>{
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
