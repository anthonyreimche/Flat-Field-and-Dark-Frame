// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The worker that makes flat variants (flat-job.ts). Built inline into the
// bundle, so it loads wherever the extension does.

import { flatJobs, type FlatJob } from "./flat-job";

const run = flatJobs();

onmessage = (e: MessageEvent<FlatJob>) => {
  const reply = run(e.data);
  if (reply) postMessage(reply, { transfer: "texture" in reply ? [reply.texture.data.buffer] : [] });
};
