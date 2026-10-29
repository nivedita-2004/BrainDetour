const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4173;
const distDir = path.join('D:\\Desktop\\BrainDetour\\Frontend\\dist');
const scratchDir = 'C:\\Users\\Abhinav Singh\\.gemini\\antigravity\\brain\\1c3d78ff-93f0-49d8-8418-ca4f45e9fa2c\\scratch';
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end(err.message);
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Test static server running at http://127.0.0.1:${PORT}`);
  
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(scratchDir, 'chrome-user-data');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,950',
    '--remote-debugging-port=9222',
    `http://127.0.0.1:${PORT}/presentation?syntheticMic=1`
  ]);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getPageWsUrl() {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/list');
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          return page.webSocketDebuggerUrl;
        }
      } catch (_) {}
      await sleep(300);
    }
    throw new Error('Could not find page in Chrome CDP list');
  }

  try {
    const wsUrl = await getPageWsUrl();
    console.log('Connected directly to Page CDP:', wsUrl);
    const ws = new WebSocket(wsUrl);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = msg => {
      const data = JSON.parse(msg.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data);
        callbacks.delete(data.id);
      }
    };

    await new Promise(r => { ws.onopen = r; });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const currentId = id++;
        callbacks.set(currentId, resolve);
        ws.send(JSON.stringify({ id: currentId, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result?.result?.value;
    }

    async function takeScreenshot(name) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      if (res.result?.data) {
        fs.writeFileSync(path.join(scratchDir, `${name}.png`), Buffer.from(res.result.data, 'base64'));
        console.log(`[Screenshot saved]: ${name}.png`);
      }
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // 1. Navigate to /presentation
    console.log('Navigating to Speech Lab...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/presentation` });
    await sleep(2000);

    // Initial state: Theme (default dark or light)
    const initialTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Current document data-theme:', initialTheme);

    // Switch to Light Mode first to test light appearance
    console.log('Testing Light Mode...');
    await evaluate(`
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('braindetour_theme', 'light');
    `);
    await sleep(400);
    await takeScreenshot('01_light_mode_stage1_setup');

    // Switch to Dark Mode to test dark appearance
    console.log('Testing Dark Mode...');
    await evaluate(`
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('braindetour_theme', 'dark');
    `);
    await sleep(400);
    await takeScreenshot('02_dark_mode_stage1_setup');

    // Switch back to Light Mode for interaction flow
    await evaluate(`
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('braindetour_theme', 'light');
    `);
    await sleep(200);

    // Select category 'Psychology'
    console.log('Selecting category Psychology...');
    await evaluate(`
      const pills = Array.from(document.querySelectorAll('.speech-genre-pill'));
      const psych = pills.find(p => p.textContent.includes('Psychology'));
      if (psych) psych.click();
    `);
    await sleep(300);

    // Select duration 10 min
    console.log('Selecting duration 10 min...');
    await evaluate(`
      const durationPills = Array.from(document.querySelectorAll('.speech-mode-pill'));
      const ten = durationPills.find(p => p.textContent.includes('10'));
      if (ten) ten.click();
    `);
    await sleep(300);
    await takeScreenshot('03_setup_psychology_10min');

    // Click "Random Topic Wheel →"
    console.log('Clicking Random Topic Wheel...');
    await evaluate(`
      const btn = document.getElementById('spin-topic-wheel-btn') || document.querySelector('.speech-wheel-btn');
      if (btn) btn.click();
    `);
    await sleep(600);

    // Capture roulette while spinning
    console.log('Capturing Roulette while spinning...');
    await takeScreenshot('04_roulette_spinning_overlay');

    // Wait for wheel to decelerate and land (at ~2250ms), capture settled topic
    await sleep(1800);
    console.log('Capturing settled topic in roulette focus box...');
    const isLandedState = await evaluate(`document.querySelector('.speech-roulette-item--winner') !== null`);
    console.log('Has settled winner highlight:', isLandedState);
    await takeScreenshot('05_roulette_settled_winner');

    // Wait for >= 1s visible settled display and smooth transition into Speech-Ready interface
    await sleep(1800);
    console.log('Capturing Speech-Ready Interface (Light Mode)...');
    await takeScreenshot('06_speech_ready_light_mode');

    // Test Theme toggle while in Speech-Ready view (verifying no reset!)
    console.log('Toggling theme to Dark Mode in Speech-Ready view...');
    await evaluate(`
      const toggle = document.querySelector('.app-navbar__theme-toggle');
      if (toggle) toggle.click();
    `);
    await sleep(400);
    const themeAfterToggle = await evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Theme after toggle in Speech-Ready view:', themeAfterToggle);
    await takeScreenshot('07_speech_ready_dark_mode');

    // Verify authenticated user greeting or fallback
    const greetingText = await evaluate(`document.querySelector('.speech-ready-greeting-title')?.textContent`);
    const topicTitleText = await evaluate(`document.querySelector('.speech-selected-title')?.textContent`);
    console.log('Speech-Ready greeting:', greetingText);
    console.log('Speech-Ready topic title:', topicTitleText);

    // Verify microphone is present in idle state
    const hasIdleMic = await evaluate(`document.querySelector('.speech-mic-stage.speech-mic--idle') !== null`);
    console.log('Has purpose-built idle microphone:', hasIdleMic);

    // Click "Start Speech" button
    console.log('Clicking Start Speech button...');
    await evaluate(`
      const startBtn = document.getElementById('start-speech-btn') || document.querySelector('.speech-start-speech-btn');
      if (startBtn) startBtn.click();
    `);
    await sleep(1500);

    // Verify live recording coach screen
    console.log('Capturing Live Recording Coach Screen (Dark Mode)...');
    await takeScreenshot('08_live_recording_dark_mode');

    // Switch to Light Mode during live recording to verify recording continues without interruption!
    console.log('Switching to Light Mode during recording...');
    await evaluate(`
      const toggle = document.querySelector('.app-navbar__theme-toggle');
      if (toggle) toggle.click();
    `);
    await sleep(400);
    console.log('Capturing Live Recording Coach Screen (Light Mode)...');
    await takeScreenshot('09_live_recording_light_mode');

    const clockText = await evaluate(`document.querySelector('.speech-coach-clock-digits')?.textContent`);
    console.log('Clock digits during recording:', clockText);

    // Click "Stop & Get Feedback"
    console.log('Clicking Stop & Get Feedback...');
    await evaluate(`
      const stopBtn = document.getElementById('stop-get-feedback-btn') || document.querySelector('.speech-stop-feedback-btn');
      if (stopBtn) stopBtn.click();
    `);
    await sleep(800);

    // Capture Processing stage
    console.log('Capturing Processing Stage...');
    await takeScreenshot('10_processing_stage');

    ws.close();
    chromeProc.kill();
    server.close();
    console.log('UI Verification script completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    chromeProc.kill();
    server.close();
    process.exit(1);
  }
});
