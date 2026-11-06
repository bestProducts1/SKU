import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as model from '../catalog-model.mjs';

const root = new URL('../', import.meta.url);
const source = file => fs.readFileSync(new URL(file, root), 'utf8');
const inquiryKey = 'bestProducts1:sku:inquiry:v1';
const cartKey = 'bestProducts1SharedCartV3';
const plain = value => JSON.parse(JSON.stringify(value));
const products = [
  {id:'IL-B008',sku:'IL-B008',name:'Valentino Uomo Born in Roma',brand:'Valentino',ml:'100',warehouse:'IL',stock:377,price:36,img:'https://example.test/il.webp',sku2:'机车骑士'},
  {id:'TX-A002',sku:'TX-A002',name:'Valentino Donna Born in Roma',brand:'Valentino',ml:'100',warehouse:'TX',stock:48,price:38,img:'https://example.test/tx.webp',sku2:'朋克甜心'},
];
const item = (quantity=2) => ({name:'IL-B008',quantity,warehouse:'IL',price:36});
const shoe = (size='40',stock=11) => ({id:`TX-XZ-04-${size}`,sku:`TX-XZ-04-${size}`,parent_sku:'TX-XZ-04',size,name:'Air Jordan 5 Retro',warehouse:'TX',price:137,stock});
const bridge = (quantity=2) => ({version:1,source:'SKU',revision:'previous-inquiry',createdAt:Date.now(),items:[{sku:'IL-B008',warehouse:'IL',quantity}]});

function createElement(){
  const events=new Map(),classes=new Set();
  return {events,style:{},dataset:{},value:'',textContent:'',hidden:true,offsetHeight:0,innerHTML:'',
    classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},
    addEventListener:(name,callback)=>events.set(name,callback),appendChild(){},querySelectorAll:()=>[],setAttribute(){},contains:()=>false,focus(){}};
}
function createPage({page='index.html',stored=[],previous=null,publisherFailure=false,missingPublisher=false,pendingClear=false,pendingMarkerFailure=false}={}){
  const memory=new Map(),elements=new Map(),lifecycle=[],alerts=[],warnings=[],notices=[],publishes=[],writes=[];
  const getElement=id=>{if(!elements.has(id))elements.set(id,createElement());return elements.get(id);};
  const sandbox={console:{...console,warn:(...args)=>warnings.push(args)},
    document:{addEventListener:(name,callback)=>{if(name==='DOMContentLoaded')lifecycle.push(callback);},getElementById:getElement,querySelector:()=>createElement(),querySelectorAll:()=>[],createElement,body:{style:{},appendChild(){}}},
    localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>{writes.push(key);if((publisherFailure&&key===inquiryKey)||(pendingMarkerFailure&&key==='bestProducts1:sku:inquiry-clear-pending:v1'))throw Error('Browser storage unavailable');memory.set(key,String(value));},removeItem:key=>memory.delete(key)},
    alert:message=>alerts.push(message),confirm:()=>true,setTimeout:()=>0,clearTimeout(){},AbortController,AbortSignal,addEventListener(){},
    navigator:{clipboard:{writeText:()=>Promise.resolve()}},crypto:{randomUUID:()=>`fixture-revision-${publishes.length+1}`},
    showSkuNotice:(message,options={})=>notices.push({message,...options})};
  sandbox.SkuOrderModel={...model,summary:model.getOrderSummary,identity:model.productIdentity,stockLimit:model.orderStockLimit,combos:model.buildComboProducts,cartLimit:model.cartProductLimit};
  sandbox.window=sandbox;vm.createContext(sandbox);
  memory.set('bestProducts1SharedCartResetV3','done');memory.set(cartKey,JSON.stringify(stored));
  if(pendingClear)memory.set('bestProducts1:sku:inquiry-clear-pending:v1','pending');
  if(previous)memory.set(inquiryKey,JSON.stringify(previous));
  if(!missingPublisher){
    vm.runInContext(source('inquiry-sync.js'),sandbox);
    const publish=sandbox.SkuInquirySync.publish;
    sandbox.SkuInquirySync={...sandbox.SkuInquirySync,publish(items,options){publishes.push({items:plain(items),saved:JSON.parse(memory.get(cartKey)||'[]'),options});return publish(items,options);}};
  }
  vm.runInContext(source('db.js'),sandbox);sandbox.perfumeDB=plain(products);sandbox.orderDB=sandbox.perfumeDB;
  const inline=[...source(page).matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];vm.runInContext(inline,sandbox);
  if(page==='index.html')sandbox.renderPerfumes=()=>{};
  lifecycle.at(-1)();
  return {sandbox,memory,alerts,warnings,notices,publishes,writes,getElement,cart:()=>JSON.parse(memory.get(cartKey)||'[]'),inquiry:()=>memory.has(inquiryKey)?JSON.parse(memory.get(inquiryKey)):null,
    paste(text){let prevented=false;getElement('search-input').events.get('paste')({preventDefault:()=>{prevented=true;},clipboardData:{getData:()=>text}});assert.equal(prevented,true);}};
}
const orderText='New Order\nIL Warehouse\nIL-B008 - Valentino Uomo Born in Roma · 100ml\nx 3\nTX Warehouse\nTX-A002 - Valentino Donna Born in Roma · 100ml\nx 2\nSubtotal: $184.00';

