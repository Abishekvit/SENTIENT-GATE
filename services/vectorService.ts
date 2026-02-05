
/**
 * Advanced Cosine Similarity for semantic/fuzzy matching.
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
};

/**
 * Enhanced Bi-gram Vectorization.
 * Instead of whole words, it uses character/word pairs to catch obfuscated strings 
 * and is insensitive to sentence order or capitalization.
 */
export const getKeywordVector = (text: string, vocab: string[]): number[] => {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = new Set<string>();
  
  // Create 3-character n-grams for fuzzy matching
  for (let i = 0; i < normalizedText.length - 2; i++) {
    tokens.add(normalizedText.substring(i, i + 3));
  }
  
  // Add individual words
  text.toLowerCase().split(/\W+/).forEach(w => {
    if (w.length > 2) tokens.add(w);
  });

  return vocab.map(v => {
    const vNorm = v.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Check if the vocab item exists as a substring or if we share tokens
    if (normalizedText.includes(vNorm)) return 1.5; // High weight for direct (even if smashed) match
    
    // Check for shared tokens (jaccard-like weight)
    let overlap = 0;
    const vTokens = vNorm.length - 2;
    for (let i = 0; i < vNorm.length - 2; i++) {
      if (tokens.has(vNorm.substring(i, i + 3))) overlap++;
    }
    return vTokens > 0 ? (overlap / vTokens) : 0;
  });
};
