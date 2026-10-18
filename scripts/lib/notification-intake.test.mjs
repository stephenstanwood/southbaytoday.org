import test from 'node:test';
import assert from 'node:assert/strict';
import {queueNotification} from './notification-intake.mjs';

test('hosted notification becomes quiet intake and cannot DM or mention Stephen', async()=>{
 const prior={actions:process.env.GITHUB_ACTIONS,webhook:process.env.DISCORD_WEBHOOK};
 process.env.GITHUB_ACTIONS='true';process.env.DISCORD_WEBHOOK='https://discord.com/api/webhooks/fixture';
 try{
  const calls=[];const result=await queueNotification('Newsletter requires review <@968482169431396422>',{request:async(url,init)=>{calls.push({url,payload:JSON.parse(init.body)});return {ok:true};}});
  assert.equal(result.queued,true);assert.equal(calls.length,1);
  assert.ok(!calls[0].url.includes('1486102002474811524'));
  assert.deepEqual(calls[0].payload.allowed_mentions,{parse:[],users:[],roles:[],replied_user:false});
  assert.ok(!calls[0].payload.content.includes('<@'));assert.match(calls[0].payload.embeds[0].title,/^MILO intake:/);
  await assert.rejects(queueNotification('fail',{request:async()=>({ok:false,status:500})}),/HTTP 500/);
 }finally{for(const [key,value] of [['GITHUB_ACTIONS',prior.actions],['DISCORD_WEBHOOK',prior.webhook]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
