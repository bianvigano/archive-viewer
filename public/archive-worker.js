'use strict';
importScripts('/assets/jszip.js');
const LIMIT=200*1024*1024, COUNT=1000;
let entries=[];
const safe=n=>typeof n==='string' && n.length>0 && n.length<=4096 && !/[\x00-\x1f]/.test(n) && !/^[\\/]|^[A-Za-z]:/.test(n) && !n.split(/[\\/]/).includes('..');
function check(n,s){if(!safe(n)||!Number.isSafeInteger(s)||s<0||s>LIMIT)throw Error('Path atau ukuran entri tidak aman.');}
async function unzip(entry,limit){return new Promise((resolve,reject)=>{let parts=[],size=0; const stream=entry.internalStream('uint8array'); stream.on('data',chunk=>{size+=chunk.length;if(size>limit){stream.pause();parts=[];reject(Error('Batas dekompresi terlampaui.'));}else parts.push(chunk);}).on('error',reject).on('end',()=>resolve(new Blob(parts))).resume();});}
async function gunzip(file){const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT)throw Error('GZIP melebihi 200 MiB.');parts.push(value);}return new Blob(parts);}catch(e){await reader.cancel();throw e;}}
async function tar(blob){const b=new Uint8Array(await blob.arrayBuffer()), decoder=new TextDecoder('utf-8',{fatal:true});let out=[],seen=new Set(),total=0;
 const text=(p,n)=>{const a=b.subarray(p,p+n),end=a.indexOf(0);return decoder.decode(end<0?a:a.subarray(0,end));};
 const num=(p,n)=>{const s=text(p,n).trim();if(!/^[0-7]+$/.test(s))throw Error('Angka TAR tidak valid.');const v=parseInt(s,8);if(!Number.isSafeInteger(v))throw Error('Angka TAR terlalu besar.');return v;};
 for(let p=0;p<b.length;){if(p+512>b.length)throw Error('Header TAR terpotong.');if(b.subarray(p,p+512).every(x=>x===0))return out;
 let sum=0;for(let j=0;j<512;j++)sum+=j>=148&&j<156?32:b[p+j];if(sum!==num(p+148,8))throw Error('Checksum TAR tidak valid.');
 const name=[text(p+345,155),text(p,100)].filter(Boolean).join('/'),size=num(p+124,12),type=b[p+156];check(name,size);const end=p+512+size,next=p+512+Math.ceil(size/512)*512;if(end>b.length||next>b.length)throw Error('Isi TAR terpotong.');
 if(type===0||type===48){if(seen.has(name)||out.length>=COUNT||(total+=size)>LIMIT)throw Error('Batas atau duplikat TAR.');seen.add(name);out.push({name,size,blob:blob.slice(p+512,end)});}else if(type!==53)throw Error('Ekstensi/link TAR tidak didukung; gunakan TAR reguler USTAR.');p=next;
 }throw Error('Penutup TAR tidak ada.');}
self.onmessage=async({data:m})=>{try{if(m.op==='open'){const f=m.file;if(f.size>50*1024*1024)throw Error('Arsip maksimal 50 MiB.');let blob=f;
 if(/\.zip$/i.test(f.name)){const z=await JSZip.loadAsync(f);let total=0;entries=[];for(const e of Object.values(z.files)){const name=e.unsafeOriginalName||e.name;check(name,e.dir?0:e._data.uncompressedSize);if(e.dir)continue;if(entries.length>=COUNT||(total+=e._data.uncompressedSize)>LIMIT)throw Error('Batas ZIP terlampaui.');entries.push({name,size:e._data.uncompressedSize,zip:e});}}
 else {if(/\.(gz|tgz)$/i.test(f.name))blob=await gunzip(f);if(/\.(tar|tar\.gz|tgz)$/i.test(f.name))entries=await tar(blob);else {const name=f.name.replace(/\.gz$/i,'');check(name,blob.size);entries=[{name,size:blob.size,blob}];}}
 if(!entries.length)throw Error('Arsip kosong.');postMessage({id:m.id,files:entries.map(({name,size})=>({name,size,bytes:size}))});
 }else {const e=entries[m.index];if(!e)throw Error('Entri tidak ada.');const limit=m.limit;if(!Number.isSafeInteger(limit)||limit<0||limit>LIMIT||e.size>limit)throw Error('Berkas terlalu besar untuk preview.');postMessage({id:m.id,blob:e.blob||await unzip(e.zip,limit)});}}catch(e){postMessage({id:m.id,error:e.message});}};
