const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { execFile } = require("child_process");
const seven =
  process.env.SEVEN_ZIP || path.join(__dirname, ".tools/usr/bin/7zz");
const app = express();
app.set("view engine", "ejs");
const ROOT = __dirname,
  UPLOAD_ROOT = process.env.ARCHIVE_UPLOAD_DIR ? path.resolve(process.env.ARCHIVE_UPLOAD_DIR) :
    process.env.MEDIA_UPLOADS ? path.resolve(process.env.MEDIA_UPLOADS) : path.join(ROOT, "uploads"),
  // ponytail: custom test directories stay stable; normal runs get an owned per-process session.
  UPLOADS = process.env.ARCHIVE_UPLOAD_DIR || process.env.MEDIA_UPLOADS ? UPLOAD_ROOT : path.join(UPLOAD_ROOT, `session-${process.pid}-${crypto.randomBytes(6).toString("hex")}`),
  CACHE = path.join(UPLOADS, ".cache");
fs.mkdirSync(UPLOADS, { recursive: true, mode: 0o700 });
const IDLE_MS = Math.max(1000, Number(process.env.ARCHIVE_IDLE_MS || process.env.ARCHIVE_IDLE_MINUTES * 60000 || 30 * 60000)),
  MAX_STORAGE = Math.max(1, Number(process.env.ARCHIVE_MAX_STORAGE || 200 * 1024 * 1024)),
  ownedFiles = new Set(), lastAccess = new Map();
