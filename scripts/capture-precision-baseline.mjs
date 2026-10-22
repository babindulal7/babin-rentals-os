import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(os.tmpdir(), `chrome-babin-capture-${Date.now()}`);
const OUT_DIR = path.resolve('docs/audits/precision-cinema-baseline');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function getWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9228/json/list', (res) => {
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
  throw new Error('Could not connect to Chrome DevTools port 9228');
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

async function runCapture() {
  console.log('Launching headless Chrome on port 9228...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9228',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'http://localhost:3000/login'
  ]);

  const wsUrl = await getWsUrl();
  console.log('Connected to WebSocket:', wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'Runtime.enable');
  await sendCommand(ws, 'DOM.enable');

  // Perform Mock Login as Owner
  console.log('Logging in via mock login button...');
  await new Promise(r => setTimeout(r, 2000));
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.querySelector('.auth-mock-btn');
        if (btn) btn.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  const measurements = {};

  const captureJob = async ({ name, url, width, height, theme, delay = 2500 }) => {
    console.log(`\n--- Capturing: ${name} (${width}x${height}, theme: ${theme}) -> ${url} ---`);
    
    // Set viewport
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768
    });

    // Navigate
    await sendCommand(ws, 'Page.navigate', { url });

    // Wait until content rendered
    for (let t = 0; t < 15; t++) {
      await new Promise(r => setTimeout(r, 300));
      const chk = await sendCommand(ws, 'Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(".app-sidebar") || document.querySelector(".movement-panel") || document.querySelector("table") || document.querySelector(".page-layout") || document.body.innerText.length > 200)'
      });
      if (chk.result && chk.result.value) {
        break;
      }
    }
    await new Promise(r => setTimeout(r, delay));

    // Set theme
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        try {
          localStorage.setItem('br-theme-mode', '${theme}');
          document.documentElement.dataset.theme = '${theme === 'glass' ? 'dark' : theme}';
          if ('${theme}' === 'glass') {
            document.documentElement.dataset.style = 'glass';
          } else {
            delete document.documentElement.dataset.style;
          }
        } catch (e) {}
      `
    });
    // Settle for CSS transitions
    await new Promise(r => setTimeout(r, 800));

    // Measure geometry if on desktop
    if (width === 1440) {
      const evalMetrics = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `
          (() => {
            const sidebar = document.querySelector('.app-sidebar') || document.querySelector('aside');
            const header = document.querySelector('.app-header') || document.querySelector('header');
            const kpiGrid = document.querySelector('.situational-grid') || document.querySelector('.kpi-strip');
            const situationalCards = document.querySelectorAll('.situational-card');
            const panelsContainer = document.querySelector('.rental-dashboard__panels');
            const panelHeaders = document.querySelectorAll('.movement-panel__header');
            const rows = document.querySelectorAll('.movement-panel__row');
            const dataTable = document.querySelector('.data-table') || document.querySelector('table');
            const tableRows = document.querySelectorAll('tbody tr');
            const mainContent = document.querySelector('main');
            
            // Count rows visible strictly above ${height}px viewport fold
            let visibleMovementRowsCount = 0;
            rows.forEach(r => {
              const rect = r.getBoundingClientRect();
              if (rect.top >= 0 && rect.bottom <= ${height}) visibleMovementRowsCount++;
            });

            let visibleTableRowsCount = 0;
            tableRows.forEach(r => {
              const rect = r.getBoundingClientRect();
              if (rect.top >= 0 && rect.bottom <= ${height}) visibleTableRowsCount++;
            });

            return JSON.stringify({
              url: location.href,
              sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
              headerHeight: header ? header.getBoundingClientRect().height : null,
              mainPadding: mainContent ? window.getComputedStyle(mainContent).padding : null,
              situationalGridHeight: kpiGrid ? kpiGrid.getBoundingClientRect().height : null,
              situationalCardHeight: situationalCards[0] ? situationalCards[0].getBoundingClientRect().height : null,
              panelsGap: panelsContainer ? window.getComputedStyle(panelsContainer).gap : null,
              movementPanelHeaderHeight: panelHeaders[0] ? panelHeaders[0].getBoundingClientRect().height : null,
              movementRowHeight: rows[0] ? rows[0].getBoundingClientRect().height : null,
              totalMovementRows: rows.length,
              visibleMovementRowsAboveFold: visibleMovementRowsCount,
              totalTableRows: tableRows.length,
              visibleTableRowsAboveFold: visibleTableRowsCount,
              firstTableRowHeight: tableRows[0] ? tableRows[0].getBoundingClientRect().height : null,
              bodySnippet: document.body.innerText.slice(0, 150).replace(/\\n/g, ' ')
            });
          })()
        `
      });

      try {
        measurements[name] = JSON.parse(evalMetrics.result.value);
        console.log(`Measured:`, measurements[name]);
      } catch (e) {
        console.warn('Could not parse metrics for', name);
      }
    }

    // Capture screenshot
    const shotResult = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(shotResult.data, 'base64');
    const outFile = path.join(OUT_DIR, `${name}.png`);
    fs.writeFileSync(outFile, buffer);
    console.log(`Saved: ${outFile} (${buffer.length} bytes)`);
  };

  try {
    // 1. Desktop 1440x900 - Light & Dark
    await captureJob({ name: 'today_desktop_light', url: 'http://localhost:3000/today', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'today_desktop_dark', url: 'http://localhost:3000/today', width: 1440, height: 900, theme: 'dark' });
    
    await captureJob({ name: 'rentals_desktop_light', url: 'http://localhost:3000/rentals', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'rentals_desktop_dark', url: 'http://localhost:3000/rentals', width: 1440, height: 900, theme: 'dark' });

    await captureJob({ name: 'rental_detail_desktop_light', url: 'http://localhost:3000/rentals/8', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'rental_detail_desktop_dark', url: 'http://localhost:3000/rentals/8', width: 1440, height: 900, theme: 'dark' });

    await captureJob({ name: 'inventory_desktop_light', url: 'http://localhost:3000/inventory', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'inventory_desktop_dark', url: 'http://localhost:3000/inventory', width: 1440, height: 900, theme: 'dark' });

    await captureJob({ name: 'calendar_desktop_light', url: 'http://localhost:3000/calendar', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'calendar_desktop_dark', url: 'http://localhost:3000/calendar', width: 1440, height: 900, theme: 'dark' });

    await captureJob({ name: 'finance_desktop_light', url: 'http://localhost:3000/finance', width: 1440, height: 900, theme: 'light' });
    await captureJob({ name: 'finance_desktop_dark', url: 'http://localhost:3000/finance', width: 1440, height: 900, theme: 'dark' });

    // 2. iPad / Tablet (820x1180 portrait & 1180x820 landscape)
    await captureJob({ name: 'today_ipad_portrait_light', url: 'http://localhost:3000/today', width: 820, height: 1180, theme: 'light' });
    await captureJob({ name: 'today_ipad_landscape_light', url: 'http://localhost:3000/today', width: 1180, height: 820, theme: 'light' });
    await captureJob({ name: 'rentals_ipad_portrait_light', url: 'http://localhost:3000/rentals', width: 820, height: 1180, theme: 'light' });

    // 3. Phone (375x812)
    await captureJob({ name: 'today_phone_light', url: 'http://localhost:3000/today', width: 375, height: 812, theme: 'light' });
    await captureJob({ name: 'today_phone_dark', url: 'http://localhost:3000/today', width: 375, height: 812, theme: 'dark' });
    await captureJob({ name: 'rentals_phone_light', url: 'http://localhost:3000/rentals', width: 375, height: 812, theme: 'light' });

    // Save baseline measurements
    const metricsPath = path.join(OUT_DIR, 'baseline_measurements.json');
    fs.writeFileSync(metricsPath, JSON.stringify(measurements, null, 2));
    console.log(`\nAll baseline captures and measurements recorded in ${OUT_DIR}`);
  } finally {
    ws.close();
    chromeProc.kill();
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runCapture().catch(e => {
  console.error('Fatal error during capture:', e);
  process.exit(1);
});
