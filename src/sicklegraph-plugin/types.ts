import * as z from "zod";

export const configSchema = z.object({
  KUZU_DB_PATH: z.string().default('./data/sicklegraph.db'),
  KNOWLEDGE_GRAPH_CACHE_TTL: z.number().default(60)
});

export type Config = z.infer<typeof configSchema>;

export interface Gene {
  id: string;
  symbol: string;
  name: string;
  description: string;
  variants: Variant[];
}

export interface Variant {
  id: string;
  hgvsNotation: string;
  clinicalSignificance: 'pathogenic' | 'benign' | 'vus';
  populationFrequencies: {
    [population: string]: number;
  };
}

export interface KnowledgeGraphResult<T> {
  data: T[];
  metadata: {
    queryTime: number;
    source: 'neo4j' | 'kuzu';
  };
}