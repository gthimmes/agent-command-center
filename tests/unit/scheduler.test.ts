import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseInterval, formatInterval } from '../../server/scheduler.js'

describe('parseInterval', () => {
  it('parses seconds', () => {
    assert.equal(parseInterval('30s'), 30000)
    assert.equal(parseInterval('1s'), 1000)
    assert.equal(parseInterval('90sec'), 90000)
    assert.equal(parseInterval('5seconds'), 5000)
  })

  it('parses minutes', () => {
    assert.equal(parseInterval('5m'), 300000)
    assert.equal(parseInterval('1min'), 60000)
    assert.equal(parseInterval('30minutes'), 1800000)
  })

  it('parses hours', () => {
    assert.equal(parseInterval('2h'), 7200000)
    assert.equal(parseInterval('1hr'), 3600000)
    assert.equal(parseInterval('4hours'), 14400000)
  })

  it('parses days', () => {
    assert.equal(parseInterval('1d'), 86400000)
    assert.equal(parseInterval('7days'), 604800000)
  })

  it('defaults to minutes for bare numbers', () => {
    assert.equal(parseInterval('5'), 300000)
    assert.equal(parseInterval('30'), 1800000)
  })

  it('handles whitespace', () => {
    assert.equal(parseInterval('  5m  '), 300000)
    assert.equal(parseInterval('2 h'), 7200000)
  })

  it('throws on invalid input', () => {
    assert.throws(() => parseInterval('abc'), /Invalid interval/)
    assert.throws(() => parseInterval(''), /Invalid interval/)
    assert.throws(() => parseInterval('5x'), /Invalid interval/)
  })
})

describe('formatInterval', () => {
  it('formats seconds', () => {
    assert.equal(formatInterval(30000), '30s')
    assert.equal(formatInterval(1000), '1s')
  })

  it('formats minutes', () => {
    assert.equal(formatInterval(300000), '5m')
    assert.equal(formatInterval(60000), '1m')
  })

  it('formats hours', () => {
    assert.equal(formatInterval(3600000), '1h')
    assert.equal(formatInterval(7200000), '2h')
  })

  it('formats days', () => {
    assert.equal(formatInterval(86400000), '1d')
  })
})
