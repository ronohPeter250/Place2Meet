// Firestore security-rules tests for the chat/match/swipe subsystem.
// Run via:  firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, collectionGroup, query, where, serverTimestamp,
  GeoPoint, Timestamp, writeBatch,
} from 'firebase/firestore';

let passed = 0;
async function ok(label, p) { await assertSucceeds(p); console.log('  PASS (allowed):', label); passed++; }
async function no(label, p) { await assertFails(p);    console.log('  PASS (denied): ', label); passed++; }

const testEnv = await initializeTestEnvironment({
  projectId: 'place2meet-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// Seed users (active: users doc exists, no accountStatus => treated active).
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/A'), { name: 'A', gender: 'male', profileComplete: true });
  await setDoc(doc(db, 'users/B'), { name: 'B', profileComplete: true });
  await setDoc(doc(db, 'users/C'), { name: 'C', profileComplete: true });
  // D = a fully-filled profile (still incomplete flag); E = missing gender.
  await setDoc(doc(db, 'users/D'), { name: 'D', gender: 'male', city: 'TLV', birthday: '2000-01-01', photos: ['p1', 'p2'], datingPreference: ['female'], relationshipType: ['serious'], profileComplete: false });
  await setDoc(doc(db, 'users/E'), { name: 'E', city: 'TLV', birthday: '2000-01-01', photos: ['p1', 'p2'], datingPreference: ['female'], relationshipType: ['serious'], profileComplete: false });
  // Business + events for the join/leave-coupling tests.
  await setDoc(doc(db, 'businesses/BIZ'), { name: 'Biz', coordinates: new GeoPoint(32.08, 34.78) });
  await setDoc(doc(db, 'events/E1'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 5, attendeeCount: 0, attendeeIds: [], attendeeCounts: { male: 0, female: 0, other: 0 } });
  await setDoc(doc(db, 'events/E2'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 1, attendeeCount: 1, attendeeIds: ['X'], attendeeCounts: { male: 1, female: 0, other: 0 } });
  await setDoc(doc(db, 'events/E9'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 5, attendeeCount: 0, attendeeIds: [], attendeeCounts: { male: 0, female: 0, other: 0 }, dateTime: Timestamp.fromDate(new Date(Date.now() + 86400000)) });
  // A suspended business + its event (registration must be denied server-side).
  await setDoc(doc(db, 'businesses/SUSP'), { name: 'Susp', accountStatus: 'suspended' });
  await setDoc(doc(db, 'events/ESU'), { createdBy: 'SUSP', venueId: 'SUSP', capacity: 5, attendeeCount: 0, attendeeIds: [], attendeeCounts: { male: 0, female: 0, other: 0 }, dateTime: Timestamp.fromDate(new Date(Date.now() + 86400000)) });
  // E3 backs the genderField-immutability + re-join tests (now that re-join checks the event's business).
  await setDoc(doc(db, 'events/E3'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 5, attendeeCount: 0, attendeeIds: [], attendeeCounts: { male: 0, female: 0, other: 0 }, dateTime: Timestamp.fromDate(new Date(Date.now() + 86400000)) });
  // A cancelled registration on the SUSPENDED business's event (for the re-join gate test).
  await setDoc(doc(db, 'registrations/A_ESU2'), { userId: 'A', eventId: 'ESU', status: 'cancelled', genderField: 'male', timestamp: serverTimestamp() });
  // A registered doc for the genderField-immutability test, and a checkin at BIZ's venue.
  await setDoc(doc(db, 'registrations/A_E3'), { userId: 'A', eventId: 'E3', status: 'registered', genderField: 'male', timestamp: serverTimestamp() });
  await setDoc(doc(db, 'checkins/U_BIZ'), { userId: 'U', venueId: 'BIZ', timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600000)) });
  // An EXPIRED check-in of C at vP (to verify the present-read co-presence gate
  // requires a LIVE check-in, not just a lingering one).
  await setDoc(doc(db, 'checkins/C_vP'), { userId: 'C', venueId: 'vP', timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() - 3600000)) });
  // A victim's presence entry (for the delete-IDOR test).
  await setDoc(doc(db, 'venue_presence_entries/VICT'), { venueId: 'vX', gender: 'female', expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600000)) });
  // Venues that the check-in tests target (check-in now requires the venue to exist).
  for (const v of ['v1', 'v2', 'v3', 'v4', 'v9', 'vP', 'vR', 'vX', 'vSA', 'vSB']) {
    await setDoc(doc(db, 'venues/' + v), { name: v, location: new GeoPoint(32.08, 34.78) });
  }
  // A venue that EXISTS but has NO coordinates — check-in there must be denied.
  await setDoc(doc(db, 'venues/vNC'), { name: 'vNC' });
  // G = incomplete profile with no gender yet (to verify onboarding can still set it).
  await setDoc(doc(db, 'users/G'), { name: 'G', profileComplete: false });
});

