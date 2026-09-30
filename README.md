# SpeakFlow 3

## 当前公开入口（2026-09-27）

- 练习网站：https://speakflow-ms-leila.vercel.app/
- 学习者指南：https://speakflow-ms-leila.vercel.app/guide
- 部署管理：https://vercel.com/leila17/speakflow-ms-leila/2VGgRmafH86AgPrQazaKkMS3QANf
- 本次公开发布已归属当前 Vercel 账户，无需认领。旧 chatgpt.site 地址在浏览器中出现 Cloudflare 拦截；直播和分享优先使用上面的 Vercel 地址。
- 发布目录：相邻的 `../speakflow-ms-leila/`，仅包含最终 HTML 与静态托管配置；源代码仍保留在本目录。以后修改需先运行 `build.py`，将 `dist/index.html` 与 `dist/guide.html` 同步到发布目录，再对已关联的 Vercel 项目发布。
- 已验证：无需登录的 HTTPS GET、首页与指南 HTTP 200、发布内容与本地文件完全一致、浏览器首页正常显示。未重新进行真实麦克风录音或外部 AI 服务评测。


一个可携带的 HTML 英语口语练习应用：Sound Lab → Speak Lab → 精选反馈 → 再说一次。

打开 `SpeakFlow.html` 即可使用界面与内置音频。麦克风和浏览器转写建议通过 localhost 或 HTTPS 使用。当前本地预览为 http://127.0.0.1:8741/?v=3#home 。

## 完整体验

- **Home**：简洁入口、可播放的连读示范、15 分钟练习入口。
- **Sound Lab**：句子分析、重音与意群、6 个连读教学小课、8 组共 32 句可分角色练习的对话、录音回听、可配置 AI 发音评分。
- **Stress Karaoke**：45 段内置示范与逐词时间戳，三档速度读取同一个音频时钟；Focus mode 放大真实播放器与单词节点，适合投屏。自定义句子使用浏览器 TTS，有可靠词边界时跟随边界，否则标注近似同步。
- **Speak Lab**：Coffee Chat、Travel、Work、Shopping、Friends、Restaurant、Social Events、Dating、Daily Life、Surprise Me，以及自定义场景。A2/B1/B2 改变词汇、句长、问题和播放速度。
- **四轮交流**：搭档自然开场，每轮只问一个问题；学习者录音、确认转写、发送。无法转写时可以听回自己的录音后输入，或明确选择演示回答。
- **课后反馈**：只给 1–2 处有用改写；引用学习者原话；收藏本轮实际出现的 3 个表达，附中文意思与例句。Try Again 以类似场景和不同开场继续练习，并带着这三个表达。
- **15 分钟练习**：Listen 3 分钟、Notice 3 分钟、Shadow 3 分钟、Speak 4 分钟、Review 2 分钟。练习时有浮动计时条，离开标签页自动暂停。可以提前进入下一步，但不会补算未练习的时间。
- **My progress**：当天录音分钟数、影子跟读次数、新收藏表达、连续练习天数；可回看对话反馈。My Expressions 分别标记 I can understand it / I can use it，并可直接再次用于对话。

## 演示与真实 AI 的边界

默认 **Demo partner** 使用准备好的场景路径和简单关键词回应，可完整演示四轮交流与复练。它不能理解任意复杂回答；自定义场景会匹配相近主题，精确角色扮演需连接 AI。

演示反馈使用少量语言模式，不是发音评测。应用不会生成虚构的 AI 发音分数，也不会把演示回答冒充语音识别结果。文字输入、示例回复不会增加开口时长。

Sound Lab 的句子分析属于本地启发式建议，重音会因语境和说话意图变化。标准书面英语与近似口语发音始终分开标注。

## 配置真实发音评分

1. 在 Sound Lab 点击 **AI · Set up** 或 **Your AI coach → Settings**。
2. 选择 **Azure Speech**，填写 region 与 Speech key，再点击 **Save for this session**。
3. 录一句并点击 **Send recording · Get AI feedback**，才发送该录音和目标句进行评测。

Azure SDK 按需从微软官方地址加载。显示服务实际返回的综合分、准确度、流利度、韵律、完整度；缺失项保留为空。支持词级、音素级反馈和相同句子的多次录音比较。韵律分综合重音、语调、节奏等，并不是单独的连读分。

