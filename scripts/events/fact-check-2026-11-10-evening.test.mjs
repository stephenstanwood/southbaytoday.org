import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {fetchInboundEvents} from '../generate-events.mjs';
import {applyVerifiedEventFacts} from '../../src/lib/south-bay/eventSourceFacts.mjs';
import {resolveEventBlurbs} from '../../src/lib/south-bay/eventBlurbs.mjs';
import {requiresAdvanceRegistration} from '../../src/lib/south-bay/eventFilters.mjs';
const {events}=JSON.parse(fs.readFileSync(new URL('../lib/fixtures/fact-check-2026-11-10-evening.json',import.meta.url)));
const volunteer=events.find(e=>e.id==='inbound-691755970ae457ba');

test('newsletter ingestion distinguishes optional attendance signup from volunteer service credit',async()=>{
 const [event]=fetchInboundEvents({today:'2026-11-09',events:[{
  id:'sunnyvale-volunteer',title:volunteer.title,description:volunteer.description,
  startsAt:'2026-11-12T17:00:00-08:00',endsAt:'2026-11-12T18:30:00-08:00',
  location:volunteer.venue,cityKey:volunteer.city,sourceUrl:volunteer.url,
 }]});
 assert(event);
 await resolveEventBlurbs([event],{enabled:false});
 assert.match(event.attendanceNote,/Event registration is optional/);
 assert.match(event.attendanceNote,/To earn volunteer hours, you must be a registered library volunteer; new volunteers must apply/);
 assert.match(event.blurb,/Teens age 13\+ seeking volunteer hours/);
 assert.equal(requiresAdvanceRegistration(event),false);
 assert.equal(event.time,'5:00 PM');assert.equal(event.endTime,'6:30 PM');
 assert.deepEqual(applyVerifiedEventFacts(event),event);
});

test('retained and cached copy keeps service-credit conditions without reopening later booking states',async()=>{
 for(const registration of [undefined,'full','closed','appointment']){
  const event={...structuredClone(volunteer),registration,attendanceNote:'Later organizer instructions.'};
  await resolveEventBlurbs([event],{enabled:false});
  assert.equal(event.registration,registration);
  assert.match(event.attendanceNote,/^Later organizer instructions\./);
  assert.match(event.blurb,/must be registered library volunteers or apply/);
  assert.equal(event.attendanceNote.match(/new volunteers must apply/g).length,1);
  assert.deepEqual(applyVerifiedEventFacts(event),event);
  for(const key of ['id','title','date','time','endTime','venue','url','cost','firstSeenAt'])assert.deepEqual(event[key],volunteer[key]);
 }
});

test('the verified credit condition is confined to the exact dated library occurrence',()=>{
 for(const change of [{date:'2026-12-10'},{url:'https://sunnyvale.libcal.com/event/99999999'},{venue:'Another Library'},{title:'A Different Volunteer Program'}]){
  const event={...structuredClone(volunteer),...change};
  assert.deepEqual(applyVerifiedEventFacts(event),event);
 }
});
