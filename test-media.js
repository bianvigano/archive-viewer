const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || '/home/the-meh/.hermes/cache/scratch', 'media-test-'));
process.env.MEDIA_UPLOADS = path.join(root, 'uploads');
const seven = process.env.SEVEN_ZIP || path.join(__dirname, '.tools/usr/bin/7zz');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1kAAAAASUVORK5CYII=', 'base64');
// Byte fixture, not a browser playback test. Exceeds the old 4 MB extraction ceiling.
const video = Buffer.alloc(5 * 1024 * 1024, 0x5a);
video.write('ftypisom', 4);
fs.writeFileSync(path.join(root, 'image.png'), png);
fs.writeFileSync(path.join(root, 'video.mp4'), video);
fs.writeFileSync(path.join(root, 'too-big.mp4'), Buffer.alloc(10 * 1024 * 1024 + 1));
execFileSync(seven, ['a', '-tzip', path.join(root, 'media.zip'), 'image.png', 'video.mp4', 'too-big.mp4'], { cwd: root });
let loaded = require('./app');
let server;
async function listen() { server = loaded.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close() { await new Promise(resolve => server.close(resolve)); }
(async () => {
  try {
    let base = await listen();
    const form = new FormData(); form.append('archive', new Blob([fs.readFileSync(path.join(root, 'media.zip'))]), 'media.zip');
    assert.equal((await fetch(base + '/upload', { method: 'POST', body: form, redirect: 'manual' })).status, 302);
    const id = [...loaded.archives.keys()][0];
    const url = name => `${base}/archive/${id}/raw/${name}`;
    let r = await fetch(url('image.png'));
    assert.match(r.headers.get('content-type'), /^image\/png/); assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    const results = await Promise.all(Array.from({length: 4}, async () => {
      const response = await fetch(url('video.mp4')); assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^video\/mp4/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), video);
    }));
    for (const [range, start, end] of [['bytes=0-31',0,31], ['bytes=-17',video.length-17,video.length-1], ['bytes=5242870-',5242870,video.length-1], ['bytes=0-99999999',0,video.length-1]]) {
      r = await fetch(url('video.mp4'), { headers: { Range: range } });
      assert.equal(r.status,206); assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${video.length}`);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), video.subarray(start,end+1));
    }
    for (const range of ['bytes=-0','bytes=-','bytes=2-1','bytes=99999999-','bytes=0-1,3-4','junkbytes=0-1','bytes=0-1junk','bytes=9007199254740992-']) {
      r = await fetch(url('video.mp4'), { headers: { Range: range } });
      assert.equal(r.status,416,range); assert.equal(r.headers.get('content-range'), `bytes */${video.length}`); await r.arrayBuffer();
    }
    assert.equal((await fetch(url('too-big.mp4'))).status,413);
    console.log('PASS image MIME/bytes; 5 MB video full/concurrent bytes; Range/suffix/open/clamp; 8 invalid ranges + 416 Content-Range; >10 MB rejected');
    await close();
    loaded.shutdown();
    delete require.cache[require.resolve('./app')]; loaded = require('./app');
    assert.equal(loaded.archives.size,0);
    console.log('PASS session-only metadata: no restoration after module reload');
  } finally { if(server && server.listening) await close(); fs.rmSync(root,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
