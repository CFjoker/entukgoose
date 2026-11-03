const DAY=86400000;
const financial=require('./financial');
const config={version:'financial-v2',capacity:12,maxDays:120,categories:['Kitchenware','Small appliance','Study essentials'],maxUnits:4};
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function day(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))fail('Use a valid YYYY-MM-DD date');const n=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)fail('Invalid calendar date');return n}
function quote(input,orders=[]){
 const {title,category,pickup,delivery,units,value,matched}=input;
 if(typeof title!=='string'||!title.trim()||title.length>100)fail('Item title is required (maximum 100 characters)');
 if(!config.categories.includes(category))fail('This category is not accepted in the pilot');
 if(!Number.isInteger(units)||units<1||units>config.maxUnits)fail('Choose 1–4 storage units');
 if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>1000)fail('Item value must be £1–£1000');
 if(typeof matched!=='boolean')fail('Choose whether a buyer is confirmed');
 const a=day(pickup),b=day(delivery);if(b<a)fail('Delivery cannot be before collection');const days=Math.max(1,(b-a)/DAY);if(days>config.maxDays)fail('Pilot storage limit is 120 days');
 // Inclusive reservation dates conservatively include both handover days.
 let peak=0;for(let t=a;t<=b;t+=DAY){let used=units;for(const o of orders){if(!['cancelled','delivered'].includes(o.status)&&day(o.input.pickup)<=t&&day(o.input.delivery)>=t)used+=o.input.units}peak=Math.max(peak,used)}
 const f=financial.orderQuote(input,days);
 return {...f,ruleVersion:config.version,days,units,capacityAvailable:peak<=config.capacity,peakUnits:peak,capacity:config.capacity,reviewRequired:!matched||peak>config.capacity,reason:!matched?'No confirmed buyer: manual review required':peak>config.capacity?'Capacity exceeded: manual review required':'Within pilot rules',billing:'Storage uses the selected forecast month and whole-pallet allocation; actual dates scale the six-week planning duration. This is an estimate, not a carrier quote.',settlement:'Seller service fee is collected separately; buyer pays goods value and allocated logistics in this demo. No real payments.'};
}
const next={pending:['confirmed','cancelled'],confirmed:['collected','cancelled'],collected:['stored','exception'],stored:['dispatched','exception'],dispatched:['delivered','exception'],exception:['stored','dispatched','cancelled'],delivered:[],cancelled:[]};
function transition(order,target,actor,note,orders){
 if(!next[order.status]?.includes(target))fail('Invalid transition: '+order.status+' → '+target,409);
 if(actor.role!=='admin'&&!(target==='cancelled'&&order.owner===actor.id&&['pending','confirmed'].includes(order.status)))fail('Administrator permission required',403);
 if(!note||typeof note!=='string'||note.trim().length<3)fail('Add a handover or decision note');
 if(target==='confirmed'){
 if(order.quote.ruleVersion!==config.version)fail('Legacy quote: create a new request under the current pricing model',409);
 if(!order.input.matched)fail('Unmatched goods cannot be confirmed in this pilot',409);
 if(!quote(order.input,orders.filter(o=>o.id!==order.id)).capacityAvailable)fail('Capacity unavailable',409);
 }
 order.status=target;order.events.push({at:new Date().toISOString(),actor:actor.id,status:target,note:note.trim()});
 if(target==='delivered')order.settlement='awaiting_manual_review';
 if(target==='exception')order.settlement='on_hold';
 if(target==='cancelled')order.settlement=order.events.some(e=>e.status==='collected')?'manual_cost_review':'not_due';
 return order;
}
module.exports={config,quote,transition,fail};
