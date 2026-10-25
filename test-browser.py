"""Synthetic-only local browser regression. Run: python test-browser.py"""
import base64, gzip, io, json, os, pathlib, shutil, socket, subprocess, tarfile, tempfile, time, urllib.request, zipfile
from camoufox.sync_api import Camoufox
ROOT = pathlib.Path(__file__).resolve().parent
SCRATCH = pathlib.Path('/home/the-meh/.hermes/cache/scratch')
with tempfile.TemporaryDirectory(prefix='archive-browser-', dir=SCRATCH) as tmp:
    tmp = pathlib.Path(tmp)
    files = {'hello.txt': b'local text <safe>\n' + b'x' * (1024 * 1024 + 1), 'image.png': base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=')}
    ffmpeg = shutil.which('ffmpeg')
    if ffmpeg:
        subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(tmp/'video.mp4')], check=True)
        files['video.mp4'] = (tmp/'video.mp4').read_bytes()
    with zipfile.ZipFile(tmp/'fixture.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items(): z.writestr(name, data)
    with tarfile.open(tmp/'fixture.tar', 'w', format=tarfile.USTAR_FORMAT) as tar:
        for name, data in files.items():
            info=tarfile.TarInfo(name); info.size=len(data); tar.addfile(info,io.BytesIO(data))
    (tmp/'fixture.tar.gz').write_bytes(gzip.compress((tmp/'fixture.tar').read_bytes()))
    (tmp/'hello.txt.gz').write_bytes(gzip.compress(files['hello.txt']))
    (tmp/'bad.zip').write_bytes(b'not an archive')
    with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    log=open(SCRATCH/'archive-browser-server.log','w')
    server=subprocess.Popen(['node','app.js'],cwd=ROOT,env={**os.environ,'PORT':str(port),'ARCHIVE_UPLOAD_DIR':str(tmp/'uploads')},stdout=log,stderr=log)
    try:
        url=f'http://127.0.0.1:{port}'
        for _ in range(100):
            try: urllib.request.urlopen(url,timeout=1); break
            except Exception: time.sleep(.1)
        with Camoufox(headless=True,humanize=True,main_world_eval=True) as browser:
            page=browser.new_page(); posts=[]; errors=[]
            page.on('request',lambda r: posts.append(r.url) if r.method=='POST' or '/upload' in r.url else None)
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.add_init_script('''window.liveURLs=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);liveURLs.add(u);return u};URL.revokeObjectURL=u=>{liveURLs.delete(u);revoke(u)};''')
            page.goto(url)
            def main(expression):
                # Camoufox isolates evaluate; an inline page script reaches application lexical state.
                return page.evaluate("""expression=>{const script=document.createElement('script');script.textContent='Promise.resolve((async()=>{'+expression+'})()).then(value=>document.documentElement.dataset.testResult=JSON.stringify({value}),error=>document.documentElement.dataset.testResult=JSON.stringify({error:String(error)}))';delete document.documentElement.dataset.testResult;document.head.append(script);script.remove()}""",expression) or wait_result()
            def wait_result():
                page.wait_for_function('document.documentElement.dataset.testResult!==undefined')
                result=json.loads(page.evaluate('document.documentElement.dataset.testResult'))
                assert 'error' not in result,result
                return result.get('value')
            results=[]
            for archive in ['fixture.zip','fixture.tar','hello.txt.gz','fixture.tar.gz']:
                page.locator('#file-input').set_input_files(str(tmp/archive))
                page.wait_for_function('(name)=>document.querySelector("#active-archive-title").textContent===name',arg=archive)
                page.locator('#file-table-body button').nth(0).click()
                page.wait_for_function('document.querySelector("#viewer-text").textContent.length>1048576')
                assert page.locator('#viewer-text').text_content()==files['hello.txt'].decode()
                if archive!='hello.txt.gz':
                    page.locator('#view-content button').filter(has_text='Kembali').first.click()
                    page.locator('#file-table-body tr').nth(1).locator('button').first.click()
                    page.wait_for_function('document.querySelector("#viewer-image").naturalWidth===1')
                    assert page.evaluate('document.querySelector("#viewer-image").decode().then(()=>true)')
                    if ffmpeg:
                        main('await openFileViewer(2)')
                        page.wait_for_function('document.querySelector("#viewer-video")?.readyState>=1',timeout=30000)
                        assert page.evaluate('document.querySelector("#viewer-video").videoWidth===32 && document.querySelector("#viewer-video").duration>0')
                page.locator('#view-content button').filter(has_text='Kembali').first.click()
                page.locator('button').filter(has_text='Hapus tab dan data sementara').click()
                assert page.locator('#archive-error').evaluate('(d)=>d.open')
                page.locator('#archive-error form button').click()
                assert main('return openTabs.length===1')
                page.locator('#file-table-body tr').first.click(button='right')
                page.locator('#context-menu button').filter(has_text='Properti').click()
                assert page.locator('#dialog-title').text_content()=='Info Berkas'
                page.locator('#archive-error form button').click()
                page.locator('#file-table-body tr').first.click(button='right')
                with page.expect_download() as downloaded:
                    page.locator('#context-menu button').filter(has_text='Unduh').click()
                assert downloaded.value.suggested_filename=='hello.txt'
                page.locator('button').filter(has_text='Hapus tab dan data sementara').click()
                page.locator('#archive-error .danger').click()
                page.wait_for_function('document.querySelector("#empty-archive-state") && !document.querySelector("#empty-archive-state").classList.contains("hidden")')
                assert page.evaluate('window.liveURLs.size===0')
                results.append(archive+': text >1MiB'+(', decoded image + MP4 metadata' if ffmpeg and archive!='hello.txt.gz' else '')+'; tab cleanup')
            page.locator('#file-input').set_input_files(str(tmp/'bad.zip'))
            page.wait_for_function('document.querySelector("#archive-error")?.open')
            assert main('return localWorkers.size===0 && localPending.size===0')
            page.locator('#archive-error form button').click()
            page.locator('#file-input').set_input_files(str(tmp/'fixture.zip'))
            page.wait_for_function('document.querySelector("#active-archive-title").textContent==="fixture.zip"')
            assert page.locator('.menu-trigger').count()==0
            assert '⋮' not in (page.locator('#archive-tabs').text_content() or '')
            close=page.locator('#archive-tabs .archive-tab-close').first
            assert close.text_content()=='' and close.get_attribute('aria-label')=='Tutup fixture.zip'
            assert close.evaluate("el=>['::before','::after'].every(p=>{const s=getComputedStyle(el,p);return s.content==='\"\"' && s.width==='1px' && s.height==='12px' && s.transform!=='none'})")
            tab=page.locator('#archive-tabs button:not(.archive-tab-close)').first
            tab.click(button='right')
            assert 'Lihat Arsip' not in (page.locator('#context-menu').text_content() or '')
            assert page.locator('#context-menu button').count()==3
            page.keyboard.press('Escape')
            tab.press('Shift+F10')
            assert page.locator('#context-menu').is_visible()
            page.keyboard.press('Escape')
            row=page.locator('#file-table-body tr').first
            row.focus(); row.press('ContextMenu')
            assert page.locator('#context-menu').is_visible()
            page.keyboard.press('Escape')
            # Closing an inactive local tab must not activate it or retain its worker.
            page.locator('#file-input').set_input_files(str(tmp/'fixture.tar'))
            page.wait_for_function('document.querySelector("#active-archive-title").textContent==="fixture.tar"')
            page.locator('#archive-tabs .archive-tab-close').first.click()
            assert main('return openTabs.length===1 && localWorkers.size===1 && archives[activeArchiveKey].name==="fixture.tar"')
            page.locator('#archive-tabs .archive-tab-close').first.click()
            assert main('return openTabs.length===0 && localWorkers.size===0 && localTimers.size===0 && localPending.size===0')
            assert page.evaluate('window.liveURLs.size===0')
            page.locator('#file-input').set_input_files(str(tmp/'fixture.zip'))
            page.wait_for_function('document.querySelector("#active-archive-title").textContent==="fixture.zip"')
            results.append('context: right-click tab/file, Shift+F10/Menu, no dots/Lihat Arsip; inactive x preserves selection and releases worker')
            # Exercise real worker rejection, without mutating any archives on disk.
            assert main('return await workerRequest(activeArchiveKey,{op:"read",index:9999,limit:209715200}).then(()=>false,e=>!!e.message)')
            assert main('return localPending.size===0')
            main('await openFileViewer(1)')
            page.wait_for_function('document.querySelector("#viewer-image").naturalWidth===1')
            # Shorten only the browser idle timer; no 30-minute sleep.
            main('''clearTimeout(localTimers.get(activeArchiveKey));localTimers.set(activeArchiveKey,setTimeout(()=>disposeLocal(activeArchiveKey),20));''')
            time.sleep(.1)
            assert main('return localWorkers.size===0 && localTimers.size===0 && openTabs.length===0 && Object.keys(archives).length===0')
            assert not posts, posts
            assert not errors, errors
            page.locator('#file-input').set_input_files(str(tmp/'fixture.zip'))
            page.wait_for_function('document.querySelector("#active-archive-title").textContent==="fixture.zip"')
            page.locator('#file-table-body tr').first.click(button='right')
            (ROOT/'docs/screenshots').mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(ROOT/'docs/screenshots/context-menu-preview.png'))
            report={'passed':results,'errors':'invalid ZIP dialog + worker read rejection settled','cleanup':'tab and idle worker/maps/archive/Blob URLs released','post_or_upload_requests':posts,'page_errors':errors,'video':'MP4 metadata decoded' if ffmpeg else 'SKIPPED: ffmpeg absent'}
            (SCRATCH/'archive-browser-results.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,indent=2))
    finally:
        server.terminate(); server.wait(timeout=10); log.close()
