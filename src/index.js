import { Router } from 'itty-router'

const router = Router()

// تابع برای بارگذاری تنظیمات از environment variables
function getConfig(env) {
    // دریافت CACHE_TTL از env یا استفاده از مقدار پیش‌فرض
    const CACHE_TTL = env.CACHE_TTL ? parseInt(env.CACHE_TTL) : 300
    
    // دریافت PROVIDERS از env یا استفاده از مقدار پیش‌فرض
    let PROVIDERS
    if (env.PROVIDERS && Array.isArray(env.PROVIDERS)) {
        // Parse JSON strings from TOML array
        PROVIDERS = env.PROVIDERS.map(providerStr => {
            try {
                return JSON.parse(providerStr)
            } catch (e) {
                console.error('Error parsing provider:', providerStr, e)
                return null
            }
        }).filter(p => p !== null)
    } else {
        // Fallback to default providers
        PROVIDERS = [
            { name: "cloudflare", url: "https://cloudflare-dns.com/dns-query", weight: 20 },
            { name: "google", url: "https://dns.google/dns-query", weight: 15 },
            { name: "quad9", url: "https://dns.quad9.net/dns-query", weight: 15 },
            { name: "opendns", url: "https://doh.opendns.com/dns-query", weight: 10 },
            { name: "adguard", url: "https://dns.adguard.com/dns-query", weight: 10 },
            { name: "controld", url: "https://freedns.controld.com/p2", weight: 10 },
            { name: "mullvad", url: "https://adblock.dns.mullvad.net/dns-query", weight: 10 },
            { name: "nextdns", url: "https://dns.nextdns.io/dns-query", weight: 10 }
        ]
    }
    
    return { CACHE_TTL, PROVIDERS }
}

// تابع انتخاب تصادفی provider با وزن
function selectProvider(PROVIDERS) {
    const totalWeight = PROVIDERS.reduce((sum, provider) => sum + provider.weight, 0)
    let random = Math.random() * totalWeight
    
    for (const provider of PROVIDERS) {
        random -= provider.weight
        if (random <= 0) {
            return provider
        }
    }
    return PROVIDERS[0]
}

// تابع base64url decode
function base64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/')
    while (str.length % 4) {
        str += '='
    }
    return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

// افزودن headers مربوط به CORS
function addCorsHeaders(response) {
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
    
    return new Response(response.body, {
        status: response.status,
        headers: headers
    })
}

// هندلر اصلی برای درخواست‌های DNS
async function handleDnsQuery(request, env) {
    const { CACHE_TTL, PROVIDERS } = getConfig(env)
    
    let dnsQuery
    
    try {
        if (request.method === 'GET') {
            const url = new URL(request.url)
            const dnsParam = url.searchParams.get('dns')
            
            if (!dnsParam) {
                return new Response('Missing DNS parameter', { status: 400 })
            }
            
            dnsQuery = base64urlDecode(dnsParam)
        } else if (request.method === 'POST') {
            dnsQuery = new Uint8Array(await request.arrayBuffer())
        } else {
            return new Response('Method not allowed', { status: 405 })
        }
    } catch (error) {
        return new Response('Invalid DNS query', { status: 400 })
    }
    
    // انتخاب provider
    const provider = selectProvider(PROVIDERS)
    
    try {
        // ارسال درخواست به DNS provider
        const response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/dns-message',
                'Accept': 'application/dns-message'
            },
            body: dnsQuery
        })
        
        if (!response.ok) {
            throw new Error(`Provider ${provider.name} returned ${response.status}`)
        }
        
        const responseData = await response.arrayBuffer()
        
        // ساخت response با headers مناسب
        const dnsResponse = new Response(responseData, {
            headers: {
                'Content-Type': 'application/dns-message',
                'Cache-Control': `public, max-age=${CACHE_TTL}`,
                'X-Provider': provider.name
            }
        })
        
        return addCorsHeaders(dnsResponse)
        
    } catch (error) {
        return new Response(`DNS query failed: ${error.message}`, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        })
    }
}

// routes
router.options('/dns-query', () => {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept'
        }
    })
})

router.get('/dns-query', (request, env) => handleDnsQuery(request, env))
router.post('/dns-query', (request, env) => handleDnsQuery(request, env))

// route اصلی برای نمایش اطلاعات
router.get('/', (request, env) => {
    const { PROVIDERS } = getConfig(env)
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>DoH Proxy Worker</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🚀 DoH Proxy Worker</h1>
        <p>Your DoH endpoint: <code>${new URL(request.url).origin}/dns-query</code></p>
        
        <h2>📡 Supported Providers:</h2>
        <ul>
            ${PROVIDERS.map(p => `<li><strong>${p.name}</strong> - ${p.weight}%</li>`).join('')}
        </ul>
        
        <h2>🔧 Usage Examples:</h2>
        <h3>GET Request:</h3>
        <code>curl "${new URL(request.url).origin}/dns-query?dns=q80BAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB"</code>
        
        <h3>POST Request:</h3>
        <code>curl -X POST -H "Content-Type: application/dns-message" --data-binary @query.dns "${new URL(request.url).origin}/dns-query"</code>
    </body>
    </html>
    `
    
    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
})

// هندلر خطا
router.all('*', () => new Response('Not found', { status: 404 }))

// هندلر اصلی
export default {
    async fetch(request, env, ctx) {
        return router.handle(request, env)
    }
}
