import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limitToLast,
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
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp | FieldValue;
  read: boolean;
}

export function subscribeToChats(
  callback: (chats: Chat[]) => void
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
  });
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void,
  messageLimit = 50
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
  });
}

export async function sendMessage(
  chatId: string,
  text: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (!text.trim()) return;
  if (text.length > 2000) throw new Error('Message too long (max 2000 characters)');

  // Participant check is enforced by Firestore Security Rules
  // No client-side getDoc needed - rules deny unauthorized writes

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
  });
  await batch.commit();
}

export async function createChatForMatch(
  user1: string,
  user2: string
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (uid !== user1 && uid !== user2) throw new Error('Cannot create chat for other users');

  // Verify that a mutual match exists before creating the chat
  const { getDoc } = await import('firebase/firestore');
  const swipe1 = await getDoc(doc(db, 'swipes', `${user1}_${user2}`));
  const swipe2 = await getDoc(doc(db, 'swipes', `${user2}_${user1}`));
  if (!swipe1.exists() || swipe1.data()?.action !== 'like' ||
      !swipe2.exists() || swipe2.data()?.action !== 'like') {
    throw new Error('Cannot create chat without a mutual match');
  }

  const chatId = [user1, user2].sort().join('_');
  const chatRef = doc(db, 'chats', chatId);

  // Use set with merge to avoid overwriting if chat already exists
  const { setDoc } = await import('firebase/firestore');
  await setDoc(chatRef, {
    participants: [user1, user2],
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
  }, { merge: true });

  return chatId;
}
