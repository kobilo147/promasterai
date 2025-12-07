"use strict";

/* =================== CONFIG & VARIABLES =================== */
const AUTHORIZED_USERS = { "admin": "password", "client1": "money2024", "vip_user": "paid2560" };
const wsUrl = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
let ws = null;
let selectedSymbol = '1HZ10V';
let analysisRunning = false;
let manualDisconnect = false;
let lastDigits = [];
const MAX_STORAGE = 2000; 
let analysisLimit = 50; // DEFAULT TICK ANALYSIS COUNT

// Decimals for display
const DECIMALS_MAP = {
  '1HZ10V': 2, '1HZ15V': 2, '1HZ25V': 2, '1HZ30V': 2,
  '1HZ50V': 2, '1HZ75V': 2, '1HZ90V': 2, '1HZ100V': 2,
  'R_10': 3, 'R_25': 3, 'R_50': 4, 'R_75': 4, 'R_100': 2
};

/* =================== UI ELEMENTS =================== */
const $loginSection = document.getElementById('loginSection');
const $appInterface = document.getElementById('appInterface');
const $usernameInput = document.getElementById('usernameInput');
const $passwordInput = document.getElementById('passwordInput');
const $loginError = document.getElementById('loginError');
const $loginBtn = document.getElementById('loginBtn');
const $logoutBtn = document.getElementById('logoutBtn');
const $livePrice = document.getElementById('livePrice');
const $lastDigit = document.getElementById('lastDigit');
const $toggleBtn = document.getElementById('toggleBtn');
const $ledGreen = document.getElementById('ledGreen');
const $ledRed = document.getElementById('ledRed');
const $volatilitySelect = document.getElementById('volatilitySelect');
const $tickCountInput = document.getElementById('tickCountInput'); 
const $predictedDigit = document.getElementById('predictedDigit');
const $matchesBtn = document.getElementById('matchesBtn');
const $differsBtn = document.getElementById('differsBtn');
const $evenOddBtn = document.getElementById('evenOddBtn');
const $overUnderBtn = document.getElementById('overUnderBtn');
const $confSection = document.getElementById('confidenceSection');
const $confBar = document.getElementById('confBar');
const $confValue = document.getElementById('confValue');
const $confMessage = document.getElementById('confMessage');

