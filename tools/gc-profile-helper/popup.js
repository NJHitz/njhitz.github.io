const $=id=>document.getElementById(id);
let captured;
const keys=['sourceUrl','playerName','jerseyNumber','teamName','season','seasonEndDate'];
function status(value){$('status').textContent=value;}
async function destinations(){
  const tabs=await chrome.tabs.query({url:['https://njhitz.org/player-manage-v2*','https://www.njhitz.org/player-manage-v2*']});
  $('destination').replaceChildren();
  tabs.forEach(tab=>{const option=document.createElement('option');option.value=String(tab.id);option.textContent=new URL(tab.url).searchParams.get('player') || tab.url;$('destination').append(option);});
  $('send').disabled=!captured || !tabs.length;
}
// Read the existing export offered by the page, not private APIs or session credentials.
async function readVisibleExport(){
  const link=[...document.querySelectorAll('a.ExportStatsButton__export-stats-button[download],.SeasonStatsPage__export-stats a[download]')].find(a=>a.getClientRects().length && /^blob:https:\/\/web\.gc\.com\//.test(a.href));
  if(!link)throw new Error('No authorized CSV export found. Open the team Stats page with a Staff account, or use the CSV file import in NJ Hitz.');
  const response=await fetch(link.href);if(!response.ok)throw new Error('GameChanger export could not be read.');
  const csv=await response.text();if(csv.length>2000000)throw new Error('CSV exceeds 2 MB.');return csv;
}
$('capture-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{
    const metadata=Object.fromEntries(keys.map(key=>[key,$(key).value]));metadata.fullSeasonConfirmed=$('confirmed').checked;
    const source=GCStatsV2.parseUrl(metadata.sourceUrl),[tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const page=new URL(tab?.url || 'about:blank');
    if(page.origin!=='https://web.gc.com' || page.pathname.split('/')[2]!==source.teamId)throw new Error('Open the matching GameChanger team’s Stats page, then capture.');
    status('Reading the authorized season export…');
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readVisibleExport});
    captured=GCStatsV2.fromCsv(results[0].result,metadata,metadata.playerName,metadata.jerseyNumber);
    await chrome.storage.session.set({metadata,captured});
    status('Captured '+captured.playerName+' · '+captured.teamName+' · '+captured.season+'. These are supplied statistics pending NJ Hitz staff review.');await destinations();
  }catch(error){captured=null;await chrome.storage.session.remove('captured');$('send').disabled=true;status(error.message);}finally{button.disabled=false;}
});
$('find').addEventListener('click',()=>destinations().catch(e=>status(e.message)));
$('send').addEventListener('click',async()=>{
  try{
    if(!captured)throw new Error('Capture a season first.');
    const tabId=Number($('destination').value);if(!tabId)throw new Error('Open the player’s NJ Hitz management page first.');
    const result=await chrome.tabs.sendMessage(tabId,{type:'NJHITZ_GC_HELPER_DELIVER',season:captured});
    if(!result?.received)throw new Error('Reload the management page and sign in, then try sending again.');
    status('Sent. Return to NJ Hitz, check the received capture, confirm the full-season totals, and choose Import season into draft.');
  }catch(error){status(error.message);}
});
(async()=>{
  const saved=await chrome.storage.session.get(['metadata','captured']);
  if(saved.metadata)keys.forEach(key=>{$(key).value=saved.metadata[key] || '';});
  captured=saved.captured || null;
  if(captured)status('A captured season is ready: '+captured.playerName+' · '+captured.season);
  await destinations();
})().catch(error=>status(error.message));
