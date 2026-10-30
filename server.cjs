'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {Arena}=require('./engine.cjs');
const PROTOCOL=4;
function createGameServer({port=8767,host='0.0.0.0',room,publicGame=false,publicOrigin=null}={}){
 if(publicOrigin){const u=new URL(publicOrigin);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid PUBLIC_ORIGIN');publicOrigin=u.origin;publicGame=true}
 room??=publicGame?'public':crypto.randomBytes(18).toString('hex');
 const game=new Arena(),streams=new Map(),build=crypto.createHash('sha256').update(fs.readFileSync(__filename)).update(fs.readFileSync(path.join(__dirname,'engine.cjs'))).update(fs.readFileSync(path.join(__dirname,'index.html'))).digest('hex').slice(0,20);
 let tickTimer,sendTimer,lastTick=performance.now(),acc=0,foodTick=0,joinTimes=[];
 const origin=()=>publicOrigin||`http://localhost:${server.address().port}`;
 const invite=()=>{const url=origin()+(publicGame?'/':`/?room=${room}`);return{local:url,links:[url]}};
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data))}
 function authorized(req,url){return req.headers['x-room-key']===room||url.searchParams.get('room')===room}
 function owner(req){const p=game.players.get(req.headers['x-player-id']);return p&&p.secret===req.headers['x-player-key']?p:null}
 function body(req){return new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>4096){reject(Error('Слишком большой запрос'));req.destroy()}});req.on('end',()=>{try{const parsed=JSON.parse(data||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();resolve(parsed)}catch{reject(Error('Некорректный запрос'))}});req.on('error',reject)})}
 function personalized(snapshot,p,withFood,reset=false){const s=p.snake,view=p.view||1300;const data={...snapshot,snakes:snapshot.snakes.map(other=>({...other,body:other.id===p.id||other.body.some(([x,y])=>(x-s.x)**2+(y-s.y)**2<(view+200)**2)?other.body:[]}))};
 if(withFood){const next=new Map(),add=[],remove=[];p.foodCache??=new Map();for(const f of game.food){if((f.x-s.x)**2+(f.y-s.y)**2>view**2)continue;const item=[f.id,Math.round(f.x*10)/10,Math.round(f.y*10)/10,Math.round(f.r*10)/10,f.v,f.c],key=item.slice(1).join(',');next.set(f.id,key);if(reset||p.foodCache.get(f.id)!==key)add.push(item)}if(!reset)for(const id of p.foodCache.keys())if(!next.has(id))remove.push(id);p.foodCache=next;data.foodPatch={reset,add,remove}}
 return data}
 function send(entry,data){if(entry.res.destroyed)return;const text='data: '+JSON.stringify(data)+'\n\n';if(entry.gzip){entry.gzip.write(text);entry.gzip.flush(zlib.constants.Z_SYNC_FLUSH)}else entry.res.write(text)}
 function closePlayer(id){const entry=streams.get(id);streams.delete(id);if(entry){entry.gzip?.end();entry.res.end()}game.leave(id)}
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 const expectedOrigin=publicOrigin||`http://${req.headers.host}`;
 if(req.headers.origin&&req.headers.origin!==expectedOrigin)return json(res,403,{error:'Открой игру по ссылке этого сервера.'});
 if(url.pathname==='/healthz'&&req.method==='GET')return json(res,200,{status:'ok',protocol:PROTOCOL});
 if(url.pathname==='/api/info'&&req.method==='GET'&&(publicGame||authorized(req,url)))return json(res,200,{lan:true,public:publicGame,room,protocol:PROTOCOL,build,...invite(),players:game.players.size});
 if(url.pathname.startsWith('/api/')){
 if(!authorized(req,url))return json(res,403,{error:'Открой ссылку комнаты заново.'});
 if(url.pathname==='/api/join'&&req.method==='POST'){const data=await body(req);let p=owner(req);if(p){p.lastSeen=Date.now();if(!p.snake.alive)game.respawn(p)}else{const now=Date.now();joinTimes=joinTimes.filter(t=>now-t<10000);if(joinTimes.length>=60)return json(res,429,{error:'Слишком много подключений. Попробуй через несколько секунд.'});joinTimes.push(now);p=game.join(data.name,data.color)}return json(res,200,{id:p.id,key:p.secret,...invite()})}
 if(url.pathname==='/api/events'&&req.method==='GET'){
 const p=game.players.get(url.searchParams.get('id'));if(!p||p.secret!==url.searchParams.get('key'))return json(res,401,{error:'Войди на арену заново.'});
 const previous=streams.get(p.id);if(previous){previous.gzip?.end();previous.res.end()}p.connected=true;p.lastSeen=Date.now();p.snake.immune=Math.max(p.snake.immune,1.5);p.foodCache=new Map();
 const compressed=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer','Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});const entry={res,gzip:compressed?zlib.createGzip({level:3}):null};if(entry.gzip){entry.gzip.on('error',()=>res.destroy());entry.gzip.pipe(res)}streams.set(p.id,entry);send(entry,personalized(game.snapshot(false),p,true,true));res.on('error',()=>res.destroy());res.on('close',()=>{entry.gzip?.destroy();if(streams.get(p.id)===entry){streams.delete(p.id);p.connected=false;p.boost=false;p.foodCache.clear()}});return;
 }
 const p=owner(req);if(!p)return json(res,401,{error:'Войди на арену заново.'});
 if(url.pathname==='/api/input'&&req.method==='POST'){const data=await body(req);if(typeof data.view==='number'&&Number.isFinite(data.view))p.view=Math.max(650,Math.min(1800,data.view));game.input(p,data);return json(res,200,{ok:true})}
 if(url.pathname==='/api/respawn'&&req.method==='POST'){game.respawn(p);p.lastSeen=Date.now();return json(res,200,{ok:true})}
 if(url.pathname==='/api/leave'&&req.method==='POST'){closePlayer(p.id);return json(res,200,{ok:true})}
 return json(res,404,{error:'Не найдено'});
 }
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Метод не поддерживается'});
 if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end()}
 if(!['/','/index.html'].includes(url.pathname))return json(res,404,{error:'Не найдено'});
 const html=fs.readFileSync(path.join(__dirname,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:html);
 }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.end()}});
 server.requestTimeout=10000;server.headersTimeout=12000;
 function start(){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);lastTick=performance.now();tickTimer=setInterval(()=>{const now=performance.now();acc+=Math.min((now-lastTick)/1000,.25);lastTick=now;let count=0;while(acc>=1/60&&count++<15){game.step();acc-=1/60}for(const[id,p]of game.players)if(Date.now()-p.lastSeen>20000)closePlayer(id)},1000/60);sendTimer=setInterval(()=>{if(!streams.size)return;const withFood=foodTick++%4===0,snapshot=game.snapshot(false);for(const[id,entry]of streams){const p=game.players.get(id);if(!p)continue;if(entry.res.writableLength+(entry.gzip?.writableLength||0)>512*1024){entry.res.destroy();continue}send(entry,personalized(snapshot,p,withFood))}},1000/20);resolve(invite())})})}
 async function stop(){clearInterval(tickTimer);clearInterval(sendTimer);for(const entry of streams.values()){entry.gzip?.end();entry.res.end()}streams.clear();if(server.listening)await new Promise(r=>server.close(r))}
 return{server,game,start,stop,invite,personalized};
}
if(require.main===module){const port=Number(process.env.PORT||8767);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');const app=createGameServer({port,publicGame:true,publicOrigin:process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||null});app.start().then(info=>console.log('Neon Coil online: '+info.local)).catch(e=>{console.error(e.message);process.exitCode=1});let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await app.stop();process.exit(0)})}
module.exports={createGameServer,PROTOCOL};
