/* NJ Hitz inline video player. Stream URLs are supplied only by our configured service. */
(function(root) {
  'use strict';
  function formatTime(seconds) {
    seconds = Math.max(0,Math.floor(Number(seconds) || 0));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  }
  function driveSource(key,fileId) {
    // This must be a dedicated public browser key restricted to our sites and
    // Drive API. Never use a server secret or an OAuth access token here.
    if(typeof key!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(key)||
       !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId||''))return '';
    return 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+
      '?alt=media&key='+encodeURIComponent(key);
  }
  function mount(container, {src,title,onFallback} = {}) {
    const doc = container.ownerDocument;
    const el = (tag,cls,text) => { const n=doc.createElement(tag); if(cls)n.className=cls; if(text)n.textContent=text; return n; };
    const shell=el('div','hitz-video'); shell.tabIndex=0; shell.setAttribute('role','group'); shell.setAttribute('aria-label',title+' video player');
    const video=el('video','hitz-video-media'); video.playsInline=true; video.preload='metadata'; video.controls=true; video.setAttribute('playsinline','');
    const controls=el('div','hitz-video-controls');
    const button=(label,text) => { const b=el('button','',text); b.type='button'; b.setAttribute('aria-label',label); return b; };
    const play=button('Play','▶'), mute=button('Mute','Sound on'), fullscreen=button('Full screen','⛶');
    const seek=el('input','hitz-video-seek'); seek.type='range'; seek.min='0'; seek.max='1000'; seek.value='0'; seek.step='1'; seek.disabled=true; seek.setAttribute('aria-label','Seek video');
    const time=el('span','hitz-video-time','0:00 / 0:00'); time.setAttribute('aria-hidden','true');
    const center=button('Play video','▶'); center.className='hitz-video-center';
    const status=el('div','hitz-video-status','Preparing video…'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    const error=el('div','hitz-video-error'); error.hidden=true;
    const retry=button('Retry video','Retry'), fallback=button('Use Drive player','Use Drive player');
    error.append(el('p','','This clip could not play. Retry or use the Drive player.'),retry,fallback);
    controls.append(play,seek,time,mute,fullscreen); shell.append(video,center,status,controls,error); container.replaceChildren(shell);
    let timer, observer, prepared=false, scrubbing=false, expanded=false, overflow='', restoreInert=[], destroyed=false;
    const removers=[];
    const on=(node,event,fn) => {node.addEventListener(event,fn);removers.push(()=>node.removeEventListener(event,fn));};
    function prepare() { if(prepared||destroyed)return; prepared=true;video.src=src;video.load(); }
    function hide() {
      if(video.paused||video.ended||scrubbing||!error.hidden)return;
      if(controls.contains(doc.activeElement))shell.focus({preventScroll:true});
      shell.classList.add('controls-hidden');controls.inert=true;controls.setAttribute('aria-hidden','true');
    }
    function show(schedule=true) {
      clearTimeout(timer);shell.classList.remove('controls-hidden');controls.inert=false;controls.removeAttribute('aria-hidden');
      if(schedule&&!video.paused&&!scrubbing)timer=setTimeout(hide,1200);
    }
    function fail() { if(destroyed)return;status.hidden=true;center.hidden=true;error.hidden=false;show(false); }
    async function togglePlay() {
      prepare();
      if(!video.paused){video.pause();return;}
      if(video.ended)video.currentTime=0;
      try {await video.play();} catch(e) { if(e.name!=='AbortError')fail(); }
    }
    function update() {
      const duration=Number.isFinite(video.duration)?video.duration:0;
      if(!scrubbing)seek.value=String(duration?Math.round(video.currentTime/duration*1000):0);
      seek.disabled=!duration;time.textContent=formatTime(video.currentTime)+' / '+formatTime(duration);
      seek.setAttribute('aria-valuetext',formatTime(video.currentTime)+' of '+formatTime(duration));
    }
    function restorePage() {
      shell.classList.remove('hitz-video-expanded');expanded=false;doc.body.style.overflow=overflow;
      restoreInert.forEach(([n,old])=>{n.inert=old;});restoreInert=[];fullscreen.setAttribute('aria-label','Full screen');fullscreen.textContent='⛶';
    }
    function expandPage() {
      overflow=doc.body.style.overflow;doc.body.style.overflow='hidden';shell.classList.add('hitz-video-expanded');expanded=true;
      for(let branch=shell;branch.parentElement;branch=branch.parentElement){
        for(const sibling of branch.parentElement.children){if(sibling!==branch){restoreInert.push([sibling,sibling.inert]);sibling.inert=true;}}
        if(branch.parentElement===doc.body)break;
      }
    }
    async function toggleFullscreen() {
      if(expanded){restorePage();show();return;}
      if(doc.fullscreenElement===shell){await doc.exitFullscreen();return;}
      try {if(doc.fullscreenEnabled&&shell.requestFullscreen)await shell.requestFullscreen();else expandPage();}
      catch {expandPage();}
      fullscreen.setAttribute('aria-label','Exit full screen');fullscreen.textContent='⤡';show();
    }
    on(video,'click',()=>{if(video.paused)togglePlay();else if(shell.classList.contains('controls-hidden'))show();else {clearTimeout(timer);hide();}});
    on(center,'click',togglePlay);on(play,'click',togglePlay);
    on(video,'play',()=>{play.textContent='❚❚';play.setAttribute('aria-label','Pause');center.hidden=true;show();});
    on(video,'pause',()=>{play.textContent='▶';play.setAttribute('aria-label','Play');center.hidden=false;show(false);});
    on(video,'ended',()=>{center.hidden=false;center.textContent='↻';center.setAttribute('aria-label','Replay video');show(false);});
    on(video,'playing',()=>{status.hidden=true;show();});
    on(video,'waiting',()=>{status.textContent='Buffering…';status.hidden=false;});
    on(video,'loadedmetadata',()=>{status.hidden=true;update();});
    on(video,'canplay',()=>{status.hidden=true;});
    on(video,'timeupdate',update);on(video,'durationchange',update);on(video,'error',fail);
    on(mute,'click',()=>{video.muted=!video.muted;mute.textContent=video.muted?'Muted':'Sound on';mute.setAttribute('aria-label',video.muted?'Unmute':'Mute');show();});
    on(seek,'pointerdown',()=>{scrubbing=true;show(false);});
    const finishSeek=()=>{scrubbing=false;show();};
    on(seek,'pointerup',finishSeek);on(seek,'pointercancel',finishSeek);on(seek,'blur',finishSeek);
    on(seek,'input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)/1000*video.duration;update();});
    on(seek,'change',finishSeek);
    on(controls,'pointerdown',()=>show(false));on(controls,'pointerup',()=>show());
    on(shell,'pointermove',e=>{if(e.pointerType==='mouse')show();});
    on(shell,'focusin',()=>show());
    on(shell,'keydown',e=>{
      if(e.target===seek||e.target.tagName==='BUTTON')return;
      if(e.key===' '||e.key.toLowerCase()==='k'){e.preventDefault();togglePlay();}
      else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(e.key==='ArrowRight'?5:-5)));show();}
      else if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFullscreen();}
      else if(e.key.toLowerCase()==='m'){mute.click();}
    });
    on(doc,'keydown',e=>{if(e.key==='Escape'&&expanded){restorePage();show();fullscreen.focus();}});
    on(doc,'fullscreenchange',()=>{if(doc.fullscreenElement!==shell){fullscreen.setAttribute('aria-label','Full screen');fullscreen.textContent='⛶';show();}});
    on(fullscreen,'click',toggleFullscreen);
    on(retry,'click',()=>{error.hidden=true;status.textContent='Preparing video…';status.hidden=false;center.hidden=false;video.load();});
    on(fallback,'click',()=>{destroy();if(onFallback)onFallback();});
    function destroy(){
      if(destroyed)return;destroyed=true;clearTimeout(timer);observer?.disconnect();removers.forEach(fn=>fn());
      if(expanded)restorePage();if(doc.fullscreenElement===shell)doc.exitFullscreen().catch(()=>{});
      video.pause();video.removeAttribute('src');video.load();
    }
    // With custom handlers installed, native controls no longer obscure footage.
    video.controls=false;
    if('IntersectionObserver' in root){observer=new root.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){prepare();observer.disconnect();}},{rootMargin:'600px'});observer.observe(shell);}else prepare();
    return {destroy,prepare};
  }
  root.NJHitzVideoPlayer={mount,formatTime,driveSource};
  if(typeof module==='object'&&module.exports)module.exports={formatTime,driveSource};
})(typeof window==='object'?window:globalThis);
