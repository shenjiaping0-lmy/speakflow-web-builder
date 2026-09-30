/* Media-clock playback and real, configurable pronunciation assessment. */
(() => {
'use strict';
const words=text=>[...text.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*[.,!?;:]*/g)].map(m=>({text:m[0],key:m[0].replace(/[^A-Za-z0-9']/g,'').toLowerCase(),start:m.index,end:m.index+m[0].length}));
const key=text=>text.trim().replace(/’/g,"'").replace(/\s+/g,' ').toLowerCase();
function alignCues(text,cues){
  const tokens=words(text),result=[];let index=0,partial='';
  for(const cue of cues){
    const normalized=String(cue.text).replace(/’/g,"'").replace(/[^A-Za-z0-9']/g,'').toLowerCase();
    if(!normalized)continue;
    if(index>=tokens.length)throw new Error('Audio contains extra words.');
    const target=tokens[index].key;
    if(!partial)result.push({index,start:cue.start,end:cue.end});
    else result[result.length-1].end=cue.end;
    partial+=normalized;
    // Some engines split contractions or hyphenated words across boundaries.
    if(partial.replace(/'/g,'')===target.replace(/'/g,'')){index++;partial='';}
    else if(!target.replace(/'/g,'').startsWith(partial.replace(/'/g,'')))throw new Error('Audio word timing does not match the sentence.');
  }
  if(index!==tokens.length||partial)throw new Error('Audio word timing is incomplete.');
  return result;
}
function cueAtTime(cues,time){let low=0,high=cues.length-1,result=-1;while(low<=high){const mid=(low+high)>>1;if(cues[mid].start<=time){result=mid;low=mid+1}else high=mid-1;}return result<0?-1:cues[result].index;}
class StudioSpeechProvider{
  constructor(fallback,assets){this.fallback=fallback;this.assets=assets.map(asset=>{try{return {...asset,aligned:alignCues(asset.text,asset.cues)}}catch{return null}}).filter(Boolean);this.active=null;}
  find(text,referenceText=''){
    const exact=this.assets.find(a=>key(a.text)===key(text));if(exact)return {asset:exact,start:0,end:Infinity,cues:exact.aligned};
    const target=words(text);if(!target.length)return null;
    const candidates=[...this.assets].sort((a,b)=>Number(key(b.text)===key(referenceText))-Number(key(a.text)===key(referenceText)));
    for(const asset of candidates){
      const source=words(asset.text);let first=-1;
      for(let i=0;i<=source.length-target.length;i++)if(target.every((w,j)=>w.key===source[i+j].key)){first=i;break;}
      if(first<0)continue;
      const from=asset.aligned[first],last=asset.aligned[first+target.length-1],next=asset.aligned[first+target.length];
      return {asset,start:Math.max(0,from.start-.025),end:Math.min(next?.start??Infinity,last.end+.09),cues:asset.aligned.slice(first,first+target.length).map(c=>({...c,index:c.index-first}))};
    }
    return null;
  }
  cancel(){if(this.active)this.active.finish('cancelled');this.fallback.cancel();}
  speak(options){
    this.cancel();const selection=options.voiceURI==='studio'?this.find(options.text,options.referenceText):null;
    if(!selection)return this.fallback.speak({...options,voiceURI:options.voiceURI==='studio'?'':options.voiceURI});
    const {asset,start,end,cues}=selection,{onStart=()=>{},onWord=()=>{},onTiming=()=>{}}=options;
    return new Promise((resolve,reject)=>{
      const audio=new Audio(asset.audio);audio.preload='auto';audio.playbackRate=options.rate||1;audio.preservesPitch=true;
      let frame=0,closed=false,last=-2,began=false;
      const watchdog=setTimeout(()=>finish('error',new Error('The studio audio could not start. Try again.')),12000);
      const finish=(status,error)=>{if(closed)return;closed=true;clearTimeout(watchdog);cancelAnimationFrame(frame);audio.pause();audio.removeAttribute('src');audio.load();if(this.active?.audio===audio)this.active=null;error?reject(error):resolve({status});};
      this.active={audio,finish};
      const tick=()=>{if(closed)return;const time=audio.currentTime;if(time>=end){finish('ended');return;}const index=cueAtTime(cues,time);if(index!==last){last=index;onWord(index);}frame=requestAnimationFrame(tick);};
      audio.onplaying=()=>{if(closed||began)return;began=true;clearTimeout(watchdog);onStart();onTiming('media');tick();};
      audio.onended=()=>finish('ended');audio.onerror=()=>finish('error',new Error('Studio audio could not play in this browser. Choose a device voice.'));
      const begin=()=>{if(closed)return;if(start>0)audio.currentTime=start;audio.play().catch(()=>finish('error',new Error('Press play again to allow audio playback.')));};
      if(audio.readyState>=1)begin();else audio.addEventListener('loadedmetadata',begin,{once:true});
    });
  }
}

function scoreValue(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?Math.round(value):null;}
function normalizeAssessment(raw){
  if(raw.RecognitionStatus!=='Success'||!raw.NBest?.length)throw new Error('No clear speech was recognized. Move closer to the microphone and record again.');
  const best=raw.NBest[0],scores=best.PronunciationAssessment||best;
  const output={provider:'Azure Speech',transcript:String(best.Display||raw.DisplayText||''),overall:scoreValue(scores.PronScore),accuracy:scoreValue(scores.AccuracyScore),fluency:scoreValue(scores.FluencyScore),completeness:scoreValue(scores.CompletenessScore),prosody:scoreValue(scores.ProsodyScore),words:[]};
  if(output.overall===null&&output.accuracy===null)throw new Error('The service returned recognition without pronunciation scores. Check the assessment configuration.');
  output.words=(best.Words||[]).map(w=>{const p=w.PronunciationAssessment||w;return {word:String(w.Word||''),accuracy:scoreValue(p.AccuracyScore),error:String(p.ErrorType||'None'),start:typeof w.Offset==='number'?w.Offset/1e7:null,duration:typeof w.Duration==='number'?w.Duration/1e7:null,phonemes:(w.Phonemes||[]).map(ph=>({phoneme:String(ph.Phoneme||''),accuracy:scoreValue(ph.PronunciationAssessment?.AccuracyScore??ph.AccuracyScore)}))};});
  return output;
}
function feedbackForAssessment(result){
  const issues=result.words.filter(w=>w.error!=='None'||(w.accuracy!==null&&w.accuracy<75)).sort((a,b)=>(a.error==='Omission'?-1:0)-(b.error==='Omission'?-1:0)||(a.accuracy??101)-(b.accuracy??101));
  if(issues.length){const w=issues[0];if(w.error==='Omission')return {word:w.word,text:'AI 标记了可能漏读的 “'+w.word+'”。先听示范，再把它放回整句重练。',kind:'word'};if(w.error==='Insertion')return {word:w.word,text:'AI 检测到参考句以外的 “'+w.word+'”。跟着目标句再试一次，不要额外加词。',kind:'word'};return {word:w.word,text:'先练 “'+w.word+'”：它的发音准确度较低。点下面的词听示范，再练整句。',kind:'word'};}
  if(result.prosody!==null&&result.prosody<75)return {word:null,text:'这次优先练节奏：把内容词说突出，让小词更轻，在意群之间停顿。韵律分综合了重音、语调和节奏，不是单独的连读分。',kind:'rhythm'};
  if(result.fluency!==null&&result.fluency<75)return {word:null,text:'这次优先减少词内和短语内的停顿。先慢速跟读一个语块，再回到整句。',kind:'fluency'};
  return {word:null,text:'这次读得比较完整。再录一遍，试着保持清楚的发音，同时让语块之间的过渡更自然。',kind:'repeat'};
}
function encodeWav(samples,sampleRate=16000){
  const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer),str=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const sample=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,sample<0?sample*0x8000:sample*0x7fff,true);}return buffer;
}
async function recordingToWav(blob){
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw new Error('This browser cannot prepare the recording for AI. Try Chrome, Edge, or Safari.');
  const context=new Context();let decoded;try{decoded=await context.decodeAudioData(await blob.arrayBuffer())}catch{throw new Error('This audio format could not be decoded. Make a new recording or try another browser.')}finally{await context.close()}
  if(decoded.duration>30.5)throw new Error('Keep each AI assessment under 30 seconds. Practise one dialogue line at a time.');
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0))],{type:'audio/wav'});
}
let sdkPromise;
function loadSpeechSDK(){
  if(globalThis.SpeechSDK)return Promise.resolve(globalThis.SpeechSDK);
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://aka.ms/csspeech/jsbrowserpackageraw';script.async=true;
    const fail=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(new Error('The AI speech library could not load. Check your connection and try again.'));};
    const timer=setTimeout(fail,20000);script.onload=()=>{clearTimeout(timer);globalThis.SpeechSDK?resolve(globalThis.SpeechSDK):fail()};script.onerror=fail;document.head.append(script);
  });return sdkPromise;
}
class AzureAssessmentProvider{
  #key;#region;
  constructor({subscriptionKey,region}){if(typeof subscriptionKey!=='string'||subscriptionKey.trim().length<16)throw new Error('Enter your Azure Speech subscription key.');if(!/^[a-z][a-z0-9]{2,35}$/.test(region))throw new Error('Use a region code, such as eastasia or eastus.');this.#key=subscriptionKey.trim();this.#region=region;}
  async score({blob,text}){
    const [sdk,wav]=await Promise.all([loadSpeechSDK(),recordingToWav(blob)]);
    sdk.Recognizer.enableTelemetry(false);
    const speech=sdk.SpeechConfig.fromSubscription(this.#key,this.#region);speech.speechRecognitionLanguage='en-US';speech.outputFormat=sdk.OutputFormat.Detailed;
    speech.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,'5000');
    const audio=sdk.AudioConfig.fromWavFileInput(new File([wav],'attempt.wav',{type:'audio/wav'}));
    const recognizer=new sdk.SpeechRecognizer(speech,audio);
    const config=new sdk.PronunciationAssessmentConfig(text,sdk.PronunciationAssessmentGradingSystem.HundredMark,sdk.PronunciationAssessmentGranularity.Phoneme,true);
    config.phonemeAlphabet='IPA';config.enableProsodyAssessment=true;config.applyTo(recognizer);
    return new Promise((resolve,reject)=>{
      let done=false;const finish=(value,error)=>{if(done)return;done=true;clearTimeout(timer);recognizer.close();audio.close();error?reject(error):resolve(value)};
      const timer=setTimeout(()=>finish(null,new Error('AI assessment timed out. Check your connection and retry.')),55000);
      recognizer.recognizeOnceAsync(result=>{
        if(result.reason===sdk.ResultReason.Canceled){const details=sdk.CancellationDetails.fromResult(result);const auth=details.ErrorCode===sdk.CancellationErrorCode.AuthenticationFailure;finish(null,new Error(auth?'The service rejected the key or region. Check AI settings.':'The speech service could not assess this recording. Check the key, region, connection, and service quota.'));return;}
        try{const raw=JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult));finish(normalizeAssessment(raw))}catch(e){finish(null,e)}
      },()=>finish(null,new Error('The speech service could not connect. Check the key, region, and network.')));
    });
  }
}
class EndpointAssessmentProvider{
  #url;#token;
  constructor({url,token=''}){const parsed=new URL(url);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw new Error('Use an HTTPS endpoint or a localhost endpoint.');if(parsed.username||parsed.password)throw new Error('Put credentials in the token field, not in the URL.');this.#url=parsed.href;this.#token=token;}
  async score({blob,text}){
    const wav=await recordingToWav(blob),body=new FormData();body.append('audio',wav,'attempt.wav');body.append('referenceText',text);body.append('language','en-US');
    const response=await fetch(this.#url,{method:'POST',headers:this.#token?{Authorization:'Bearer '+this.#token}:{},body,signal:AbortSignal.timeout(55000),credentials:'omit'});
    if(!response.ok)throw new Error('The scoring endpoint returned '+response.status+'. Check AI settings and try again.');
    const raw=await response.json();return normalizeAssessment(raw);
  }
}
globalThis.SpeakFlowServices={StudioSpeechProvider,AzureAssessmentProvider,EndpointAssessmentProvider,normalizeAssessment,feedbackForAssessment,alignCues,cueAtTime,encodeWav};
})();
