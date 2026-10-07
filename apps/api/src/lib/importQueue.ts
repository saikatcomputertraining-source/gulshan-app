import fs from "fs/promises";
import path from "path";
import { Queue } from "bullmq";
import { prisma } from "./prisma";

export type ImportImage={name:string;path:string;mimetype:string};
const importRoot=()=>path.resolve(process.env.STORAGE_DIR||"./storage","imports");
const redisUrl=process.env.REDIS_URL||"redis://localhost:6379";
const u=new URL(redisUrl);
const connection={host:u.hostname,port:Number(u.port||6379),username:u.username||undefined,password:u.password||undefined,db:u.pathname&&u.pathname.length>1?Number(u.pathname.slice(1)):undefined};
export const importQueue=new Queue("product-imports",{connection,defaultJobOptions:{attempts:5,backoff:{type:"exponential",delay:5000},removeOnComplete:{count:1000},removeOnFail:{count:2000}}});

export async function createImportJob(fileName:string,csvPath:string,images:ImportImage[]=[]){
  const dir=importRoot(); await fs.mkdir(dir,{recursive:true});
  const job=await prisma.importJob.create({data:{fileName,total:0,status:"QUEUED"}});
  await fs.rename(csvPath,path.join(dir,`${job.id}.csv`));
  if(images.length){
    const imageDir=path.join(dir,job.id,"images"); await fs.mkdir(imageDir,{recursive:true});
    for(const image of images){
      const target=path.join(imageDir,path.basename(image.name));
      await fs.rename(image.path,target);
    }
  }
  await importQueue.add("process",{jobId:job.id},{jobId:`import-${job.id}`});
  return job;
}
