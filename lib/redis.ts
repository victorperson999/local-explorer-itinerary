import { createClient, type RedisClientType } from "redis";

declare global {
    // prevent reload from making new clients
    var __redisClient: RedisClientType | undefined;
}

function getRedisUrl(){
    const url = process.env.REDIS_URL;
    if(!url){
        throw new Error("Missing REDIS_URL in environment (.env / .env.local)");
    }
    return url;
}

export const redis: RedisClientType = 
    global.__redisClient ??
    createClient({
        url: getRedisUrl(),
    });


if (!global.__redisClient) {
  global.__redisClient = redis;

  redis.on("error", (err) => {
    console.error("[redis] error", err);
  });

  // Connect once 
  redis
    .connect()
    .then(() => console.log("[redis] connected"))
    .catch((e) => console.error("[redis] connect failed", e));
}