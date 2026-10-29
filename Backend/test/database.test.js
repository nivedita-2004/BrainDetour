const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const app = require('../src/app')
const { connectDatabase } = require('../src/config/database')
const { errorHandler } = require('../src/middleware/errorHandler')

let mongod
let server
let baseUrl

before(async () => {
  // 1. Start in-memory MongoDB instance
  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()
  process.env.MONGODB_URI = uri

  // 2. Connect to in-memory MongoDB using simplified database module
  await connectDatabase()

  // 3. Start Express server
  server = http.createServer(app)
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }
  await mongoose.disconnect()
  if (mongod) {
    await mongod.stop()
  }
})

describe('MongoDB Connection & Health Integration', () => {
  test('connects to real MongoDB and updates mongoose.connection.readyState to 1', () => {
    assert.strictEqual(mongoose.connection.readyState, 1)
    assert.ok(mongoose.connection.host)
  })

  test('GET /api/health returns HTTP 200 with ok status when MongoDB is connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    assert.strictEqual(res.status, 200)

    const data = await res.json()
    assert.strictEqual(data.status, 'ok')
    assert.strictEqual(data.server, 'running')
    assert.strictEqual(data.database.status, 'connected')
  })

  test('Centralized error handler hides stack trace when in production', () => {
    let capturedResponse = null
    const mockRes = {
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        capturedResponse = payload
      },
    }

    const testError = new Error('Secret database credentials leaked')
    testError.statusCode = 500

    // Temporarily mock isProduction
    process.env.NODE_ENV = 'production'
    errorHandler(testError, { method: 'GET', originalUrl: '/test' }, mockRes, () => {})
    process.env.NODE_ENV = 'development'

    assert.strictEqual(mockRes.statusCode, 500)
    assert.strictEqual(capturedResponse.success, false)
    assert.strictEqual(capturedResponse.error.stack, undefined)
  })
})
