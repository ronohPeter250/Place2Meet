import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../config/firebase';
import { debugLog, debugError } from '../utils/debugLog';

const ALLOWED_URI_SCHEMES = ['file://', 'content://', 'ph://'];

function validateUri(uri: string): void {
  const isAllowed = ALLOWED_URI_SCHEMES.some(scheme => uri.startsWith(scheme));
  if (!isAllowed) {
    throw new Error('Invalid photo URI scheme');
  }
}

function validatePathOwnership(uid: string, path: string): void {
  if (!path.startsWith(`users/${uid}/`) && !path.startsWith(`businesses/${uid}/`)) {
    throw new Error('Unauthorized storage path');
  }
}

async function uploadToStorage(path: string, uri: string): Promise<string> {
  debugLog('STORAGE', 'upload start', { path, scheme: uri.slice(0, uri.indexOf('://') + 3) });
  try {
    validateUri(uri);
  } catch (err) {
    debugError('STORAGE', 'upload rejected: bad uri scheme', err, { path });
    throw err;
  }

  let response: Response;
  try {
    response = await fetch(uri);
  } catch (err) {
    debugError('STORAGE', 'upload could not read local file', err, { path });
    throw err;
  }
  if (!response.ok) {
    debugLog('STORAGE', 'FAIL upload could not read local file', { path, status: response.status });
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const blob = await response.blob();
  try {
    const storageRef = ref(storage, path);
    // Storage rules require contentType to match image/.* . Blobs fetched from
    // local file:// uris (e.g. downscaled ImageManipulator output) often have an
    // empty type, which Firebase would otherwise upload as
    // application/octet-stream → rule rejection ("error uploading the image").
    // Our upload paths are always .jpg, so default to image/jpeg when the blob
    // type isn't a recognizable image type.
    const contentType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    try {
      await uploadBytes(storageRef, blob, { contentType });
    } catch (err) {
      // Storage-rule rejections surface here as 'storage/unauthorized'. Logging the
      // resolved contentType matters: an unexpected type is the usual cause.
      debugError('STORAGE', 'uploadBytes rejected', err, { path, contentType, blobType: blob.type || null, bytes: blob.size });
      throw err;
    }
    debugLog('STORAGE', 'upload ok', { path, contentType, bytes: blob.size });
    return path;
  } finally {
    const blobWithClose = blob as Blob & { close?: () => void };
    blobWithClose.close?.();
  }
}

export async function getPhotoURL(storagePath: string): Promise<string> {
  const storageRef = ref(storage, storagePath);
  return getDownloadURL(storageRef);
}

export async function uploadUserPhoto(
  uid: string,
  uri: string,
  photoIndex: number
): Promise<string> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) throw new Error('Unauthorized');
  const path = `users/${uid}/photos/photo_${photoIndex}_${Date.now()}.jpg`;
  return uploadToStorage(path, uri);
}

export async function uploadBusinessLogo(uid: string, uri: string): Promise<string> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) throw new Error('Unauthorized');
  const path = `businesses/${uid}/logo_${Date.now()}.jpg`;
  return uploadToStorage(path, uri);
}

export async function uploadBusinessPhoto(
  uid: string,
  uri: string,
  photoIndex: number
): Promise<string> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) throw new Error('Unauthorized');
  const path = `businesses/${uid}/photos/photo_${photoIndex}_${Date.now()}.jpg`;
  return uploadToStorage(path, uri);
}

export async function deletePhoto(uid: string, path: string): Promise<void> {
  validatePathOwnership(uid, path);
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) throw new Error('Unauthorized');
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}