const A = testEnv.authenticatedContext('A').firestore();
const B = testEnv.authenticatedContext('B').firestore();
const C = testEnv.authenticatedContext('C').firestore();
const D = testEnv.authenticatedContext('D').firestore();
const E = testEnv.authenticatedContext('E').firestore();
const F = testEnv.authenticatedContext('F').firestore();
const G = testEnv.authenticatedContext('G').firestore();
const BIZ = testEnv.authenticatedContext('BIZ').firestore();

console.log('\n[swipes]');
await ok('A creates own like swipe A->B', setDoc(doc(A, 'swipes/A_B'), { fromUser:'A', toUser:'B', action:'like', timestamp: serverTimestamp() }));
await ok('swipe owner flips own action to dislike', updateDoc(doc(A, 'swipes/A_B'), { action: 'dislike' }));
await ok('swipe owner flips own action back to like', updateDoc(doc(A, 'swipes/A_B'), { action: 'like' }));
await no('swipe update cannot change fromUser', updateDoc(doc(A, 'swipes/A_B'), { fromUser: 'X' }));
await no('non-owner cannot update a swipe', updateDoc(doc(B, 'swipes/A_B'), { action: 'dislike' }));
await no('invalid action rejected', setDoc(doc(A, 'swipes/A_C'), { fromUser:'A', toUser:'C', action:'superlike', timestamp: serverTimestamp() }));
await no('forged fromUser rejected', setDoc(doc(A, 'swipes/X_B'), { fromUser:'X', toUser:'B', action:'like', timestamp: serverTimestamp() }));
// The disputed list rule: A querying its OWN swipes (where fromUser==A) must be ALLOWED.
await ok('LIST swipes where fromUser==A (myth-check)', getDocs(query(collection(A, 'swipes'), where('fromUser','==','A'))));
// Enumerating who liked ME (where toUser==A) must be DENIED.
await no('LIST swipes where toUser==A denied', getDocs(query(collection(A, 'swipes'), where('toUser','==','A'))));

console.log('\n[chats — mutual-match gate]');
await no('chat create WITHOUT mutual match denied', setDoc(doc(A, 'chats/A_B'), { participants:['A','B'], lastMessage:'', lastMessageAt: serverTimestamp() }));
await ok('B creates own like swipe B->A (now mutual)', setDoc(doc(B, 'swipes/B_A'), { fromUser:'B', toUser:'A', action:'like', timestamp: serverTimestamp() }));
await ok('chat create WITH mutual match allowed', setDoc(doc(A, 'chats/A_B'), { participants:['A','B'], lastMessage:'', lastMessageAt: serverTimestamp() }));

console.log('\n[chats — update field lock]');
await ok('participant updates metadata', updateDoc(doc(A, 'chats/A_B'), { lastMessage:'hi', lastMessageAt: serverTimestamp() }));
await no('participant injection (add C) denied', updateDoc(doc(A, 'chats/A_B'), { participants:['A','B','C'] }));
await no('participant removal (silence B) denied', updateDoc(doc(A, 'chats/A_B'), { participants:['A'] }));
await no('non-participant C reads chat denied', getDoc(doc(C, 'chats/A_B')));

console.log('\n[messages]');
await ok('participant sends valid message', setDoc(doc(A, 'chats/A_B/messages/m1'), { senderId:'A', text:'hello', read:false, timestamp: serverTimestamp() }));
await no('empty message denied', setDoc(doc(A, 'chats/A_B/messages/m2'), { senderId:'A', text:'', read:false, timestamp: serverTimestamp() }));
await no('spoofed senderId denied', setDoc(doc(A, 'chats/A_B/messages/m3'), { senderId:'B', text:'x', read:false, timestamp: serverTimestamp() }));
await no('read:true on create denied', setDoc(doc(A, 'chats/A_B/messages/m4'), { senderId:'A', text:'x', read:true, timestamp: serverTimestamp() }));
await no('non-participant C sends message denied', setDoc(doc(C, 'chats/A_B/messages/m5'), { senderId:'C', text:'x', read:false, timestamp: serverTimestamp() }));

