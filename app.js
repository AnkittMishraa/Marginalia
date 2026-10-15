import * as db from './db.js';
import {readEpub} from './epub-engine.js';
const $=s=>document.querySelector(s);
const KIND={epub:'ebook',pdf:'ebook',txt:'ebook',mp3:'audio',m4a:'audio',aac:'audio',ogg:'audio',wav:'audio'};
const FILTERS=[['all','All'],['reading','Reading'],['finished','Finished'],['audio','Audiobooks']];
let books=[],filter='all',current=null,readerBlob=null,readerUrl=null,chapters=[],chapterIndex=0,fontSize=19,readerTheme='dark',saveTick=null,sleepTimer=null;
const LOGK='marginalia-log';
function logErr(m){try{const l=JSON.parse(localStorage.getItem(LOGK)||'[]');l.push(new Date().toISOString().slice(0,19)+' '+m);localStorage.setItem(LOGK,JSON.stringify(l.slice(-50)))}catch{}}
addEventListener('error',e=>logErr(e.message));addEventListener('unhandledrejection',e=>logErr('Promise: '+(e.reason&&e.reason.message||e.reason)));
function toast(msg,ms=4500){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,ms)}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const ext=n=>(n.split('.').pop()||'').toLowerCase(),clean=n=>n.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim()||'Untitled',mb=b=>(b/1048576).toFixed(b>1e8?0:1)+' MB';
async function importFiles(files){const out=[];let ok=0;let free=Infinity;try{const e=await navigator.storage.estimate();free=e.quota-e.usage}catch{}
 for(const f of files){const x=ext(f.name),kind=KIND[x];if(!kind){out.push(`✕ ${f.name}: unsupported format`);continue}if(!f.size){out.push(`✕ ${f.name}: empty file`);continue}if(f.size>free*.9){out.push(`✕ ${f.name}: not enough browser storage`);continue}
 const title=clean(f.name);if(books.some(b=>b.size===f.size&&b.title===title)){out.push(`– ${f.name}: duplicate skipped`);continue}
 const meta={id:uid(),title,author:'',format:x,kind,size:f.size,added:Date.now(),opened:0,progress:0,status:'unread',position:0,chapter:0};
 try{await db.addBook(meta,f);books.push(meta);free-=f.size;ok++}catch(e){logErr('import '+f.name+': '+e.message);out.push(`✕ ${f.name}: ${e.name==='QuotaExceededError'?'storage full':'could not be saved'}`)}}
 render();toast((ok?`Added ${ok} file${ok>1?'s':''}. `:'')+out.join('\n'),out.length?9000:3500)}
