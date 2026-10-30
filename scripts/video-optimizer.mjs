export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
const ASSETS = [
  ['ffmpeg-core.js','text/javascript','67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3'],
  ['ffmpeg-core.wasm','application/wasm','9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7']
];
export function validateInput(file) {
  if (!file || !file.size || file.size > MAX_VIDEO_BYTES) throw new Error('Choose a video up to 25 MB.');
  if (!/\.(mp4|mov|webm)$/i.test(file.name || '')) throw new Error('Use an MP4, MOV, or WebM video.');
}
export function optimizationArgs(input) {
  return ['-i',input,'-map','0:v:0','-map','0:a:0?','-sn','-dn',
    '-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
    '-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p',
    '-profile:v','main','-level:v','4.0','-c:a','aac','-b:a','128k','-ac','2',
    '-map_metadata','-1','-movflags','+faststart','-y','web.mp4'];
}
export function validateOutput(bytes, probe) {
  const video=probe.streams?.[0];
  if (!bytes?.byteLength || bytes.byteLength > MAX_VIDEO_BYTES) throw new Error('The optimized clip exceeds 25 MB. Trim it to a shorter clip and try again. Nothing was uploaded.');
  if (video?.codec_name !== 'h264' || !video.width || !video.height || Math.max(video.width,video.height)>1280 || video.width%2 || video.height%2) throw new Error('The video could not be optimized for web playback. Nothing was uploaded.');
}
export async function optimizeVideo(file,{signal,onProgress=()=>{}}={}) {
  validateInput(file);
  if (signal?.aborted) throw new DOMException('Optimization canceled.','AbortError');
  if (!globalThis.Worker || !globalThis.WebAssembly || !globalThis.crypto?.subtle) throw new Error('This browser cannot optimize video. Try a current desktop browser. Nothing was uploaded.');
  const {FFmpeg}=await import('./vendor/ffmpeg-0.12.15/index.js');
  const ffmpeg=new FFmpeg(), urls=[];
  const controller=new AbortController();
  let canceled=false;
  const cancel=()=>{canceled=true;controller.abort();ffmpeg.terminate();};
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  const timeout=setTimeout(cancel,15*60*1000);
  try {
    onProgress({phase:'Downloading video optimizer (first use may take a moment)…'});
    // Only processor code is fetched. Video bytes remain on this device until
    // the existing authenticated upload sends the converted file to our backend.
    for(const [name,mime,expected] of ASSETS){
      const response=await fetch(CORE+name,{signal:controller.signal,credentials:'omit',cache:'force-cache'});
      if(!response.ok)throw new Error('processor');
      const bytes=await response.arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==expected)throw new Error('integrity');
      urls.push(URL.createObjectURL(new Blob([bytes],{type:mime})));
    }
    onProgress({phase:'Starting video optimizer…'});
    await ffmpeg.load({coreURL:urls[0],wasmURL:urls[1]},{signal:controller.signal});
    const input='input.'+file.name.split('.').pop().toLowerCase();
    await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
    ffmpeg.on('progress',({progress})=>{
      if(!canceled)onProgress({phase:'Optimizing video on this device…',percent:Math.min(99,Math.max(0,Math.floor(progress*100)))});
    });
    onProgress({phase:'Optimizing video on this device…',percent:0});
    const result=await ffmpeg.exec(optimizationArgs(input),10*60*1000);
    if(result!==0)throw new Error('conversion');
    onProgress({phase:'Checking optimized video…'});
    const checked=await ffmpeg.ffprobe(['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json','-o','probe.json','web.mp4']);
    if(checked!==0)throw new Error('probe');
    const data=await ffmpeg.readFile('web.mp4');
    const probe=JSON.parse(await ffmpeg.readFile('probe.json','utf8'));
    validateOutput(data,probe);
    if(canceled)throw new DOMException('Optimization canceled.','AbortError');
    const output=new File([data],file.name.replace(/\.(mp4|mov|webm)$/i,'')+'-web.mp4',{type:'video/mp4'});
    onProgress({phase:'Video optimized and ready to upload.',percent:100});
    return output;
  } catch(error) {
    if(canceled || signal?.aborted || error.name==='AbortError') throw new Error('Optimization canceled or timed out. Nothing was uploaded.');
    if(/Nothing was uploaded/.test(error.message))throw error;
    throw new Error('This device could not optimize the clip. Try a shorter clip or a current desktop browser. Nothing was uploaded.');
  } finally {
    clearTimeout(timeout);signal?.removeEventListener('abort',cancel);
    ffmpeg.terminate();urls.forEach(url=>URL.revokeObjectURL(url));
  }
}
