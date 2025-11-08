/**
 * High-Performance Cloudflare Worker for Proxying DNS-over-HTTPS (DoH) Requests
 * Enhanced with Multi-Provider Support, Load Balancing, Caching, and Health Checks
 */

// تابع برای بارگذاری تنظیمات از environment variables
function getConfig(env) {
  // دریافت CACHE_TTL از env یا استفاده از مقدار پیش‌فرض
  const CACHE_TTL = env.CACHE_TTL ? parseInt(env.CACHE_TTL) : 300;
  
  // دریافت PROVIDERS از env یا استفاده از مقدار پیش‌فرض
  let DOH_PROVIDERS;
  if (env.PROVIDERS && Array.isArray(env.PROVIDERS)) {
    // Parse JSON strings from TOML array
    DOH_PROVIDERS = env.PROVIDERS.map(providerStr => {
      try {
        return JSON.parse(providerStr);
      } catch (e) {
        console.error('Error parsing provider:', providerStr, e);
        return null;
      }
    }).filter(p => p !== null);
  } else {
    // Fallback to default providers
    DOH_PROVIDERS = [
      {
        name: "Cloudflare",
        url: "https://cloudflare-dns.com/dns-query",
        weight: 20
      },
      {
        name: "Google",
        url: "https://dns.google/dns-query",
        weight: 15
      },
      {
        name: "Quad9",
        url: "https://dns.quad9.net/dns-query",
        weight: 15
      },
      {
        name: "OpenDNS",
        url: "https://doh.opendns.com/dns-query",
        weight: 10
      },
      {
        name: "AdGuard",
        url: "https://dns.adguard.com/dns-query",
        weight: 10
      },
      {
        name: "ControlD",
        url: "https://freedns.controld.com/p2",
        weight: 10
      },
      {
        name: "Mullvad",
        url: "https://adblock.dns.mullvad.net/dns-query",
        weight: 10
      },
      {
        name: "NextDNS",
        url: "https://dns.nextdns.io/dns-query",
        weight: 10
      }
    ];
  }
  
  return { CACHE_TTL, DOH_PROVIDERS };
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

async function handleRequest(request, env, ctx) {
  const { CACHE_TTL, DOH_PROVIDERS } = getConfig(env);
  const url = new URL(request.url);
  
  // Serve landing page for root path
  if (url.pathname === '/') {
    return serveLandingPage(request, DOH_PROVIDERS);
  }
  
  // Serve DNS encoding explanation
  if (url.pathname === '/dns-encoding') {
    return serveDNSEncodingExplanation();
  }
  
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  // Validate DNS request
  if (url.pathname !== '/dns-query') {
    return new Response('Invalid endpoint. Use /dns-query', { status: 400 });
  }

  // Check if it's a DNS query (either via query parameter or POST body)
  const isGet = request.method === 'GET';
  const isPost = request.method === 'POST';
  
  if (!isGet && !isPost) {
    return new Response('Method not allowed. Use GET or POST.', { status: 405 });
  }

  // Check for DNS query parameter in GET requests
  if (isGet && !url.searchParams.has('dns')) {
    return new Response('Missing DNS query parameter', { status: 400 });
  }

  // Select the best DoH provider based on weighted random selection
  const selectedProvider = selectProvider(DOH_PROVIDERS);
  
  // Clone request to preserve body for fallback if needed
  const requestBody = isPost ? await request.arrayBuffer() : null;
  
  try {
    // Create target URL with query parameters
    const targetUrl = selectedProvider.url + url.search;

    // Prepare headers for the upstream request
    const headers = new Headers(request.headers);
    
    // Ensure proper Content-Type for DNS queries
    if (isPost) {
      headers.set('Content-Type', 'application/dns-message');
    } else {
      headers.set('Accept', 'application/dns-message');
    }
    
    // Add User-Agent for better compatibility
    headers.set('User-Agent', 'DoH-Proxy-Worker/1.0');

    // Create the upstream request
    const upstreamRequest = new Request(targetUrl, {
        method: request.method,
      headers: headers,
      body: requestBody,
      redirect: 'follow'
    });

    // Send request to DoH provider
      const response = await fetch(upstreamRequest);
      
    // Create response with proper headers
      const responseHeaders = new Headers(response.headers);
    
    // Add CORS headers
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    
    // Set cache control for DNS responses
    responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    responseHeaders.set('Expires', new Date(Date.now() + CACHE_TTL * 1000).toUTCString());
    responseHeaders.set('X-Provider', selectedProvider.name);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
      headers: responseHeaders
      });
    } catch (error) {
    // Try fallback providers if the primary one fails
    return await tryFallbackProviders(request, url, selectedProvider, DOH_PROVIDERS, CACHE_TTL, requestBody, isPost);
  }
}

