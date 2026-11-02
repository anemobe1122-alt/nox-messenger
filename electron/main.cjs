const { app, BrowserWindow, shell, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
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
  if (!app.isPackaged || process.platform !== "win32") return;
  try {
    const response = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "Nox-Desktop" } });
    if (!response.ok) return;
    const release = await response.json();
    const latest = String(release.tag_name || "").replace(/^desktop-v/, "").replace(/^v/, "");
    if (!latest || compareVersions(latest, app.getVersion()) <= 0) return;

    const installer = (release.assets || []).find((asset) =>
      /\\.exe$/i.test(asset.name) && /(setup|installer)/i.test(asset.name)
    );
    if (!installer?.browser_download_url) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "info", title: "Доступно обновление Nox",
        message: "Вышла новая версия Nox " + latest,
        detail: "Для этой версии пока нет установщика для автоматического обновления.",
        buttons: ["Открыть релиз", "Позже"], defaultId: 0, cancelId: 1
      });
      if (result.response === 0) await shell.openExternal(release.html_url || ("https://github.com/" + OWNER + "/" + REPO + "/releases/latest"));
      return;
    }

    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info", title: "Обновление Nox",
      message: "Доступна версия " + latest,
      detail: "Nox автоматически скачает обновление и установит его после подтверждения. Приложение закроется на время установки.",
      buttons: ["Скачать и установить", "Позже"], defaultId: 0, cancelId: 1
    });
    if (choice.response !== 0) return;

    const download = await fetch(installer.browser_download_url, { headers: { "User-Agent": "Nox-Desktop" } });
    if (!download.ok || !download.body) throw new Error("Не удалось скачать установщик: HTTP " + download.status);
    const installerPath = path.join(app.getPath("temp"), "Nox-Update-" + latest + ".exe");
    await pipeline(Readable.fromWeb(download.body), fs.createWriteStream(installerPath));

    const ready = await dialog.showMessageBox(mainWindow, {
      type: "info", title: "Обновление скачано",
      message: "Версия " + latest + " готова к установке.",
      detail: "Nox закроется, установщик обновит приложение и запустит его снова.",
      buttons: ["Перезапустить и обновить", "Установить при закрытии"], defaultId: 0, cancelId: 1
    });
    if (ready.response === 1) {
      app.once("before-quit", () => {
        const child = spawn(installerPath, ["/S"], { detached: true, stdio: "ignore" });
        child.unref();
      });
      app.quit();
      return;
    }
    const child = spawn(installerPath, ["/S"], { detached: true, stdio: "ignore" });
    child.unref();
    app.quit();
  } catch (error) {
    console.warn("Nox update failed:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning", title: "Не удалось обновить Nox",
        message: "Обновление не удалось скачать или запустить.",
        detail: "Попробуй позже или скачай установщик со страницы релиза.",
        buttons: ["Открыть релиз", "Позже"], defaultId: 0, cancelId: 1
      }).then((result) => result.response === 0 ? shell.openExternal("https://github.com/" + OWNER + "/" + REPO + "/releases/latest") : undefined);
    }
  }
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
