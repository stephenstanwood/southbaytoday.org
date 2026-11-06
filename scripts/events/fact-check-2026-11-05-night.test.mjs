import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchStanfordEvents} from '../generate-events.mjs';
import {applyVerifiedEventFacts} from '../../src/lib/south-bay/eventSourceFacts.mjs';
import {isEventPublishable} from '../../src/lib/south-bay/eventOccurrence.mjs';
import {deduplicateEventUrls} from '../lib/event-url-dedup.mjs';
import {resolveEventBlurbs} from '../../src/lib/south-bay/eventBlurbs.mjs';

const fixture=JSON.parse(readFileSync(new URL('../lib/fixtures/fact-check-2026-11-05-night.json',import.meta.url)));

test('a source-declared health technology conference is not art because its agenda says showcase',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-06T02:07:02Z')});
 const event=fixture.stanfordSource.event;
 assert.equal(event.filters.event_types[0].name,'Conference/Symposium');
 assert.match(event.description_text,/Start-up Demo Showcase/);
 t.mock.method(globalThis,'fetch',async url=>{
  assert.equal(String(url),'https://events.stanford.edu/api/2/events?days=60&pp=200');
  return Response.json({events:[{event}]});
 });
 const [actual]=await fetchStanfordEvents();
 assert.equal(actual.category,'education');
 for(const key of ['id','date','time','endTime','cost'])assert.equal(actual[key],fixture.stanfordSource.publishedBefore[key],key);
 const fixed=applyVerifiedEventFacts(fixture.stanfordSource.publishedBefore);
 assert.deepEqual(fixed,{...fixture.stanfordSource.publishedBefore,category:'education'});
 assert.deepEqual(applyVerifiedEventFacts(fixed),fixed);
 const exhibition={...event,id:123,title:'Health technology art exhibition',filters:{event_types:[{name:'Exhibition'}]}};
 t.mock.method(globalThis,'fetch',async()=>Response.json({events:[{event:exhibition}]}));
 assert.equal((await fetchStanfordEvents())[0].category,'arts');
});

test('two campus student programs stay out of the public feed and retired copy explains the restriction',async()=>{
 for(const {schema,publishedBefore} of fixture.scu){
  assert(schema.description);
  assert.equal(isEventPublishable(publishedBefore),false,publishedBefore.title);
  const fixed=applyVerifiedEventFacts(publishedBefore);
  assert.equal(fixed.attendanceStatus,'needs-confirmation');
  assert.match(fixed.attendanceNote,/public eligibility/i);
  assert.deepEqual(applyVerifiedEventFacts(fixed),fixed);
  assert.equal(isEventPublishable({...publishedBefore,date:'2027-11-10'}),true,'a dated hold does not invent a permanent ban');
 }
 assert.match(fixture.scu[0].schema.additionalProperty.map(p=>p.value).join(' '),/Student Organizations/);
 assert.match(fixture.scu[1].schema.description,/As a commuter or transfer student/);
});

test('the same basketball game uses its organizer URL and published address before deduplication',async()=>{
 const normalized=fixture.basketball.map(applyVerifiedEventFacts);
 for(const e of normalized){
  assert.equal(e.url,fixture.ticketLocations[0].url);
  assert.equal(e.venue,'Maples Pavilion');
  assert.equal(e.address,'655 Campus Drive, Stanford, CA 94305');
  assert.equal(e.endTime,null,'do not invent a game finish');
 }
 const kept=deduplicateEventUrls(normalized);
 assert.equal(kept.length,1);
 assert.equal(kept[0].id,fixture.basketball[0].id,'preserve the existing official-ticket identity');
 const events=fixture.basketball.map(e=>({...e}));await resolveEventBlurbs(events,{enabled:false});
 assert.equal(deduplicateEventUrls(events).length,1,'cached copy cannot restore the duplicate');
 const anotherDay={...fixture.basketball[1],date:'2027-11-08'};
 assert.deepEqual(applyVerifiedEventFacts(anotherDay),anotherDay);
});

test('the soccer quarterfinal directs readers to the ticket page address',()=>{
 const before=fixture.soccer;const fixed=applyVerifiedEventFacts(before);
 assert.deepEqual(fixed,{...before,address:'641 Nelson Road, Stanford, CA 94305'});
 assert.deepEqual(applyVerifiedEventFacts(fixed),fixed);
});
