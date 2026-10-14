const NAME='marginalia',VER=1;let _db;
export function open(){if(_db)return Promise.resolve(_db);return new Promise((res,rej)=>{const r=indexedDB.open(NAME,VER);r.onupgradeneeded=e=>{const d=r.result;if(e.oldVersion<1){const b=d.createObjectStore('books',{keyPath:'id'});b.createIndex('added','added');b.createIndex('opened','opened');b.createIndex('title','title');d.createObjectStore('files',{keyPath:'id'});d.createObjectStore('settings',{keyPath:'key'});}};r.onsuccess=()=>{_db=r.result;_db.onversionchange=()=>_db.close();res(_db)};r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('Database blocked by another tab'));});}
const wrap=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
export async function allBooks(){const d=await open();return wrap(d.transaction('books').objectStore('books').getAll())}
export async function getFile(id){const d=await open();return wrap(d.transaction('files').objectStore('files').get(id))}
export async function addBook(meta,blob){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(['books','files'],'readwrite');t.objectStore('books').add(meta);t.objectStore('files').add({id:meta.id,blob});t.oncomplete=()=>res(meta);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('Transaction aborted'));});}
export async function updateBook(meta){const d=await open();return wrap(d.transaction('books','readwrite').objectStore('books').put(meta))}
export async function removeBook(id){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(['books','files'],'readwrite');t.objectStore('books').delete(id);t.objectStore('files').delete(id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}
export async function getSetting(key,def){const d=await open();const r=await wrap(d.transaction('settings').objectStore('settings').get(key));return r?r.value:def}
export async function setSetting(key,value){const d=await open();return wrap(d.transaction('settings','readwrite').objectStore('settings').put({key,value}))}

export async function backupData(){
 const d=await open();
 const tx=d.transaction(['books','files','settings'],'readonly');
 const [books,files,settings]=await Promise.all([
  wrap(tx.objectStore('books').getAll()),wrap(tx.objectStore('files').getAll()),wrap(tx.objectStore('settings').getAll())
 ]);
 return {version:1,app:'Marginalia',created:new Date().toISOString(),books,files,settings};
}
export async function restoreData(data){
 if(!data||data.app!=='Marginalia'||data.version!==1||!Array.isArray(data.books)||!Array.isArray(data.files)||!Array.isArray(data.settings))throw new Error('This is not a supported Marginalia backup.');
 const d=await open();
 const existingBooks=await allBooks();
 const existingIds=new Set(existingBooks.map(b=>b.id));
 const signatures=new Set(existingBooks.map(b=>`${(b.title||'').trim().toLowerCase()}|${b.size||0}|${b.format||''}`));
 const fileMap=new Map(data.files.filter(f=>f&&f.id).map(f=>[f.id,f]));
 const addBooks=[],addFiles=[];let skipped=0;
 for(const b of data.books){
  if(!b||!b.id||!fileMap.has(b.id)||!fileMap.get(b.id).blob)throw new Error('Backup is incomplete: a book file is missing. Nothing was restored.');
  const sig=`${(b.title||'').trim().toLowerCase()}|${b.size||0}|${b.format||''}`;
  if(existingIds.has(b.id)||signatures.has(sig)){skipped++;continue;}
  addBooks.push(b);addFiles.push(fileMap.get(b.id));existingIds.add(b.id);signatures.add(sig);
 }
 const existingSettings=await new Promise((res,rej)=>{const r=d.transaction('settings').objectStore('settings').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
 const settingMap=new Map(existingSettings.map(x=>[x.key,x.value]));
 for(const item of data.settings){
  if(!item||typeof item.key!=='string')continue;
  if(item.key==='bookmarks'){
   const merged={...(item.value||{}),...(settingMap.get('bookmarks')||{})};
   // Preserve both bookmark lists when a book id exists in both snapshots.
   const old=settingMap.get('bookmarks')||{},incoming=item.value||{};
   for(const id of Object.keys(incoming))merged[id]=[...(incoming[id]||[]),...(old[id]||[])];
   settingMap.set('bookmarks',merged);
  } else if(!settingMap.has(item.key)) settingMap.set(item.key,item.value);
 }
 return new Promise((res,rej)=>{
  const tx=d.transaction(['books','files','settings'],'readwrite');
  for(const b of addBooks)tx.objectStore('books').put(b);
  for(const f of addFiles)tx.objectStore('files').put(f);
  for(const [key,value] of settingMap)tx.objectStore('settings').put({key,value});
  tx.oncomplete=()=>res({added:addBooks.length,skipped});tx.onerror=()=>rej(tx.error||new Error('Restore failed'));tx.onabort=()=>rej(tx.error||new Error('Restore was cancelled'));
 });
}
