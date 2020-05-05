import {
  observable, onBecomeObserved,
  onBecomeUnobserved
} from 'mobx'
import ITMP from 'itmpws'

function insersorted(array, element, compare) {
  let high = array.length - 1,
    low = 0,
    pos = -1,
    index,
    ordering;

  // The array is sorted. You must find the position of new element in O(log(n)), not O(n).
  while (high >= low) {
    index = (high + low) / 2 >>> 0;
    ordering = compare(array[index], element);
    if (ordering < 0) low = index + 1;
    else if (ordering > 0) high = index - 1;
    else {
      pos = index;
      break;
    };
  }

  if (pos === -1) {
    // if element was not found, high < low.
    pos = high;
  } else {
    return // do not inser copy
  }
  // This assures that equal elements inserted after will be in a higher position in array.
  // They can be equal for comparison purposes, but different objects with different data.
  // Respecting the chronological order can be important for many applications.
  pos++;
  high = array.length - 1;
  while ((pos < high) && (compare(element, array[pos]) === 0)) {
    pos++;
  }
  /*  index = array.length;
    // Just to increase array size.
    array.push(element);
    // Much faster. No need to elements swap.
    while (index > pos) {
      array[index] = array[--index];
    }
    // Set the new element on its correct position.
    array[pos] = element;*/
  array.splice(pos, 0, element)

  return this;
}

class Core {
  constructor(suburl = '/ws/') {
    this.suburl = suburl
    this.connections = new Map()
    this.states = observable.map()
    this.statesobservers = new Map()
    this.intstates = observable.map()
    //    this.states.set('@state', 0)
  }

  manualsubscribe(url) {
    console.log('protect', url)
    this.statesobservers.set(url, true) // fake observer

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
    if (url.startsWith('itmpws://') && !this.statesobservers.has(url)) {
      console.log('auto subscribe', url)
      this.subscribe(url)
      if (!this.states.has(url))
        this.states.set(url, undefined)
      let rem = onBecomeUnobserved(this.states, url, () => {
        this.statesobservers.get(url)() //disconnect hook
        this.statesobservers.delete(url)
        this.states.delete(url)
        this.unsubscribe(url)
        console.log('auto unsubscribe', url)
      })
      this.statesobservers.set(url, rem)
    }
    try {
      //      if (url.endsWith('#history'))
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
        uri: "ws://" + hostport + this.suburl,
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
    // console.log('get value', url, '=', parts[0], '->', parts[1])

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
    if (typeof opts === 'object' && opts.limit) {
      this.states.set(url, observable.array())
      console.log('subscribe hist', url)

      return itmp.subscribeOnce(parts[1], (exttopic, value, vopts) => {
        vopts.v = value
        let arr = this.states.get(url)
        insersorted(arr, vopts, (a, b) => {
          if (a.t < b.t) return -1
          if (a.t > b.t) return 1
          return 0
        })
        if (arr.length > opts.limit) arr.splice(0, 1)
        //this.states.get(url).set(opts.t, value)
        if (cb) cb(value, url)
      }, opts).then((res) => {
        console.log('subscribed hist ok', url)
      })
    } else {
      this.states.set(url, undefined)
      // console.log('subscribe', url, '=', parts[0], '->', parts[1])

      return itmp.subscribeOnce(parts[1], (exttopic, value) => {
        this.states.set(url, value)
        if (cb) cb(value, url)
      }, opts).then((res) => {
        console.log('subscribed')
      })
    }
  }

  unsubscribe(url) {
    // console.log('UNsubscribe', url)
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
