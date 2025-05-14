import * as z from "zod";

export const configSchema = z.object({
  KUZU_DB_PATH: z.string().default('./data/sicklegraph.db'),
  KNOWLEDGE_GRAPH_CACHE_TTL: z.number().default(60)
});

export type Config = z.infer<typeof configSchema>;