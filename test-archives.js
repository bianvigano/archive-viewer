const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || '/home/the-meh/.hermes/cache/scratch', 'archive-test-'));
process.env.MEDIA_UPLOADS = path.join(root, 'uploads');
const { app, safeName } = require('./app');
const seven = process.env.SEVEN_ZIP || path.join(__dirname, '.tools/usr/bin/7zz');
fs.mkdirSync(path.join(root, 'nested'));
fs.writeFileSync(path.join(root, 'nested/test.txt'), '<script>alert(1)</script> aman');
fs.writeFileSync(path.join(root, 'bad.zip'), 'invalid archive');
for (const [ext, type] of [['zip','zip'],['7z','7z'],['tar','tar']]) execFileSync(seven, ['a', `-t${type}`, path.join(root, `fixture.${ext}`), 'nested/test.txt'], { cwd: root });
execFileSync(seven, ['a', '-tgzip', path.join(root, 'fixture.gz'), 'nested/test.txt'], { cwd: root });
execFileSync(seven, ['a', '-tgzip', path.join(root, 'fixture.tar.gz'), 'fixture.tar'], { cwd: root });
assert(!safeName('../bad')); assert(safeName('nested/test.txt'));
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const ext of ['zip', '7z', 'tar', 'gz', 'tar.gz']) {
      const form = new FormData(); form.append('archive', new Blob([fs.readFileSync(path.join(root, `fixture.${ext}`))]), `fixture.${ext}`);
      let r = await fetch(base + '/upload', { method: 'POST', body: form, redirect: 'manual' }); assert.equal(r.status,302, await r.text());
      const home = await (await fetch(base)).text(); const links = [...home.matchAll(/href="(\/archive\/[^\"]+)"/g)]; const link = links.at(-1)[1];
      r = await fetch(base + link); assert.equal(r.status, 200); assert((await r.text()).includes('&lt;script&gt;'));
      console.log(`PASS HTTP ${ext} list + preview`);
    }
    const form = new FormData(); form.append('archive', new Blob(['invalid']), 'bad.zip');
    assert.equal((await fetch(base+'/upload',{method:'POST',body:form})).status,400);
    assert.equal((await fetch(base+'/load-local?archive=..%2Fbad.zip')).status,400);
    console.log('PASS invalid archive + local traversal + nested path + escaped HTML');
  } catch (e) { console.error(e); process.exitCode=1; } finally { server.close(() => fs.rmSync(root, { recursive: true, force: true })); }
});
