import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const stage = process.argv[2] || 'baseline';
const PORT = 3003;
const CDP_PORT = 9231; // use 9231 to avoid any lingering 9230

const USER_DATA_DIR = path.join(os.tmpdir(), `chrome-babin-card3-${Date.now()}`);
const OUT_DIR = path.resolve(`docs/audits/card3-cleanup/${stage}`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function getWsUrl(port = CDP_PORT) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      const page = res.find(p => p.type === 'page') || res[0];
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) {
      // retry
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Could not connect to Chrome DevTools port ${port}`);
}

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const SCREENS = [
  { name: '01_today', path: '/today' },
  { name: '02_rentals', path: '/rentals' },
  { name: '03_booking_detail', path: '/rentals/BK-2026-0001' },
  { name: '04_new_rental', path: '/rentals/new' },
  { name: '05_packing', path: '/rentals/BK-2026-0001/packing' },
  { name: '06_inventory', path: '/inventory' },
  { name: '07_finance', path: '/finance' },
  { name: '08_report_pulse', path: '/reports/pulse' },
  { name: '09_settings', path: '/settings' }
];

const VIEWPORTS = [
  { width: 375, height: 812, name: '375' },
  { width: 820, height: 1180, name: '820' },
  { width: 1440, height: 900, name: '1440' }
];

const THEMES = ['light', 'dark'];

async function run() {
  console.log(`Starting Card 3 screenshot capture for stage: ${stage}...`);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `http://localhost:${PORT}/login`
  ]);

  try {
    const wsUrl = await getWsUrl(CDP_PORT);
    console.log('Connected to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    // Wait for login & click mock login
    console.log('Waiting for login...');
    for (let i = 0; i < 40; i++) {
      const chk = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".auth-mock-btn"))'
      });
      if (chk.result && chk.result.value) break;
      await new Promise(r => setTimeout(r, 400));
    }

    console.log('Clicking Owner mock sign-in...');
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('.auth-mock-btn'));
          const ownerBtn = btns.find(b => b.textContent && b.textContent.includes('Owner')) || btns[0];
          if (ownerBtn) ownerBtn.click();
        })()
      `
    });

    // Wait until logged in (app-sidebar or app-shell mounted)
    console.log('Waiting for app shell to mount...');
    for (let i = 0; i < 40; i++) {
      const chk = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".app-sidebar") || document.querySelector("nav") || document.querySelector(".app-main"))'
      });
      if (chk.result && chk.result.value) break;
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 2000));

    // Capture each screen
    for (const theme of THEMES) {
      console.log(`\n=== Setting Theme: ${theme} ===`);
      await sendCommand(ws, 'Runtime.evaluate', {
        expression: `
          (() => {
            document.documentElement.dataset['theme'] = '${theme}';
            delete document.documentElement.dataset['style'];
            localStorage.setItem('br-theme-mode', '${theme}');
          })()
        `
      });
      await new Promise(r => setTimeout(r, 500));

      for (const vp of VIEWPORTS) {
        console.log(`\n--- Viewport: ${vp.width}x${vp.height} (${vp.name}) ---`);
        await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width < 768
        });
        await new Promise(r => setTimeout(r, 500));

        for (const scr of SCREENS) {
          // Client-side navigate
          await sendCommand(ws, 'Runtime.evaluate', {
            expression: `
              (() => {
                window.history.pushState(null, '', '${scr.path}');
                window.dispatchEvent(new PopStateEvent('popstate'));
                document.documentElement.dataset['theme'] = '${theme}';
                delete document.documentElement.dataset['style'];
              })()
            `
          });
          // Allow page components to load and render
          await new Promise(r => setTimeout(r, 1200));

          // Log diagnostic
          const diag = await sendCommand(ws, 'Runtime.evaluate', {
            expression: `
              (() => {
                const heading = document.querySelector('h1, h2, h3, .page-header__title, .dashboard-title');
                return {
                  url: window.location.pathname,
                  title: heading ? heading.textContent.trim() : document.title
                };
              })()
            `
          });
          const info = diag.result && diag.result.value ? diag.result.value : { url: scr.path, title: 'unknown' };

          const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
          const buffer = Buffer.from(shot.data, 'base64');
          const fileName = `${scr.name}_${theme}_${vp.name}.png`;
          const filePath = path.join(OUT_DIR, fileName);
          fs.writeFileSync(filePath, buffer);
          console.log(`Saved: ${fileName} (${buffer.length} bytes) [${info.url} - "${info.title}"]`);
        }
      }
    }

    console.log(`\nAll 54 screenshots captured successfully for stage '${stage}' in ${OUT_DIR}!`);
  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
