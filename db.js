const NAME='marginalia',VER=1;let _db;
export function open(){
 if(_db)return Promise.resolve(_db);
 return new Promise((res,rej)=>{
  const r=indexedDB.open(NAME,VER);
  r.onupgradeneeded=e=>{const d=r.result;
   if(e.oldVersion<1){
    const b=d.createObjectStore('books',{keyPath:'id'});
    b.createIndex('added','added');b.createIndex('opened','opened');b.createIndex('title','title');
    d.createObjectStore('files',{keyPath:'id'});
    d.createObjectStore('settings',{keyPath:'key'});
   }};
  r.onsuccess=()=>{_db=r.result;_db.onversionchange=()=>_db.close();res(_db)};
  r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('Database blocked by another tab'));
 });}
const wrap=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
export async function allBooks(){const d=await open();return wrap(d.transaction('books').objectStore('books').getAll())}
export async function getFile(id){const d=await open();return wrap(d.transaction('files').objectStore('files').get(id))}
// Metadata + blob written in ONE transaction: both succeed or neither does.
export async function addBook(meta,blob){
 const d=await open();
 return new Promise((res,rej)=>{
  const t=d.transaction(['books','files'],'readwrite');
  t.objectStore('books').add(meta);t.objectStore('files').add({id:meta.id,blob});
  t.oncomplete=()=>res(meta);
  t.onerror=()=>rej(t.error);
  t.onabort=()=>rej(t.error||new Error('Transaction aborted'));
 });}
export async function updateBook(meta){const d=await open();return wrap(d.transaction('books','readwrite').objectStore('books').put(meta))}
export async function removeBook(id){
 const d=await open();
 return new Promise((res,rej)=>{
  const t=d.transaction(['books','files'],'readwrite');
  t.objectStore('books').delete(id);t.objectStore('files').delete(id);
  t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
 });}
export async function getSetting(key,def){const d=await open();const r=await wrap(d.transaction('settings').objectStore('settings').get(key));return r?r.value:def}
export async function setSetting(key,value){const d=await open();return wrap(d.transaction('settings','readwrite').objectStore('settings').put({key,value}))}
