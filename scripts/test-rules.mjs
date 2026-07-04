// Firestore security-rules tests for the chat/match/swipe subsystem.
// Run via:  firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, serverTimestamp,
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
  await setDoc(doc(db, 'businesses/BIZ'), { name: 'Biz' });
  await setDoc(doc(db, 'events/E1'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 5, attendeeCount: 0, attendeeIds: [], attendeeCounts: { male: 0, female: 0, other: 0 } });
  await setDoc(doc(db, 'events/E2'), { createdBy: 'BIZ', venueId: 'BIZ', capacity: 1, attendeeCount: 1, attendeeIds: ['X'], attendeeCounts: { male: 1, female: 0, other: 0 } });
  // A registered doc for the genderField-immutability test, and a checkin at BIZ's venue.
  await setDoc(doc(db, 'registrations/A_E3'), { userId: 'A', eventId: 'E3', status: 'registered', genderField: 'male', timestamp: serverTimestamp() });
  await setDoc(doc(db, 'checkins/U_BIZ'), { userId: 'U', venueId: 'BIZ', timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600000)) });
  // A victim's presence entry (for the delete-IDOR test).
  await setDoc(doc(db, 'venue_presence_entries/VICT'), { venueId: 'vX', gender: 'female', expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600000)) });
  // Venues that the check-in tests target (check-in now requires the venue to exist).
  for (const v of ['v1', 'v2', 'v3', 'v4', 'v9', 'vP', 'vR', 'vX']) {
    await setDoc(doc(db, 'venues/' + v), { name: v });
  }
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
await ok('valid checkin (now+4h)', setDoc(doc(A, 'checkins/A_v1'), { userId:'A', venueId:'v1', gender:'male', timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ci1' }));
await no('far-future expiresAt denied', setDoc(doc(A, 'checkins/A_v2'), { userId:'A', venueId:'v2', gender:'male', timestamp: serverTimestamp(), expiresAt: inMs(100*3600*1000), entryId:'ci2' }));
await no('past expiresAt denied', setDoc(doc(A, 'checkins/A_v3'), { userId:'A', venueId:'v3', gender:'male', timestamp: serverTimestamp(), expiresAt: inMs(-3600*1000), entryId:'ci3' }));
await no('checkin gender != profile denied (gender spoof)', setDoc(doc(A, 'checkins/A_v4'), { userId:'A', venueId:'v4', gender:'female', timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'ci4' }));
await no('checkin pointing at an existing (victim) entry denied', setDoc(doc(A, 'checkins/A_vX'), { userId:'A', venueId:'vX', gender:'male', timestamp: serverTimestamp(), expiresAt: inMs(4*3600*1000), entryId:'VICT' }));

console.log('\n[R1 fixes — swipe id binding / checkins list / profileComplete / reads+metadata]');
await no('forge reverse swipe (id B_A, fromUser A) denied', setDoc(doc(A, 'swipes/B_A'), { fromUser: 'A', toUser: 'B', action: 'like', timestamp: serverTimestamp() }));
await no('self-swipe denied', setDoc(doc(A, 'swipes/A_A'), { fromUser: 'A', toUser: 'A', action: 'like', timestamp: serverTimestamp() }));
await ok('A lists OWN checkins', getDocs(query(collection(A, 'checkins'), where('userId', '==', 'A'))));
await no('venue-scoped checkin list (enumerate presence) denied', getDocs(query(collection(A, 'checkins'), where('venueId', '==', 'v1'))));
await no('checkin with mismatched doc id denied', setDoc(doc(A, 'checkins/A_WRONG'), { userId: 'A', venueId: 'v9', gender: 'male', timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ci9' }));
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
ci.set(doc(A, 'checkins/A_vP'), { userId: 'A', venueId: 'vP', gender: 'male', timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ENT1' });
ci.set(doc(A, 'venue_presence_entries/ENT1'), { venueId: 'vP', gender: 'male', expiresAt: inMs(4 * 3600 * 1000) });
await ok('check-in creates coupled presence entry', ci.commit());
// Forge a presence entry with no matching check-in.
await no('presence entry without matching check-in denied', setDoc(doc(A, 'venue_presence_entries/FORGE'), { venueId: 'vQ', gender: 'male', expiresAt: inMs(4 * 3600 * 1000) }));
// Gender must match the check-in it is coupled to.
const gm = writeBatch(A);
gm.set(doc(A, 'checkins/A_vR'), { userId: 'A', venueId: 'vR', gender: 'male', timestamp: serverTimestamp(), expiresAt: inMs(4 * 3600 * 1000), entryId: 'ENT2' });
gm.set(doc(A, 'venue_presence_entries/ENT2'), { venueId: 'vR', gender: 'female', expiresAt: inMs(4 * 3600 * 1000) });
await no('presence entry gender mismatch denied', gm.commit());
// Anyone may LIST entries to count — but they carry no userId, so no enumeration.
await ok('list presence entries by venue (aggregate only)', getDocs(query(collection(B, 'venue_presence_entries'), where('venueId', '==', 'vP'))));
// The coupled owner may refresh expiresAt (re-check-in reuses the entry).
await ok('coupled owner refreshes entry expiresAt', updateDoc(doc(A, 'venue_presence_entries/ENT1'), { expiresAt: inMs(4 * 3600 * 1000) }));
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

console.log('\n[R5 fixes — profileComplete monotonic / genderField pinned on re-join]');
await no('cannot downgrade profileComplete true->false (monotonic)', updateDoc(doc(D, 'users/D'), { profileComplete: false }));
await no('re-join event with spoofed genderField denied', updateDoc(doc(A, 'registrations/A_E3'), { status: 'registered', genderField: 'female' }));
await ok('re-join event with real genderField allowed', updateDoc(doc(A, 'registrations/A_E3'), { status: 'registered', genderField: 'male' }));

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

await testEnv.cleanup();
console.log(`\nALL RULES TESTS PASSED (${passed} assertions)`);
