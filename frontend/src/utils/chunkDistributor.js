/**
 * Chunk Distributor - Distributes file chunks across multiple receivers
 * for parallel downloading in mesh swarming mode
 */

/**
 * Distribute chunk ranges among multiple receivers
 * Each receiver downloads different portions and can share with others
 * 
 * Example with 3 receivers and 400 chunks:
 * Receiver 0: chunks 0-133 from sender
 * Receiver 1: chunks 134-267 from sender + 0-133 from receiver 0
 * Receiver 2: chunks 268-400 from sender + 0-267 from receivers 0,1
 */
export function distributeChunkRanges(receiverCount, totalChunks) {
  const distribution = {};
  const chunkSize = Math.ceil(totalChunks / receiverCount);
  
  for (let i = 0; i < receiverCount; i++) {
    const startChunk = i * chunkSize;
    const endChunk = Math.min((i + 1) * chunkSize, totalChunks);
    
    distribution[i] = {
      receiverIndex: i,
      primary: { start: startChunk, end: endChunk },
      secondary: i > 0 ? { start: 0, end: startChunk } : null,
      sources: ['sender']
    };
    
    // Secondary sources: can download from previous receivers
    if (i > 0) {
      distribution[i].sources.push(...Array.from({length: i}, (_, idx) => `receiver-${idx}`));
    }
  }
  
  return distribution;
}

/**
 * Get chunk assignments for a specific receiver
 * Returns which peer should provide each chunk
 */
export function getChunkAssignments(receiverIndex, totalChunks, totalReceivers) {
  const distribution = distributeChunkRanges(totalReceivers, totalChunks);
  const assignments = {};
  
  // Primary chunks - download from sender
  const primary = distribution[receiverIndex].primary;
  for (let i = primary.start; i < primary.end; i++) {
    assignments[i] = 'sender';
  }
  
  // Secondary chunks - can download from earlier receivers
  if (distribution[receiverIndex].secondary) {
    const secondary = distribution[receiverIndex].secondary;
    for (let i = secondary.start; i < secondary.end; i++) {
      // Assign to the receiver that has it
      const sourceReceiverIndex = Math.floor(i / Math.ceil(totalChunks / totalReceivers));
      if (sourceReceiverIndex < receiverIndex) {
        assignments[i] = `receiver-${sourceReceiverIndex}`;
      }
    }
  }
  
  return assignments;
}

/**
 * Determine if a receiver has a chunk (for sharing with other peers)
 */
export function receiverHasChunk(chunkIndex, receiverIndex, totalChunks, totalReceivers) {
  const distribution = distributeChunkRanges(totalReceivers, totalChunks);
  const receiver = distribution[receiverIndex];
  
  // Check primary range
  if (chunkIndex >= receiver.primary.start && chunkIndex < receiver.primary.end) {
    return true;
  }
  
  // Check secondary range
  if (receiver.secondary && 
      chunkIndex >= receiver.secondary.start && 
      chunkIndex < receiver.secondary.end) {
    return true;
  }
  
  return false;
}

/**
 * Get list of chunks that have been downloaded for sharing with other peers
 */
export function getDownloadedChunks(receiverIndex, totalChunks, totalReceivers, receivedChunksSet) {
  const downloadedChunks = [];
  
  const distribution = distributeChunkRanges(totalReceivers, totalChunks);
  const receiver = distribution[receiverIndex];
  
  // Only share chunks from primary range (we're responsible for these)
  for (let i = receiver.primary.start; i < receiver.primary.end; i++) {
    if (receivedChunksSet.has(i)) {
      downloadedChunks.push(i);
    }
  }
  
  return downloadedChunks;
}