test('combo inquiry imports the parent once, keeps composition, and publishes no price or component metadata',()=>{
 const page=createPage(),third={...products[0],id:'IL-B009',sku:'IL-B009',name:'Second',stock:40};page.sandbox.perfumeDB.push(third);
 const combo=model.buildComboProducts([{sku:'IL-CB-001',name:'Two Fragrance Combo',items:'IL-B008*1+IL-B009*2',price_catalog:80,price_perfume_list:100}],page.sandbox.perfumeDB,'SKU')[0];page.sandbox.perfumeDB.push(combo);
 page.paste('New Order\nIL Warehouse\n• IL-CB-001 × 2 - Two Fragrance Combo · 3 pcs / combo\n  Includes: IL-B008 (1 per combo), IL-B009 (2 per combo)\nSubtotal: $200');
 assert.equal(page.cart().length,1);assert.equal(page.cart()[0].components.length,2);assert.deepEqual(page.inquiry().items,[{sku:'IL-CB-001',warehouse:'IL',quantity:2}]);
 page.paste('IL-CB-001*99');assert.equal(page.cart().reduce((n,p)=>n+p.quantity,0),20);
 const before=page.inquiry().revision;page.paste('New Order\nIL Warehouse\nIL-CB-999 - Valentino Uomo Born in Roma\nx 1\nSubtotal: $1');assert.equal(page.inquiry().revision,before);
});
test('manual SKU combo edits respect standalone component consumption',()=>{
 const page=createPage(),third={...products[0],id:'IL-B009',sku:'IL-B009',name:'Second',stock:19};page.sandbox.perfumeDB.push(third);
 const combo=model.buildComboProducts([{sku:'IL-CB-001',name:'Two Fragrance Combo',items:'IL-B008*1+IL-B009*2',price_catalog:80,price_perfume_list:100}],page.sandbox.perfumeDB,'SKU')[0];page.sandbox.perfumeDB.push(combo);
 page.paste('IL-B009*5+IL-CB-001*9');assert.equal(page.cart().find(p=>p.name==='IL-CB-001').quantity,7);
 page.sandbox.addItemToCart('IL-CB-001');assert.equal(page.cart().find(p=>p.name==='IL-CB-001').quantity,7);assert.equal(page.inquiry().items.find(p=>p.sku==='IL-CB-001').quantity,7);
 assert.ok(page.notices.some(n=>/adjusted/.test(n.message)));assert.deepEqual(page.alerts,[]);
});

