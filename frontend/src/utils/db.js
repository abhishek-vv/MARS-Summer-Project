/**
 * Open/Initialize the IndexedDB database for a given room.
 */
export function initDB(roomId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`p2p-share-${roomId}`, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks');
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

/**
 * Check if OPFS is available in this browser
 */
export async function isOPFSAvailable() {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      return false;
    }
    // Test access
    const root = await navigator.storage.getDirectory();
    return !!root;
  } catch (err) {
    console.warn('OPFS not available:', err);
    return false;
  }
}

/**
 * Determine storage backend based on file size
 * Large files (>500MB) use OPFS, smaller use IndexedDB
 */
export function shouldUseOPFS(fileSize) {
  const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024; // 500MB
  return fileSize > LARGE_FILE_THRESHOLD;
}

/**
 * Initialize OPFS storage for large file transfer
 */
export async function initOPFS(roomId, fileName) {
  try {
    const root = await navigator.storage.getDirectory();
    const roomDir = await root.getDirectoryHandle(roomId, { create: true });
    const fileHandle = await roomDir.getFileHandle(`${fileName}.transfer`, { create: true });
    return { root: roomDir, fileHandle };
  } catch (err) {
    console.error('OPFS initialization failed:', err);
    throw err;
  }
}

/**
 * Save a chunk to OPFS using WritableStream
 */
export async function saveChunkOPFS(fileHandle, chunkIndex, arrayBuffer, isFirstChunk) {
  try {
    const writable = await fileHandle.createWritable(isFirstChunk ? { keepExistingData: false } : { keepExistingData: true });
    
    // Write to the correct position
    const position = chunkIndex * 16384; // CHUNK_SIZE = 16384
    await writable.seek(position);
    await writable.write(new Uint8Array(arrayBuffer));
    await writable.close();
    
    return true;
  } catch (err) {
    console.error('OPFS chunk save failed:', err);
    throw err;
  }
}

/**
 * Read all chunks from OPFS
 */
export async function getAllChunksOPFS(fileHandle, totalChunks) {
  try {
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    
    const chunks = [];
    const chunkSize = 16384; // CHUNK_SIZE
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      chunks[i] = buffer.slice(start, end);
    }
    
    return chunks;
  } catch (err) {
    console.error('OPFS read failed:', err);
    throw err;
  }
}

/**
 * Delete OPFS directory
 */
export async function deleteOPFS(roomId) {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(roomId, { recursive: true });
  } catch (err) {
    console.warn('OPFS delete failed (may not exist):', err);
  }
}

/**
 * Save a chunk of file data (ArrayBuffer) to IndexedDB.
 */
export function saveChunk(roomId, chunkIndex, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`p2p-share-${roomId}`, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks');
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      
      // Ensure object store exists
      if (!db.objectStoreNames.contains('chunks')) {
        db.close();
        reject(new Error('Chunks object store not initialized'));
        return;
      }
      
      const tx = db.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      
      const putRequest = store.put(arrayBuffer, chunkIndex);
      
      putRequest.onsuccess = () => {
        resolve();
      };
      putRequest.onerror = () => {
        reject(putRequest.error);
      };
      
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Fetch a single chunk by its index.
 */
export function getChunk(roomId, chunkIndex) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`p2p-share-${roomId}`, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks');
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      
      if (!db.objectStoreNames.contains('chunks')) {
        db.close();
        reject(new Error('Chunks object store not found'));
        return;
      }
      
      const tx = db.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      
      const getRequest = store.get(chunkIndex);
      
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
      
      tx.oncomplete = () => db.close();
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves all saved chunks from IndexedDB, preserving key order.
 */
export function getAllChunks(roomId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`p2p-share-${roomId}`, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks');
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      
      // Ensure object store exists before querying
      if (!db.objectStoreNames.contains('chunks')) {
        db.close();
        reject(new Error('Chunks object store not found'));
        return;
      }
      
      const tx = db.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      
      const chunks = [];
      const cursorRequest = store.openCursor();
      
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          chunks[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(chunks);
        }
      };
      
      cursorRequest.onerror = () => reject(cursorRequest.error);
      tx.oncomplete = () => db.close();
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete the room-specific IndexedDB database.
 */
export function deleteDB(roomId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`p2p-share-${roomId}`);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}