也可选择 **My scoring endpoint**：HTTPS 或 localhost HTTP，接收 multipart/form-data POST：

- `audio`：16 kHz、单声道、16-bit PCM WAV
- `referenceText`：目标句
- `language`：en-US

返回 Azure 格式的 JSON，`RecognitionStatus: "Success"`，`NBest[0].PronunciationAssessment` 与 `Words`。评分范围 0–100。跨域接口需正确设置 CORS。

## 配置开放式 AI 对话

在 Speak Lab 右上角点击 **Demo partner ↗**，选择 **Connected AI**。填写自己维护的对话接口 URL 和可选 access token。设置应用于下一次对话，已开始的会话继续使用原来的服务。

接口接收 JSON POST，若填写 token，则带 `Authorization: Bearer ...`。浏览器发送最少需要的文字，不会把学习记录或录音发送给对话接口：

```json
{
  "operation": "reply",
  "scenario": {"id":"coffee","title":"Coffee Chat","description":"Catch up over something warm."},
  "level":"B1",
  "targetTurns":4,
  "maxResponseWords":44,
  "retry":false,
  "focusExpressions":[],
  "messages":[
    {"role":"assistant","content":"What have you been up to lately?"},
    {"role":"user","content":"I have been busy with work."}
  ],
  "instructions":"Level-specific language and communication-first guidance."
}
```

`operation` 可以是 `start` / `reply` / `review`。`start` 与前 3 次 `reply` 返回一条自然回应，恰好包含一个问号所表示的跟进问题：

```json
{"text":"That sounds like a full week. What has been keeping you busiest?"}
```

第 4 个学习者回答之后返回结束语，不再追问。客户端根据真实回合数结束，不依赖模型自己计算回合。

`review` 返回 1–2 个改写和恰好 3 个不同表达：

```json
{
  "improvements":[{
    "said":"Recently I'm very busy because I have many works.",
    "natural":"I've been pretty busy lately because I've had a lot going on.",
    "note":"保留原意，用更自然的方式聊近况。"
  }],
  "expressions":[
    {"phrase":"I've been pretty busy lately.","meaningZh":"我最近一直挺忙的。","example":"I've been pretty busy lately, so I need a break."},
    {"phrase":"I've had a lot going on.","meaningZh":"我最近事情比较多。","example":"I've had a lot going on. A quiet evening sounds nice."},
    {"phrase":"I'm trying to make time for","meaningZh":"我在尽量抽时间做……","example":"I'm trying to make time for reading."}
  ]
}
```

上面是格式示例：`said` 必须逐字引用该会话中真实的学习者回答，三个 `phrase` 必须都已在该会话中出现。客户端验证这些约束，失败时保留原对话并提供重试；不会填充伪造的反馈。服务端需让模型在交流中自然使用值得复用的短语，并按所选级别调整用词和句长。

接口由自己的后端调用任意 LLM；供应商的长期密钥放在后端。浏览器设置可使用自己的短期访问令牌。后端需支持 CORS、JSON 响应与中断请求。

## 语音转写与 TTS

未设置 STT 接口时优先使用浏览器 SpeechRecognition / webkitSpeechRecognition（并非所有浏览器支持，可能在线处理音频）。学习者始终先检查识别的文字再发送，不会仅凭识别结果评分。

可选转写接口接收 multipart/form-data POST：`audio` 为实际浏览器录音（通常 WebM/Opus 或 MP4/AAC），`language` 为 en-US。返回：

```json
{"text":"I have been busy with work lately."}
```

填写 STT 接口后，停止录音会发送该段音频用于转写。失败时仍保留录音，可回听并手动输入原话。每次录音最多约 30 秒，适合一个短回复；麦克风权限拒绝、设备占用和不支持录音均有提示。

内置 Studio voice 音频无需联网。新句子与对话使用浏览器 TTS。`window.SpeakFlowExperience.configure({conversationProvider, sttProvider, ttsProvider})` 可替换服务：