test('exact shoe variants paste and publish individually without defaulting a size',()=>{
  const page=createPage();page.sandbox.perfumeDB.push(shoe(),shoe('41',48),{...shoe(),id:'TX-XZ-06',sku:'TX-XZ-06',size:'',parent_sku:''});
  page.paste('TX-XZ-04-40*1+XZ-04-41*2');
  assert.deepEqual(page.inquiry().items,[{sku:'TX-XZ-04-40',warehouse:'TX',quantity:1},{sku:'TX-XZ-04-41',warehouse:'TX',quantity:2}]);
  assert.equal(page.cart()[0].size,'40');assert.equal(page.cart()[1].size,'41');assert.equal(page.cart()[0].product_type,'shoe');
  const before=page.inquiry().revision;page.paste('TX-XZ-04*3+Air Jordan 5 Retro*1');page.sandbox.addItemToCart('TX-XZ-06');
  assert.equal(page.inquiry().revision,before);assert.equal(page.cart().length,2);assert.deepEqual(page.alerts,[]);
  page.paste('New Order\nTX Warehouse\nTX-XZ-04-40 - Air Jordan 5 Retro · Size 40\nx 2\nTX-XZ-04-41 - Air Jordan 5 Retro · Size 41\nx 3\nSubtotal: $685');
  assert.deepEqual(page.inquiry().items,[{sku:'TX-XZ-04-40',warehouse:'TX',quantity:2},{sku:'TX-XZ-04-41',warehouse:'TX',quantity:3}]);
});
test('SKU cart totals discount perfumes only and keep exact shoe codes in fulfillment copy',()=>{
  const items=[item(2),{name:'TX-XZ-04-40',quantity:2,warehouse:'TX',price:137,...model.productIdentity(shoe())},{name:'IL-LH-01',caption:'Gift Set',quantity:1,warehouse:'IL',price:49}];
  const page=createPage({page:'cart.html',stored:items});
  const text=page.getElement('order-preview-text').value;
  assert.match(text,/TX-XZ-04-40\*2/);assert.match(text,/IL Warehouse \| 3 items \| \$121\.00 - \$2\.16 discount = \$118\.84/);
  assert.match(text,/TX Warehouse \| 2 items \| \$274\.00 - \$0\.00 discount = \$274\.00/);
});
test('product refresh joins both feeds atomically and retains a complete cache on partial failure',async()=>{
  const page=createPage(),csv='sku,parent_sku,name,size,stock,price\nTX-XZ-04-40,TX-XZ-04,Air Jordan,40,11,137\n';
  const urls=[];page.sandbox.fetch=async url=>{urls.push(url);return {ok:true,text:async()=>url.includes('gid=531106001')?csv:url.includes('gid=826113014')?'sku,name,items,price_catalog,price_perfume_list,image_url\n':'sku,name,stock,price\nIL-B008,Valentino,377,36\n'};};
  await page.sandbox.initAllData();assert.equal(urls.length,3);assert.equal(page.sandbox.perfumeDB.length,2);assert.equal(page.sandbox.perfumeDB[1].size,'40');
  const cached=page.memory.get('bestProducts1SkuProductsV3_Combos');page.memory.set('bestProducts1SkuProductsTimeV3_Combos','1');
  page.sandbox.console.error=()=>{};page.sandbox.fetch=async url=>({ok:!url.includes('gid=531106001'),text:async()=>'sku,name,stock,price\nIL-B008,New,377,99\n'});
  await page.sandbox.initAllData();assert.equal(page.sandbox.perfumeDB[0].price,36);assert.equal(page.memory.get('bestProducts1SkuProductsV3_Combos'),cached);
});
test('low-stock SKU copy respects perfume and shoe stock thresholds separately',()=>{
  const page=createPage();page.sandbox.perfumeDB.push(shoe('40',11),shoe('41',0));
  page.getElement('oos-tool-btn').events.get('click')();
  assert.equal(page.getElement('modal-sku-list').textContent,'TX-XZ-04-41');
  assert.match(page.getElement('sku-modal-title').textContent,/Low \/ Unavailable/);
});

