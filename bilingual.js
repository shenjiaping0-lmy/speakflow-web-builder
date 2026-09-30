/* Bilingual presentation only. Practice text, provider payloads and audio timing stay in the learning model. */
(() => {
'use strict';
const normalize=text=>String(text).replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/^[▶■⤢＋+←🐢⚡\s]+|[↗→\s]+$/gu,'').trim();
const catalog=new Map(Object.entries(globalThis.SPEAKFLOW_UI_ZH||{}).map(([en,zh])=>[normalize(en),zh]));
function translate(value){
 const text=normalize(value);if(!text||/[\u3400-\u9fff]/u.test(text))return null;
 if(catalog.has(text))return catalog.get(text);
 let m;
 if((m=text.match(/^(A2|B1|B2) · (.+)$/))){const zh=translate(m[2]);if(zh)return m[1]+' · '+zh;}
 if((m=text.match(/^(\d+) words · (\d+) thought groups?$/)))return m[1]+' 个词 · '+m[2]+' 个意群';
 if((m=text.match(/^Attempt (\d+)$/)))return '第 '+m[1]+' 次录音';
 if((m=text.match(/^(\d+) saved in this tab$/)))return '当前页面已保存 '+m[1]+' 次录音';
 if((m=text.match(/^Recording · ([\d:]+)$/)))return '正在录音 · '+m[1];
 if((m=text.match(/^(\d+) \/ 4 replies$/)))return '已回答 '+m[1]+' / 4 次';
 if((m=text.match(/^([\d.]+) minutes spoken today · Your progress$/)))return '今天已录音 '+m[1]+' 分钟 · 查看进步';
 if((m=text.match(/^(\d+) \/ (\d+) expressions you can use\. Understanding is the beginning; using it makes it yours\.$/)))return '你已能运用 '+m[1]+' / '+m[2]+' 个表达。听懂是起点，用出来才是自己的语言。';
 if((m=text.match(/^0?(\d) \/ (Listen|Notice|Shadow|Speak|Review)$/i)))return '0'+m[1]+' / '+({listen:'聆听',notice:'观察',shadow:'跟读',speak:'开口',review:'复习'})[m[2].toLowerCase()];
 if((m=text.match(/^(Start|Resume) (listen|notice|shadow|speak|review)(?:ing)?$/i)))return (m[1]==='Start'?'开始':'继续')+({listen:'聆听',notice:'观察',shadow:'跟读',speak:'开口',review:'复习'})[m[2].toLowerCase()];
 if((m=text.match(/^(Listen|Notice|Shadow|Speak|Review), then make it yours\.$/)))return ({Listen:'听一听',Notice:'找变化',Shadow:'跟着读',Speak:'自己说',Review:'再复习'})[m[1]]+'，把收获变成自己的表达。';
 if((m=text.match(/^(Listen|Notice|Shadow|Speak|Review) time is complete\. Move on when you are ready\.$/)))return (catalog.get(m[1])||m[1])+'时间到了，准备好后可以进入下一步。';
 if((m=text.match(/^Time practised: ([\d:]+)\. Moving on early never adds time to your record\.$/)))return '实际练习用时 '+m[1]+'。提前进入下一步，不会增加未练习的时间。';
 if((m=text.match(/^(\d+) min$/)))return m[1]+' 分钟';
 if((m=text.match(/^0?(\d) (Linking|Weak form|Reduction|Assimilation|Elision|Dropped sound)$/)))return '0'+m[1]+' '+catalog.get(m[2]);
 if((m=text.match(/^Same sentence · ([+-]?\d+) vs Attempt (\d+)$/)))return '相同句子 · 相比第 '+m[2]+' 次录音变化 '+m[1]+' 分';
 if((m=text.match(/^AI feedback is ready for Attempt (\d+)\.$/)))return '第 '+m[1]+' 次录音的 AI 反馈已准备好。';
 if((m=text.match(/^When it is not emphasized, "(.+)" often uses a shorter, softer vowel: (.+)\. Give it less time than the key words\.$/)))return '不强调 '+m[1]+' 时，元音通常更短、更轻：'+m[2]+'。它占用的时间应比关键词少。';
 if((m=text.match(/^"(.+)" · (Function word|Content word) · (.+)$/)))return '“'+m[1]+'” · '+catalog.get(m[2])+' · '+(m[3].startsWith('Emphasized')?'已设为重读，可以突出对比或新信息。':'保持轻读，让关键词更突出。');
 if((m=text.match(/^(.+) · You are ([AB])$/)))return (catalog.get(m[1])||m[1])+' · 你扮演 '+m[2];
 if((m=text.match(/^The (conversation|transcription) service returned (\d+)\..*$/)))return (m[1]==='conversation'?'对话':'转写')+'服务返回错误 '+m[2]+'，请检查服务配置后重试。';
 if((m=text.match(/^The scoring endpoint returned (\d+)\. Check AI settings and try again\.$/)))return '评分接口返回错误 '+m[1]+'，请检查 AI 配置后重试。';
 if(text.startsWith('AI heard: '))return 'AI 识别到的内容（以英文原文为准）';
 if(text.startsWith('You said: '))return '你在这次对话中的原话';
 if(text.startsWith('Try: '))return '下次可以尝试的自然说法';
 // Compose labels such as "Coffee Chat · B1" without changing the stored scenario name.
 if(text.includes(' · ')){const pieces=text.split(' · '),translated=pieces.map(p=>catalog.get(p)||p);if(translated.some((p,i)=>p!==pieces[i]))return translated.join(' · ');}
 return null;
}
globalThis.SpeakFlowBilingual={translate,normalize};
if(typeof document==='undefined')return;
const excluded='script,style,svg,textarea,input,[data-ui-copy],[data-no-translate],.brand,.brand-signature,.leila-watermark,.guide-article,#rhythm-words,#home-rhythm,#written-sentence,#spoken-sentence,#sentence,#lesson-formula,#lesson-sound,#lesson-practice-sentence,#lesson-transfer,.chunk,.chat-bubble,.recording-sentence,.dialogue-bubble>p,#score-words,.feature summary>span:not(.feature-type),.saved-expression h3,.saved-example,.review-expression-card h4,.expression-example,.review-pair p,.retry-target,.score-metric';
const attrSource=new WeakMap();
function localizeAttributes(el){
 if(!(el instanceof HTMLElement)||el.closest(excluded))return;
 const previous=attrSource.get(el)||{};
 for(const name of ['placeholder','aria-label','title']){const value=el.getAttribute(name);if(!value||value===previous[name])continue;const zh=translate(value);if(zh){const output=value+' · '+zh;el.setAttribute(name,output);previous[name]=output;}}
 attrSource.set(el,previous);
}
function localizeText(node){
 const parent=node.parentElement;if(!parent||parent.closest(excluded))return;
 const original=node.nodeValue,english=original.trim(),zh=translate(english);if(!zh)return;
 if(parent.tagName==='OPTION'){node.nodeValue=english+' · '+zh;return;}
 // Custom presentation tags avoid inheriting legacy rules for numbered steps and other spans.
 const pair=document.createElement('sf-copy');pair.className='bilingual-copy';pair.dataset.uiCopy='';
 const en=document.createElement('sf-en');en.className='ui-en';en.lang='en';en.textContent=english;
 const cn=document.createElement('sf-zh');cn.className='ui-zh';cn.lang='zh-CN';cn.textContent=zh;
 pair.append(en,cn);node.replaceWith(document.createTextNode(original.match(/^\s*/)[0]),pair,document.createTextNode(original.match(/\s*$/)[0]));
}
function localize(root){
 if(root.nodeType===Node.TEXT_NODE){localizeText(root);return;}
 if(root.nodeType!==Node.ELEMENT_NODE||root.closest(excluded))return;
 localizeAttributes(root);root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(localizeAttributes);
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walk.nextNode())nodes.push(walk.currentNode);nodes.forEach(localizeText);
}
// Observe changed copy only; class/style mutations from karaoke do not trigger translation.
const observer=new MutationObserver(records=>{
 observer.disconnect();
 const roots=new Set();for(const r of records){if(r.type==='characterData')roots.add(r.target);else if(r.type==='attributes')localizeAttributes(r.target);else r.addedNodes.forEach(n=>roots.add(n));}
 for(const root of roots)if(root.isConnected)localize(root);
 observe();
});
function observe(){observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});}
localize(document.body);observe();
const dialog=document.getElementById('user-guide-dialog');document.getElementById('user-guide-open').addEventListener('click',()=>dialog.showModal());document.getElementById('user-guide-close').addEventListener('click',()=>dialog.close());
})();
