import*as db from './db.js';
const $=s=>document.querySelector(s);
const KIND={epub:'ebook',pdf:'ebook',txt:'ebook',mp3:'audio',m4a:'audio',aac:'audio',ogg:'audio',wav:'audio'};
const FILTERS=[['all','All'],['reading','Reading'],['finished','Finished'],['audio','Audiobooks']];
let books=[],filter='all',current=null;

// ---- error log (no devtools on a phone) ----
const LOGK='marginalia-log';
function logErr(m){try{const l=JSON.parse(localStorage.getItem(LOGK)||'[]');l.push(new Date().toISOString().slice(0,19)+' '+m);localStorage.setItem(LOGK,JSON.stringify(l.slice(-50)))}catch{}}
addEventListener('error',e=>logErr(e.message));
addEventListener('unhandledrejection',e=>logErr('Promise: '+(e.reason&&e.reason.message||e.reason)));

function toast(msg,ms=4500){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,ms)}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const ext=n=>(n.split('.').pop()||'').toLowerCase();
const clean=n=>n.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim()||'Untitled';

// ---- import ----
async function importFiles(files){
 const out=[];let ok=0;
 let free=Infinity;try{const e=await navigator.storage.estimate();free=e.quota-e.usage}catch{}
 for(const f of files){
  const x=ext(f.name),kind=KIND[x];
  if(!kind){out.push(`✕ ${f.name}: .${x} isn't supported (use EPUB, PDF, TXT, MP3, M4A, AAC, OGG, WAV)`);continue}
  if(!f.size){out.push(`✕ ${f.name}: file is empty`);continue}
  if(f.size>free*0.9){out.push(`✕ ${f.name}: not enough browser storage (${mb(f.size)} needed, ${mb(free)} free)`);continue}
  const title=clean(f.name);
  if(books.some(b=>b.size===f.size&&b.title===title)){out.push(`– ${f.name}: looks like a duplicate, skipped`);continue}
  const meta={id:uid(),title,author:'',format:x,kind,size:f.size,added:Date.now(),opened:0,progress:0,status:'unread'};
  try{await db.addBook(meta,f);books.push(meta);free-=f.size;ok++}
  catch(e){logErr('import '+f.name+': '+e.message);out.push(`✕ ${f.name}: ${e.name==='QuotaExceededError'?'storage full':'could not be saved'}. Library unchanged.`)}
 }
 render();
 toast((ok?`Added ${ok} file${ok>1?'s':''}.\n`:'')+out.join('\n'),out.length?9000:3500);
}
const mb=b=>(b/1048576).toFixed(b>1e8?0:1)+' MB';

// ---- render ----
function visible(){
 const q=$('#q').value.trim().toLowerCase(),s=$('#sort').value;
 let l=books.filter(b=>{
  if(filter==='reading'&&!(b.progress>0&&b.progress<1&&b.status!=='finished'))return false;
  if(filter==='finished'&&b.status!=='finished')return false;
  if(filter==='audio'&&b.kind!=='audio')return false;
  return !q||[b.title,b.author,b.series,(b.tags||[]).join(' ')].join(' ').toLowerCase().includes(q)});
 const cmp={added:(a,b)=>b.added-a.added,opened:(a,b)=>b.opened-a.opened,title:(a,b)=>a.title.localeCompare(b.title),author:(a,b)=>(a.author||'~').localeCompare(b.author||'~'),progress:(a,b)=>b.progress-a.progress}[s];
 return l.sort(cmp);
}
function render(){
 const g=$('#grid');g.replaceChildren();const l=visible();
 const e=$('#empty');e.hidden=l.length>0;
 if(!l.length){e.querySelector('h2').textContent=books.length?'Nothing matches':'Your reading room is empty';
  e.querySelector('p').textContent=books.length?'Try a different search or filter.':'Tap the gold button to add an EPUB, PDF, TXT or audio file from your phone.'}
 for(const b of l){
  const c=document.createElement('button');c.className='card';
  const cv=document.createElement('div');cv.className='cover';
  const t=document.createElement('span');t.textContent=b.title;
  const k=document.createElement('small');k.textContent=b.format;
  cv.append(t,k);
  const tt=document.createElement('div');tt.className='t';tt.textContent=b.title;
  const a=document.createElement('div');a.className='a';a.textContent=b.author||'Unknown author';
  const bar=document.createElement('div');bar.className='bar';const i=document.createElement('i');i.style.width=Math.round(b.progress*100)+'%';bar.append(i);
  c.append(cv,tt,a,bar);c.onclick=()=>openBook(b);g.append(c);
 }
}
function renderFilters(){
 const f=$('#filters');f.replaceChildren();
 for(const[k,l]of FILTERS){const b=document.createElement('button');b.textContent=l;b.setAttribute('role','tab');b.setAttribute('aria-selected',k===filter);b.onclick=()=>{filter=k;renderFilters();render();db.setSetting('filter',k).catch(e=>logErr('save filter: '+e.message))};f.append(b)}
}

