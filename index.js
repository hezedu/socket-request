// data format: https://developer.mozilla.org/zh-CN/docs/Server-sent_events/Using_server-sent_events
// only Support 'id', 'data'.

const dataSpliter = '\n\n';
const kvSpliter = ': ';
const lineSpliter = '\n';
const replyIdMark = 'r_';
const MAX_LEN = 50000;
const defCompressTriggerPoint = 16 * 1024;
function _warpLine(k, v){
  return k + kvSpliter + v + lineSpliter;
}
function noop(){}
function SocketRequest(socket, opt){
  opt = opt || Object.create(null);
  this.isCompress = opt.isCompress;
  if(this.isCompress){
    this.compressTriggerPoint = opt.compressTriggerPoint === undefined ? defCompressTriggerPoint : opt.compressTriggerPoint;
    this.deflateFn = opt.deflateFn;
    this.inflateFn = opt.inflateFn;
    if(opt.isWs && this.isCompress){
      this.isInfateAsync = this.inflateFn.length > 1;
      if(this.isInfateAsync){
        this.receiveProcess = [];
        this.isLoop = false;
      }
    }
  }

  this.opt = opt;
  this.cbMap = Object.create(null);
  this.socket = socket;
  this.receiveData = '';
  this.onReceive = noop;
  this.timeout = 10000;
  this.id = 0;
  this.onRequest = null;
  if(opt.isWs){
    // socket is ws;
    socket.addEventListener('message', (e) => {
      if(this.isInfateAsync){
        this.receiveHandleAsync(e.data);
      } else {
        this.receiveHandle(e.data);
      }
      
    });
    socket.addEventListener('error', (err) => {
      this.errorHandle(err);
    });
    this._write = function(data){
      socket.send(data);
    }
    this.end = function(msg){
      socket.close(1011, msg);
    }
  } else {
    socket.on('data', (strData) => {
      this.receiveHandle(strData);
    });
    socket.on('error', (err) => {
      this.errorHandle(err);
    });
    this._write = function(data){
      socket.write(data);
    }
    this.end = function(data){
      socket.end(data);
    }
  }
}
SocketRequest.prototype.write = function(data){
  if(this.isCompress && data.length > this.compressTriggerPoint){
    this._write(this.deflateFn(data));
  } else {
    this._write(data);
  }
}
SocketRequest.prototype.receiveHandle = function(data){
  let strData = data;
  if(typeof strData !== 'string' && this.isCompress){
    strData = this.inflateFn(data);
  }
  if(typeof strData !== 'string'){
    this.end('Data is not string.');
    return;
  }
  this.receiveData = this.receiveData + strData;
  this._receiveEmit();
}
// for ws
SocketRequest.prototype.receiveHandleAsync = function(data){
  let strData = data;
  if(typeof data !== 'string'){
    this.receiveProcess.push((cb) => {
      this.inflateFn(data, cb);
    });
  } else {
    this.receiveProcess.push(data);
  }
  if(this.isLoop){
    return;
  }
  this.isLoop = true;
  this.receiveAsyncLoop();
}
SocketRequest.prototype.receiveAsyncLoop = function(){
  let data = this.receiveProcess.shift();
  if(typeof data === 'string'){
    this.receiveHandle(data);
    if(this.receiveProcess.length === 0){
      this.isLoop = false;
      return;
    }
    this.receiveAsyncLoop();
  } else {
    data((strData) => {
      this.receiveHandle(strData);
      if(this.receiveProcess.length === 0){
        this.isLoop = false;
        return;
      }
      this.receiveAsyncLoop();
    })
  }
}

SocketRequest.prototype.errorHandle = function(err){
  console.error(err);
  this.cbMap = Object.create(null);
  this._receiveEmit = noop;
  this.receiveData = '';
}

SocketRequest.prototype.genId = function(){
  this.id = this.id + 1;
  return this.id;
}
SocketRequest.prototype.clearCb = function(id){
  delete(this.cbMap[id]);
}
SocketRequest.prototype.triggerCb = function(id, data){
  
  //_console.log('triggerCb:', id, this.cbMap[id]);
  //_console.log(data);
  //_console.log('\n');
  const cb = this.cbMap[id];
  if(cb){
    cb(data);
    this.clearCb(id);
  }
}

SocketRequest.prototype.request = function(obj, callback){
  const id = this.genId();
  let data =  _wrapMsg(id, obj);
  //_console.log('request: ');
  //_console.log(data);
  this.write(data);
  if(callback){
    let timer = setTimeout(() => {
      this.triggerCb(id, {
        status: 'error',
        message: 'timeout'
      });
    }, this.timeout);

    this.cbMap[id] = (result) => {
      clearTimeout(timer);
      callback(result);
    };
  }
}


SocketRequest.prototype._receiveEmit = function(){
  let i = this.receiveData.indexOf(dataSpliter);
  if(i !== -1){
    // 分离连一起的数据。
    let data = this.receiveData.substr(0, i);
    this.receiveData = this.receiveData.substr(i + dataSpliter.length);

    data = parseServerSendData(data);
    
    if(data.id && data.data){
      if(this.receiveData){
        this._receiveEmit();
      }
      const realData = JSON.parse(data.data);
      const replyIndex = data.id.indexOf(replyIdMark);
      if(replyIndex !== -1){
        const cbId = data.id.substr(replyIndex + replyIdMark.length);
        this.triggerCb(cbId, realData);
      } else {
        if(this.onRequest){
          if(this.onRequest.length > 1){
            this.onRequest(realData, (replyData) => {
              let wrapedData = _wrapMsg(replyIdMark + data.id, replyData);
              //_console.log('reply: ');
              //_console.log(wrapedData);
              this.write(wrapedData);
            });
          } else {
            this.onRequest(realData);
          }

        }
      }
      return;
    } else {
      this.end('receive invalid Server-Send data.');
    }
  } else {
    if(data.indexOf('id' + kvSpliter) !== 0){
      this.end('receive invalid Server-Send data.');
      return;
    }
    if(this.receiveData.length > MAX_LEN){ 
      this.receiveData = '';
      this.end('Received data too large.');
    }
  }
  
}

function _wrapMsg(id, obj){
  let data =  _warpLine('id', id);
  data = data + _warpLine('data', JSON.stringify(obj));
  data = data + '\n';
  return data;
}

function parseServerSendData(str){
  const arr = str.split(lineSpliter);
  const result = Object.create(null);
  let i, key, value;
  arr.forEach(v => {
    i = v.indexOf(kvSpliter);
    if(i !== -1){
      key = v.substr(0, i);
      value = v.substr(i + kvSpliter.length);
      result[key] = value;
    }
  });
  return result;
}

module.exports = SocketRequest;
