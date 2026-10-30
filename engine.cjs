/* Shared by the browser and the authoritative LAN server. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NeonEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const cryptoApi=typeof require==='function'?require('node:crypto'):globalThis.crypto;
function randomId(bytes=12){if(cryptoApi?.randomBytes)return cryptoApi.randomBytes(bytes).toString('hex');const data=new Uint8Array(bytes);if(cryptoApi?.getRandomValues)cryptoApi.getRandomValues(data);else for(let i=0;i<bytes;i++)data[i]=Math.random()*256|0;return Array.from(data,n=>n.toString(16).padStart(2,'0')).join('')}
const COLORS=['#a6ffca','#8bc9ff','#d0a6ff','#ffb48b','#ff8dab'];
const NAMES=['Лунный уж','Крендель','Пиксель','Мята','Орбита','Комета','Спираль','Лайм','Кобра','Виток','Искра','Шнурок'];
const R=2100,BASE=100,FOOD_COUNT=1700,BOOST_COST=8.5,ZONE_MIN=350,WARMUP=20,SHRINK_TIME=300,FINAL_TIME=20,ROUND_TIME=WARMUP+SHRINK_TIME+FINAL_TIME;
const rand=(a,b)=>a+Math.random()*(b-a),distance=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const point=(r=R-100)=>{const a=rand(0,Math.PI*2),d=Math.sqrt(Math.random())*Math.max(1,r);return{x:Math.cos(a)*d,y:Math.sin(a)*d}};
const radius=s=>10+Math.min(8,s.mass/250),round=n=>Math.round(n*10)/10;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function zoneAt(elapsed){const progress=Math.max(0,Math.min(1,(elapsed-WARMUP)/SHRINK_TIME));return{radius:R-(R-ZONE_MIN)*progress,phase:elapsed<WARMUP?'warmup':progress<1?'shrinking':'final',remaining:Math.max(0,(elapsed<WARMUP?WARMUP:progress<1?WARMUP+SHRINK_TIME:ROUND_TIME)-elapsed)}}
class Grid{
 constructor(size=80){this.size=size;this.cells=new Map()}
 add(x,y,value){const key=Math.floor(x/this.size)+','+Math.floor(y/this.size);let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(value)}
 *near(x,y,r){for(let ix=Math.floor((x-r)/this.size);ix<=Math.floor((x+r)/this.size);ix++)for(let iy=Math.floor((y-r)/this.size);iy<=Math.floor((y+r)/this.size);iy++){const cell=this.cells.get(ix+','+iy);if(cell)yield*cell}}
}
class Arena{
 constructor({botCount=6}={}){this.botCount=botCount;this.players=new Map();this.snakes=[];this.food=[];this.tick=0;this.round=1;this.elapsed=0;this.zone=zoneAt(0);this.foodVersion=0;this.resetWorld()}
 resetWorld(){this.snakes=[];this.food=[];for(let i=0;i<this.botCount;i++)this.snakes.push(this.spawn('bot-'+i,NAMES[i%NAMES.length],COLORS[i%COLORS.length],true));for(const p of this.players.values()){p.snake=this.spawn(p.id,p.snake.name,p.snake.color);this.snakes.push(p.snake);p.angle=p.snake.angle;p.boost=false}for(let i=0;i<FOOD_COUNT;i++)this.addFood(i<240?point(650):point())}
 resetRound(){this.round++;this.elapsed=0;this.zone=zoneAt(0);this.resetWorld()}
 spawn(id,name,color,bot=false){let p,best,bestDistance=-1;const safe=Math.max(80,this.zone.radius-100);for(let k=0;k<90;k++){p=point(bot?safe:Math.min(safe,900));let clearance=Infinity;for(const s of this.snakes){if(!s.alive)continue;for(let j=0;j<s.body.length;j+=6)clearance=Math.min(clearance,distance(s.body[j],p))}if(clearance>bestDistance){best=p;bestDistance=clearance}if(clearance>230**2)break;p=best}const angle=rand(-Math.PI,Math.PI),mass=bot?rand(140,400):BASE;return{id,name,color,bot,...p,angle,mass,health:100,alive:true,boosting:false,immune:3,body:Array.from({length:Math.ceil((92+mass)/3)},(_,i)=>({x:p.x-Math.cos(angle)*i*3,y:p.y-Math.sin(angle)*i*3})),target:point(),ai:0,boostUntil:0,cooldown:0,aggression:rand(.45,.85),intent:'forage',reason:''}}
 addFood(p=point(Math.max(20,this.zone.radius-30)),value=1,color=COLORS[Math.random()*5|0]){if(Math.hypot(p.x,p.y)>this.zone.radius-8)return;this.food.push({...p,v:value,c:color,r:value>1?4.5:rand(2,3.6),id:randomId(5),phase:rand(0,6.28)});this.foodVersion++}
 join(name,color){const id=randomId(10),secret=randomId(24);const s=this.spawn(id,(typeof name==='string'?name.trim().slice(0,16):'')||'Игрок',COLORS.includes(color)?color:COLORS[0]);this.snakes.push(s);const p={id,secret,snake:s,angle:s.angle,boost:false,lastSeen:Date.now(),connected:false};this.players.set(id,p);return p}
 respawn(p){if(p.snake.alive)return;const old=p.snake,s=this.spawn(p.id,old.name,old.color);this.snakes=this.snakes.filter(s=>s!==old);this.snakes.push(s);p.snake=s;p.angle=s.angle;p.boost=false}
 leave(id){this.players.delete(id);this.snakes=this.snakes.filter(s=>s.id!==id);if(this.players.size===0)this.resetRound()}
 input(p,data){if(typeof data.angle==='number'&&Number.isFinite(data.angle))p.angle=Math.atan2(Math.sin(data.angle),Math.cos(data.angle));p.boost=data.boost===true;p.lastSeen=Date.now()}
 get ready(){return[...this.players.values()].some(p=>p.connected)}
 active(s){return s.alive&&(s.bot||this.players.get(s.id)?.connected)}
 kill(s,reason){if(!s.alive)return;s.alive=false;s.reason=reason;s.boosting=false;for(let i=0;i<s.body.length;i+=3)this.addFood(s.body[i],3,s.color)}
 bodyGrid(){const grid=new Grid();for(const s of this.snakes){if(!this.active(s))continue;for(let j=0;j<s.body.length;j+=2){const b=s.body[j];grid.add(b.x,b.y,{x:b.x,y:b.y,s,j})}}return grid}
 botDecision(s,grid,dt){s.ai-=dt;s.cooldown=Math.max(0,s.cooldown-dt);s.boostUntil=Math.max(0,s.boostUntil-dt);if(s.ai<=0){s.ai=rand(.16,.36);let goal,nearest=Infinity;
 for(let j=0;j<this.food.length;j+=4){const f=this.food[j],d=distance(s,f)/(f.v>1?2.5:1);if(d<nearest){nearest=d;goal=f}}goal=goal||point(this.zone.radius*.65);const oldIntent=s.intent;s.intent='forage';
 let prey,preyDistance=550**2;for(const other of this.snakes){if(other===s||!this.active(other)||other.immune>0)continue;const d=distance(s,other)*(other.bot?1.15:1);if(d>110**2&&d<preyDistance){preyDistance=d;prey=other}}
 if(prey&&(Math.random()<s.aggression||oldIntent==='hunt')){const lead=Math.min(125,Math.sqrt(preyDistance)*.35);const side=s.id.charCodeAt(s.id.length-1)%2?1:-1;goal={x:prey.x+Math.cos(prey.angle)*lead-Math.sin(prey.angle)*side*40,y:prey.y+Math.sin(prey.angle)*lead+Math.cos(prey.angle)*side*40};s.intent='hunt'}
 const edge=Math.hypot(s.x,s.y)>this.zone.radius-Math.min(170,this.zone.radius*.3);if(edge){goal={x:s.x*.3,y:s.y*.3};s.intent='zone'}
 const probe={x:s.x+Math.cos(s.angle)*80,y:s.y+Math.sin(s.angle)*80};let ax=0,ay=0,danger=false;
 for(const b of grid.near(probe.x,probe.y,125)){if(b.s===s||b.s.immune>0)continue;const d=distance(probe,b);if(d<110**2){const w=(1-Math.sqrt(d)/110)*2;ax+=(probe.x-b.x)*w;ay+=(probe.y-b.y)*w;danger=true}}
 if(danger){const len=Math.hypot(ax,ay)||1;goal={x:s.x+ax/len*180,y:s.y+ay/len*180};s.intent='evade'}
 s.target=goal;const desired=Math.atan2(goal.y-s.y,goal.x-s.x),aligned=Math.abs(angleDelta(desired,s.angle))<.55;
 const worthBoost=s.intent==='hunt'||s.intent==='evade'||s.intent==='zone'||goal.v>1;
 if(aligned&&worthBoost&&s.mass>135&&s.cooldown===0){s.boostUntil=rand(.35,.8);s.cooldown=rand(1.2,2.4)}
 }
 s.boosting=s.boostUntil>0&&s.mass>BASE+4&&Math.abs(angleDelta(Math.atan2(s.target.y-s.y,s.target.x-s.x),s.angle))<.8;
 return Math.atan2(s.target.y-s.y,s.target.x-s.x)
 }
 step(dt=1/60){this.tick++;if(!this.ready)return;this.elapsed+=dt;if(this.elapsed>=ROUND_TIME)this.resetRound();this.zone=zoneAt(this.elapsed);const now=Date.now(),before=this.bodyGrid();
 for(const s of this.snakes){if(!this.active(s))continue;s.immune=Math.max(0,s.immune-dt);let target=s.angle;if(s.bot)target=this.botDecision(s,before,dt);else{const p=this.players.get(s.id);target=p.angle;s.boosting=p.boost&&now-p.lastSeen<1500&&s.mass>BASE+4}
 const delta=angleDelta(target,s.angle),limit=(s.boosting?2.7:3.2)*dt;s.angle+=Math.max(-limit,Math.min(limit,delta));const prev={x:s.x,y:s.y},speed=s.boosting?300:170;s.x+=Math.cos(s.angle)*speed*dt;s.y+=Math.sin(s.angle)*speed*dt;
 const n=Math.ceil(speed*dt/3);for(let j=1;j<=n;j++)s.body.unshift({x:prev.x+(s.x-prev.x)*j/n,y:prev.y+(s.y-prev.y)*j/n});let length=0;for(let j=1;j<s.body.length;j++){length+=Math.hypot(s.body[j].x-s.body[j-1].x,s.body[j].y-s.body[j-1].y);if(length>=92+s.mass*1.02){s.body.length=j+1;break}}
 if(s.boosting){s.mass=Math.max(BASE,s.mass-BOOST_COST*dt);if(Math.random()<dt*6.5)this.addFood(s.body[s.body.length-1],1,s.color)}
 const d=Math.hypot(s.x,s.y);if(d>R-radius(s)){this.kill(s,'Ты коснулся внешнего края арены.');continue}
 if(d>this.zone.radius&&s.immune<=0){s.health-=dt*(22+Math.min(18,(d-this.zone.radius)*.05));if(s.health<=0){s.health=0;this.kill(s,'Сужающаяся зона забрала всё здоровье. Возвращайся внутрь круга раньше.')}}else s.health=Math.min(100,s.health+dt*12)
 }
 const bodies=this.bodyGrid(),foods=new Grid(64),eaten=new Set(),deaths=new Map();for(const f of this.food)foods.add(f.x,f.y,f);
 for(const s of this.snakes){if(!this.active(s))continue;for(const f of foods.near(s.x,s.y,radius(s)+7))if(!eaten.has(f.id)&&distance(s,f)<(radius(s)+7)**2){s.mass=Math.min(6000,s.mass+f.v*2);eaten.add(f.id)}
 if(s.immune>0)continue;for(const b of bodies.near(s.x,s.y,40)){if(b.s===s||b.s.immune>0)continue;if(distance(s,b)<(radius(s)+radius(b.s)-4)**2){deaths.set(s,'Ты коснулся змейки «'+b.s.name+'» головой.');break}}
 }
 if(eaten.size){this.food=this.food.filter(f=>!eaten.has(f.id));this.foodVersion++}for(const[s,reason]of deaths)this.kill(s,reason);
 for(let i=0;i<this.snakes.length;i++){const s=this.snakes[i];if(s.bot&&!s.alive){const replacement=this.spawn(s.id,s.name,s.color,true);this.snakes[i]=replacement;const controller=this.players.get(s.id);if(controller){controller.snake=replacement;controller.angle=replacement.angle}}}
 // Keep the full food supply in the playable circle as it closes.
 for(const f of this.food)if(Math.hypot(f.x,f.y)>this.zone.radius-15){Object.assign(f,point(Math.max(20,this.zone.radius-30)));this.foodVersion++}
 while(this.food.length<FOOD_COUNT)this.addFood();if(this.food.length>3000){this.food.splice(0,this.food.length-3000);this.foodVersion++}
 }
 snapshot(includeFood=false){return{tick:this.tick,round:this.round,zone:{...this.zone},ready:this.ready,players:[...this.players.values()].map(p=>({id:p.id,name:p.snake.name,connected:p.connected,alive:p.snake.alive})),snakes:this.snakes.filter(s=>s.bot||this.players.get(s.id)?.connected).map(s=>({id:s.id,name:s.name,color:s.color,bot:s.bot,x:round(s.x),y:round(s.y),angle:round(s.angle*100)/100,mass:round(s.mass),health:round(s.health),alive:s.alive,boosting:s.boosting,immune:round(s.immune),reason:s.reason,body:s.body.filter((_,i)=>i%2===0).map(b=>[round(b.x),round(b.y)])})),...(includeFood?{foodVersion:this.foodVersion,food:this.food.map(f=>[round(f.x),round(f.y),round(f.r),f.v,f.c])}:{})}}
}
return{Arena,R,COLORS,FOOD_COUNT,BOOST_COST,ZONE_MIN,WARMUP,SHRINK_TIME,ROUND_TIME,zoneAt};
});
