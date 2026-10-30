// Read a dedicated Drive API key from stdin; never print it or write it to disk.
import {readFileSync} from 'node:fs';
const key=readFileSync(0,'utf8').trim();
const slug=process.argv[2]||'leah-taylor-31';
const id=process.argv[3]||'1AT0Hf3J16sM2EmcqUbyMsPU1vET1XNmm';
const endpoint='https://script.google.com/macros/s/AKfycbz3eGOVLqW8lEYYfpn4jvDnoARyQr6C_9MdNmtawZN5trsi1zefQa_9fVAs0u6JoAmE/exec';
function fail(message){console.error('STOP: '+message);process.exit(1);}
async function run(){
 if(!key)fail('No API key received. Check Secret Manager access.');
 if(!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)||!/^[\w-]{10,200}$/.test(id))fail('Invalid player or file ID.');
 const profile=await fetch(endpoint+'?slug='+encodeURIComponent(slug),{signal:AbortSignal.timeout(30000)});
 if(!profile.ok)fail('Profile lookup returned HTTP '+profile.status);
 const data=await profile.json();
 if(!data.ok||!data.player?.videos?.some(v=>v.status==='approved'&&v.driveFileId===id))fail('This clip is not currently published as approved. Choose a currently approved clip.');
 const url=new URL('https://www.googleapis.com/drive/v3/files/'+id);
 url.searchParams.set('fields','id,mimeType,size,capabilities(canDownload)');
 const headers={'X-Goog-Api-Key':key,'Accept-Encoding':'identity'};
 const metadata=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
 if(!metadata.ok)fail('Drive metadata returned HTTP '+metadata.status+'. Check Drive API enablement, key restrictions and public file access.');
 const file=await metadata.json();const size=Number(file.size);
 if(!['video/mp4','video/webm','video/quicktime'].includes(file.mimeType)||size<1024||size>25*1024*1024||file.capabilities?.canDownload===false)fail('Unsupported file type, size, or download restriction.');
 console.log('PASS: clip is approved; Drive metadata is readable ('+file.mimeType+', '+size+' bytes).');
 url.search='?alt=media';headers.Range='bytes=0-1023';
 const media=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
 if(media.status!==206){await media.body?.cancel();fail('Drive media returned HTTP '+media.status+'; expected 206 Partial Content. Do not activate the custom player.');}
 if(media.headers.get('content-range')!==`bytes 0-1023/${size}`){await media.body?.cancel();fail('Unexpected Content-Range.');}
 if(Number(media.headers.get('content-length'))!==1024){await media.body?.cancel();fail('Unexpected Content-Length.');}
 if((await media.arrayBuffer()).byteLength!==1024)fail('Unexpected response body size.');
 console.log('PASS: Drive returned exactly 1024 video bytes with correct range headers. Ready for Cloud Run deployment.');
}
run().catch(()=>fail('Network or API response error. No credentials were printed. Retry once or share only this message.'));
