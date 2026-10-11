import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const app = express();
const port = Number(process.env.PORT || 3000);
const root = path.dirname(fileURLToPath(import.meta.url));
const storagePath = process.env.STORAGE_PATH || "/Volumes/MicroSD-128/MicroSD Cloud Uploads";
const password = process.env.UPLOAD_PASSWORD;
const maxFileSize = Number(process.env.MAX_FILE_SIZE || 1024 * 1024 * 1024); // 1 GiB
const sessionTtlMs = 1000 * 60 * 60 * 12;
const sessions = new Map();
const loginAttempts = new Map();

if (!password || password === "change-this-before-starting") {
  console.error("Set UPLOAD_PASSWORD to a private value before starting the server.");
  process.exit(1);
}

try {
  fs.mkdirSync(storagePath, { recursive: true });
} catch (error) {
  console.error(`Cannot create or use STORAGE_PATH (${storagePath}):`, error.message);
  process.exit(1);
}

if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(root, "public"), { index: "index.html" }));

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "").split(";").map(value => value.trim()).filter(Boolean).map(value => {
      const separator = value.indexOf("=");
      return [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))];
    })
  );
}

function getSession(request) {
  const id = parseCookies(request).upload_session;
  const session = id && sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    if (id) sessions.delete(id);
    return null;
  }
  return { id, ...session };
}

function requireSession(request, response, next) {
  if (!getSession(request)) return response.status(401).json({ error: "Please sign in first." });
  next();
}

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeFilename(name) {
  const cleaned = path.basename(name).replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^\.+/, "");
  return cleaned || "upload";
}

const diskStorage = multer.diskStorage({
  destination: (_request, _file, done) => done(null, storagePath),
  filename: (_request, file, done) => {
    const original = safeFilename(file.originalname);
    const extension = path.extname(original).slice(0, 32);
    const base = path.basename(original, extension).slice(0, 120) || "upload";
    done(null, `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}-${base}${extension}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: maxFileSize, files: 10 }
});

app.post("/api/login", (request, response) => {
  const ip = request.ip;
  const attempt = loginAttempts.get(ip) || { count: 0, startedAt: Date.now() };
  if (Date.now() - attempt.startedAt > 10 * 60 * 1000) loginAttempts.delete(ip);
  else if (attempt.count >= 10) return response.status(429).json({ error: "Too many attempts. Try again later." });

  if (!safeEqual(request.body?.password, password)) {
    loginAttempts.set(ip, { count: attempt.count + 1, startedAt: attempt.startedAt });
    return response.status(401).json({ error: "Incorrect password." });
  }

  loginAttempts.delete(ip);
  const id = crypto.randomBytes(32).toString("base64url");
  sessions.set(id, { expiresAt: Date.now() + sessionTtlMs });
  const secure = request.secure ? "; Secure" : "";
  response.setHeader("Set-Cookie", `upload_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtlMs / 1000}${secure}`);
  response.json({ ok: true });
});

app.post("/api/logout", (request, response) => {
  const session = getSession(request);
  if (session) sessions.delete(session.id);
  response.setHeader("Set-Cookie", "upload_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  response.status(204).end();
});

app.get("/api/session", (request, response) => response.json({ signedIn: Boolean(getSession(request)) }));

app.post("/api/upload", requireSession, upload.array("files", 10), (request, response) => {
  response.status(201).json({
    uploaded: (request.files || []).map(file => ({ name: file.filename, originalName: safeFilename(file.originalname), size: file.size }))
  });
});

app.get("/api/files", requireSession, (_request, response) => {
  const files = fs.readdirSync(storagePath, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const info = fs.statSync(path.join(storagePath, entry.name));
      return { name: entry.name, size: info.size, uploadedAt: info.birthtime.toISOString() };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  response.json({ files });
});

app.get("/files/:name", requireSession, (request, response) => {
  const name = path.basename(request.params.name);
  if (name !== request.params.name) return response.status(400).end();
  const filePath = path.join(storagePath, name);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return response.status(404).end();
  response.download(filePath, name);
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) return response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "A file exceeds the size limit." : error.message });
  console.error(error);
  response.status(500).json({ error: "Something went wrong. Please try again." });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id);
}, 60 * 60 * 1000).unref();

app.listen(port, () => console.log(`MicroSD Cloud Upload is running at http://localhost:${port}`));