function visible(){const q=$('#q').value.trim().toLowerCase(),s=$('#sort').value;let l=books.filter(b=>{if(filter==='reading'&&!(b.progress>0&&b.progress<1&&b.status!=='finished'))return false;if(filter==='finished'&&b.status!=='finished')return false;if(filter==='audio'&&b.kind!=='audio')return false;return !q||[b.title,b.author,b.series,(b.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)});const cmp={added:(a,b)=>b.added-a.added,opened:(a,b)=>b.opened-a.opened,title:(a,b)=>a.title.localeCompare(b.title),author:(a,b)=>(a.author||'~').localeCompare(b.author||'~'),progress:(a,b)=>b.progress-a.progress}[s];return l.sort(cmp)}
function render(){const g=$('#grid');g.replaceChildren();const l=visible(),e=$('#empty');e.hidden=l.length>0;if(!l.length){e.querySelector('h2').textContent=books.length?'Nothing matches':'Your reading room is empty';e.querySelector('p').textContent=books.length?'Try a different search or filter.':'Tap the gold button to add an EPUB, PDF, TXT or audio file from your phone.'}
 for(const b of l){
  const wrap=document.createElement('article');wrap.className='book-wrap';
  const c=document.createElement('button');c.className='card';c.type='button';c.setAttribute('aria-label',`Open ${b.title}`);
  const cv=document.createElement('div');cv.className='cover';cv.setAttribute('aria-hidden','true');
  if(b.coverBlob instanceof Blob){
   const coverImg=document.createElement('img');coverImg.className='custom-cover';coverImg.alt='';coverImg.src=URL.createObjectURL(b.coverBlob);cv.append(coverImg);
  } else {
   const monogram=document.createElement('span');monogram.className='cover-monogram';monogram.textContent=(b.title||'M').trim().charAt(0).toUpperCase();cv.append(monogram);
   const t=document.createElement('span');t.className='cover-title';t.textContent=b.title;cv.append(t);
   const k=document.createElement('small');k.textContent=b.format;cv.append(k);
  }
  const details=document.createElement('div');details.className='book-details';
  const tt=document.createElement('div');tt.className='t';tt.textContent=b.title;
  const a=document.createElement('div');a.className='a';a.textContent=b.author||'Unknown author';
  const bar=document.createElement('div');bar.className='bar';const i=document.createElement('i');i.style.width=Math.round(b.progress*100)+'%';bar.append(i);
  details.append(tt,a,bar);c.append(cv,details);c.onclick=()=>openBook(b);
  const actions=document.createElement('div');actions.className='book-actions';
  const progress=document.createElement('span');progress.className='book-progress';progress.textContent=b.kind==='audio'?(b.progress>0?`${Math.round(b.progress*100)}% listened`:'Audiobook'):(b.progress>0?`${Math.round(b.progress*100)}% read`:b.format.toUpperCase());
  const menuWrap=document.createElement('div');menuWrap.className='book-menu-wrap';
  const menuBtn=document.createElement('button');menuBtn.type='button';menuBtn.className='book-menu-trigger';menuBtn.textContent='⋯';menuBtn.setAttribute('aria-label',`Actions for ${b.title}`);menuBtn.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='book-menu';menu.hidden=true;
  const edit=document.createElement('button');edit.type='button';edit.textContent='Edit details';edit.onclick=()=>{closeBookMenus();editBook(b)};
  const remove=document.createElement('button');remove.type='button';remove.className='menu-danger';remove.textContent='Remove from library';remove.onclick=async()=>{closeBookMenus();if(!confirm(`Remove “${b.title}” and its stored file from Marginalia?`))return;try{await db.removeBook(b.id);books=books.filter(x=>x.id!==b.id);render();toast('Book removed from your library.')}catch(err){logErr('remove '+b.title+': '+err.message);toast('Could not remove this book.')}};
  menu.append(edit,remove);menuBtn.onclick=(ev)=>{ev.stopPropagation();const opening=menu.hidden;closeBookMenus();menu.hidden=!opening;menuBtn.setAttribute('aria-expanded',String(opening))};
  menuWrap.append(menuBtn,menu);actions.append(progress,menuWrap);wrap.append(c,actions);g.append(wrap)
 }} 
function closeBookMenus(){document.querySelectorAll('.book-menu').forEach(m=>m.hidden=true);document.querySelectorAll('.book-menu-trigger').forEach(b=>b.setAttribute('aria-expanded','false'))}
document.addEventListener('click',e=>{if(!e.target.closest('.book-menu-wrap'))closeBookMenus()});
function renderFilters(){const f=$('#filters');f.replaceChildren();for(const[k,l]of FILTERS){const b=document.createElement('button');b.textContent=l;b.setAttribute('role','tab');b.setAttribute('aria-selected',k===filter);b.onclick=()=>{filter=k;renderFilters();render();db.setSetting('filter',k).catch(e=>logErr('filter: '+e.message))};f.append(b)}}
function editBook(b){current=b;$('#bTitle').textContent=b.title;$('#bInfo').textContent=`${b.format.toUpperCase()} · ${mb(b.size)} · ${Math.round(b.progress*100)}% complete`;$('#eTitle').value=b.title;$('#eAuthor').value=b.author||'';$('#eCover').value='';$('#coverHint').textContent=b.coverBlob?'A custom cover is saved. Choose another image to replace it.':'Optional. Choose a JPG, PNG, or WebP image from your phone.';$('#dlgBook').showModal()}
$('#fBook').addEventListener('submit',async e=>{e.preventDefault();const v=e.submitter&&e.submitter.value;if(!current)return;try{if(v==='save'){const title=$('#eTitle').value.trim()||current.title;const author=$('#eAuthor').value.trim();const coverFile=$('#eCover').files&&$('#eCover').files[0];if(coverFile&&!coverFile.type.startsWith('image/')){toast('Choose an image file for the cover.');return}if(coverFile&&coverFile.size>8*1024*1024){toast('Cover image must be 8 MB or smaller.');return}current.title=title;current.author=author;if(coverFile)current.coverBlob=coverFile;await db.updateBook(current);$('#dlgBook').close();render();toast('Book details saved.')}else if(v==='x'){if(!confirm(`Permanently remove "${current.title}" and its stored file?`))return;await db.removeBook(current.id);books=books.filter(b=>b.id!==current.id);$('#dlgBook').close();render()}else $('#dlgBook').close()}catch(err){logErr(err.message);toast('Could not save that change: '+err.message)}});
function readerOpen(){if(!$('body').classList.contains('reader-open'))document.body.classList.add('reader-open');$('#dlgReader').showModal();startStatsTicker()}
function cleanChapter(html){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,iframe,object,embed,form,link').forEach(n=>n.remove());doc.querySelectorAll('*').forEach(n=>{[...n.attributes].forEach(a=>{if(/^on/i.test(a.name)||a.name==='srcdoc')n.removeAttribute(a.name);if((a.name==='href'||a.name==='src')&&/^\s*javascript:/i.test(a.value))n.removeAttribute(a.name)})});return doc.body.innerHTML}
function applyReaderStyle(){const c=$('#readerContent');c.style.fontSize=fontSize+'px';c.dataset.theme=readerTheme;$('#themeToggle').textContent=readerTheme==='dark'?'Sepia':readerTheme==='sepia'?'Light':'Dark';const p=$('#appearanceSize');if(p)p.textContent=fontSize+' px'}
async function saveProgress(){
 if(!current)return;
 try{
  const content=$('#readerContent');
  if(current.kind==='audio'){
   const a=$('#audio');
   if(Number.isFinite(a.currentTime))current.position=Math.max(0,a.currentTime);
   if(a.duration>0&&Number.isFinite(a.duration))current.progress=Math.min(.999,current.position/a.duration);
  }else if(current.format==='pdf'){
   // Mobile PDF viewer scroll position is browser-controlled and cannot be read reliably.
  }else{
   const max=Math.max(0,content.scrollHeight-content.clientHeight);
   const top=Math.max(0,Number(content.scrollTop)||0);
   const fraction=max>0?Math.max(0,Math.min(1,top/max)):0;
   current.position=top;
   if(current.format==='epub'&&chapters.length){
    current.chapter=chapterIndex;
    current.progress=Math.min(.999,Math.max(0,(chapterIndex+fraction)/chapters.length));
   }else{
    current.progress=Math.min(.999,Math.max(0,fraction));
   }
  }
  current.opened=Date.now();
  if(current.progress>=.98){current.status='finished'}else if(current.status!=='finished'){current.status=current.progress>0?'reading':'unread'}
  await db.updateBook(current);
  // Keep the in-memory entry aligned with the saved object, but don't redraw while the reader is scrolling.
  const idx=books.findIndex(b=>b.id===current.id);
  if(idx>=0)books[idx]=current;
 }catch(e){logErr('progress: '+e.message)}
}
async function openBook(b){current=b;const rec=await db.getFile(b.id);if(!rec||!rec.blob){toast('The stored file is missing. Re-import the original file.');return}readerBlob=rec.blob;$('#readerTitle').textContent=b.title;$('#readerContent').replaceChildren();$('#readerTools').hidden=true;$('#appearancePanel').hidden=true;$('#readerMore').setAttribute('aria-expanded','false');$('#audioPanel').hidden=true;$('#readerContent').className='reader-content';$('#dlgReader').classList.add('chrome-hidden');readerOpen();
 try{
  if(b.kind==='audio'){openAudio(b,rec.blob);return}
  if(b.format==='txt'){const text=await rec.blob.text();const pre=document.createElement('pre');pre.className='txt-body';pre.textContent=text;$('#readerContent').replaceChildren(pre);applyReaderStyle();requestAnimationFrame(()=>{$('#readerContent').scrollTop=Number(b.position)||0});return}
  if(b.format==='pdf'){if(readerUrl)URL.revokeObjectURL(readerUrl);readerUrl=URL.createObjectURL(rec.blob);const frame=document.createElement('iframe');frame.id='pdfFrame';frame.title=b.title;frame.className='pdf-frame';frame.src=readerUrl;$('#readerContent').append(frame);return}
  if(b.format==='epub'){toast('Opening EPUB…',1800);const result=await readEpub(rec.blob);chapters=result.chapters;if(!b.author&&result.author){b.author=result.author;await db.updateBook(b)}chapterIndex=Math.min(Number(b.chapter)||0,Math.max(0,chapters.length-1));$('#readerTools').hidden=false;const sel=$('#chapterSelect');sel.replaceChildren();chapters.forEach((ch,i)=>{const o=document.createElement('option');o.value=i;o.textContent=ch.title||`Chapter ${i+1}`;sel.append(o)});showChapter(chapterIndex,true);return}
  toast('This file format is not supported by the reader.')
 }catch(e){logErr('open '+b.title+': '+e.message);$('#readerContent').textContent='Could not open this file. '+e.message;toast('Could not open file: '+e.message,7000)}}
function showChapter(i,restore=false){
 chapterIndex=Math.max(0,Math.min(i,chapters.length-1));const ch=chapters[chapterIndex];if(!ch)return;
 $('#chapterSelect').value=String(chapterIndex);const c=$('#readerContent');c.innerHTML=cleanChapter(ch.content);c.scrollTop=0;applyReaderStyle();
 if(current){current.chapter=chapterIndex;if(!restore){current.position=0;current.progress=Math.min(.999,chapterIndex/Math.max(1,chapters.length))}db.updateBook(current).then(render).catch(e=>logErr(e.message))}
 if(restore&&current){requestAnimationFrame(()=>requestAnimationFrame(()=>{const max=Math.max(0,c.scrollHeight-c.clientHeight);const fraction=Math.max(0,Math.min(1,(current.progress||0)*chapters.length-chapterIndex));c.scrollTop=Math.max(0,Math.min(max,Number(current.position)||max*fraction))}))}
}
function openAudio(b,blob){const a=$('#audio');a.pause();if(readerUrl)URL.revokeObjectURL(readerUrl);readerUrl=URL.createObjectURL(blob);a.src=readerUrl;a.currentTime=Math.max(0,b.position||0);a.playbackRate=Number($('#speed').value)||1;$('#audioPanel').hidden=false;$('#readerContent').hidden=true;a.onloadedmetadata=()=>{if(b.position&&b.position<a.duration)a.currentTime=b.position};a.onerror=()=>toast('This audio file could not be played by this browser.',6000);a.play().catch(()=>toast('Tap Play in the audio controls to start listening.'));applyReaderStyle()}
async function closeReader(){stopStatsTicker();clearTimeout(saveTick);await saveProgress();const a=$('#audio');a.pause();a.removeAttribute('src');a.load();$('#dlgReader').close();document.body.classList.remove('reader-open');$('#readerContent').hidden=false;$('#audioPanel').hidden=true;$('#readerTools').hidden=true;if(readerUrl){URL.revokeObjectURL(readerUrl);readerUrl=null}chapters=[]}
$('#readerBack').onclick=closeReader;$('#prevChapter').onclick=async()=>{await saveProgress();showChapter(chapterIndex-1)};$('#nextChapter').onclick=async()=>{await saveProgress();showChapter(chapterIndex+1)};$('#chapterSelect').onchange=async e=>{await saveProgress();showChapter(Number(e.target.value))};
function changeFont(delta){fontSize=Math.max(14,Math.min(32,fontSize+delta));applyReaderStyle();db.setSetting('fontSize',fontSize).catch(e=>logErr('fontSize: '+e.message))}function changeTheme(){readerTheme=readerTheme==='dark'?'sepia':readerTheme==='sepia'?'light':'dark';applyReaderStyle();db.setSetting('readerTheme',readerTheme).catch(e=>logErr('readerTheme: '+e.message))}$('#readerMore').onclick=()=>{const p=$('#appearancePanel');p.hidden=!p.hidden;$('#readerMore').setAttribute('aria-expanded',String(!p.hidden));applyReaderStyle()};$('#appearanceDown').onclick=()=>changeFont(-1);$('#appearanceUp').onclick=()=>changeFont(1);$('#themeToggle').onclick=changeTheme;
$('#bookmarkBtn').onclick=async()=>{if(!current)return;const marks=await db.getSetting('bookmarks',{});const key=current.id;const list=marks[key]||[];const pos=current.kind==='audio'?$('#audio').currentTime:$('#readerContent').scrollTop;list.push({position:pos,chapter:chapterIndex,label:`Bookmark ${list.length+1}`,created:Date.now()});marks[key]=list;await db.setSetting('bookmarks',marks);toast('Bookmark saved.')}
$('#back15').onclick=()=>$('#audio').currentTime=Math.max(0,$('#audio').currentTime-15);$('#forward30').onclick=()=>$('#audio').currentTime=Math.min($('#audio').duration||Infinity,$('#audio').currentTime+30);$('#speed').onchange=e=>$('#audio').playbackRate=Number(e.target.value);$('#sleep').onchange=e=>{if(sleepTimer)clearTimeout(sleepTimer);const m=Number(e.target.value);if(m)sleepTimer=setTimeout(()=>{$('#audio').pause();toast('Sleep timer paused playback.')},m*60000)};
$('#audio').ontimeupdate=()=>{if(current&&current.kind==='audio'){clearTimeout(saveTick);saveTick=setTimeout(saveProgress,5000)}};$('#audio').onended=()=>{if(current){current.progress=1;current.status='finished';db.updateBook(current).then(render)}};
function scheduleProgressSave(){
 if(!current||current.format==='pdf'||current.kind==='audio')return;
 clearTimeout(saveTick);
 saveTick=setTimeout(async()=>{
  await saveProgress();
  render();
 },900);
}
const readingSurface=$('#readerContent');
readingSurface.addEventListener('scroll',scheduleProgressSave,{passive:true});
readingSurface.addEventListener('touchend',scheduleProgressSave,{passive:true});
readingSurface.addEventListener('pointerup',scheduleProgressSave,{passive:true});
readingSurface.addEventListener('click',e=>{
 if(window.getSelection&&String(window.getSelection()))return;
 if(e.target.closest('a,button,input,select,textarea,iframe,video,audio'))return;
 $('#dlgReader').classList.toggle('chrome-hidden');
});


const STATS_KEY='readingStats';
let stats={readSeconds:0,listenSeconds:0,lastByBook:{}},statsLoaded=false,statsTick=null;
async function loadStats(){if(statsLoaded)return;try{stats=await db.getSetting(STATS_KEY,stats)||stats}catch(e){logErr('stats load: '+e.message)}stats.readSeconds=Number(stats.readSeconds)||0;stats.listenSeconds=Number(stats.listenSeconds)||0;stats.lastByBook=stats.lastByBook||{};statsLoaded=true}
async function saveStats(){try{await db.setSetting(STATS_KEY,stats)}catch(e){logErr('stats save: '+e.message)}}
function fmtDuration(n){n=Math.max(0,Math.floor(n||0));const h=Math.floor(n/3600),m=Math.floor(n%3600/60);return h?`${h}h ${m}m`:`${m} min`}
async function renderStats(){await loadStats();$('#statReadTime').textContent=fmtDuration(stats.readSeconds);$('#statListenTime').textContent=fmtDuration(stats.listenSeconds);$('#statFinished').textContent=books.filter(b=>b.status==='finished'||b.progress>=.98).length;$('#statLibrary').textContent=`${books.length} ${books.length===1?'book':'books'}`;const host=$('#statRecent');host.replaceChildren();const recent=books.filter(b=>Number(stats.lastByBook[b.id])>0).sort((a,b)=>stats.lastByBook[b.id]-stats.lastByBook[a.id]).slice(0,5);if(!recent.length){const p=document.createElement('p');p.className='muted';p.textContent='No reading activity recorded yet.';host.append(p);return}for(const b of recent){const row=document.createElement('div');row.className='stats-recent-row';const name=document.createElement('span');name.textContent=b.title;const duration=document.createElement('span');duration.className='muted';duration.textContent=fmtDuration(stats.lastByBook[b.id]);row.append(name,duration);host.append(row)}}
$('#btnStats').onclick=async()=>{await renderStats();$('#dlgStats').showModal()};
function stopStatsTicker(){if(statsTick){clearInterval(statsTick);statsTick=null}}
function startStatsTicker(){stopStatsTicker();statsTick=setInterval(async()=>{if(!current||!$('#dlgReader').open||document.visibilityState!=='visible')return;await loadStats();if(current.kind==='audio'){if($('#audio').paused)return;stats.listenSeconds+=15}else{stats.readSeconds+=15}stats.lastByBook[current.id]=(Number(stats.lastByBook[current.id])||0)+15;await saveStats()},15000)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('#dlgReader').open)startStatsTicker()});

