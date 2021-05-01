const _ = require('lodash')
const expect = require('chai').expect
const Promise = require('bluebird')
const debug = require('debug')
const trace = debug('unfisk#test:trace');

// DO NOT include ../ because we are testing externally.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const oada = require('@oada/client');

const asnkey = 'UNFISKTEST_ASN1';
const asnid = `resources/${asnkey}`;
const testasn = require('./testasn');
const headers = { 'content-type': 'application/vnd.trellisfw.asn-staging.sf.1+json' };

let con = false;
describe('External tests of unfisk, run from admin', () => {

    before(async () => {
      con = await oada.connect({ domain: 'proxy', token: 'god-proxy' });
    })

    beforeEach(async () => {
      await cleanup()
    });

    after(async () => await cleanup());

    it('Should move the ASN when put into staging to same key in asns', async function () {
      this.timeout(5000);
      const staging_location = await con.put({ path: `/bookmarks/trellisfw/asn-staging/${asnkey}`, data: testasn, headers }).then(r=>(r.headers ? r.headers['content-location'] : null));
      const postedkey = staging_location.match(/^.*\/([^\/]+)$/)[1]; // last thing on the content-location
      await Promise.delay(500); // give it a second to update the parent
      const exists = await con.get({ path: `/bookmarks/trellisfw/asns/${postedkey}`}).then(r=>r.data).catch(e => (e.status === 404));
      expect(postedkey).to.equal(asnkey);
      expect(exists).to.equal(true);
    });

})

async function cleanup() {

  // delete the thing in asn-staging if it exists
  await con.get({ path: `/bookmarks/trellisfw/asn-staging/${asnkey}` })
  .then(async () => con.delete({ path: `/bookmarks/trellisfw/asn-staging/${asnkey}` })) // delete it
  .catch(e => {} ) // do nothing, didn't exist

  // delete the link in asn-staging if it exists
  await con.get({ path: `/bookmarks/trellisfw/asns/${asnkey}` })
  .then(async () => con.delete({ path: `/bookmarks/trellisfw/asns/${asnkey}` })) // delete it
  .catch(e => {} ) // do nothing, didn't exist

  // delete the resource if it exists
  await con.get({ path: `/${asnid}` })
  .then(async () => con.delete({ path: `/${asnid}` })) // delete it
  .catch(e => {} ) // do nothing, didn't exist

}

