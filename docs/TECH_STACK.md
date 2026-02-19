# Tech Stack (MVP1)

This stack is chosen for low cost, fast delivery, and scalability.

## 1) Mobile App
- React Native (Expo)
- Benefits: fast iteration, strong ecosystem, modern UI

## 2) Backend API
- TypeScript + Fastify
- Benefits: low overhead, fast startup, easy to scale

## 3) Database
- PostgreSQL (managed)
- Suggested providers: Neon or Supabase (free tier initially)

## 4) Cache / Queue
- Redis (Upstash pay-as-you-go)
- Used for repeat-avoidance cache and background jobs

## 5) Storage (PDFs and Assets)
- Cloudflare R2 (low-cost object storage)

## 6) PDF Generation
- Server-side HTML to PDF (Playwright or Puppeteer)
- Must be available immediately after Take Test

## 7) Hosting
- API: Render, Railway, or Fly.io (low-cost, scalable)
- Static assets: Cloudflare or S3 + CDN

## 8) Analytics / Monitoring (Optional MVP1)
- Basic logging + error tracking (Sentry or similar)

## 9) Auth and Payments
- Firebase Auth (OTP + Google)
- Razorpay (post-release integration)