$('#btnSettings').onclick=async()=>{let s='Storage usage unavailable.';try{const e=await navigator.storage.estimate();s=`Using ${mb(e.usage)} of about ${mb(e.quota)} available.`;if(navigator.storage.persisted)s+=(await navigator.storage.persisted())?' Persistent storage: granted.':' Persistent storage: not granted.'}catch{}$('#store').textContent=s;$('#log').textContent=JSON.parse(localStorage.getItem(LOGK)||'[]').join('\n')||'No errors logged.';$('#dlgSet').showModal();$('#dlgSet form').scrollTop=0};

function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not read a stored file'));r.readAsDataURL(blob)})}
function dataURLToBlob(url){if(typeof url!=='string'||!url.startsWith('data:'))throw new Error('Backup contains an invalid file.');const parts=url.split(',');const match=/^data:([^;]*);base64$/.exec(parts[0]);if(!match||!parts[1])throw new Error('Backup contains an invalid file.');const raw=atob(parts[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:match[1]||'application/octet-stream'})}
async function makeBackup(){const btn=$('#exportBackup'),status=$('#backupStatus');btn.disabled=true;status.textContent='Preparing backup…';try{const data=await db.backupData();for(const f of data.files){if(f.blob instanceof Blob)f.blob={__blob:true,data:await blobToDataURL(f.blob)};else throw new Error('A stored book file could not be read.')}for(const b of data.books){if(b.coverBlob instanceof Blob)b.coverBlob={__blob:true,data:await blobToDataURL(b.coverBlob)}}const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`marginalia-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent=`Backup prepared · ${data.books.length} books · ${mb(blob.size)}. Keep this file somewhere safe.`;toast('Backup exported. Keep the downloaded file safe.')}catch(e){logErr('backup export: '+e.message);status.textContent='Backup failed: '+e.message;toast('Backup failed. Your library was not changed.')}finally{btn.disabled=false}}
async function loadBackup(file){const status=$('#backupStatus');if(!file)return;status.textContent='Checking backup…';try{if(file.size>1024*1024*1024)throw new Error('Backup is over 1 GB and may be too large for this phone.');const data=JSON.parse(await file.text());if(!data||data.app!=='Marginalia'||data.version!==1||!Array.isArray(data.books)||!Array.isArray(data.files)||!Array.isArray(data.settings))throw new Error('This is not a supported Marginalia backup.');for(const f of data.files){if(f&&f.blob&&f.blob.__blob)f.blob=dataURLToBlob(f.blob.data)}for(const b of data.books){if(b&&b.coverBlob&&b.coverBlob.__blob)b.coverBlob=dataURLToBlob(b.coverBlob.data)}if(!confirm(`Restore this backup?

${data.books.length} books found. Existing books will be kept; duplicates will be skipped. Settings and bookmarks will be merged. Nothing in your current library will be deleted.`))return;status.textContent='Restoring…';const result=await db.restoreData(data);books=await db.allBooks();render();status.textContent=`Restore complete · ${result.added} added · ${result.skipped} duplicates skipped.`;toast(`Restore complete: ${result.added} added, ${result.skipped} skipped.`)}catch(e){logErr('backup restore: '+e.message);status.textContent='Restore failed: '+e.message;toast('Restore failed. Your existing library was not intentionally changed.',7000)}}
$('#exportBackup').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();makeBackup()});
$('#importBackup').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();$('#backupPicker').click()});
$('#backupPicker').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';if(file)loadBackup(file)});

$('#clrLog').onclick=()=>localStorage.removeItem(LOGK);$('#fab').onclick=()=>$('#picker').click();$('#picker').onchange=e=>{const f=[...e.target.files];e.target.value='';if(f.length)importFiles(f)};let st;$('#q').oninput=()=>{clearTimeout(st);st=setTimeout(render,120)};$('#sort').onchange=()=>{render();db.setSetting('sort',$('#sort').value).catch(e=>logErr(e.message))};
addEventListener('pagehide',()=>{clearTimeout(saveTick);if(current)saveProgress()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&current){clearTimeout(saveTick);saveProgress()}});
(async()=>{try{const f=await db.getSetting('filter','all'),s=await db.getSetting('sort','added');if(FILTERS.some(x=>x[0]===f))filter=f;if([...$('#sort').options].some(o=>o.value===s))$('#sort').value=s;fontSize=await db.getSetting('fontSize',19);readerTheme=await db.getSetting('readerTheme','dark')}catch(e){logErr(e.message)}renderFilters();try{books=await db.allBooks();if(navigator.storage?.persist)navigator.storage.persist()}catch(e){logErr(e.message);toast('Storage unavailable: '+e.message)}render();if(window.isSecureContext&&'serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(e=>logErr('SW: '+e.message))})();
