(function(){
  'use strict';
  const endpoint='https://script.google.com/macros/s/AKfycbz3eGOVLqW8lEYYfpn4jvDnoARyQr6C_9MdNmtawZN5trsi1zefQa_9fVAs0u6JoAmE/exec';
  const form=document.getElementById('tryoutForm'),button=document.getElementById('submitBtn'),status=document.getElementById('formStatus'),success=document.getElementById('successMsg');
  const year=new Date().getFullYear(),grad=document.getElementById('ageGradYear');
  for(let y=year-2;y<=year+14;y++){const option=document.createElement('option');option.value=String(y);option.textContent='Class of '+y;grad.append(option);}
  const birth=document.getElementById('birthdate');birth.min=(year-23)+'-01-01';birth.max=year+'-12-31';
  let security=null,preparing=null,busy=false;
  async function request(url,options){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{const response=await fetch(url,{...options,signal:controller.signal,credentials:'omit',cache:'no-store'});const data=await response.json();if(!response.ok || !data.ok)throw new Error(data.error || 'Registration service unavailable.');return data;}finally{clearTimeout(timer);}
  }
  async function solve(challenge){
    if(!crypto.subtle)throw new Error('Your browser cannot complete the security check. Please use an updated browser.');
    const encoder=new TextEncoder();
    for(let solution=0;solution<1000000;solution++){
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(challenge.nonce+':'+solution)));
      if(hash[0]===0 && hash[1]<16)return solution;
      if(solution%100===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    throw new Error('Security check could not finish. Please retry.');
  }
  function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{const data=await request(endpoint+'?action=tryoutChallenge');const solution=await solve(data.challenge);security={challenge:data.challenge,solution};return security;})().finally(()=>{preparing=null;});return preparing;
  }
  form.addEventListener('focusin',()=>{if(!security && !preparing)prepare().catch(()=>{});},{once:true});
  form.addEventListener('reset',()=>{success.hidden=true;success.style.display='none';if(!busy)status.textContent='Protected by a free background security check.';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !form.reportValidity())return;
    busy=true;button.disabled=true;form.setAttribute('aria-busy','true');success.hidden=true;success.style.display='none';
    const reset=form.querySelector('[type="button"]');if(reset)reset.disabled=true;
    button.textContent='Checking & submitting…';status.textContent='Verifying your registration. Please keep this page open…';
    try{
      if(!security || security.challenge.expiresAt<Date.now()+10000)await prepare();
      const receipt=security;
      const remaining=receipt.challenge.issuedAt+3100-Date.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
      const val=id=>document.getElementById(id).value.trim();
      const payload={action:'tryoutRegister',name:val('playerName'),address:val('playerAddress'),phone:val('guardianPhone'),email:val('guardianEmail'),birthdate:val('birthdate'),gradYear:val('ageGradYear'),highschool:val('highSchool'),pos1:val('pos1'),pos2:val('pos2'),pos3:val('pos3'),_gotcha:val('website'),...receipt};
      const result=await request(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)});
      if(result.accepted!==true)throw new Error('Your registration could not be confirmed. Please retry.');
      form.reset();security=null;success.hidden=false;success.style.display='block';status.textContent='Registration saved successfully.';
    }catch(error){status.textContent=error.name==='AbortError'?'The response timed out. Your registration may have saved; retrying will not duplicate it.':error.message;security=null;}
    finally{busy=false;button.disabled=false;if(reset)reset.disabled=false;button.textContent='Submit Registration';form.removeAttribute('aria-busy');}
  });
})();
