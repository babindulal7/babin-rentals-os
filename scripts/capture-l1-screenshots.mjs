import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(os.tmpdir(), `chrome-babin-l1-${Date.now()}`);
const OUT_DIR = 'C:\\Users\\use\\.gemini\\antigravity\\brain\\5789568a-5286-46b0-be44-96f188d12a69\\screenshots\\l1';
const DOCS_DIR = path.resolve('docs/audits/l1');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

async function getWsUrl(port = 9229) {
  for (let i = 0; i < 25; i++) {
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

async function run() {
  console.log('Launching headless Chrome on port 9229...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9229',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'http://localhost:3000/login'
  ]);

  try {
    const wsUrl = await getWsUrl(9229);
    console.log('Connected to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    // Wait for login & click mock login
    console.log('Waiting for login...');
    for (let i = 0; i < 30; i++) {
      const chk = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".auth-mock-btn"))'
      });
      if (chk.result && chk.result.value) break;
      await new Promise(r => setTimeout(r, 400));
    }

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.auth-mock-btn');
          if (btn) btn.click();
        })()
      `
    });

    // Wait until logged in
    for (let i = 0; i < 30; i++) {
      const chk = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".app-sidebar") || !location.pathname.includes("login"))'
      });
      if (chk.result && chk.result.value) break;
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 1500));

    // Navigate to rentals
    console.log('Navigating to /rentals...');
    await sendCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/rentals' });
    await new Promise(r => setTimeout(r, 3000));

    // Find the first booking link
    const bookingLinkRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        (() => {
          const links = Array.from(document.querySelectorAll('a[href*="/rentals/"]'));
          const target = links.find(a => !a.getAttribute('href').includes('/rentals/new'));
          return target ? target.getAttribute('href') : null;
        })()
      `
    });

    let bookingUrl = bookingLinkRes.result && bookingLinkRes.result.value 
      ? `http://localhost:3000${bookingLinkRes.result.value}` 
      : 'http://localhost:3000/rentals/BK-2026-0001';

    console.log('Target booking URL:', bookingUrl);

    const captureShot = async (name, width, height, setupFn = null) => {
      console.log(`\n--- Capturing ${name} (${width}x${height}) ---`);
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768
      });

      if (setupFn) {
        await sendCommand(ws, 'Runtime.evaluate', { expression: setupFn });
        await new Promise(r => setTimeout(r, 1000));
      }

      const shotResult = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(shotResult.data, 'base64');
      const p1 = path.join(OUT_DIR, `${name}.png`);
      const p2 = path.join(DOCS_DIR, `${name}.png`);
      fs.writeFileSync(p1, buffer);
      fs.writeFileSync(p2, buffer);
      console.log(`Saved: ${p1} (${buffer.length} bytes)`);
    };

    // 1. Desktop 1440x900
    await sendCommand(ws, 'Page.navigate', { url: bookingUrl });
    await new Promise(r => setTimeout(r, 3000));
    await captureShot('01_booking_detail_desktop_1440', 1440, 900);

    // 2. Desktop 1280x800
    await captureShot('02_booking_detail_desktop_1280', 1280, 800);

    // 3. Tablet 1194x834
    // Check if drawer toggle needs to be clicked or if drawer is open
    await captureShot('03_booking_detail_tablet_1194', 1194, 834, `
      (() => {
        // If drawer is closed, open it
        const drawerToggle = document.querySelector('button[aria-label*="drawer" i], button[title*="drawer" i], .drawer-toggle-btn');
        if (drawerToggle && !document.querySelector('.app-drawer--open')) {
          drawerToggle.click();
        }
      })()
    `);

    // 4. Mobile 390x844 with Money segment
    await captureShot('04_booking_detail_phone_390_money', 390, 844, `
      (() => {
        // Click Money segment
        const buttons = Array.from(document.querySelectorAll('button, [role="tab"]'));
        const moneyBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Money');
        if (moneyBtn) moneyBtn.click();
      })()
    `);

    // 5. Modal open with prefilled amount (desktop 1440x900)
    await captureShot('05_record_payment_modal_open', 1440, 900, `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recordBtn = btns.find(b => b.textContent && b.textContent.trim().includes('Record Payment'));
        if (recordBtn) recordBtn.click();
      })()
    `);

    console.log('\nAll L1 screenshots captured successfully!');
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
