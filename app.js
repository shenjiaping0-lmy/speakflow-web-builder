/* SpeakFlow: dependency-free browser MVP. Providers below are replaceable. */
(() => {
'use strict';

// 1. Pure analysis: suggested neutral stress, conservative phrase patterns.
const EXAMPLES = [
  'What are you going to do this weekend?',
  "When I finish work, I'm going to meet a friend for dinner.",
  'Could I have a cup of coffee, please?',
  'Did you get a chance to talk to him last night?'
];
const CONTENT=globalThis.SPEAKFLOW_CONTENT;
const {StudioSpeechProvider,AzureAssessmentProvider,EndpointAssessmentProvider,feedbackForAssessment}=globalThis.SpeakFlowServices||{};
const FUNCTION_WORDS = new Set(('a an the this that these those i you he she it we they me him her us them my your his its our their mine yours myself yourself what which who whom whose where when why how am is are was were be been being do does did have has had can could may might must shall should will would to of for at in on by from with as into onto over under through about before after between during without and or but nor so yet if then than because although though while until unless whether just some any each every either neither all both there here').split(' '));
const NEGATIVES = new Set(["not","never","no","can't","cannot","won't","don't","doesn't","didn't","isn't","aren't","wasn't","weren't","haven't","hasn't","hadn't","wouldn't","shouldn't","couldn't","mustn't"]);
const LEXICAL_NEXT = new Set(('do go get give take make meet see watch buy eat drink try help call visit start finish study work play leave stay read write tell talk say bring find ask listen learn look use run have be enjoy cook clean travel spend sleep walk come pick put turn keep send book order join').split(' '));
const AUXILIARIES = new Set('am is are was were do does did have has had can could will would should must'.split(' '));
const CONTRACTIONS = {"there's":'there is / there has',"that's":'that is / that has',"here's":'here is',"what's":'what is / what has',"i'm":'I am',"you're":'you are',"we're":'we are',"they're":'they are',"he's":'he is / he has',"she's":'she is / she has',"it's":'it is / it has',"i'll":'I will',"you'll":'you will',"we'll":'we will',"they'll":'they will',"i've":'I have',"you've":'you have',"we've":'we have',"they've":'they have',"i'd":'I would / I had',"you'd":'you would / you had',"can't":'cannot',"won't":'will not',"don't":'do not',"doesn't":'does not',"didn't":'did not',"isn't":'is not',"aren't":'are not',"wasn't":'was not',"weren't":'were not',"couldn't":'could not',"shouldn't":'should not',"wouldn't":'would not',"haven't":'have not',"hasn't":'has not',"hadn't":'had not',"let's":'let us'};
const WEAK = {a:'/ə/',an:'/ən/',and:'/ən/ or /ənd/',of:'/əv/',to:'/tə/',for:'/fə/ or /fər/',can:'/kən/',are:'/ə/ or /ər/'};
function tokenize(text) {
  return [...text.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*[.,!?;:]*/g)].map((m,i)=>({id:i,text:m[0],key:m[0].replace(/[.,!?;:]+$/,'').replace(/’/g,"'").toLowerCase(),start:m.index,end:m.index+m[0].length}));
}
function validateSentence(value) {
  if(typeof value!=='string') throw new Error('Please type an English sentence first.');
  const text=value.replace(/\s+/g,' ').trim();
  if(!text) throw new Error('Add a sentence first. Try “What are you going to do this weekend?”');
  if(text.length>360) throw new Error('Keep it under 360 characters. One or two sentences work best.');
  if(!/[A-Za-z]/.test(text)) throw new Error('Try a sentence in English so we can find its rhythm.');
  if(/[^\x00-\x7F\u2010-\u2027\u00a0-\u00bf]/.test(text)) throw new Error('Use English text for this practice. Remove other scripts or emoji and try again.');
  if(tokenize(text).length>65) throw new Error('Try a shorter passage: up to 65 words at a time.');
  return text;
}
function buildGroups(text,tokens) {
  const groups=[];let start=0;
  const normalized=text.toLowerCase().replace(/[’]/g,"'").replace(/[.,!?]/g,'');
  if(normalized===EXAMPLES[1].toLowerCase().replace(/[.,!?]/g,'')) {
    return [[0,3],[4,9],[10,11]].map(([a,b],id)=>({id,start:a,end:b,text:text.slice(tokens[a].start,tokens[b].end)}));
  }
  const markers=new Set(['because','although','but','while','unless','when','if','so']);
  for(let i=0;i<tokens.length;i++){
    const punct=/[,.!?;:]$/.test(tokens[i].text);
    const next=tokens[i+1];
    const clause=next&&markers.has(next.key)&&i-start>=3&&tokens.length-i>3;
    const opener=next&&['i',"i'm",'we',"we're",'you',"you're",'he','she','they',"they're"].includes(next.key)&&i-start>=3&&['when','if','after','before','although','while'].includes(tokens[start].key);
    const optionalPhrase=next&&i-start>=8&&['for','with','after','before'].includes(next.key)&&tokens.length-i>2;
    if(punct||clause||opener||optionalPhrase||i===tokens.length-1){
      groups.push({id:groups.length,start,end:i,text:text.slice(tokens[start].start,tokens[i].end)});start=i+1;
    }
  }
  return groups;
}
class LocalPatternAnalyzer {
  async analyze(value){return this.analyzeSync(value)}
  analyzeSync(value){
    const text=validateSentence(value),tokens=tokenize(text),features=[],replacements=[];
    tokens.forEach((t,i)=>{
      t.functionWord=FUNCTION_WORDS.has(t.key)||Boolean(CONTRACTIONS[t.key]&&!NEGATIVES.has(t.key));
      t.stressed=!t.functionWord||NEGATIVES.has(t.key);
      if(['do','does','did','have','has','had'].includes(t.key)&&(!tokens[i+1]||['this','that','a','an','the','my','your','our'].includes(tokens[i+1].key))) t.stressed=true;
      if(i===tokens.length-1&&AUXILIARIES.has(t.key))t.stressed=true;
    });
    const add=(type,from,to,explanation,a,b,replace=true)=>{
      features.push({type,from,to,explanation,start:a,end:b});
      if(a!=null&&b!=null&&b>a){for(let k=a;k<b;k++)tokens[k].linked=true;}
      if(replace&&to&&a!=null&&b!=null)replacements.push({start:tokens[a].start,end:tokens[b].end,to:to+(tokens[b].text.match(/[.,!?;:]+$/)?.[0]||'')});
    };
    const keys=tokens.map(t=>t.key);
    const phraseAt=(i,phrase)=>phrase.every((w,j)=>keys[i+j]===w)&&!tokens.slice(i,i+phrase.length-1).some(t=>/[,.!?;:]$/.test(t.text));
    for(let i=0;i<tokens.length;i++){
      const t=tokens[i];
      if(phraseAt(i,['what','are','you'])) add('Reduction','What are you','whaddaya','In very casual speech, these words can compress into something like “whaddaya”. Listen for the whole phrase; this is not standard spelling.',i,i+2);
      if(phraseAt(i,['going','to'])&&LEXICAL_NEXT.has(keys[i+2])){
        add('Reduction','going to','gonna','Before a verb, “going to” can sound like “gonna” in casual speech. Keep “going to” in standard writing. This reduction does not apply to “going to school”.',i,i+1);
        tokens[i].stressed=false;
      }
      if(phraseAt(i,['want','to'])&&LEXICAL_NEXT.has(keys[i+2])) add('Reduction','want to','wanna','In casual speech, “want to” before a verb can sound like “wanna”. It is a listening cue, not formal spelling.',i,i+1);
      if(phraseAt(i,['did','you'])) add('Assimilation','did you','didja','The /d/ and /j/ sounds may blend into /dʒ/, as in “jam”. Many speakers do this in connected speech.',i,i+1);
      if(phraseAt(i,['would','you'])) add('Assimilation','would you','wouldja','The /d/ at the end of “would” and the /j/ in “you” may blend into /dʒ/.',i,i+1);
      if(phraseAt(i,['could','you'])) add('Assimilation','could you','couldja','The /d/ and /j/ sounds can merge into /dʒ/ when the words flow together.',i,i+1);
      if(phraseAt(i,['last','night'])) add('Elision','last night','las(t) night','The /t/ between /s/ and /n/ may be left out. Parentheses mark a sound you might not hear; dropping it is optional.',i,i+1);
      if(phraseAt(i,['next','week'])) add('Elision','next week','nex(t) week','The /t/ in this consonant cluster may disappear. It is fine to keep it when speaking clearly.',i,i+1);
      if(phraseAt(i,['must','be'])) add('Elision','must be','mus(t) be','The /t/ may disappear between the surrounding consonants. This varies with speaker and speed.',i,i+1);
      if(phraseAt(i,['tell','him'])||phraseAt(i,['tell','her'])||phraseAt(i,['to','him'])){
        const last=keys[i+1];add('Dropped sound',t.text+' '+last,t.text+' (h)'+last.slice(1),'The /h/ in an unstressed pronoun can disappear inside a phrase. Keep it when the pronoun is stressed.',i,i+1);
      }
      // Known sound pairs avoid inferring pronunciation from spelling alone.
      const linkPairs=[['pick','it'],['it','up'],['get','a'],['get','on'],['get','out'],['an','apple'],['have','a'],['cup','of'],['meet','a'],['turn','off'],['turn','on'],['take','it'],['put','it'],['put','on'],['not','at'],['at','all'],['look','at']];
      if(linkPairs.some(p=>phraseAt(i,p)))add('Linking',tokens[i].text+' '+tokens[i+1].text,tokens[i].text+'‿'+tokens[i+1].text,'Carry the final consonant into the next vowel. The small bridge means “keep the sounds connected”, not a new spelling.',i,i+1,false);
      if(CONTRACTIONS[t.key])add('Contraction',t.text,CONTRACTIONS[t.key],'This is a standard contraction. Unlike pronunciation shortcuts such as “gonna”, this spelling is accepted in everyday writing.',i,i,false);
    }
    // Content words that belong to a reduced phrase are light in this suggested reading.
    if(!tokens.some(t=>t.stressed))tokens[tokens.length-1].stressed=true;
    Object.entries(WEAK).forEach(([key,ipa])=>{
      const i=tokens.findIndex((t,j)=>t.key===key&&!t.stressed&&j<tokens.length-1);
      if(i>=0)add('Weak form',tokens[i].text,ipa,'When it is not emphasized, “'+key+'” often uses a shorter, softer vowel: '+ipa+'. Give it less time than the key words.',i,i,false);
    });
    const groups=buildGroups(text,tokens);
    if(groups.length>1) features.push({type:'Thought groups',from:groups.map(g=>g.text).join(' / '),to:'',explanation:'These pauses separate ideas. Keep the words within each group moving together.'});
    let spoken='',cursor=0;
    replacements.sort((a,b)=>a.start-b.start||b.end-a.end).forEach(r=>{if(r.start<cursor)return;spoken+=text.slice(cursor,r.start)+r.to;cursor=r.end});
    spoken+=text.slice(cursor);spoken=spoken.charAt(0).toUpperCase()+spoken.slice(1);
    if(!replacements.length){
      // Use only attested links; retain standard spelling when no reduction is known.
      const links=features.filter(f=>f.type==='Linking');
      if(links.length){let offset=0;for(const f of links){const at=tokens[f.start].end+offset;const gap=spoken.slice(at,at+1);if(gap===' '){spoken=spoken.slice(0,at)+'‿'+spoken.slice(at+1);}}}
    }
    return {text,tokens,groups,features,spoken,hasReduction:replacements.length>0,source:'local-patterns'};
  }
}
// Exposed pure core allows non-browser validation and future model-provider tests.
globalThis.SpeakFlowCore={LocalPatternAnalyzer,tokenize,validateSentence,EXAMPLES};
if(typeof document==='undefined')return;

// 2. Browser audio adapter. A replacement must implement speak(options) + cancel().
class BrowserSpeechProvider {
  constructor(){this.active=null;this.voiceURI='';this.calibration=new Map();}
  get available(){return 'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window}
  cancel(){if(this.active)this.active.finish('cancelled');if(this.available)window.speechSynthesis.cancel()}
  speak({text,rate=1,voiceURI='',onStart=()=>{},onWord=()=>{},onTiming=()=>{}}){
    this.cancel();
    if(!this.available)return Promise.reject(new Error('Speech playback is not available in this browser. Try Chrome, Edge, or Safari. You can still record yourself.'));
    return new Promise((resolve,reject)=>{
      const utterance=new SpeechSynthesisUtterance(text),words=tokenize(text);
      const voice=speechSynthesis.getVoices().find(v=>v.voiceURI===voiceURI);
      utterance.lang=voice?.lang||'en-US';if(voice)utterance.voice=voice;utterance.rate=rate;utterance.pitch=1;
      let fallbackTimer,watchdog,started=0,actualTiming=false,closed=false,lastIndex=-1,lastBoundary=0,boundaryIndex=0;
      const calibrationKey=(voice?.voiceURI||'default')+':'+rate;
      const finish=(status,error)=>{if(closed)return;closed=true;clearInterval(fallbackTimer);clearTimeout(watchdog);if(this.active?.utterance===utterance)this.active=null;error?reject(error):resolve({status});};
      this.active={utterance,finish};
      const mark=i=>{if(i!==lastIndex&&words[i]){lastIndex=i;onWord(i);}};
      const weights=words.map(w=>Math.max(.7,Math.min(1.6,w.key.length/5))),total=weights.reduce((a,b)=>a+b,0);
      const seconds=Math.max(.7,words.length/(this.calibration.get(calibrationKey)||3.3)/rate);
      const positions=weights.map((_,i)=>weights.slice(0,i).reduce((a,b)=>a+b,0));
      utterance.onstart=()=>{
        if(closed)return;clearTimeout(watchdog);started=performance.now();onStart();onTiming('estimated');mark(0);
        fallbackTimer=setInterval(()=>{if(closed)return;const now=performance.now();if(actualTiming&&now-lastBoundary<550)return;const base=actualTiming?positions[boundaryIndex]:0;const elapsed=now-(actualTiming?lastBoundary:started);const target=Math.min(total-.001,base+elapsed/(seconds*1000)*total);let sum=0;const i=weights.findIndex(w=>(sum+=w)>target);if(i>lastIndex){mark(i);onTiming('estimated');}},35);
        watchdog=setTimeout(()=>{finish('error',new Error('The voice took too long to respond. Try another English voice.'));speechSynthesis.cancel();},Math.max(30000,seconds*3000));
      };
      utterance.onboundary=e=>{if(closed||e.name==='sentence')return;let i=words.findIndex(w=>e.charIndex>=w.start&&e.charIndex<w.end);if(i<0)i=words.findIndex(w=>w.start>=e.charIndex);if(i>=0){if(i>0){actualTiming=true;lastBoundary=performance.now();boundaryIndex=i;onTiming('word');}mark(i);}};
      utterance.onend=()=>{if(started){const duration=(performance.now()-started)/1000;this.calibration.set(calibrationKey,Math.min(6,Math.max(1.5,words.length/duration/rate)));}finish('ended')};
      utterance.onerror=e=>{if(['canceled','interrupted'].includes(e.error))finish('cancelled');else finish('error',new Error('This voice could not play the sentence. Select another English voice and try again.'));};
      watchdog=setTimeout(()=>{finish('error',new Error('No voice responded. Try another English voice or reopen this HTML in Chrome, Edge, or Safari.'));speechSynthesis.cancel();},12000);
      try{speechSynthesis.speak(utterance)}catch(e){finish('error',e)}
    });
  }
}

// 3. Recording service. Real microphone input only; never synthesizes attempts.
class BrowserRecorder {
  constructor(){this.state='idle';this.request=0;this.session=null;}
  async start({onStart,onLevel,onElapsed,onStop,onError}){
    if(this.state!=='idle')return false;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access needs localhost or HTTPS in this browser. Open a secure preview, then try again.');
    if(!window.MediaRecorder)throw new Error('Recording is not supported here. Open this page in a recent Chrome, Edge, or Safari browser.');
    const request=++this.request;this.state='requesting';let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(e){if(request!==this.request)return false;this.state='idle';const messages={NotAllowedError:'Microphone permission was denied. Allow access in your browser’s site settings, then try again.',NotFoundError:'No microphone was found. Connect one and try again.',NotReadableError:'Your microphone is busy. Close other recording apps and try again.',SecurityError:'This browser blocked microphone access. Use localhost or HTTPS.'};throw new Error(messages[e.name]||'The microphone could not start. Check your input device and browser permissions.');}
    if(request!==this.request){stream.getTracks().forEach(t=>t.stop());return false}
    let recorder;
    try{const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported?.(type));recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);}catch(e){stream.getTracks().forEach(t=>t.stop());this.state='idle';throw new Error('This browser cannot create a recording. Try a different browser.');}
    const session={recorder,stream,chunks:[],started:performance.now(),done:false,context:null,timer:null,frame:null};this.session=session;
    const cleanup=()=>{clearInterval(session.timer);cancelAnimationFrame(session.frame);stream.getTracks().forEach(t=>t.stop());if(session.context)session.context.close().catch(()=>{});if(this.session===session){this.session=null;this.state='idle';}};
    recorder.ondataavailable=e=>{if(e.data.size>0)session.chunks.push(e.data)};
    recorder.onerror=()=>{if(session.done)return;session.done=true;this.state='stopping';try{if(recorder.state==='recording')recorder.stop()}catch{}cleanup();onError(new Error('The recording was interrupted. Check your microphone, then try again.'));};
    recorder.onstop=()=>{
      if(session.done)return;session.done=true;const duration=(performance.now()-session.started)/1000;
      const blob=new Blob(session.chunks,{type:recorder.mimeType||session.chunks[0]?.type||'audio/webm'});cleanup();
      if(blob.size===0||duration<.35){onError(new Error('That recording was too short. Try speaking for a little longer.'));return;}
      onStop({blob,duration});
    };
    stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(this.session===session&&this.state==='recording')this.stop()},{once:true}));
    try{recorder.start(250);}catch(e){session.done=true;cleanup();throw new Error('Recording could not start. Check your microphone and try again.');}
    this.state='recording';onStart();
    session.timer=setInterval(()=>{const elapsed=(performance.now()-session.started)/1000;onElapsed(elapsed);if(elapsed>=29.5)this.stop();},100);
    try{
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return true;
      const context=new Context();session.context=context;const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);
      context.resume().catch(()=>{});const samples=new Uint8Array(analyser.fftSize);
      const meter=()=>{if(this.session!==session||this.state!=='recording')return;analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/samples.length);onLevel(Math.min(1,rms*7));session.frame=requestAnimationFrame(meter)};meter();
    }catch{/* Meter is optional; the real recording continues. */}
    return true;
  }
  stop(){const s=this.session;if(!s||this.state!=='recording')return;this.state='stopping';s.recorder.stop();}
  cancelRequest(){if(this.state==='requesting'){this.request++;this.state='idle';}}
  dispose(){this.cancelRequest();if(this.state==='recording')this.stop();}
}

