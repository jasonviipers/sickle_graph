import * as z from "zod";

export const envSchema = z.object({
  KUZU_DB_PATH: z.string().default('./data/sicklegraph.db'),
  NCBI_API_KEY: z.string().optional(),
  NCBI_BASE_URL: z.string().default('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'),
  KNOWLEDGE_GRAPH_CACHE_TTL: z.number().default(60)
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);