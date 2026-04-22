// Adapted version of https://github.com/Stremio/stremio-addon-sdk/blob/v1.6.2/src/landingTemplate.js
import { CustomManifest } from './types';
import { envGet } from './utils';

export function landingTemplate(manifest: CustomManifest) {
  // Build config form options
  let formFields = '';
  let script = '';

  if ((manifest.config || []).length) {
    manifest.config.forEach((elem) => {
      const key = elem.key;
      if (key === 'febboxCookie') {
        // Showbox cookie field only
        const isRequired = elem.required ? ' required' : '';
        formFields += `
        <div class="field-group">
          <label class="field-label" for="${key}">
            <span class="field-icon">🍪</span> ${elem.title}
          </label>
          <div class="input-row">
            <input type="password" id="${key}" name="${key}" class="field-input" placeholder="Paste your Febbox cookie here…"${isRequired}/>
            <button type="button" id="testFebboxBtn" class="validate-btn">Validate</button>
          </div>
          <div id="febboxResult" class="field-hint"></div>
        </div>`;
      } else if (['text', 'number', 'password'].includes(elem.type)) {
        const isRequired = elem.required ? ' required' : '';
        const defaultHTML = elem.default ? ` value="${elem.default}"` : '';
        formFields += `
        <div class="field-group">
          <label class="field-label" for="${key}">${elem.title}</label>
          <input type="${elem.type}" id="${key}" name="${key}" class="field-input"${defaultHTML}${isRequired}/>
        </div>`;
      } else if (elem.type === 'checkbox') {
        const isChecked = elem.default === 'checked' ? ' checked' : '';
        formFields += `
        <div class="field-group checkbox-group">
          <label class="checkbox-label" for="${key}">
            <input type="checkbox" id="${key}" name="${key}"${isChecked}/>
            <span>${elem.title}</span>
          </label>
        </div>`;
      } else if (elem.type === 'select') {
        const defaultValue = elem.default || (elem.options || [])[0];
        let opts = '';
        (elem.options || []).forEach((el) => {
          const isSel = el === defaultValue ? ' selected' : '';
          opts += `<option value="${el}"${isSel}>${el}</option>`;
        });
        formFields += `
        <div class="field-group">
          <label class="field-label" for="${key}">${elem.title}</label>
          <select id="${key}" name="${key}" class="field-input">${opts}</select>
        </div>`;
      }
    });

    if (formFields.length) {
      script += `
        installLink.onclick = () => mainForm.reportValidity();
        const updateLink = () => {
          const config = Object.fromEntries(new FormData(mainForm));
          if (config.mediaFlowProxyUrl) config.mediaFlowProxyUrl = config.mediaFlowProxyUrl.replace(/^https?:\\/\\//, '');
          installLink.href = 'stremio://' + window.location.host + '/' + encodeURIComponent(JSON.stringify(config)) + '/manifest.json';
        };
        mainForm.onchange = updateLink;

        const testFebboxBtn = document.getElementById('testFebboxBtn');
        if (testFebboxBtn) {
          testFebboxBtn.onclick = async (e) => {
            e.preventDefault();
            const cookie = document.getElementById('febboxCookie').value;
            const resultDiv = document.getElementById('febboxResult');
            if (!cookie) {
              resultDiv.className = 'field-hint error';
              resultDiv.innerText = '⚠️ Please enter a cookie first';
              return;
            }
            testFebboxBtn.innerText = 'Checking…';
            try {
              const res = await fetch('/test-febbox-cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie })
              });
              const data = await res.json();
              if (data.success) {
                resultDiv.className = 'field-hint success';
                resultDiv.innerText = '✅ ' + data.message;
              } else {
                resultDiv.className = 'field-hint error';
                resultDiv.innerText = '❌ ' + (data.message || 'Validation failed');
              }
            } catch {
              resultDiv.className = 'field-hint error';
              resultDiv.innerText = '❌ Network error';
            } finally {
              testFebboxBtn.innerText = 'Validate';
            }
          };
        }
      `;
    }
  }

  const formHTML = formFields.length ? `
    <form id="mainForm" autocomplete="off">
      ${formFields}
    </form>` : '';

  const configEnvDesc = envGet('CONFIGURATION_DESCRIPTION') || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>WatchNow – Stremio Add-on</title>
  <meta name="description" content="WatchNow Stremio Add-on – stream Movies &amp; Series in 4K, 1080p and more. Powered by DevStreams."/>
  <link rel="icon" href="/2.png" type="image/png"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --blue: #2563EB;
      --blue-light: #3B82F6;
      --blue-glow: rgba(37,99,235,0.35);
      --bg: #060b18;
      --card: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text: #f0f4ff;
      --muted: rgba(240,244,255,0.55);
      --radius: 16px;
    }

    html, body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.6;
    }

    /* animated gradient background */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% -10%, rgba(37,99,235,0.22) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 90% 100%, rgba(59,130,246,0.15) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    .page {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 20px 80px;
      gap: 0;
    }

    /* ── hero ── */
    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      margin-bottom: 48px;
      text-align: center;
    }

    .hero-logo {
      width: 96px;
      height: 96px;
      border-radius: 24px;
      box-shadow: 0 0 0 2px var(--blue), 0 8px 40px var(--blue-glow);
      object-fit: cover;
      animation: pulse-glow 3s ease-in-out infinite;
    }

    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 0 2px var(--blue), 0 8px 40px var(--blue-glow); }
      50%       { box-shadow: 0 0 0 3px var(--blue-light), 0 8px 56px rgba(59,130,246,0.5); }
    }

    .hero-title {
      font-size: 2.6rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 30%, var(--blue-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-sub {
      font-size: 1rem;
      color: var(--muted);
      max-width: 420px;
    }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      border-radius: 99px;
      font-size: 0.78rem;
      font-weight: 600;
      background: rgba(37,99,235,0.15);
      border: 1px solid rgba(37,99,235,0.35);
      color: var(--blue-light);
    }

    /* ── card ── */
    .card {
      width: 100%;
      max-width: 520px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px 28px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--blue-light);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 7px;
    }

    /* ── features ── */
    .features {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .feature-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .feature-text strong {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text);
    }

    .feature-text span {
      font-size: 0.8rem;
      color: var(--muted);
    }

    /* ── stream format preview ── */
    .stream-preview {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 0.82rem;
      line-height: 1.75;
      font-family: 'Inter', monospace;
      color: #c7d7ff;
    }

    .stream-preview .sp-name {
      font-weight: 700;
      color: var(--blue-light);
    }

    /* ── form ── */
    .field-group {
      margin-bottom: 18px;
    }

    .field-group:last-child { margin-bottom: 0; }

    .field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .field-icon { font-size: 1rem; }

    .input-row {
      display: flex;
      gap: 10px;
    }

    .field-input {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      color: var(--text);
      font-size: 0.88rem;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
    }

    .field-input:focus {
      border-color: var(--blue);
    }

    .validate-btn {
      flex-shrink: 0;
      background: rgba(37,99,235,0.2);
      border: 1px solid var(--blue);
      border-radius: 10px;
      padding: 10px 16px;
      color: var(--blue-light);
      font-size: 0.82rem;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }

    .validate-btn:hover { background: rgba(37,99,235,0.35); }

    .field-hint {
      font-size: 0.78rem;
      color: var(--muted);
      margin-top: 6px;
      min-height: 18px;
    }

    .field-hint.success { color: #34d399; }
    .field-hint.error   { color: #f87171; }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      cursor: pointer;
    }

    /* ── install button ── */
    .install-btn-wrap {
      width: 100%;
      max-width: 520px;
      margin-bottom: 20px;
    }

    .install-link { text-decoration: none; display: block; }

    .install-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px;
      background: var(--blue);
      border: none;
      border-radius: var(--radius);
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 4px 24px var(--blue-glow);
      transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    }

    .install-btn:hover {
      background: var(--blue-light);
      box-shadow: 0 6px 32px rgba(59,130,246,0.5);
    }

    .install-btn:active { transform: scale(0.98); }

    /* ── powered by ── */
    .powered-by {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 0.78rem;
    }

    .powered-by a {
      color: var(--blue-light);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    .powered-by a:hover { color: #fff; }

    .divider {
      width: 100%;
      max-width: 520px;
      height: 1px;
      background: var(--border);
      margin: 4px 0 20px;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HERO -->
  <div class="hero">
    <img src="/2.png" alt="WatchNow Logo" class="hero-logo"/>
    <h1 class="hero-title">WatchNow</h1>
    <p class="hero-sub">A premium Stremio add-on delivering Movies &amp; Series streams with rich quality metadata.</p>
    <div class="badge-row">
      <span class="badge">🔥 4K UHD</span>
      <span class="badge">💎 1080p FHD</span>
      <span class="badge">🎞️ 720p HD</span>
      <span class="badge">🎬 Movies &amp; Series</span>
      <span class="badge">🌍 Multi-language</span>
    </div>
  </div>

  <!-- FEATURES -->
  <div class="card">
    <div class="card-title">✦ About This Add-on</div>
    <div class="features">
      <div class="feature-item">
        <span class="feature-icon">🎥</span>
        <div class="feature-text">
          <strong>Multi-source Streaming</strong>
          <span>Pulls streams from 4KHDHub, HDHub4u, and Showbox (Febbox) simultaneously.</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">📊</span>
        <div class="feature-text">
          <strong>Rich Stream Metadata</strong>
          <span>Every stream shows quality, codec, audio format, file size, bitrate, and language flags.</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">🍪</span>
        <div class="feature-text">
          <strong>Showbox Support</strong>
          <span>Add your Febbox cookie below to unlock Showbox streams (optional).</span>
        </div>
      </div>
      <div class="feature-item">
        <span class="feature-icon">⚡</span>
        <div class="feature-text">
          <strong>Smart Caching</strong>
          <span>Results are cached for 12 hours so repeated lookups are instant.</span>
        </div>
      </div>
    </div>
  </div>

  <!-- STREAM PREVIEW -->
  <div class="card">
    <div class="card-title">🖥️ Stream Card Preview</div>
    <div class="stream-preview">
      <span class="sp-name">WatchNow</span><br/>
      <span class="sp-name">🔥 4K UHD</span><br/>
      ──────────────────<br/>
      🎥 BluRay 📺 DV 🎞️ HEVC<br/>
      🎧 Atmos | TrueHD 🔊 7.1 🗣️ 🇬🇧 / 🇮🇳<br/>
      📦 62.5 GB / 📊 54.8 Mbps<br/>
      🏷️ GROUP 📡 RARBG<br/>
      🔍 HubCloud from 4KHDHub
    </div>
  </div>

  ${formHTML ? `
  <!-- CONFIG FORM -->
  <div class="card">
    <div class="card-title">⚙️ Configuration</div>
    ${configEnvDesc ? `<p style="font-size:0.82rem;color:var(--muted);margin-bottom:16px">${configEnvDesc}</p>` : ''}
    ${formHTML}
  </div>` : ''}

  <div class="divider"></div>

  <!-- INSTALL BUTTON -->
  <div class="install-btn-wrap">
    <a id="installLink" class="install-link" href="#">
      <button class="install-btn" name="Install">
        <img src="/1.png" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:cover;"/>
        Add to Stremio
      </button>
    </a>
  </div>

  <!-- POWERED BY -->
  <div class="powered-by">
    <span>Powered by <a href="https://dev-streamz-navy.vercel.app/configure" target="_blank" rel="noopener">DevStreams</a></span>
    <span>v${manifest.version || '0.0.0'} &nbsp;·&nbsp; <a href="https://github.com/devv5566/SwordWatch" target="_blank" rel="noopener">GitHub</a></span>
  </div>

</div>

<script>
  ${formFields.length ? script : ''}

  if (typeof updateLink === 'function') {
    updateLink();
  } else {
    installLink.href = 'stremio://' + window.location.host + '/manifest.json';
  }
</script>
</body>
</html>`;
}