test('both SKU pages load helper and accessible notice before cache-busted database',()=>{
  for(const page of ['index.html','cart.html']){
    const html=source(page),helper=html.indexOf('src="inquiry-sync.js?v=20261009-manual-sku-sync"'),notice=html.indexOf('src="sku-notice.js?v=20261009-manual-sku-sync"'),database=html.indexOf('src="db.js?v=20261106-combos-feeds"');
    assert.ok(helper>=0&&notice>helper&&database>notice);
  }
  assert.match(source('sku-notice.js'),/aria-live.*polite/);assert.match(source('sku-notice.js'),/pointer-events:none/);
});
test('actual order paste saves replacement cart before one price-free publication and no popup',()=>{
  const page=createPage({stored:[item(9)],previous:bridge(9)});page.paste(orderText);
  assert.equal(page.publishes.length,1);assert.deepEqual(page.publishes[0].saved,page.cart());
  assert.deepEqual(page.inquiry().items,[{sku:'IL-B008',warehouse:'IL',quantity:3},{sku:'TX-A002',warehouse:'TX',quantity:2}]);
  assert.equal(page.cart()[0].price,36);assert.equal(page.cart()[0].sku2,'机车骑士');assert.deepEqual(page.alerts,[]);assert.match(page.notices.at(-1).message,/Added 5 items/);
});
test('shorthand preserves append semantics and publishes full saved cart once',()=>{
  const page=createPage({stored:[item()],previous:bridge()});page.paste('机车骑士*3+TX-A002*2');
  assert.equal(page.publishes.length,1);assert.deepEqual(page.publishes[0].saved,page.cart());
  assert.deepEqual(page.inquiry().items,[{sku:'IL-B008',warehouse:'IL',quantity:5},{sku:'TX-A002',warehouse:'TX',quantity:2}]);
  page.inquiry().items.forEach(row=>assert.deepEqual(Object.keys(row).sort(),['quantity','sku','warehouse']));assert.deepEqual(page.alerts,[]);
});
test('partial match reports skipped products inline without second publication',()=>{
  const page=createPage();page.paste(`${orderText}\nTX-X999 x 4`);assert.equal(page.publishes.length,1);assert.match(page.notices.at(-1).message,/Skipped.*TX-X999/);assert.equal(page.notices.at(-1).warning,true);assert.deepEqual(page.alerts,[]);
});
test('search and unmatched or unloaded pastes do not publish and never open alerts',()=>{
  const page=createPage();for(const text of ['Valentino','New Order\nTX-X999 x 3\nSubtotal $20','No such scent*4','IL-B008*0'])page.paste(text);
  assert.equal(page.publishes.length,0);assert.equal(page.inquiry(),null);assert.deepEqual(page.cart(),[]);assert.ok(page.notices.some(row=>/matching|0 products/.test(row.message)));
  page.sandbox.perfumeDB=[];page.paste(orderText);page.paste('IL-B008*2');assert.equal(page.publishes.length,0);assert.match(page.notices.at(-1).message,/still loading/);assert.deepEqual(page.alerts,[]);
});
test('paste saves cart on bridge failure and warns inline without alerting',()=>{
  for(const text of [orderText,'机车骑士*3+TX-A002*2']){const page=createPage({publisherFailure:true});page.paste(text);assert.equal(page.cart().length,2);assert.equal(page.inquiry(),null);assert.equal(page.publishes.length,1);assert.match(page.notices.at(-1).message,/SKU cart saved.*syncing failed/s);assert.equal(page.notices.at(-1).warning,true);assert.deepEqual(page.alerts,[]);}
});
test('missing helper keeps manual and pasted carts with only page feedback',()=>{
  const page=createPage({missingPublisher:true});page.sandbox.addItemToCart('IL-B008');assert.equal(page.cart()[0].quantity,1);page.paste(orderText);assert.equal(page.cart().length,2);assert.equal(page.inquiry(),null);assert.match(page.notices.at(-1).message,/syncing failed/);assert.deepEqual(page.alerts,[]);
});
test('unsafe quantity or invalid existing line never overwrites valid snapshot',()=>{
  const page=createPage();page.paste(orderText);const before=page.memory.get(inquiryKey);page.paste('IL-B008*9007199254740992');assert.equal(page.memory.get(inquiryKey),before);assert.match(page.notices.at(-1).message,/syncing failed/);assert.deepEqual(page.alerts,[]);
  const invalid=createPage({stored:[{...item(),warehouse:'TX'}],previous:bridge()});invalid.paste('TX-A002*2');assert.equal(invalid.cart().length,2);assert.equal(invalid.inquiry().revision,'previous-inquiry');assert.equal(invalid.notices.at(-1).warning,true);
});
test('manual add and clear publish snapshots while searches and reads do not duplicate',()=>{
  const page=createPage();page.sandbox.addItemToCart('IL-B008');assert.equal(page.inquiry().items[0].quantity,1);const first=page.inquiry().revision;
  page.sandbox.addItemToCart('IL-B008');assert.equal(page.inquiry().items[0].quantity,2);assert.notEqual(page.inquiry().revision,first);const second=page.inquiry().revision;
  page.paste('Valentino');page.sandbox.readSkuToolCart();assert.equal(page.inquiry().revision,second);
  page.sandbox.clearCart();assert.deepEqual(page.cart(),[]);assert.equal(page.inquiry().action,'clear');assert.deepEqual(page.inquiry().items,[]);assert.equal(page.publishes.length,3);assert.deepEqual(page.alerts,[]);
});
test('cart-page +/- removal and clear publish exactly once per edit',()=>{
  const page=createPage({page:'cart.html',stored:[item()],previous:bridge()});assert.equal(page.publishes.length,0);
  const dispatch=action=>page.getElement('cart-container').events.get('click')({target:{closest:()=>({dataset:{name:'IL-B008'}}),classList:{contains:value=>value===action}}});
  dispatch('increase-btn');assert.equal(page.inquiry().items[0].quantity,3);dispatch('decrease-btn');assert.equal(page.inquiry().items[0].quantity,2);dispatch('remove-btn');assert.equal(page.inquiry().action,'clear');assert.deepEqual(page.cart(),[]);
  page.getElement('clear-cart-btn').events.get('click')();assert.equal(page.inquiry().action,'clear');assert.equal(page.publishes.length,4);assert.deepEqual(page.alerts,[]);
});
test('read backfills nonempty old cart once when bridge is missing or quantities differ',()=>{
  for(const previous of [null,bridge(7),{...bridge(),action:'clear',items:[]}]){const page=createPage({stored:[item()],previous});assert.equal(page.publishes.length,1);assert.equal(page.inquiry().items[0].quantity,2);const revision=page.inquiry().revision;for(let index=0;index<4;index++)page.sandbox.readSkuToolCart();assert.equal(page.publishes.length,1);assert.equal(page.inquiry().revision,revision);}
});
test('same normalized totals do not republish metadata or order differences on read',()=>{
  const previous={...bridge(3),items:[{sku:'TX-A002',warehouse:'TX',quantity:4},{sku:'IL-B008',warehouse:'IL',quantity:3}]};
  const page=createPage({stored:[{...item(1),name:'il-b008',warehouse:'IL Warehouse',price:1},{...item(2),price:99},{name:'TX-A002',warehouse:'TX',quantity:4,sku2:'秘密'}],previous});assert.equal(page.publishes.length,0);assert.equal(page.inquiry().revision,'previous-inquiry');assert.equal(page.memory.get(inquiryKey),JSON.stringify(previous));
});
test('empty initial cart never publishes clear or overrides independent storefront carts',()=>{
  const page=createPage({previous:bridge()});page.memory.set('bestProducts1:catalog:cart:v1','independent catalog order');page.memory.set('bestProducts1:perfume-list:cart:v1','independent perfume order');page.sandbox.readSkuToolCart();
  assert.equal(page.publishes.length,0);assert.equal(page.inquiry().revision,'previous-inquiry');assert.equal(page.memory.get('bestProducts1:catalog:cart:v1'),'independent catalog order');assert.equal(page.memory.get('bestProducts1:perfume-list:cart:v1'),'independent perfume order');
});
test('failed clear keeps prior inquiry but retains saved empty cart and inline warning',()=>{
  const page=createPage({stored:[item()],previous:bridge(),publisherFailure:true});page.sandbox.clearCart();assert.deepEqual(page.cart(),[]);assert.equal(page.inquiry().revision,'previous-inquiry');assert.equal(page.notices.at(-1).warning,true);assert.deepEqual(page.alerts,[]);
  assert.equal(page.memory.get('bestProducts1:sku:inquiry-clear-pending:v1'),'pending');
  const refreshed=createPage({stored:[],previous:page.inquiry(),pendingClear:true});assert.equal(refreshed.inquiry().action,'clear');assert.equal(refreshed.publishes.length,1);
  assert.equal(refreshed.memory.has('bestProducts1:sku:inquiry-clear-pending:v1'),false);const revision=refreshed.inquiry().revision;refreshed.sandbox.readSkuToolCart();assert.equal(refreshed.inquiry().revision,revision);
});