// ---- details ----
function openBook(b){
 current=b;$('#bTitle').textContent=b.title;
 $('#bInfo').textContent=`${b.format.toUpperCase()} · ${mb(b.size)} · ${Math.round(b.progress*100)}% · reader/player arrives in the next milestones`;
 $('#eTitle').value=b.title;$('#eAuthor').value=b.author||'';$('#dlgBook').showModal();
}
$('#fBook').addEventListener('submit',async e=>{
 const v=e.submitter&&e.submitter.value;if(!current)return;
 try{
  if(v==='save'){current.title=$('#eTitle').value.trim()||current.title;current.author=$('#eAuthor').value.trim();await db.updateBook(current)}
  if(v==='x'){
   if(!confirm(`Permanently remove "${current.title}" AND its stored file from this browser? Your original file on your phone is not touched.`)){e.preventDefault();return}
   await db.removeBook(current.id);books=books.filter(b=>b.id!==current.id);
  }
  render();
 }catch(err){logErr(err.message);toast('Could not save that change.')}
});

// ---- settings ----
$('#btnSettings').onclick=async()=>{
 let s='Storage usage unavailable on this browser.';
 try{const e=await navigator.storage.estimate();s=`Using ${mb(e.usage)} of about ${mb(e.quota)} available.`;
  if(navigator.storage.persisted)s+=(await navigator.storage.persisted())?' Persistent storage: granted.':' Persistent storage: not granted.'}catch{}
 $('#store').textContent=s;
 $('#log').textContent=JSON.parse(localStorage.getItem(LOGK)||'[]').join('\n')||'No errors logged.';
 $('#dlgSet').showModal();
};
$('#clrLog').onclick=()=>localStorage.removeItem(LOGK);

// ---- wiring ----
$('#fab').onclick=()=>$('#picker').click();
$('#picker').onchange=e=>{const f=[...e.target.files];e.target.value='';if(f.length)importFiles(f)};
let st;$('#q').oninput=()=>{clearTimeout(st);st=setTimeout(render,120)};
$('#sort').onchange=()=>{render();db.setSetting('sort',$('#sort').value).catch(e=>logErr('save sort: '+e.message))};

(async()=>{
 try{
  const f=await db.getSetting('filter','all'),s=await db.getSetting('sort','added');
  if(FILTERS.some(x=>x[0]===f))filter=f;
  if([...$('#sort').options].some(o=>o.value===s))$('#sort').value=s;
 }catch(e){logErr('settings: '+e.message)}
 renderFilters();
 try{books=await db.allBooks();if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}
 catch(e){logErr(e.message);toast('Storage is unavailable: '+e.message)}
 render();
 if(window.isSecureContext&&'serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(e=>logErr('SW: '+e.message));
})();
