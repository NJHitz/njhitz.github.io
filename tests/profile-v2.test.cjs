const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../backend/profile-v2/Core.js');
const parent = {uid:'parent1',email:'parent@example.test',verified:true};
const stranger = {uid:'stranger',email:'stranger@example.test',verified:true};
const staff = {uid:'staff',email:'coach@example.test',verified:true,admin:true};
function seed() {return core.empty('player-id','casey-dipaolo-32',{playerName:'Casey',jerseyNumber:'32',bio:'Published bio',contactDisplayOptIn:'No',playerEmail:'hidden@example.test'});}
let nextId = 0;
function act(s,a,action,extra={}) {const event=core.command(s,a,{action,version:s.version,...extra},'2026-10-29T00:00:00Z','revision-'+(++nextId));return core.apply(s,event);}
function owned() {let s=act(seed(),parent,'claim',{note:'Parent'});return act(s,staff,'grant',{uid:parent.uid,confirmRelationship:true});}
test('sign-in alone cannot read a private profile or save a draft',()=>{
  const s=seed();assert.equal(core.view(s,stranger).published,undefined);
  assert.throws(()=>act(s,stranger,'save',{base:0,fields:{bio:'Unauthorized'}}),/access required/);
});
test('unverified accounts cannot request ownership',()=>assert.throws(()=>act(seed(),{...parent,verified:false},'claim'),/verified/));
test('claim email is server identity, not submitted email',()=>{
  const s=act(seed(),parent,'claim',{email:'coach@example.test'});
  assert.equal(s.claims[parent.uid].email,parent.email);
});
test('claim cannot self-grant or impersonate staff',()=>{
  const s=act(seed(),parent,'claim');
  assert.throws(()=>act(s,parent,'grant',{uid:parent.uid,admin:true,confirmRelationship:true}),/Staff/);
});
test('staff must explicitly confirm family relationship',()=>{
  const s=act(seed(),parent,'claim');assert.throws(()=>act(s,staff,'grant',{uid:parent.uid}),/Confirm/);
});
test('duplicate pending claims are rejected',()=>assert.throws(()=>act(act(seed(),parent,'claim'),parent,'claim'),/already awaiting/));
test('saving and submitting do not publish',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'Draft bio'}});s=act(s,parent,'submit');
  assert.equal(core.publicProfile(s).bio,'Published bio');assert.equal(Object.values(s.submissions)[0].fields.bio,'Draft bio');
});
test('review publishes the frozen submission, not later saved edits',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'Reviewed revision'}});s=act(s,parent,'submit');
  const revision=Object.keys(s.submissions)[0];s=act(s,parent,'save',{base:0,fields:{bio:'Later private draft'}});
  s=act(s,staff,'review',{id:revision,decision:'approved'});
  assert.equal(core.publicProfile(s).bio,'Reviewed revision');assert.equal(s.drafts[parent.uid].fields.bio,'Later private draft');
});
test('stale optimistic versions cannot overwrite another action',()=>{
  const s=owned();assert.throws(()=>act(s,parent,'save',{version:s.version-1,base:0,fields:{bio:'stale'}}),/changed/);
});
test('two guardians can have access; stale second submission cannot overwrite approval',()=>{
  let s=owned();s=act(s,stranger,'claim');s=act(s,staff,'grant',{uid:stranger.uid,confirmRelationship:true});
  s=act(s,parent,'save',{base:0,fields:{bio:'First'}});s=act(s,parent,'submit');const first=Object.keys(s.submissions)[0];
  s=act(s,stranger,'save',{base:0,fields:{bio:'Second'}});s=act(s,stranger,'submit');const second=Object.keys(s.submissions)[1];
  s=act(s,staff,'review',{id:first,decision:'approved'});
  assert.throws(()=>act(s,staff,'review',{id:second,decision:'approved'}),/changed/);
});
test('revoked family access cannot edit or read existing drafts',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'private'}});s=act(s,staff,'revoke',{uid:parent.uid});
  assert.equal(core.view(s,parent).draft,undefined);assert.throws(()=>act(s,parent,'save',{base:0,fields:{bio:'bad'}}),/access/);
});
test('family cannot change roles, name, imported stats, or publication status through fields',()=>{
  for(const key of ['admin','access','playerName','avg','status','videos']) assert.throws(()=>core.clean({[key]:'yes'}),/cannot be edited/);
});
test('public projection omits contact details without explicit opt-in',()=>{
  const p=core.publicProfile(seed());assert.equal(p.playerEmail,undefined);assert.equal(p.drafts,undefined);assert.equal(p.claims,undefined);
});
test('private view includes only the actor’s submissions',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'private'}});s=act(s,parent,'submit');
  assert.equal(core.view(s,stranger).submissions,undefined);
});
test('unsafe URL schemes and excessive draft sizes rejected',()=>{
  assert.throws(()=>core.clean({highlightVideoUrl:'javascript:alert(1)'}),/HTTPS/);
  assert.throws(()=>core.clean({bio:'a'.repeat(5001)}),/Invalid value/);
});
test('rejection requires a review note and leaves published data intact',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'draft'}});s=act(s,parent,'submit');const id=Object.keys(s.submissions)[0];
  assert.throws(()=>act(s,staff,'review',{id,decision:'rejected'}),/note/);
  s=act(s,staff,'review',{id,decision:'rejected',note:'Please clarify.'});assert.equal(s.published.bio,'Published bio');
});
test('event replay gives the same state',()=>{
  let s=seed();const events=[];
  for(const [actor,cmd] of [[parent,{action:'claim'}],[staff,{action:'grant',uid:parent.uid,confirmRelationship:true}],[parent,{action:'save',base:0,fields:{bio:'Replay'}}]]) {
    const e=core.command(s,actor,{...cmd,version:s.version},'now','id');events.push(e);s=core.apply(s,e);
  }
  assert.deepEqual(events.reduce(core.apply,seed()),s);
});
function identityHarness(overrides={},httpStatus=200) {
  const now=Math.floor(Date.now()/1000),claims={aud:'test-project',iss:'https://securetoken.google.com/test-project',sub:'uid',iat:now,exp:now+3600,auth_time:now,...overrides};
  const context={ProfileV2Core:core,Date,Number,JSON,encodeURIComponent,
    Utilities:{base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),newBlob:b=>({getDataAsString:()=>b.toString()})},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>httpStatus,getContentText:()=>JSON.stringify({users:[{localId:'uid',email:'parent@example.test',emailVerified:true}]})})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../backend/profile-v2/Service.js'),'utf8'),context);
  const token='header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fake-signature';
  return ()=>context.actorV2_(token,{apiKey:'test',project:'test-project',admins:['coach@example.test']});
}
test('identity adapter requires Firebase validation, project, expiry, and matching UID',()=>{
  assert.equal(identityHarness()().uid,'uid');
  assert.throws(identityHarness({},400),/sign in/);
  for(const bad of [{aud:'other'},{sub:'other'},{exp:0},{iss:'https://evil.test'},{auth_time:null}]) assert.throws(identityHarness(bad),/sign in/);
});
test('v2 page keeps legacy endpoint fallback and safe rendering',()=>{
  const s=fs.readFileSync(require.resolve('../player-profile-v2.html'),'utf8');
  for(const script of [...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim()&&!x.trim().startsWith('{')))new vm.Script(script);
  assert.match(s,/portalEnabled \? portalConfig.endpoint : LEGACY_GAS_ENDPOINT/);
  assert.match(s,/new QRCode\(qrContainer/);assert.match(s,/escapeHtml\(m.value/);assert.match(s,/safeWebLink\(l.url\)/);
});

test('Submit saves current edits before submitting and uses the returned version',async()=>{
  const source=fs.readFileSync(require.resolve('../scripts/player-manage-v2.js'),'utf8');
  const handler=source.split("$('submit-review').addEventListener('click',()=>run(async()=>{")[1].split('\n  }));')[0];
  for(const failure of [null,'save','submit']) {
    const calls=[],messages=[];
    const context={model:{version:3,publishedVersion:0},$ :()=>({reportValidity:()=>true}),fields:()=>({bio:'Latest unsaved edits'}),message:s=>messages.push(s),
      request:async(action,data)=>{calls.push({action,data});if(action===failure)throw Error('Service unavailable');context.model.version++;return {ok:true};}};
    vm.createContext(context);
    const work=vm.runInContext('(async()=>{'+handler+'})',context);
    if(failure)await assert.rejects(work(),failure==='submit'?/draft was saved, but submission failed/:/Service unavailable/);
    else await work();
    assert.equal(calls[0].action,'save');assert.equal(calls[0].data.fields.bio,'Latest unsaved edits');
    assert.equal(calls.length,failure==='save'?1:2);
    if(calls.length===2){assert.equal(calls[1].action,'submit');assert.equal(calls[1].data.version,4);}
    assert.equal(messages.length,failure?0:1);
  }
});

function addClip(s,actor=parent,title='Skills') {return act(s,actor,'addVideo',{driveFileId:'safe_drive_file_id_123',title,category:'Skills',caption:'Game clip'});}
test('clips stay private until their frozen submission is approved',()=>{
  let s=addClip(owned());const first=Object.keys(s.videos)[0];
  assert.equal(core.publicProfile(s).videos.length,0);
  assert.equal(core.view(s,stranger).videos,undefined);
  s=act(s,parent,'save',{base:0,fields:{bio:'New bio'}});s=act(s,parent,'submit');const revision=Object.keys(s.submissions)[0];
  assert.equal(s.videos[first].status,'pending');assert.equal(core.publicProfile(s).videos.length,0);
  s=addClip(s,parent,'A later upload');
  s=act(s,staff,'review',{id:revision,decision:'approved'});
  assert.equal(core.publicProfile(s).videos.length,1);
  assert.equal(core.publicProfile(s).videos[0].title,'Skills');
  assert.equal(core.publicProfile(s).videos[0].uid,undefined);
  assert.equal(Object.values(s.videos).filter(v=>v.status==='draft').length,1);
});
test('clip permission checks and review rejection preserve privacy',()=>{
  assert.throws(()=>addClip(owned(),stranger),/access required/);
  let s=addClip(owned());const id=Object.keys(s.videos)[0];
  assert.throws(()=>act(s,stranger,'removeVideo',{id}),/unsubmitted/);
  s=act(s,parent,'save',{base:0,fields:{bio:'New'}});s=act(s,parent,'submit');const revision=Object.keys(s.submissions)[0];
  assert.throws(()=>act(s,parent,'removeVideo',{id}),/unsubmitted/);
  s=act(s,staff,'review',{id:revision,decision:'rejected',note:'Please trim the clip.'});
  assert.equal(s.videos[id].status,'rejected');assert.equal(core.publicProfile(s).videos.length,0);
  s=act(s,parent,'removeVideo',{id});assert.equal(core.view(s,parent).videos.length,0);
});
test('staff email identifies player, recipient and exact management link without copying the draft',()=>{
  let s=owned();s=act(s,parent,'save',{base:0,fields:{bio:'Private proposed content'}});s=act(s,parent,'submit');
  const id=Object.keys(s.submissions)[0],sent=[],props=new Map();
  const context={ProfileV2Core:core,Date,JSON,encodeURIComponent,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
    MailApp:{sendEmail:m=>sent.push(m)}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../backend/profile-v2/Service.js'),'utf8'),context);
  const event={actorUid:parent.uid,at:'now',payload:{id}};
  context.notifySubmissionV2_(s,event);context.notifySubmissionV2_(s,event);
  assert.equal(sent.length,1);assert.equal(sent[0].to,'info@njhitz.org');
  assert.match(sent[0].subject,/Casey/);assert.match(sent[0].body,/player-manage-v2\?player=casey-dipaolo-32/);
  assert.match(sent[0].body,/parent@example.test/);assert.doesNotMatch(sent[0].body,/Private proposed content/);
});
test('upload adapter rejects disguised and oversized files before creating Drive files',()=>{
  let created=0;
  const context={ProfileV2Core:core,Date,JSON,encodeURIComponent,
    Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:()=>({}),getUuid:()=> 'uuid'},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'folder'})},
    DriveApp:{getFolderById:()=>({createFile:()=>{created++;return {};}})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../backend/profile-v2/Service.js'),'utf8'),context);
  assert.throws(()=>context.createVideoV2_({base64:Buffer.from('not video').toString('base64'),mimeType:'video/mp4',title:'Clip'},'player'),/does not appear/);
  assert.throws(()=>context.createVideoV2_({base64:'a'.repeat(35000000),mimeType:'video/mp4',title:'Clip'},'player'),/25 MB/);
  assert.equal(created,0);
  context.createVideoV2_({base64:Buffer.from([0,0,0,16,102,116,121,112,109,112,52,50]).toString('base64'),mimeType:'video/mp4',title:'Clip'},'player');assert.equal(created,1);
});
