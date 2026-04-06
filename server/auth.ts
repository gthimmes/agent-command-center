import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'
import os from 'os'
import type { Request, Response, NextFunction } from 'express'
import type { IncomingMessage } from 'http'

const DATA_DIR = path.join(os.homedir(), '.agentpower')
const AUTH_FILE = path.join(DATA_DIR, 'auth.json')

interface AuthConfig {
  /** Bearer token required for all HTTP and WS connections. */
  token: string
  /** If true, auth is enforced. If false, the app runs open (default for first launch). */
  enabled: boolean
}

let config: AuthConfig | null = null

/**
 * Load or initialize the auth config.
 * On first launch, auth is disabled and a token is pre-generated (ready to enable).
 * The user enables it by setting AGENTPOWER_AUTH_TOKEN env var or editing auth.json.
 */
export async function initAuth(): Promise<void> {
  // Env var takes precedence — if set, auth is always enabled
  const envToken = process.env.AGENTPOWER_AUTH_TOKEN
  if (envToken) {
    config = { token: envToken, enabled: true }
    console.log('[auth] Token auth enabled via AGENTPOWER_AUTH_TOKEN')
    return
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const raw = await fs.readFile(AUTH_FILE, 'utf-8')
    config = JSON.parse(raw)
    if (config?.enabled) {
      console.log('[auth] Token auth enabled via auth.json')
    } else {
      console.log('[auth] Auth is disabled (set AGENTPOWER_AUTH_TOKEN or edit ~/.agentpower/auth.json)')
    }
  } catch {
    // First launch — generate a token but leave auth disabled
    const token = randomBytes(32).toString('base64url')
    config = { token, enabled: false }
    await fs.writeFile(AUTH_FILE, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[auth] Auth is disabled. To enable, set AGENTPOWER_AUTH_TOKEN or set "enabled": true in ~/.agentpower/auth.json')
    console.log(`[auth] Pre-generated token: ${token}`)
  }
}

export function isAuthEnabled(): boolean {
  return config?.enabled ?? false
}

export function getAuthToken(): string {
  return config?.token ?? ''
}

/**
 * Express middleware that checks for a valid Bearer token.
 * Skips auth if auth is disabled.
 * Allows webhook trigger endpoints through (they have their own token auth).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config?.enabled) return next()

  // Webhook trigger endpoints have their own per-trigger token auth — don't double-auth
  if (req.path.startsWith('/api/trigger/')) return next()

  // Static files (the built frontend) need to be accessible to load the login page
  // But in our case the SPA sends the token in WS + API calls, so we allow static files through
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/ws')) return next()

  const authHeader = req.headers.authorization
  if (authHeader === `Bearer ${config.token}`) return next()

  // Also check query param for convenience (e.g. EventSource, simple GETs)
  if (req.query.auth_token === config.token) return next()

  res.status(401).json({ error: 'Unauthorized. Provide Bearer token in Authorization header.' })
}

/**
 * Validate a WebSocket upgrade request.
 * Returns true if the connection is authorized.
 */
export function authWsUpgrade(req: IncomingMessage): boolean {
  if (!config?.enabled) return true

  // Check Sec-WebSocket-Protocol header (browsers can send this)
  const protocols = req.headers['sec-websocket-protocol']
  if (protocols?.includes(config.token)) return true

  // Check query string
  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  if (url.searchParams.get('token') === config.token) return true

  return false
}
