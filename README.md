# DoH Proxy Worker

A Cloudflare Worker that acts as a proxy for DNS-over-HTTPS (DoH) queries, forwarding requests to upstream DoH servers.

## Features

- ✅ Proxy DNS-over-HTTPS queries
- ✅ Support for both GET and POST methods
- ✅ CORS support for web clients
- ✅ Configurable upstream DoH servers
- ✅ Error handling and logging

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your Cloudflare Worker:
   - Update `wrangler.toml` with your account ID and zone ID
   - Set environment variables if needed (e.g., `DOH_SERVER`)

3. Deploy to Cloudflare:
```bash
npm run deploy
```

## Development

Run the worker locally:
```bash
npm run dev
```

## Usage

### GET Request
```
GET /?dns=<base64url-encoded-dns-message>
```

### POST Request
```
POST /
Content-Type: application/dns-message

<binary-dns-message>
```

## Configuration

### Environment Variables

- `DOH_SERVER`: Custom upstream DoH server URL (default: Cloudflare DNS)

### Default Upstream Servers

- Cloudflare: `https://cloudflare-dns.com/dns-query`
- Google: `https://dns.google/dns-query`
- Quad9: `https://dns.quad9.net/dns-query`

## License

MIT

