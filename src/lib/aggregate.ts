import { VOTE_BUCKETS } from "./constants";

export type BucketCounts = {
  oppose: number;
  neutral: number;
  favor: number;
};

export function bucketForValue(v: number): keyof BucketCounts {
  if (v <= VOTE_BUCKETS.opposeMax) return "oppose";
  if (v >= VOTE_BUCKETS.favorMin) return "favor";
  return "neutral";
}

export function aggregateVotes(values: number[]): {
  average: number | null;
  counts: BucketCounts;
} {
  if (values.length === 0) {
    return { average: null, counts: { oppose: 0, neutral: 0, favor: 0 } };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const average = Math.round((sum / values.length) * 10) / 10;
  const counts: BucketCounts = { oppose: 0, neutral: 0, favor: 0 };
  for (const v of values) {
    counts[bucketForValue(v)] += 1;
  }
  return { average, counts };
}
