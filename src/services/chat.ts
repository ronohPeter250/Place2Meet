import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limitToLast,
  endBefore,
  documentId,
  getDoc,
  getDocs,
  updateDoc,
  runTransaction,
  writeBatch,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Timestamp | FieldValue;
  lastSenderId?: string;
  reads?: Record<string, Timestamp>;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp | FieldValue;
  read: boolean;
}

export function subscribeToChats(
  callback: (chats: Chat[]) => void,
  onError?: (error: Error) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Chat[];
    callback(chats);
  }, (error) => {
    console.error('subscribeToChats error:', error);
    onError?.(error);
  });
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void,
  messageLimit = 50,
  onError?: (error: Error) => void
): () => void {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    orderBy('timestamp', 'asc'),
    limitToLast(messageLimit)
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Message[];
    callback(messages);
  }, (error) => {
    console.error('subscribeToMessages error:', error);
    onError?.(error);
  });
}

/**
 * Fetch a page of messages OLDER than the boundary message (its resolved
 * timestamp + id), returned oldest-first. Used for "load earlier" pagination.
 * Returns [] when there is nothing older.
 *
 * The cursor is COMPOSITE (timestamp, documentId) so it excludes exactly the one
 * boundary document — a bare value cursor on timestamp alone would skip every
 * message sharing the boundary's exact timestamp, silently dropping them from
 * scrollback.
 */
export async function fetchEarlierMessages(
  chatId: string,
  before: Timestamp,
  beforeId: string,
  pageSize = 50
): Promise<Message[]> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    orderBy('timestamp', 'asc'),
    orderBy(documentId(), 'asc'),
    endBefore(before, beforeId),
    limitToLast(pageSize)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[];
}

export async function sendMessage(
  chatId: string,
  text: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (!text.trim()) return;
  if (text.length > 2000) throw new Error('Message too long (max 2000 characters)');

  // Participant check is enforced by Firestore Security Rules — a non-participant
  // write is rejected server-side, so no client-side getDoc gate is needed.

  // Atomic batch: message + chat metadata update
  const batch = writeBatch(db);
  const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
  batch.set(msgRef, {
    senderId: uid,
    text: text.trim(),
    timestamp: serverTimestamp(),
    read: false,
  });
  batch.update(doc(db, 'chats', chatId), {
    lastMessage: text.trim().slice(0, 100),
    lastMessageAt: serverTimestamp(),
    lastSenderId: uid,
  });
  await batch.commit();
}

/**
 * Mark the given chat as read up to now for the current user, by stamping
 * reads.{uid}. Drives the unread indicator (a chat is unread when its
 * lastMessageAt is newer than reads[uid] and the last sender was the other user).
 * Best-effort: failures are swallowed so opening a chat never errors on this.
 */
export async function markChatRead(chatId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      [`reads.${uid}`]: serverTimestamp(),
    });
  } catch (err) {
    console.error('[markChatRead] failed:', err);
  }
}

/** True if `chat` has an unread message for `uid` (last message from the other user, newer than uid's read stamp). */
export function isChatUnread(chat: Chat, uid: string): boolean {
  if (!chat.lastSenderId || chat.lastSenderId === uid) return false;
  const lastAt = chat.lastMessageAt as Timestamp | null;
  if (!lastAt?.toMillis) return false;
  const readAt = chat.reads?.[uid];
  if (readAt === undefined) return true;                // never read
  // A pending (not-yet-resolved) read stamp means we just marked it read — treat
  // as read to avoid a false "unread" flash on the writer's own snapshot.
  if (!(readAt as Timestamp)?.toMillis) return false;
  return lastAt.toMillis() > (readAt as Timestamp).toMillis();
}

export async function createChatForMatch(
  user1: string,
  user2: string
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (uid !== user1 && uid !== user2) throw new Error('Cannot create chat for other users');

  // Verify a mutual match exists before creating the chat (server rules also
  // enforce this, so a bypass attempt is rejected either way).
  const swipe1 = await getDoc(doc(db, 'swipes', `${user1}_${user2}`));
  const swipe2 = await getDoc(doc(db, 'swipes', `${user2}_${user1}`));
  if (!swipe1.exists() || swipe1.data()?.action !== 'like' ||
      !swipe2.exists() || swipe2.data()?.action !== 'like') {
    throw new Error('Cannot create chat without a mutual match');
  }

  // Sort ONCE and use the same order for both the doc id and the participants
  // array — the rule binds chatId to the SORTED participants (participants[0] <
  // participants[1]), so writing an unsorted array would be denied for ~half of
  // uid orderings. (Reads use array-contains / `uid in participants`, both
  // order-independent, so sorting has no read-side effect.)
  const pair = [user1, user2].sort();
  const chatId = pair.join('_');
  const chatRef = doc(db, 'chats', chatId);

  // Atomic create-if-absent. A transaction ensures two clients racing on the same
  // match (or a retry) cannot both create the doc — the second sees it exists and
  // does nothing, so existing metadata (lastMessage/lastMessageAt) is never
  // clobbered and the chat is never reordered or blanked.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(chatRef);
    if (!snap.exists()) {
      tx.set(chatRef, {
        participants: pair,
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
      });
    }
  });

  return chatId;
}

// Runs at most once per app session (best-effort). Reset to false only on a
// hard failure of the initial query so a later open can retry.
let reconcileInFlight = false;
// Keyed by uid (not a bare boolean) so a second account signed in during the same
// app session still reconciles instead of inheriting the first user's "done" flag.
let reconcileDoneForUid: string | null = null;

/**
 * Recover matches whose chat was never created (a match-time failure or the
 * simultaneous-like race where neither client detected the match). Scans the
 * current user's outgoing likes, checks each for a reciprocal like in parallel,
 * and creates any missing chat. Idempotent, best-effort, and guarded to run once
 * per session so it doesn't re-read the swipe graph on every chat-tab open.
 * Returns the number of chats created.
 */
export async function reconcileMissingChats(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid || reconcileInFlight || reconcileDoneForUid === uid) return 0;
  reconcileInFlight = true;

  try {
    const mySwipesSnap = await getDocs(
      query(collection(db, 'swipes'), where('fromUser', '==', uid))
    );
    const likedUids = mySwipesSnap.docs
      .filter(d => d.data().action === 'like')
      .map(d => d.data().toUser as string);

    // Reverse-swipe + existing-chat checks run in parallel (not N sequential
    // round-trips) so a large swipe history doesn't stall reconciliation.
    const checks = await Promise.all(likedUids.map(async (other) => {
      try {
        const chatId = [uid, other].sort().join('_');
        const [reverse, chatSnap] = await Promise.all([
          getDoc(doc(db, 'swipes', `${other}_${uid}`)),
          getDoc(doc(db, 'chats', chatId)),
        ]);
        const mutual = reverse.exists() && reverse.data()?.action === 'like';
        return { other, mutual, hasChat: chatSnap.exists() };
      } catch {
        return null;
      }
    }));

    let created = 0;
    for (const c of checks) {
      if (!c || !c.mutual || c.hasChat) continue;
      try {
        await createChatForMatch(uid, c.other);
        created++;
      } catch (err) {
        console.error('[reconcileMissingChats] create failed for', c.other, err);
      }
    }
    reconcileDoneForUid = uid;
    return created;
  } finally {
    reconcileInFlight = false;
  }
}