- `conversationProvider.start(context) / reply(context) / review(context)`：遵循上述结果格式；context 含 `signal`、`scenario`、`level`、`messages`、`focusExpressions`。
- `sttProvider.transcribe({blob, signal})`：返回 `{text}`。
- `ttsProvider.speak({text, rate, voiceURI, onStart, onWord})`：返回 Promise，结束结果 `{status:"ended"}`；配套 `cancel()`；`onWord` 接收从 0 开始的单词序号。
- Sound Lab 保留 `window.SpeakFlow.configure()` 接口，可替换分析、TTS 和 pronunciation provider。

## 保存与隐私

学习记录仅保存在当前浏览器的 localStorage：已完成的对话文字、精选反馈、表达状态、计时和练习次数。录音和 API token 留在当前标签页内存，不写入 HTML 或学习历史。刷新前请下载需要保留的 Sound Lab 录音。

开口分钟数指实际录音时长，并非语音活动检测后的纯发声时长。影子跟读同一句的多次录音分别计次。使用文字完成的对话可计为一次练习、建立连续练习天数，但不增加开口分钟数。

隐私模式、清除浏览器数据或更换浏览器可能导致记录不可用；存储失败时显示 Session only 并保留当前内存记录。通过 file:// 直接打开时，本地存储与麦克风支持依浏览器而异，建议使用预览地址。

## 源码与验证

先定义的架构保存在 `ARCHITECTURE.md`，包括信息架构、页面、组件、模型和状态流。

- `app.js` / `services.js`：Sound Lab、声音与真实评分适配器。
- `experience-core.js`：场景、等级、Demo/Remote/STT provider、学习记录与计时模型。
- `experience.js`：路由、对话和录音流程、复练、历史与投屏视图。
- `views.html` / `experience-dialogs.html` / `experience.css`：新增页面、设置与响应式样式。
- `content.json` / `audio-bundle.json` / `audio-source/`：连读教学、对话、45 段音频及时间戳。
- `dist/index.html`：原 Sound Lab 结构和打包后的完整应用。
- `build.py`：更新内联资源，生成与预览完全相同的 `SpeakFlow.html`。

重建：`python3 build.py`。本地预览：`python3 -m http.server 8741 --bind 127.0.0.1 --directory dist`。

验证：`node verify.cjs`、`node verify-media.cjs`、`node verify-experience.cjs`。45 项核心、音频、接口与静态检查覆盖：27 组场景/级别对话流程、三档媒体同步、错误评分响应、实际引用、表达去重、时长/暂停/跨日、存储失败、服务传输与内联资源。

没有真实服务密钥，因此云端发音评分、LLM、STT 的真实调用尚待配置验证；没有进行浏览器操作或麦克风硬件验证。

## 参考

- [British Council: Connected speech](https://www.teachingenglish.org.uk/professional-development/teachers/teaching-knowledge-database/c/connected-speech)
- [Microsoft: Pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- [Microsoft: Browser Speech SDK example](https://github.com/Azure-Samples/cognitive-services-speech-sdk/tree/master/quickstart/javascript/browser/from-file)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [edge-tts: speech and boundary metadata](https://github.com/rany2/edge-tts)

## Ms Leila 紫色双语版（2026-09-24）

界面改为中英对照，主色统一为紫色，并加入 Ms Leila 署名与固定水印。练习原文、音频输入与时间戳保持英文数据，不会将中文界面提示加入语音。

- `SpeakFlow-中文使用说明.html`：独立中文说明，可直接在浏览器阅读，也可使用“打印 / 另存为 PDF”。
- 网页右上角 `User guide／中文使用说明`：打开内嵌版本；分享单个 SpeakFlow.html 也能阅读。
- `ui-zh.tsv`：界面译文表；`bilingual.js`：动态界面文字的对照展示，不改变学习数据；`branding.css`：紫色品牌、双语排版和水印。
- `guide-content.html` / `guide-shell.html`：中文说明内容与独立文件模板。
- `build.py` 同时生成单文件应用、预览、独立说明与 `dist/guide.html`。预览可使用 `http://127.0.0.1:8741/?v=4#home` 强制刷新。

## 学习者指南（2026-09-25）

网页内嵌说明和独立 guide.html 均已改为学习者直接使用的指南：首次 5 分钟练习、选难度、跟读、四轮交流、复练与表达库。已移除技术配置、部署和讲者演示安排，保留当前演示模式与发音评分可用性的必要说明。
