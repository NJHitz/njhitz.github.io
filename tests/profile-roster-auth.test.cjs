const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const roster=require('../scripts/profile-roster.js');
test('current roster overrides the display team while historical season snapshots remain intact',()=>{
 const data={teams:[{id:'hitz14u-fall2026',name:'NJ Hitz 14U',roster:[{slug:'leah-taylor-31'}]}]};
 const saved={teamName:'NJ HITZ 12U 2026',statsOffense:[{teamName:'NJ Hitz 12U',season:'Spring 2026'}]};
 const display=roster.apply(saved,roster.findTeam(data,'leah-taylor-31'));assert.equal(display.teamName,'NJ Hitz 14U');assert.equal(display.statsOffense[0].teamName,'NJ Hitz 12U');assert.equal(saved.teamName,'NJ HITZ 12U 2026');
});
test('missing, ambiguous or unavailable rosters retain the saved profile label',async()=>{
 const team={name:'Team',roster:[{slug:'p'}]};assert.equal(roster.findTeam({teams:[team,team]},'p'),null);assert.equal(roster.findTeam({teams:[team]},'other'),null);
 assert.equal(await roster.load('p',async()=>{throw Error('offline')}),null);const saved={teamName:'Saved team'};assert.equal(roster.apply(saved,null),saved);
});
test('profile sign-in uses local persistence with a session fallback for restricted storage',async()=>{
 const source=fs.readFileSync(require.resolve('../scripts/player-manage-v2.js'),'utf8');const fn=source.slice(source.indexOf('async function persistProfileSignIn('),source.indexOf('async function start()'));
 const context={};vm.createContext(context);vm.runInContext(fn,context);
 for(const localBlocked of [false,true]){const calls=[];const sdk={browserLocalPersistence:'local',browserSessionPersistence:'session',setPersistence:async(auth,mode)=>{calls.push(mode);if(localBlocked&&mode==='local')throw Error('storage blocked');}};await context.persistProfileSignIn({},sdk);assert.deepEqual(calls,localBlocked?['local','session']:['local']);}
 assert.doesNotMatch(source,/sdk\.inMemoryPersistence/);
});
