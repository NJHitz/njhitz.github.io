(function(){
  'use strict';
  const dialog=document.getElementById('recruiting-dialog'),form=document.getElementById('recruiting-form'),status=document.getElementById('recruiting-status'),send=document.getElementById('recruiting-send');
  const config=window.NJHitzProfileV2 || {},slug=new URL(location.href).searchParams.get('player');
  let player={name:'this player',available:false},challenge=null,controller=null,sending=false,lastFocus=null;
  const validEndpoint=config.enabled===true && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.endpoint || '');
  function setStatus(message,error=false){status.textContent=message;status.className=error?'error':'';}
  function setPlayer(value){player=value;document.getElementById('recruiting-availability').textContent=value.available?'Send a recruiting message without exposing the player’s email address.':'A recruiting contact email has not been added yet.';}
  window.NJHitzRecruitingContact={setPlayer};
  async function prepare(){
    const response=await fetch(config.endpoint+'?action=recruitingChallenge&slug='+encodeURIComponent(slug),{cache:'no-store',credentials:'omit',signal:controller.signal});
    const data=await response.json();if(!response.ok || !data.ok || !data.challenge)throw new Error('The contact form could not be prepared. Close and reopen it to try again.');return data.challenge;
  }
  function open(){
    lastFocus=document.activeElement;challenge=null;form.reset();setStatus('');dialog.showModal();document.getElementById('recruiting-recipient').textContent='Message the recruiting contact for '+player.name+'.';
    const available=player.available && validEndpoint;form.hidden=false;send.disabled=true;document.getElementById('recruiting-unavailable').hidden=available;
    ['name','email','phone','message'].forEach(key=>form.elements[key].disabled=!available);
    if(available){controller=new AbortController();send.disabled=true;setStatus('Preparing secure form…');challenge=prepare().then(value=>{setStatus('');send.disabled=false;return value;}).catch(error=>{if(!controller?.signal.aborted)setStatus(error.message,true);return null;});document.getElementById('recruiter-name').focus();}
  }
  function close(){if(sending)return;controller?.abort();dialog.close();lastFocus?.focus();}
  document.querySelectorAll('[data-recruiting-contact]').forEach(button=>button.addEventListener('click',open));dialog.querySelectorAll('.recruiting-close').forEach(button=>button.addEventListener('click',close));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>controller?.abort());
  async function solve(value,signal){
    if(!crypto?.subtle || value.difficulty!==3)throw new Error('This browser cannot complete the spam check. Please use a current browser.');
    const encoder=new TextEncoder();
    for(let counter=0;counter<=1000000;counter++){
      if(signal.aborted)throw new DOMException('Canceled','AbortError');
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value.nonce+':'+counter)));
      if(hash[0]===0 && hash[1]<16)return counter;
    }throw new Error('The spam check could not finish. Please reopen the form.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending || !form.reportValidity())return;
    const phone=form.elements.phone.value.trim(),digits=phone.replace(/\D/g,'');if(digits.length<10 || digits.length>15 || !/^[+()\d .-]+$/.test(phone)){setStatus('Enter a valid phone number.',true);form.elements.phone.focus();return;}
    sending=true;send.disabled=true;dialog.setAttribute('aria-busy','true');setStatus('Verifying spam protection…');
    try{
      let value=await challenge;if(!value || value.expiresAt<Date.now()+1000){value=await prepare();challenge=Promise.resolve(value);}
      const solution=await solve(value,controller.signal);
      const wait=Math.max(0,value.issuedAt+3100-Date.now());if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      setStatus('Sending your message…');
      const response=await fetch(config.endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},signal:AbortSignal.timeout(25000),body:JSON.stringify({action:'recruitingContact',slug,name:form.elements.name.value,email:form.elements.email.value,phone,message:form.elements.message.value,_gotcha:form.elements._gotcha.value,challenge:value,solution})});
      const result=await response.json();if(!response.ok || !result.ok)throw new Error(result.error || 'Your message could not be sent. Please try again later.');
      form.reset();challenge=null;setStatus('Your recruiting message has been sent.');send.textContent='Message sent';send.dataset.sent='true';
    }catch(error){setStatus(error.name==='TimeoutError' || error.name==='TypeError'?'We could not confirm delivery. Please wait before retrying.':error.message,true);}
    finally{sending=false;send.disabled=send.dataset.sent==='true';dialog.removeAttribute('aria-busy');}
  });
  dialog.addEventListener('close',()=>{send.textContent='Send message';delete send.dataset.sent;});
})();