// Serve a beautiful landing page for the root path
function serveLandingPage(request, PROVIDERS) {
  const workerUrl = new URL(request.url);
  workerUrl.pathname = '/dns-query';
  const dnsEndpoint = workerUrl.toString();
  
  const html = `
  <!DOCTYPE html>
  <html lang="en" dir="ltr" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>High-Performance DoH Proxy</title>
    <script>
      // Prevent flash of unstyled content - set theme immediately
      (function() {
        // Always use dark theme
        var theme = 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
      })();
    </script>
    <style>
      :root {
        --primary: #00ff41;
        --primary-dark: #00cc33;
        --secondary: #00ff41;
        --kali-green: #00ff41;
        --kali-dark: #0a0e27;
        --kali-bg: #0a0e27;
        --kali-card: #1a1f3a;
        --kali-border: #00ff41;
        --kali-text: #00ff41;
        --kali-text-dim: #00cc33;
        --kali-shadow: rgba(0, 255, 65, 0.3);
      }
      
      [data-theme="dark"] {
        --bg-primary: #0a0e27;
        --bg-secondary: #1a1f3a;
        --bg-card: #1a1f3a;
        --bg-card-hover: #252b4a;
        --text-primary: #00ff41;
        --text-secondary: #00cc33;
        --text-muted: #00aa22;
        --border-color: #00ff41;
        --shadow: rgba(0, 255, 65, 0.2);
        --gradient-start: #0a0e27;
        --gradient-end: #0a0e27;
      }
      
      [data-theme="light"] {
        --bg-primary: #0a0e27;
        --bg-secondary: #1a1f3a;
        --bg-card: #1a1f3a;
        --bg-card-hover: #252b4a;
        --text-primary: #00ff41;
        --text-secondary: #00cc33;
        --text-muted: #00aa22;
        --border-color: #00ff41;
        --shadow: rgba(0, 255, 65, 0.2);
        --gradient-start: #0a0e27;
        --gradient-end: #0a0e27;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Courier New', 'Consolas', 'Monaco', 'Lucida Console', monospace;
        line-height: 1.6;
        color: var(--kali-text);
        background: var(--kali-bg);
        min-height: 100vh;
        padding: 20px;
        transition: background 0.3s ease, color 0.3s ease;
        position: relative;
        overflow-x: hidden;
      }
      
      body::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: 
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 255, 65, 0.03) 2px,
            rgba(0, 255, 65, 0.03) 4px
          );
        pointer-events: none;
        z-index: 0;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        position: relative;
        z-index: 1;
      }
      
      .top-controls {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1001;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .social-links {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .social-link {
        width: 50px;
        height: 50px;
        border-radius: 0;
        border: 2px solid var(--kali-border);
        background: var(--kali-card);
        color: var(--kali-text);
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        font-size: 1.3rem;
        transition: all 0.3s ease;
        box-shadow: 0 0 10px var(--kali-shadow);
        position: relative;
        z-index: 1002;
      }
      
      .social-link:hover {
        transform: translateY(-3px) scale(1.1);
        border-color: var(--kali-text);
        background: var(--kali-text);
        color: var(--kali-bg);
        box-shadow: 0 0 20px var(--kali-text);
      }
      
      .social-link.github:hover {
        background: var(--kali-text);
        border-color: var(--kali-text);
      }
      
      .social-link.telegram:hover {
        background: var(--kali-text);
        border-color: var(--kali-text);
      }
      
      header {
        text-align: center;
        padding: 40px 20px;
        margin-bottom: 30px;
      }
      
      .kali-banner {
        font-family: 'Courier New', monospace;
        color: var(--kali-text);
        text-align: center;
        margin: 20px auto;
        font-size: 0.7rem;
        line-height: 1.2;
        text-shadow: 0 0 10px var(--kali-text);
        white-space: pre;
        overflow-x: auto;
        max-width: 100%;
      }
      
      @media (max-width: 768px) {
        .kali-banner {
          font-size: 0.5rem;
        }
      }
      
      h1 {
        font-size: 2.8rem;
        margin-bottom: 15px;
        color: var(--kali-text);
        text-shadow: 0 0 10px var(--kali-text), 0 0 20px var(--kali-text);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        letter-spacing: 3px;
      }
      
      .subtitle {
        font-size: 1.3rem;
        color: var(--kali-text-dim);
        max-width: 700px;
        margin: 0 auto 25px;
        font-family: 'Courier New', monospace;
        text-shadow: 0 0 5px var(--kali-text-dim);
        min-height: 2em;
      }
      
      .developer-credit {
        font-size: 1rem;
        color: var(--kali-text-dim);
        max-width: 700px;
        margin: 15px auto 25px;
        font-family: 'Courier New', monospace;
        text-shadow: 0 0 8px var(--kali-text-dim);
        text-align: center;
        opacity: 0.8;
      }
      
      .typing-effect {
        display: inline-block;
        font-family: 'Courier New', monospace;
        color: var(--kali-text);
        text-shadow: 0 0 10px var(--kali-text);
      }
      
      .typing-cursor {
        display: inline-block;
        width: 2px;
        height: 1.2em;
        background: var(--kali-text);
        margin-left: 3px;
        animation: blink 1s infinite;
        vertical-align: middle;
        box-shadow: 0 0 10px var(--kali-text);
      }
      
      @keyframes blink {
        0%, 50% {
          opacity: 1;
        }
        51%, 100% {
          opacity: 0;
        }
      }
      
      .endpoint-card {
        background: var(--kali-card);
        color: var(--kali-text);
        border-radius: 0;
        padding: 30px;
        margin-bottom: 40px;
        text-align: center;
        box-shadow: 0 0 20px var(--kali-shadow);
        border: 2px solid var(--kali-border);
        position: relative;
      }
      
      .endpoint-card::before {
        content: '>>>';
        position: absolute;
        top: 10px;
        left: 10px;
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
        font-size: 1.2rem;
      }
      
      .endpoint-card h2 {
        font-size: 2rem;
        margin-bottom: 15px;
        color: var(--kali-text);
        text-shadow: 0 0 10px var(--kali-text);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
      }
      
      .endpoint-card p {
        font-size: 1.2rem;
        margin-bottom: 25px;
        color: var(--kali-text-dim);
        font-family: 'Courier New', monospace;
      }
      
      .endpoint-url {
        background: var(--kali-bg);
        border-radius: 0;
        padding: 20px;
        font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
        font-size: 1.1rem;
        margin: 25px 0;
        word-break: break-all;
        position: relative;
        text-align: left;
        border: 2px solid var(--kali-border);
        color: var(--kali-text);
        box-shadow: inset 0 0 10px var(--kali-shadow);
      }
      
      .copy-btn {
        background: var(--kali-bg);
        color: var(--kali-text);
        border: 2px solid var(--kali-border);
        padding: 12px 25px;
        border-radius: 0;
        font-weight: normal;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 10px;
        box-shadow: 0 0 10px var(--kali-shadow);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
      }
      
      .copy-btn:hover {
        background: var(--kali-text);
        color: var(--kali-bg);
        transform: translateY(-2px);
        box-shadow: 0 0 20px var(--kali-text);
      }
      
      .copy-btn:active {
        transform: translateY(0);
      }
      
      .card {
        background: var(--kali-card);
        border-radius: 0;
        box-shadow: 0 0 15px var(--kali-shadow);
        padding: 30px;
        margin-bottom: 30px;
        transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
        border: 2px solid var(--kali-border);
        position: relative;
      }
      
      .card::before {
        content: '$';
        position: absolute;
        top: 10px;
        left: 10px;
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
        font-size: 1.2rem;
      }
      
      .card:hover {
        transform: translateY(-5px);
        box-shadow: 0 0 25px var(--kali-text);
        border-color: var(--kali-text);
      }
      
      h2 {
        font-size: 1.8rem;
        margin-bottom: 20px;
        color: var(--kali-text);
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        text-shadow: 0 0 10px var(--kali-text);
      }
      
      h2 i {
        color: var(--kali-text);
      }
      
      h3 {
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        text-shadow: 0 0 5px var(--kali-text);
      }
      
      p {
        color: var(--kali-text-dim);
        font-family: 'Courier New', monospace;
      }
      
      .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 25px;
        margin-bottom: 40px;
      }
      
      .feature {
        display: flex;
        gap: 15px;
      }
      
      .feature-icon {
        background: linear-gradient(135deg, var(--primary), var(--primary-dark));
        color: white;
        width: 50px;
        height: 50px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.4rem;
      }
      
      .feature-content h3 {
        margin-bottom: 8px;
        font-size: 1.3rem;
      }
      
      .providers {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      
      .provider {
        background: var(--kali-bg);
        border-radius: 0;
        padding: 20px;
        border: 2px solid var(--kali-border);
        transition: all 0.3s ease;
        position: relative;
      }
      
      .provider::before {
        content: '●';
        position: absolute;
        top: 10px;
        left: 10px;
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
      }
      
      .provider:hover {
        border-color: var(--kali-text);
        transform: translateY(-2px);
        box-shadow: 0 0 15px var(--kali-text);
      }
      
      .provider-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      
      .provider-name {
        font-weight: normal;
        font-size: 1.1rem;
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
      }
      
      .provider-weight {
        background: var(--kali-text);
        color: var(--kali-bg);
        padding: 4px 10px;
        border-radius: 0;
        font-size: 0.9rem;
        font-family: 'Courier New', monospace;
        border: 1px solid var(--kali-text);
      }
      
      .provider-url {
        color: var(--kali-text-dim);
        font-size: 0.9rem;
        word-break: break-all;
        font-family: 'Courier New', monospace;
      }
      
      .provider-description {
        color: var(--kali-text-dim);
        font-size: 0.8rem;
        margin-top: 8px;
        font-style: normal;
        font-family: 'Courier New', monospace;
      }
      
      .usage-examples {
        background: var(--kali-card);
        color: var(--kali-text);
        border-radius: 0;
        padding: 30px;
        border: 2px solid var(--kali-border);
        box-shadow: 0 0 15px var(--kali-shadow);
      }
      
      .usage-examples h2 {
        color: var(--kali-text);
        text-shadow: 0 0 10px var(--kali-text);
      }
      
      .usage-examples h3 {
        color: var(--kali-text);
        margin-top: 20px;
        text-shadow: 0 0 5px var(--kali-text);
      }
      
      .usage-examples p {
        color: var(--kali-text-dim);
      }
      
      .usage-examples a {
        color: var(--kali-text);
        text-decoration: underline;
        text-shadow: 0 0 5px var(--kali-text);
      }
      
      .usage-examples a:hover {
        color: var(--kali-text);
        text-shadow: 0 0 10px var(--kali-text);
      }
      
      .usage-examples strong {
        color: var(--kali-text);
        text-shadow: 0 0 5px var(--kali-text);
      }
      
      .usage-examples ul li {
        color: var(--kali-text-dim);
      }
      
      .code-block {
        background: var(--kali-bg);
        color: var(--kali-text);
        border-radius: 0;
        padding: 20px;
        margin: 15px 0;
        font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
        font-size: 0.95rem;
        overflow-x: auto;
        border: 2px solid var(--kali-border);
        box-shadow: inset 0 0 10px var(--kali-shadow);
        position: relative;
      }
      
      .code-block::before {
        content: '┌─';
        position: absolute;
        top: -2px;
        left: -2px;
        color: var(--kali-text);
        font-family: 'Courier New', monospace;
      }
      
      .endpoint {
        display: inline-block;
        background: rgba(255, 255, 255, 0.1);
        padding: 3px 8px;
        border-radius: 5px;
        font-family: 'Consolas', 'Monaco', monospace;
      }
      
      .btn {
        display: inline-block;
        background: var(--kali-bg);
        color: var(--kali-text);
        padding: 10px 20px;
        border-radius: 0;
        text-decoration: none;
        font-weight: normal;
        margin-top: 15px;
        transition: all 0.3s ease;
        border: 2px solid var(--kali-border);
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        box-shadow: 0 0 10px var(--kali-shadow);
      }
      
      .btn:hover {
        background: var(--kali-text);
        color: var(--kali-bg);
        box-shadow: 0 0 20px var(--kali-text);
      }
      
      .copy-notification {
        position: fixed;
        top: 80px;
        right: 20px;
        background: var(--kali-card);
        color: var(--kali-text);
        padding: 15px 25px;
        border-radius: 0;
        box-shadow: 0 0 20px var(--kali-text);
        border: 2px solid var(--kali-border);
        transform: translateX(200%);
        transition: transform 0.3s ease;
        z-index: 1000;
        font-family: 'Courier New', monospace;
        text-transform: uppercase;
        text-shadow: 0 0 10px var(--kali-text);
      }
      
      .copy-notification.show {
        transform: translateX(0);
      }
      
      footer {
        text-align: center;
        padding: 30px 0;
        color: var(--kali-text-dim);
        font-size: 0.9rem;
        font-family: 'Courier New', monospace;
        text-shadow: 0 0 5px var(--kali-text-dim);
      }
      
      @media (max-width: 768px) {
        h1 {
          font-size: 2.2rem;
        }
        
        .subtitle {
          font-size: 1.1rem;
        }
        
        .developer-credit {
          font-size: 0.9rem;
        }
        
        .card {
          padding: 20px;
        }
        
        .endpoint-card {
          padding: 20px;
        }
        
        .top-controls {
          top: 10px;
          right: 10px;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        body.rtl .top-controls {
          right: auto;
          left: 10px;
        }
        
        .social-link {
          width: 45px;
          height: 45px;
          font-size: 1.1rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="top-controls">
      <div class="social-links">
        <a href="https://github.com/Darkcode-it/multi-provider-doh-proxy" target="_blank" rel="noopener noreferrer" class="social-link github" title="GitHub">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a href="https://t.me/darkcodeit" target="_blank" rel="noopener noreferrer" class="social-link telegram" title="Telegram">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
          </svg>
        </a>
      </div>
    </div>
    
    <div class="container">
      <header>
        <pre class="kali-banner">
    _    __     _ _     _    _       _ 
   | |  / /__ _| | |__ | |  (_)___  | |
   | | / / _ \` | | '_ \| |  | / __| | |
   | |/ /  __/ | | |_) | |__| \__ \ |_|
   |_/_/ \___|_|_|_.__/ \____|___/ (_)
        </pre>
        <h1>High-Performance DoH Proxy</h1>
        <p class="subtitle">
          <span class="typing-effect" id="typing-text"></span>
          <span class="typing-cursor"></span>
        </p>
        <p class="developer-credit">Developed and designed by darkcodeit</p>
      </header>
      
      <div class="endpoint-card">
        <h2>🚀 Your DoH Endpoint</h2>
        <p>Use this URL as your DNS-over-HTTPS resolver</p>
        <div class="endpoint-url" id="endpointUrl">${dnsEndpoint}</div>
        <button class="copy-btn" onclick="copyToClipboard()">Copy Endpoint URL</button>
      </div>
      
      <div class="features">
        <div class="card">
          <div class="feature">
            <div class="feature-icon">⚡</div>
            <div class="feature-content">
              <h3>Lightning Fast</h3>
              <p>Leverages Cloudflare's global edge network for minimal latency and maximum performance.</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="feature">
            <div class="feature-icon">🔄</div>
            <div class="feature-content">
              <h3>Load Balancing</h3>
              <p>Intelligently distributes requests across multiple DNS providers based on configurable weights.</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="feature">
            <div class="feature-icon">🛡️</div>
            <div class="feature-content">
              <h3>Automatic Failover</h3>
              <p>Seamlessly switches to backup providers when primary ones experience issues.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h2>📡 Supported DNS Providers</h2>
        <p>This proxy supports both general DNS providers and ad-blocking focused providers for enhanced privacy and security.</p>
        <div class="providers">
          ${PROVIDERS.map(p => `
          <div class="provider">
            <div class="provider-header">
              <div class="provider-name">${p.name}</div>
              <div class="provider-weight">${p.weight}%</div>
            </div>
            <div class="provider-url">${p.url}</div>
            ${(p.name === 'AdGuard' || p.name === 'ControlD' || p.name === 'Mullvad' || p.name === 'NextDNS') ? 
              `<div class="provider-description">Blocks ads, trackers, and malicious domains</div>` : ''}
          </div>
          `).join('')}
        </div>
      </div>
      
      <div class="card usage-examples">
        <h2>🔧 Usage Examples</h2>
        <p>Use this worker as a DoH endpoint:</p>
        
        <h3>GET Requests</h3>
        <p>For GET requests, the DNS query must be base64url-encoded as per the <a href="https://tools.ietf.org/html/rfc8484" style="color: #60a5fa;">RFC 8484 specification</a>:</p>
        <div class="code-block">
          GET /dns-query?dns=&lt;base64url-encoded-dns-query&gt;
        </div>
        <p><strong>Why base64url encoding?</strong></p>
        <ul class="encoding-list">
          <li>DNS queries are binary data that cannot be safely transmitted in URLs</li>
          <li>Base64url encoding converts binary data into a URL-safe string format</li>
          <li>Standard base64 uses characters like '+' and '/' which have special meaning in URLs</li>
          <li>Base64url replaces these with '-' and '_' making it URL-safe</li>
        </ul>
        <p><a href="/dns-encoding" class="btn">Detailed DNS Encoding Explanation</a></p>
        <p>Example with curl:</p>
        <div class="code-block">
          curl "${dnsEndpoint}?dns=q80BAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB"
        </div>
        
        <h3>POST Requests</h3>
        <p>For POST requests, the DNS query is sent as binary data in the request body:</p>
        <div class="code-block">
          POST /dns-query<br>
          Content-Type: application/dns-message<br>
          &lt;binary-dns-query&gt;
        </div>
        <p>Example with curl:</p>
        <div class="code-block">
          curl -H "Content-Type: application/dns-message" \\<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--data-binary @query.dns \\<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${dnsEndpoint}
        </div>
        
        <h3>Using Without Base64 Encoding</h3>
        <p>To avoid base64 encoding entirely, use POST requests with the <code>Content-Type: application/dns-message</code> header. The DNS query is sent as raw binary data in the request body:</p>
        <div class="code-block">
          curl -H "Content-Type: application/dns-message" \\<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--data-binary @query.dns \\<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${dnsEndpoint}
        </div>
      </div>
      
      <div class="card">
        <h2>⚙️ Configuration</h2>
        <p>This worker automatically balances requests across multiple DNS providers based on the configured weights. All DNS responses are cached for 5 minutes to improve performance.</p>
        <p>For CORS support, the worker includes the following headers in all responses:</p>
        <div class="code-block">
          Access-Control-Allow-Origin: *<br>
          Access-Control-Allow-Methods: GET, POST, OPTIONS<br>
          Access-Control-Allow-Headers: Content-Type, Accept
        </div>
      </div>
      
      <footer>
        <p>High-Performance DoH Proxy Worker | Powered by Cloudflare Workers</p>
      </footer>
    </div>
    
    <div class="copy-notification" id="copyNotification">Endpoint URL copied to clipboard!</div>
    
    <script>
      // Fixed preferences - always dark theme
      let currentTheme = 'dark';

      // Initialize theme (always dark)
      function initTheme() {
        if (document.documentElement) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }

      // Typing effect function - simulates terminal typing
      function typeText(element, text, minSpeed = 30, maxSpeed = 120) {
        let i = 0;
        element.textContent = '';
        
        function type() {
          if (i < text.length) {
            const char = text.charAt(i);
            element.textContent += char;
            i++;
            
            // Variable speed for more realistic typing
            // Faster for spaces, slower for punctuation
            let speed = minSpeed;
            if (char === ' ' || char === '.') {
              speed = minSpeed + Math.random() * 50;
            } else if (char === ',' || char === ';' || char === ':') {
              speed = minSpeed + Math.random() * 100;
            } else {
              speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            }
            
            setTimeout(type, speed);
          }
        }
        
        // Small delay before starting
        setTimeout(type, 500);
      }

      function copyToClipboard() {
        const endpointUrl = document.getElementById('endpointUrl').textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(endpointUrl).then(() => {
            const notification = document.getElementById('copyNotification');
            if (notification) {
              notification.classList.add('show');
              setTimeout(() => {
                notification.classList.remove('show');
              }, 3000);
            }
          }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopy(endpointUrl);
          });
        } else {
          fallbackCopy(endpointUrl);
        }
      }

      function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          const notification = document.getElementById('copyNotification');
          if (notification) {
            notification.classList.add('show');
            setTimeout(() => {
              notification.classList.remove('show');
            }, 3000);
          }
        } catch (err) {
          console.error('Fallback copy failed', err);
          alert('Failed to copy URL to clipboard. Please copy it manually: ' + text);
        }
        document.body.removeChild(textArea);
      }

      // Initialize everything when DOM is ready
      function init() {
        // Always use dark theme
        currentTheme = 'dark';
        
        // Set theme first (always dark)
        initTheme();
        
        // Start typing effect
        const typingElement = document.getElementById('typing-text');
        if (typingElement) {
          const textToType = 'Hello, good luck, copy this and go to the heart of the internet.';
          // Typing with variable speed (30-120ms) for realistic terminal effect
          typeText(typingElement, textToType, 30, 120);
        }
      }

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        // DOM is already loaded
        init();
      }
      
      // Expose copyToClipboard function globally
      window.copyToClipboard = copyToClipboard;
    </script>
  </body>
  </html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

// Serve detailed DNS encoding explanation
function serveDNSEncodingExplanation() {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DNS Query Encoding in DoH - Explained</title>
    <style>
      :root {
        --primary: #3b82f6;
        --primary-dark: #2563eb;
        --secondary: #10b981;
        --dark: #1e293b;
        --light: #f8fafc;
        --gray: #94a3b8;
        --border: #e2e8f0;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        line-height: 1.6;
        color: var(--dark);
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        min-height: 100vh;
        padding: 20px;
      }
      
      .container {
        max-width: 1000px;
        margin: 0 auto;
      }
      
      header {
        text-align: center;
        padding: 40px 20px;
        margin-bottom: 30px;
      }
      
      h1 {
        font-size: 2.5rem;
        margin-bottom: 15px;
        color: var(--dark);
        background: linear-gradient(90deg, var(--primary), var(--secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      .subtitle {
        font-size: 1.2rem;
        color: var(--gray);
        max-width: 700px;
        margin: 0 auto 25px;
      }
      
      .card {
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        padding: 30px;
        margin-bottom: 30px;
      }
      
      h2 {
        font-size: 1.8rem;
        margin-bottom: 20px;
        color: var(--dark);
        padding-bottom: 10px;
        border-bottom: 2px solid var(--border);
      }
      
      h3 {
        font-size: 1.4rem;
        margin: 25px 0 15px;
        color: var(--dark);
      }
      
      ul, ol {
        margin-left: 30px;
        margin-bottom: 20px;
      }
      
      li {
        margin-bottom: 10px;
      }
      
      .code-block {
        background: #0f172a;
        color: white;
        border-radius: 10px;
        padding: 20px;
        margin: 15px 0;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 0.95rem;
        overflow-x: auto;
      }
      
      .back-link {
        display: inline-block;
        background: var(--primary);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 500;
        margin-top: 15px;
        transition: background 0.3s ease;
      }
      
      .back-link:hover {
        background: var(--primary-dark);
      }
      
      footer {
        text-align: center;
        padding: 30px 0;
        color: var(--gray);
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>DNS Query Encoding in DNS-over-HTTPS</h1>
        <p class="subtitle">Understanding why DNS queries must be base64url-encoded in DoH GET requests</p>
      </header>
      
      <div class="card">
        <h2>Why DNS Queries Must Be Encoded</h2>
        
        <p>When using DNS-over-HTTPS with GET requests, DNS queries must be encoded using base64url encoding. This requirement exists for several important technical reasons:</p>
        
        <h3>1. Binary Data in URLs</h3>
        <p>DNS queries are binary data structures that contain information about the domain name being queried, the type of record requested (A, AAAA, MX, etc.), and other metadata. URLs, however, are text-based and have restrictions on what characters they can contain.</p>
        
        <h3>2. URL Safety</h3>
        <p>Standard Base64 encoding uses characters like '+' and '/' which have special meanings in URLs:</p>
        <ul>
          <li>'+' is interpreted as a space in URL query parameters</li>
          <li>'/' is interpreted as a path separator</li>
        </ul>
        
        <p>Base64url encoding solves this by:</p>
        <ul>
          <li>Replacing '+' with '-'</li>
          <li>Replacing '/' with '_'</li>
          <li>Optionally omitting padding '=' characters</li>
        </ul>
        
        <h3>3. RFC 8484 Compliance</h3>
        <p>The DNS-over-HTTPS specification (RFC 8484) mandates the use of base64url encoding for DNS queries transmitted via GET requests to ensure interoperability between different DoH implementations.</p>
        
        <h2>Example Encoding Process</h2>
        <ol>
          <li>A DNS query for "example.com" is represented as binary data</li>
          <li>This binary data is encoded using base64url encoding</li>
          <li>The resulting string is safe to use in a URL query parameter</li>
        </ol>
        
        <div class="code-block">
Binary DNS Query → Base64url Encoding → URL Parameter
[0x12, 0x34, ...] → "q80BAAAB..." → ?dns=q80BAAAB...</div>
        
        <h2>When Encoding is Required</h2>
        <ul>
          <li><strong>GET Requests</strong>: DNS queries MUST be base64url-encoded</li>
          <li><strong>POST Requests</strong>: DNS queries are sent as binary data in the request body (no encoding needed)</li>
        </ul>
        
        <h2>Tools for Encoding</h2>
        <p>Many programming languages provide built-in functions for base64url encoding:</p>
        <ul>
          <li>JavaScript: Custom function using <code>btoa()</code> with character replacements</li>
          <li>Python: <code>base64.urlsafe_b64encode()</code></li>
          <li>Command-line: <code>openssl base64 -url</code></li>
        </ul>
        
        <p>This encoding requirement ensures that DNS queries can be safely transmitted over HTTPS while maintaining compatibility with web standards and the DoH protocol specification.</p>
        
        <h2>Ad-Blocking Support</h2>
        <p>This DoH proxy includes support for ad-blocking DNS providers. When using this service, DNS queries are automatically distributed across multiple providers including specialized ad-blocking services like AdGuard, ControlD, Mullvad, and NextDNS. These providers block ads, trackers, and malicious domains at the DNS level, providing an additional layer of privacy and security.</p>
        
        <a href="/" class="back-link">← Back to Main Page</a>
      </div>
      
      <footer>
        <p>High-Performance DoH Proxy Worker | Powered by Cloudflare Workers</p>
      </footer>
    </div>
  </body>
  </html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

// Handle CORS preflight requests
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Weighted random selection of DoH provider
function selectProvider(providers) {
  const totalWeight = providers.reduce((sum, provider) => sum + provider.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const provider of providers) {
    random -= provider.weight;
    if (random <= 0) {
      return provider;
    }
  }
  
  // Fallback to first provider
  return providers[0];
}

// Try fallback providers when primary fails
async function tryFallbackProviders(request, url, failedProvider, DOH_PROVIDERS, CACHE_TTL, requestBody, isPost) {
  const fallbackProviders = DOH_PROVIDERS.filter(p => p.name !== failedProvider.name);
  
  for (const provider of fallbackProviders) {
    try {
      const targetUrl = provider.url + url.search;
      
      const headers = new Headers(request.headers);
      if (isPost) {
        headers.set('Content-Type', 'application/dns-message');
      } else {
        headers.set('Accept', 'application/dns-message');
      }
      headers.set('User-Agent', 'DoH-Proxy-Worker/1.0');
      
      const upstreamRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: requestBody,
        redirect: 'follow'
      });
      
      const response = await fetch(upstreamRequest);
      
      if (response.ok) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
        responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
        responseHeaders.set('X-Provider', provider.name);
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }
    } catch (error) {
      // Continue to next provider
      continue;
    }
  }
  
  // All providers failed
  return new Response('All DNS providers are unavailable', { 
    status: 503,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain'
    }
  });
}
