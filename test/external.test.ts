/**
 * @license
 * Copyright 2021 Qlever LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import test from 'ava';

import { setTimeout } from 'node:timers/promises';

import { OADAClient, connect } from '@oada/client';

import testasn from './testasn';

// DO NOT include ../ because we are testing externally.

const asnKey = 'UNFISK_TEST_ASN1';
const asnID = `resources/${asnKey}`;

let conn: OADAClient;
test.before(async () => {
  conn = await connect({ domain: 'proxy', token: 'god-proxy' });
});

test.after(async () => {
  await cleanup();
});

test.beforeEach(async () => {
  await cleanup();
});

test('Should move the ASN when put into staging to same key in asns', async (t) => {
  t.timeout(5000);
  const { headers: { 'content-location': stagingLocation } = {} } =
    await conn.put({
      path: `/bookmarks/trellisfw/asn-staging/${asnKey}`,
      contentType: 'application/vnd.trellisfw.asn-staging.sf.1+json',
      data: testasn,
    });
  const postedkey = stagingLocation.match(/^.*\/([^/]+)$/)[1]; // Last thing on the content-location
  await setTimeout(500); // Give it a second to update the parent
  const { data: exists } = await conn.get({
    path: `/bookmarks/trellisfw/asns/${postedkey}`,
  });

  t.is(postedkey, asnKey);
  t.truthy(exists);
});

async function cleanup() {
  // Delete the thing in asn-staging if it exists
  try {
    await conn.get({ path: `/bookmarks/trellisfw/asn-staging/${asnKey}` });
    await conn.delete({ path: `/bookmarks/trellisfw/asn-staging/${asnKey}` });
  } catch {
    // Do nothing, didn't exist
  }

  // Delete the link in asn-staging if it exists
  try {
    await conn.get({ path: `/bookmarks/trellisfw/asns/${asnKey}` });
    await conn.delete({ path: `/bookmarks/trellisfw/asns/${asnKey}` });
  } catch {
    // Do nothing, didn't exist
  }

  // Delete the resource if it exists
  try {
    await conn.get({ path: `/${asnID}` });
    await conn.delete({ path: `/${asnID}` });
  } catch {
    // Do nothing, didn't exist
  }
}
