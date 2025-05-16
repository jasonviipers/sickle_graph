import { IAgentRuntime } from "@elizaos/core";
import * as z from "zod";

export const envSchema = z.object({
  KUZU_DB_PATH: z.string().default('./data/sicklegraph.db'),
  NCBI_API_KEY: z.string().optional(),
  NCBI_BASE_URL: z.string().default('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'),
  KNOWLEDGE_GRAPH_CACHE_TTL: z.number().default(60)
});

export type Env = z.infer<typeof envSchema>;

export async function valiateEnv(runtime: IAgentRuntime): Promise<Env> {
  try {
    const env = {
      KUZU_DB_PATH: runtime.getSetting('KUZU_DB_PATH'),
      NCBI_API_KEY: runtime.getSetting('NCBI_API_KEY'),
      NCBI_BASE_URL: runtime.getSetting('NCBI_BASE_URL'),
      KNOWLEDGE_GRAPH_CACHE_TTL: runtime.getSetting('KNOWLEDGE_GRAPH_CACHE_TTL'),
    }
    return envSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMsg = error.issues.map(issue => {
        return `${issue.path.join('.')}: ${issue.message}`;
      }).join('\n');
      throw new Error(`Invalid environment variables: ${errorMsg}`);
    }
  }
}

export const GeneQuerySchema = z.object({
  symbol: z.string().min(2).max(10).optional(),
  chromosome: z.string().regex(/^[0-9XY]+$/).optional(),
  keyword: z.string().max(100).optional(),
  associatedDisease: z.string().optional(),
  hasClinicalTrials: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0)
});

export type GeneQuery = z.infer<typeof GeneQuerySchema>;

export const PaperQuerySchema = z.object({
  keyword: z.string().max(100).optional(),
  journal: z.string().optional(),
  author: z.string().optional(),
  fromDate: z.string().optional(), // ISO date string
  toDate: z.string().optional(),   // ISO date string
  mentionsGene: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0)
})
export type PaperQuery = z.infer<typeof PaperQuerySchema>;

export const TrialQuerySchema = z.object({
  variantId: z.string().optional(),
  geneSymbol: z.string().optional(),
  region: z.string().optional(),
  phase: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0)
});

export type TrialQuery = z.infer<typeof TrialQuerySchema>;