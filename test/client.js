const net = require('net');
const SocketRequest = require('../index');

const objMsg = {
  hello: true,
  world: true
}
const arrMsg = ['hello', 'world'];
const strMsg = 'hello wrold';
const numMsg = 123;
const boolMsg = true;
const nullMsg = null;
const msgs = [objMsg,
  arrMsg,
  strMsg,
  numMsg,
  boolMsg,
  nullMsg
]
const client = net.createConnection(4005, function(){
  client.setEncoding('utf-8');
  client.setNoDelay();
  const sr = new SocketRequest(client);

  function loop(i){
    if(!msgs[i]){
      return;
    }
    sr.request(msgs[i], (resData) => {
      console.log('resData', resData);
      loop(i + 1);
    })
  }
  loop(0);
})