// data format: https://developer.mozilla.org/zh-CN/docs/Server-sent_events/Using_server-sent_events
// only Support 'id', 'data'.

const dataSpliter = '\n\n';
const kvSpliter = ': ';
const lineSpliter = '\n';
const replyIdMark = 'r_';
const MAX_LEN = 50000;
function _warpLine(k, v){
  return k + kvSpliter + v + lineSpliter;
}
function noop(){}
function SocketRequest(socket, isWs){
  this.cbMap = Object.create(null);
  this.socket = socket;
  this.receiveData = '';
  this.onReceive = noop;
  this.timeout = 10000;
  this.id = 0;
  this.onRequest = null;
  if(isWs){
    // socket is ws;
    socket.addEventListener('message', (e) => {
      this.receiveHandle(e.data);
    });
    socket.addEventListener('error', (err) => {
      this.errorHandle(err);
    });
    this.write = function(data){
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
    this.write = function(data){
      socket.write(data);
    }
    this.end = function(data){
      socket.end(data);
    }
  }
}
SocketRequest.prototype.receiveHandle = function(strData){
  this.receiveData = this.receiveData + strData;
  this._receiveEmit();
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
          this.onRequest(realData, (replyData) => {
            let wrapedData = _wrapMsg(replyIdMark + data.id, replyData);
            //_console.log('reply: ');
            //_console.log(wrapedData);
            this.write(wrapedData);
          });
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
