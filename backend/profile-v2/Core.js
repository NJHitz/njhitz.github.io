var GCStatsV2 = typeof require === 'function' ? require('../../scripts/gc-stats-v2.js') : GCStatsV2;
/* Pure workflow rules. Loaded by Apps Script and by the Node security tests. */
var ProfileV2Core = (function () {
  'use strict';
  var FIELDS = {
    bio: 5000, schoolName: 160, gpa: 30, intendedMajor: 250, honors: 3500,
    academics: 5000, height: 40, cityState: 160, primaryPosition: 20,
    positions: 120, batsThrows: 20, gradYear: 4, playerEmail: 250,
    playerPhone: 60, contactDisplayOptIn: 3, homeToFirst: 40,
    firstToThird: 40, overhandVelo: 40, exitVelo: 40,
    highlightVideoUrl: 1000, recruitingProfileUrl: 1000, additionalLinks: 3000
  };
  function fail(message) { throw new Error(message); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clean(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid profile fields.');
    var out = {};
    Object.keys(input).forEach(function (key) {
      if (!own(FIELDS, key)) fail('Field cannot be edited: ' + key);
      if (typeof input[key] !== 'string' || input[key].length > FIELDS[key]) fail('Invalid value: ' + key);
      out[key] = input[key].trim();
      if (/Url$/.test(key) && out[key]) {
        if (!/^https:\/\/[^\s]+$/i.test(out[key])) fail('Video and recruiting links must use HTTPS.');
      }
      if (key === 'gradYear' && out[key] && !/^20\d{2}$/.test(out[key])) fail('Enter a four-digit graduation year.');
      if (key === 'contactDisplayOptIn' && !/^(Yes|No)$/.test(out[key])) fail('Choose Yes or No for contact display.');
    });
    if (JSON.stringify(out).length > 25000) fail('Profile draft is too large.');
    return out;
  }
  function empty(playerId, slug, published) {
    return {playerId:playerId, slug:slug, version:0, publishedVersion:0,
      published:copy(published), access:{}, claims:{}, drafts:{}, submissions:{}, videos:{}, statsDrafts:{}, seasons:{}, statRemovals:{}, hiddenLegacy:{}, statLabelDrafts:{}, legacyLabels:{}, videoChanges:{}};
  }
  function legacyStats(s) {
    var p=s.published, rows=[];
    var groups=[['batting','offSeason',['avg','obp','slg','ops','hr','rbi']],['pitching','pitSeason',['ip','k','bb','era','whip']]];
    groups.forEach(function(g){
      if(s.hiddenLegacy[g[0]] || ![g[1]].concat(g[2]).some(function(k){return p[k]!=null && p[k]!=='';}))return;
      var row={key:'legacy:'+g[0],kind:g[0],teamName:p.teamName || '',season:p[g[1]] || 'Legacy season'};
      row[g[0]]={};g[2].forEach(function(k){row[g[0]][k]=p[k] == null?'':p[k];});
      Object.assign(row,(s.legacyLabels || {})[row.key] || {});
      row.label=[row.teamName,row.season,'Legacy '+g[0]].filter(Boolean).join(' · ');rows.push(row);
    });return rows;
  }
  function removalTarget(s,key) {
    var legacy=legacyStats(s).find(function(row){return row.key===key;});if(legacy)return legacy;
    if(own(s.seasons,key) && !s.seasons[key].removed){var season=s.seasons[key];return {key:key,label:season.teamName+' · '+season.season,sourceUrl:season.sourceUrl,batting:copy(season.batting),pitching:copy(season.pitching)};}
    fail('Published statistics row not found. Reload the profile.');
  }
  function apply(state, event) {
    var s = copy(state), p = event.payload, uid = event.actorUid;
    if (event.version !== s.version + 1) fail('Invalid event sequence.');
    if (event.type === 'claim') s.claims[uid] = {uid:uid, email:p.email, status:'pending', at:event.at, note:p.note};
    if (event.type === 'grant') {
      s.access[p.uid] = true;
      s.claims[p.uid].status = 'approved';
    }
    if (event.type === 'denyClaim') s.claims[p.uid].status = 'rejected';
    if (event.type === 'revoke') delete s.access[p.uid];
    if(event.type === 'stageStatLabels') {
      if(!s.statLabelDrafts)s.statLabelDrafts={};if(!s.statLabelDrafts[uid])s.statLabelDrafts[uid]={};
      s.statLabelDrafts[uid][p.key]=copy(p);
    }
    if(event.type === 'stageVideoChanges') {
      if(!s.videoChanges)s.videoChanges={};if(!s.videoChanges[uid])s.videoChanges[uid]={};
      p.changes.forEach(function(c){if(c.undo)delete s.videoChanges[uid][c.id];else s.videoChanges[uid][c.id]=copy(c);});
    }
    if (event.type === 'stageSeason') {
      if(!s.statsDrafts[uid])s.statsDrafts[uid]={};
      s.statsDrafts[uid][p.season.key]=Object.assign(copy(p.season),{base:p.base,capturedAt:event.at});
    }
    if(event.type === 'stageStatRemoval') {
      if(!s.statRemovals[uid])s.statRemovals[uid]={};
      s.statRemovals[uid][p.target.key]=Object.assign(copy(p.target),{base:p.base});
    }
    if(event.type === 'cancelStatRemoval')delete s.statRemovals[uid][p.key];
    if (event.type === 'removeStagedSeason') delete s.statsDrafts[uid][p.key];
    if (event.type === 'save') s.drafts[uid] = {fields:p.fields, base:p.base, savedAt:event.at};
    if (event.type === 'addVideo') s.videos[p.id] = Object.assign(copy(p), {uid:uid,status:'draft',at:event.at});
    if (event.type === 'removeVideo') s.videos[p.id].status = 'removed';
    if (event.type === 'submit') {
      (p.videoIds || []).forEach(function(id){s.videos[id].status = 'pending';});
      s.submissions[p.id] = {id:p.id, uid:uid, fields:p.fields, base:p.base, videoIds:p.videoIds || [], status:'pending', at:event.at};
      s.submissions[p.id].seasonStats = copy(p.seasonStats || []);
      s.submissions[p.id].statRemovals=copy(p.statRemovals || []);
      s.submissions[p.id].statLabels=copy(p.statLabels || []);
      s.submissions[p.id].videoChanges=copy(p.videoChanges || []);
      s.submissions[p.id].summary=copy(p.summary || {});
      if(s.statLabelDrafts)delete s.statLabelDrafts[uid];if(s.videoChanges)delete s.videoChanges[uid];
      delete s.statRemovals[uid];
      delete s.statsDrafts[uid];
      delete s.drafts[uid];
    }
    if (event.type === 'review') {
      var revision = s.submissions[p.id];
      revision.status = p.decision;
      (revision.videoIds || []).forEach(function(id){s.videos[id].status = p.decision;});
      revision.reviewedBy = uid; revision.reviewedAt = event.at; revision.note = p.note;
      if (p.decision === 'approved') {
        Object.keys(revision.fields).forEach(function (key) { s.published[key] = revision.fields[key]; });
        (revision.seasonStats || []).forEach(function(season){s.seasons[season.key]=Object.assign(copy(season),{approvedAt:event.at});});
        (revision.statRemovals || []).forEach(function(target){
          if(target.key==='legacy:batting')s.hiddenLegacy.batting=true;
          else if(target.key==='legacy:pitching')s.hiddenLegacy.pitching=true;
          else if(own(s.seasons,target.key)){s.seasons[target.key].removed=true;s.seasons[target.key].removedAt=event.at;}
        });
        (revision.statLabels || []).forEach(function(c){
          if(c.key.indexOf('legacy:')===0){if(!s.legacyLabels)s.legacyLabels={};s.legacyLabels[c.key]={teamName:c.teamName,season:c.season,seasonEndDate:c.seasonEndDate};}
          else if(s.seasons[c.key] && !s.seasons[c.key].removed)Object.assign(s.seasons[c.key],{teamName:c.teamName,season:c.season,seasonEndDate:c.seasonEndDate});
        });
        (revision.videoChanges || []).forEach(function(c){if(c.remove)s.videos[c.id].status='removed';else s.videos[c.id].title=c.title;});
        s.publishedVersion = event.version;
      }
    }
    s.version = event.version;
    return s;
  }
  function command(state, actor, cmd, now, eventId) {
    if (!actor || !actor.uid || !actor.email || actor.verified !== true) fail('A verified account is required.');
    var admin = actor.admin === true, access = own(state.access, actor.uid);
    var type = cmd.action, payload = {};
    if (cmd.version !== state.version) fail('This profile changed. Reload before saving or reviewing.');
    if (type === 'claim') {
      if (access) fail('You already have access.');
      if (own(state.claims, actor.uid) && state.claims[actor.uid].status === 'pending') fail('Your claim is already awaiting review.');
      payload = {email:actor.email, note:String(cmd.note || '').slice(0,1000)};
    } else if (type === 'grant' || type === 'denyClaim') {
      if (!admin) fail('Staff access required.');
      if (!own(state.claims, cmd.uid) || state.claims[cmd.uid].status !== 'pending') fail('No pending claim.');
      if (type === 'grant' && cmd.confirmRelationship !== true) fail('Confirm the family relationship before granting access.');
      payload = {uid:cmd.uid};
    } else if (type === 'revoke') {
      if (!admin) fail('Staff access required.');
      if (!own(state.access, cmd.uid)) fail('No active access grant.');
      payload = {uid:cmd.uid};
    } else if (type === 'addVideo') {
      if (!access && !admin) fail('Profile access required.');
      if (Object.keys(state.videos).filter(function(id){return state.videos[id].status !== 'removed';}).length >= 50) fail('This profile has reached its 50 clip limit. Contact staff.');
      // This command is only constructed by the upload adapter after creating a private Drive file.
      if (!/^[a-zA-Z0-9_-]{10,200}$/.test(cmd.driveFileId || '')) fail('Invalid video file.');
      var title = String(cmd.title || '').trim();
      if (!title || title.length > 120) fail('Enter a clip title of up to 120 characters.');
      if (['Skills','Game footage','Highlights'].indexOf(cmd.category) < 0) fail('Choose a video category.');
      if (String(cmd.caption || '').length > 1000) fail('Video caption is too long.');
      payload = {id:eventId,driveFileId:cmd.driveFileId,title:title,category:cmd.category,caption:String(cmd.caption || ''),sortOrder:state.version};
    } else if (type === 'removeVideo') {
      if (!own(state.videos,cmd.id)) fail('Clip not found.');
      var video = state.videos[cmd.id];
      if ((!admin && (!access || video.uid !== actor.uid)) || ['draft','rejected'].indexOf(video.status) < 0) fail('Only an unsubmitted or rejected clip can be removed here.');
      payload = {id:cmd.id};
    } else if(type === 'stageVideoChanges') {
      if(!access && !admin)fail('Profile access required.');
      if(cmd.base!==state.publishedVersion)fail('Published profile changed. Reload before editing videos.');
      if(!Array.isArray(cmd.changes) || !cmd.changes.length || cmd.changes.length>50)fail('Choose 1 to 50 clips.');
      var seen={};payload={changes:cmd.changes.map(function(c){
        if(!c || !own(state.videos,c.id) || own(seen,c.id))fail('Invalid or duplicate clip.');seen[c.id]=true;
        var v=state.videos[c.id];
        if(v.status==='removed' || v.status==='pending' || (!admin && v.status!=='approved' && v.uid!==actor.uid))fail('This clip cannot be edited.');
        if(Object.keys(state.submissions).some(function(k){var r=state.submissions[k];return r.status==='pending' && (r.videoChanges || []).some(function(x){return x.id===c.id;});}))fail('This clip is awaiting staff review.');
        if(c.undo)return {id:c.id,undo:true};
        var title=typeof c.title==='string'?c.title.trim():v.title;
        if(!title || title.length>120)fail('Enter a clip title of up to 120 characters.');
        return {id:c.id,title:title,previousTitle:v.title,remove:c.remove===true,base:cmd.base};
      })};
    } else if(type === 'stageStatLabels') {
      if(!access && !admin)fail('Profile access required.');
      if(cmd.base!==state.publishedVersion)fail('Published profile changed. Reload before editing statistics.');
      var target=removalTarget(state,cmd.key);
      if(own(state.statRemovals[actor.uid] || {},cmd.key))fail('Undo removal before editing this row.');
      var teamName=String(cmd.teamName || '').trim(),label=String(cmd.season || '').trim(),date=String(cmd.seasonEndDate || '');
      if(!teamName || teamName.length>160 || !label || label.length>80)fail('Enter a team name and season.');
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('Choose a valid season end date.');
      payload={key:cmd.key,teamName:teamName,season:label,seasonEndDate:date,previousLabel:target.label,base:cmd.base};
    } else if (type === 'stageSeason') {
      if (!access && !admin) fail('Profile access required.');
      var season = GCStatsV2.validateSeason(cmd.season,state.published.playerName);
      if(own(state.statRemovals[actor.uid] || {},season.key))fail('Cancel the removal request before importing this season.');
      var keys = Object.keys(state.seasons).filter(function(k){return !state.seasons[k].removed;}).concat(Object.keys(state.statsDrafts[actor.uid] || {}));
      if (keys.indexOf(season.key)<0 && keys.length>=20) fail('This profile has reached its 20 season limit.');
      if(cmd.base !== state.publishedVersion)fail('Published profile changed. Reload and re-import this season.');
      payload = {season:season,base:cmd.base};
    } else if (type === 'removeStagedSeason') {
      if ((!access && !admin) || !own(state.statsDrafts,actor.uid) || !own(state.statsDrafts[actor.uid],cmd.key)) fail('No imported draft season to remove.');
      payload = {key:cmd.key};
    } else if(type === 'stageStatRemoval') {
      if(!access && !admin)fail('Profile access required.');
      if(cmd.base!==state.publishedVersion)fail('Published profile changed. Reload before requesting removal.');
      if(own(state.statsDrafts[actor.uid] || {},cmd.key))fail('Remove the draft import before requesting removal of this published season.');
      payload={target:removalTarget(state,cmd.key),base:cmd.base};
    } else if(type === 'cancelStatRemoval') {
      if((!access && !admin) || !own(state.statRemovals[actor.uid] || {},cmd.key))fail('No removal request to cancel.');
      payload={key:cmd.key};
    } else if (type === 'save') {
      if (!access && !admin) fail('Profile access required.');
      if (cmd.base !== state.publishedVersion) fail('Published profile changed. Reload and reapply your draft.');
      payload = {fields:clean(cmd.fields), base:cmd.base};
    } else if (type === 'submit') {
      if (!access && !admin) fail('Profile access required.');
      if (!own(state.drafts, actor.uid)) fail('Save a draft first.');
      var draft = state.drafts[actor.uid];
      if (draft.base !== state.publishedVersion) fail('Published profile changed. Reload and reapply your draft.');
      if (Object.keys(state.submissions).some(function (id) { return state.submissions[id].uid === actor.uid && state.submissions[id].status === 'pending'; })) fail('A submission is already awaiting review.');
      if(Object.keys(state.statsDrafts[actor.uid] || {}).some(function(k){return state.statsDrafts[actor.uid][k].base !== state.publishedVersion;}))fail('Published profile changed. Remove and re-import the staged seasons before submitting.');
      if(Object.keys(state.statRemovals[actor.uid] || {}).some(function(k){return state.statRemovals[actor.uid][k].base !== state.publishedVersion;}))fail('Published profile changed. Cancel and reselect the statistics removals before submitting.');
      var labels=Object.values((state.statLabelDrafts || {})[actor.uid] || {}).filter(function(c){return !own(state.statRemovals[actor.uid] || {},c.key);});
      var videoChanges=Object.values((state.videoChanges || {})[actor.uid] || {});
      if(labels.concat(videoChanges).some(function(c){return c.base!==state.publishedVersion;}))fail('Published profile changed. Reload and reapply table edits.');
      if(videoChanges.some(function(c){return !state.videos[c.id] || ['removed','pending'].indexOf(state.videos[c.id].status)>=0;}))fail('A clip changed. Reload before submitting.');
      payload = {id:eventId,statLabels:copy(labels),videoChanges:copy(videoChanges), statRemovals:Object.keys(state.statRemovals[actor.uid] || {}).map(function(k){return copy(state.statRemovals[actor.uid][k]);}), fields:copy(draft.fields), base:draft.base, seasonStats:Object.keys(state.statsDrafts[actor.uid] || {}).map(function(k){return copy(state.statsDrafts[actor.uid][k]);}), videoIds:Object.keys(state.videos).filter(function(id){var v=state.videos[id];return v.uid === actor.uid && (v.status === 'draft' || v.status === 'rejected') && !videoChanges.some(function(c){return c.id===id && c.remove;});})};
      payload.summary={fields:Object.keys(draft.fields).filter(function(k){return String(state.published[k] || '')!==draft.fields[k];}),seasons:payload.seasonStats.length,statLabels:labels.length,statRemovals:payload.statRemovals.length,videoUploads:payload.videoIds.length,videoRenames:videoChanges.filter(function(c){return !c.remove;}).length,videoRemovals:videoChanges.filter(function(c){return c.remove;}).length};
    } else if (type === 'review') {
      if (!admin) fail('Staff access required.');
      if (!own(state.submissions, cmd.id) || state.submissions[cmd.id].status !== 'pending') fail('Submission is not pending.');
      if (cmd.decision !== 'approved' && cmd.decision !== 'rejected') fail('Invalid review decision.');
      if (cmd.decision === 'approved' && state.submissions[cmd.id].base !== state.publishedVersion) fail('Published profile changed. Reject this stale submission and request a fresh draft.');
      if (!String(cmd.note || '').trim() && cmd.decision === 'rejected') fail('Add a note explaining the requested corrections.');
      payload = {id:cmd.id, decision:cmd.decision, note:String(cmd.note || '').slice(0,2000)};
    } else fail('Unknown action.');
    return {playerId:state.playerId, slug:state.slug, version:state.version + 1,
      type:type, actorUid:actor.uid, at:now, payload:payload};
  }
  function view(s, actor) {
    var allowed = actor.admin || own(s.access, actor.uid);
    var result = {playerId:s.playerId, slug:s.slug, version:s.version,
      publishedVersion:s.publishedVersion, canEdit:!!allowed, isAdmin:actor.admin === true,
      claim:own(s.claims,actor.uid) ? s.claims[actor.uid] : null};
    if (allowed) {
      result.statLabels=copy((s.statLabelDrafts || {})[actor.uid] || {});
      result.videoChanges=copy((s.videoChanges || {})[actor.uid] || {});
      result.statRemovals=copy(s.statRemovals[actor.uid] || {});
      result.legacyStats=legacyStats(s);
      result.statsDrafts = copy(s.statsDrafts[actor.uid] || {});
      result.seasons = Object.keys(s.seasons).filter(function(k){return !s.seasons[k].removed;}).map(function(k){return copy(s.seasons[k]);});
      result.videos = Object.keys(s.videos).map(function(id){return copy(s.videos[id]);}).filter(function(v){return v.status !== 'removed' && (actor.admin || v.uid === actor.uid || v.status === 'approved');});
      result.published = copy(s.published);
      result.draft = own(s.drafts,actor.uid) ? copy(s.drafts[actor.uid]) : null;
      result.submissions = Object.keys(s.submissions).map(function (id) { return s.submissions[id]; })
        .filter(function (r) { return actor.admin || r.uid === actor.uid; });
    }
    if (actor.admin) { result.claims = copy(s.claims); result.access = copy(s.access); }
    return result;
  }
  function publicProfile(s) {
    var p = copy(s.published);
    if(s.hiddenLegacy.batting)['offSeason','avg','obp','slg','ops','hr','rbi'].forEach(function(k){p[k]='';});
    if(s.hiddenLegacy.pitching)['pitSeason','ip','k','bb','era','whip'].forEach(function(k){p[k]='';});
    p.legacyStatsLabels=copy(s.legacyLabels || {});
    p.seasonStats = Object.keys(s.seasons).filter(function(k){return !s.seasons[k].removed;}).map(function(k){return copy(s.seasons[k]);}).sort(function(a,b){return b.seasonEndDate.localeCompare(a.seasonEndDate) || a.key.localeCompare(b.key);});
    p.videos = Object.keys(s.videos).map(function(id){return s.videos[id];}).filter(function(v){return v.status === 'approved';}).map(function(v){return {driveFileId:v.driveFileId,title:v.title,category:v.category,caption:v.caption,sortOrder:v.sortOrder,status:'approved'};});
    // Private family information is never part of this model.
    if (p.contactDisplayOptIn !== 'Yes') { delete p.playerEmail; delete p.playerPhone; }
    return p;
  }
  return {fields:FIELDS, clean:clean, empty:empty, apply:apply, command:command, view:view, publicProfile:publicProfile};
}());
if (typeof module !== 'undefined') module.exports = ProfileV2Core;
