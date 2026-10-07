import "dotenv/config";
import { Worker } from "bullmq";
import { processImportJob } from "./lib/importQueueWorker";
import { startScrapeWorker } from "./lib/scrapeWorker";
const redisUrl=process.env.REDIS_URL||"redis://localhost:6379";
const u=new URL(redisUrl);
const connection={host:u.hostname,port:Number(u.port||6379),username:u.username||undefined,password:u.password||undefined,db:u.pathname&&u.pathname.length>1?Number(u.pathname.slice(1)):undefined};
const concurrency=Math.max(1,Math.min(8,Number(process.env.IMPORT_WORKER_CONCURRENCY||2)));
console.log(`Import worker started with concurrency=${concurrency}`);
const scrapeWorker = startScrapeWorker();
const worker=new Worker("product-imports",async job=>{await processImportJob(String(job.data.jobId));},{connection,concurrency,lockDuration:120000});
worker.on("failed",(job,err)=>console.error("Import job failed",job?.id,err));
async function shutdown(){await worker.close();await scrapeWorker.close();process.exit(0)}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
