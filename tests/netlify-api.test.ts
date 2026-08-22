import { describe, expect, it } from 'vitest'
import handler from '../netlify/functions/api.js'

describe('Netlify protected API gateway', () => {
  it('rejects non-POST requests', async () => {
    const response = await handler(new Request('http://localhost/.netlify/functions/api'))
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed.' })
  })

  it('requires a Firebase ID token', async () => {
    const response = await handler(new Request('http://localhost/.netlify/functions/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'createMember', data: {} }),
    }))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Sign-in is required.' })
  })
})
