import http from 'http';
import { spawn } from 'child_process';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9226',
  '--user-data-dir=C:\\Users\\use\\Desktop\\babin-rentals-os\\tmp\\cp_debug2',
  '--no-first-run',
  '--hide-scrollbars',
  'about:blank'
]);

setTimeout(async () => {
  try {
    const res = await new Promise((resolve) => {
      http.get('http://127.0.0.1:9226/json/list', r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(JSON.parse(d)));
      });
    });
    const page = res.find(p => p.type === 'page') || res[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Console.messageAdded') {
        console.log('Console:', msg.params.message.text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log('Exception:', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('consoleAPICalled:', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
      }
      if (msg.id === 10) {
        console.log('Eval Result:', msg.result.result.value);
        chrome.kill();
        process.exit(0);
      }
    });

    ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));

    console.log('Navigating to http://127.0.0.1:3000/today...');
    ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'http://127.0.0.1:3000/today' } }));

    setTimeout(() => {
      ws.send(JSON.stringify({ id: 10, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({ href: location.href, html: document.getElementById("root")?.innerHTML?.slice(0, 300) })' } }));
    }, 4000);

  } catch (err) {
    console.error(err);
    chrome.kill();
    process.exit(1);
  }
}, 2000);
