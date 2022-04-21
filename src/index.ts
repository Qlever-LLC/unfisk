/**
 * @license
 * Copyright 2021 Qlever LLC
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

import { setTimeout } from 'node:timers/promises';

import debug from 'debug';
import moment from 'moment';

import { Change, OADAClient, connect } from '@oada/client';

import config from './config';

const info = debug('unfisk:info');
const trace = debug('unfisk:trace');
const warn = debug('unfisk:warn');
const error = debug('unfisk:error');

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

  // Get the initial state of asn-staging, then watch from there
  const { data } = await conn.get({ path: `/bookmarks/trellisfw/asn-staging` });
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Buffer.isBuffer(data)
  ) {
    throw new Error('Flat list is not a JSON resource');
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await conn.watch({
    path: flat,
    // Start where previous request left off, avoids race condition
    rev: data._rev as string | number,
    watchCallback: flatHandler,
  });

  // Make "change" for current state?
  trace('Processing fake change on startup');
  await flatHandler({
    type: 'merge',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    body: data as any,
    path: '',
    resource_id: data._id as string,
  });

  // Run when there is a change to the flat list
  async function flatHandler(change: Readonly<Change>) {
    trace('flatHandler: new change received = ', change);

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
            const done = unflatten({ item, id, day });
            const delay = setTimeout(rateLimit);
            // eslint-disable-next-line no-await-in-loop
            await Promise.all([done, delay]);
          } catch (cError: unknown) {
            error(cError);
          }
        }

        break;

      case 'delete':
        trace('flatHandler: delete change, ignoring');
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
    item: unknown;
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
      tree: unflatTree,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      data: item as any,
    });

    trace('Deleting original asn-staging..');
    // Remove unflattened item from flat list
    await conn.delete({
      path: `${flat}/${id}`,
    });
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
        trace(`ensureAllPathsExist: ensuring we have ${path}`);
        try {
          await conn.get({ path });
        } catch (error_: unknown) {
          // @ts-expect-error stupid error handling
          if (error_.status !== 404) {
            error(
              `ensureAllPathsExist: Tried to get ${path}, but result was something other than 200 or 404: `,
              error_
            );
            return;
          }

          info(
            `ensureAllPathsExist: Path ${path} did not exist, doing tree put to create it`
          );
          await conn.put({ path, data: {}, tree });
          return;
        }

        info(`ensureAllPathsExist: Path ${path} exists already, leaving as-is`);
      }
    )
  );
}

for (const token of tokens) {
  // eslint-disable-next-line github/no-then
  unfisk(token).catch((cError) => {
    error(cError);
    // eslint-disable-next-line no-process-exit, unicorn/no-process-exit
    process.exit(1);
  });
}
