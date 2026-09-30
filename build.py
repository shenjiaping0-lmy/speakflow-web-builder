"""Embed the editable application source into the standalone HTML deliverable."""
from pathlib import Path
import re, json, colorsys

root = Path(__file__).resolve().parent
html_path = root / 'dist' / 'index.html'
html = html_path.read_text()
if 'id="view-sound"' not in html:
    html=html.replace('<section class="intro" id="sound-lab"','<section class="app-view" id="view-sound" hidden>\n <section class="intro" id="sound-lab"',1)
    html=html.replace('</main>','</section>\n</main>',1)
    html=html.replace('<span class="section-meta" id="analysis-meta">','<button class="focus-open" id="focus-open">⤢ Focus mode</button><span class="section-meta" id="analysis-meta">',1)
nav='<nav aria-label="Practice">'
for route,label,icon in [('home','Home','spark'),('sound','Sound Lab','headphones'),('speak','Speak Lab','mic'),('routine','15 minutes','repeat'),('history','My progress','wave')]:
    nav+='<a class="nav-link" href="#'+route+'" data-route="'+route+'" aria-label="'+label+'"><svg class="icon"><use href="#i-'+icon+'"/></svg><span>'+label+'</span></a>'
nav+='</nav>'
html=re.sub(r'<nav aria-label="Practice">[\s\S]*?</nav>',lambda _:nav,html,count=1)
html=html.replace('class="brand" href="#main"','class="brand" href="#home"')
if 'class="brand-signature"' not in html:
    html=html.replace('<div class="sidebar-caption">','<div class="brand-signature" aria-label="Ms Leila">Ms Leila</div>\n <div class="sidebar-caption">',1)
if 'id="user-guide-open"' not in html:
    html=html.replace('<div class="topbar-right">','<div class="topbar-right"><button class="text-btn guide-link" id="user-guide-open">User guide</button>',1)
for marker,source,anchor in [('views',(root/'views.html').read_text(),'</main>'),('dialogs',(root/'experience-dialogs.html').read_text(),'<script id="speakflow-data">')]:
    block='<!-- experience-'+marker+' -->\n'+source+'\n<!-- /experience-'+marker+' -->\n'
    pattern=r'<!-- experience-'+marker+r' -->[\s\S]*?<!-- /experience-'+marker+r' -->\n?'
    if re.search(pattern,html):html=re.sub(pattern,lambda _:block,html,count=1)
    else:html=html.replace(anchor,block+anchor,1)
style='<style id="experience-styles">\n'+(root/'experience.css').read_text()+'\n</style>\n'
if 'id="experience-styles"' in html:html=re.sub(r'<style id="experience-styles">[\s\S]*?</style>\n?',lambda _:style,html,count=1)
else:html=html.replace('</head>',style+'</head>',1)

# Recolor only the original blue UI palette. Semantic success/error colors stay legible.
def purple_color(match):
    value=match.group(1)
    if len(value)==3:value=''.join(c*2 for c in value)
    rgb=[int(value[i:i+2],16)/255 for i in (0,2,4)]
    hue,light,sat=colorsys.rgb_to_hls(*rgb)
    if 185<=hue*360<=252 and sat>.04:
        rgb=colorsys.hls_to_rgb(267/360,light,sat*.86)
        return '#'+''.join(f'{round(v*255):02x}' for v in rgb)+value[6:]
    return match.group(0)
def purple_style(match):
    return re.sub(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])',purple_color,match.group(0))
