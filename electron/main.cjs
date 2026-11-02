const { app, BrowserWindow, shell, session, dialog } = require("electron");
const path = require("node:path");
const OWNER = "anemobe1122-alt";
const REPO = "nox-messenger";
let mainWindow;
function compareVersions(a, b) {
  const left = String(a).replace(/^v/, "").split(".").map(Number);
  const right = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i += 1) { const diff = (left[i] || 0) - (right[i] || 0); if (diff !== 0) return diff; }
  return 0;
}
async function checkForNoxUpdates() {
  if (!app.isPackaged) return;
  try {
    const response = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "Nox-Desktop" } });
    if (!response.ok) return;
    const release = await response.json();
    const latest = String(release.tag_name || "").replace(/^desktop-v/, "").replace(/^v/, "");
    if (!latest || compareVersions(latest, app.getVersion()) <= 0) return;
    const result = await dialog.showMessageBox(mainWindow, { type: "info", title: "Доступно обновление Nox", message: "Вышла новая версия Nox " + latest, detail: "У тебя установлена версия " + app.getVersion() + ". Открой страницу релиза, чтобы скачать обновление и установить его поверх текущей версии.", buttons: ["Скачать обновление", "Позже"], defaultId: 0, cancelId: 1 });
    if (result.response === 0) await shell.openExternal(release.html_url || ("https://github.com/" + OWNER + "/" + REPO + "/releases/latest"));
  } catch (error) { console.warn("Nox update check failed:", error); }
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, backgroundColor: "#111216", title: "Nox", autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url); return { action: "deny" }; });
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html")); else mainWindow.loadURL("http://localhost:5173");
  mainWindow.on("closed", () => { mainWindow = null; });
}
app.whenReady().then(() => {
  app.setAppUserModelId("com.nox.messenger");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(["media", "notifications", "clipboard-read", "clipboard-sanitized-write"].includes(permission)));
  createWindow();
  setTimeout(() => void checkForNoxUpdates(), 5000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
