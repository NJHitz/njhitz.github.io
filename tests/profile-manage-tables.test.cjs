const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.value='';this.validity={valid:true};this.listeners={};}
 append(...nodes){this.children.push(...nodes);}prepend(...nodes){this.children.unshift(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this[k]=v;}addEventListener(k,f){this.listeners[k]=f;}
}
function harness(model){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const context={URL,Date,window:{},location:{href:'https://njhitz.org/player-manage-v2?player=test-player'},document:{getElementById:get,createElement:t=>new Node(t),querySelectorAll:()=>[],querySelector:()=>new Node()}};
 vm.createContext(context);const source=fs.readFileSync(require.resolve('../scripts/player-manage-v2.js'),'utf8');vm.runInContext(source.slice(0,source.lastIndexOf('start().catch')),context);context.sample=model;vm.runInContext("model=sample;auth={currentUser:{uid:'parent'}};",context);return {context,get,run:s=>vm.runInContext(s,context)};
}
function flatten(node){return [node,...node.children.flatMap(n=>n instanceof Node?flatten(n):[])];}
test('seasons merge draft overrides, include legacy rows and sort newest first',()=>{
 const {run,get}=harness({seasons:[{key:'fall',teamName:'Hitz',season:'Fall 2026',seasonEndDate:'2026-11-01'}],statsDrafts:{fall:{key:'fall',teamName:'Hitz updated',season:'Fall 2026',seasonEndDate:'2026-11-01'}},legacyStats:[{key:'legacy:batting',teamName:'Old',season:'Spring 2025'}],statLabels:{},statRemovals:{}});
 run('renderStatsTable()');const rows=flatten(get('gc-seasons')).filter(n=>n.tag==='tbody')[0].children;
 assert.equal(rows.length,2);assert.equal(rows[0].children[1].children[0].value,'Hitz updated');assert.equal(rows[1].children[3].children[0].value,'2025-05-28');
 const box=rows[0].children[0].children[0];box.checked=true;box.listeners.change();assert.match(flatten(get('gc-seasons')).find(n=>n.className==='selection-count').textContent,/1 selected/);
});
test('saving captures all table edits before responses replace controls, using each fresh version',async()=>{
 const {run,context}=harness({version:2,publishedVersion:0});context.calls=[];
 run("fields=()=>({bio:'unsaved'}); tableEdits=[()=>({action:'stageStatLabels',key:'one',teamName:'New',season:'Fall 2026',seasonEndDate:'2026-11-01'}),()=>({action:'stageVideoChanges',changes:[{id:'clip',title:'New clip'}]})];request=async(action,data)=>{calls.push({action,data});model.version++;tableEdits=[];};");
 await run('saveAllDraft()');assert.deepEqual(Array.from(context.calls,c=>c.action),['save','stageStatLabels','stageVideoChanges']);assert.deepEqual(Array.from(context.calls,c=>c.data.version),[2,3,4]);
});
test('submission summaries use frozen fields and counts instead of a misleading current-profile comparison',()=>{
 const {run}=harness({});const result=run("submissionSummary({summary:{fields:['bio'],seasons:1,videoRenames:2,videoRemovals:1}})");assert.match(result,/Player bio/);assert.match(result,/2 video renames/);assert.match(result,/1 video removals/);
 assert.match(run('submissionSummary({videoIds:["x"]})'),/Historical entry/);
});
test('final save and submit controls follow both add-item sections and remain associated with the profile form',()=>{
 const html=fs.readFileSync(require.resolve('../player-manage-v2.html'),'utf8');assert.ok(html.indexOf('class="final-actions"')>html.indexOf('id="video-list"'));assert.ok(html.indexOf('class="final-actions"')>html.indexOf('id="gc-seasons"'));assert.match(html,/type="submit" form="profile-form">Save draft/);
});
