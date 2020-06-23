const net = require('net');
const SocketRequest = require('../index');

const server = net.createServer(function(socket){
  socket.setEncoding('utf-8');
  socket.setNoDelay();
  const sr = new SocketRequest(socket);
  sr.onRequest = function(data, reply){
    reply(data)
  }
  // socket.on('data', function(hello){
  //   socket.write(hello + ' world')
  // })
  // socket.on('error', function(err){
  //   console.log('socket error', err.name + ': ' + err.message);
  //   // socket.destroy()
  // })
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
