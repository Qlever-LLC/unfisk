// TODO: Publish this to npm instead?
/// <reference types="nconf" />
import { Provider } from 'nconf'

import _libConfig from './lib-config'
import config from './config.defaults'

// TODO: How to do this and have TS be happy?
function libConfig (config: Config): Provider {
  return _libConfig(config)
}

const conf = libConfig(config)
export default conf

// Make types for the config
type Config = {
  domain: string,
  token: string,
  flatList: string,
  unflatList: string
}
