const net = require('net');
const SocketRequest = require('../index');

const server = net.createServer(function(socket){
  socket.setEncoding('utf-8');
  socket.setNoDelay();
  const sr = new SocketRequest(socket, {
    onReceive(data, reply){
      reply(data);
    }
  });

  socket.on('close', function(hadErr){
    console.log('socket close', hadErr);
  })
})

server.listen(4005);

server.on('listening', function(){
  console.log('server listening on 4005');
})
server.on('error', function(){
  console.log('server error', err.name + ': ' + err.message)
})
