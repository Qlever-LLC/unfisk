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

import convict from 'convict';
import { config as load } from 'dotenv';

load();

const config = convict({
  oada: {
    domain: {
      doc: 'OADA API domain',
      format: String,
      default: 'http://proxy',
      env: 'DOMAIN',
      arg: 'domain',
    },
    token: {
      doc: 'OADA API token',
      format: Array,
      default: ['god-proxy'],
      env: 'TOKEN',
      arg: 'token',
    },
    // TODO: why does it need to be so long??
    trottle: {
      doc: 'Rate limit of how long to between unflattening items (ms)',
      format: Number,
      default: 100000,
      env: 'UNFLATTEN_RATE',
      arg: 'rate',
    },
  },
  lists: {
    flat: {
      doc: 'Path to the "flat" resource of items',
      format: String,
      default: '/bookmarks/trellisfw/asn-staging',
    },
    unflat: {
      doc: 'Path of OADA list in which to link unflattened items',
      format: String,
      default: '/bookmarks/trellisfw/asns',
    },
    unflatTree: {
      doc: 'OADA tree corresponding to unflat path',
      format: Object,
      default: {
        bookmarks: {
          _type: 'application/vnd.oada.bookmarks.1+json',
          trellisfw: {
            _type: 'application/vnd.trellisfw.1+json',
            documents: {
              _type: 'application/vnd.trellisfw.documents.1+json',
            },
            asns: {
              '_type': 'application/vnd.trellisfw.asns.1+json',
              'day-index': {
                '*': {
                  '_type': 'application/vnd.trellisfw.asns.1+json',
                  '_rev': 0,
                  '*': {
                    _type: 'application/vnd.trellisfw.asn.sf.1+json',
                    _rev: 0,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

/**
 * Error if our options are invalid.
 * Warn if extra options found.
 */
config.validate({ allowed: 'warn' });

export default config;
