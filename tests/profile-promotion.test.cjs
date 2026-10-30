const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const profile=fs.readFileSync(require.resolve('../player-profile.html'),'utf8');
test('previous v2 URLs redirect to the live profile preserving player, context and section',()=>{
 const alias=fs.readFileSync(require.resolve('../player-profile-v2.html'),'utf8'),script=alias.match(/<script>([\s\S]*?)<\/script>/)[1];
 for(const path of ['player-profile-v2','player-profile-v2.html']){
  const url=new URL('https://njhitz.org/'+path+'?player=casey-dipaolo-32&team=NJ%20Hitz&gradYear=2028#statistics-section');let redirected;const link={};
  vm.runInNewContext(script,{URL,window:{location:{href:url.href,search:url.search,hash:url.hash,replace:u=>redirected=u}},document:{getElementById:()=>link}});
  const target=new URL(redirected);assert.equal(target.pathname,'/player-profile');assert.equal(target.search,url.search);assert.equal(target.hash,url.hash);assert.equal(link.href,redirected);
 }
});
test('live profile has canonical metadata, Stats navigation, QR sharing and no GPA disclaimer or preview banner',()=>{
 assert.match(profile,/rel="canonical" href="https:\/\/njhitz.org\/player-profile"/);assert.doesNotMatch(profile,/<meta name="robots" content="noindex/);assert.doesNotMatch(profile,/GPA scale and weighted\/unweighted/);assert.doesNotMatch(profile,/<div class="preview-strip"/);
 assert.match(profile,/href="#statistics-section" id="stats-link">Stats ↓/);assert.match(profile,/new QRCode\(qrContainer/);assert.match(profile,/text: window.location.href/);assert.doesNotMatch(profile,/https:\/\/njhitz.org\/player-profile-v2/);
});
test('Watch Video requires uploaded approved gallery clips; external links alone do not enable it',()=>{
 const fn=profile.slice(profile.indexOf('function updateRecruitingNavigation(player)'),profile.indexOf('// V2 contract:',profile.indexOf('function updateRecruitingNavigation(player)')));
 for(const gallery of [0,1])for(const links of [false,true]){
  const nodes={'video-gallery':{childElementCount:gallery},'links-card':{style:{display:links?'':'none'}},'video-empty':{},'watch-video-link':{},'measurables-nav':{},'stats-empty':{}};
  const ctx={document:{getElementById:id=>nodes[id]}};vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.updateRecruitingNavigation({measurables:[],statsOffense:[],statsPitching:[],recruitingContactAvailable:true,contactEmail:'coach@example.test'});
  assert.equal(nodes['watch-video-link'].hidden,!gallery);assert.equal(nodes['watch-video-link'].href,'#video-gallery-card');
 }
});
test('archived profile stays available without search indexing; management returns to live profile',()=>{
 const archive=fs.readFileSync(require.resolve('../player-profile-archived-20261030.html'),'utf8');assert.match(archive,/noindex, nofollow, noarchive/);assert.match(archive,/new QRCode/);
 const manage=fs.readFileSync(require.resolve('../scripts/player-manage-v2.js'),'utf8');assert.match(manage,/'player-profile\?player='/);assert.doesNotMatch(manage,/'player-profile-v2\?player='/);
});
