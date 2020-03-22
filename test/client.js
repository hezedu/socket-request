const net = require('net');
const SocketRequest = require('../index-new');
const client = net.createConnection(4005, function(){
  client.setEncoding('utf-8');
  client.setNoDelay();
  const sr = new SocketRequest(client);
  function loop(){
    sr.request({
      method: 'hello'
    }, (resData) => {
      console.log('resData', resData);
      setTimeout(() => {
        loop();
      }, 1000)
    })
  }
  loop();
})