const test=require('node:test'),assert=require('node:assert/strict');
const gc=require('../scripts/gc-stats-v2.js'),core=require('../backend/profile-v2/Core.js');
const url='https://web.gc.com/teams/xVIdQnAH2nMN/players/100cb03e-eca8-479a-a4dc-0c78d7542c12';
const meta={sourceUrl:url,teamName:'Example Travel',season:'Fall 2026',seasonEndDate:'2026-11-01',fullSeasonConfirmed:true};
const csv=[['','','','Batting','','','','','','','','','','','Pitching','','','','','','Fielding'],
['Number','Last','First','AVG','OBP','SLG','OPS','1B','2B','3B','HR','RBI','R','BB','IP','BF','SO','BB','ERA','WHIP','1B'],
['32','Example','Casey','.350','.420','.550','.970','20','5','1','2','25','23','14','12.2','61','19','8','2.210','1.342','99'],
['8','Other','Player','.100','.200','.100','.300','1','0','0','0','0','0','1','0.0','0','0','0','.000','.000','88']].map(r=>r.map(c=>'"'+c+'"').join(',')).join('\r\n');
function snap(overrides={}){return {...gc.fromCsv(csv,meta,'Casey Example','32'),...overrides};}
const parent={uid:'family',email:'family@example.test',verified:true},staff={uid:'staff',email:'staff@example.test',verified:true,admin:true};
let i=0;function act(s,a,action,extra={}){const e=core.command(s,a,{action,version:s.version,...extra},'2026-10-29T00:00:00Z','gc-test-'+(++i));return core.apply(s,e);}
function state(){let s=core.empty('id','casey-example-32',{playerName:'Casey Example',jerseyNumber:'32',bio:'Original'});s=act(s,parent,'claim');return act(s,staff,'grant',{uid:parent.uid,confirmRelationship:true});}
test('player links retain team ID and GUID, including canonical slug routes',()=>{
 assert.equal(gc.parseUrl(url).teamId,'xVIdQnAH2nMN');assert.equal(gc.parseUrl(url).playerId,'100cb03e-eca8-479a-a4dc-0c78d7542c12');
 assert.equal(gc.parseUrl(url.replace('/players/','/2026-fall-example/players/')).playerId,gc.parseUrl(url).playerId);
 for(const bad of [url.replace('https:','http:'),url.replace('web.gc.com','web.gc.com.evil.test'),url.replace('web.gc.com','evil@web.gc.com'),'https://web.gc.com/teams/xVIdQnAH2nMN'])assert.throws(()=>gc.parseUrl(bad));
});
test('CSV selects one player and disambiguates batting, pitching and fielding headers',()=>{
 const s=snap();assert.equal(s.batting.singles,'20');assert.equal(s.batting.doubles,'5');assert.equal(s.batting.runs,'23');assert.equal(s.batting.ops,'0.970');
 assert.equal(s.pitching.k,'19');assert.equal(s.pitching.bb,'8');assert.equal(s.pitching.ip,'12.2');assert.equal(s.pitching.bf,'61');
 assert.equal(s.teamId,'xVIdQnAH2nMN');assert.equal(s.playerName,'Casey Example');
 assert.equal(gc.fromCsv(csv,meta,'Player Other','8').pitching,null);
 assert.throws(()=>gc.fromCsv(csv,meta,'Missing Player','32'),/exactly one/);
});
test('missing values stay missing and invalid statistics or source identities are rejected',()=>{
 const s=snap();s.batting.avg='-';assert.equal(gc.validateSeason(s,'Casey Example').batting.avg,'');
 for(const batting of [{...s.batting,avg:'1.5'},{...s.batting,hr:'-1'},{...s.batting,hr:'1.2'},{...s.batting,admin:'true'}])assert.throws(()=>gc.validateSeason({...s,batting},'Casey Example'));
 assert.throws(()=>gc.validateSeason({...s,pitching:{...s.pitching,ip:'12.3'}},'Casey Example'),/innings/);
 assert.throws(()=>gc.validateSeason({...s,fullSeasonConfirmed:false},'Casey Example'),/filters/);
 assert.throws(()=>gc.validateSeason({...s,seasonEndDate:'2026-02-30'},'Casey Example'),/valid season/);
 assert.throws(()=>gc.validateSeason(s,'Someone Else'),/does not match/);
});
test('season imports are private, frozen on submission, and publish only after staff review',()=>{
 let s=state();s=act(s,parent,'stageSeason',{base:0,season:snap()});assert.equal(core.publicProfile(s).seasonStats.length,0);
 assert.equal(core.view(s,{uid:'other'}).statsDrafts,undefined);
 s=act(s,parent,'save',{base:0,fields:{bio:'New'}});s=act(s,parent,'submit');const id=Object.keys(s.submissions)[0];
 s=act(s,parent,'stageSeason',{base:0,season:snap({batting:{...snap().batting,hr:'99'}})});
 assert.throws(()=>act(s,parent,'review',{id,decision:'approved'}),/Staff/);
 s=act(s,staff,'review',{id,decision:'approved'});assert.equal(core.publicProfile(s).seasonStats[0].batting.hr,'2');
 assert.throws(()=>act(s,parent,'stageSeason',{base:0,season:snap()}),/Published profile changed/);
 s=act(s,parent,'save',{base:s.publishedVersion,fields:{bio:'Latest'}});
 assert.throws(()=>act(s,parent,'submit'),/re-import/);
});
test('same source updates one row; other seasons survive and newest season sorts first',()=>{
 let s=state();
 for(const season of [snap(),snap({batting:{...snap().batting,hr:'3'}}),snap({sourceUrl:url.replace('xVIdQnAH2nMN','secondTeam123'),season:'Spring 2027',seasonEndDate:'2027-06-01'})]){
  s=act(s,parent,'stageSeason',{base:s.publishedVersion,season});s=act(s,parent,'save',{base:s.publishedVersion,fields:{bio:'No change'}});s=act(s,parent,'submit');
  const id=Object.keys(s.submissions).find(k=>s.submissions[k].status==='pending');s=act(s,staff,'review',{id,decision:'approved'});
 }
 const seasons=core.publicProfile(s).seasonStats;assert.equal(seasons.length,2);assert.equal(seasons[0].season,'Spring 2027');assert.equal(seasons[1].batting.hr,'3');
});
test('rejected imports never change the published statistics',()=>{
 let s=state();s=act(s,parent,'stageSeason',{base:0,season:snap()});s=act(s,parent,'save',{base:0,fields:{bio:'New'}});s=act(s,parent,'submit');
 const id=Object.keys(s.submissions)[0];s=act(s,staff,'review',{id,decision:'rejected',note:'Wrong season selected.'});assert.equal(core.publicProfile(s).seasonStats.length,0);
});
test('Apps Script bundle loads the shared validator before workflow rules',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),context={};vm.createContext(context);
 const paths=['../scripts/gc-stats-v2.js','../backend/profile-v2/Core.js','../backend/profile-v2/Service.js'];
 vm.runInContext(paths.map(p=>fs.readFileSync(require.resolve(p),'utf8')).join('\n\n'),context);
 assert.equal(context.GCStatsV2.parseUrl(url).teamId,'xVIdQnAH2nMN');
 const initial=context.ProfileV2Core.empty('id','casey-example-32',{playerName:'Casey Example'});
 const event=context.ProfileV2Core.command(initial,staff,{action:'stageSeason',version:0,base:0,season:snap()},'now','id');
 assert.equal(event.payload.season.pitching.k,'19');
});

