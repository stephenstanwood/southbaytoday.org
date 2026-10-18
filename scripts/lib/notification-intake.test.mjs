import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import {queueNotification} from './notification-intake.mjs';
import {catSignal} from './notify.mjs';

function isolatedSink(t) {
 const directory=mkdtempSync(join(tmpdir(),'sbt-notification-test-'));
 const prior=process.env.SBT_NOTIFICATION_TEST_DIR;
 process.env.SBT_NOTIFICATION_TEST_DIR=directory;
 t.after(()=>{if(prior===undefined)delete process.env.SBT_NOTIFICATION_TEST_DIR;else process.env.SBT_NOTIFICATION_TEST_DIR=prior;rmSync(directory,{recursive:true,force:true});});
 return directory;
}

test('Node tests cannot reach the installed gateway or a webhook by default',async()=>{
 assert.ok(process.env.NODE_TEST_CONTEXT);
 const originalRun=childProcess.execFileSync,originalFetch=globalThis.fetch,prior=process.env.SBT_NOTIFICATION_TEST_DIR;
 const calls=[];
 delete process.env.SBT_NOTIFICATION_TEST_DIR;
 childProcess.execFileSync=()=>{calls.push('gateway');throw Error('unexpected live gateway');};
 globalThis.fetch=async()=>{calls.push('webhook');throw Error('unexpected live webhook');};
 syncBuiltinESMExports();
 try{await assert.rejects(queueNotification('fixture failure'),/Node tests require an isolated notification sink/);assert.deepEqual(calls,[]);}
 finally{childProcess.execFileSync=originalRun;globalThis.fetch=originalFetch;syncBuiltinESMExports();if(prior!==undefined)process.env.SBT_NOTIFICATION_TEST_DIR=prior;}
});

test('an isolated sink records the notification intent without either live transport',async(t)=>{
 const directory=isolatedSink(t);
 const forbidden=()=>{throw Error('test notification escaped');};
 const result=await queueNotification('Blocked fixture write',{producer:'fixture-producer',run:forbidden,request:forbidden});
 assert.deepEqual(result,{queued:true,routed:'isolated-test-intake'});
 const files=readdirSync(directory);
 assert.equal(files.length,1);
 assert.deepEqual(JSON.parse(readFileSync(join(directory,files[0]),'utf8')),{producer:'fixture-producer',content:'Blocked fixture write'});
});

test('a mock for the other route or an undefined transport cannot enable live delivery',async()=>{
 const prior=process.env.GITHUB_ACTIONS;
 process.env.GITHUB_ACTIONS='true';
 try{
  await assert.rejects(queueNotification('fixture',{run:()=>{throw Error('wrong route');}}),/injected transport for this route/);
  await assert.rejects(queueNotification('fixture',{request:undefined}),/injected transport for this route/);
 }finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
});

test('catSignal keeps test cooldowns in the fixture instead of the shared runtime directory',async(t)=>{
 const directory=isolatedSink(t),key=`fixture-${Date.now()}-${process.pid}`;
 const shared=join(tmpdir(),`sbt-notify-${key}.ts`);
 t.after(()=>rmSync(shared,{force:true}));
 await catSignal({key,title:'Fixture blocked',body:'Preserve fixture output'});
 await catSignal({key,title:'Fixture blocked',body:'Preserve fixture output'});
 assert.equal(readdirSync(directory).filter(name=>name.endsWith('.json')).length,1);
 assert.equal(existsSync(join(directory,'cooldowns',`sbt-notify-${key}.ts`)),true);
 assert.equal(existsSync(shared),false);
});

test('hosted notification becomes quiet intake and cannot DM or mention Stephen', async()=>{
 const prior={actions:process.env.GITHUB_ACTIONS,webhook:process.env.DISCORD_WEBHOOK};
 process.env.GITHUB_ACTIONS='true';process.env.DISCORD_WEBHOOK='https://discord.com/api/webhooks/fixture';
 try{
  const calls=[];const result=await queueNotification('Newsletter requires review <@968482169431396422>',{request:async(url,init)=>{calls.push({url,payload:JSON.parse(init.body)});return {ok:true};}});
  assert.equal(result.queued,true);assert.equal(calls.length,1);
  assert.ok(!calls[0].url.includes('1486102002474811524'));
  assert.equal(new URL(calls[0].url).searchParams.get('wait'),'true');
  assert.deepEqual(calls[0].payload.allowed_mentions,{parse:[],users:[],roles:[],replied_user:false});
  assert.equal(calls[0].payload.flags,1<<12); // SUPPRESS_NOTIFICATIONS; keep the intake embed.
  assert.ok(!calls[0].payload.content.includes('<@'));assert.match(calls[0].payload.embeds[0].title,/^MILO intake:/);
  await assert.rejects(queueNotification('fail',{request:async()=>({ok:false,status:500})}),/HTTP 500/);
 }finally{for(const [key,value] of [['GITHUB_ACTIONS',prior.actions],['DISCORD_WEBHOOK',prior.webhook]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
