/* Shared browser / Apps Script rules for family-supplied GameChanger season snapshots. */
var GCStatsV2 = (function () {
  'use strict';
  var battingKeys=['avg','obp','slg','ops','singles','doubles','triples','hr','rbi','runs'];
  var pitchingKeys=['ip','bf','k','bb','era','whip'];
  function fail(s){throw new Error(s);}
  function nameKey(s){return String(s || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function parseUrl(value){
    var m=String(value || '').trim().match(/^https:\/\/web\.gc\.com\/teams\/([A-Za-z0-9_-]{6,80})\/(?:([a-zA-Z0-9_-]+)\/)?players\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#][^\s]*)?$/i);
    if(!m)fail('Enter a GameChanger player URL with a team ID and player GUID.');
    return {teamId:m[1],playerId:m[3].toLowerCase(),url:'https://web.gc.com/teams/'+m[1]+'/'+(m[2]?m[2]+'/':'')+'players/'+m[3].toLowerCase()};
  }
  function label(value,max,what){var s=String(value || '').trim();if(!s || s.length>max || /[\x00-\x1f]/.test(s))fail('Enter '+what+'.');return s;}
  function metric(value,key){
    var s=value == null ? '' : String(value).trim();
    if(!s || /^(?:-|—|N\/?A|NaN)$/i.test(s))return '';
    if(key==='ip'){if(!/^\d{1,4}(?:\.[012])?$/.test(s))fail('IP must use baseball innings notation, such as 12.2.');return s;}
    if(!/^(?:\d{1,7}(?:\.\d{1,4})?|\.\d{1,4})$/.test(s))fail('Invalid '+key.toUpperCase()+' value.');
    var n=Number(s),rate=['avg','obp','slg','ops','era','whip'].indexOf(key)>=0;
    if(n>1000000 || (!rate&&!Number.isInteger(n)) || (['avg','obp'].indexOf(key)>=0&&n>1) || (key==='slg'&&n>4) || (key==='ops'&&n>5))fail('Invalid '+key.toUpperCase()+' value.');
    return s.charAt(0)==='.'?'0'+s:s;
  }
  function metrics(input,keys){
    if(!input || typeof input!=='object' || Array.isArray(input))fail('Missing season statistics.');
    Object.keys(input).forEach(function(k){if(keys.indexOf(k)<0)fail('Unsupported statistic: '+k);});
    var out={};keys.forEach(function(k){out[k]=metric(input[k],k);});return out;
  }
  function validateSeason(input,expectedName){
    if(!input || typeof input!=='object' || Array.isArray(input))fail('Invalid season snapshot.');
    if(input.fullSeasonConfirmed!==true)fail('Confirm this export contains the full season with filters cleared.');
    var source=parseUrl(input.sourceUrl),who=label(input.playerName,160,'the source player name');
    if(!nameKey(expectedName) || nameKey(who)!==nameKey(expectedName))fail('The GameChanger player name does not match this profile. Ask staff to check the identity.');
    var date=String(input.seasonEndDate || '');
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('Choose a valid season end date for sorting.');
    var bat=metrics(input.batting,battingKeys),pit=input.pitching?metrics(input.pitching,pitchingKeys):null;
    if(!Object.keys(bat).some(function(k){return bat[k]!=='';})&&!pit)fail('No season statistics were found.');
    if(pit && !(Number(pit.ip)>0 || Number(pit.bf)>0))pit=null;
    return {key:source.teamId+':'+source.playerId,sourceUrl:source.url,teamId:source.teamId,playerId:source.playerId,playerName:who,
      jerseyNumber:String(input.jerseyNumber || '').slice(0,10),teamName:label(input.teamName,160,'the GameChanger team name'),
      season:label(input.season,80,'a season label'),seasonEndDate:date,batting:bat,pitching:pit,fullSeasonConfirmed:true,source:'GameChanger export · family supplied; staff reviewed before publication'};
  }
  function parseCsv(text){
    if(typeof text!=='string' || text.length>2000000)fail('Choose a GameChanger CSV up to 2 MB.');
    text=text.replace(/^\uFEFF/,'');var rows=[],row=[],cell='',quoted=false;
    for(var i=0;i<text.length;i++){
      var c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)fail('The CSV contains an unfinished quoted field.');
    row.push(cell);if(row.some(Boolean))rows.push(row);
    var hi=rows.findIndex(function(r){return r.indexOf('First')>=0&&r.indexOf('Last')>=0&&r.indexOf('AVG')>=0;});
    if(hi<1)fail('Use the original GameChanger export with its Batting and Pitching section headers.');
    var headers=rows[hi].map(function(s){return s.trim();}),groups=rows[hi-1],section='',columns={};
    headers.forEach(function(h,j){if(/^(Batting|Pitching|Fielding)$/i.test(String(groups[j]).trim()))section=groups[j].trim().toLowerCase();if(h)columns[section+':'+h]=j;});
    function get(r,key){var j=columns[key];return j===undefined?'':String(r[j] || '').trim();}
    return rows.slice(hi+1).filter(function(r){return get(r,':First')&&get(r,':Last');}).map(function(r){
      var b={},p={};[['avg','AVG'],['obp','OBP'],['slg','SLG'],['ops','OPS'],['singles','1B'],['doubles','2B'],['triples','3B'],['hr','HR'],['rbi','RBI'],['runs','R']].forEach(function(pair){b[pair[0]]=get(r,'batting:'+pair[1]);});
      [['ip','IP'],['bf','BF'],['k','SO'],['bb','BB'],['era','ERA'],['whip','WHIP']].forEach(function(pair){p[pair[0]]=get(r,'pitching:'+pair[1]);});
      return {playerName:get(r,':First')+' '+get(r,':Last'),jerseyNumber:get(r,':Number'),batting:b,pitching:p};
    });
  }
  function fromCsv(csv,metadata,expectedName,expectedNumber){
    var choices=parseCsv(csv).filter(function(r){return nameKey(r.playerName)===nameKey(expectedName);});
    if(choices.length>1)choices=choices.filter(function(r){return r.jerseyNumber===String(expectedNumber);});
    if(choices.length!==1)fail('The CSV must contain exactly one matching player. Check the name and jersey number with staff.');
    return validateSeason(Object.assign({},metadata,choices[0]),expectedName);
  }
  return {parseUrl:parseUrl,parseCsv:parseCsv,fromCsv:fromCsv,validateSeason:validateSeason,battingKeys:battingKeys,pitchingKeys:pitchingKeys};
}());
if(typeof module!=='undefined')module.exports=GCStatsV2;
