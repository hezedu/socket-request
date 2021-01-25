# socket-request
封装和解析数据并通过流传输. 支持 net.Socket 和 WebSocket. 有效解决粘包或分段的问题.
## 安装
`npm install @hezedu/socket-request`
## API
### new SocketRequest(socket, [options])
- `socket` net.Socket实例 或 WebSocket 实例.
- `options`
  - `isCompress` ___boolean___ 是否启用压缩. ***默认*** `false`
  - `compressTriggerPoint` ___number___ 消息体多大才触发压缩, 小于或等于该值将不会压缩. ***默认*** `1460`
  - `deflateFn` ___Function___ `(str)`压缩方法, 需要 return 压缩好的二进制. 需要在 `isCompress` 为 `true` 时提供.
  - `inflateFn` ___Function___ 解压方法, 需要在 `isCompress` 为 `true` 时提供.
    - 同步方法: `(bin)` 需要 return `str`.
    - 异步方法: `(bin, callback)` 仅用于 socket 为 WebSocket 实例时.
      - `bin` 压缩过的二进制
      - `callback` ___Function___ `(str)` 
  - `onReceive` ___Function___ `(msg, reply)`收到消息时触发.
    - `msg` ___any___ 消息
    - `reply` ___Function___ `(msg)` 回复消息.

- Returns: `sr`
### sr.request(msg, callback)
- `msg` ___any___ 可以为多种能被 JSON.stringify 的格式, Object, Array, String, Number, Boolean, null.
- `callback(resMsg)` `resMsg` 为返回的数据, 格式同 `msg`.


## 示例
简单
```js
const net = require('net');
const SocketRequest = require('@hezedu/socket-request');
const client = net.createConnection(40043, function(){
  client.setEncoding('utf-8');
  client.setNoDelay();
  const sr = new SocketRequest(client, {
    onReceive(msg, reply){
      reply('received');
    }
  });

  sr.request('Hello', (resData) => {
    console.log('resData', resData);
  })
}
```