test('pending clear never infers a destructive empty from missing malformed or legacy reset carts',()=>{
  for(const raw of [null,'broken','null','{}','[null]']){
    const page=createPage({previous:bridge()});page.memory.set('bestProducts1:sku:inquiry-clear-pending:v1','pending');
    if(raw===null)page.memory.delete(cartKey);else page.memory.set(cartKey,raw);
    page.sandbox.readSkuToolCart();assert.equal(page.publishes.length,0);assert.equal(page.inquiry().revision,'previous-inquiry');
  }
  const reset=createPage({previous:bridge()});reset.memory.delete('bestProducts1SharedCartResetV3');reset.memory.set('bestProducts1:sku:inquiry-clear-pending:v1','pending');
  reset.sandbox.readSkuToolCart();assert.equal(reset.publishes.length,0);assert.equal(reset.inquiry().revision,'previous-inquiry');
});

test('matching clear or subsequent nonempty edit retires pending marker without repeat clear',()=>{
  const existing={...bridge(),action:'clear',items:[]};const page=createPage({previous:existing,pendingClear:true});assert.equal(page.publishes.length,0);assert.equal(page.memory.has('bestProducts1:sku:inquiry-clear-pending:v1'),false);
  page.memory.set('bestProducts1:sku:inquiry-clear-pending:v1','pending');page.sandbox.addItemToCart('IL-B008');assert.equal(page.inquiry().items[0].quantity,1);assert.equal(page.inquiry().action,undefined);assert.equal(page.memory.has('bestProducts1:sku:inquiry-clear-pending:v1'),false);
});

