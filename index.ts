import debug from 'debug'
import { Promise } from 'bluebird'

import oada from '@oada/oada-cache'
import uuid from 'uuid/v4'
import _ from 'lodash'

import config from './config'

const info = debug('unfisk:info')
const trace = debug('unfisk:trace')
const warn = debug('unfisk:warn')
const error = debug('unfisk:error')

const domain: string = config.get('domain')
const token: string = config.get('token')
const flat: string = config.get('flatList')
const unflat: string = config.get('unflatList')

async function unfisk () {
  const conn = await oada.connect({
    domain: `${domain}`,
    token,
    cache: false
  })

  await ensureAllPathsExist(conn)

  const { data } = await conn.get({
    path: flat,
    watch: {
      payload: {
        conn,
        token
      },
      callback: flatHandler
    }
  })

  // Make "change" for current state?
  const change = {
    type: 'merge',
    body: data
  }
  await flatHandler({ response: { change }, conn, token })
}

// TODO: Hopefully this bug in oada-cache gets fixed
type Body<T> = { _rev: string; _id: string } & T
type WeirdBody<T> = { data: Body<T> }
type ReturnBody<T> = Body<T> | WeirdBody<T>
function isWeird<T> (body: ReturnBody<T>): body is WeirdBody<T> {
  return (body as Body<T>)._rev === undefined
}
function fixBody<T> (body: ReturnBody<T>): Body<T> {
  return isWeird(body) ? body.data : body
}

// Run when there is a change to the flat list
async function flatHandler ({ response: { change }, conn, token }) {
  info('Running flat watch handler')
  trace(change)

  const { type, body } = change
  const data = fixBody<object>(body)
  // Get new items ignoring _ keys
  const items = Object.keys(data || {}).filter(r => !r.match(/^_/))
  switch (type) {
    case 'merge':
      await Promise.each(items, id =>
        unflatten({ item: data[id], id, conn, token }).catch(error)
      )
      break
    case 'delete':
      break
    default:
      warn(`Ignoring unknown change type ${type} to flat list`)
  }
}

async function unflatten ({ item, id, conn, token }) {
  info(`Unflattening item ${id}`)
  trace(item)

  // Create resource to which to link
  await conn.put({
    token,
    headers: { 'Content-Type': 'application/vnd.trellisfw.asn.sf.1+json' },
    path: `/resources/${id}`,
    data: item
  })

  // Link the newly created resource in unflat list
  await conn.put({
    token,
    headers: { 'Content-Type': 'application/vnd.trellisfw.asns.1+json' },
    path: `${unflat}/${id}`,
    data: {
      _id: id,
      _rev: '0' // TODO: Should it be versioned??
    }
  })

  // Remove unflattened item from flat list
  await conn.delete({
    token,
    // TODO: Why do I need a content-type header?
    headers: { 'Content-Type': 'application/json' },
    path: `${flat}/${id}`
  })
}

async function ensureAllPathsExist (conn) {
  trace(
    'ensureAllPathsExist: ensuring we have /bookmarks/trellisfw/asns and /bookmarks/trellisfw/asn-staging'
  )
  // Ensure the trellisfw path exists, and the asn-staging and asn paths exist
  let id = false
  const bookmarks = await conn.get({ path: '/bookmarks' })
  if (!bookmarks) return error('Could not get bookmarks when ensuring path!')
  try {
    await conn.get({ path: '/bookmarks/trellisfw' })
  } catch (e) {
    if (e.response.status !== 404)
      return error(
        'Tried to get /bookmarks/trellisfw, but result was something other than 200 or 404'
      )
    id = uuid()
    // These should throw if they fail, aborting the whole thing...
    info('ensuring trellisfw: Creating /resources/' + id)
    await conn.put({
      path: '/resources/' + id,
      data: {},
      headers: { 'content-type': 'application/vnd.trellisfw.1+json' }
    })
    info('ensuring trellisfw: linking new resource to /bookmarks/trellisfw')
    await conn.put({
      path: '/bookmarks',
      data: { trellisfw: { _id: 'resources/' + id } },
      headers: { 'content-type': 'application/vnd.oada.bookmarks.1+json' }
    })
  }
  try {
    await conn.get({ path: '/bookmarks/trellisfw/asns' })
  } catch (e) {
    if (e.response.status !== 404)
      return error(
        'Tried to get /bookmarks/trellisfw, but result was something other than 200 or 404'
      )
    id = uuid()
    info('ensuring asns: Creating /resources/', id)
    await conn.put({
      path: '/resources/' + id,
      data: {},
      headers: { 'content-type': 'application/vnd.trellisfw.asns.1+json' }
    })
    info(
      'ensuring asns: linking new resource to /bookmarks/trellisfw/asn-staging'
    )
    await conn.put({
      path: '/bookmarks/trellisfw',
      data: { asns: { _id: 'resources/' + id } },
      headers: { 'content-type': 'application/vnd.trellisfw.1+json' }
    })
  }
  try {
    await conn.get({ path: '/bookmarks/trellisfw/asn-staging' })
  } catch (e) {
    if (e.response.status !== 404)
      return error(
        'Tried to get /bookmarks/trellisfw/asn-staging, but result was something other than 200 or 404'
      )
    id = uuid()
    info('ensuring asn-staging: Creating /resources/', id)
    await conn.put({
      path: '/resources/' + id,
      data: {},
      headers: {
        'content-type': 'application/vnd.trellisfw.asn-staging.1+json'
      }
    })
    info(
      'ensuring asns: linking new resource to /bookmarks/trellisfw/asn-staging'
    )
    await conn.put({
      path: '/bookmarks/trellisfw',
      data: { 'asn-staging': { _id: 'resources/' + id } },
      headers: { 'content-type': 'application/vnd.trellisfw.1+json' }
    })
  }
}

unfisk()
