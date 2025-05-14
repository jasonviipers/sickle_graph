

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