console.log('\n[user_locations — private per-user GPS]');
await ok('A writes own location', setDoc(doc(A, 'user_locations/A'), { location: new GeoPoint(32, 34), updatedAt: serverTimestamp() }));
await ok('A reads own location', getDoc(doc(A, 'user_locations/A')));
await no('B cannot read A location', getDoc(doc(B, 'user_locations/A')));
await no('A cannot write B location', setDoc(doc(A, 'user_locations/B'), { location: new GeoPoint(1, 1), updatedAt: serverTimestamp() }));

console.log('\n[checkins — expiresAt validation]');
const inMs = (ms) => Timestamp.fromDate(new Date(Date.now() + ms));
const AT = { lat: 32.08, lng: 34.78 };  // at the seeded venue location
await ok('valid checkin (now+4h, at venue)', setDoc(doc(A, 'checkins/A_v1'), { userId:'A', venueId:'v1', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ci1' }));
await no('far-future expiresAt denied', setDoc(doc(A, 'checkins/A_v2'), { userId:'A', venueId:'v2', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(100*3600*1000), entryId:'ci2' }));
await no('past expiresAt denied', setDoc(doc(A, 'checkins/A_v3'), { userId:'A', venueId:'v3', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(-3600*1000), entryId:'ci3' }));
await no('checkin gender != profile denied (gender spoof)', setDoc(doc(A, 'checkins/A_v4'), { userId:'A', venueId:'v4', gender:'female', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ci4' }));
await no('checkin pointing at an existing (victim) entry denied', setDoc(doc(A, 'checkins/A_vX'), { userId:'A', venueId:'vX', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'VICT' }));
// Proximity gate (new): checking in far from the venue, or with no GPS, is denied.
await no('checkin too far from venue denied', setDoc(doc(A, 'checkins/A_v9far'), { userId:'A', venueId:'v9', gender:'male', lat: 33.5, lng: 35.5, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'cifar' }));
await no('checkin without lat/lng denied', setDoc(doc(A, 'checkins/A_v9nl'), { userId:'A', venueId:'v9', gender:'male', timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'cinl' }));
await ok('checkin at a BUSINESS venue (coordinates) allowed', setDoc(doc(A, 'checkins/A_BIZ'), { userId:'A', venueId:'BIZ', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'cibiz' }));
await no('checkin at a venue with NO coordinates denied', setDoc(doc(A, 'checkins/A_vNC'), { userId:'A', venueId:'vNC', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'cinc' }));
// Refresh path: extending a check-in (update expiresAt, NO lat/lng resent) must
// still be allowed; venueId/gender/entryId stay immutable.
await ok('refresh checkin: extend expiresAt without resending coords', updateDoc(doc(A, 'checkins/A_v1'), { expiresAt: inMs(4*3600*1000) }));
await no('checkin update cannot change venueId', updateDoc(doc(A, 'checkins/A_v1'), { venueId: 'v2', expiresAt: inMs(3600*1000) }));
await no('checkin update cannot change gender', updateDoc(doc(A, 'checkins/A_v1'), { gender: 'female', expiresAt: inMs(3600*1000) }));
// Heaviest path: venue SWITCH = co-delete old checkin+entry AND create new
// checkin+entry (with the proximity gets) in ONE batch — must stay under the
// document-access limit.
const mkSw = writeBatch(A);
mkSw.set(doc(A, 'checkins/A_vSA'), { userId:'A', venueId:'vSA', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ENTSA' });
mkSw.set(doc(A, 'venue_presence_entries/ENTSA'), { venueId:'vSA', gender:'male', expiresAt: inMs(4*3600*1000) });
await ok('switch: initial check-in at vSA', mkSw.commit());
const sw = writeBatch(A);
sw.delete(doc(A, 'venue_presence_entries/ENTSA'));
sw.delete(doc(A, 'checkins/A_vSA'));
sw.set(doc(A, 'checkins/A_vSB'), { userId:'A', venueId:'vSB', gender:'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ENTSB' });
sw.set(doc(A, 'venue_presence_entries/ENTSB'), { venueId:'vSB', gender:'male', expiresAt: inMs(4*3600*1000) });
await ok('switch venue in one batch (co-delete old + create new, under access limit)', sw.commit());

console.log('\n[R1 fixes — swipe id binding / checkins list / profileComplete / reads+metadata]');
await no('forge reverse swipe (id B_A, fromUser A) denied', setDoc(doc(A, 'swipes/B_A'), { fromUser: 'A', toUser: 'B', action: 'like', timestamp: serverTimestamp() }));
await no('self-swipe denied', setDoc(doc(A, 'swipes/A_A'), { fromUser: 'A', toUser: 'A', action: 'like', timestamp: serverTimestamp() }));
await ok('A lists OWN checkins', getDocs(query(collection(A, 'checkins'), where('userId', '==', 'A'))));
await no('venue-scoped checkin list (enumerate presence) denied', getDocs(query(collection(A, 'checkins'), where('venueId', '==', 'v1'))));
await no('checkin with mismatched doc id denied', setDoc(doc(A, 'checkins/A_WRONG'), { userId: 'A', venueId: 'v9', gender: 'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ci9' }));
await ok('D flips profileComplete=true WITH all fields', updateDoc(doc(D, 'users/D'), { profileComplete: true }));
await no('E flips profileComplete=true MISSING gender denied', updateDoc(doc(E, 'users/E'), { profileComplete: true }));
await ok('A stamps OWN reads', updateDoc(doc(A, 'chats/A_B'), { ['reads.A']: serverTimestamp() }));
await no('A stamps OTHER user reads denied', updateDoc(doc(A, 'chats/A_B'), { ['reads.B']: serverTimestamp() }));
await no('forge lastSenderId as other user denied', updateDoc(doc(A, 'chats/A_B'), { lastSenderId: 'B', lastMessage: 'x', lastMessageAt: serverTimestamp() }));
await ok('legit metadata update (own sender + server time)', updateDoc(doc(A, 'chats/A_B'), { lastSenderId: 'A', lastMessage: 'hi', lastMessageAt: serverTimestamp() }));

console.log('\n[events — join/leave coupled to registration]');
// Legit join: create registration + bump the event counts in ONE batch.
const joinBatch = writeBatch(A);
joinBatch.set(doc(A, 'registrations/A_E1'), { userId: 'A', eventId: 'E1', status: 'registered', genderField: 'male', timestamp: serverTimestamp() });
joinBatch.update(doc(A, 'events/E1'), { attendeeCount: 1, attendeeIds: ['A'], 'attendeeCounts.male': 1 });
await ok('join event (registration + event in one batch)', joinBatch.commit());
// Injection: bump attendeeIds/count on the event with NO registration.
await no('attendeeIds injection without registration denied', updateDoc(doc(D, 'events/E1'), { attendeeCount: 2, attendeeIds: ['A', 'D'], attendeeCounts: { male: 1, female: 0, other: 1 } }));
// Gender-agnostic leave: A registered as male; leave decrements the STORED bucket
// even though the user's current gender is irrelevant now.
const leaveBatch = writeBatch(A);
leaveBatch.update(doc(A, 'registrations/A_E1'), { status: 'cancelled' });
leaveBatch.update(doc(A, 'events/E1'), { attendeeCount: 0, attendeeIds: [], 'attendeeCounts.male': 0 });
await ok('leave event using stored genderField (male)', leaveBatch.commit());
// Capacity: E2 is full (1/1); a join pushing it to 2 must be denied.
const capBatch = writeBatch(A);
capBatch.set(doc(A, 'registrations/A_E2'), { userId: 'A', eventId: 'E2', status: 'registered', genderField: 'male', timestamp: serverTimestamp() });
capBatch.update(doc(A, 'events/E2'), { attendeeCount: 2, attendeeIds: ['X', 'A'], 'attendeeCounts.male': 2 });
await no('join past capacity denied', capBatch.commit());
// R21 fix — a joiner can't inject foreign keys into the event's attendeeCounts map.
const junkBatch = writeBatch(A);
junkBatch.set(doc(A, 'registrations/A_E1'), { userId: 'A', eventId: 'E1', status: 'registered', genderField: 'male', timestamp: serverTimestamp() });
junkBatch.update(doc(A, 'events/E1'), { attendeeCount: 1, attendeeIds: ['A'], attendeeCounts: { male: 1, female: 0, other: 0, hacker: 9999 } });
await no('join with junk attendeeCounts key denied', junkBatch.commit());

console.log('\n[R2 fixes — profileComplete transition / checkin owner-list / genderField immutability]');
// Editing an already-complete profile is NOT re-validated (D is complete from above).
await ok('edit complete profile: drop to 1 photo allowed (no re-validation)', updateDoc(doc(D, 'users/D'), { photos: ['p1'] }));
// But you still cannot CREATE a doc that is born complete without the fields.
await no('create profile born complete without fields denied', setDoc(doc(F, 'users/F'), { profileComplete: true }));
await ok('create incomplete profile allowed', setDoc(doc(F, 'users/F'), { name: 'F', profileComplete: false }));
// Checkin list: venue owner + admin may list their venue; a regular user may not.
await ok('venue owner lists own venue checkins', getDocs(query(collection(BIZ, 'checkins'), where('venueId', '==', 'BIZ'))));
await no('regular user lists another venue checkins denied', getDocs(query(collection(C, 'checkins'), where('venueId', '==', 'BIZ'))));
// Registration genderField immutable while registered; cancel keeps it.
await no('mutate genderField while registered denied', updateDoc(doc(A, 'registrations/A_E3'), { genderField: 'female' }));
await ok('cancel keeps genderField allowed', updateDoc(doc(A, 'registrations/A_E3'), { status: 'cancelled' }));

console.log('\n[venue_presence_entries — identity-free live counts coupled to check-in]');
// Legit check-in: private check-in + public entry (referencing it) in one batch.
const ci = writeBatch(A);
ci.set(doc(A, 'checkins/A_vP'), { userId: 'A', venueId: 'vP', gender: 'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ENT1' });
ci.set(doc(A, 'venue_presence_entries/ENT1'), { venueId: 'vP', gender: 'male', expiresAt: inMs(4 * 3600 * 1000) });
await ok('check-in creates coupled presence entry', ci.commit());
// Forge a presence entry with no matching check-in.
await no('presence entry without matching check-in denied', setDoc(doc(A, 'venue_presence_entries/FORGE'), { venueId: 'vQ', gender: 'male', expiresAt: inMs(4 * 3600 * 1000) }));
// Gender must match the check-in it is coupled to.
const gm = writeBatch(A);
gm.set(doc(A, 'checkins/A_vR'), { userId: 'A', venueId: 'vR', gender: 'male', ...AT, timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ENT2' });
gm.set(doc(A, 'venue_presence_entries/ENT2'), { venueId: 'vR', gender: 'female', expiresAt: inMs(4 * 3600 * 1000) });
await no('presence entry gender mismatch denied', gm.commit());
// Anyone may LIST entries to count — but they carry no userId, so no enumeration.
await ok('list presence entries by venue (aggregate only)', getDocs(query(collection(B, 'venue_presence_entries'), where('venueId', '==', 'vP'))));
// The coupled owner may refresh expiresAt (re-check-in reuses the entry).
await ok('coupled owner refreshes entry expiresAt', updateDoc(doc(A, 'venue_presence_entries/ENT1'), { expiresAt: inMs(4 * 3600 * 1000) }));
// Venue-scoped presence IDENTITY (venue_presence/{venueId}/present/{uid}) — coupled
// to the caller's own check-in, owner-pinned, and readable only per-venue.
await ok('present doc coupled to own check-in allowed', setDoc(doc(A, 'venue_presence/vP/present/A'), { gender: 'male', expiresAt: inMs(4 * 3600 * 1000) }));
await no('present doc for ANOTHER uid denied', setDoc(doc(A, 'venue_presence/vP/present/B'), { gender: 'male', expiresAt: inMs(4 * 3600 * 1000) }));
await no('present doc without a matching check-in denied', setDoc(doc(A, 'venue_presence/vQ/present/A'), { gender: 'male', expiresAt: inMs(4 * 3600 * 1000) }));
await no('present doc with mismatched gender denied', setDoc(doc(A, 'venue_presence/vP/present/A'), { gender: 'female', expiresAt: inMs(4 * 3600 * 1000) }));
await ok('present list readable when checked in HERE (A at vP)', getDocs(collection(A, 'venue_presence/vP/present')));
await no('present list NOT readable when not checked in here (B) — anti-stalking co-presence gate', getDocs(collection(B, 'venue_presence/vP/present')));
await no('present list NOT readable with an EXPIRED check-in (C) — access lapses with presence', getDocs(collection(C, 'venue_presence/vP/present')));
await no('collectionGroup(present) denied — no cross-venue tracking/dump', getDocs(collectionGroup(B, 'present')));
await ok('deleting an already-gone presence entry is a no-op (null-safe, not denied)', deleteDoc(doc(A, 'venue_presence_entries/GHOSTENTRY')));
await no('non-owner cannot delete presence entry', deleteDoc(doc(B, 'venue_presence_entries/ENT1')));
// Can't delete a check-in while orphaning its entry (blocks churn self-inflation)...
await no('delete checkin leaving entry orphaned denied', deleteDoc(doc(A, 'checkins/A_vP')));
// ...but a real checkout deletes entry + checkin together.
const chkOut = writeBatch(A);
chkOut.delete(doc(A, 'venue_presence_entries/ENT1'));
chkOut.delete(doc(A, 'checkins/A_vP'));
await ok('checkout deletes entry + checkin together', chkOut.commit());

console.log('\n[R4 fixes — gender immutable / venue existence / registration gender]');
await no('complete profile cannot change gender', updateDoc(doc(D, 'users/D'), { gender: 'female' }));
await ok('incomplete profile can set gender (onboarding)', updateDoc(doc(G, 'users/G'), { gender: 'female' }));
await no('checkin at non-existent venue denied', setDoc(doc(A, 'checkins/A_ghost'), { userId: 'A', venueId: 'ghost', gender: 'male', timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'cg1' }));
await no('register with spoofed genderField denied', setDoc(doc(A, 'registrations/A_E9'), { userId: 'A', eventId: 'E9', status: 'registered', genderField: 'female', timestamp: serverTimestamp() }));
await no('register with mismatched regId denied', setDoc(doc(A, 'registrations/WRONGID'), { userId: 'A', eventId: 'E9', status: 'registered', genderField: 'male', timestamp: serverTimestamp() }));
await ok('register with matching genderField + regId allowed', setDoc(doc(A, 'registrations/A_E9'), { userId: 'A', eventId: 'E9', status: 'registered', genderField: 'male', timestamp: serverTimestamp() }));
// R20 fix — an incomplete-profile user with a junk gender can't register a non-enum
// genderField (which would spawn a junk attendeeCounts bucket and inflate the total).
await ok('incomplete user can set a junk gender raw', updateDoc(doc(G, 'users/G'), { gender: 'zzz' }));
await no('register with junk (non-enum) genderField denied', setDoc(doc(G, 'registrations/G_E9'), { userId: 'G', eventId: 'E9', status: 'registered', genderField: 'zzz', timestamp: serverTimestamp() }));

console.log('\n[R5 fixes — profileComplete monotonic / genderField pinned on re-join]');
await no('cannot downgrade profileComplete true->false (monotonic)', updateDoc(doc(D, 'users/D'), { profileComplete: false }));
await no('re-join event with spoofed genderField denied', updateDoc(doc(A, 'registrations/A_E3'), { status: 'registered', genderField: 'female' }));
await ok('re-join event with real genderField allowed', updateDoc(doc(A, 'registrations/A_E3'), { status: 'registered', genderField: 'male' }));
// R19 desync fix: genderField is immutable vs its STORED value (not just profileGender),
// so it can never be re-pinned to a different bucket than the one the join counted.
await no('re-pin genderField to a third bucket denied (desync fix)', updateDoc(doc(A, 'registrations/A_E3'), { status: 'registered', genderField: 'other' }));

console.log('\n[business PII — contact in private subdoc]');
await no('business cannot put contactName on public doc', updateDoc(doc(BIZ, 'businesses/BIZ'), { contactName: 'X' }));
await ok('owner writes contact PII to private subdoc', setDoc(doc(BIZ, 'businesses/BIZ/private/contact'), { contactName: 'Biz Owner', email: 'owner@biz.com' }));
await ok('owner reads own contact PII', getDoc(doc(BIZ, 'businesses/BIZ/private/contact')));
await no('other user cannot read business contact PII', getDoc(doc(C, 'businesses/BIZ/private/contact')));

console.log('\n[R6 fixes — checkin get scope / chat lastMessage cap]');
await ok('owner GETs own checkin', getDoc(doc(A, 'checkins/A_v1')));
await no('non-owner cannot GET a specific checkin (anti-stalking)', getDoc(doc(C, 'checkins/A_v1')));
await no('oversized lastMessage denied', updateDoc(doc(A, 'chats/A_B'), { lastMessage: 'x'.repeat(2001), lastMessageAt: serverTimestamp() }));

console.log('\n[R7 fix — event capacity floor server-side]');
await no('business lowers capacity below attendeeCount denied', updateDoc(doc(BIZ, 'events/E2'), { capacity: 0 }));
await ok('business raises capacity allowed', updateDoc(doc(BIZ, 'events/E2'), { capacity: 5 }));

console.log('\n[R8 fix — event date not into past / message key whitelist]');
await no('business moves event date to the past denied', updateDoc(doc(BIZ, 'events/E1'), { dateTime: inMs(-86400000) }));
await ok('business moves event date to the future allowed', updateDoc(doc(BIZ, 'events/E1'), { dateTime: inMs(86400000) }));
await no('message with extra field denied', setDoc(doc(A, 'chats/A_B/messages/mx'), { senderId: 'A', text: 'hi', read: false, timestamp: serverTimestamp(), extra: 'x' }));

console.log('\n[R9 fix — suspended-business event registration blocked]');
await no('register for a suspended-business event denied', setDoc(doc(A, 'registrations/A_ESU'), { userId: 'A', eventId: 'ESU', status: 'registered', genderField: 'male', timestamp: serverTimestamp() }));

console.log('\n[R10 fix — cancel->rejoin gate + chat-create validation]');
await no('re-join a suspended-business event denied (cancel->rejoin bypass closed)', updateDoc(doc(A, 'registrations/A_ESU2'), { status: 'registered' }));
await no('chat create with non-canonical id denied (anti-flood)', setDoc(doc(A, 'chats/JUNK'), { participants: ['A', 'B'], lastMessage: '', lastMessageAt: serverTimestamp() }));

console.log('\n[R16 fix — read rules tolerate a NON-EXISTENT doc (transaction pre-reads)]');
// createChatForMatch / registerForEvent tx.get() a not-yet-existing doc; the read
// rule must return not-found, not error on resource.data and deny the whole tx.
await ok('get non-existent chat returns not-found (null-resource guard)', getDoc(doc(A, 'chats/ZZZ_NONE')));
await ok('get non-existent registration returns not-found', getDoc(doc(A, 'registrations/A_NONE')));
await no('get non-existent checkin denied (no existence oracle for stalking)', getDoc(doc(A, 'checkins/A_NONE')));

console.log('\n[message length — does rule size() count chars or bytes?]');
const heavyHeb = 'א'.repeat(1500); // 1500 chars = 3000 UTF-8 bytes
try {
  await assertSucceeds(setDoc(doc(A, 'chats/A_B/messages/mheb'), { senderId:'A', text: heavyHeb, read:false, timestamp: serverTimestamp() }));
  console.log('  RESULT: size() counts CHARACTERS (1500 Hebrew chars accepted) -> client .length agrees, NO bug');
} catch {
  console.log('  RESULT: size() counts BYTES (1500 Hebrew chars = 3000 bytes REJECTED) -> client .length over-accepts, REAL bug');
}

console.log('\n[debug_logs]');
await no('non-admin cannot read debug_logs', getDocs(collection(A, 'debug_logs')));
await ok('debug_logs create with a bounded string payload allowed', setDoc(doc(A, 'debug_logs/dl1'), { scope: 's', message: 'm', payload: '{"k":"v"}', uid: 'A', timestamp: serverTimestamp() }));
await ok('debug_logs create with null payload allowed', setDoc(doc(A, 'debug_logs/dl1b'), { scope: 's', message: 'm', payload: null, uid: 'A', timestamp: serverTimestamp() }));
await no('debug_logs create with extra field denied', setDoc(doc(A, 'debug_logs/dl2'), { scope: 's', message: 'm', uid: 'A', timestamp: serverTimestamp(), evil: 'x' }));
// payload cap (r4): reject an arbitrary map (uncappable by rules) and an oversized string.
await no('debug_logs create with a MAP payload denied (must be null|string)', setDoc(doc(A, 'debug_logs/dl3'), { scope: 's', message: 'm', payload: { big: 'x' }, uid: 'A', timestamp: serverTimestamp() }));
await no('debug_logs create with an oversized (>8000) string payload denied', setDoc(doc(A, 'debug_logs/dl4'), { scope: 's', message: 'm', payload: 'x'.repeat(8001), uid: 'A', timestamp: serverTimestamp() }));

await testEnv.cleanup();
console.log(`\nALL RULES TESTS PASSED (${passed} assertions)`);
