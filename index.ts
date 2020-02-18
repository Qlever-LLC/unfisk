import debug from 'debug'


import config from './config'

const info = debug('unfisk:info')
const trace = debug('unfisk:trace')
const warn = debug('unfisk:warn')
const error = debug('unfisk:error')

const domain = config.get('domain')

// TODO: Code here
