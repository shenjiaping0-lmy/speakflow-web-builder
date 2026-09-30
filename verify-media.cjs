const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=__dirname,assets=JSON.parse(fs.readFileSync(path.join(root,'audio-bundle.json'))),content=JSON.parse(fs.readFileSync(path.join(root,'content.json')));
let frame=null,latestAudio=null;
class FakeAudio{
  constructor(src){this.src=src;this.currentTime=0;this.readyState=1;latestAudio=this;}
  play(){this.onplaying?.();return Promise.resolve()}
  pause(){this.paused=true}
  removeAttribute(){} load(){} addEventListener(){}
}
const scope={Audio:FakeAudio,setTimeout,clearTimeout,requestAnimationFrame:fn=>(frame=fn,1),cancelAnimationFrame:()=>{frame=null},URL,Blob,ArrayBuffer,DataView};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'services.js'),'utf8'),scope);
const services=scope.SpeakFlowServices;let checks=0;
function check(label,fn){fn();checks++;console.log('PASS '+label)}
check('All 45 real audio assets align with every word of their source text',()=>{assert.equal(assets.length,45);for(const a of assets){const cues=services.alignCues(a.text,a.cues);assert(cues.length>0);assert(a.audio.startsWith('data:audio/mpeg;base64,'));for(let i=0;i<cues.length;i++){assert(cues[i].end>cues[i].start);if(i)assert(cues[i].start>=cues[i-1].start)}}});
check('Every dialogue line and teaching contrast has real audio',()=>{assert.equal(content.dialogues.length,8);assert.equal(content.dialogues.flatMap(d=>d.lines).length,32);for(const text of [...content.dialogues.flatMap(d=>d.lines.map(l=>l.text)),...content.lessons.flatMap(l=>[l.apart,l.flow])])assert(assets.some(a=>a.text===text),text)});
check('Each lesson has practical steps, transfer, and a valid understanding check',()=>{assert.equal(content.lessons.length,6);for(const l of content.lessons){assert.equal(l.steps.length,3);assert(l.options[l.answer]);assert(l.transfer.length>=2)}});
check('Word lookup follows media time including initial silence',()=>{const cues=[{index:0,start:.1,end:.3},{index:1,start:.4,end:.8}];assert.equal(services.cueAtTime(cues,0),-1);assert.equal(services.cueAtTime(cues,.25),0);assert.equal(services.cueAtTime(cues,.7),1)});
check('Invalid audio alignment is rejected instead of showing incorrect timing',()=>assert.throws(()=>services.alignCues('hello world',[{text:'different',start:0,end:1}])));
// Synthetic service fixtures are tests only, never bundled into the product.
const fixture={RecognitionStatus:'Success',NBest:[{Display:'Pick it up.',PronunciationAssessment:{PronScore:78,AccuracyScore:72,FluencyScore:83,CompletenessScore:100},Words:[{Word:'pick',Offset:2000000,Duration:3000000,PronunciationAssessment:{AccuracyScore:58,ErrorType:'Mispronunciation'},Phonemes:[{Phoneme:'p',PronunciationAssessment:{AccuracyScore:55}}]}]}]};
check('AI metrics come directly from service response; missing metrics stay null',()=>{const r=services.normalizeAssessment(fixture);assert.equal(r.overall,78);assert.equal(r.prosody,null);assert.equal(r.words[0].start,.2);assert.equal(r.words[0].duration,.3);assert.equal(r.words[0].phonemes[0].accuracy,55);assert(services.feedbackForAssessment(r).text.includes('pick'))});
check('No speech and recognition-only responses never produce an AI score',()=>{assert.throws(()=>services.normalizeAssessment({RecognitionStatus:'NoMatch'}));assert.throws(()=>services.normalizeAssessment({RecognitionStatus:'Success',NBest:[{Display:'hello'}]}))});
check('Out-of-range scores cannot reach the UI',()=>{const bad=structuredClone(fixture);bad.NBest[0].PronunciationAssessment.PronScore=104;assert.equal(services.normalizeAssessment(bad).overall,null)});
check('Assessment credentials and endpoint validation reject unsafe input',()=>{assert.throws(()=>new services.AzureAssessmentProvider({subscriptionKey:'',region:'eastus'}));assert.throws(()=>new services.AzureAssessmentProvider({subscriptionKey:'test-key-1234567890',region:'evil.example/path'}));assert.throws(()=>new services.EndpointAssessmentProvider({url:'http://example.com/assess'}));assert.throws(()=>new services.EndpointAssessmentProvider({url:'https://user:secret@example.com'}))});
check('WAV encoder produces real mono 16 kHz PCM header and sample data',()=>{const b=services.encodeWav(new Float32Array([0,1,-1]));const v=new DataView(b);assert.equal(b.byteLength,50);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint16(22,true),1);assert.equal(v.getInt16(46,true),32767);assert.equal(v.getInt16(48,true),-32768)});
(async()=>{
  const fallback={cancel(){},speak(){throw new Error('Unexpected live-voice fallback')}};
  const provider=new services.StudioSpeechProvider(fallback,assets);
  for(const rate of [.72,1,1.2]){
    const indices=[];const asset=assets.find(a=>a.text==='What are you going to do this weekend?');
    const promise=provider.speak({text:asset.text,voiceURI:'studio',rate,onWord:i=>indices.push(i)});
    assert.equal(latestAudio.playbackRate,rate);
    for(let i=0;i<asset.cues.length;i++){latestAudio.currentTime=asset.cues[i].start+.01;frame();assert.equal(indices.at(-1),i)}
    latestAudio.onended();assert.equal((await promise).status,'ended');
    checks++;console.log('PASS Media-clock karaoke stays on each actual word at '+rate+'×');
  }
  const sub=provider.find("I'm going to meet a friend", "When I finish work, I'm going to meet a friend for dinner.");assert(sub.start>0);assert(sub.end<Infinity);assert.equal(sub.cues[0].index,0);
  const promise=provider.speak({text:'Pick it up.',voiceURI:'studio'});provider.cancel();assert.equal((await promise).status,'cancelled');assert.equal(frame,null);checks++;console.log('PASS Chunk clipping and cancellation respect the media timeline');
  console.log('\n'+checks+' audio/content/assessment checks passed. Azure live scoring awaits a real user-configured key.');
})().catch(e=>{console.error(e);process.exitCode=1});
