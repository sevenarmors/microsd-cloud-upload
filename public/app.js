const loginPanel = document.querySelector("#login-panel");
const appPanel = document.querySelector("#app-panel");
const loginMessage = document.querySelector("#login-message");
const uploadMessage = document.querySelector("#upload-message");
const fileInput = document.querySelector("#files");
const dropZone = document.querySelector("#drop-zone");
const fileList = document.querySelector("#file-list");

const formatBytes = bytes => new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
const escapeHtml = value => value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function showApp(signedIn) {
  loginPanel.classList.toggle("hidden", signedIn);
  appPanel.classList.toggle("hidden", !signedIn);
  if (signedIn) loadFiles();
}

async function loadFiles() {
  const response = await fetch("/api/files");
  if (response.status === 401) return showApp(false);
  const { files } = await response.json();
  fileList.innerHTML = files.length ? files.map(file => `
    <a class="file-row" href="/files/${encodeURIComponent(file.name)}">
      <span class="file-mark">↳</span><span class="file-name">${escapeHtml(file.name)}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
    </a>`).join("") : '<p class="muted">Nothing has been uploaded yet.</p>';
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "";
  const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: document.querySelector("#password").value }) });
  if (!response.ok) return loginMessage.textContent = (await response.json()).error;
  event.target.reset();
  showApp(true);
});

document.querySelector("#upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!fileInput.files.length) return uploadMessage.textContent = "Choose at least one file first.";
  const button = document.querySelector("#upload-button");
  button.disabled = true;
  uploadMessage.textContent = "Uploading…";
  const body = new FormData();
  [...fileInput.files].forEach(file => body.append("files", file));
  const response = await fetch("/api/upload", { method: "POST", body });
  button.disabled = false;
  if (!response.ok) return uploadMessage.textContent = (await response.json()).error;
  const { uploaded } = await response.json();
  uploadMessage.textContent = `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded successfully.`;
  event.target.reset();
  loadFiles();
});

["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", event => { fileInput.files = event.dataTransfer.files; });
document.querySelector("#refresh").addEventListener("click", loadFiles);
document.querySelector("#logout").addEventListener("click", async () => { await fetch("/api/logout", { method: "POST" }); showApp(false); });

fetch("/api/session").then(response => response.json()).then(({ signedIn }) => showApp(signedIn));
