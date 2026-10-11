/**
 * Kitsuna no Akuma — desktop shell.
 *
 * Plain CJS on purpose (Electron's main process is happiest that way) — even
 * though the package is `"type": "module"`, `main.cjs` is resolved as CommonJS.
 *
 * What it does beyond opening a window:
 *   • serves `dist/` over a tiny local http server so ES modules, the service
 *     worker and relative asset paths all behave exactly like the web build
 *   • frameless window with the game's own title bar (see preload.cjs)
 *   • remembers window bounds, single-instance lock, devtools on F12
 *   • writes save files + screenshots next to the OS user-data folder
 */
const { app, BrowserWindow, ipcMain, screen, dialog, shell, Menu } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const APP_NAME = 'Kitsuna no Akuma';
let win = null;
let server = null;
let port = 0;

// ─────────────────────────────────────────────────── static file server ──
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function startServer(root) {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const parsed = url.parse(req.url);
      let rel = decodeURIComponent(parsed.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ''));
      if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
          // SPA fallback: everything else is index.html
          const fallback = path.join(root, 'index.html');
          fs.readFile(fallback, (e2, buf) => {
            if (e2) { res.writeHead(404).end('not found'); return; }
            res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' }).end(buf);
          });
          return;
        }
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
          'accept-ranges': 'none',
        });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); });
  });
}

// ────────────────────────────────────────────────────── window plumbing ──
const boundsFile = () => path.join(app.getPath('userData'), 'window.json');

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); } catch { return null; }
}
function saveBounds() {
  if (!win) return;
  try {
    const b = win.getBounds();
    const area = screen.getPrimaryDisplay().workArea;
    // refuse to restore off-screen (monitor unplugged since last run)
    const visible = b.x < area.x + area.width - 120 && b.y < area.y + area.height - 120
      && b.x + b.width > area.x + 120 && b.y + b.height > area.y + 120;
    fs.writeFileSync(boundsFile(), JSON.stringify({
      ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen(), visible,
    }));
  } catch { /* never fatal */ }
}

function createWindow() {
  const saved = loadBounds();
  const area = screen.getPrimaryDisplay().workArea;
  const w = Math.min(saved?.width || 1440, area.width);
  const h = Math.min(saved?.height || 860, area.height);

  win = new BrowserWindow({
    width: w, height: h,
    minWidth: 960, minHeight: 540,
    x: saved?.visible ? saved.x : undefined,
    y: saved?.visible ? saved.y : undefined,
    show: false,
    frame: false,                     // the game draws its own title bar
    backgroundColor: '#0b0708',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      webSecurity: true,
      enableWebSQL: false,
      // keep the GPU busy even when the window is not focused
      // (players alt-tab a lot; nothing should stutter when they come back)
      additionalArguments: ['--enable-gpu-rasterization'],
    },
  });

  Menu.setApplicationMenu(null);
  if (saved?.maximized) win.maximize();
  if (saved?.fullscreen) win.setFullScreen(true);

  const target = isDev ? process.env.VITE_DEV_SERVER_URL : `http://127.0.0.1:${port}/`;
  win.loadURL(target).catch((err) => console.error('[shell] load failed', err));

  win.once('ready-to-show', () => win.show());
  win.on('close', saveBounds);
  win.on('closed', () => { win = null; });
  win.on('enter-full-screen', () => win.webContents.send('desktop:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('desktop:fullscreen', false));

  // links open in the real browser, never inside the game
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => {
    if (!u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith('devtools://') && !isDev) {
      e.preventDefault();
      shell.openExternal(u);
    }
  });

  // F12 / Ctrl+Shift+I inspector, F11 fullscreen, Ctrl+P screenshot
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      win.webContents.toggleDevTools(); e.preventDefault();
    } else if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen()); e.preventDefault();
    }
  });

  return win;
}

// ────────────────────────────────────────────────────────────────── ipc ──
ipcMain.handle('desktop:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  userData: app.getPath('userData'),
  appPath: app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath(),
  packaged: app.isPackaged,
  dev: isDev,
}));
ipcMain.on('desktop:minimize', () => win?.minimize());
ipcMain.on('desktop:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('desktop:close', () => win?.close());
ipcMain.handle('desktop:isMaximized', () => !!win?.isMaximized());
ipcMain.handle('desktop:fullscreen', (e, on) => { win?.setFullScreen(!!on); return !!win?.isFullScreen(); });

ipcMain.handle('desktop:screenshot', async (_e, dataUrl) => {
  const dir = path.join(app.getPath('pictures') || app.getPath('userData'), 'Kitsuna no Akuma');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  const file = path.join(dir, `kitsuna-${Date.now()}.png`);
  const b64 = String(dataUrl || '').split(',')[1] || '';
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  shell.showItemInFolder(file);
  return file;
});

ipcMain.handle('desktop:chooseDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('desktop:crash', () => { throw new Error('deliberate crash'); });

// ───────────────────────────────────────────────────────────────── boot ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  app.whenReady().then(async () => {
    app.commandLine.appendSwitch('enable-high-resolution-timer');
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
    if (!isDev) await startServer(path.join(__dirname, '..', 'dist'));
    createWindow();
  });

  app.on('will-quit', () => { try { server?.close(); } catch { /* ignore */ } });
}

process.on('uncaughtException', (err) => console.error('[shell] uncaught', err));
