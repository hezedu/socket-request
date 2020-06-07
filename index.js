// data format: https://developer.mozilla.org/zh-CN/docs/Server-sent_events/Using_server-sent_events
// only Support 'id', 'data'.
// https://tools.ietf.org/html/rfc894 46
// id type data\n, 
// 9,1,"1_1"\n


function noop(){};

const dataSpliter = '\n';
const dataSpliterLen = dataSpliter.length;
const replyIdMark = 'r';
const replayIdMarkLen = replyIdMark.length;
const kvSpliter = ',';
const kvSpliterLen = kvSpliter.length;

const MAX_LEN = 50000;
const defCompressTriggerPoint = 1460; // https://www.imperva.com/blog/mtu-mss-explained/

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
  this.recycleIndex = new RecycleIndex();
  this.onRequest = null;
  this.langRequestTimer = null;
  this.langRequesTimeout = 10000;
  this.isEnd = false;
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
    socket.addEventListener('close', () => {
      this.isEnd = true;
      this.clear();
    });
    this._write = function(data){
      socket.send(data);
    }
    this.end = (msg) => {
      if(this.isEnd){
        return;
      }
      this.isEnd = true;
      socket.close(1011, msg);
    }
  } else {
    socket.on('data', (strData) => {
      this.receiveHandle(strData);
    });
    socket.on('error', (err) => {
      this.errorHandle(err);
    });
    socket.on('close', () => {
      this.isEnd = true;
      this.clear();
    });
    this._write = function(data){
      socket.write(data);
    }
    this.end = (errMsg) => {
      if(this.isEnd){
        return;
      }
      this.isEnd = true;
      this._write(wrapMsg('', false, ['srError', errMsg]));
      socket.end();
    }
  }
}
SocketRequest.prototype.getId = function(){
  return this.recycleIndex.get();
}

SocketRequest.prototype.recycleId = function(id){
  this.recycleIndex.recycle(id);
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
  // this.cbMap = Object.create(null);
  // this._receiveEmit = noop;
  // this.receiveData = '';
}

// SocketRequest.prototype.genId = function(){
//   this.id = this.id + 1;
//   return this.id;
// }

SocketRequest.prototype.triggerCb = function(id, data){
  const info = this.cbMap[id];
  if(info){
    delete(this.cbMap[id]);
    this.recycleId(id);
    clearTimeout(info.timer);
    info.callback(data);
  }
}

SocketRequest.prototype.request = function(obj, callback){
  let id;
  if(callback){
    id = this.getId();
    let timer = setTimeout(() => {
      this.triggerCb(id, {
        status: 'error',
        message: 'timeout'
      });
    }, this.timeout);

    this.cbMap[id] = {
      timer,
      callback
    };

  } else {
    id = '';
  }
  this.write(wrapMsg(id, false, obj));
}


SocketRequest.prototype._receiveEmit = function(){
  let i = this.receiveData.indexOf(dataSpliter);
  if(i !== -1){
    // 分离连一起的数据。
    if(this.langRequestTimer){
      clearTimeout(this.langRequestTimer);
      this.langRequestTimer = null;
    }
    let data = this.receiveData.substr(0, i);
    this.receiveData = this.receiveData.substr(i + dataSpliterLen);
    try {
      data = parse(data);
    } catch(e){
      this.end('socket-request parse error: ' + e.message);
      return;
    }

    if(data.isReply){
      this.triggerCb(data.id, data.data);
    } else {
      if(this.onRequest){
        // if(this.onRequest.length === 1){
        //   this.onRequest(data.data);
        // } else {
          this.onRequest(data.data, (replyData) => {
            let wrapedData = wrapMsg(data.id, true, replyData);
            this.write(wrapedData);
          });
        // }
      }
    }

    if(this.receiveData){
      this._receiveEmit();
    }
  } else {
    this.handleLangRequest();
  }
  
}
SocketRequest.prototype.clear = function(){
  if(this.langRequestTimer){
    clearTimeout(this.langRequestTimer);
  }
  const map = this.cbMap;
  for(let i in map){
    clearTimeout(map[i].timer);
    delete(map[i]);
  }
  this.receiveData = '';
  this._receiveEmit = noop;
  this._write = noop;
}
SocketRequest.prototype.handleLangRequest = function(){
  if(this.receiveData.length > MAX_LEN){ 
    this.receiveData = '';
    this.end('Received data too large.');
  }
  if(this.langRequestTimer){
    return;
  }
  this.langRequestTimer = setTimeout(() => {
    this.receiveData = '';
    this.end('Receive data too time lang.');
  }, this.langRequesTimeout);
}

function wrapMsg(_id, isReply, data){
  let id = _id;
  let dataStr = JSON.stringify(data);
  if(dataStr[0] === '['){
    // [v,v,...]
    dataStr = dataStr.substr(1);
    // v,v,...]
    dataStr = dataStr.substr(0, dataStr.length -1);
    // v,v,...
  }
  if(!id){
    id = '';
  } else {
    if(isReply){
      id = replyIdMark + id;
    }
  }
  return id + kvSpliter + dataStr + dataSpliter;
}

function parse(str){
  let id, isReply = false, data;
  const i = str.indexOf(kvSpliter);
  if(i === 0){
    id = null;
  }else if(i === -1){
    throw new Error('not have kvSpliter: " ' + kvSpliter + ' "');
  } else {
    id = str.substr(0, i);
    if(id[0] === replyIdMark) {
      isReply = true;
      id = id.substr(replayIdMarkLen);
    }
    id = Number(id);
    if(!id){
      throw new Error('id is not number');
    }
  }
  data = str.substr(i + kvSpliterLen);
  if(data[0] !== '{'){
    data = '[' + data + ']';
  }
  data = JSON.parse(data);
  return {
    id,
    isReply,
    data
  }
}

// function verifyStart(str){
//   if(str[0] )
// }
SocketRequest.wrapUnreplyMsg = function(data){
  return wrapMsg('', false, data);
}
SocketRequest.compressTriggerPoint = defCompressTriggerPoint;

// RecycleIndex copyright: https://github.com/hezedu/SomethingBoring/blob/master/algorithm/recycle-index.js 2020/03/21
function RecycleIndex(){
  this.index = 0;
  this.pool = [];
}
RecycleIndex.prototype.get = function(){
  if(this.pool.length){
    return this.pool.pop();
  }
  this.index = this.index + 1;
  return this.index;
}
RecycleIndex.prototype.recycle = function(index){
  this.pool.push(index);
  if(this.pool.length === this.index){
    this.pool = [];
    this.index = 0;
  }
}

module.exports = SocketRequest;
