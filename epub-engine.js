// Small dependency-free EPUB ZIP reader. Uses browser DecompressionStream for deflate entries.
const decoder=new TextDecoder();
function u16(v,o){return v.getUint16(o,true)} function u32(v,o){return v.getUint32(o,true)}
async function inflate(bytes,method){
 if(method===0)return bytes;
 if(method!==8)throw new Error('This EPUB uses an unsupported ZIP compression method.');
 if(!('DecompressionStream'in self))throw new Error('This browser cannot decompress EPUB files. Update Chrome and try again.');
 try{return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
 catch(e){throw new Error('Could not decompress EPUB content: '+e.message)}
}
export async function readEpub(blob){
 const buf=await blob.arrayBuffer(),v=new DataView(buf),bytes=new Uint8Array(buf);
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(v,i)===0x06054b50){eocd=i;break}}
 if(eocd<0)throw new Error('This file is not a valid EPUB/ZIP archive.');
 const count=u16(v,eocd+10),cdSize=u32(v,eocd+12),cdOff=u32(v,eocd+16);if(cdOff+cdSize>bytes.length)throw new Error('EPUB archive directory is damaged.');
 const entries=new Map();let p=cdOff;
 for(let i=0;i<count;i++){if(u32(v,p)!==0x02014b50)throw new Error('EPUB archive directory is invalid.');
  const method=u16(v,p+10),csize=u32(v,p+20),nlen=u16(v,p+28),elen=u16(v,p+30),clen=u16(v,p+32),off=u32(v,p+42);
  const name=decoder.decode(bytes.slice(p+46,p+46+nlen)).replace(/\\/g,'/');entries.set(name,{method,csize,off});p+=46+nlen+elen+clen;
 }
 async function get(path){path=decodeURIComponent(path).replace(/^\/+/,'');const ent=entries.get(path);if(!ent)return null;const o=ent.off;if(u32(v,o)!==0x04034b50)throw new Error('Invalid EPUB entry: '+path);const nl=u16(v,o+26),el=u16(v,o+28),start=o+30+nl+el;return decoder.decode(await inflate(bytes.slice(start,start+ent.csize),ent.method))}
 const container=await get('META-INF/container.xml');if(!container)throw new Error('EPUB is missing META-INF/container.xml.');
 const root=new DOMParser().parseFromString(container,'application/xml').querySelector('rootfile')?.getAttribute('full-path');if(!root)throw new Error('Could not locate the EPUB package document.');
 const opf=await get(root);if(!opf)throw new Error('Could not read the EPUB package document.');
 const xml=new DOMParser().parseFromString(opf,'application/xml');if(xml.querySelector('parsererror'))throw new Error('The EPUB package XML is invalid.');
 const base=root.includes('/')?root.slice(0,root.lastIndexOf('/')+1):'';
 const items=new Map([...xml.querySelectorAll('manifest item')].map(n=>[n.getAttribute('id'),{href:n.getAttribute('href'),type:n.getAttribute('media-type'),props:n.getAttribute('properties')||''}]));
 const spine=[...xml.querySelectorAll('spine itemref')].map(n=>items.get(n.getAttribute('idref'))).filter(x=>x&&/xhtml|html/i.test(x.type||''));
 if(!spine.length)throw new Error('No readable chapters were found in this EPUB.');
 const chapters=[];
 for(const item of spine){const path=base+item.href.split('#')[0];const raw=await get(path);if(!raw)continue;
  const doc=new DOMParser().parseFromString(raw,'text/html');doc.querySelectorAll('script,style,iframe,object,embed,form,video,audio').forEach(n=>n.remove());
  const title=doc.querySelector('h1,h2,title')?.textContent?.trim()||`Chapter ${chapters.length+1}`;
  const content=doc.body?.innerHTML||doc.documentElement.innerHTML;
  chapters.push({title,content,text:doc.body?.textContent||''});
 }
 if(!chapters.length)throw new Error('No chapter content could be extracted.');
 return {chapters,title:xml.querySelector('metadata title')?.textContent?.trim()||'',author:xml.querySelector('metadata creator')?.textContent?.trim()||''};
}