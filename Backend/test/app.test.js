const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { execSync } = require('node:child_process')
const path = require('node:path')
const mongoose = require('mongoose')
const app = require('../src/app')

let server
let baseUrl

before((_, done) => {
  server = http.createServer(app)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
    done()
  })
})

after((_, done) => {
  server.close(done)
})

describe('BrainDetour Backend Configuration & Core Routes', () => {
  test('server.js exits with a clear error if MONGODB_URI is missing', () => {
    const serverScript = path.resolve(__dirname, '../server.js')
    assert.throws(
      () => {
        execSync(`node "${serverScript}"`, {
          env: { ...process.env, MONGODB_URI: '' },
          stdio: 'pipe',
        })
      },
      (err) => {
        const stderr = err.stderr ? err.stderr.toString() : ''
        const stdout = err.stdout ? err.stdout.toString() : ''
        const combined = stderr + stdout
        return combined.includes('MONGODB_URI is missing in Backend/.env')
      }
    )
  })

  test('server.js exits with a clear error if ACCESS_TOKEN_SECRET is missing', () => {
    const serverScript = path.resolve(__dirname, '../server.js')
    assert.throws(
      () => {
        execSync(`node "${serverScript}"`, {
          env: {
            ...process.env,
            ACCESS_TOKEN_SECRET: '',
            JWT_SECRET: '',
            MONGODB_URI: 'mongodb://127.0.0.1:27017/test?serverSelectionTimeoutMS=1000',
          },
          stdio: 'pipe',
        })
      },
      (err) => {
        const stderr = err.stderr ? err.stderr.toString() : ''
        const stdout = err.stdout ? err.stdout.toString() : ''
        const combined = stderr + stdout
        return combined.includes('ACCESS_TOKEN_SECRET is missing in Backend/.env')
      }
    )
  })

  test('GET /api/health returns server status and database connectivity info', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    const data = await res.json()

    assert.ok(res.status === 200 || res.status === 503)
    assert.strictEqual(data.server, 'running')
    assert.ok(data.timestamp)
    assert.strictEqual(typeof data.uptime, 'number')
    assert.ok(data.database)
    assert.ok(['connected', 'disconnected'].includes(data.database.status))
  })

  test('GET /api/unknown-route returns clean JSON 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown-route`)
    assert.strictEqual(res.status, 404)

    const data = await res.json()
    assert.strictEqual(data.success, false)
    assert.strictEqual(data.error.statusCode, 404)
    assert.ok(data.error.message.includes('Route not found'))
  })

  test('Helmet security headers are set on responses', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff')
  })

  test('CORS headers allow requests from configured CLIENT_ORIGIN', async () => {
    const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: {
        Origin: origin,
      },
    })
    assert.strictEqual(res.headers.get('access-control-allow-origin'), origin)
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true')
  })

  test('database reports disconnected status when not connected', () => {
    assert.strictEqual(mongoose.connection.readyState, 0)
  })
})
