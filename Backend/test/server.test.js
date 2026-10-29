const { test, describe } = require('node:test')
const assert = require('node:assert')
const { fork } = require('node:child_process')
const path = require('node:path')
const { MongoMemoryServer } = require('mongodb-memory-server')

const serverScript = path.resolve(__dirname, '../server.js')

describe('Server Lifecycle & Startup', () => {
  test('Server handles MongoDB startup failure and exits with code 1', async () => {
    const child = fork(serverScript, [], {
      env: {
        ...process.env,
        PORT: '5099',
        CLIENT_ORIGIN: 'http://localhost:5173',
        MONGODB_URI: 'mongodb://127.0.0.1:27019/unreachable_db?serverSelectionTimeoutMS=2000',
        JWT_SECRET: 'test_jwt_secret_key_minimum_16_chars',
      },
      silent: true,
    })

    let stdoutData = ''
    let stderrData = ''
    child.stdout.on('data', (d) => { stdoutData += d.toString() })
    child.stderr.on('data', (d) => { stderrData += d.toString() })

    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code))
    })

    assert.strictEqual(exitCode, 1)
    const combinedOutput = stdoutData + stderrData
    assert.ok(
      combinedOutput.includes('Server startup failed') || combinedOutput.includes('MongoDB connection failed') || combinedOutput.includes('ECONNREFUSED'),
      `Expected output to report startup failure, got: ${combinedOutput}`
    )
  })

  test('Server connects to MongoDB, starts HTTP server, and responds to /api/health', async () => {
    // 1. Start in-memory MongoDB
    const mongod = await MongoMemoryServer.create()
    const uri = mongod.getUri()

    // 2. Fork server.js with the running mongo URI
    const child = fork(serverScript, [], {
      env: {
        ...process.env,
        PORT: '5088',
        CLIENT_ORIGIN: 'http://localhost:5173',
        MONGODB_URI: uri,
        JWT_SECRET: 'test_jwt_secret_key_minimum_16_chars',
      },
      silent: true,
    })

    let stdoutData = ''
    child.stdout.on('data', (d) => {
      stdoutData += d.toString()
    })

    // Wait for server to announce listening
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Server timed out waiting to start. Output: ${stdoutData}`))
      }, 10000)

      const interval = setInterval(() => {
        if (stdoutData.includes('BrainDetour API running at')) {
          clearTimeout(timeout)
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })

    // Verify /api/health responds via HTTP
    const res = await fetch('http://localhost:5088/api/health')
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.status, 'ok')
    assert.strictEqual(data.server, 'running')
    assert.strictEqual(data.database.status, 'connected')

    child.kill('SIGTERM')
    await mongod.stop()
  })
})
