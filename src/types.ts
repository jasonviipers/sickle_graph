/**
 * Core biomedical types for SickleGraph
 */
export interface Gene {
    id: string;
    symbol: string;
    name: string;
    description?: string;
    chromosome: string;
    ensemblId?: string;
    location?: string;
}

export interface Variant {
    id: string;
    hgvsNotation: string;
    clinicalSignificance: 'pathogenic' | 'likely_pathogenic' | 'vus' | 'likely_benign' | 'benign';
    populationFrequency?: number;
    variantType?: string;
}

export interface ClinicalTrial {
    id: string;
    name: string;
    status: 'recruiting' | 'active' | 'completed';
    startDate: string;
    endDate?: string;
    phase: 'I' | 'II' | 'III' | 'IV';
    locations: string[];
    targetGenes: string[];
}

export interface ResearchPaper {
    id: string;
    title: string;
    authors: string[];
    journal: string;
    publicationDate: string;
    abstract?: string;
    pmid?: string;
}

export interface KnowledgeGraphResult<T> {
    data: T[];
    metadata: {
        queryTime: number;
        resultCount: number;
        source: 'kuzu';
    };
}

export interface NCBIOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Query types for advanced searches
 */
export interface GeneQuery {
    symbol?: string;
    chromosome?: string;
    keyword?: string;
    limit?: number;
}

export interface VariantQuery {
    geneId?: string;
    significance?: Variant['clinicalSignificance'];
    frequencyRange?: [number, number];
}