const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {config,quote,transition,fail}=require('./engine');
const root=path.resolve(__dirname,'..'),dbFile=process.env.DB_FILE||path.join(__dirname,'data.json');
let db=fs.existsSync(dbFile)?JSON.parse(fs.readFileSync(dbFile,'utf8')):{orders:[]};
const sessions=new Map();
function save(){fs.writeFileSync(dbFile+'.tmp',JSON.stringify(db,null,2));fs.renameSync(dbFile+'.tmp',dbFile)}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>30000)fail('Request too large',413)}try{return JSON.parse(text||'{}')}catch{fail('Invalid JSON')}}
function user(req){const u=sessions.get((req.headers.authorization||'').replace('Bearer ',''));if(!u)fail('Sign in to the local demo',401);return u}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const p=url.pathname;
 if(p==='/api/session'&&req.method==='POST'){const b=await body(req);if(!['seller','admin'].includes(b.role))fail('Unknown demo role');const u={id:b.role==='admin'?'demo-operator':'demo-student',role:b.role,name:b.role==='admin'?'Operations desk':'Fei · Manchester',verification:'Demo account · not campus verified'};const token=crypto.randomBytes(24).toString('hex');sessions.set(token,u);return send(res,200,{token,user:u})}
 if(p==='/api/financial'&&req.method==='GET'){const u=user(req);if(u.role!=='admin')fail('Administrator required',403);return send(res,200,require('./financial').forecast())}
 if(p==='/api/config')return send(res,200,config);
 if(p.startsWith('/api/')){
 const u=user(req);
 if(p==='/api/quote'&&req.method==='POST')return send(res,200,quote(await body(req),db.orders));
 if(p==='/api/orders'&&req.method==='GET')return send(res,200,db.orders.filter(o=>u.role==='admin'||o.owner===u.id));
 if(p==='/api/orders'&&req.method==='POST'){
 const b=await body(req);const key=req.headers['idempotency-key'];if(!key||key.length>100)fail('Request identifier required');
 const prior=db.orders.find(o=>o.owner===u.id&&o.key===key);if(prior)return send(res,200,prior);
 const q=quote(b,db.orders);const id='GO-'+crypto.randomBytes(4).toString('hex').toUpperCase();const order={id,key,owner:u.id,input:b,quote:q,status:'pending',settlement:'not_due',events:[{at:new Date().toISOString(),actor:u.id,status:'pending',note:'Request created; quote snapshot saved. Manual confirmation required.'}]};db.orders.push(order);save();return send(res,201,order);
 }
 const match=p.match(/^\/api\/orders\/([^/]+)\/(transition|settle)$/);
 if(match&&req.method==='POST'){const o=db.orders.find(x=>x.id===match[1]);if(!o)fail('Order not found',404);if(u.role!=='admin'&&o.owner!==u.id)fail('Access denied',403);const b=await body(req);
 if(match[2]==='settle'){if(u.role!=='admin')fail('Administrator required',403);if(o.status!=='delivered'||o.settlement==='recorded_demo')fail('Delivery and an unsettled order required',409);if(!b.note||b.note.length<3)fail('Review note required');o.settlement='recorded_demo';o.events.push({at:new Date().toISOString(),actor:u.id,status:'settlement',note:'SIMULATION ONLY: '+b.note})}
 else transition(o,b.target,u,b.note,db.orders);save();return send(res,200,o)}
 fail('Endpoint not found',404);
 }
 const file=p==='/goose.svg'?path.join(root,'miniprogram/assets/goose.svg'):path.join(root,'web',p==='/'?'index.html':p.slice(1));if(!file.startsWith(path.join(root,'web')+path.sep)&&p!=='/goose.svg')fail('Not found',404);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail('Not found',404);const ext=path.extname(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[ext]||'text/plain'});fs.createReadStream(file).pipe(res);
 }catch(e){send(res,e.status||500,{error:e.status?e.message:'Internal server error'})}});
server.listen(Number(process.env.PORT)||8787,'127.0.0.1',()=>console.log('UKGoose demo: http://127.0.0.1:'+(process.env.PORT||8787)));
