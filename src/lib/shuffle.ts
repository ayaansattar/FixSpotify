/** In-place Fisher–Yates shuffle. Returns the same array for convenience. */
export function fisherYatesShuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

/**
 * Produces a weighted random order without replacement. Higher-weight items
 * tend to appear earlier, but every item remains eligible for every run.
 */
export function weightedRandomOrder<T>(
  items: T[],
  getWeight: (item: T) => number,
): T[] {
  return items
    .map((item) => {
      const weight = Math.max(Number.EPSILON, getWeight(item));
      const random = Math.max(Number.EPSILON, Math.random());

      return {
        item,
        // Exponential-race sampling gives a weighted order without duplicates.
        priority: -Math.log(random) / weight,
      };
    })
    .sort((a, b) => a.priority - b.priority)
    .map(({ item }) => item);
}
