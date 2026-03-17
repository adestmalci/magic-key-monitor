import { runWorker } from "./disney-planner-worker.mjs";

await runWorker({
  loop: true,
  expectJob: false,
}).catch((error) => {
  console.error("[disney-worker-service] fatal", error);
  process.exit(1);
});
