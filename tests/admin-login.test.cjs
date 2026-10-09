const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('admin.html', 'utf8');
const source = html.slice(html.indexOf('    async function handleLogin(e)'), html.indexOf('    async function handleLogout()'));
async function scenario(status, data, throws = false) {
  const nodes = {loginPassword:{value:'test-password'},loginSubmit:{disabled:false,textContent:'로그인하기'},loginError:{hidden:true}};
  let dashboard = false;
  const context = {document:{getElementById:id=>nodes[id]},window:{location:{protocol:'https:'}},fetch:async()=>{if(throws)throw Error('network');return {ok:status===200,status,json:async()=>data}},sessionStorage:{setItem(){}},showToast(){},showDashboard(){dashboard=true},AbortController,setTimeout,clearTimeout};
  vm.createContext(context); vm.runInContext(source,context);
  await context.handleLogin({preventDefault(){}});
  assert.equal(nodes.loginSubmit.disabled,false);
  assert.equal(dashboard,status===200&&!throws);
  if(dashboard) assert.equal(nodes.loginPassword.value,'');
  else assert.equal(nodes.loginError.hidden,false);
}
(async()=>{await scenario(200,{success:true,role:'admin'});await scenario(401,{});await scenario(500,{});await scenario(0,{},true);for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);console.log('PASS: success, incorrect password, server failure, network failure, script syntax');})().catch(e=>{console.error(e);process.exitCode=1});