// 4. UI state. Text enters DOM only via textContent or escaped interpolation.
const $=id=>document.getElementById(id),$$=selector=>[...document.querySelectorAll(selector)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"/></svg>';
const state={analysis:null,tab:'rhythm',rate:1,step:0,workflowBusy:false,workflowVersion:0,playVersion:0,analysisVersion:0,attempts:[],nextAttempt:1,recordContext:null,lesson:0,selectedAttempt:null,dialogue:0,dialogueSession:null,sequenceVersion:0};
const providers={analysis:new LocalPatternAnalyzer(),speech:new StudioSpeechProvider(new BrowserSpeechProvider(),globalThis.SPEAKFLOW_AUDIO||[]),pronunciation:null};
const recorder=new BrowserRecorder();let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3800)}
function updateCount(){$('char-count').textContent=$('sentence').value.length+' / 360'}
function setTab(name,focus=false){
  if(!['rhythm','connected','chunks'].includes(name))throw new Error('Unknown analysis view.');state.tab=name;
  $$('.tab').forEach(tab=>{const selected=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(tab.dataset.tab+'-panel').hidden=!selected;if(selected&&focus)tab.focus()});
}
function renderRhythm(){
  const {tokens,groups}=state.analysis;const ends=new Set(groups.slice(0,-1).map(g=>g.end));
  $('rhythm-words').innerHTML=tokens.map(t=>'<button type="button" class="word '+(t.stressed?'stressed ':'')+(t.functionWord?'function ':'')+(t.linked&&!ends.has(t.id)?'linked':'')+'" data-word="'+t.id+'" aria-pressed="'+t.stressed+'" aria-label="'+esc(t.text)+': '+(t.stressed?'stressed':'unstressed')+(t.functionWord?', function word':'')+'. Activate to change emphasis.">'+esc(t.text)+'</button>'+(ends.has(t.id)?'<span class="group-break" aria-label="thought group boundary">/</span>':'')).join('');
}
function renderAnalysis(){
  const a=state.analysis;$('analysis-meta').textContent=a.tokens.length+' words · '+a.groups.length+' thought group'+(a.groups.length===1?'':'s');renderRhythm();
  $('written-sentence').textContent=a.text;$('spoken-sentence').textContent=a.spoken;
  $('approx-note').textContent=a.hasReduction?'A listening guide, not spelling for your writing. Pronunciation varies by speaker and accent.':'No fixed casual reduction is suggested here. A bridge (‿) marks connected sounds; weak forms can still make the sentence flow.';
  $('feature-list').innerHTML=a.features.length?a.features.map((f,i)=>'<details class="feature"'+(i===0?' open':'')+'><summary><span class="feature-type">'+esc(f.type)+'</span><span>'+esc(f.from)+(f.to?' → '+esc(f.to):'')+'</span></summary><p>'+esc(f.explanation)+'</p></details>').join(''):'<p class="approx-note">No common connected-speech pattern was detected. Keep the thought group smooth, and listen for the stressed words.</p>';
  $('chunk-list').innerHTML=a.groups.map(g=>'<button class="chunk" data-chunk="'+g.id+'" aria-label="Play thought group '+(g.id+1)+': '+esc(g.text)+'"><span class="chunk-number">0'+(g.id+1)+'</span><span>'+esc(g.text)+'</span>'+icon('play')+'</button>').join('');
  $('word-detail').textContent='Tap a word to explore its role and change the emphasis.';
  $$('.example').forEach(b=>b.classList.toggle('active',EXAMPLES[Number(b.dataset.example)]===a.text));
  renderTeaching();renderAI();
}
function resetPractice(){
  stopSpeech();state.workflowVersion++;state.workflowBusy=false;state.step=0;
  $('practice-error').hidden=true;renderPractice();
}
function validateAnalysis(a,text){
  // Model providers return this same structured shape; ignore untrusted HTML.
  const sourceTokens=tokenize(text);
  if(!a||a.text!==text||!Array.isArray(a.tokens)||a.tokens.length!==sourceTokens.length||!Array.isArray(a.groups)||!a.groups.length||!Array.isArray(a.features)||typeof a.spoken!=='string')throw new Error('The analysis provider returned an incomplete result. Please try again.');
  if(a.tokens.some((t,i)=>t.id!==i||t.text!==sourceTokens[i].text||t.start!==sourceTokens[i].start||t.end!==sourceTokens[i].end))throw new Error('The analysis did not match your sentence. Please try again.');
  let next=0;for(const g of a.groups){if(g.start!==next||!Number.isInteger(g.end)||g.end<g.start||g.end>=a.tokens.length||typeof g.text!=='string')throw new Error('The thought groups could not be read. Please try again.');next=g.end+1;}if(next!==a.tokens.length)throw new Error('The analysis is missing a thought group.');
  return a;
}
async function analyze(value,{keepDialogue=false}={}){
  if(recorder.state!=='idle')throw new Error('Finish or cancel your recording before changing the sentence.');
  const text=validateSentence(value),version=++state.analysisVersion;stopSpeech();
  $('input-error').hidden=true;$('analyze-button').disabled=true;$('analyze-button').setAttribute('aria-busy','true');
  try{
    const result=await providers.analysis.analyze(text);if(version!==state.analysisVersion)return null;
    if(recorder.state!=='idle')throw new Error('Finish your recording, then analyze the new sentence.');
    state.analysis=validateAnalysis(result,text);$('sentence').value=text;updateCount();resetPractice();renderAnalysis();setTab('rhythm');
    if(!keepDialogue)state.dialogueSession=null;renderDialogueCue();
    $('play-status').textContent='Ready. Press play to hear the rhythm.';return result;
  }finally{if(version===state.analysisVersion){$('analyze-button').disabled=recorder.state!=='idle';$('analyze-button').removeAttribute('aria-busy')}}
}
function showInputError(e){$('input-error').textContent=e.message||'The sentence could not be analyzed. Please try again.';$('input-error').hidden=false;$('sentence').setAttribute('aria-invalid','true')}
function clearHighlight(){$$('.word.current,.chunk.playing').forEach(el=>el.classList.remove('current','playing'));$('rhythm-stage').classList.remove('is-playing');$('play-progress').style.width='0%';$('stage-label').textContent='DON’T JUST READ IT. FEEL IT.';$('stop-audio').hidden=true}
function stopSpeech(cancelSequence=true){if(cancelSequence)state.sequenceVersion++;state.playVersion++;providers.speech.cancel();clearHighlight();$$('.dialogue-line.speaking').forEach(el=>el.classList.remove('speaking'));$('play-status').textContent='Playback stopped.';}
function pauseRecordings(){$$('audio').forEach(audio=>audio.pause())}
async function play(text,rate=state.rate,{offset=0,chunk=null,followKaraoke=false,highlight=true,sequence=false}={}){
  if(recorder.state!=='idle')throw new Error('Finish recording before playing the model voice.');
  stopSpeech(!sequence);pauseRecordings();const version=state.playVersion;state.rate=rate;
  if(followKaraoke&&$('karaoke-toggle').checked)setTab('rhythm');
  $$('.speed-btn').forEach(b=>b.classList.toggle('selected',Number(b.dataset.speed)===rate));$('play-status').textContent='Starting voice…';$('stop-audio').hidden=false;
  try{
    const result=await providers.speech.speak({text,rate,voiceURI:$('voice-select').value,referenceText:state.analysis.text,
      onStart:()=>{if(version!==state.playVersion)return;$('rhythm-stage').classList.add('is-playing');$('stage-label').textContent=$('karaoke-toggle').checked?'STRESS KARAOKE · FOLLOW THE FLOW':'LISTEN FOR THE RHYTHM';if(chunk!==null)document.querySelector('[data-chunk="'+chunk+'"]').classList.add('playing');},
      onTiming:type=>{if(version===state.playVersion)$('play-status').textContent=type==='media'?'Studio audio · synced to playback':type==='word'?'Live voice · word timing':'Live voice · approximate timing';},
      onWord:i=>{if(version!==state.playVersion||!$('karaoke-toggle').checked||!highlight)return;$$('.word.current').forEach(w=>w.classList.remove('current'));if(i<0)return;const word=document.querySelector('[data-word="'+(offset+i)+'"]');if(word)word.classList.add('current');$('play-progress').style.width=((offset+i+1)/state.analysis.tokens.length*100)+'%';}
    });
    if(version===state.playVersion){clearHighlight();$('play-status').textContent=result?.status==='ended'?'Nice. Listen again, or make it your own.':'Playback stopped.';}
    return result?.status==='ended';
  }catch(e){if(version===state.playVersion){clearHighlight();$('play-status').textContent='Voice unavailable. Try another English voice.';}throw e;}
}
function refreshVoices(){
  const current=$('voice-select').value,voices='speechSynthesis' in window?speechSynthesis.getVoices().filter(v=>/^en([-_]|$)/i.test(v.lang)):[];
  $('voice-select').innerHTML='<option value="studio">Studio voice · synced</option><option value="">Device English voice</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI)+'">'+esc(v.name)+' · '+esc(v.lang)+'</option>').join('');
  $('voice-select').value=current==='studio'||voices.some(v=>v.voiceURI===current)?current:'studio';
}
const STEPS=[
  {heading:'Your voice belongs here.',description:'Listen first. You don’t have to get it perfect.',button:'Shadow This',icon:'mic'},
  {heading:'Now, slow it down.',description:'Catch the little words between the big beats.',button:'Listen slowly',icon:'headphones'},
  {heading:'Borrow the rhythm.',description:'Speak along with the voice, just a little behind.',button:'Play & shadow',icon:'wave'},
  {heading:'Now it’s your turn.',description:'Say it on your own. Focus on one smooth thought.',button:'Start recording',icon:'mic'},
  {heading:'Let your AI coach listen.',description:'Get specific feedback, then practise the next small step.',button:'Record another attempt',icon:'repeat'}
];
function renderPractice(){
  const config=STEPS[state.step];$$('.workflow-step').forEach(el=>{const n=Number(el.dataset.step);el.classList.toggle('active',n===state.step);el.classList.toggle('done',n<state.step);if(n===state.step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current')});
  $('practice-heading').textContent=config.heading;$('practice-description').textContent=config.description;$('practice-action').innerHTML=icon(config.icon)+'<span>'+config.button+'</span>';
  $('practice-action').disabled=state.workflowBusy;$('practice-action').classList.remove('recording');$('mic-meter').hidden=true;$('practice-orb').hidden=false;$('record-direct').hidden=state.step>=3;$('restart-practice').hidden=state.step===0&&!state.workflowBusy;
}
function lockRecording(locked){
  [$('sentence'),$('analyze-button'),$('voice-select'),$('karaoke-toggle'),...$$('.example,.speed-btn,.chunk,.word,.lesson-action,.dialogue-action,.library-open,.quiz-option')].forEach(el=>el.disabled=locked);
  $('record-direct').hidden=locked||state.step>=3;$('restart-practice').hidden=locked||state.step===0;
}
function practiceError(e){$('practice-error').textContent=e.message||'Something interrupted this attempt. Please try again.';$('practice-error').hidden=false;}
async function startRecording(){
  if(recorder.state!=='idle')return;
  if($('analyze-button').getAttribute('aria-busy')==='true'){toast('Wait for your sentence analysis to finish.');return;}
  stopSpeech();pauseRecordings();state.workflowVersion++;state.workflowBusy=false;state.step=3;
  const context={text:state.analysis.text,analysis:structuredClone(state.analysis)};state.recordContext=context;
  $('practice-error').hidden=true;renderPractice();lockRecording(true);
  $('practice-heading').textContent='Allow your microphone.';$('practice-description').textContent='Your browser may ask for permission.';$('practice-action').innerHTML=icon('close')+'<span>Cancel microphone request</span>';$('practice-action').disabled=false;
  try{
    await recorder.start({
      onStart:()=>{
        $('practice-orb').hidden=true;$('mic-meter').hidden=false;$('practice-action').classList.add('recording');$('practice-action').innerHTML=icon('stop')+'<span>Stop & save recording</span>';$('practice-heading').textContent='Recording · 0:00';$('practice-description').textContent='One line at a time. Up to 30 seconds.';
      },
      onLevel:level=>$('mic-meter').style.setProperty('--level',String(level)),
      onElapsed:seconds=>$('practice-heading').textContent='Recording · '+formatDuration(seconds),
      onStop:({blob,duration})=>{
        const attempt={id:state.nextAttempt++,blob,url:URL.createObjectURL(blob),duration,text:context.text,analysis:context.analysis};state.attempts.push(attempt);state.selectedAttempt=attempt.id;state.step=4;lockRecording(false);renderPractice();renderAttempts();renderAI();window.dispatchEvent(new CustomEvent('speakflow:activity',{detail:{type:'shadow',seconds:duration,sentence:context.text}}));toast('Attempt saved. Ask your AI coach for feedback.');
      },
      onError:e=>{state.step=3;lockRecording(false);renderPractice();practiceError(e)}
    });
  }catch(e){lockRecording(false);renderPractice();practiceError(e)}
}
function formatDuration(seconds){const n=Math.max(0,Math.floor(seconds));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
function renderAttempts(){
  const blank=['Your first step','Find the rhythm','Make it flow'];
  let html=state.attempts.map(a=>{
    const ext=a.blob.type.includes('mp4')?'m4a':a.blob.type.includes('ogg')?'ogg':'webm';
    return '<div class="recording-card"><div class="recording-title"><span>Attempt '+a.id+'</span><small>'+formatDuration(a.duration)+(a.assessment?' · '+(a.assessment.overall??'—')+'/100':'')+'</small></div><p class="recording-sentence">'+esc(a.text)+'</p><audio controls preload="metadata" src="'+esc(a.url)+'" aria-label="Replay attempt '+a.id+'"></audio><div class="recording-actions"><button data-assess="'+a.id+'">'+(a.assessment?'View AI feedback':'AI feedback')+'</button><a href="'+esc(a.url)+'" download="SpeakFlow-attempt-'+a.id+'.'+ext+'">Download</a><button data-remove="'+a.id+'" aria-label="Remove attempt '+a.id+'">Remove</button></div></div>';
  }).join('');
  for(let i=state.nextAttempt;i<=3;i++)html+='<div class="attempt-empty">'+icon('play')+'<span>Attempt '+i+'</span><span>'+blank[i-1]+'</span></div>';
  if(!html)html='<p class="approx-note">Your next recording will appear here.</p>';
  $('attempts').innerHTML=html;$('attempt-count').textContent=state.attempts.length?state.attempts.length+' saved in this tab':'A little better, each time';
  $$('audio').forEach(audio=>{audio.addEventListener('play',()=>{if(recorder.state!=='idle'){audio.pause();toast('Finish your recording before replaying an attempt.');return;}stopSpeech();$$('audio').forEach(other=>{if(other!==audio)other.pause()});});audio.addEventListener('error',()=>toast('This recording could not play. Download it or try a different browser.'));});
}
async function advancePractice(){
  if(recorder.state==='requesting'){recorder.cancelRequest();lockRecording(false);renderPractice();return;}
  if(recorder.state==='recording'){recorder.stop();$('practice-action').disabled=true;$('practice-action').textContent='Saving your attempt…';return;}
  if(recorder.state==='stopping'||state.workflowBusy)return;
  if(state.step>=3){await startRecording();return;}
  const step=state.step,version=++state.workflowVersion;state.workflowBusy=true;renderPractice();$('practice-error').hidden=true;
  $('practice-action').innerHTML=icon('volume')+'<span>'+(step===2?'Speak along…':'Listening…')+'</span>';
  try{const ended=await play(state.analysis.text,step===1?.72:1,{followKaraoke:true});if(version===state.workflowVersion&&ended)state.step=step+1;}
  catch(e){practiceError(e)}
  finally{if(version===state.workflowVersion){state.workflowBusy=false;renderPractice()}}
}

// Teaching is a complete listen / notice / build / transfer loop.
function renderTeaching(){
  const lesson=CONTENT.lessons[state.lesson];
  $('lesson-tabs').innerHTML=CONTENT.lessons.map((l,i)=>'<button class="lesson-tab" data-lesson="'+i+'" aria-pressed="'+(i===state.lesson)+'">'+String(i+1).padStart(2,'0')+' '+esc(l.type)+'</button>').join('');
  $('lesson-heading').textContent=lesson.title;$('lesson-subtitle').textContent=lesson.zh;
  $('lesson-formula').innerHTML=lesson.formula.map((w,i)=>'<span>'+esc(w)+'</span>'+(i<lesson.formula.length-1?'<b aria-hidden="true">‿</b>':'')).join('');
  $('lesson-sound').textContent=lesson.sound;$('lesson-notice').textContent=lesson.notice;
  $('lesson-steps').innerHTML=lesson.steps.map(s=>'<li>'+esc(s)+'</li>').join('');
  $('lesson-question').textContent=lesson.question;$('lesson-options').innerHTML=lesson.options.map((option,i)=>'<button class="quiz-option" data-answer="'+i+'">'+String.fromCharCode(65+i)+'. '+esc(option)+'</button>').join('');
  $('lesson-answer').hidden=true;$('lesson-practice-sentence').textContent=lesson.practice;
  $('lesson-transfer').innerHTML=lesson.transfer.map((t,i)=>'<button class="transfer-sentence lesson-action" data-transfer="'+i+'">'+icon('play')+'<span>'+esc(t)+'</span></button>').join('');
}
async function teachAudio(kind){
  const lesson=CONTENT.lessons[state.lesson];$('lesson-listening').textContent=kind==='apart'?'Listen to the separated version.':'Listen to the connected phrase.';
  try{await play(lesson[kind],1,{highlight:false});$('lesson-listening').textContent='Now say it with one continuous movement.'}catch(e){$('lesson-listening').textContent=e.message}
}
function checkLesson(answer){
  const lesson=CONTENT.lessons[state.lesson],correct=answer===lesson.answer;
  $$('.quiz-option').forEach((b,i)=>{b.classList.toggle('correct',i===answer&&correct);b.classList.toggle('incorrect',i===answer&&!correct)});
  $('lesson-answer').hidden=false;$('lesson-answer').textContent=(correct?'✓ 理解对了。':'再听一次：')+lesson.why;$('lesson-answer').classList.toggle('retry',!correct);
}

// Dialogue library and role practice share the same sentence + recording workflow.
function renderDialogue(){
  const dialogue=CONTENT.dialogues[state.dialogue];
  $('dialogue-select').innerHTML=CONTENT.dialogues.map((d,i)=>'<option value="'+i+'"'+(i===state.dialogue?' selected':'')+'>'+d.level+' · '+esc(d.title)+' / '+esc(d.scene)+'</option>').join('');
  $('dialogue-focus').textContent=dialogue.focus;
  $('dialogue-lines').innerHTML=dialogue.lines.map((line,i)=>'<div class="dialogue-line role-'+line.role+'" data-dialogue-line="'+i+'"><span class="speaker-badge">'+line.role+'</span><div class="dialogue-bubble"><p>'+esc(line.text)+'</p><small>'+esc(line.zh)+'</small><div class="dialogue-line-actions"><button class="text-btn dialogue-action" data-line-listen="'+i+'">'+icon('play')+'Listen</button><button class="text-btn dialogue-action" data-line-practice="'+i+'">Practise this line '+icon('arrow')+'</button></div></div></div>').join('');
}
function openLibrary(){stopSpeech();renderDialogue();$('dialogue-dialog').showModal()}
async function listenDialogue(){
  if(recorder.state!=='idle'){toast('Finish your recording first.');return;}
  stopSpeech();const version=++state.sequenceVersion,dialogue=CONTENT.dialogues[state.dialogue];$('dialogue-play').disabled=true;
  try{
    for(let i=0;i<dialogue.lines.length;i++){
      if(version!==state.sequenceVersion)break;
      const promise=play(dialogue.lines[i].text,1,{highlight:false,sequence:true});document.querySelector('[data-dialogue-line="'+i+'"]').classList.add('speaking');
      if(!await promise||version!==state.sequenceVersion)break;
      document.querySelector('[data-dialogue-line="'+i+'"]').classList.remove('speaking');
    }
  }catch(e){toast(e.message)}finally{$('dialogue-play').disabled=false;$$('.dialogue-line.speaking').forEach(el=>el.classList.remove('speaking'))}
}
async function practiseLine(index,role=null){
  const scene=state.dialogue,dialogue=CONTENT.dialogues[scene],line=dialogue.lines[index];
  try{await analyze(line.text,{keepDialogue:true});state.dialogueSession={scene,index,role:role||line.role};renderDialogueCue();$('dialogue-dialog').close();$('shadowing').scrollIntoView({behavior:'smooth',block:'start'});}
  catch(e){toast(e.message)}
}
function renderDialogueCue(){
  const session=state.dialogueSession;$('dialogue-cue').hidden=!session;if(!session)return;
  const dialogue=CONTENT.dialogues[session.scene],previous=dialogue.lines[session.index-1];
  $('dialogue-cue-title').textContent=dialogue.title+' · You are '+session.role;
  $('dialogue-cue-text').textContent=previous?previous.role+': '+previous.text:'You start the conversation. Say the highlighted sentence.';
  $('hear-partner').hidden=!previous;
  const next=dialogue.lines.findIndex((l,i)=>i>session.index&&l.role===session.role);$('next-turn').disabled=next<0;$('next-turn').textContent=next<0?'Last turn':'Next turn →';
}
async function nextDialogueTurn(){const s=state.dialogueSession;if(!s||recorder.state!=='idle')return;const index=CONTENT.dialogues[s.scene].lines.findIndex((l,i)=>i>s.index&&l.role===s.role);if(index<0)return;state.dialogue=s.scene;await practiseLine(index,s.role)}

// Real scores are attached to their exact recording, never to the current draft.
function currentAttempt(){return state.attempts.find(a=>a.id===state.selectedAttempt)||state.attempts.at(-1)}
function renderAI(){
  const attempt=currentAttempt(),configured=Boolean(providers.pronunciation),busy=attempt?.assessmentStatus==='pending';
  $('ai-readiness').textContent=configured?'AI configured':'AI · Set up';
  $('ai-attempt-label').textContent=attempt?'Attempt '+attempt.id:'Your personal speaking coach';
  $('ai-status').textContent=busy?'AI is listening…':attempt?.assessment?'Your feedback is ready':configured?'Ready to listen':'AI coach · not configured';
  $('ai-description').textContent=busy?'正在分析这段录音的发音与节奏，请稍候。':attempt?.assessment?'点需要练习的单词，看具体反馈，再听示范。':configured?(attempt?'发送这次录音，获取真实的语音评测和重练建议。':'先录一句，AI 会告诉你下一步具体练什么。'):'在设置中连接语音评测服务后，即可评分。不会用自评或示例分数代替真实结果。';
  $('ai-score-button').textContent=busy?'Analyzing recording…':!configured?'Configure AI scoring':attempt?.assessment?'Assess this attempt again':'Send recording · Get AI feedback';
  $('ai-score-button').disabled=busy||(configured&&!attempt);
  $('ai-error').hidden=!attempt?.assessmentError;$('ai-error').textContent=attempt?.assessmentError||'';
  $('ai-result').hidden=!attempt?.assessment;
  if(!attempt?.assessment)return;
  const result=attempt.assessment;
  $('score-metrics').innerHTML=[['Overall','综合',result.overall],['Accuracy','发音',result.accuracy],['Fluency','流利度',result.fluency],['Prosody','韵律',result.prosody],['Completeness','完整度',result.completeness]].map(([label,zh,value])=>'<div class="score-metric"><strong>'+(value??'—')+'</strong><span>'+label+'</span><small>'+zh+'</small></div>').join('');
  $('score-transcript').textContent='AI heard: '+(result.transcript||'No transcript returned.');
  $('score-words').innerHTML=result.words.map((word,i)=>'<button class="assessed-word '+(word.error!=='None'||word.accuracy!==null&&word.accuracy<75?'needs-work':'')+'" data-scored-word="'+i+'" aria-label="'+esc(word.word)+', accuracy '+(word.accuracy??'not available')+', '+esc(word.error)+'">'+esc(word.word)+'<small>'+(word.accuracy??'—')+'</small></button>').join('');
  $('ai-next-step').textContent=feedbackForAssessment(result).text;
  const previous=state.attempts.filter(a=>a.id<attempt.id&&a.text===attempt.text&&a.assessment?.overall!==null&&a.assessment?.overall!==undefined).at(-1);
  $('score-comparison').hidden=!previous||result.overall===null;
  if(previous&&result.overall!==null){const difference=result.overall-previous.assessment.overall;$('score-comparison').textContent='Same sentence · '+(difference>=0?'+':'')+difference+' vs Attempt '+previous.id;}
  $('word-coach').hidden=true;
}
async function assessAttempt(attempt=currentAttempt()){
  if(!providers.pronunciation){openAISettings();return null;}
  if(!attempt){toast('Record an attempt first.');return null;}
  if(recorder.state!=='idle'){toast('Finish recording first.');return null;}
  if(attempt.assessmentStatus==='pending')return null;
  const provider=providers.pronunciation;attempt.assessmentStatus='pending';attempt.assessmentError='';renderAI();
  try{
    const result=await provider.score({blob:attempt.blob,text:attempt.text,analysis:structuredClone(attempt.analysis)});
    if(!result||!Array.isArray(result.words)||[result.overall,result.accuracy,result.fluency,result.prosody,result.completeness].some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)))throw new Error('The AI service returned an invalid score format.');
    attempt.assessment=result;attempt.assessmentStatus='done';if(state.attempts.includes(attempt)){renderAttempts();renderAI();toast('AI feedback is ready for Attempt '+attempt.id+'.');}return result;
  }catch(e){attempt.assessmentStatus='error';attempt.assessmentError=e.name==='TimeoutError'?'The AI service timed out. Please retry.':e.message||'AI assessment failed. Try again.';if(state.attempts.includes(attempt))renderAI();return null;}
}
function openAISettings(){$('ai-config-error').hidden=true;$('ai-settings-dialog').showModal()}
function changeAIService(){const azure=$('ai-service').value==='azure';$('azure-config').hidden=!azure;$('endpoint-config').hidden=azure;}
function saveAISettings(e){
  e.preventDefault();try{
    providers.pronunciation=$('ai-service').value==='azure'?new AzureAssessmentProvider({subscriptionKey:$('azure-key').value,region:$('azure-region').value.trim().toLowerCase()}):new EndpointAssessmentProvider({url:$('assessment-url').value.trim(),token:$('assessment-token').value.trim()});
    $('azure-key').value='';$('assessment-token').value='';$('ai-settings-dialog').close();renderAI();toast('Configuration saved for this tab. The first assessment will verify the connection.');
  }catch(e){$('ai-config-error').textContent=e.message;$('ai-config-error').hidden=false;}
}
function inspectAssessedWord(index){
  const a=currentAttempt(),w=a?.assessment?.words[index];if(!w)return;
  const errors={Omission:'可能漏读',Insertion:'参考句之外的词',Mispronunciation:'建议重练发音',None:'未标记读音错误'};
  $('word-coach').hidden=false;$('word-coach-title').textContent=w.word+' · '+(errors[w.error]||w.error);
  $('word-coach-text').textContent='发音准确度 '+(w.accuracy??'未返回')+'。'+(w.phonemes.some(p=>p.accuracy!==null&&p.accuracy<75)?'重点留意：'+w.phonemes.filter(p=>p.accuracy!==null&&p.accuracy<75).map(p=>'/'+p.phoneme+'/ ('+p.accuracy+')').join('、'):'先听示范，再放回原句练习。');
  $('word-model').onclick=()=>play(w.word,0.85,{highlight:false}).catch(e=>toast(e.message));
  $('word-replay').disabled=w.start===null||w.duration===null||w.duration<=0||w.error==='Omission';
  $('word-replay').onclick=()=>{if(recorder.state!=='idle')return;stopSpeech();pauseRecordings();const audio=document.querySelector('audio[src="'+a.url+'"]');if(!audio)return;audio.currentTime=Math.max(0,w.start-.12);const end=w.start+w.duration+.18;const stop=()=>{if(audio.currentTime>=end){audio.pause();audio.removeEventListener('timeupdate',stop)}};audio.addEventListener('timeupdate',stop);audio.addEventListener('pause',()=>audio.removeEventListener('timeupdate',stop),{once:true});audio.play().catch(()=>toast('Tap the recording play button to hear this attempt.'));};
}

// 5. Wire actions and accessible keyboard behavior.
$('sentence-form').addEventListener('submit',async e=>{e.preventDefault();$('sentence').removeAttribute('aria-invalid');try{await analyze($('sentence').value);toast('Your sentence is ready. Start with the rhythm.')}catch(e){showInputError(e)}});
$('sentence').addEventListener('input',()=>{updateCount();$('input-error').hidden=true;$('sentence').removeAttribute('aria-invalid')});
$('sentence').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('sentence-form').requestSubmit()}});
$$('.example').forEach(b=>b.addEventListener('click',async()=>{try{await analyze(EXAMPLES[Number(b.dataset.example)])}catch(e){showInputError(e)}}));
$$('.tab').forEach(tab=>{tab.addEventListener('click',()=>setTab(tab.dataset.tab));tab.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('.tab'),index=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next].dataset.tab,true)})});
$('rhythm-words').addEventListener('click',e=>{const button=e.target.closest('[data-word]');if(!button||recorder.state!=='idle')return;stopSpeech();const t=state.analysis.tokens[Number(button.dataset.word)];t.stressed=!t.stressed;renderRhythm();$('word-detail').textContent='“'+t.text.replace(/[.,!?;:]$/,'')+'” · '+(t.functionWord?'Function word':'Content word')+' · '+(t.stressed?'Emphasized. Stress can show contrast or a new idea.':'Unstressed. Keep it lighter so the key words stand out.');document.querySelector('[data-word="'+t.id+'"]').focus();});
$$('.speed-btn').forEach(b=>b.addEventListener('click',()=>play(state.analysis.text,Number(b.dataset.speed),{followKaraoke:true}).catch(e=>{practiceError(e);toast(e.message)})));
$('chunk-list').addEventListener('click',e=>{const b=e.target.closest('[data-chunk]');if(!b)return;const g=state.analysis.groups[Number(b.dataset.chunk)];play(g.text,state.rate,{offset:g.start,chunk:g.id}).catch(e=>{practiceError(e);toast(e.message)})});
$('stop-audio').addEventListener('click',stopSpeech);
$('voice-select').addEventListener('change',stopSpeech);
$('karaoke-toggle').addEventListener('change',()=>{if(!$('karaoke-toggle').checked){$$('.word.current').forEach(w=>w.classList.remove('current'));$('play-progress').style.width='0%';}else setTab('rhythm');});
$('practice-action').addEventListener('click',advancePractice);$('record-direct').addEventListener('click',startRecording);$('restart-practice').addEventListener('click',resetPractice);
$('attempts').addEventListener('click',e=>{const view=e.target.closest('[data-assess]');if(view){state.selectedAttempt=Number(view.dataset.assess);renderAI();$('ai-coach').scrollIntoView({behavior:'smooth',block:'nearest'});return;}const b=e.target.closest('[data-remove]');if(!b)return;const id=Number(b.dataset.remove),attempt=state.attempts.find(a=>a.id===id);if(!attempt)return;pauseRecordings();URL.revokeObjectURL(attempt.url);state.attempts=state.attempts.filter(a=>a.id!==id);renderAttempts();renderAI();});
$('lesson-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-lesson]');if(!b)return;stopSpeech();state.lesson=Number(b.dataset.lesson);renderTeaching()});
$('lesson-options').addEventListener('click',e=>{const b=e.target.closest('[data-answer]');if(b)checkLesson(Number(b.dataset.answer))});
$('lesson-apart').addEventListener('click',()=>teachAudio('apart'));$('lesson-flow').addEventListener('click',()=>teachAudio('flow'));
$('lesson-practise').addEventListener('click',async()=>{try{await analyze(CONTENT.lessons[state.lesson].practice);state.step=2;renderPractice();$('shadowing').scrollIntoView({behavior:'smooth',block:'start'})}catch(e){toast(e.message)}});
$('lesson-transfer').addEventListener('click',async e=>{const b=e.target.closest('[data-transfer]');if(!b)return;try{await analyze(CONTENT.lessons[state.lesson].transfer[Number(b.dataset.transfer)]);await play(state.analysis.text,1,{followKaraoke:true})}catch(e){toast(e.message)}});
$$('.library-open').forEach(b=>b.addEventListener('click',openLibrary));$('dialogue-close').addEventListener('click',()=>$('dialogue-dialog').close());$('dialogue-dialog').addEventListener('close',stopSpeech);
$('dialogue-select').addEventListener('change',()=>{stopSpeech();state.dialogue=Number($('dialogue-select').value);renderDialogue()});
$('dialogue-play').addEventListener('click',listenDialogue);$('dialogue-stop').addEventListener('click',stopSpeech);
$('dialogue-lines').addEventListener('click',e=>{const listen=e.target.closest('[data-line-listen]'),practise=e.target.closest('[data-line-practice]');if(listen){const i=Number(listen.dataset.lineListen);play(CONTENT.dialogues[state.dialogue].lines[i].text,1,{highlight:false}).catch(e=>toast(e.message));}else if(practise)practiseLine(Number(practise.dataset.linePractice));});
$$('[data-practice-role]').forEach(b=>b.addEventListener('click',()=>{const role=b.dataset.practiceRole,index=CONTENT.dialogues[state.dialogue].lines.findIndex(l=>l.role===role);practiseLine(index,role)}));
$('hear-partner').addEventListener('click',()=>{const s=state.dialogueSession,previous=s&&CONTENT.dialogues[s.scene].lines[s.index-1];if(previous)play(previous.text,1,{highlight:false}).catch(e=>toast(e.message))});$('next-turn').addEventListener('click',nextDialogueTurn);
$('ai-score-button').addEventListener('click',()=>assessAttempt());$$('.ai-settings-open').forEach(b=>b.addEventListener('click',openAISettings));
$('ai-settings-close').addEventListener('click',()=>$('ai-settings-dialog').close());$('ai-service').addEventListener('change',changeAIService);$('ai-config-form').addEventListener('submit',saveAISettings);
$('ai-disconnect').addEventListener('click',()=>{providers.pronunciation=null;$('azure-key').value='';$('assessment-token').value='';$('ai-settings-dialog').close();renderAI();toast('AI configuration cleared from this tab.');});
$('score-words').addEventListener('click',e=>{const b=e.target.closest('[data-scored-word]');if(b)inspectAssessedWord(Number(b.dataset.scoredWord))});
$('ai-try-again').addEventListener('click',async()=>{const a=currentAttempt();if(!a)return;try{await analyze(a.text);state.step=3;renderPractice();$('practice-action').focus()}catch(e){toast(e.message)}});
function openHelp(){if(!$('help-dialog').open)$('help-dialog').showModal()}
$('help-open').addEventListener('click',openHelp);$('about-open').addEventListener('click',openHelp);$('help-close').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('help-dialog').close()}});
window.addEventListener('pagehide',()=>{stopSpeech();pauseRecordings();recorder.dispose()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSpeech();if(recorder.state==='recording'){recorder.stop();$('practice-action').disabled=true;$('practice-action').textContent='Saving your attempt…';}}});
if('speechSynthesis' in window)speechSynthesis.addEventListener('voiceschanged',refreshVoices);refreshVoices();
state.analysis=providers.analysis.analyzeSync(EXAMPLES[0]);updateCount();renderAnalysis();renderPractice();

