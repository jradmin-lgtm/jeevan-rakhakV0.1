'use strict';
const {isMainThread}=require('node:worker_threads');
// Loader workers do not own the server or its IPC channel.
if(isMainThread){
// Local diagnostic observer only. It preserves the original Socket.IO return values.
const path=require('node:path'),assert=require('node:assert/strict');
assert.equal(process.env.JR_LOCAL_RECONNECT_OBSERVER,'loopback-only');
const target=new URL(process.env.DATABASE_URL);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'5449');assert.match(target.pathname,/^\/jr_reconnect_rca_[a-f0-9]{12}$/);
assert.equal(typeof process.send,'function');
const socketPath=path.resolve(__dirname,'../../services/socket-server/node_modules/socket.io');
const {Socket}=require(socketPath),{Adapter}=require(require.resolve('socket.io-adapter',{paths:[path.dirname(require.resolve(socketPath))]}));
const join=Socket.prototype.join,broadcast=Adapter.prototype.broadcast;
function send(value){if(process.connected)process.send(value);}
Socket.prototype.join=function(rooms){
 const result=join.call(this,rooms);const list=typeof rooms==='string'?[rooms]:rooms;
 for(const room of list)if(room.startsWith('booking:'))Promise.resolve(result).then(()=>send({kind:'joined',at:Date.now(),room,socketId:this.id,userId:this.data.user?.role==='user'?this.data.user.sub:null}));
 return result;
};
Adapter.prototype.broadcast=function(packet,options){
 if(packet.data?.[0]==='driver:location:update'){
  const point=packet.data[1],rooms=[...options.rooms],members=new Set(rooms.flatMap(room=>[...(this.rooms.get(room)??[])]));
  const users=[...members].map(id=>this.nsp.sockets.get(id)).filter(socket=>socket?.data.user?.role==='user').map(socket=>socket.data.user.sub);
  send({kind:'broadcast',at:Date.now(),bookingId:point.bookingId,ts:point.ts,userIds:users});
 }
 return broadcast.call(this,packet,options);
};

}
