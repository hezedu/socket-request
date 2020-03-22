const net = require('net');
const SocketRequest = require('../index-new');

const server = net.createServer(function(socket){
  socket.setEncoding('utf-8');
  socket.setNoDelay();
  const sr = new SocketRequest(socket);
  sr.onRequest = function(data, reply){
    reply({
      status: 'ok'
    })
  }
})

server.listen(4005);

server.on('listening', function(){
  console.log('server listening on 4005');
})
