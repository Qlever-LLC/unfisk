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

import { expect } from 'chai';

import oada from '@oada/client';

import testasn from './testasn';

// DO NOT include ../ because we are testing externally.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const asnKey = 'UNFISK_TEST_ASN1';
const asnID = `resources/${asnKey}`;
const headers = {
  'content-type': 'application/vnd.trellisfw.asn-staging.sf.1+json',
};

let con = false;
describe('External tests of unfisk, run from admin', () => {
  before(async () => {
    con = await oada.connect({ domain: 'proxy', token: 'god-proxy' });
  });

  beforeEach(async () => {
    await cleanup();
  });

  after(async () => await cleanup());

  it('Should move the ASN when put into staging to same key in asns', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(5000);
    const stagingLocation = await con
      .put({
        path: `/bookmarks/trellisfw/asn-staging/${asnKey}`,
        data: testasn,
        headers,
      })
      .then((r) => (r.headers ? r.headers['content-location'] : null));
    const postedkey = stagingLocation.match(/^.*\/([^/]+)$/)[1]; // Last thing on the content-location
    await Promise.delay(500); // Give it a second to update the parent
    const exists = await con
      .get({ path: `/bookmarks/trellisfw/asns/${postedkey}` })
      .then((r) => r.data)
      .catch((error) => error.status === 404);
    expect(postedkey).to.equal(asnKey);
    expect(exists).to.equal(true);
  });
});

async function cleanup() {
  // Delete the thing in asn-staging if it exists
  try {
    await con.get({ path: `/bookmarks/trellisfw/asn-staging/${asnKey}` });
    await con.delete({ path: `/bookmarks/trellisfw/asn-staging/${asnKey}` });
  } catch {
    // Do nothing, didn't exist
  }

  // Delete the link in asn-staging if it exists
  try {
    await con.get({ path: `/bookmarks/trellisfw/asns/${asnKey}` });
    await con.delete({ path: `/bookmarks/trellisfw/asns/${asnKey}` });
  } catch {
    // Do nothing, didn't exist
  }

  // Delete the resource if it exists
  try {
    await con.get({ path: `/${asnID}` });
    await con.delete({ path: `/${asnID}` });
  } catch {
    // Do nothing, didn't exist
  }
}