html=re.sub(r'<style(?:\s[^>]*)?>[\s\S]*?</style>',purple_style,html)
branding=(root/'branding.css').read_text()
style='<style id="brand-bilingual-styles">\n'+branding+'\n</style>\n'
if 'id="brand-bilingual-styles"' in html:html=re.sub(r'<style id="brand-bilingual-styles">[\s\S]*?</style>\n?',lambda _:style,html,count=1)
else:html=html.replace('</head>',style+'</head>',1)
html=re.sub(r'<meta name="theme-color" content="[^"]+">','<meta name="theme-color" content="#7543cd">',html,count=1)
html=html.replace('<title>SpeakFlow — Find your flow.</title>','<title>SpeakFlow · 听见节奏，自然开口 · Ms Leila</title>')
if '<meta name="author"' not in html:html=html.replace('</head>','<meta name="author" content="Ms Leila">\n</head>',1)
guide=(root/'guide-content.html').read_text()
guide_block='<!-- user-guide -->\n<dialog id="user-guide-dialog" aria-labelledby="user-guide-title"><div class="dialog-head"><h2 id="user-guide-title">SpeakFlow 学习者使用指南</h2><button class="icon-btn" id="user-guide-close" aria-label="关闭使用说明">×</button></div>'+guide+'</dialog>\n<!-- /user-guide -->\n'
if '<!-- user-guide -->' in html:html=re.sub(r'<!-- user-guide -->[\s\S]*?<!-- /user-guide -->\n?',lambda _:guide_block,html,count=1)
else:html=html.replace('<script id="speakflow-data">',guide_block+'<script id="speakflow-data">',1)
if 'id="leila-watermark"' not in html:html=html.replace('</main>','</main>\n<div id="leila-watermark" class="leila-watermark" aria-hidden="true">Ms Leila</div>',1)
html=html.replace('<div id="focus-controls"></div></dialog>','<div id="focus-controls"></div><div class="leila-watermark" aria-hidden="true">Ms Leila</div></dialog>',1)
data='globalThis.SPEAKFLOW_CONTENT='+json.dumps(json.loads((root/'content.json').read_text()),ensure_ascii=False,separators=(',',':'))+';\nglobalThis.SPEAKFLOW_AUDIO='+json.dumps(json.loads((root/'audio-bundle.json').read_text()),ensure_ascii=False,separators=(',',':'))+';'
for script_id, source in [('speakflow-data',data),('speakflow-services',(root/'services.js').read_text())]:
    source=source.replace('</script','<\\/script')
    block='<script id="'+script_id+'">\n'+source+'\n</script>\n'
    pattern=r'<script id="'+script_id+r'">[\s\S]*?</script>\n?'
    if re.search(pattern,html): html=re.sub(pattern,lambda _:block,html,count=1)
    else: html=html.replace('<script id="speakflow-app">',block+'<script id="speakflow-app">',1)
js = (root / 'app.js').read_text().replace('</script', '<\\/script')
html = re.sub(r'(<script id="speakflow-app">)[\s\S]*?(</script>)', lambda m: m[1] + '\n' + js + '\n' + m[2], html, count=1)
for script_id,filename in [('speakflow-experience-core','experience-core.js'),('speakflow-experience','experience.js')]:
    source=(root/filename).read_text().replace('</script','<\\/script')
    block='<script id="'+script_id+'">\n'+source+'\n</script>\n'
    pattern=r'<script id="'+script_id+r'">[\s\S]*?</script>\n?'
    if re.search(pattern,html):html=re.sub(pattern,lambda _:block,html,count=1)
    else:html=html.replace('</body>',block+'</body>',1)
catalog={}
for line in (root/'ui-zh.tsv').read_text().splitlines():
    if line.strip():
        en,zh=line.split('\t',1)
        catalog[en]=zh
ui_data='globalThis.SPEAKFLOW_UI_ZH='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';'
for script_id,source in [('speakflow-ui-data',ui_data),('speakflow-bilingual',(root/'bilingual.js').read_text())]:
    block='<script id="'+script_id+'">\n'+source.replace('</script','<\\/script')+'\n</script>\n'
    pattern=r'<script id="'+script_id+r'">[\s\S]*?</script>\n?'
    if re.search(pattern,html):html=re.sub(pattern,lambda _:block,html,count=1)
    else:html=html.replace('</body>',block+'</body>',1)
html_path.write_text(html)
(root / 'SpeakFlow.html').write_text(html)
guide_html=(root/'guide-shell.html').read_text().replace('/* GUIDE_BRANDING */',branding).replace('<!-- GUIDE_CONTENT -->',guide)
(root/'SpeakFlow-中文使用说明.html').write_text(guide_html)
(root/'dist'/'guide.html').write_text(guide_html.replace('href="SpeakFlow.html"','href="index.html"'))
print('Built bilingual purple SpeakFlow, identical local preview, and standalone Chinese user guide.')
