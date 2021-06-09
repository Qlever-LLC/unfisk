/* Copyright 2021 Qlever LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import debug from 'debug';
import Bluebird from 'bluebird';

import { Json, connect, OADAClient, Change } from '@oada/client';
import moment from 'moment';

import config from './config';

const info = debug('unfisk:info');
const trace = debug('unfisk:trace');
const warn = debug('unfisk:warn');
const error = debug('unfisk:error');

// tolerant of https or not https on domain
const domain = config.get('oada.domain').replace(/^https?:\/\//, '');
if (domain === 'proxy' || domain === 'localhost') {
  warn('Domain is proxy or localhost, allowing self-signed https certificate');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
const tokens = config.get('oada.token');
const flat = config.get('lists.flat');
const unflat = config.get('lists.unflat'); // day-index will be added to this
const tree = config.get('lists.unflatTree');
const rateLimit = config.get('oada.trottle');

// TODO: Hopefully this bug in oada-cache gets fixed
type Body<T> = { _rev: string; _id: string } & T;

/**
 * Shared OADA client instance?
 */
let oada: OADAClient;
async function unfisk(token: string) {
  // Connect to the OADA API
  const conn = oada
    ? oada.clone(token)
    : (oada = await connect({ token, domain: 'https://' + domain }));

  await ensureAllPathsExist(conn);

  // Get the initial state of asn-staging, then watch from there
  const data = <Body<Json>>(
    await conn
      .get({ path: `/bookmarks/trellisfw/asn-staging` })
      .then((r) => r.data)
  );
  await conn.watch({
    path: flat,
    rev: data._rev, // start where previous request left off, avoids race condition
    watchCallback: flatHandler,
  });

  // Make "change" for current state?
  trace('Processing fake change on startup');
  await flatHandler({
    type: 'merge',
    body: data,
    path: '',
    resource_id: data._id,
  });

  // Run when there is a change to the flat list
  async function flatHandler(change: Readonly<Change>) {
    trace('flatHandler: new change received = ', change);

    const { type, body: data } = change;

    // Try to figure out the day from the change
    const time: number | undefined = (data as any)?._meta?.modified;
    if (!time) {
      warn('failed to process day, using today');
    }
    const day = moment(time ? time * 1000 : undefined).format('YYYY-MM-DD');

    // Get new items ignoring _ keys
    const items = Object.keys(data || {}).filter((r) => !r.match(/^_/));
    trace(
      'flatHandler: there are ' + items.length + ' non-oada keys to handle'
    );
    switch (type) {
      case 'merge':
        await Bluebird.each(items, (id) => {
          const done = unflatten({ item: (data as any)[id], id, day }).catch(
            error
          );
          const delay = Bluebird.delay(rateLimit);
          return Bluebird.all([done, delay]);
        });
        break;
      case 'delete':
        trace('flatHandler: delete change, ignoriing');
        break;
      default:
        warn(`Ignoring unknown change type ${type} to flat list`);
    }
  }

  async function unflatten({
    item,
    id,
    day,
  }: {
    item: any;
    id: string;
    day: string;
  }) {
    info(`unflatten: Unflattening item ${id}`);
    trace('unflatten: item = ', item);

    // Link the newly created resource in unflat list
    trace("Putting new resource into asns list under today's day-index");
    await conn.put({
      contentType: 'application/vnd.trellisfw.asns.1+json',
      path: `${unflat}/day-index/${day}/${id}`,
      tree,
      data: item,
    });

    trace('Deleting original asn-staging..');
    // Remove unflattened item from flat list
    await conn.delete({
      // TODO: Why do I need a content-type header?
      //headers: { 'Content-Type': 'application/json' },
      path: `${flat}/${id}`,
    });
  }

  async function ensureAllPathsExist(conn: OADAClient) {
    const tree = {
      bookmarks: {
        _type: 'application/vnd.oada.bookmarks.1+json',
        trellisfw: {
          '_type': 'application/vnd.trellisfw.1+json',
          'asns': {
            _type: 'application/vnd.trellisfw.asns.1+json',
          },
          'asn-staging': {
            _type: 'application/vnd.trellisfw.asn-staging.1+json',
          },
        },
      },
    };
    return Bluebird.map(
      ['/bookmarks/trellisfw/asns', '/bookmarks/trellisfw/asn-staging'],
      async (path) => {
        trace('ensureAllPathsExist: ensuring we have ' + path);
        try {
          await conn.get({ path });
        } catch (e) {
          if (e.status !== 404) {
            return error(
              'ensureAllPathsExist: Tried to get ' +
                path +
                ', but result was something other than 200 or 404: ',
              e
            );
          }
          info(
            'ensureAllPathsExist: Path ' +
              path +
              ' did not exist, doing tree put to create it'
          );
          return await conn.put({ path, data: {}, tree });
        }
        info(
          'ensureAllPathsExist: Path ' + path + ' exists already, leaving as-is'
        );
      }
    );
  }
}

for (const token of tokens) {
  unfisk(token).catch((err) => {
    error(err);
    process.exit(1);
  });
}