test('retry-marker write failure does not block clear and reports truthful retry limitation on sync failure',()=>{
  const saved=createPage({stored:[item()],previous:bridge(),pendingMarkerFailure:true});saved.sandbox.clearCart();assert.deepEqual(saved.cart(),[]);assert.equal(saved.inquiry().action,'clear');assert.equal(saved.sandbox.skuInquirySyncFailed,false);
  const failed=createPage({stored:[item()],previous:bridge(),pendingMarkerFailure:true,publisherFailure:true});failed.sandbox.clearCart();assert.deepEqual(failed.cart(),[]);assert.equal(failed.inquiry().revision,'previous-inquiry');assert.equal(failed.memory.has('bestProducts1:sku:inquiry-clear-pending:v1'),false);
  assert.match(failed.notices.at(-1).message,/Try the cart edit again/);assert.doesNotMatch(failed.notices.at(-1).message,/Refresh SKU to retry/);
});

test('failure to remove a retry marker cannot turn a published clear into a false sync failure',()=>{
  const page=createPage({stored:[item()],previous:bridge()});const remove=page.sandbox.localStorage.removeItem;
  page.sandbox.localStorage.removeItem=key=>{if(key==='bestProducts1:sku:inquiry-clear-pending:v1')throw Error('Marker removal failed');remove(key);};
  page.sandbox.clearCart();assert.equal(page.inquiry().action,'clear');assert.equal(page.sandbox.skuInquirySyncFailed,false);assert.deepEqual(page.cart(),[]);assert.ok(page.warnings.length);
});
test('invalid boolean quantities cannot match valid read snapshots',()=>{
  const page=createPage({stored:[item(true)],previous:bridge(1)});assert.equal(page.publishes.length,1);assert.equal(page.inquiry().revision,'previous-inquiry');assert.equal(page.sandbox.skuInquirySyncFailed,true);
});
