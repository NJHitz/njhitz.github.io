/* Current roster labels are display context, separate from historical profile/stat snapshots. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NJHitzProfileRoster=api;})(typeof window!=='undefined'?window:globalThis,function(){
  function findTeam(data,slug){
    const matches=(Array.isArray(data?.teams)?data.teams:[]).filter(team=>Array.isArray(team.roster)&&team.roster.some(player=>player.slug===slug));
    if(matches.length!==1 || typeof matches[0].name!=='string' || !matches[0].name.trim())return null;
    return {name:matches[0].name.trim(),id:matches[0].id || ''};
  }
  async function load(slug,fetcher=fetch){
    try{
      const response=await fetcher('data/teams.json',{cache:'no-cache',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return null;
      return findTeam(await response.json(),slug);
    }catch(error){return null;}
  }
  function apply(player,team){return team?{...player,teamName:team.name}:player;}
  return {findTeam,load,apply};
});
