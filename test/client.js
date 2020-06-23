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
const client = net.createConnection(40043, function(){
  client.setEncoding('utf-8');
  client.setNoDelay();
  
  // client.on('data', function(data){
  //   console.log(data)
  // })
  // client.write('hello')

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

let error;
client.on('error', function(err){
  error = err;
});

client.on('close', function(hadErr){
  console.error('hadErr', hadErr, error)
})