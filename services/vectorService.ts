
/**
 * Simple cosine similarity implementation for demonstration.
 * In a production backend, this would use a proper vector DB like Pinecone/Weaviate.
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) return 0;
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
 * Enhanced TF-IDF like keyword vectorization.
 * Normalizes input to improve matching against the security vocabulary.
 */
export const getKeywordVector = (text: string, vocab: string[]): number[] => {
  const words = text.toLowerCase().trim().split(/\W+/).filter(w => w.length > 0);
  const wordSet = new Set(words);
  return vocab.map(v => (wordSet.has(v.toLowerCase()) ? 1 : 0));
};