/* =================== LOGIN LOGIC =================== */
document.getElementById('waBtn').addEventListener('click', () => {
    const myNumber = "254700000000"; 
    const message = "Hello, I want to get access logins for the Matches Elite AI Tool (2560 USD License).";
    const url = `https://wa.me/${myNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
});

$loginBtn.addEventListener('click', () => {
    const u = $usernameInput.value.trim();
    const p = $passwordInput.value.trim();
    if (AUTHORIZED_USERS.hasOwnProperty(u) && AUTHORIZED_USERS[u] === p) {
        $loginSection.style.opacity = '0';
        setTimeout(() => { $loginSection.style.display = 'none'; $appInterface.style.display = 'block'; }, 500);
    } else {
        $loginError.style.display = 'block';
        $loginBtn.style.background = '#ff4d4f';
        $loginBtn.innerText = "ACCESS DENIED";
        setTimeout(() => { $loginBtn.style.background = "linear-gradient(to right, #00b09b, #96c93d)"; $loginBtn.innerText = "ACCESS TERMINAL"; }, 1500);
    }
});

$logoutBtn.addEventListener('click', () => {
    if(analysisRunning) $toggleBtn.click();
    $usernameInput.value = ""; $passwordInput.value = "";
    $appInterface.style.display = 'none';
    $loginSection.style.display = 'flex';
    setTimeout(() => $loginSection.style.opacity = '1', 50);
});

/* =================== CONTROL LOGIC =================== */
$volatilitySelect.addEventListener('change', function(){
    selectedSymbol = this.value;
    document.getElementById('selectedIndex').innerText = this.options[this.selectedIndex].text;
    if(analysisRunning) {
        manualDisconnect = true; if(ws) ws.close();
        setTimeout(() => { manualDisconnect = false; connect(selectedSymbol); }, 500);
    }
});

$tickCountInput.addEventListener('change', function() {
    let val = parseInt(this.value);
    if(isNaN(val) || val < 10) val = 10;
    if(val > 1000) val = 1000;
    analysisLimit = val;
    this.value = val;
    const term = document.getElementById('terminalOutput');
    term.innerHTML += `<div class="log-line log-warning">> ANALYSIS_WINDOW_UPDATED: ${val}_TICKS</div>`;
});

/* =================== CHARTS & STATS =================== */
let freqCounts = Array(10).fill(0);
let freqChart = null;

function initCharts(){
  const ctxF = document.getElementById('freqChart').getContext('2d');
  freqChart = new Chart(ctxF, {
    type: 'bar',
    data: {
      labels: [0,1,2,3,4,5,6,7,8,9],
      datasets: [{ label: 'Frequency', data: freqCounts, backgroundColor: '#00b09b', borderRadius: 4 }]
    },
    options: { responsive: true, plugins: { legend: {display:false} }, scales: { y: {display: false}, x: {grid: {display:false, drawBorder: false}, ticks: {color: '#888'}} } }
  });
}

function updateDigitStats() {
    if(lastDigits.length === 0) return;
    
    const activeSlice = lastDigits.slice(-analysisLimit);
    const total = activeSlice.length;
    const counts = Array(10).fill(0);
    
    activeSlice.forEach(d => counts[parseInt(d)]++);
    freqCounts = counts; 
    
    if(freqChart) {
        freqChart.data.datasets[0].data = freqCounts;
        freqChart.update('none');
    }
    counts.forEach((count, i) => {
        const pct = ((count / total) * 100).toFixed(1);
        const el = document.getElementById(`pct${i}`);
        if(el) {
            el.innerText = `${pct}%`;
            el.className = 'd-pct'; 
            if(parseFloat(pct) > 13.0) el.classList.add('pct-high');
            else if(parseFloat(pct) < 7.0) el.classList.add('pct-low');
        }
    });
}

/* =================== AI LOGIC =================== */

function getWindowStats() {
    const slice = lastDigits.slice(-analysisLimit);
    const counts = Array(10).fill(0);
    slice.forEach(d => counts[parseInt(d)]++);
    return { counts, total: slice.length };
}

function predictMatch() {
  if (lastDigits.length < 10) return { digit: '?', prob: 0 };
  
  const { counts, total } = getWindowStats();
  let bestDigit = 0, maxCount = -1;
  
  counts.forEach((c, i) => {
      if(c > maxCount) { maxCount = c; bestDigit = i; }
  });

  let rawProb = total > 0 ? Math.round((maxCount / total) * 100) : 0;
  
  if(lastDigits.length > 2) {
      const last = parseInt(lastDigits[lastDigits.length-1]);
      if(last === bestDigit) rawProb += 10;
  }
  
  return { digit: bestDigit, prob: Math.min(99, rawProb) };
}

function predictDiffers() {
    if (lastDigits.length < 10) return { digit: '-', prob: 0 };
    
    const { counts, total } = getWindowStats();
    let minD = 0, minC = 99999;
    
    counts.forEach((c, i) => {
        if(c < minC) { minC = c; minD = i; }
    });
    
    let risk = total > 0 ? (minC / total) * 100 : 0;
    return { digit: minD, prob: Math.round(100 - risk) };
}

/* =================== BUTTON ACTIONS =================== */
$matchesBtn.addEventListener('click', () => {
    if(!analysisRunning || lastDigits.length < 10) return alert("Waiting for data...");
    const res = predictMatch();
    $predictedDigit.innerText = res.digit;
    const orb = document.querySelector('.digit-orb');
    orb.className = 'digit-orb'; void orb.offsetWidth;
    if(res.prob > 20) orb.classList.add('good-pulse');
    else orb.classList.add('bad-pulse');
    showConfidence(res.prob, 'match');
    
    document.querySelectorAll('.digit').forEach(el => el.classList.remove('digit-predicted'));
    const targetDigit = document.getElementById(`digit${res.digit}`);
    if(targetDigit) targetDigit.classList.add('digit-predicted');
});

$differsBtn.addEventListener('click', () => {
    if(!analysisRunning || lastDigits.length < 10) return alert("Waiting for data...");
    const res = predictDiffers();
    $predictedDigit.innerText = res.digit;
    document.querySelector('.digit-orb').classList.add('good-pulse');
    showConfidence(res.prob, 'differs');
});

$evenOddBtn.addEventListener('click', () => runSignalTimer('evenodd'));
$overUnderBtn.addEventListener('click', () => runSignalTimer('overunder'));

function runSignalTimer(type) {
    if(!analysisRunning) return;
    const el = type === 'evenodd' ? document.getElementById('evenoddSignal') : document.getElementById('overunderSignal');
    el.style.display = 'block';
    el.className = 'signal-box signal-bad';
    el.style.color = "#ffa502";
    el.innerText = `SCANNING LAST ${analysisLimit}...`;
    
    setTimeout(() => {
        const sample = lastDigits.slice(-analysisLimit).map(d=>parseInt(d));
        let txt="", good=false;
        if(type === 'evenodd') {
            const e = sample.filter(n=>n%2===0).length;
            const o = sample.length - e;
            const pct = Math.round((Math.max(e,o)/sample.length)*100);
            txt = `${e>o?'EVEN':'ODD'} (${pct}%)`;
            good = pct > 55;
        } else {
            const o = sample.filter(n=>n>4).length;
            const u = sample.filter(n=>n<5).length;
            const pct = Math.round((Math.max(o,u)/sample.length)*100);
            txt = `${o>u?'OVER':'UNDER'} (${pct}%)`;
            good = pct > 55;
        }
        el.innerText = txt;
        el.className = `signal-box ${good?'signal-good':'signal-bad'}`;
    }, 1000);
}

function showConfidence(percent, type) {
    $confSection.style.opacity = "1";
    let w = percent, cls = 'conf-low', msg = "Analysing...";
    if(type === 'match') {
        if(percent < 15) { w = 25; cls='conf-low'; msg="Risk High - Wait"; }
        else if(percent < 25) { w = 60; cls='conf-med'; msg="Moderate Signal"; }
        else { w = 100; cls='conf-high'; msg="💎 STRONG MATCH FOUND!"; }
    } else {
        w = percent;
        if(percent > 90) { cls='conf-high'; msg="Safe Entry"; }
        else if(percent > 80) { cls='conf-med'; msg="Acceptable Risk"; }
        else { cls='conf-low'; msg="Unstable Market"; }
    }
    $confBar.style.width = `${w}%`;
    $confBar.className = `conf-fill ${cls}`;
    $confValue.innerText = `${percent}%`;
    $confMessage.innerText = msg;
}

/* =================== WEBSOCKET & CORE =================== */
function connect(symbol) {
  if(ws) ws.close();
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
  
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if(data.tick) {
        const quote = data.tick.quote;
        $livePrice.innerText = quote;
        
        // Hex Stream
        const randomHex = Array.from({length: 5}, () => Math.floor(Math.random()*255).toString(16).padStart(2, '0').toUpperCase()).join(' ');
        document.getElementById('hexStream').innerText = `RAW: ${randomHex}`;
        
        // Terminal Log
        updateTerminal(quote);

        const digitStr = Number(quote).toFixed(DECIMALS_MAP[symbol] || 2).slice(-1);
        const digit = parseInt(digitStr);

        lastDigits.push(digitStr);
        if(lastDigits.length > MAX_STORAGE) lastDigits.shift();

        // Update UI based on tick count
        $lastDigit.innerText = digit;
        updateDigitStats();

        const ctr = document.getElementById('tickCounter');
        if(ctr) ctr.innerText = Math.min(lastDigits.length, analysisLimit);
        document.getElementById('startTarget').innerText = analysisLimit;
    }
  };
  ws.onclose = () => { if(analysisRunning && !manualDisconnect) setTimeout(()=>connect(symbol), 1000); };
}

// Updated Terminal Function for Larger Size
function updateTerminal(price) {
    const term = document.getElementById('terminalOutput');
    const verbs = ["INJECTING", "PARSING", "DECRYPTING", "FETCHING", "CALCULATING"];
    const nouns = ["PACKET", "HASH", "NODE", "LATENCY", "VECTOR"];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const mem = "0x" + Math.floor(Math.random()*16777215).toString(16).toUpperCase();
    
    const div = document.createElement('div');
    div.className = 'log-line';
    if(Math.random()>0.8) div.classList.add('log-warning');
    div.innerText = `> [${mem}] ${verb}_${noun} >> ${price}`;
    term.appendChild(div);
    // Increased buffer size for the larger terminal
    if(term.children.length > 15) term.removeChild(term.firstChild);
}

/* =================== STARTUP & TOGGLE =================== */
$toggleBtn.addEventListener('click', () => {
    analysisRunning = !analysisRunning;
    if(analysisRunning) {
        $ledGreen.classList.add('active-green');
        $ledRed.classList.remove('active-red');
        
        // Startup Sequence
        document.getElementById('startupOverlay').style.display = 'flex';
        const canvas = document.getElementById('matrixCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        const cols = canvas.width/15; const drops = Array(Math.floor(cols)).fill(1);
        
        const matInt = setInterval(() => {
            ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle = '#0F0'; ctx.font = '15px monospace';
            for(let i=0; i<drops.length; i++) {
                const txt = "01ABCDEF"[Math.floor(Math.random()*8)];
                ctx.fillText(txt, i*15, drops[i]*15);
                if(drops[i]*15 > canvas.height && Math.random()>0.975) drops[i]=0;
                drops[i]++;
            }
        }, 33);

        lastDigits = [];
        connect(selectedSymbol);
        
        let t = 50; 
        const timerEl = document.getElementById('startupTimer');
        const codeStream = document.querySelector('.code-stream');
        timerEl.innerText = t;
        
        const sysMsgs = [
            "ESTABLISHING_SECURE_CONNECTION...",
            "INTERCEPTING_MARKET_PACKETS...",
            "BUFFERING_TICK_DATA...",
            "CALIBRATING_TRANSITION_MATRIX...",
            "ANALYZING_VOLATILITY_TRENDS...",
            "FILTERING_NOISE_PATTERNS...",
            "DETECTING_HOT_NUMBERS...",
            "OPTIMIZING_NEURAL_WEIGHTS...",
            "SYNCING_WITH_DERIV_SERVER...",
            "SYSTEM_READY_FOR_DEPLOYMENT."
        ];

        const seq = setInterval(() => {
            t--; 
            timerEl.innerText = t;
            
            if(t % 5 === 0 && sysMsgs.length > 0) {
                codeStream.innerText = sysMsgs.shift();
            }

            if(t <= 0) {
                clearInterval(seq); clearInterval(matInt);
                document.getElementById('startupOverlay').style.display = 'none';
                $toggleBtn.textContent = "STOP ANALYSIS";
                $toggleBtn.style.background = "linear-gradient(to right, #ff4d4f, #d32f2f)";
            }
        }, 1000);

    } else {
        $ledGreen.classList.remove('active-green');
        $ledRed.classList.add('active-red');
        $toggleBtn.textContent = "START ANALYSIS";
        $toggleBtn.style.background = "linear-gradient(to right, #00b09b, #96c93d)";
        manualDisconnect = true; if(ws) ws.close();
        
        lastDigits = [];
        updateDigitStats(); 
        $livePrice.innerText = "----";
        document.getElementById('terminalOutput').innerHTML = '<div class="log-line">> SYSTEM_HALTED</div>';
    }
});

window.onload = () => { initCharts(); $ledRed.classList.add('active-red'); };