function legacyState(){let s=state();s.published={...s.published,teamName:'Example Club',offSeason:'Spring 2025',avg:'0.300',obp:'0.400',hr:'2',pitSeason:'Spring 2025',ip:'10.2',k:'17',era:'2.100'};return s;}
function submitAndReview(s,decision='approved'){
 s=act(s,parent,'save',{base:s.publishedVersion,fields:{bio:'Original'}});s=act(s,parent,'submit');
 const id=Object.keys(s.submissions).find(k=>s.submissions[k].status==='pending');return act(s,staff,'review',{id,decision,note:decision==='rejected'?'Keep this season.':''});
}
test('legacy removals stay private until approval and suppress only the selected legacy group',()=>{
 let s=legacyState();assert.equal(core.view(s,parent).legacyStats.length,2);
 s=act(s,parent,'stageStatRemoval',{base:s.publishedVersion,key:'legacy:batting'});
 assert.equal(core.publicProfile(s).avg,'0.300');assert.equal(core.view(s,{uid:'stranger'}).statRemovals,undefined);
 s=submitAndReview(s);const p=core.publicProfile(s);assert.equal(p.avg,'');assert.equal(p.offSeason,'');assert.equal(p.ip,'10.2');
 assert.equal(s.published.avg,'0.300');assert.equal(core.view(s,parent).legacyStats.length,1);
});
test('rejecting or undoing a removal preserves published statistics',()=>{
 let s=legacyState();s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:pitching'});s=act(s,parent,'cancelStatRemoval',{key:'legacy:pitching'});
 assert.equal(Object.keys(core.view(s,parent).statRemovals).length,0);assert.equal(core.publicProfile(s).ip,'10.2');
 s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:pitching'});s=submitAndReview(s,'rejected');assert.equal(core.publicProfile(s).ip,'10.2');
});
test('removal requires ownership and targets only existing published rows',()=>{
 let s=legacyState();assert.throws(()=>act(s,{uid:'stranger',email:'other@example.test',verified:true},'stageStatRemoval',{base:0,key:'legacy:batting'}),/access required/);
 assert.throws(()=>act(s,parent,'stageStatRemoval',{base:0,key:'unknown'}),/not found/);
 s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:batting'});
 assert.throws(()=>act(s,staff,'cancelStatRemoval',{key:'legacy:batting'}),/No removal request/);
});
test('imported-season removal preserves other seasons and can be restored by a reviewed re-import',()=>{
 let s=state();s=act(s,parent,'stageSeason',{base:0,season:snap()});s=submitAndReview(s);
 const key=snap().key;s=act(s,parent,'stageStatRemoval',{base:s.publishedVersion,key});assert.equal(core.publicProfile(s).seasonStats.length,1);
 assert.throws(()=>act(s,parent,'stageSeason',{base:s.publishedVersion,season:snap()}),/Cancel the removal/);
 s=submitAndReview(s);assert.equal(core.publicProfile(s).seasonStats.length,0);assert.equal(s.seasons[key].removed,true);
 s=act(s,parent,'stageSeason',{base:s.publishedVersion,season:snap()});s=submitAndReview(s);assert.equal(core.publicProfile(s).seasonStats.length,1);
});
test('a removal frozen in one submission does not include later staged removals',()=>{
 let s=legacyState();s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:batting'});s=act(s,parent,'save',{base:0,fields:{bio:'Original'}});s=act(s,parent,'submit');
 const id=Object.keys(s.submissions)[0];s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:pitching'});s=act(s,staff,'review',{id,decision:'approved'});
 assert.equal(core.publicProfile(s).avg,'');assert.equal(core.publicProfile(s).ip,'10.2');
 s=act(s,parent,'save',{base:s.publishedVersion,fields:{bio:'Original'}});assert.throws(()=>act(s,parent,'submit'),/Cancel and reselect/);
});
test('legacy duplicate cleanup and a new season can be approved together',()=>{
 let s=legacyState();s=act(s,parent,'stageSeason',{base:0,season:snap()});s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:batting'});s=act(s,parent,'stageStatRemoval',{base:0,key:'legacy:pitching'});s=submitAndReview(s);
 const p=core.publicProfile(s);assert.equal(p.avg,'');assert.equal(p.ip,'');assert.equal(p.seasonStats.length,1);assert.equal(p.seasonStats[0].batting.avg,'0.350');assert.equal(p.seasonStats[0].pitching.ip,'12.2');
});
test('a fresh season import supersedes earlier draft label edits for that same row',()=>{
 let s=state(),season=snap();s=act(s,parent,'stageSeason',{base:0,season});s=act(s,parent,'save',{base:0,fields:{}});s=act(s,parent,'submit');s=act(s,staff,'review',{id:Object.keys(s.submissions)[0],decision:'approved'});
 const base=s.publishedVersion;s=act(s,parent,'stageStatLabels',{base,key:season.key,teamName:'Earlier label',season:'Earlier season',seasonEndDate:'2026-11-01'});
 s=act(s,parent,'stageSeason',{base,season:{...season,teamName:'Updated import'}});assert.equal(core.view(s,parent).statLabels[season.key],undefined);
 s=act(s,parent,'save',{base,fields:{}});s=act(s,parent,'submit');s=act(s,staff,'review',{id:Object.keys(s.submissions).at(-1),decision:'approved'});assert.equal(core.publicProfile(s).seasonStats[0].teamName,'Updated import');
});
