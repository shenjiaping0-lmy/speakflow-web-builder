/* The app shell, four-turn conversation, real voice capture, and local learning history. */
(() => {
'use strict';
const C=globalThis.SpeakFlowExperienceCore, Sound=window.SpeakFlow;
const {SCENARIOS,LEVELS,STAGES,LearningStore,RoutineClock,DemoConversationProvider,RemoteConversationProvider,EndpointSTTProvider,resolveScenario,normalizeReply,validatePartner,validateReview,dayKey,uid}=C;
const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=seconds=>{const s=Math.max(0,Math.ceil(seconds));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
let toastTimer,storageFailed=false;
function note(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200)}
function storageFailure(){storageFailed=true;}
let storage;try{storage=window.localStorage}catch{storageFailure()}
const store=new LearningStore(storage,storageFailure);
let routine=new RoutineClock(store.data.routine),routineDay=dayKey(),lastRoutineSave=0;
const providers={conversation:new DemoConversationProvider(),stt:null,tts:new Sound.providers.StudioSpeechProvider(new Sound.providers.BrowserSpeechProvider(),globalThis.SPEAKFLOW_AUDIO||[])};
const voiceRecorder=new Sound.providers.BrowserRecorder();
const ui={route:'',level:LEVELS[store.data.preferences?.level]?store.data.preferences.level:'B1',scenario:'coffee',session:null,audio:true,filter:'all',epoch:0,request:null,audioEpoch:0,voice:null,draft:null,urls:[],pending:null};

function stopAudio(){ui.audioEpoch++;providers.tts.cancel();Sound.stopAudio();$$('audio').forEach(a=>a.pause());$$('[data-home-word]').forEach(w=>w.classList.remove('current'));$('home-listen').textContent='▶ Hear the rhythm';}
async function say(text,{level=ui.session?.level||ui.level,onWord,onStart}={}){
 stopAudio();const epoch=ui.audioEpoch;
 try{return await providers.tts.speak({text,referenceText:text,rate:LEVELS[level].rate,voiceURI:'studio',onWord:i=>{if(epoch===ui.audioEpoch)onWord?.(i)},onStart:()=>{if(epoch===ui.audioEpoch)onStart?.()}})}catch(e){if(epoch===ui.audioEpoch)note(e.message||'Audio is unavailable. You can still read and reply.');return {status:'error'}}
}
function navigate(route){if(location.hash!=='#'+route)location.hash=route;showRoute(route);}
function showRoute(raw){
 const route=({main:'home','sound-lab':'sound',shadowing:'sound'})[raw]||raw;
 const next=['home','sound','speak','routine','history'].includes(route)?route:'home';
 if(ui.route!==next){stopAudio();if(ui.route==='sound')Sound.stopMedia();if(ui.route==='speak')stopVoice();if($('karaoke-dialog').open)$('karaoke-dialog').close();ui.route=next;$$('.app-view').forEach(v=>v.hidden=v.id!=='view-'+next);$$('[data-route]').forEach(b=>{const active=b.dataset.route===next;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('ai-readiness').hidden=next!=='sound';window.scrollTo({top:0,behavior:'auto'});}
 if(next==='history')renderHistory();if(next==='home')renderHome();if(next==='routine')renderRoutine();if(next==='speak')renderSpeak();renderRoutineClock();
 if(raw==='shadowing')$('shadowing').scrollIntoView({block:'start'});
}
function renderHome(){const s=store.stats();$('home-progress').textContent=s.seconds||s.totalExpressions?(s.seconds/60).toFixed(1)+' minutes spoken today · Your progress ↗':'Your practice starts here ↗';}
function renderSelection(){
 $('scenario-grid').innerHTML=SCENARIOS.map(s=>'<button class="scenario-card" data-scenario="'+s.id+'" aria-pressed="'+(ui.scenario===s.id)+'"><span class="scenario-icon" aria-hidden="true">'+s.icon+'</span><strong>'+s.title+'</strong><small>'+s.description+'</small></button>').join('')+'<button class="scenario-card surprise-card" data-scenario="surprise" aria-pressed="false"><span class="scenario-icon" aria-hidden="true">🎲</span><strong>Surprise Me</strong><small>Let a little chance decide.</small></button>';
 $$('[data-speak-level]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.speakLevel===ui.level));$('speak-level-description').textContent=ui.level+' · '+LEVELS[ui.level].description;
 $('custom-scenario-panel').hidden=ui.scenario!=='custom';$('custom-scenario-toggle').setAttribute('aria-expanded',ui.scenario==='custom');
 $('selected-scenario-label').textContent=ui.scenario==='custom'?'Your own scenario':resolveScenario(ui.scenario).title;
 $('scenario-start-note').textContent=ui.scenario==='custom'&&providers.conversation.mode==='demo'?'演示模式会匹配相近主题；精确角色扮演需要连接 AI。':'4 replies · about 3–5 minutes · feedback at the end';
 const demo=providers.conversation.mode==='demo';$('demo-disclosure').textContent=demo?'Demo mode · 准备好的对话路径与简单关键词回应。连接 AI 服务后可获得开放式对话和个性化反馈。':'Connected AI · Your conversation text will be sent to the service you configured.';
 $('conversation-settings-open').textContent=demo?'Demo partner ↗':'Connected AI ↗';
}
function busy(){return !!ui.session&&['starting','thinking','reviewing'].includes(ui.session.phase)}
function renderSpeak(){
 renderSelection();const s=ui.session;
 $('speak-selection').hidden=!!s;$('speak-conversation').hidden=!s||s.phase==='review';$('speak-review').hidden=!s||s.phase!=='review';
 if(!s)return;if(s.phase==='review'){renderReview();return;}
 const count=s.messages.filter(m=>m.role==='user').length;
 $('conversation-context').textContent=s.scenario.title+' · '+s.level+(s.retryOf?' · Another little conversation':'');$('conversation-progress').textContent=count+' / 4 replies';
 $('turn-track').innerHTML=[0,1,2,3].map(i=>'<i class="'+(i<count?'complete':i===count?'current':'')+'"></i>').join('');
 $('partner-label').textContent=s.mode==='demo'?'Your demo conversation partner':'Your AI conversation partner';
 $('voice-privacy').textContent=s.stt?'Your recording is sent to your configured transcription service. Check the transcript before sending it to Maya.':'Browser voice recognition may process audio online. Your confirmed words are saved locally with the completed conversation.';
 $('use-demo-reply').hidden=s.mode!=='demo';$('conversation-audio-toggle').textContent=ui.audio?'Voice on':'Voice off';$('conversation-audio-toggle').setAttribute('aria-pressed',ui.audio);
 const log=$('conversation-messages');
 // Reuse existing message nodes so live regions announce only the new response.
 const existing=new Set([...log.children].map(n=>n.dataset.message));
 if([...log.children].some(n=>!s.messages.some(m=>m.id===n.dataset.message)))log.replaceChildren();
 s.messages.forEach(m=>{if(existing.has(m.id))return;const el=document.createElement('div');el.className='chat-message '+(m.role==='user'?'learner':'partner');el.dataset.message=m.id;el.innerHTML='<span class="message-speaker">'+(m.role==='user'?'You'+(m.source==='demo'?' · demo reply':''):'Maya')+'</span><div class="chat-bubble">'+esc(m.text)+'</div>';log.append(el)});
 log.scrollTop=log.scrollHeight;
 $('voice-composer').hidden=!['ready','listening','transcribing'].includes(s.phase);
 $('show-speaking-review').hidden=s.phase!=='complete';$('conversation-error').hidden=!s.error;$('conversation-error-text').textContent=s.error||'';
 $('conversation-status').textContent=({starting:'Maya is joining you…',thinking:'Maya is listening to your idea…',reviewing:'Choosing a few useful things to take with you…',complete:'Four replies. A real moment of practice. Ready for your review?'})[s.phase]||'';
 $('retry-targets').hidden=!s.focusExpressions?.length;$('retry-expression-list').innerHTML=(s.focusExpressions||[]).map(e=>'<span class="retry-target">'+esc(e.phrase)+'</span>').join('');
 $('replay-partner').disabled=busy()||s.phase==='listening'||s.phase==='transcribing';
 renderComposer();
}
function renderComposer(){
 const phase=ui.session?.phase,draft=ui.draft,recording=voiceRecorder.state==='recording',requesting=voiceRecorder.state==='requesting';
 const record=$('speak-record');record.disabled=phase==='transcribing'||voiceRecorder.state==='stopping';record.classList.toggle('recording',recording);record.classList.toggle('draft-ready',!!draft);record.hidden=!!draft&&phase==='ready';
 record.querySelector('span').textContent=requesting?'Cancel microphone request':recording?'Stop & check my words':phase==='transcribing'?'Getting your words ready…':'Hold the thought. Start speaking.';
 $('speak-voice-level').hidden=!recording;$('reply-editor').hidden=!draft;$('show-typed-reply').disabled=phase!=='ready';$('use-demo-reply').disabled=phase!=='ready';
 $('send-reply').disabled=phase!=='ready'||!$('speak-reply').value.trim();
 $('voice-status').textContent=requesting?'Allow your microphone to begin.':recording?'Speak in one thought. Up to 30 seconds.':phase==='transcribing'?'Preparing your recording and transcript…':draft?'Check the words. Then send your idea.':'Your turn. Say it your way.';
 if(!recording)$('voice-elapsed').textContent='';
 if(draft){$('reply-source-label').textContent=draft.note||(draft.source==='demo'?'Demo reply · no voice minutes added':draft.source==='voice'?'Your recording · editable transcript':'Typed reply · no voice minutes added');$('speak-draft-audio').hidden=!draft.url;if(draft.url&&$('speak-draft-audio').src!==draft.url)$('speak-draft-audio').src=draft.url;}
}
function cancelRequest(){ui.request?.abort();ui.request=null;ui.epoch++;}
function clearSession(){cancelRequest();stopVoice(true);stopAudio();ui.session=null;ui.pending=null;ui.draft=null;ui.urls.forEach(URL.revokeObjectURL);ui.urls=[];$('conversation-messages').replaceChildren();$('speak-draft-audio').removeAttribute('src');$('speak-reply').value='';renderSpeak();}
function newConversation(previous=null,focus=null){
 let scenario;try{scenario=previous?.scenario||resolveScenario(ui.scenario,$('custom-scenario').value)}catch(e){note(e.message);$('custom-scenario').focus();return;}
 clearSession();ui.session={id:uid(),scenario,level:previous?.level||ui.level,mode:providers.conversation.mode||'connected',provider:providers.conversation,stt:providers.stt,phase:'starting',messages:[],retryOf:previous?.id||null,focusExpressions:focus||previous?.review?.expressions||[]};navigate('speak');renderSpeak();runOperation('start');
}
async function runOperation(operation){
 const s=ui.session;if(!s)return;ui.request?.abort();const controller=new AbortController();ui.request=controller;const epoch=++ui.epoch;const timeout=setTimeout(()=>controller.abort(),35000);ui.pending=operation;s.error=null;s.phase=operation==='review'?'reviewing':operation==='start'?'starting':'thinking';renderSpeak();
 try{
  const context={...s,signal:controller.signal};const result=await s.provider[operation](context);if(epoch!==ui.epoch||s!==ui.session)return;
  if(operation==='review'){s.review=validateReview(result,s.messages);s.completedAt=new Date().toISOString();s.phase='review';store.addSession(s);store.collect(s.review.expressions,s.id);renderHistory();renderHome();}
  else{const closing=s.messages.filter(m=>m.role==='user').length>=4;const reply=validatePartner(result,closing);s.messages.push({id:uid(),role:'assistant',text:reply.text});s.phase=closing?'complete':'ready';if(ui.audio&&ui.route==='speak')say(reply.text,{level:s.level});}
  ui.pending=null;renderSpeak();
 }catch(e){if(epoch!==ui.epoch||s!==ui.session)return;s.error=e.name==='AbortError'?'The service took too long. Your reply is still here. Please retry.':e.message||'The connection was interrupted. Your reply is still here.';s.phase='error';renderSpeak();}
 finally{clearTimeout(timeout);if(epoch===ui.epoch)ui.request=null;}
}
function setDraft(text,source,extra={}){ui.draft={source,...extra};$('speak-reply').value=text;renderComposer();if(ui.route==='speak')$('speak-reply').focus();}
function sendReply(){const s=ui.session;if(!s||s.phase!=='ready')return;try{const text=normalizeReply($('speak-reply').value);stopAudio();s.messages.push({id:uid(),role:'user',text,source:ui.draft?.source||'typed'});ui.draft=null;$('speak-reply').value='';$('speak-draft-audio').pause();runOperation('reply')}catch(e){note(e.message)}}

// Record the learner. Recognition only supplies an editable transcript, never a score.
async function startVoice(){
 const s=ui.session;if(!s)return;
 if(voiceRecorder.state==='requesting'){stopVoice();return;}if(voiceRecorder.state==='recording'){voiceRecorder.stop();try{ui.voice?.recognition?.stop()}catch{}renderComposer();return;}
 if(s.phase!=='ready'||voiceRecorder.state!=='idle')return;stopAudio();ui.draft=null;
 const v={session:s,cancelled:false,transcript:'',recognition:null,recognitionDone:null};ui.voice=v;s.phase='listening';renderSpeak();
 try{const pendingRecording=voiceRecorder.start({
  onStart:()=>{
   if(v.cancelled){voiceRecorder.stop();return;}
   const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
   if(Recognition&&!s.stt){try{const r=new Recognition();v.recognition=r;r.lang='en-US';r.continuous=true;r.interimResults=true;v.recognitionDone=new Promise(resolve=>{r.onend=resolve;r.onerror=e=>{v.recognitionError=e.error;resolve()}});r.onresult=e=>{let words='';for(let i=0;i<e.results.length;i++)words+=e.results[i][0].transcript+' ';v.transcript=words.trim()};r.start()}catch{v.recognitionError='unavailable'}}
   renderComposer();
  },
  onLevel:level=>$('speak-voice-level').style.setProperty('--level',String(level)),
  onElapsed:seconds=>$('voice-elapsed').textContent=time(seconds)+' / 0:30',
  onStop:recording=>finishVoice(v,recording),
  onError:e=>{v.recognition?.abort();if(s!==ui.session)return;s.phase='ready';ui.voice=null;renderSpeak();note(e.message||'Microphone unavailable. You can type your reply.');setDraft('','typed',{note:'Microphone unavailable · type what you wanted to say.'})}
 });renderComposer();await pendingRecording;}catch(e){if(s===ui.session){s.phase='ready';ui.voice=null;renderSpeak();note(e.message);}}
}
async function finishVoice(v,{blob,duration}){
 if(duration>.15)store.event('speech',{seconds:duration,sessionId:v.session.id});
 try{v.recognition?.stop()}catch{}
 if(v.cancelled||v.session!==ui.session)return;
 const s=v.session;s.phase='transcribing';renderSpeak();const url=URL.createObjectURL(blob);ui.urls.push(url);let text='',hint='Your recording · check the transcript before sending.';
 try{
  if(s.stt){const abort=new AbortController();v.transcriptionAbort=abort;const timer=setTimeout(()=>abort.abort(),30000);try{text=(await s.stt.transcribe({blob,signal:abort.signal})).text}finally{clearTimeout(timer)}}
  else{await Promise.race([v.recognitionDone||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,1200))]);text=v.transcript;if(!text)hint='Recording saved. Voice recognition is unavailable or heard no words; type what you said.';}
 }catch(e){hint='Recording saved. Transcription failed; listen back and type your words.';if(!v.cancelled)note(e.name==='AbortError'?'Transcription timed out. Your recording is still available.':e.message)}
 if(v.cancelled||s!==ui.session)return;s.phase='ready';ui.voice=null;setDraft(text,'voice',{url,note:hint});renderSpeak();
}
function stopVoice(discard=false){
 const v=ui.voice;if(!v)return;
 if(discard){v.cancelled=true;v.transcriptionAbort?.abort();}
 if(voiceRecorder.state==='requesting'){v.cancelled=true;voiceRecorder.cancelRequest();if(v.session===ui.session)v.session.phase='ready';ui.voice=null;}
 else if(voiceRecorder.state==='recording')voiceRecorder.stop();
 try{v.recognition?.stop()}catch{}
 renderComposer();
}

function renderReview(){const s=ui.session;if(!s?.review)return;$('review-context').textContent=s.scenario.title+' · '+s.level+(s.mode==='demo'?' · Demo feedback: simple language patterns, not a pronunciation assessment.':' · A few useful changes, from your actual conversation.');
 $('review-improvements').innerHTML=s.review.improvements.map(p=>'<div class="review-pair"><div><span>01 / YOU SAID</span><p>'+esc(p.said)+'</p></div><div><span>02 / MORE NATURAL</span><p>'+esc(p.natural)+'</p><small>'+esc(p.note||'Keep your meaning. Try this wording next time.')+'</small></div></div>').join('');
 $('review-expressions').innerHTML=s.review.expressions.map((e,i)=>'<article class="review-expression-card"><span class="expression-number">0'+(i+1)+'</span><h4>'+esc(e.phrase)+'</h4><p class="expression-meaning">'+esc(e.meaningZh)+'</p><p class="expression-example">'+esc(e.example)+'</p><button class="text-btn" data-review-listen="'+i+'">▶ Hear &amp; borrow it</button></article>').join('');
 $('review-saved-status').textContent=storageFailed?'Available in this session':'Saved to My Expressions';
}
function renderHistory(){
 const s=store.stats();$('history-date').textContent=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'});
 const metrics=[[(s.seconds/60).toFixed(1),'Minutes spoken','Recorded voice time'],[s.shadowed,'Sentences shadowed','Each recorded attempt'],[s.newExpressions,'New expressions learned','Collected today · use them next'],[s.streak,'Day practice streak','A little, consistently']];
 $('history-metrics').innerHTML=metrics.map(([n,label,sub])=>'<div class="history-metric"><strong>'+n+'</strong><span>'+label+'</span><small>'+sub+'</small></div>').join('');
 $('active-vocabulary-note').textContent=s.totalExpressions?s.usable+' / '+s.totalExpressions+' expressions you can use. Understanding is the beginning; using it makes it yours.':'A useful phrase is one you can bring into your next conversation.';
 $$('[data-expression-filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.expressionFilter===ui.filter));const expressions=store.data.expressions.filter(e=>ui.filter==='all'||e[ui.filter]);
 $('expression-library').innerHTML=expressions.length?expressions.map(e=>'<article class="saved-expression"><div><h3>'+esc(e.phrase)+'</h3><p>'+esc(e.meaningZh)+'</p><p class="saved-example">'+esc(e.example)+'</p><div class="saved-expression-actions"><button class="text-btn" data-expression-listen="'+esc(e.id)+'">▶ Hear it</button><button class="text-btn" data-expression-use="'+esc(e.id)+'">Use it in a conversation ↗</button></div></div><div class="expression-mastery"><label><input type="checkbox" data-mastery="understood" data-expression-id="'+esc(e.id)+'" '+(e.understood?'checked':'')+'>I can understand it</label><label><input type="checkbox" data-mastery="usable" data-expression-id="'+esc(e.id)+'" '+(e.usable?'checked':'')+'>I can use it</label></div></article>').join(''):'<div class="history-empty"><h3>'+(s.totalExpressions?'A little room to grow.':'Your next conversation starts a collection.')+'</h3><p>'+(s.totalExpressions?'Use a phrase in a new sentence, then mark it here.':'Finish one short conversation. Keep three expressions you can actually use.')+'</p><a class="primary-btn" href="#speak">Open Speak Lab ↗</a></div>';
 $('recent-conversations').innerHTML=store.data.sessions.length?store.data.sessions.slice(0,12).map(s=>'<details class="session-row"><summary><span>'+esc(s.scenario.title)+' · '+esc(s.level)+'</span><small>'+new Date(s.completedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' · '+(s.mode==='demo'?'Demo partner':'Connected AI')+'</small></summary><div class="session-detail">'+s.review.improvements.map(p=>'<p>You said: '+esc(p.said)+'<br><strong>Try: '+esc(p.natural)+'</strong></p>').join('')+'<button class="text-btn" data-session-retry="'+esc(s.id)+'">Try this conversation again ↗</button></div></details>').join(''):'<div class="history-empty"><p>Your completed conversations will appear here.</p></div>';
 $('history-storage-note').textContent=storageFailed?'This browser cannot save history. Your practice remains available in this tab until you close or refresh it.':'History stays in this browser. Audio recordings and API keys are not saved in learning history.';$$('.local-save-label').forEach(el=>el.textContent=storageFailed?'Session only':'Saved on this device');
}

function saveRoutine(){if(!store.data.routine&&!routine.running&&!routine.elapsed.some(Boolean)&&!routine.done.some(Boolean))return;store.data.routine=routine.snapshot();store.save();}
function routineComplete(){return routine.done.every(Boolean)}
function renderRoutine(){
 const stage=STAGES[routine.index],complete=routineComplete();
 $('routine-timeline').innerHTML=STAGES.map((s,i)=>'<div class="routine-step '+(i===routine.index?'active ':'')+(routine.done[i]?'done':'')+'" '+(i===routine.index?'aria-current="step"':'')+'><span class="routine-step-index">'+(routine.done[i]?'✓':'0'+(i+1))+'</span><div class="routine-step-content"><div><h3>'+s.title+'</h3><span>'+s.seconds/60+' min</span></div><p>'+s.prompt+'</p><small>'+s.tip+'</small></div></div>').join('');
 $('routine-focus-label').textContent=complete?'YOUR PRACTICE, MADE YOUR OWN':'0'+(routine.index+1)+' / '+stage.title.toUpperCase();$('routine-stage-heading').textContent=complete?'A little more flow. Take it with you.':stage.title+', then make it yours.';$('routine-stage-description').textContent=complete?'You moved through all five steps. Keep one useful expression in your next real conversation.':stage.prompt;$('routine-guidance').textContent=complete?'Time practised: '+time(routine.elapsed.reduce((a,b)=>a+b,0))+'. Moving on early never adds time to your record.':stage.tip;
 $('routine-open-stage').textContent=complete?'Visit My Expressions':stage.action;$('routine-next').hidden=complete;$('routine-next').textContent=routine.index===4?'Finish my practice':'Move to next step';renderRoutineClock();
}
function renderRoutineClock(){
 const complete=routineComplete(),stage=STAGES[routine.index],remaining=routine.remaining(),total=routine.elapsed.reduce((a,b)=>a+b,0),stageDone=routine.done[routine.index];
 $('routine-time').textContent=complete?time(total):time(remaining);$('routine-timer-state').textContent=complete?'Actual time practised':routine.running?'A little focus. Keep going.':stageDone?'This step is ready to close.':'Paused · at your pace';
 const circumference=2*Math.PI*96;$('routine-ring-progress').style.strokeDasharray=String(circumference);$('routine-ring-progress').style.strokeDashoffset=String(circumference*(1-(complete?total/900:routine.elapsed[routine.index]/stage.seconds)));
 $('routine-start').textContent=complete?'Practise another conversation ↗':routine.running?'Pause my timer':stageDone?'Continue to next step ↗':(routine.elapsed[routine.index]>0?'Resume ':'Start ')+stage.title.toLowerCase()+' ↗';
 $('routine-dock').hidden=ui.route==='routine'||complete||!store.data.routine;
 $('routine-dock-stage').textContent='0'+(routine.index+1)+' / '+stage.title;$('routine-dock-time').textContent=time(remaining);$('routine-dock-progress').style.width=total/900*100+'%';$('routine-dock-pause').textContent=routine.running?'Pause':'Resume';$('routine-dock-pause').disabled=stageDone;$('routine-dock-next').textContent=routine.index===4?'Finish':'Next →';
}
function openStage(){const stage=STAGES[routine.index];if(routineComplete()){navigate('history');return;}navigate(stage.route);if(stage.route==='sound'){Sound.showTab(stage.tab||'rhythm');if(stage.id==='shadow')$('shadowing').scrollIntoView({block:'start',behavior:'smooth'});}}
function finishRoutine(){if(routineComplete()&&!store.data.events.some(e=>e.type==='routine-complete'&&e.day===dayKey())){store.event('routine-complete');note('Five steps, a little more flow. Take one expression with you.');}}
function nextStage(){routine.next();saveRoutine();finishRoutine();renderRoutine();if(!routineComplete()){routine.start();saveRoutine();openStage();renderRoutineClock();}else navigate('routine');}
function toggleRoutine({open=false}={}){if(routineComplete()){navigate('speak');return;}if(routine.done[routine.index]){nextStage();return;}if(routine.running)routine.pause();else{routine.start();if(open)openStage();}saveRoutine();renderRoutine();}
setInterval(()=>{if(dayKey()!==routineDay){routine.pause();routine=new RoutineClock();routineDay=dayKey();store.data.routine=null;store.save();renderRoutine();renderHome();if(ui.route==='history')renderHistory();}const wasRunning=routine.running;routine.tick();if(wasRunning&&!routine.running){saveRoutine();finishRoutine();renderRoutine();note(STAGES[routine.index].title+' time is complete. Move on when you are ready.');}if(routine.running&&performance.now()-lastRoutineSave>5000){saveRoutine();lastRoutineSave=performance.now();}renderRoutineClock();},250);

// Keep the real player and word nodes in the presentation view: no second clock.
let focusAnchors=[];
function openFocus(){Sound.showTab('rhythm');for(const [node,target] of [[$('rhythm-stage'),$('focus-stage')],[$('rhythm-panel').parentElement.querySelector('.player'),$('focus-controls')]]){const anchor=document.createComment('karaoke position');node.before(anchor);focusAnchors.push({node,anchor});target.append(node)}$('karaoke-dialog').showModal();}
function restoreFocus(){for(const {node,anchor} of focusAnchors){anchor.replaceWith(node)}focusAnchors=[];}

$('home-start').addEventListener('click',()=>navigate('routine'));
$('home-listen').addEventListener('click',async()=>{const button=$('home-listen');if(button.dataset.playing==='true'){stopAudio();button.dataset.playing='false';return;}button.dataset.playing='true';$('home-listen-status').textContent='Listen for pick‿it‿up.';await say('Can you pick it up for me?',{level:'B1',onStart:()=>button.textContent='■ Stop listening',onWord:i=>$$('[data-home-word]').forEach(w=>w.classList.toggle('current',Number(w.dataset.homeWord)===i))});button.dataset.playing='false';button.textContent='▶ Hear the rhythm';$$('[data-home-word]').forEach(w=>w.classList.remove('current'));});
$('scenario-grid').addEventListener('click',e=>{const b=e.target.closest('[data-scenario]');if(!b)return;ui.scenario=b.dataset.scenario==='surprise'?SCENARIOS.filter(s=>s.id!==ui.scenario)[Math.floor(Math.random()*8)].id:b.dataset.scenario;renderSelection();});
$$('[data-speak-level]').forEach(b=>b.addEventListener('click',()=>{ui.level=b.dataset.speakLevel;store.data.preferences.level=ui.level;store.save();renderSelection()}));
$('custom-scenario-toggle').addEventListener('click',()=>{ui.scenario=ui.scenario==='custom'?'coffee':'custom';renderSelection();if(ui.scenario==='custom')$('custom-scenario').focus()});
$('start-conversation').addEventListener('click',()=>newConversation());
$('change-scenario').addEventListener('click',clearSession);$('review-new-scenario').addEventListener('click',clearSession);
$('show-typed-reply').addEventListener('click',()=>{stopAudio();setDraft('','typed')});$('use-demo-reply').addEventListener('click',()=>{const s=ui.session;if(!s||s.phase!=='ready')return;stopAudio();setDraft(s.scenario.samples[s.messages.filter(m=>m.role==='user').length]||'That sounds nice. I would like to try it.','demo')});
$('speak-reply').addEventListener('input',()=>{if(ui.draft?.source==='demo')ui.draft={source:'typed'};renderComposer()});$('send-reply').addEventListener('click',sendReply);$('speak-record').addEventListener('click',startVoice);
$('conversation-error-retry').addEventListener('click',()=>{if(ui.pending)runOperation(ui.pending)});$('show-speaking-review').addEventListener('click',()=>runOperation('review'));
$('conversation-audio-toggle').addEventListener('click',()=>{ui.audio=!ui.audio;if(!ui.audio)stopAudio();renderSpeak()});$('replay-partner').addEventListener('click',()=>{const m=ui.session?.messages.filter(m=>m.role==='assistant').at(-1);if(m)say(m.text)});
$('review-expressions').addEventListener('click',e=>{const b=e.target.closest('[data-review-listen]');if(b)say(ui.session.review.expressions[Number(b.dataset.reviewListen)].phrase)});
$('try-conversation-again').addEventListener('click',()=>newConversation(ui.session));
$$('[data-expression-filter]').forEach(b=>b.addEventListener('click',()=>{ui.filter=b.dataset.expressionFilter;renderHistory()}));
$('expression-library').addEventListener('change',e=>{const b=e.target.closest('[data-mastery]');if(b){store.mastery(b.dataset.expressionId,b.dataset.mastery,b.checked);renderHistory()}});
$('expression-library').addEventListener('click',e=>{const listen=e.target.closest('[data-expression-listen]'),use=e.target.closest('[data-expression-use]');const id=listen?.dataset.expressionListen||use?.dataset.expressionUse,expression=store.data.expressions.find(x=>x.id===id);if(!expression)return;if(listen)say(expression.phrase);else{const session=store.data.sessions.find(s=>s.id===expression.sourceSessionId);if(session)newConversation(session,session.review.expressions);else{ui.scenario='coffee';newConversation(null,[expression]);}}});
$('recent-conversations').addEventListener('click',e=>{const b=e.target.closest('[data-session-retry]');if(b)newConversation(store.data.sessions.find(s=>s.id===b.dataset.sessionRetry))});
$('routine-start').addEventListener('click',()=>toggleRoutine({open:true}));$('routine-open-stage').addEventListener('click',openStage);$('routine-next').addEventListener('click',nextStage);$('routine-dock-next').addEventListener('click',nextStage);$('routine-dock-pause').addEventListener('click',()=>toggleRoutine());
$('focus-open').addEventListener('click',openFocus);$('focus-close').addEventListener('click',()=>$('karaoke-dialog').close());$('karaoke-dialog').addEventListener('close',restoreFocus);
$('conversation-settings-open').addEventListener('click',()=>$('conversation-settings-dialog').showModal());$('conversation-settings-close').addEventListener('click',()=>$('conversation-settings-dialog').close());$('conversation-mode').addEventListener('change',()=>$('conversation-endpoint-fields').hidden=$('conversation-mode').value!=='connected');
$('conversation-config-form').addEventListener('submit',e=>{e.preventDefault();try{const conversation=$('conversation-mode').value==='demo'?new DemoConversationProvider():new RemoteConversationProvider({url:$('conversation-api-url').value.trim(),token:$('conversation-api-token').value.trim()}),stt=$('conversation-stt-url').value.trim()?new EndpointSTTProvider({url:$('conversation-stt-url').value.trim(),token:$('conversation-stt-token').value.trim()}):null;providers.conversation=conversation;providers.stt=stt;$('conversation-config-error').hidden=true;$('conversation-settings-dialog').close();renderSelection();note('Connection settings applied to your next conversation.')}catch(error){$('conversation-config-error').textContent=error.message;$('conversation-config-error').hidden=false;}});
window.addEventListener('hashchange',()=>showRoute(location.hash.slice(1)));
window.addEventListener('speakflow:activity',e=>{if(e.detail?.type==='shadow'){store.event('shadow',{seconds:e.detail.seconds,sentence:e.detail.sentence});renderHome();if(ui.route==='history')renderHistory();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){routine.pause();saveRoutine();stopAudio();stopVoice();renderRoutineClock();}});
window.addEventListener('pagehide',()=>{routine.pause();saveRoutine();cancelRequest();stopVoice(true);voiceRecorder.dispose();providers.tts.cancel();ui.urls.forEach(URL.revokeObjectURL)});
// Sound Lab and conversation audio share the microphone and speaker, never overlap.
$('view-sound').addEventListener('click',e=>{if(e.target.closest('.speed-btn,.word,.chunk,.lesson-action,.library-open,#practice-action,#record-direct')){ui.audioEpoch++;providers.tts.cancel();}} ,true);
renderSelection();renderHistory();renderRoutine();showRoute(location.hash.slice(1)||'home');
window.SpeakFlowExperience={version:'3.0.0',navigate,getState:()=>({route:ui.route,level:ui.level,phase:ui.session?.phase||'selection',turns:ui.session?.messages.filter(m=>m.role==='user').length||0,stats:store.stats(),routine:routine.snapshot()}),configure({conversationProvider,sttProvider,ttsProvider}={}){if(conversationProvider){for(const m of ['start','reply','review'])if(typeof conversationProvider[m]!=='function')throw new Error('conversationProvider must implement start, reply, and review.');providers.conversation=conversationProvider;}if(sttProvider!==undefined){if(sttProvider&&typeof sttProvider.transcribe!=='function')throw new Error('sttProvider must implement transcribe({blob, signal}).');providers.stt=sttProvider;}if(ttsProvider){if(typeof ttsProvider.speak!=='function'||typeof ttsProvider.cancel!=='function')throw new Error('ttsProvider must implement speak and cancel.');stopAudio();providers.tts=ttsProvider;}renderSelection();}};
})();
