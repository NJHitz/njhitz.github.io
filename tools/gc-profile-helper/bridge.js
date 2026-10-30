chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message?.type!=='NJHITZ_GC_HELPER_DELIVER')return;
  if(!/^\/player-manage-v2(?:\.html)?$/.test(location.pathname))return;
  window.postMessage({type:'NJHITZ_GC_SEASON_CAPTURE',season:message.season},location.origin);
  respond({received:true});
});
