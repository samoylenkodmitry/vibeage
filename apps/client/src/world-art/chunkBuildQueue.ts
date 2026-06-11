/**
 * Shared build queue for expensive chunk work (terrain geometry, foliage
 * scatter). Normal walking enqueues 1-2 frontier chunks at a time — they
 * build effectively immediately. A TELEPORT (respawn, escape, GM) replaces
 * the whole visible set at once; building all ~50 chunks in one React commit
 * froze the main thread for seconds (camera stuck, UI dead, white frames).
 * The queue drains a few jobs per animation frame instead, so the world
 * fills in over ~a dozen frames while the app stays responsive.
 */
type Job = { run: () => void; cancelled: boolean };

const queue: Job[] = [];
let pumping = false;
const JOBS_PER_FRAME = 4;

function pump(): void {
  let ran = 0;
  while (queue.length > 0 && ran < JOBS_PER_FRAME) {
    const job = queue.shift() as Job;
    if (job.cancelled) continue;
    job.run();
    ran += 1;
  }
  if (queue.length > 0) {
    requestAnimationFrame(pump);
  } else {
    pumping = false;
  }
}

/** Enqueue chunk work; returns a cancel function for unmount races. */
export function scheduleChunkBuild(run: () => void): () => void {
  const job: Job = { run, cancelled: false };
  queue.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => {
    job.cancelled = true;
  };
}