// 6. Integration seam: plug in hosted AI analysis, better TTS, or real scoring.
// No secret keys, network model calls, or fabricated scores in this local edition.
window.SpeakFlow={
  version:'3.0.0',
  configure({analysisProvider,speechProvider,pronunciationProvider}={}){
    if(recorder.state!=='idle')throw new Error('Finish recording before changing providers.');
    if(analysisProvider){if(typeof analysisProvider.analyze!=='function')throw new Error('analysisProvider must implement analyze(text).');providers.analysis=analysisProvider;}
    if(speechProvider){if(typeof speechProvider.speak!=='function'||typeof speechProvider.cancel!=='function')throw new Error('speechProvider must implement speak(options) and cancel().');stopSpeech();providers.speech=speechProvider;}
    if(pronunciationProvider){if(typeof pronunciationProvider.score!=='function')throw new Error('pronunciationProvider must implement score({blob, text, analysis}).');providers.pronunciation=pronunciationProvider;renderAI();}
  },
  analyze,
  showTab:name=>setTab(name),
  stopAudio:()=>{stopSpeech();pauseRecordings();},
  stopMedia:()=>{stopSpeech();pauseRecordings();if(recorder.state==='requesting'){recorder.cancelRequest();lockRecording(false);renderPractice();}else if(recorder.state==='recording')recorder.stop();},
  getAnalysis:()=>structuredClone(state.analysis),
  getSession:()=>({step:state.step,recordingState:recorder.state,attempts:state.attempts.map(a=>({id:a.id,text:a.text,duration:a.duration}))}),
  async scoreLatest(){
    if(!providers.pronunciation)throw new Error('No pronunciation scoring service is connected.');
    const a=state.attempts.at(-1);if(!a)throw new Error('Record an attempt first.');
    return assessAttempt(a);
  },
  providers:{LocalPatternAnalyzer,BrowserSpeechProvider,BrowserRecorder,StudioSpeechProvider,AzureAssessmentProvider,EndpointAssessmentProvider}
};

// Optional imperative WebMCP interface. Recording always requires a user gesture.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
  register({name:'analyze_speaking_sentence',title:'Analyze a practice sentence',description:'Analyze an English sentence and show its stress, connected speech, and thought groups in Sound Lab.',inputSchema:{type:'object',properties:{sentence:{type:'string',minLength:1,maxLength:360}},required:['sentence'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||Object.keys(input).some(k=>k!=='sentence'))throw new Error('Provide only sentence.');const result=await analyze(input.sentence);if(!result)throw new Error('A newer sentence replaced this request.');return {sentence:result.text,stressedWords:result.tokens.filter(t=>t.stressed).map(t=>t.text),thoughtGroups:result.groups.map(g=>g.text),source:result.source};}});
  register({name:'read_speaking_practice',title:'Read the current practice',description:'Read the current sentence, suggested stress, thought groups, and recording count. Does not expose recordings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No parameters expected.');const a=state.analysis;return {sentence:a.text,stressedWords:a.tokens.filter(t=>t.stressed).map(t=>t.text),thoughtGroups:a.groups.map(g=>g.text),recordings:state.attempts.length};}});
}
})();
