const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const feedback={textContent:''};let response,calls=[];
const context={window:{},document:{getElementById:()=>feedback},fetch:async(url,options)=>{calls.push({url,options});return response;}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin-product-images.js'),'utf8'),context);
const api=context.window.MinsookImages;
(async()=>{
 await assert.rejects(api.prepare({name:'bad.txt',type:'text/plain',size:1}),/JPG/);
 await assert.rejects(api.prepare({name:'large.png',type:'image/png',size:41*1024*1024}),/40MB/);
 const existing='/api/product-images/existing';assert.deepEqual(Array.from(await api.persist([existing])),[existing]);assert.equal(calls.length,0);
 response={ok:true,json:async()=>({url:'/api/product-images/saved'})};assert.deepEqual(Array.from(await api.persist([existing,'data:image/jpeg;base64,abc'])),[existing,'/api/product-images/saved']);assert.equal(calls.length,1);
 for(const [status,message] of [[413,'용량'],[401,'로그인'],[503,'실패']]){response={ok:false,status,json:async()=>({})};await assert.rejects(api.persist(['data:image/jpeg;base64,abc']),new RegExp(message));}
 response={ok:false,status:503,json:async()=>({error:'서버 저장 불가'})};await assert.rejects(api.persist(['data:image/jpeg;base64,abc']),/서버 저장 불가/);
 console.log('PASS: existing images retained; uploads return durable URLs; unsupported/oversized files and 401/413/503 errors never report successful saves. No network.');
})().catch(e=>{console.error(e);process.exitCode=1});
