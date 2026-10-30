import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,parseRange} from '../server.mjs';
const FILE='published_clip_123', SLUG='leah-taylor-31';
const bytes=Buffer.from('0123456789');
async function setup(t,{approved=true,metadata={},mediaStatus,origin}={}){
 const calls=[];
 const server=createServer({apiKey:'test-only-key',fetchImpl:async(url,opts={})=>{
  const u=new URL(url);calls.push({u,opts});
  if(u.hostname==='script.google.com')return Response.json({ok:true,player:{videos:approved?[{status:'approved',driveFileId:FILE}]:[]}});
  assert.equal(u.hostname,'www.googleapis.com');assert.equal(opts.headers['X-Goog-Api-Key'],'test-only-key');
  if(u.searchParams.get('alt')!=='media')return Response.json({id:FILE,size:'10',mimeType:'video/mp4',...metadata});
  const range=opts.headers.Range?parseRange(opts.headers.Range,10):null;
  const data=range?bytes.subarray(range.start,range.end+1):bytes;
  return new Response(data,{status:mediaStatus||(range?206:200),headers:{'Content-Type':'video/mp4','Content-Length':String(data.length),...(range?{'Content-Range':`bytes ${range.start}-${range.end}/10`}:{})}});
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 return {calls,url:`http://127.0.0.1:${server.address().port}/v1/video/${SLUG}/${FILE}`};
}
test('byte-range parser covers open, bounded, suffix and malformed ranges',()=>{
 assert.deepEqual(parseRange('bytes=2-4',10),{start:2,end:4,length:3});
 assert.deepEqual(parseRange('bytes=8-',10),{start:8,end:9,length:2});
 assert.deepEqual(parseRange('bytes=-3',10),{start:7,end:9,length:3});
 assert.deepEqual(parseRange('bytes=0-999',10),{start:0,end:9,length:10});
 for(const value of ['bytes=10-','bytes=4-2','bytes=0-1,4-5','bytes=-0','bytes=-','items=0-1','bytes=999999999999999999-'])assert.throws(()=>parseRange(value,10));
});
test('only approved profile clips stream; no generic Drive or URL proxy',async t=>{
 const {url,calls}=await setup(t,{approved:false});const r=await fetch(url);assert.equal(r.status,404);assert.equal(calls.length,1);
 assert.equal((await fetch(url+'?url=https://evil.example')).status,404);
 assert.equal((await fetch(url.replace(FILE,'some_other_file_123'))).status,404);
 assert.equal(calls.filter(c=>c.u.hostname==='www.googleapis.com').length,0);
});
test('bounded ranges return actual byte subsets and CORS headers without secrets',async t=>{
 const {url}=await setup(t);const r=await fetch(url,{headers:{Range:'bytes=2-5',Origin:'https://njhitz.org'}});
 assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');
 assert.equal(r.headers.get('access-control-allow-origin'),'https://njhitz.org');assert.equal(r.headers.get('x-goog-api-key'),null);
});
test('full GET, suffix seek and HEAD behave consistently',async t=>{
 const {url,calls}=await setup(t);let r=await fetch(url);assert.equal(r.status,200);assert.equal(await r.text(),'0123456789');
 r=await fetch(url,{headers:{Range:'bytes=-2'}});assert.equal(r.status,206);assert.equal(await r.text(),'89');
 const before=calls.filter(c=>c.u.searchParams.get('alt')==='media').length;
 r=await fetch(url,{method:'HEAD',headers:{Range:'bytes=1-'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-length'),'9');assert.equal(await r.text(),'');assert.equal(calls.filter(c=>c.u.searchParams.get('alt')==='media').length,before);
});
test('invalid ranges return 416 without streaming',async t=>{
 const {url,calls}=await setup(t);const r=await fetch(url,{headers:{Range:'bytes=10-'}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');assert(!calls.some(c=>c.u.searchParams.get('alt')==='media'));
});
test('rejects unknown origins, private-type content, oversize and non-downloadable files',async t=>{
 for(const metadata of [{mimeType:'text/html'},{size:'26214401'},{capabilities:{canDownload:false}}]){
  const {url}=await setup(t,{metadata});assert.equal((await fetch(url)).status,415);
 }
 const {url,calls}=await setup(t);assert.equal((await fetch(url,{headers:{Origin:'https://evil.example'}})).status,403);assert.equal(calls.length,0);
});
test('upstream ignoring Range fails closed instead of serving an incorrect 206',async t=>{
 const {url}=await setup(t,{mediaStatus:200});assert.equal((await fetch(url,{headers:{Range:'bytes=2-4'}})).status,502);
});
test('missing configuration does not expose source data',async t=>{
 const server=createServer({apiKey:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;assert.equal((await fetch(url+'/healthz')).status,503);assert.equal((await fetch(url+`/v1/video/${SLUG}/${FILE}`)).status,503);
});
