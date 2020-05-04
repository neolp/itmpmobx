import { observable } from 'mobx'
import ITMP from 'itmpws'


class Core {
  constructor() {
    this.connections = new Map()
    this.states = observable.map()
    this.intstates = observable.map()
    //    this.states.set('@state', 0)
  }

  state(url) {
    if (!url.startsWith('itmpws://')) {
      console.error('state unknown schema', url)
      throw new Error('unknown schema')
    }
    const parts = this.splitUrl(url)
    try {
      return this.intstates.get(parts[0]) || 'init'
    } catch (e) {
      return undefined
    }

  }

  getter(url) {
    try {
      return this.states.get(url)
    } catch (e) {
      return undefined
    }

  }
  setter(url, value) {
    try {
      return this.states.set(url, value)
    } catch (e) {
      return undefined
    }

  }
  connect(hostport) {
    let itmp = this.connections.get(hostport) // try to get connection
    if (!itmp) {
      console.log('connect new', hostport)
      itmp = new ITMP({
        uri: "ws://" + hostport + "/ws/",
        binaryType: 'arraybuffer',
        reconnectTimeout: 3000,
        autoReconnect: true,
        reconnectMaxCount: 0,
        onOpen: () => {
          this.intstates.set(hostport, 'online')
        },
        onClose: () => {
          this.intstates.set(hostport, 'offline')
        },
        onError: () => { },
        onReconnect: () => { }
      })
      this.intstates.set(hostport, 'trying')
      itmp.connect()
      this.connections.set(hostport, itmp)
    }

    return itmp
  }

  getvalue(url, opts) {
    if (!url.startsWith('itmpws://')) {
      console.error('subscribe unknown schema', url)
      throw new Error('unknown schema')
    }
    const parts = this.splitUrl(url)
    let itmp = this.connect(parts[0])
    this.states.set(url, undefined)
    console.log('subscribe', url, '=', parts[0], '->', parts[1])

    return itmp.call(parts[1], undefined).then((value) => {
      console.log('got', url, value)
      this.states.set(url, value)
      return value
    })
  }

  subscribe(url, opts, cb) {
    if (!url.startsWith('itmpws://')) {
      console.error('subscribe unknown schema', url)
      throw new Error('unknown schema')
    }
    const parts = this.splitUrl(url)
    let itmp = this.connect(parts[0])
    this.states.set(url, undefined)
    console.log('subscribe', url, '=', parts[0], '->', parts[1])

    return itmp.subscribeOnce(parts[1], (exttopic, value) => {
      this.states.set(url, value)
      if (cb) cb(value, url)
    }, opts).then((res) => {
      console.log('subscribed')
    })
  }

  unsubscribe(url) {
    console.log('UNsubscribe', url)
    if (!url.startsWith('itmpws://'))
      throw new Error('unknown schema')
    const parts = this.splitUrl(url)
    let itmp = this.connect(parts[0])
    return itmp.unsubscribeOnce(parts[1])
  }

  call(url, args) {
    console.log('call', url, args)
    const parts = this.splitUrl(url)
    let itmp = this.connect(parts[0])
    console.log(itmp)
    return itmp.call(parts[1], args)
  }
  emit(url, value) {
    console.log('emit', url, value)
    const parts = this.splitUrl(url)
    let itmp = this.connect(parts[0])
    //    if (parts[1]) parts[1] += '/'

    return itmp.emit(parts[1], value)
  }
  splitUrl(url) {
    //const parts = url.slice(9).split('/', 2)
    let parts
    let sep = url.slice(9).indexOf('/');
    if (sep >= 0) {
      parts = [url.substr(9, sep), url.substr(9 + 1 + sep)]
    } else {
      parts = [url.substr(9), '']
    }
    //console.log('url splitted', url, '->', url.slice(9), '->', JSON.stringify(parts))
    if (!parts[1]) parts[1] = ''
    return parts
  }
}

export default new Core()
