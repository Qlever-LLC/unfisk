/**
 * @license
 * Copyright 2021-2022 Qlever LLC
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

import config from './config.js';

import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import debug from 'debug';
import moment from 'moment';

import { type Change, type OADAClient, connect } from '@oada/client';

const info = debug('unfisk:info');
const trace = debug('unfisk:trace');
const warn = debug('unfisk:warn');
const error = debug('unfisk:error');
const fatal = debug('unfisk:fatal');

// Tolerant of https or not https on domain
const domain = config.get('oada.domain').replace(/^https?:\/\//, '');
const mode = config.get('oada.mode');
const tokens = config.get('oada.token');
const flat = config.get('lists.flat');
const unflat = config.get('lists.unflat'); // Day-index will be added to this
const unflatTree = config.get('lists.unflatTree');
const rateLimit = config.get('oada.throttle');

/**
 * Shared OADA client instance?
 */
let oada: OADAClient;
async function unfisk(token: string) {
  // Connect to the OADA API
  const conn = oada
    ? oada.clone(token)
    : (oada = await connect({ token, domain: `${mode}://${domain}` }));

  await ensureAllPathsExist(conn);

  // Get the current state of asn-staging and for changes watch from there
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const { changes, data } = await conn.watch({
    initialMethod: 'get',
    path: flat,
  });
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Buffer.isBuffer(data)
  ) {
    throw new TypeError('Flat list is not a JSON resource');
  }

  // Make fake "change" for current state?
  const fakeChange = {
    type: 'merge' as const,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    body: data as any,
    path: '',
    resource_id: data._id as string,
  };
  trace({ change: fakeChange }, 'Processing fake change on startup');
  await flatHandler(conn, fakeChange);

  // Handle new changes as they come
  for await (const change of changes) {
    await flatHandler(conn, change);
  }
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
  await Promise.all(
    ['/bookmarks/trellisfw/asns', '/bookmarks/trellisfw/asn-staging'].map(
      async (path) => {
        trace('ensureAllPathsExist: ensuring we have %s', path);
        try {
          await conn.get({ path });
        } catch (cError: unknown) {
          // @ts-expect-error stupid error handling
          if (cError.status !== 404) {
            error(
              { error: cError },
              `ensureAllPathsExist: Tried to get ${path}, but result was something other than 200 or 404`
            );
            return;
          }

          info(
            'ensureAllPathsExist: Path %s did not exist, doing tree put to create it',
            path
          );
          await conn.put({ path, data: {}, tree });
          return;
        }

        info(
          'ensureAllPathsExist: Path %s exists already, leaving as-is',
          path
        );
      }
    )
  );
}

for await (const token of tokens) {
  try {
    await unfisk(token);
  } catch (cError: unknown) {
    fatal({ error: cError }, `Error running unfisk for token ${token}`);
    // eslint-disable-next-line no-process-exit, unicorn/no-process-exit
    process.exit(1);
  }
}

/**
 * Handle when there is a change to the flat list
 */
async function flatHandler(conn: OADAClient, change: Readonly<Change>) {
  trace({ change }, 'flatHandler: new change received');
  const { type, body } = change;

  // Try to figure out the day from the change
  // @ts-expect-error meta nonsense
  const time = Number(body?._meta?.modified);
  if (!time) {
    warn('failed to process day, using today');
  }

  const day = moment(time ? time * 1000 : undefined).format('YYYY-MM-DD');

  switch (type) {
    case 'merge':
      for (const [id, item] of Object.entries(body ?? {})) {
        if (id.startsWith('_')) {
          // Ignore _ keys
          continue;
        }

        try {
          const done = unflatten({ conn, item, id, day });
          const delay = setTimeout(rateLimit);
          // eslint-disable-next-line no-await-in-loop
          await Promise.all([done, delay]);
          info('Unflattened item %s', id);
        } catch (cError: unknown) {
          error({ error: cError }, `Failed to unflatten ${id}`);
        }
      }

      break;

    case 'delete':
      trace('flatHandler: delete change, ignoring');
      break;

    default:
      warn('Ignoring unknown change type %s to flat list', type);
  }
}

async function unflatten({
  conn,
  item,
  id,
  day,
}: {
  conn: OADAClient;
  item: unknown;
  id: string;
  day: string;
}) {
  trace({ id, item }, 'unflatten: Unflattening item');

  // Link the newly created resource in unflat list
  trace("Putting new resource into asns list under today's day-index");
  await conn.put({
    contentType: 'application/vnd.trellisfw.asns.1+json',
    path: join(unflat, 'day-index', day, id),
    tree: unflatTree,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    data: item as any,
  });

  trace('Deleting original asn-staging...');
  // Remove unflattened item from flat list
  await conn.delete({
    path: `${flat}/${id}`,
  });
}
