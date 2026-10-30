const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,dataset:{},setAttribute(k,v){this[k]=v;}});return nodes.get(id);};
 const button={dataset:{},disabled:false},context={URL,window:{},location:{href:'https://njhitz.org/player-manage-v2?player=casey-example-32'},document:{getElementById:get,querySelector:()=>get('main'),querySelectorAll:()=>[button]}};
 vm.createContext(context);const source=fs.readFileSync(require.resolve('../scripts/player-manage-v2.js'),'utf8');vm.runInContext(source.slice(0,source.lastIndexOf('start().catch')),context);return {context,get,button};
}
test('activity stays visible for the whole action and clears on success',async()=>{
 const {context,get,button}=harness();let release;const gate=new Promise(resolve=>release=resolve);
 const pending=context.run(async()=>{await gate;});
 assert.equal(get('operation-progress').hidden,false);assert.equal(get('main')['aria-busy'],'true');assert.equal(button.disabled,true);
 release();await pending;assert.equal(get('operation-progress').hidden,true);assert.equal(get('main')['aria-busy'],'false');assert.equal(button.disabled,false);
});
test('nested action phases do not hide the indicator early, and failures restore controls',async()=>{
 const {context,get,button}=harness();
 await context.run(async()=>{
  const finish=context.beginActivity('Submitting changes for staff review…');assert.equal(get('operation-label').textContent,'Submitting changes for staff review…');
  finish();assert.equal(get('operation-progress').hidden,false);assert.equal(button.disabled,true);throw new Error('Service unavailable');
 });
 assert.equal(get('operation-progress').hidden,true);assert.equal(button.disabled,false);assert.equal(get('message').textContent,'Service unavailable');
});
