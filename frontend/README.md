# Solvrn Frontend

React/Vite frontend for the Solvrn governance protocol.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Environment Variables

All environment variables must be prefixed with `VITE_` for Vite to expose them.

See `.env.example` for required variables.

## Deployment

See [../DEPLOYMENT.md](../DEPLOYMENT.md) for deployment instructions.

## Features

- Wallet connection (Phantom, Solflare)
- Proposal creation
- Private voting
- Vote tallying
- Transaction monitoring

## Requirements

- Node.js 18+
- Modern browser with WebAssembly support
- HTTPS (required for WASM in production)


