const test=require('node:test');const assert=require('node:assert/strict');
const optimizer=()=>import('../scripts/video-optimizer.mjs');
test('optimizer rejects unsupported and over-limit inputs before downloading code',async()=>{
 const {validateInput,MAX_VIDEO_BYTES}=await optimizer();
 for(const f of [null,{name:'clip.mp4',size:0},{name:'clip.mov',size:MAX_VIDEO_BYTES+1},{name:'clip.txt',size:100}])assert.throws(()=>validateInput(f));
 validateInput({name:'CLIP.MOV',size:MAX_VIDEO_BYTES});
});
test('encoding targets a real H.264/AAC fast-start MP4, preserves optional audio and strips source metadata',async()=>{
 const {optimizationArgs}=await optimizer();const a=optimizationArgs('input.mov');
 assert.equal(a[a.indexOf('-c:v')+1],'libx264');assert.equal(a[a.indexOf('-c:a')+1],'aac');assert.equal(a[a.indexOf('-pix_fmt')+1],'yuv420p');assert.equal(a[a.indexOf('-movflags')+1],'+faststart');assert(a.includes('0:a:0?'));assert.equal(a.at(-1),'web.mp4');assert.match(a[a.indexOf('-vf')+1],/force_divisible_by=2/);assert.equal(a[a.indexOf('-map_metadata')+1],'-1');
});
test('output must actually contain H.264 within dimensions and size limits',async()=>{
 const {validateOutput,MAX_VIDEO_BYTES}=await optimizer();const bytes={byteLength:100};const good={streams:[{codec_name:'h264',width:1280,height:720}]};
 validateOutput(bytes,good);assert.throws(()=>validateOutput({byteLength:MAX_VIDEO_BYTES+1},good));
 for(const v of [{codec_name:'hevc',width:1280,height:720},{codec_name:'h264',width:1920,height:1080},{codec_name:'h264',width:0,height:0}])assert.throws(()=>validateOutput(bytes,{streams:[v]}));
});
test('canceled optimization never initializes conversion or uploads content',async()=>{
 const {optimizeVideo}=await optimizer();const controller=new AbortController();controller.abort();await assert.rejects(optimizeVideo({name:'clip.mp4',size:10},{signal:controller.signal}),{name:'AbortError'});
});
