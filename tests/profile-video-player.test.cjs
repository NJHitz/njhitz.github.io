const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/profile-video-player.js'),'utf8');
function fixture(){
 const timers=new Map();let serial=0,doc;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.style={};this.paused=true;this.ended=false;this.currentTime=0;this.duration=10;this.hidden=false;this.inert=false;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c)};this.ownerDocument=doc;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];if(k==='src')this.src='';}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(v=>v!==fn);}
  dispatch(k,arg={}){for(const fn of this.events[k]||[])fn({target:this,...arg});}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  focus(){doc.activeElement=this;}
  load(){this.loads=(this.loads||0)+1;}
  async play(){this.paused=false;this.dispatch('play');this.dispatch('playing');}
  pause(){this.paused=true;this.dispatch('pause');}
  click(){this.dispatch('click');}
 }
 doc=new Element('document');doc.body=new Element('body');doc.body.style.overflow='auto';doc.createElement=t=>new Element(t);doc.fullscreenEnabled=false;
 const container=new Element('div'),other=new Element('header');other.inert=false;doc.body.append(other,container);
 const context={document:doc,setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),console};context.window=context;vm.createContext(context);vm.runInContext(source,context);
 const player=context.NJHitzVideoPlayer.mount(container,{src:'https://stream.example/v1/video/player/approved_file',title:'Clip'});
 const shell=container.children[0],[video,center,status,controls,error]=shell.children;
 return{doc,container,other,player,shell,video,center,controls,error,timers,runTimers(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
test('player prepares automatically and native controls do not cover custom controls',()=>{
 const f=fixture();assert.match(f.video.src,/approved_file$/);assert.equal(f.video.preload,'metadata');assert.equal(f.video.playsInline,true);assert.equal(f.video.controls,false);
});
test('controls hide quickly in playback; tapping footage toggles immediately',async()=>{
 const f=fixture();f.center.click();await Promise.resolve();f.runTimers();assert(f.shell.classList.contains('controls-hidden'));assert.equal(f.controls.inert,true);
 f.video.click();assert(!f.shell.classList.contains('controls-hidden'));f.video.click();assert(f.shell.classList.contains('controls-hidden'));
});
test('paused and ended clips retain controls, replay resets to zero',async()=>{
 const f=fixture();f.center.click();await Promise.resolve();f.video.pause();f.runTimers();assert(!f.shell.classList.contains('controls-hidden'));
 f.video.ended=true;f.video.currentTime=10;f.video.dispatch('ended');f.center.click();await Promise.resolve();assert.equal(f.video.currentTime,0);
});
test('scrubbing prevents auto-hide and seeks to the selected time',()=>{
 const f=fixture();const seek=f.controls.children[1];f.video.paused=false;seek.dispatch('pointerdown');seek.value='600';seek.dispatch('input');f.runTimers();assert.equal(f.video.currentTime,6);assert(!f.shell.classList.contains('controls-hidden'));seek.dispatch('pointerup');f.runTimers();assert(f.shell.classList.contains('controls-hidden'));
});
test('fullscreen fallback and cleanup restore page state and stop media',async()=>{
 const f=fixture();f.controls.children[4].click();await Promise.resolve();assert(f.shell.classList.contains('hitz-video-expanded'));assert.equal(f.other.inert,true);assert.equal(f.doc.body.style.overflow,'hidden');f.player.destroy();assert.equal(f.other.inert,false);assert.equal(f.doc.body.style.overflow,'auto');assert.equal(f.video.paused,true);assert(!f.video.src);assert.equal(f.timers.size,0);
});