const touch = id => lastAccess.set(id, Date.now());
const owned = file => ownedFiles.add(path.resolve(file));
const isBusy = file => activeStreams.has(file) || [...pending.values()].some(p => p.file === file);
function cleanup(expire = false) {
  if(inFlight || pending.size || activeStreams.size) return;
  const now = Date.now();
  for (const [id, a] of archives) if (expire && now - (lastAccess.get(id) || now) >= IDLE_MS && !isBusy(a.file)) { if(ownedFiles.has(a.file)) { try { fs.unlinkSync(a.file); } catch {} } archives.delete(id); lastAccess.delete(id); }
  const files = [...ownedFiles].filter(f => fs.existsSync(f) && !isBusy(f)).sort((a,b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  let total = files.reduce((n,f) => n + fs.statSync(f).size, 0);
  for (const f of files) if (total > MAX_STORAGE) { try { total -= fs.statSync(f).size; fs.unlinkSync(f); ownedFiles.delete(f); for(const [id,a] of archives) if(a.file===f) archives.delete(id); } catch {} }
}
const cleanupTimer = setInterval(() => cleanup(true), Math.min(IDLE_MS, 60000)); cleanupTimer.unref();
function shutdown() { clearInterval(cleanupTimer); for (const f of ownedFiles) { try { fs.unlinkSync(f); } catch {} } if (UPLOADS !== UPLOAD_ROOT) fs.rmSync(UPLOADS,{recursive:true,force:true}); }
if (UPLOADS !== UPLOAD_ROOT) {
  fs.writeFileSync(path.join(UPLOADS,'.owner'), JSON.stringify({pid:process.pid}));
  for (const name of fs.readdirSync(UPLOAD_ROOT)) {
    if (!/^session-\d+-[a-f0-9]{12}$/.test(name)) continue;
    const dir=path.join(UPLOAD_ROOT,name), marker=path.join(dir,'.owner');
    try {
      if (!fs.lstatSync(dir).isDirectory() || Date.now()-fs.statSync(marker).mtimeMs < IDLE_MS) continue;
      const {pid}=JSON.parse(fs.readFileSync(marker));
      if (!Number.isInteger(pid) || pid<=0) continue;
      try { process.kill(pid,0); } catch(e) { if(e.code==='ESRCH') fs.rmSync(dir,{recursive:true,force:true}); }
    } catch {}
  }
}
process.once("SIGINT", () => { shutdown(); process.exit(0); }); process.once("SIGTERM", () => { shutdown(); process.exit(0); });
let inFlight=0;
const activeStreams = new Map();
const pending = new Map();
fs.mkdirSync(CACHE, { recursive: true, mode: 0o700 });
fs.chmodSync(CACHE, 0o700);
const MAX_UPLOAD = 50 * 1024 * 1024,
  MAX_PREVIEW = 1024 * 1024,
  MAX_CACHE = 10 * 1024 * 1024,
  MAX_EXTRACT = 10 * 1024 * 1024;
const archives = new Map(),
  upload = multer({ dest: UPLOADS, limits: { fileSize: MAX_UPLOAD } });
const formats = [".zip", ".rar", ".7z", ".tar", ".tar.gz", ".tgz", ".gz"];
function log(level, message, detail = "") {
  console[level](
    `[${new Date().toISOString()}] ${message}${detail ? ` — ${detail}` : ""}`,
  );
}
function archiveType(name) {
  const n = name.toLowerCase();
  return formats.find((x) => n.endsWith(x));
}
function safeName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !/[\x00-\x1f]/.test(name) &&
    !/^[\\/]|^[A-Za-z]:/.test(name) &&
    !name.split(/[\\/]/).includes("..")
  );
}
function run7(args, cb) {
  execFile(
    seven,
    args,
    { maxBuffer: 4 * 1024 * 1024, timeout: 15000, encoding: "buffer" },
    cb,
  );
}
function listArchive(file, cb) {
  run7(["l", "-slt", file], (err, out) => {
    if (err)
      return cb(new Error("Arsip tidak valid atau format tidak didukung"));
    const files = [];
    out
      .toString()
      .split(/\r?\n----------\r?\n/)
      .slice(1)
      .join("\n")
      .split(/\r?\n\r?\n/)
      .forEach((block) => {
        const p = block.match(/^Path = (.*)$/m),
          s = block.match(/^Size = (\d+)$/m);
        if (p && !/^Folder = \+$/m.test(block) && safeName(p[1]))
          files.push({ name: p[1], size: Number(s && s[1]) || 0 });
      });
    if (!files.length)
      return cb(new Error("Arsip kosong atau tidak dapat dibaca"));
    cb(null, files.slice(0, 1000));
  });
}
function addArchive(file, original, done) {
  inFlight++; const cb=(...args)=>{inFlight--; done(...args); cleanup();};
  const register = (target) =>
    listArchive(target, (err, files) => {
      if (err) return cb(err);
      const id = crypto.randomBytes(12).toString("hex");
      archives.set(id, { file: target, original, files });
      touch(id);
      log(
        "log",
        "Arsip berhasil dimuat",
        `${original}, ${files.length} berkas`,
      );
      cb(null, id);
    });
  if (/\.(tar\.gz|tgz)$/i.test(original))
    execFile(
      seven,
      ["x", "-so", "-p-", file],
      { maxBuffer: MAX_UPLOAD, timeout: 15000, encoding: "buffer" },
      (e, buffer) => {
        if (e)
          return cb(new Error("TAR.GZ tidak valid atau melebihi batas 50 MB."));
        const target = path.join(
          UPLOADS,
          crypto.randomBytes(16).toString("hex") + ".tar",
        );
        owned(target);
        fs.writeFile(target, buffer, { flag: "wx" }, (err) =>
          err ? cb(err) : register(target),
        );
      },
    );
  else register(file);
}
function renderHome(res) {
  res.render("index", {
    archives: [...archives].map(([id, a]) => ({
      id,
      name: a.original,
      files: a.files,
    })),
    localArchives: fs.readdirSync(ROOT).filter(archiveType),
  });
}
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () =>
    log(
      res.statusCode >= 400 ? "warn" : "log",
      "Permintaan HTTP",
      `${req.method} ${req.path} → ${res.statusCode}, ${Date.now() - start} ms`,
    ),
  );
  next();
});
app.get('/assets/jszip.js', (req,res) => res.sendFile(path.join(ROOT, 'jszip.js')));
app.use(express.static(path.join(ROOT,"public"))); /* browser assets remain explicit and same-origin */
app.get("/", (req, res) => renderHome(res));
app.post('/archive/:id/remove',(req,res)=>{if(inFlight||pending.size||activeStreams.size)return res.status(409).send('Sedang digunakan'); const a=archives.get(req.params.id); if(a && ownedFiles.has(a.file))fs.rmSync(a.file,{force:true}); archives.delete(req.params.id); res.redirect('/');});
app.post("/upload", upload.single("archive"), (req, res) => {
  if (!req.file) return res.status(400).send("Tidak ada arsip.");
  owned(req.file.path);
  addArchive(req.file.path, req.file.originalname, (e) =>
    e
      ? (fs.rmSync(req.file.path,{force:true}), log("warn", "Gagal memuat arsip", e.message),
        res.status(400).send(e.message))
      : res.redirect("/"),
  );
});
app.get("/load-local", (req, res) => {
  const name = req.query.archive;
  if (!name || name.includes("/") || name.includes("\\") || !archiveType(name))
    return res.status(400).send("Arsip lokal tidak valid.");
  addArchive(path.join(ROOT, name), name, (e) =>
    e ? res.status(400).send(e.message) : res.redirect("/"),
  );
});
function found(req) {
  const a = archives.get(req.params.id),
    name = req.params[0];
  if(a) touch(req.params.id);
  return a && safeName(name) && a.files.some((f) => f.name === name)
    ? { a, name }
    : null;
}
// ponytail: one 10 MB disk cache; busy entries are never evicted. Retry after streams close.
function mediaCache(key, f) {
  if (pending.has(key)) return pending.get(key);
  const cached = path.join(CACHE, key);
  if (fs.existsSync(cached)) return Promise.resolve(cached);
  const job = new Promise((resolve, reject) => {
    execFile(seven, ["x", "-so", "-spd", "-p-", f.a.file, "--", f.name],
      { maxBuffer: MAX_EXTRACT, timeout: 15000, encoding: "buffer" }, (err, out) => {
        if (err || out.length > MAX_CACHE) return reject(Object.assign(new Error("Media terlalu besar atau gagal diekstrak."), { status: 413 }));
        try {
          const entries = fs.readdirSync(CACHE).filter(x => /^[a-f0-9]{64}$/.test(x));
          let total = entries.reduce((n, x) => n + fs.statSync(path.join(CACHE, x)).size, 0);
          for (const x of entries) {
            if (total + out.length <= MAX_CACHE) break;
            const file = path.join(CACHE, x);
            if (activeStreams.has(file) || pending.has(x)) continue;
            total -= fs.statSync(file).size;
            fs.unlinkSync(file);
          }
          if (total + out.length > MAX_CACHE) return reject(Object.assign(new Error("Cache media sedang sibuk."), { status: 503 }));
          owned(cached);
          fs.writeFileSync(cached, out, { flag: "wx", mode: 0o600 });
          resolve(cached);
        } catch (e) { reject(e); }
      });
  });
  job.file=f.a.file;
  pending.set(key, job);
  job.finally(() => pending.delete(key)).catch(() => {});
  return job;
}
app.get("/archive/:id/raw/*", async (req, res, next) => {
  const f = found(req);
  if (!f) return res.status(404).send("File tidak ditemukan.");
  if (f.a.files.find(x => x.name === f.name).size > MAX_CACHE)
    return res.status(413).send("Media terlalu besar untuk cache.");
  try {
    const key = crypto.createHash("sha256").update(f.a.file + "\0" + f.name).digest("hex");
    const cached = await mediaCache(key, f);
    const size = fs.statSync(cached).size;
    res.type(path.extname(f.name) || "application/octet-stream").set("Accept-Ranges", "bytes");
    let start = 0, end = size - 1;
    if (req.headers.range !== undefined) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const invalid = () => res.status(416).set("Content-Range", `bytes */${size}`).end();
      if (!m || (!m[1] && !m[2]) || !size) return invalid();
      if (!m[1]) {
        const suffix = Number(m[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid();
        start = Math.max(0, size - suffix);
      } else {
        start = Number(m[1]);
        const requestedEnd = m[2] ? Number(m[2]) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return invalid();
        end = Math.min(requestedEnd, end);
      }
      res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.set("Content-Length", size ? end - start + 1 : 0);
    if (!size || req.method === "HEAD") return res.end();
    activeStreams.set(cached, (activeStreams.get(cached) || 0) + 1);
    const stream = fs.createReadStream(cached, { start, end });
    stream.on("close", () => {
      const count = activeStreams.get(cached) - 1;
      if (count) activeStreams.set(cached, count); else activeStreams.delete(cached);
    });
    stream.on("error", error => {
      log("error", "Gagal membaca media", error.message);
      if (res.headersSent) res.destroy(error); else next(error);
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (error.status) return res.status(error.status).send(error.message);
    next(error);
  }
});
app.get("/archive/:id/file/*", (req, res) => {
  const f = found(req);
  if (!f) return res.status(404).send("File tidak ditemukan.");
  const image = /\.(png|jpe?g|gif|webp)$/i.test(f.name),
    video = /\.(mp4|webm|ogg)$/i.test(f.name);
  const rawUrl = `/archive/${req.params.id}/raw/${f.name.split("/").map(encodeURIComponent).join("/")}`;
  if (image || video)
    return res.render("file", {
      archiveName:f.a.original, archiveId:req.params.id, fileSize:f.a.files.find(x=>x.name===f.name).size, position:f.a.files.findIndex(x=>x.name===f.name), fileNames:f.a.files.map(x=>x.name), mediaType:require("mime-types").lookup(f.name)||"text/plain",
      fileName: f.name,
      content: "",
      isImage: image,
      isVideo: video,
      mime: "",
      rawUrl,
    });
  inFlight++;
  run7(["x", "-so", "-spd", "-p-", f.a.file, "--", f.name], (e, out) => {
    inFlight--;
    if (e) return res.status(500).send("Gagal membaca file.");
    if (out.length > MAX_PREVIEW)
      return res.status(413).send("File terlalu besar untuk preview.");
    const image = /\.(png|jpe?g|gif|webp)$/i.test(f.name),
      video = /\.(mp4|webm|ogg)$/i.test(f.name);
    res.render("file", {
      archiveName:f.a.original, archiveId:req.params.id, fileSize:f.a.files.find(x=>x.name===f.name).size, position:f.a.files.findIndex(x=>x.name===f.name), fileNames:f.a.files.map(x=>x.name), mediaType:require("mime-types").lookup(f.name)||"text/plain",
      fileName: f.name,
      content: image ? out.toString("base64") : out.toString("utf8"),
      isImage: image,
      isVideo: video,
      mime: image
        ? `image/${f.name.split(".").pop().replace("jpg", "jpeg")}`
        : "",
      rawUrl: `/archive/${req.params.id}/raw/${f.name.split("/").map(encodeURIComponent).join("/")}`,
    });
  });
});
app.use((error, req, res, next) => {
  log("error", "Permintaan gagal", error.message);
  res
    .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 500)
    .send("Permintaan gagal; periksa batas unggahan atau log server.");
});

if (require.main === module)
  app.listen(process.env.PORT || 3000, () =>
    log("log", "Server berjalan", `port ${process.env.PORT || 3000}`),
  );
module.exports = { app, safeName, archiveType, archives, cleanup, shutdown, lastAccess, ownedFiles, UPLOADS };
